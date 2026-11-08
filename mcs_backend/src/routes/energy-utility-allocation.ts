import crypto from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyUtilityAllocationRouter = Router();
const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const BASES = new Set(['PERCENTAGE', 'FLOOR_AREA', 'HEADCOUNT', 'PRODUCTION', 'FIXED_WEIGHT']);

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}
energyUtilityAllocationRouter.use('/energy', authenticate, featureEnabled);

async function ensureFeature(): Promise<void> {
  if (!(await tableExists('energy_utility_allocation')) || !(await tableExists('energy_utility_allocation_line'))) {
    throw new HttpError(503, 'Utility Allocation belum tersedia. Jalankan migration 20261108_energy_utility_allocation.sql.');
  }
}
function dateOnly(value: unknown, field: string): string { const text = String(value ?? '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(422, `${field} tidak valid.`); return text; }
function optionalText(value: unknown, max: number): string | null { const text = String(value ?? '').trim(); if (!text) return null; if (text.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`); return text; }
function decimal(value: unknown, field: string, required = false): number | null { if (value === undefined || value === null || String(value).trim() === '') { if (required) throw new HttpError(422, `${field} wajib diisi.`); return null; } const number = Number(String(value).replace(',', '.')); if (!Number.isFinite(number) || number < 0) throw new HttpError(422, `${field} harus berupa angka nol atau lebih.`); return number; }
function positiveId(value: unknown, field: string): number { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, `${field} tidak valid.`); return id; }
async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> { const [result] = await connection.execute(sql, params as never); return ((result as T[])[0] ?? null); }
async function connectionRows<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T[]> { const [result] = await connection.execute(sql, params as never); return result as T[]; }

type Snapshot = { quantity: number; unit: string; sampleCount: number; energyType: string };
async function sourceSnapshot(connection: PoolConnection, profileId: number, from: string, to: string): Promise<Snapshot> {
  const profile = await connectionOne<{ energy_type: string }>(connection, 'SELECT energy_type FROM energy_asset_profile WHERE id=? AND status=\'ACTIVE\' LIMIT 1', [profileId]);
  if (!profile) throw new HttpError(404, 'Energy asset sumber tidak ditemukan atau tidak aktif.');
  if (['ELECTRICITY_METER', 'WATER_METER'].includes(profile.energy_type)) {
    const result = await connectionOne<{ quantity: number | string | null; sample_count: number | string; unit: string }>(connection,
      `SELECT SUM(r.consumption) quantity,COUNT(*) sample_count,m.unit FROM energy_meter_reading r
       JOIN energy_meter m ON m.id=r.meter_id WHERE m.energy_profile_id=? AND r.status='LOCKED'
       AND DATE(r.read_at) BETWEEN ? AND ? GROUP BY m.unit`, [profileId, from, to]);
    return { quantity: Number(result?.quantity ?? 0), unit: result?.unit ?? (profile.energy_type === 'WATER_METER' ? 'm³' : 'kWh'), sampleCount: Number(result?.sample_count ?? 0), energyType: profile.energy_type };
  }
  if (profile.energy_type === 'GENSET') {
    const result = await connectionOne<{ quantity: number | string | null; sample_count: number | string }>(connection,
      `SELECT SUM(o.generated_kwh) quantity,COUNT(*) sample_count FROM energy_genset_operation o
       JOIN energy_genset_profile g ON g.id=o.genset_profile_id WHERE g.energy_profile_id=?
       AND o.status='LOCKED' AND DATE(o.started_at) BETWEEN ? AND ?`, [profileId, from, to]);
    return { quantity: Number(result?.quantity ?? 0), unit: 'kWh', sampleCount: Number(result?.sample_count ?? 0), energyType: profile.energy_type };
  }
  if (['COMPRESSOR', 'BOILER'].includes(profile.energy_type)) {
    const result = await connectionOne<{ quantity: number | string | null; sample_count: number | string; output_unit: string | null }>(connection,
      `SELECT SUM(o.output_value) quantity,COUNT(*) sample_count,u.output_unit FROM energy_utility_operation o
       JOIN energy_utility_profile u ON u.id=o.utility_profile_id WHERE u.energy_profile_id=?
       AND o.status='LOCKED' AND DATE(o.inspected_at) BETWEEN ? AND ? GROUP BY u.output_unit`, [profileId, from, to]);
    return { quantity: Number(result?.quantity ?? 0), unit: result?.output_unit ?? 'output', sampleCount: Number(result?.sample_count ?? 0), energyType: profile.energy_type };
  }
  throw new HttpError(422, 'Jenis Energy asset belum mendukung Utility Allocation.');
}

type InputLine = { id_division: number; department_code: string | null; department_name: string; cost_center_code: string; cost_center_name: string | null; allocation_type: 'MEASURED' | 'ESTIMATED'; sub_meter_profile_id: number | null; driver_value: number | null; notes: string | null; measured_quantity?: number; allocated_quantity?: number; allocation_percent?: number; reference_cost?: number | null };
async function parseLines(connection: PoolConnection, raw: unknown, source: Snapshot, sourceProfileId: number, from: string, to: string, rate: number | null): Promise<InputLine[]> {
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(422, 'Minimal satu department/cost center wajib diisi.');
  const lines: InputLine[] = [];
  const costCenters = new Set<string>();
  for (const [index, value] of raw.entries()) {
    const item = (value ?? {}) as Record<string, unknown>;
    const divisionId = positiveId(item.id_division, `Division baris ${index + 1}`);
    const division = await connectionOne<{ division_code: string | null; division_name: string }>(connection, 'SELECT division_code,division_name FROM tb_division WHERE id_division=? LIMIT 1', [divisionId]);
    if (!division) throw new HttpError(422, `Division baris ${index + 1} tidak ditemukan.`);
    const costCode = String(item.cost_center_code ?? '').trim().toUpperCase();
    if (!costCode || costCode.length > 80) throw new HttpError(422, `Cost center baris ${index + 1} wajib diisi dan maksimal 80 karakter.`);
    if (costCenters.has(costCode)) throw new HttpError(422, `Cost center ${costCode} terduplikasi.`);
    costCenters.add(costCode);
    const type = String(item.allocation_type ?? 'ESTIMATED').toUpperCase();
    if (!['MEASURED', 'ESTIMATED'].includes(type)) throw new HttpError(422, `Tipe alokasi baris ${index + 1} tidak valid.`);
    let subMeterId: number | null = null;
    let measured: number | undefined;
    let driver: number | null = null;
    if (type === 'MEASURED') {
      if (!['ELECTRICITY_METER', 'WATER_METER'].includes(source.energyType)) throw new HttpError(422, 'Measured allocation hanya tersedia untuk sumber meter listrik/air.');
      subMeterId = positiveId(item.sub_meter_profile_id, `Sub-meter baris ${index + 1}`);
      if (subMeterId === sourceProfileId) throw new HttpError(422, 'Sub-meter tidak boleh sama dengan meter sumber.');
      const relation = await connectionOne(connection,
        `SELECT sm.id FROM energy_meter sm JOIN energy_meter parent ON parent.id=sm.parent_meter_id
         WHERE sm.energy_profile_id=? AND parent.energy_profile_id=? LIMIT 1`, [subMeterId, sourceProfileId]);
      if (!relation) throw new HttpError(422, `Meter baris ${index + 1} bukan sub-meter langsung dari meter sumber.`);
      const sub = await sourceSnapshot(connection, subMeterId, from, to);
      if (sub.energyType !== source.energyType || sub.unit !== source.unit) throw new HttpError(422, `Sub-meter baris ${index + 1} tidak kompatibel dengan meter sumber.`);
      measured = sub.quantity;
    } else {
      driver = decimal(item.driver_value, `Driver baris ${index + 1}`, true);
      if (!driver || driver <= 0) throw new HttpError(422, `Driver baris ${index + 1} harus lebih dari nol.`);
    }
    lines.push({ id_division: divisionId, department_code: division.division_code, department_name: division.division_name, cost_center_code: costCode, cost_center_name: optionalText(item.cost_center_name, 180), allocation_type: type as 'MEASURED' | 'ESTIMATED', sub_meter_profile_id: subMeterId, driver_value: driver, notes: optionalText(item.notes, 2000), measured_quantity: measured });
  }
  const measuredTotal = lines.reduce((sum, line) => sum + (line.measured_quantity ?? 0), 0);
  if (measuredTotal > source.quantity + 0.001) throw new HttpError(422, `Total sub-meter (${measuredTotal}) melebihi sumber (${source.quantity} ${source.unit}).`);
  const remaining = Math.max(0, source.quantity - measuredTotal);
  const estimated = lines.filter((line) => line.allocation_type === 'ESTIMATED');
  const totalDriver = estimated.reduce((sum, line) => sum + Number(line.driver_value ?? 0), 0);
  if (remaining > 0.001 && !estimated.length) throw new HttpError(422, `Masih ada ${remaining.toLocaleString('id-ID')} ${source.unit} yang belum dialokasikan.`);
  for (const line of lines) {
    const quantity = line.allocation_type === 'MEASURED' ? Number(line.measured_quantity ?? 0) : (totalDriver ? remaining * Number(line.driver_value) / totalDriver : 0);
    line.allocated_quantity = quantity;
    line.allocation_percent = source.quantity > 0 ? quantity / source.quantity * 100 : 0;
    line.reference_cost = rate === null ? null : quantity * rate;
  }
  return lines;
}

type AllocationInput = { profileId: number; from: string; to: string; basis: string; rate: number | null; currency: string; tariffSource: string | null; tariffReference: string | null; tariffAsOf: string | null; notes: string | null; source: Snapshot; lines: InputLine[] };
async function parseInput(connection: PoolConnection, body: Record<string, unknown>): Promise<AllocationInput> {
  const profileId = positiveId(body.energy_profile_id, 'Energy asset sumber');
  const from = dateOnly(body.period_start, 'Awal periode'); const to = dateOnly(body.period_end, 'Akhir periode');
  if (to < from) throw new HttpError(422, 'Akhir periode tidak boleh lebih awal dari awal periode.');
  const basis = String(body.allocation_basis ?? '').trim().toUpperCase(); if (!BASES.has(basis)) throw new HttpError(422, 'Allocation basis tidak valid.');
  const rate = decimal(body.reference_rate, 'Tarif referensi');
  const currency = (optionalText(body.currency_code, 12) ?? 'IDR').toUpperCase();
  const source = await sourceSnapshot(connection, profileId, from, to);
  const lines = await parseLines(connection, body.lines, source, profileId, from, to, rate);
  return { profileId, from, to, basis, rate, currency, tariffSource: optionalText(body.tariff_source, 40), tariffReference: optionalText(body.tariff_reference, 180), tariffAsOf: body.tariff_as_of ? dateOnly(body.tariff_as_of, 'Tanggal tarif') : null, notes: optionalText(body.notes, 5000), source, lines };
}

async function saveLines(connection: PoolConnection, allocationId: number, lines: InputLine[]): Promise<void> {
  await connection.execute('DELETE FROM energy_utility_allocation_line WHERE allocation_id=?', [allocationId]);
  for (const line of lines) await connection.execute(
    `INSERT INTO energy_utility_allocation_line
     (allocation_id,id_division,department_code,department_name,cost_center_code,cost_center_name,allocation_type,
      sub_meter_profile_id,driver_value,measured_quantity,allocated_quantity,allocation_percent,reference_cost,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [allocationId,line.id_division,line.department_code,line.department_name,line.cost_center_code,line.cost_center_name,line.allocation_type,
      line.sub_meter_profile_id,line.driver_value,line.measured_quantity ?? null,line.allocated_quantity,line.allocation_percent,line.reference_cost,line.notes] as never);
}
async function history(connection: PoolConnection, id: number, action: string, from: string | null, to: string, note: string | null, actor: string): Promise<void> { await connection.execute('INSERT INTO energy_utility_allocation_history (allocation_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,?,?,?,?,?,NOW())', [id,action,from,to,note,actor]); }

energyUtilityAllocationRouter.get('/energy/utility-allocations', canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const status = optionalText(req.query.status, 24); const company = optionalText(req.query.company, 120);
  const where: string[] = []; const params: unknown[] = [];
  if (status) { where.push('h.status=?'); params.push(status.toUpperCase()); }
  if (company) { where.push('a.CompanyName=?'); params.push(company); }
  const headers = await rows<Record<string, unknown>>(
    `SELECT h.*,a.AssetCode,a.AssetName,a.CompanyName,a.LocationAsset,
      COALESCE((SELECT SUM(l.allocated_quantity) FROM energy_utility_allocation_line l WHERE l.allocation_id=h.id),0) allocated_quantity,
      COALESCE((SELECT SUM(l.reference_cost) FROM energy_utility_allocation_line l WHERE l.allocation_id=h.id),0) allocated_reference_cost,
      (SELECT COUNT(*) FROM energy_utility_allocation_line l WHERE l.allocation_id=h.id) line_count
     FROM energy_utility_allocation h JOIN energy_asset_profile p ON p.id=h.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY h.period_end DESC,h.id DESC`, params);
  const ids = headers.map((item) => Number(item.id));
  const lines = ids.length ? await rows<Record<string, unknown>>(`SELECT l.*,p.energy_type AS sub_meter_energy_type,a.AssetCode AS sub_meter_asset_code,a.AssetName AS sub_meter_asset_name FROM energy_utility_allocation_line l LEFT JOIN energy_asset_profile p ON p.id=l.sub_meter_profile_id LEFT JOIN asset a ON a.AssetID=p.asset_id WHERE l.allocation_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.allocation_id,l.id`, ids) : [];
  const histories = ids.length ? await rows<Record<string, unknown>>(`SELECT * FROM energy_utility_allocation_history WHERE allocation_id IN (${ids.map(() => '?').join(',')}) ORDER BY acted_at,id`, ids) : [];
  const lineMap = new Map<number, Record<string, unknown>[]>(); for (const line of lines) { const id = Number(line.allocation_id); lineMap.set(id, [...(lineMap.get(id) ?? []), line]); }
  const historyMap = new Map<number, Record<string, unknown>[]>(); for (const item of histories) { const id = Number(item.allocation_id); historyMap.set(id, [...(historyMap.get(id) ?? []), item]); }
  const profiles = await rows<Record<string, unknown>>(`SELECT p.id,p.energy_type,p.utility_type,a.AssetCode,a.AssetName,a.CompanyName,a.LocationAsset,parent.energy_profile_id AS parent_energy_profile_id FROM energy_asset_profile p JOIN asset a ON a.AssetID=p.asset_id LEFT JOIN energy_meter m ON m.energy_profile_id=p.id LEFT JOIN energy_meter parent ON parent.id=m.parent_meter_id WHERE p.status='ACTIVE' AND p.energy_type IN ('ELECTRICITY_METER','WATER_METER','GENSET','COMPRESSOR','BOILER') ORDER BY a.AssetName`);
  const divisions = await rows<Record<string, unknown>>('SELECT id_division,id_company,division_code,division_name FROM tb_division ORDER BY division_name');
  const companies = await rows<{ value: string }>('SELECT DISTINCT CompanyName value FROM asset WHERE CompanyName IS NOT NULL AND CompanyName<>\'\' ORDER BY CompanyName');
  ok(res, { allocations: headers.map((item) => ({ ...item, lines: lineMap.get(Number(item.id)) ?? [], history: historyMap.get(Number(item.id)) ?? [] })), options: { profiles, divisions, companies: companies.map((item) => item.value), bases: [...BASES] } });
}));

energyUtilityAllocationRouter.post('/energy/utility-allocations', canManage, asyncHandler(async (req, res) => {
  await ensureFeature(); const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction(async (connection) => {
    const input = await parseInput(connection, req.body); const number = `UAL-${input.from.replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_utility_allocation
       (allocation_number,energy_profile_id,source_energy_type,period_start,period_end,allocation_basis,source_quantity,source_sample_count,unit,
        reference_rate,currency_code,tariff_source,tariff_reference,tariff_as_of,total_reference_cost,status,notes,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,NOW(),NOW())`,
      [number,input.profileId,input.source.energyType,input.from,input.to,input.basis,input.source.quantity,input.source.sampleCount,input.source.unit,input.rate,input.currency,input.tariffSource,input.tariffReference,input.tariffAsOf,input.rate === null ? null : input.source.quantity*input.rate,input.notes,actor,actor] as never);
    await saveLines(connection, inserted.insertId, input.lines); await history(connection, inserted.insertId, 'CREATE', null, 'DRAFT', null, actor);
    return { id: inserted.insertId, allocation_number: number, source_quantity: input.source.quantity, unit: input.source.unit };
  }); created(res, result, 'Draft Utility Allocation dibuat.');
}));

energyUtilityAllocationRouter.patch('/energy/utility-allocations/:id', canManage, asyncHandler(async (req, res) => {
  await ensureFeature(); const id = positiveId(req.params.id, 'Allocation ID'); const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction(async (connection) => {
    const current = await connectionOne<{ status: string }>(connection, 'SELECT status FROM energy_utility_allocation WHERE id=? LIMIT 1 FOR UPDATE', [id]); if (!current) throw new HttpError(404, 'Utility Allocation tidak ditemukan.'); if (current.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft allocation yang dapat diubah.');
    const input = await parseInput(connection, req.body);
    await connection.execute(`UPDATE energy_utility_allocation SET energy_profile_id=?,source_energy_type=?,period_start=?,period_end=?,allocation_basis=?,source_quantity=?,source_sample_count=?,unit=?,reference_rate=?,currency_code=?,tariff_source=?,tariff_reference=?,tariff_as_of=?,total_reference_cost=?,notes=?,updated_by=?,updated_at=NOW() WHERE id=?`, [input.profileId,input.source.energyType,input.from,input.to,input.basis,input.source.quantity,input.source.sampleCount,input.source.unit,input.rate,input.currency,input.tariffSource,input.tariffReference,input.tariffAsOf,input.rate === null ? null : input.source.quantity*input.rate,input.notes,actor,id] as never);
    await saveLines(connection,id,input.lines); await history(connection,id,'UPDATE','DRAFT','DRAFT','Recalculate source dan allocation lines',actor); return { id,source_quantity:input.source.quantity,unit:input.source.unit };
  }); ok(res,result,'Draft Utility Allocation diperbarui dan dihitung ulang.');
}));

energyUtilityAllocationRouter.post('/energy/utility-allocations/:id/submit', canManage, asyncHandler(async (req, res) => {
  await ensureFeature(); const id=positiveId(req.params.id,'Allocation ID'); const actor=String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item=await connectionOne<{status:string;energy_profile_id:number;period_start:string;period_end:string;source_quantity:number|string;reference_rate:number|string|null}>(connection,'SELECT * FROM energy_utility_allocation WHERE id=? LIMIT 1 FOR UPDATE',[id]); if(!item) throw new HttpError(404,'Utility Allocation tidak ditemukan.'); if(item.status!=='DRAFT') throw new HttpError(409,'Allocation harus berstatus DRAFT.');
    const source=await sourceSnapshot(connection,item.energy_profile_id,String(item.period_start),String(item.period_end)); if(source.quantity<=0 || source.sampleCount<=0) throw new HttpError(422,'Belum ada transaksi LOCKED pada sumber dan periode ini.');
    const lines=await connectionRows<InputLine>(connection,'SELECT * FROM energy_utility_allocation_line WHERE allocation_id=? ORDER BY id',[id]);
    const raw=lines.map((line)=>({id_division:line.id_division,cost_center_code:line.cost_center_code,cost_center_name:line.cost_center_name,allocation_type:line.allocation_type,sub_meter_profile_id:line.sub_meter_profile_id,driver_value:line.driver_value,notes:line.notes}));
    const recalculated=await parseLines(connection,raw,source,item.energy_profile_id,String(item.period_start),String(item.period_end),item.reference_rate===null?null:Number(item.reference_rate));
    await saveLines(connection,id,recalculated); await connection.execute("UPDATE energy_utility_allocation SET source_quantity=?,source_sample_count=?,unit=?,total_reference_cost=?,status='SUBMITTED',submitted_by=?,submitted_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?",[source.quantity,source.sampleCount,source.unit,item.reference_rate===null?null:source.quantity*Number(item.reference_rate),actor,actor,id] as never); await history(connection,id,'SUBMIT','DRAFT','SUBMITTED',null,actor);
  }); ok(res,{id,status:'SUBMITTED'},'Utility Allocation disubmit untuk verifikasi.');
}));

energyUtilityAllocationRouter.post('/energy/utility-allocations/:id/review', canApprove, asyncHandler(async (req,res)=>{
  await ensureFeature(); const id=positiveId(req.params.id,'Allocation ID'); const action=String(req.body.action??'').toUpperCase(); if(!['LOCK','REJECT'].includes(action)) throw new HttpError(422,'Action harus LOCK atau REJECT.'); const actor=String((req as AuthRequest).user!.fullname); const note=optionalText(req.body.review_note,2000);
  const result=await transaction(async(connection)=>{ const item=await connectionOne<{status:string;energy_profile_id:number;period_start:string;period_end:string;source_quantity:number|string}>(connection,'SELECT * FROM energy_utility_allocation WHERE id=? LIMIT 1 FOR UPDATE',[id]); if(!item) throw new HttpError(404,'Utility Allocation tidak ditemukan.'); if(item.status!=='SUBMITTED') throw new HttpError(409,'Allocation harus berstatus SUBMITTED.'); if(action==='REJECT'){await connection.execute("UPDATE energy_utility_allocation SET status='REJECTED',reviewed_by=?,reviewed_at=NOW(),review_note=?,updated_by=?,updated_at=NOW() WHERE id=?",[actor,note??'Ditolak tanpa catatan',actor,id]);await history(connection,id,'REJECT','SUBMITTED','REJECTED',note,actor);return 'REJECTED';} const current=await sourceSnapshot(connection,item.energy_profile_id,String(item.period_start),String(item.period_end)); if(Math.abs(current.quantity-Number(item.source_quantity))>0.001) throw new HttpError(409,`Konsumsi sumber berubah dari ${Number(item.source_quantity).toLocaleString('id-ID')} menjadi ${current.quantity.toLocaleString('id-ID')} ${current.unit}. Kembalikan ke draft dan hitung ulang.`); await connection.execute("UPDATE energy_utility_allocation SET status='LOCKED',reviewed_by=?,reviewed_at=NOW(),review_note=?,updated_by=?,updated_at=NOW() WHERE id=?",[actor,note,actor,id]);await history(connection,id,'LOCK','SUBMITTED','LOCKED',note,actor);return 'LOCKED';}); ok(res,{id,status:result},result==='LOCKED'?'Utility Allocation diverifikasi dan dikunci.':'Utility Allocation ditolak.');
}));
