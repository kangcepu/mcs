import { Router, type NextFunction, type Response } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest, User } from '../types.js';

export const energyUtilityOperationsRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const FINAL_WO_STATUSES = new Set(['CLOSED', 'VOID', 'REJECT', 'DECLINE', 'COMPLETE', 'DONE']);

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('energy_utility_profile')) || !(await tableExists('energy_utility_operation'))) {
    throw new HttpError(503, 'Operasional Compressor/Boiler belum tersedia. Jalankan migration 20261107_energy_utility_operations.sql.');
  }
}

function positiveId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, `${field} tidak valid.`);
  return id;
}

function numeric(value: unknown, field: string, minimum = 0): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < minimum) throw new HttpError(422, `${field} harus berupa angka minimal ${minimum}.`);
  return parsed;
}

function text(value: unknown, max: number): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return normalized;
}

function dateTime(value: unknown, field: string, required = true): string | null {
  const raw = String(value ?? '').trim().replace('T', ' ');
  if (!raw) {
    if (required) throw new HttpError(422, `${field} wajib diisi.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw)) throw new HttpError(422, `${field} tidak valid.`);
  return raw.length === 16 ? `${raw}:00` : raw;
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

type UtilityProfileRow = {
  id: number;
  energy_profile_id: number;
  utility_kind: 'COMPRESSOR' | 'BOILER';
  initial_hour_meter: number | string | null;
  current_hour_meter: number | string | null;
  pressure_min_bar: number | string | null;
  pressure_max_bar: number | string | null;
  temperature_min_c: number | string | null;
  temperature_max_c: number | string | null;
  flow_min: number | string | null;
  flow_max: number | string | null;
  output_min: number | string | null;
  output_max: number | string | null;
  preventive_interval_hours: number | string | null;
  last_preventive_hour_meter: number | string | null;
  auto_corrective_wo: number;
  auto_preventive_wo: number;
  status: string;
  asset_id: number;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
};

async function utilityForUpdate(connection: PoolConnection, utilityId: number): Promise<UtilityProfileRow> {
  const profile = await connectionOne<UtilityProfileRow>(connection,
    `SELECT u.*, p.asset_id, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_utility_profile u
     JOIN energy_asset_profile p ON p.id=u.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE u.id=? LIMIT 1 FOR UPDATE`, [utilityId]);
  if (!profile) throw new HttpError(404, 'Profil Compressor/Boiler tidak ditemukan.');
  if (profile.status !== 'ACTIVE') throw new HttpError(409, 'Profil utility tidak aktif.');
  return profile;
}

function operationHours(startedAt: string | null, endedAt: string | null, hourStart: number | null, hourEnd: number | null): number | null {
  if (hourStart !== null && hourEnd !== null) {
    if (hourEnd < hourStart) throw new HttpError(422, 'Hour meter akhir tidak boleh lebih kecil dari hour meter awal.');
    return hourEnd - hourStart;
  }
  if (startedAt && endedAt) {
    const start = new Date(startedAt.replace(' ', 'T')).getTime();
    const end = new Date(endedAt.replace(' ', 'T')).getTime();
    if (end < start) throw new HttpError(422, 'Waktu selesai tidak boleh lebih awal dari waktu mulai.');
    return Math.round(((end - start) / 3_600_000) * 1000) / 1000;
  }
  return null;
}

function outside(value: number | null, minimum: number | string | null, maximum: number | string | null): boolean {
  if (value === null) return false;
  return (minimum !== null && value < Number(minimum)) || (maximum !== null && value > Number(maximum));
}

function condition(profile: UtilityProfileRow, body: Record<string, unknown>, values: {
  pressure: number | null; temperature: number | null; flow: number | null; output: number | null;
}): { status: 'NORMAL' | 'ATTENTION' | 'CRITICAL'; reasons: string | null } {
  const reasons: string[] = [];
  if (outside(values.pressure, profile.pressure_min_bar, profile.pressure_max_bar)) reasons.push('Tekanan di luar batas normal');
  if (outside(values.temperature, profile.temperature_min_c, profile.temperature_max_c)) reasons.push('Temperatur di luar batas normal');
  if (outside(values.flow, profile.flow_min, profile.flow_max)) reasons.push('Flow di luar batas normal');
  if (outside(values.output, profile.output_min, profile.output_max)) reasons.push('Output di luar batas normal');
  const observed = String(body.observed_condition ?? 'NORMAL').trim().toUpperCase();
  if (!['NORMAL', 'ATTENTION', 'CRITICAL'].includes(observed)) throw new HttpError(422, 'Hasil inspeksi tidak valid.');
  const observation = text(body.abnormal_note, 2000);
  if (observed !== 'NORMAL') reasons.push(observation ? `Temuan operator: ${observation}` : 'Temuan abnormal oleh operator');
  const status = observed === 'CRITICAL' ? 'CRITICAL' : reasons.length ? 'ATTENTION' : 'NORMAL';
  return { status, reasons: reasons.length ? reasons.join(' | ') : null };
}

async function saveOperation(
  connection: PoolConnection,
  utilityId: number,
  body: Record<string, unknown>,
  user: User,
  operationId?: number,
): Promise<{ id: number; condition_status: string; abnormal_reasons: string | null }> {
  const profile = await utilityForUpdate(connection, utilityId);
  const inspectedAt = dateTime(body.inspected_at, 'Waktu inspeksi')!;
  const startedAt = dateTime(body.started_at, 'Waktu mulai', false);
  const endedAt = dateTime(body.ended_at, 'Waktu selesai', false);
  if ((startedAt && !endedAt) || (!startedAt && endedAt)) throw new HttpError(422, 'Waktu mulai dan selesai harus diisi berpasangan.');
  const hourStart = numeric(body.hour_meter_start, 'Hour meter awal');
  const hourEnd = numeric(body.hour_meter_end, 'Hour meter akhir');
  if ((hourStart !== null && hourEnd === null) || (hourStart === null && hourEnd !== null)) {
    throw new HttpError(422, 'Hour meter awal dan akhir harus diisi berpasangan.');
  }
  const pressure = numeric(body.pressure_bar, 'Tekanan');
  const temperature = numeric(body.temperature_c, 'Temperatur', -273.15);
  const flow = numeric(body.flow_value, 'Flow');
  const output = numeric(body.output_value, 'Output');
  if ([hourEnd, pressure, temperature, flow, output].every((value) => value === null)) {
    throw new HttpError(422, 'Isi minimal satu hasil pengukuran atau hour meter.');
  }
  const hours = operationHours(startedAt, endedAt, hourStart, hourEnd);
  const evaluated = condition(profile, body, { pressure, temperature, flow, output });
  const operator = text(body.operator_name, 120) ?? String(user.fullname);
  const notes = text(body.inspection_notes, 5000);

  if (operationId) {
    const existing = await connectionOne<{ status: string }>(connection,
      'SELECT status FROM energy_utility_operation WHERE id=? AND utility_profile_id=? LIMIT 1 FOR UPDATE',
      [operationId, utilityId]);
    if (!existing) throw new HttpError(404, 'Log inspeksi utility tidak ditemukan.');
    if (existing.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft inspeksi yang dapat diubah.');
    await connection.execute(
      `UPDATE energy_utility_operation SET inspected_at=?, started_at=?, ended_at=?,
       hour_meter_start=?, hour_meter_end=?, operating_hours=?, pressure_bar=?, temperature_c=?,
       flow_value=?, output_value=?, condition_status=?, abnormal_reasons=?, operator_name=?,
       inspection_notes=?, updated_by=?, updated_at=NOW() WHERE id=?`,
      [inspectedAt, startedAt, endedAt, hourStart, hourEnd, hours, pressure, temperature, flow, output,
        evaluated.status, evaluated.reasons, operator, notes, user.fullname, operationId] as never);
    return { id: operationId, condition_status: evaluated.status, abnormal_reasons: evaluated.reasons };
  }

  const [inserted] = await connection.execute<ResultSetHeader>(
    `INSERT INTO energy_utility_operation
     (utility_profile_id, inspected_at, started_at, ended_at, hour_meter_start, hour_meter_end,
      operating_hours, pressure_bar, temperature_c, flow_value, output_value,
      condition_status, abnormal_reasons, status, operator_name, inspection_notes,
      created_by, updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,NOW(),NOW())`,
    [utilityId, inspectedAt, startedAt, endedAt, hourStart, hourEnd, hours, pressure, temperature,
      flow, output, evaluated.status, evaluated.reasons, operator, notes, user.fullname, user.fullname] as never);
  return { id: inserted.insertId, condition_status: evaluated.status, abnormal_reasons: evaluated.reasons };
}

async function latestLinkedWo(connection: PoolConnection, utilityId: number, trigger: string): Promise<{ status: string; operation_hour: number | string | null } | null> {
  return connectionOne(connection,
    `SELECT w.status, o.hour_meter_end AS operation_hour
     FROM energy_utility_work_order_link l
     JOIN energy_utility_operation o ON o.id=l.operation_id
     LEFT JOIN tb_wo_mtc w ON w.wo_number=l.wo_number
     WHERE l.utility_profile_id=? AND l.trigger_type=?
     ORDER BY l.id DESC LIMIT 1`, [utilityId, trigger]);
}

async function createMesoWo(
  connection: PoolConnection,
  profile: UtilityProfileRow,
  operationId: number,
  trigger: 'CORRECTIVE' | 'PREVENTIVE',
  reason: string,
  runningHours: number | null,
  user: User,
): Promise<string> {
  const [lockRows] = await connection.query<Array<{ acquired: number } & RowDataPacket>>('SELECT GET_LOCK(?, 10) AS acquired', ['energy-utility-meso-wo-number']);
  if (Number(lockRows[0]?.acquired ?? 0) !== 1) throw new HttpError(409, 'Nomor WO sedang diproses. Coba kembali.');
  try {
    const now = new Date();
    const divisionCode = 'MKL';
    const base = `WO-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
    const sequence = await connectionOne<{ seq: number | null }>(connection,
      'SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM tb_wo_mtc WHERE wo_number LIKE ?', [`${base}/%`]);
    const woNumber = `${base}/${String(Number(sequence?.seq ?? 0) + 1).padStart(4, '0')}`;
    const division = await connectionOne<{ id_division: string }>(connection,
      "SELECT id_division FROM tb_division WHERE division_code='MKL' OR UPPER(division_name) LIKE '%MEKANIK%' ORDER BY division_code='MKL' DESC LIMIT 1");
    const idDivision = division?.id_division ?? String(user.id_division);
    const title = `[AUTO ENERGY] ${trigger === 'CORRECTIVE' ? 'Pemeriksaan abnormal' : 'Preventive hour meter'} ${profile.AssetCode} - ${profile.AssetName}`;
    await connection.execute(
      `INSERT INTO tb_wo_mtc
       (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment,
        job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
       VALUES (?,CURDATE(),?,'',?,?,?, ?,?,?,?,'#','MKL','WAIT_KA_DEPT_MESO','MESO',?,NOW())`,
      [woNumber, profile.CompanyName, trigger, trigger === 'CORRECTIVE' ? 'HIGH' : 'NORMAL', idDivision,
        profile.asset_id, title, runningHours, reason, user.fullname] as never);
    await connection.execute(
      'INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())',
      ['MKL', woNumber, reason, 'WAITING'] as never);
    await connection.execute(
      `INSERT INTO energy_utility_work_order_link
       (utility_profile_id, operation_id, trigger_type, wo_module, wo_number, trigger_reason, created_by, created_at)
       VALUES (?,?,?,'meso',?,?,?,NOW())`,
      [profile.id, operationId, trigger, woNumber, reason, user.fullname] as never);
    return woNumber;
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)', ['energy-utility-meso-wo-number']);
  }
}

energyUtilityOperationsRouter.use('/energy', authenticate, featureEnabled);

energyUtilityOperationsRouter.get('/energy/utilities/:utilityId/operations', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const utilityId = positiveId(req.params.utilityId, 'Utility ID');
  const profile = await one(
    `SELECT u.*, p.asset_id, p.energy_type, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_utility_profile u
     JOIN energy_asset_profile p ON p.id=u.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id WHERE u.id=? LIMIT 1`, [utilityId]);
  if (!profile) throw new HttpError(404, 'Profil Compressor/Boiler tidak ditemukan.');
  const operations = await rows<Record<string, unknown>>(
    `SELECT o.* FROM energy_utility_operation o
     WHERE o.utility_profile_id=? ORDER BY o.inspected_at DESC, o.id DESC`, [utilityId]);
  const links = operations.length ? await rows<Record<string, unknown>>(
    `SELECT l.*, w.status AS wo_status
     FROM energy_utility_work_order_link l LEFT JOIN tb_wo_mtc w ON w.wo_number=l.wo_number
     WHERE l.operation_id IN (${operations.map(() => '?').join(',')}) ORDER BY l.id`,
    operations.map((item) => Number(item.id))) : [];
  const linksByOperation = new Map<number, Record<string, unknown>[]>();
  for (const link of links) {
    const list = linksByOperation.get(Number(link.operation_id)) ?? [];
    list.push(link);
    linksByOperation.set(Number(link.operation_id), list);
  }
  ok(res, { profile, operations: operations.map((item) => ({ ...item, work_orders: linksByOperation.get(Number(item.id)) ?? [] })) });
}));

energyUtilityOperationsRouter.post('/energy/utilities/:utilityId/operations', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const utilityId = positiveId(req.params.utilityId, 'Utility ID');
  const user = (req as AuthRequest).user!;
  const result = await transaction((connection) => saveOperation(connection, utilityId, req.body, user));
  created(res, result, result.condition_status === 'NORMAL' ? 'Draft inspeksi dibuat.' : 'Draft inspeksi dibuat dengan peringatan abnormal.');
}));

energyUtilityOperationsRouter.patch('/energy/utility-operations/:operationId', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const operation = await one<{ utility_profile_id: number }>('SELECT utility_profile_id FROM energy_utility_operation WHERE id=? LIMIT 1', [operationId]);
  if (!operation) throw new HttpError(404, 'Log inspeksi utility tidak ditemukan.');
  const user = (req as AuthRequest).user!;
  const result = await transaction((connection) => saveOperation(connection, operation.utility_profile_id, req.body, user, operationId));
  ok(res, result, result.condition_status === 'NORMAL' ? 'Draft inspeksi diperbarui.' : 'Draft inspeksi diperbarui dengan peringatan abnormal.');
}));

energyUtilityOperationsRouter.post('/energy/utility-operations/:operationId/submit', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const user = (req as AuthRequest).user!;
  await transaction(async (connection) => {
    const operation = await connectionOne<{ status: string }>(connection,
      'SELECT status FROM energy_utility_operation WHERE id=? LIMIT 1 FOR UPDATE', [operationId]);
    if (!operation) throw new HttpError(404, 'Log inspeksi utility tidak ditemukan.');
    if (operation.status !== 'DRAFT') throw new HttpError(409, 'Inspeksi harus berstatus DRAFT.');
    await connection.execute(
      "UPDATE energy_utility_operation SET status='SUBMITTED', submitted_by=?, submitted_at=NOW(), updated_by=?, updated_at=NOW() WHERE id=?",
      [user.fullname, user.fullname, operationId]);
  });
  ok(res, { id: operationId, status: 'SUBMITTED' }, 'Inspeksi disubmit untuk verifikasi.');
}));

energyUtilityOperationsRouter.post('/energy/utility-operations/:operationId/lock', canApprove, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const user = (req as AuthRequest).user!;
  const result = await transaction(async (connection) => {
    const operation = await connectionOne<{
      id: number; utility_profile_id: number; status: string; condition_status: string;
      abnormal_reasons: string | null; hour_meter_end: number | string | null;
    }>(connection, 'SELECT * FROM energy_utility_operation WHERE id=? LIMIT 1 FOR UPDATE', [operationId]);
    if (!operation) throw new HttpError(404, 'Log inspeksi utility tidak ditemukan.');
    if (operation.status !== 'SUBMITTED') throw new HttpError(409, 'Inspeksi harus berstatus SUBMITTED.');
    const profile = await utilityForUpdate(connection, operation.utility_profile_id);
    const currentHour = operation.hour_meter_end === null ? null : Number(operation.hour_meter_end);
    await connection.execute(
      "UPDATE energy_utility_operation SET status='LOCKED', locked_by=?, locked_at=NOW(), updated_by=?, updated_at=NOW() WHERE id=?",
      [user.fullname, user.fullname, operationId]);
    if (currentHour !== null) {
      await connection.execute(
        'UPDATE energy_utility_profile SET current_hour_meter=GREATEST(COALESCE(current_hour_meter,0),?), updated_by=?, updated_at=NOW() WHERE id=?',
        [currentHour, user.fullname, profile.id]);
    }

    const workOrders: Array<{ type: string; wo_number: string }> = [];
    if (Number(profile.auto_corrective_wo) === 1 && operation.condition_status !== 'NORMAL') {
      const latest = await latestLinkedWo(connection, profile.id, 'CORRECTIVE');
      if (!latest || !latest.status || FINAL_WO_STATUSES.has(String(latest.status).toUpperCase())) {
        const reason = operation.abnormal_reasons ?? 'Hasil inspeksi utility abnormal.';
        workOrders.push({ type: 'CORRECTIVE', wo_number: await createMesoWo(connection, profile, operationId, 'CORRECTIVE', reason, currentHour, user) });
      }
    }

    const interval = profile.preventive_interval_hours === null ? null : Number(profile.preventive_interval_hours);
    if (Number(profile.auto_preventive_wo) === 1 && interval && currentHour !== null) {
      const latest = await latestLinkedWo(connection, profile.id, 'PREVENTIVE');
      if (latest?.status && FINAL_WO_STATUSES.has(String(latest.status).toUpperCase()) && latest.operation_hour !== null) {
        await connection.execute(
          'UPDATE energy_utility_profile SET last_preventive_hour_meter=?, updated_by=?, updated_at=NOW() WHERE id=?',
          [Number(latest.operation_hour), user.fullname, profile.id]);
        profile.last_preventive_hour_meter = Number(latest.operation_hour);
      }
      const baseline = Number(profile.last_preventive_hour_meter ?? profile.initial_hour_meter ?? 0);
      const dueAt = baseline + interval;
      const hasOpenWo = Boolean(latest?.status && !FINAL_WO_STATUSES.has(String(latest.status).toUpperCase()));
      if (currentHour >= dueAt && !hasOpenWo) {
        const reason = `Hour meter ${currentHour} telah mencapai jadwal preventive ${dueAt} jam (interval ${interval} jam).`;
        workOrders.push({ type: 'PREVENTIVE', wo_number: await createMesoWo(connection, profile, operationId, 'PREVENTIVE', reason, currentHour, user) });
      }
    }
    return { id: operationId, status: 'LOCKED', condition_status: operation.condition_status, work_orders: workOrders };
  });
  ok(res, result, result.work_orders.length ? 'Inspeksi dikunci dan WO otomatis dibuat.' : 'Inspeksi dikunci.');
}));
