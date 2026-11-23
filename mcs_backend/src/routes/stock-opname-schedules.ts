import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { parseScheduleIds, runDueStockOpnameSchedules } from '../lib/stock-opname-schedule.js';
import { getStockOpnameAssetDetail, getStockOpnameHeaders, stockOpnameHeaderNo } from '../lib/stock-opname-proxy.js';
import { normalizeAssetLookup } from '../lib/asset-lookup.js';
import { parseBomQrPartId } from '../lib/bom-qr.js';
import { assertStockOpnameCounting, getStockOpnameWorkflow, lockApprovedStockOpname, stockOpnameValidationEnabled, submitStockOpnameLocation } from '../lib/stock-opname-validation.js';
import type { AuthRequest } from '../types.js';

export const stockOpnameScheduleRouter = Router();
const canManage = requirePermission('schedule');
const canUseStockOpname = requirePermission('stock_opname', 'schedule');

// Semua endpoint operasional/scheduler SO harus melewati permission. User
// scheduler tetap dapat mengelola SO, sedangkan petugas cukup diberi
// `stock_opname` dan tetap dibatasi lagi oleh assignment lokasi/NoSO.
stockOpnameScheduleRouter.use(
  ['/stock-opname-schedules', '/stock-opname-operations'],
  authenticate,
  canUseStockOpname,
);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function ensureTables() {
  if (!(await tableExists('stock_opname_schedule')) || !(await tableExists('stock_opname_schedule_location_assignment'))) {
    throw new HttpError(503, 'Scheduler SO belum lengkap. Jalankan migration 20261118 lalu 20261120_stock_opname_scheduler_assignment_flow.sql.');
  }
}
const actor = (req: AuthRequest) => String(req.user?.fullname || req.user?.username || 'SYSTEM').trim();
const canManageAllSo = (req: AuthRequest) => {
  const user = req.user!;
  const position = String(user.id_position ?? '').toUpperCase();
  return Number(user.schedule ?? 0) === 1 || Number(user.approval_all ?? 0) === 1
    || position.includes('MANAGEMENT') || position.includes('DIVHEAD');
};

async function assertOperationalAccess(req: AuthRequest, noSo: string) {
  if (canManageAllSo(req)) return;
  const assigned = await one(
    `SELECT id FROM stock_opname_schedule_run_assignment
     WHERE user_id=? AND no_so=? AND status IN ('ASSIGNED','RECOUNT','SUBMITTED','COMPLETED') LIMIT 1`,
    [req.user!.id_user, noSo],
  );
  if (!assigned) throw new HttpError(403, 'Stock Opname ini tidak ditugaskan kepada Anda.');
}

async function soRequest(req: AuthRequest, path: string, method = 'GET', body?: unknown) {
  const authorization = String(req.headers.authorization ?? '');
  const response = await fetch(`${config.soBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response) throw new HttpError(502, 'Service Stock Opname tidak dapat dihubungi.');
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = String(payload?.message ?? payload?.error ?? `Service Stock Opname HTTP ${response.status}`);
    throw new HttpError(response.status >= 400 && response.status < 500 ? response.status : 502, message);
  }
  return payload;
}
type AssignmentInput = { location_id: string; location_name: string | null; user_id: number };

function input(body: any) {
  const name = String(body.schedule_name ?? '').trim();
  const recurrence = String(body.recurrence_type ?? 'MONTHLY').toUpperCase();
  const interval = Math.max(1, Math.min(365, Number(body.interval_value) || 1));
  const startDate = String(body.start_date ?? '').slice(0, 10);
  const endDate = String(body.end_date ?? '').slice(0, 10) || null;
  const companies = parseScheduleIds(body.company_ids);
  const categories = parseScheduleIds(body.category_ids);
  const assignments: AssignmentInput[] = (Array.isArray(body.location_assignments) ? body.location_assignments : []).map((item: any) => ({
    location_id: String(item.location_id ?? '').trim().slice(0, 120),
    location_name: String(item.location_name ?? '').trim().slice(0, 255) || null,
    user_id: Number(item.user_id),
  })).filter((item: AssignmentInput) => item.location_id && Number.isSafeInteger(item.user_id) && item.user_id > 0);
  if (!name) throw new HttpError(422, 'Nama jadwal wajib diisi.');
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(recurrence)) throw new HttpError(422, 'Periode jadwal tidak valid.');
  if (!datePattern.test(startDate) || (endDate && !datePattern.test(endDate))) throw new HttpError(422, 'Tanggal jadwal tidak valid.');
  if (endDate && endDate < startDate) throw new HttpError(422, 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
  if (!companies.length || !categories.length) throw new HttpError(422, 'Company dan kategori SO wajib dipilih.');
  if (!assignments.length) throw new HttpError(422, 'Tambahkan minimal satu assignment petugas ke lokasi.');
  const unique = new Set(assignments.map((item) => `${item.location_id}|${item.user_id}`));
  if (unique.size !== assignments.length) throw new HttpError(422, 'Assignment lokasi dan petugas tidak boleh duplikat.');
  const locationsByUser = new Map<number, Set<string>>();
  for (const item of assignments) {
    const set = locationsByUser.get(item.user_id) ?? new Set<string>(); set.add(item.location_id); locationsByUser.set(item.user_id, set);
    if (set.size > 2) throw new HttpError(422, `Satu petugas maksimal mendapat dua lokasi, mengikuti aturan PPS.`);
  }
  return { name, recurrence, interval, startDate, endDate, companies, categories, assignments,
    locations: [...new Set(assignments.map((item) => item.location_id))], isBom: body.is_bom ? 1 : 0,
    notes: String(body.notes ?? '').trim().slice(0, 500) || null };
}

async function scheduleRows(where = '', params: unknown[] = []) {
  const list = await rows<any>(`SELECT s.*,
    (SELECT COUNT(*) FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id) run_count,
    (SELECT status FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id ORDER BY r.due_date DESC,r.id DESC LIMIT 1) last_run_status,
    (SELECT GROUP_CONCAT(rr.no_so ORDER BY rr.id SEPARATOR ', ') FROM stock_opname_schedule_run rr
      WHERE rr.schedule_id=s.id AND rr.no_so IS NOT NULL AND rr.due_date=(SELECT MAX(rr2.due_date) FROM stock_opname_schedule_run rr2 WHERE rr2.schedule_id=s.id)) last_no_so
    FROM stock_opname_schedule s ${where} ORDER BY s.status='ACTIVE' DESC,s.next_run_date,s.id`, params);
  if (!list.length) return [];
  const ids = list.map((item) => Number(item.id));
  const assignments = await rows<any>(`SELECT a.*,u.fullname,u.username FROM stock_opname_schedule_location_assignment a
    JOIN tb_user u ON u.id_user=a.user_id WHERE a.schedule_id IN (${ids.map(() => '?').join(',')})
    ORDER BY a.location_name,u.fullname`, ids);
  return list.map((item) => ({ ...item, company_ids: parseScheduleIds(item.company_ids), category_ids: parseScheduleIds(item.category_ids),
    location_ids: parseScheduleIds(item.location_ids), location_assignments: assignments.filter((a) => Number(a.schedule_id) === Number(item.id)) }));
}

stockOpnameScheduleRouter.get('/stock-opname-schedules', authenticate, canManage, asyncHandler(async (_req, res) => { await ensureTables(); ok(res, await scheduleRows()); }));
stockOpnameScheduleRouter.get('/stock-opname-schedules/my', authenticate, asyncHandler(async (req, res) => {
  await ensureTables(); const user = (req as AuthRequest).user!;
  ok(res, await scheduleRows(`WHERE s.status='ACTIVE' AND (s.end_date IS NULL OR s.end_date>=CURDATE())
    AND EXISTS (SELECT 1 FROM stock_opname_schedule_location_assignment mine WHERE mine.schedule_id=s.id AND mine.user_id=?)`, [user.id_user]));
}));

stockOpnameScheduleRouter.get('/stock-opname-schedules/work-items', authenticate, asyncHandler(async (req, res) => {
  await ensureTables();
  const authReq = req as AuthRequest;
  const user = authReq.user!;
  const canManage = canManageAllSo(authReq);
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  let headers: Record<string, unknown>[];
  try { headers = await getStockOpnameHeaders(token); }
  catch { throw new HttpError(502, 'Gagal mengambil daftar Stock Opname.', 'SO_SERVICE_UNREACHABLE'); }
  const controls: Array<{ no_so: string; status: string }> = (await stockOpnameValidationEnabled())
    ? await rows<{ no_so: string; status: string }>('SELECT no_so,status FROM stock_opname_validation_control') : [];
  const workflowByNo = new Map(controls.map((item) => [item.no_so, item.status]));
  if (canManage) {
    ok(res, { can_manage: true, items: headers.map((item) => {
      const noSo = stockOpnameHeaderNo(item); return { ...item, workflow_status: workflowByNo.get(noSo) ?? 'COUNTING' };
    }) });
    return;
  }
  const assignments = await rows<{ no_so: string; location_id: string; location_name: string | null }>(
    `SELECT DISTINCT no_so,location_id,location_name FROM stock_opname_schedule_run_assignment
     WHERE user_id=? AND status IN ('ASSIGNED','RECOUNT','SUBMITTED','COMPLETED') ORDER BY assigned_at DESC`, [user.id_user],
  );
  const byNoSo = new Map<string, typeof assignments>();
  for (const item of assignments) byNoSo.set(item.no_so, [...(byNoSo.get(item.no_so) ?? []), item]);
  const items = headers.filter((item) => byNoSo.has(stockOpnameHeaderNo(item))).map((item) => {
    const noSo = stockOpnameHeaderNo(item);
    const mine = byNoSo.get(noSo) ?? [];
    return { ...item, workflow_status: workflowByNo.get(noSo) ?? 'COUNTING', locations: [...new Set(mine.map((entry) => entry.location_name || entry.location_id))], assigned_locations: mine };
  });
  ok(res, { can_manage: false, items });
}));

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const locationMatches = (actual: string, id: string, name: string | null) => {
  const a = norm(actual); const keys = [norm(id), norm(name)].filter((value) => value.length > 0);
  return keys.some((key) => a === key || (key.length >= 4 && (a.includes(key) || key.includes(a))));
};
const isVariance = (status: string) => /(selisih|mismatch|tidak sesuai|rusak|hilang)/i.test(status);
const upstreamData = (payload: any) => payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload ? payload.data : payload;

// Operasional Stock Opname untuk web. Kontrak upstream sama dengan aplikasi
// tablet, tetapi semua request melewati MCS agar token dan assignment user
// tetap divalidasi di satu tempat.
stockOpnameScheduleRouter.get('/stock-opname-operations/masters', authenticate, asyncHandler(async (req, res) => {
  const payload = await soRequest(req as AuthRequest, '/api/master-company');
  ok(res, upstreamData(payload));
}));

stockOpnameScheduleRouter.post('/stock-opname-operations', authenticate, asyncHandler(async (req, res) => {
  if (!canManageAllSo(req as AuthRequest)) throw new HttpError(403, 'Anda tidak memiliki akses untuk membuat Stock Opname.');
  const tanggal = String(req.body.Tanggal ?? req.body.tanggal ?? '').slice(0, 10);
  const companies = Array.isArray(req.body.IdCompanies) ? req.body.IdCompanies.map(String) : [];
  const categories = Array.isArray(req.body.IdCategories) ? req.body.IdCategories.map(String) : [];
  const locations = Array.isArray(req.body.IdLocations) ? req.body.IdLocations.map(String) : [];
  if (!datePattern.test(tanggal) || !companies.length || !categories.length || !locations.length) {
    throw new HttpError(422, 'Tanggal, company, kategori, dan lokasi wajib dipilih.');
  }
  const payload = await soRequest(req as AuthRequest, '/api/no-stock-opname/create', 'POST', {
    Tanggal: tanggal,
    IdCompanies: companies,
    IdCategories: categories,
    IdLocations: locations,
    IsBOM: Boolean(req.body.IsBOM ?? req.body.is_bom),
  });
  created(res, upstreamData(payload), String(payload?.message ?? 'Stock Opname dibuat.'));
}));

stockOpnameScheduleRouter.get('/stock-opname-operations/:noSo/detail', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  const detail = await getStockOpnameAssetDetail(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''), noSo);
  const workflow = await getStockOpnameWorkflow(noSo);
  if (canManageAllSo(authReq)) { ok(res, { ...detail, workflow }); return; }
  const assigned = await rows<{ location_id: string; location_name: string | null }>(
    `SELECT location_id,location_name FROM stock_opname_schedule_run_assignment
     WHERE user_id=? AND no_so=? AND status IN ('ASSIGNED','RECOUNT','SUBMITTED','COMPLETED')`, [authReq.user!.id_user, noSo],
  );
  ok(res, { ...detail, workflow, rows: detail.rows.filter((row) => assigned.some((item) => locationMatches(row.location, item.location_id, item.location_name))) });
}));

stockOpnameScheduleRouter.get('/stock-opname-operations/:noSo/workflow', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  ok(res, await getStockOpnameWorkflow(noSo));
}));

stockOpnameScheduleRouter.post('/stock-opname-operations/:noSo/submit', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  ok(res, await submitStockOpnameLocation(noSo, token, authReq.user!), 'Hasil count dikirim ke checker.');
}));

stockOpnameScheduleRouter.post('/stock-opname-operations/:noSo/scan', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  await assertStockOpnameCounting(noSo, authReq.user!);
  const scanned = String(req.body.asset_code ?? req.body.AssetCode ?? '').trim();
  const bomPartId = parseBomQrPartId(scanned);
  const bomPart = bomPartId ? await one<{ AssetCode: string | null }>(
    'SELECT AssetCode FROM tb_parts_bom WHERE id=? AND deleted_at IS NULL LIMIT 1', [bomPartId],
  ) : null;
  let assetCode = String(bomPart?.AssetCode ?? normalizeAssetLookup(scanned)).trim();
  if (/^\d+$/.test(assetCode)) {
    const asset = await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=? OR AssetCode=? LIMIT 1', [assetCode, assetCode]);
    if (asset?.AssetCode) assetCode = asset.AssetCode;
  }
  if (!assetCode) throw new HttpError(422, 'Kode aset/QR wajib diisi.');
  const checked = await soRequest(authReq, `/api/no-stock-opname/${encodeURIComponent(noSo)}/check`, 'POST', { AssetCode: assetCode });
  const checkedData = upstreamData(checked);
  if (!canManageAllSo(authReq)) {
    const actualLocation = String(checkedData?.LocationAsset ?? checkedData?.locationAsset ?? checkedData?.location ?? '').trim();
    if (actualLocation) {
      const assigned = await rows<{ location_id: string; location_name: string | null }>(
        `SELECT location_id,location_name FROM stock_opname_schedule_run_assignment
         WHERE user_id=? AND no_so=? AND status='ASSIGNED'`, [authReq.user!.id_user, noSo],
      );
      if (!assigned.some((item) => locationMatches(actualLocation, item.location_id, item.location_name))) {
        throw new HttpError(403, `Aset berada di lokasi ${actualLocation}, di luar assignment Anda.`);
      }
    }
  }
  const validCode = String(checkedData?.AssetCode ?? checkedData?.assetCode ?? assetCode).trim();
  const assetName = String(checkedData?.AssetName ?? checkedData?.assetName ?? '').trim();
  const payload = await soRequest(authReq, `/api/no-stock-opname/${encodeURIComponent(noSo)}/submit`, 'POST', {
    AssetCode: validCode, ...(assetName ? { AssetName: assetName } : {}),
  });
  ok(res, upstreamData(payload), String(payload?.message ?? 'Aset berhasil dicatat.'));
}));

stockOpnameScheduleRouter.put('/stock-opname-operations/:noSo/lock', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  if (!canManageAllSo(authReq)) throw new HttpError(403, 'Final lock hanya dapat dilakukan supervisor setelah approval.');
  await lockApprovedStockOpname(noSo, String(req.headers.authorization ?? ''), authReq.user!);
  ok(res, { no_so: noSo, status: 'LOCKED' }, 'Stock Opname dikunci final.');
}));

stockOpnameScheduleRouter.get('/stock-opname-operations/:noSo/bom', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  const assetCode = String(req.query.asset_code ?? '').trim();
  if (!assetCode) throw new HttpError(422, 'Kode aset wajib diisi.');
  const payload = await soRequest(authReq, `/api/part-bom?noSO=${encodeURIComponent(noSo)}&assetCode=${encodeURIComponent(assetCode)}`);
  ok(res, upstreamData(payload));
}));

stockOpnameScheduleRouter.post('/stock-opname-operations/:noSo/bom', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  await assertStockOpnameCounting(noSo, authReq.user!);
  const assetCode = String(req.body.asset_code ?? req.body.assetCode ?? '').trim();
  const parts = Array.isArray(req.body.parts) ? req.body.parts : [];
  if (!assetCode || !parts.length) throw new HttpError(422, 'Aset dan detail hasil BOM wajib diisi.');
  const payload = await soRequest(authReq, '/api/update-bom', 'POST', { noSO: noSo, assetCode, data: parts });
  ok(res, upstreamData(payload), String(payload?.message ?? 'Hasil BOM disimpan.'));
}));

stockOpnameScheduleRouter.get('/stock-opname-operations/:noSo/findings', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  const [assets, parts] = await Promise.all([
    soRequest(authReq, `/api/no-asset-stock-opname/${encodeURIComponent(noSo)}`),
    soRequest(authReq, `/api/non-part-stock-opname/${encodeURIComponent(noSo)}`),
  ]);
  ok(res, { assets: upstreamData(assets) ?? [], parts: upstreamData(parts) ?? [] });
}));

stockOpnameScheduleRouter.post('/stock-opname-operations/:noSo/findings/:kind', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const noSo = String(req.params.noSo ?? '').trim();
  await assertOperationalAccess(authReq, noSo);
  await assertStockOpnameCounting(noSo, authReq.user!);
  const kind = String(req.params.kind ?? '').toLowerCase();
  if (!['asset', 'part'].includes(kind)) throw new HttpError(404, 'Jenis temuan tidak valid.');
  const body = kind === 'asset' ? {
    NoSO: noSo,
    NonAssetName: String(req.body.name ?? '').trim(),
    LocationCode: String(req.body.location_code ?? '').trim(),
    Remark: String(req.body.remark ?? '').trim(),
  } : {
    NoSO: noSo,
    NonPartName: String(req.body.name ?? '').trim(),
    Qty: Math.max(1, Number(req.body.qty) || 1),
    Remark: String(req.body.remark ?? '').trim(),
  };
  if (!body.NonAssetName && !body.NonPartName) throw new HttpError(422, 'Nama temuan wajib diisi.');
  const path = kind === 'asset' ? '/api/no-asset-stock-opname/create' : '/api/non-part-stock-opname/create';
  const payload = await soRequest(authReq, path, 'POST', body);
  created(res, upstreamData(payload), String(payload?.message ?? 'Temuan disimpan.'));
}));

stockOpnameScheduleRouter.get('/stock-opname-schedules/monitoring', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables();
  const scheduleId = Number(req.query.schedule_id ?? 0);
  const params: unknown[] = [];
  let filter = '';
  if (Number.isSafeInteger(scheduleId) && scheduleId > 0) { filter = 'AND r.schedule_id=?'; params.push(scheduleId); }
  const assignments = await rows<any>(
    `SELECT ra.id,ra.run_id,ra.no_so,ra.location_id,ra.location_name,ra.user_id,ra.status,
       ra.assigned_at,ra.completed_at,u.username,u.fullname,r.schedule_id,r.category_id,r.due_date,
       r.status run_status,s.schedule_name,s.is_bom
     FROM stock_opname_schedule_run_assignment ra
     JOIN stock_opname_schedule_run r ON r.id=ra.run_id
     JOIN stock_opname_schedule s ON s.id=r.schedule_id
     JOIN tb_user u ON u.id_user=ra.user_id
     WHERE 1=1 ${filter} ORDER BY r.due_date DESC,ra.id DESC LIMIT 300`, params,
  );
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const noSoList = [...new Set(assignments.map((item) => String(item.no_so)))];
  const details = new Map<string, Awaited<ReturnType<typeof getStockOpnameAssetDetail>>>();
  await Promise.all(noSoList.map(async (noSo) => {
    try { details.set(noSo, await getStockOpnameAssetDetail(token, noSo)); } catch { /* tampilkan nol bila service SO sementara gagal */ }
  }));
  const data = assignments.map((item) => {
    const detail = details.get(String(item.no_so));
    const scoped = (detail?.rows ?? []).filter((row) => locationMatches(row.location, String(item.location_id), item.location_name));
    const checkedRows = scoped.filter((row) => row.checked);
    const byUser = checkedRows.filter((row) => norm(row.username) === norm(item.username));
    const varianceRows = checkedRows.filter((row) => detail?.type === 'BOM'
      ? Number(row.qty_found ?? 0) !== Number(row.parts_count ?? 0) : isVariance(row.status));
    return { ...item, type: detail?.type ?? (Number(item.is_bom) === 1 ? 'BOM' : 'ASSET'),
      total_snapshot: scoped.length, checked: checkedRows.length, unchecked: Math.max(0, scoped.length - checkedRows.length),
      variance: varianceRows.length, checked_by_user: byUser.length,
      progress_percent: scoped.length ? Math.round((checkedRows.length / scoped.length) * 100) : 0 };
  });
  const uniqueAssets = new Map<string, { checked: boolean; variance: boolean }>();
  for (const [noSo, detail] of details) for (const row of detail.rows) {
    const key = `${noSo}|${row.asset_code}|${row.parts_count ?? ''}`;
    uniqueAssets.set(key, { checked: row.checked, variance: row.checked && (detail.type === 'BOM'
      ? Number(row.qty_found ?? 0) !== Number(row.parts_count ?? 0) : isVariance(row.status)) });
  }
  const all = [...uniqueAssets.values()];
  ok(res, { summary: { total_snapshot: all.length, checked: all.filter((item) => item.checked).length,
    unchecked: all.filter((item) => !item.checked).length, variance: all.filter((item) => item.variance).length }, rows: data });
}));

stockOpnameScheduleRouter.get('/stock-opname-schedules/options', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables(); const authorization = String(req.headers.authorization ?? '');
  const [users, upstream] = await Promise.all([
    rows(`SELECT u.id_user value,u.fullname label,u.username,d.division_name division FROM tb_user u
      LEFT JOIN tb_division d ON d.id_division=u.id_division WHERE u.active=1 ORDER BY u.fullname`),
    fetch(`${config.soBaseUrl}/api/master-company`, { headers: { Authorization: authorization, Accept: 'application/json' } }),
  ]);
  const masters = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new HttpError(502, String(masters?.message ?? `Master Stock Opname gagal dimuat (HTTP ${upstream.status}).`));
  ok(res, { users, masters: masters?.data ?? masters });
}));

async function saveAssignments(connection: any, scheduleId: number, assignments: AssignmentInput[], by: string) {
  await connection.execute('DELETE FROM stock_opname_schedule_location_assignment WHERE schedule_id=?', [scheduleId]);
  await connection.execute('DELETE FROM stock_opname_schedule_assignee WHERE schedule_id=?', [scheduleId]);
  const users = [...new Set(assignments.map((item) => item.user_id))];
  for (const userId of users) await connection.execute('INSERT INTO stock_opname_schedule_assignee (schedule_id,user_id,assigned_by,assigned_at) VALUES (?,?,?,NOW())', [scheduleId, userId, by]);
  for (const item of assignments) await connection.execute(`INSERT INTO stock_opname_schedule_location_assignment
    (schedule_id,location_id,location_name,user_id,assigned_by,created_at) VALUES (?,?,?,?,?,NOW())`,
  [scheduleId, item.location_id, item.location_name, item.user_id, by]);
}

stockOpnameScheduleRouter.post('/stock-opname-schedules', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables(); const values = input(req.body); const user = (req as AuthRequest).user!;
  const validUsers = await rows<any>(`SELECT id_user FROM tb_user WHERE active=1 AND id_user IN (${[...new Set(values.assignments.map((a) => a.user_id))].map(() => '?').join(',')})`, [...new Set(values.assignments.map((a) => a.user_id))]);
  if (validUsers.length !== new Set(values.assignments.map((a) => a.user_id)).size) throw new HttpError(422, 'Salah satu petugas tidak aktif atau tidak ditemukan.');
  const id = await transaction(async (connection) => {
    const code = `SOS-${Date.now().toString(36).toUpperCase()}`;
    const [inserted] = await connection.execute<any>(`INSERT INTO stock_opname_schedule
      (schedule_code,schedule_name,recurrence_type,interval_value,start_date,end_date,next_run_date,is_bom,company_ids,category_ids,location_ids,status,notes,created_by_user_id,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,NOW())`, [code, values.name, values.recurrence, values.interval, values.startDate, values.endDate, values.startDate,
      values.isBom, JSON.stringify(values.companies), JSON.stringify(values.categories), JSON.stringify(values.locations), values.notes, user.id_user, actor(req as AuthRequest)]);
    await saveAssignments(connection, Number(inserted.insertId), values.assignments, actor(req as AuthRequest)); return Number(inserted.insertId);
  });
  created(res, { id }, 'Jadwal Stock Opname dibuat.');
}));

stockOpnameScheduleRouter.patch('/stock-opname-schedules/:id', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables(); const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !(await one('SELECT id FROM stock_opname_schedule WHERE id=?', [id]))) throw new HttpError(404, 'Jadwal Stock Opname tidak ditemukan.');
  const values = input(req.body);
  await transaction(async (connection) => {
    await connection.execute(`UPDATE stock_opname_schedule SET schedule_name=?,recurrence_type=?,interval_value=?,start_date=?,end_date=?,
      next_run_date=CASE WHEN last_run_date IS NULL THEN ? ELSE next_run_date END,is_bom=?,company_ids=?,category_ids=?,location_ids=?,notes=?,updated_by=?,updated_at=NOW() WHERE id=?`,
    [values.name, values.recurrence, values.interval, values.startDate, values.endDate, values.startDate, values.isBom,
      JSON.stringify(values.companies), JSON.stringify(values.categories), JSON.stringify(values.locations), values.notes, actor(req as AuthRequest), id]);
    await saveAssignments(connection, id, values.assignments, actor(req as AuthRequest));
  }); ok(res, { id }, 'Jadwal Stock Opname diperbarui.');
}));

stockOpnameScheduleRouter.patch('/stock-opname-schedules/:id/status', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables(); const id = Number(req.params.id); const status = String(req.body.status ?? '').toUpperCase();
  if (!['ACTIVE', 'PAUSED'].includes(status)) throw new HttpError(422, 'Status jadwal tidak valid.');
  const result = await execute('UPDATE stock_opname_schedule SET status=?,updated_by=?,updated_at=NOW() WHERE id=?', [status, actor(req as AuthRequest), id]);
  if (!result.affectedRows) throw new HttpError(404, 'Jadwal Stock Opname tidak ditemukan.'); ok(res, { id, status });
}));

stockOpnameScheduleRouter.post('/stock-opname-schedules/run-cron', authenticate, canManage, asyncHandler(async (_req, res) => {
  await ensureTables(); const result = await runDueStockOpnameSchedules();
  ok(res, { processed: result.length, created: result.filter((x) => x.status === 'CREATED').length,
    partial: result.filter((x) => x.status === 'PARTIAL').length, failed: result.filter((x) => x.status === 'FAILED').length, runs: result });
}));
