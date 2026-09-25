import { buildCustomDetailMap } from '../lib/preventive-parts.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, HttpError, legacyOk } from '../http.js';
import { syncDailyControlForWoUpdate } from '../lib/daily-control.js';
import { getObjectStream, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest, User } from '../types.js';

export const mesoRouter = Router();

const MTC_DOCS_DIR = path.join(config.uploadDir, 'wo_mtc');
const PART_EXECUTION_DOCS_DIR = path.join(config.uploadDir, 'wo_mtc_part_execution');
fs.mkdirSync(MTC_DOCS_DIR, { recursive: true });
fs.mkdirSync(PART_EXECUTION_DOCS_DIR, { recursive: true });

function extensionFilter(allowed: string[]) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, allowed.includes(ext));
  };
}

const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi']) });
const partExecutionMediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi', 'mkv', 'webm']) });
const servicePhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 10 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'mp4', 'mov', 'avi', 'mkv', 'webm']) });

function randomCode(length = 10): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function personPayload(user: User) {
  return {
    fullname: String(user.fullname ?? ''),
    avatar: String(user.avatar ?? 'avatar.png'),
    id_division: user.id_division,
    id_position: String(user.id_position ?? ''),
    division_code: String(user.division_code ?? ''),
  };
}

async function insertApproval(woNumber: string, person: ReturnType<typeof personPayload>, comment: string): Promise<void> {
  await execute(
    'INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment],
  );
}

function visibilityScope(user: User, tableAlias: string): { sql: string; params: unknown[] } {
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const position = String(user.id_position ?? '').toUpperCase();
  if (crossAccess || !position) return { sql: '', params: [] };
  if (position === 'EXECUTOR_ADMIN' || position === 'EXECUTOR_HEAD') {
    return { sql: `${tableAlias}.job_executor LIKE ?`, params: [`%${user.division_code ?? ''}%`] };
  }
  if (position === 'ADMIN_DIVISI') {
    return { sql: `${tableAlias}.id_division = ?`, params: [user.id_division] };
  }
  if (position === 'DIVHEAD' || position === 'DEPTHEAD') {
    return { sql: `(${tableAlias}.job_executor LIKE ? OR ${tableAlias}.id_division = ?)`, params: [`%${user.division_code ?? ''}%`, user.id_division] };
  }
  return { sql: '', params: [] };
}

async function generateWoNumber(divisionCode: string): Promise<string> {
  const now = new Date();
  const base = `WO-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
  const row = await one<{ seq: number | null }>(
    'SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM tb_wo_mtc WHERE wo_number LIKE ?',
    [`${base}/%`],
  );
  const next = Number(row?.seq ?? 0) + 1;
  return `${base}/${String(next).padStart(4, '0')}`;
}

async function getHeader(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>('SELECT * FROM tb_wo_mtc WHERE wo_number=?', [woNumber]);
}

async function getWoDetail(woNumber: string, user: User): Promise<Record<string, unknown> | null> {
  const scope = visibilityScope(user, 'w');
  const where = scope.sql ? `AND ${scope.sql}` : '';
  return one<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_mtc w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment
     WHERE w.wo_number=? ${where}`,
    [woNumber, ...scope.params],
  );
}

async function getExecutorList(woNumber: string): Promise<Record<string, unknown>[]> {
  const allRows = await rows<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE wo_number=? ORDER BY id DESC', [woNumber]);
  const byExecutor = new Map<string, Record<string, unknown>>();
  for (const row of allRows) {
    const key = String(row.job_executor);
    if (!byExecutor.has(key)) { byExecutor.set(key, row); continue; }
    const current = byExecutor.get(key)!;
    const currentActive = current.status === 'WAITING' || current.status === 'IN_PROGRESS';
    const rowActive = row.status === 'WAITING' || row.status === 'IN_PROGRESS';
    if (rowActive && !currentActive) byExecutor.set(key, row);
  }
  return [...byExecutor.values()];
}

async function getExecutorByDivision(woNumber: string, divisionCode: string): Promise<Record<string, unknown> | null> {
  const active = await one<Record<string, unknown>>(
    "SELECT * FROM tb_job_executor WHERE wo_number=? AND job_executor=? AND (status='WAITING' OR status='IN_PROGRESS') ORDER BY created_at DESC, id DESC LIMIT 1",
    [woNumber, divisionCode],
  );
  if (active) return active;
  return one<Record<string, unknown>>(
    'SELECT * FROM tb_job_executor WHERE wo_number=? AND job_executor=? ORDER BY created_at DESC, id DESC LIMIT 1',
    [woNumber, divisionCode],
  );
}

async function getPreventiveExecutorForUpdate(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>(
    "SELECT * FROM tb_job_executor WHERE wo_number=? AND (status='WAITING' OR status='IN_PROGRESS') ORDER BY created_at DESC, id DESC LIMIT 1",
    [woNumber],
  );
}

async function getServicePhotos(woNumber: string): Promise<Record<string, unknown>[]> {
  if (!(await tableExists('tb_wo_service_evidence'))) return [];
  const evidenceRows = await rows<Record<string, unknown>>(
    'SELECT file_name, file_path, created_at FROM tb_wo_service_evidence WHERE wo_number=? ORDER BY created_at DESC',
    [woNumber],
  );
  return evidenceRows.map((r) => ({ name: r.file_name, path: r.file_path, url: `/uploads/${String(r.file_path)}`, created_at: r.created_at }));
}

const PREVENTIVE_TYPES = new Set(['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM']);
function isPreventiveType(typeWo: unknown): boolean {
  return PREVENTIVE_TYPES.has(String(typeWo ?? '').toUpperCase());
}

interface PreventivePartDefinition { custom_detail_id: number; part_mesin: string; bagian_mesin: string | null }

async function getPreventivePartDefinitions(woNumber: string, assetCode: string): Promise<PreventivePartDefinition[]> {
  const scheduleRows = await rows<Record<string, unknown>>('SELECT id, part_mesin FROM tb_wo_meso_detail WHERE wo_number=? ORDER BY id ASC', [woNumber]);
  if (scheduleRows.length) {
    return scheduleRows.map((r) => ({ custom_detail_id: Number(r.id), part_mesin: String(r.part_mesin ?? ''), bagian_mesin: null }));
  }
  if (!assetCode) return [];
  const customRows = await rows<Record<string, unknown>>(
    'SELECT id, part_mesin, bagian_mesin FROM asset_custom_details WHERE asset_code=? ORDER BY row_order ASC, id ASC',
    [assetCode],
  );
  return customRows.map((r) => ({ custom_detail_id: Number(r.id), part_mesin: String(r.part_mesin ?? ''), bagian_mesin: r.bagian_mesin ? String(r.bagian_mesin) : null }));
}

function partKey(customDetailId: number, partMesin: string): string {
  return customDetailId > 0 ? `id:${customDetailId}` : `part:${partMesin.toLowerCase().trim()}`;
}

async function getMtcPartExecution(woNumber: string, assetCode: string) {
  const definitions = await getPreventivePartDefinitions(woNumber, assetCode);
  const saved = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_part_execution WHERE wo_number=?', [woNumber]);
  const savedByKey = new Map<string, Record<string, unknown>>();
  for (const row of saved) savedByKey.set(partKey(Number(row.custom_detail_id ?? 0), String(row.part_mesin ?? '')), row);

  const media = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_part_execution_media WHERE wo_number=? ORDER BY id DESC', [woNumber]);
  const mediaByKey = new Map<string, Record<string, unknown>[]>();
  for (const row of media) {
    const key = partKey(Number(row.custom_detail_id ?? 0), String(row.part_mesin ?? ''));
    const list = mediaByKey.get(key) ?? [];
    list.push({ id: row.id, custom_detail_id: row.custom_detail_id, part_mesin: row.part_mesin, media_type: row.media_type, name: row.media_name, path: row.media_path, url: `/uploads/${String(row.media_path)}`, created_by: row.created_by, created_at: row.created_at });
    mediaByKey.set(key, list);
  }

  const customDetails = await buildCustomDetailMap(assetCode);

  return definitions.map((def) => {
    const key = partKey(def.custom_detail_id, def.part_mesin);
    const savedRow = savedByKey.get(key);
    const reference = customDetails.get(def.part_mesin.toLowerCase().trim());
    return {
      custom_detail_id: def.custom_detail_id,
      part_mesin: def.part_mesin,
      bagian_mesin: def.bagian_mesin ?? (reference?.bagian_mesin || null),
      tampak_jauh: reference?.tampak_jauh ?? [],
      tampak_dekat: reference?.tampak_dekat ?? [],
      detail_part: reference?.detail_part ?? [],
      maintenance_status: savedRow?.maintenance_status ?? 'PENDING',
      request_qty: Number(savedRow?.request_qty ?? 0),
      request_part: savedRow?.request_part ?? def.part_mesin,
      request_uom: savedRow?.request_uom ?? 'PCS',
      keterangan: savedRow?.keterangan ?? '',
      execution_media: mediaByKey.get(key) ?? [],
    };
  });
}

async function getPreventiveCompletionParts(woNumber: string, assetCode: string) {
  const scheduleRows = await rows<Record<string, unknown>>(
    'SELECT id, wo_number, part_mesin, maintenance_status FROM tb_wo_meso_detail WHERE wo_number=? ORDER BY id ASC',
    [woNumber],
  );
  if (scheduleRows.length) return scheduleRows;
  return getMtcPartExecution(woNumber, assetCode);
}

async function saveLaborFromJobUpdate(woNumber: string, jobExecutor: string, body: Record<string, unknown>): Promise<number> {
  const raw = body.labor;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const pics = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 20);
  if (!pics.length) return 0;
  const men = String(Math.max(1, Number(body.labor_men ?? 1)));
  const hours = String(Math.max(0, Number(body.labor_hours ?? 1)));
  await transaction(async (connection) => {
    for (const pic of pics) {
      await connection.execute('INSERT INTO tb_detail_labor (job_executor, wo_number, trade, men, hours, `for`) VALUES (?,?,?,?,?,?)', [jobExecutor, woNumber, pic, men, hours, 'MTC']);
    }
  });
  return pics.length;
}

async function syncMaterialRequestFromMobile(woNumber: string, material: string, qty: number, unitInput: string | null, jobExecutor: string, user: User): Promise<void> {
  if (!woNumber || !material || qty <= 0) return;
  const unit = unitInput?.trim() || 'PCS';
  const executor = jobExecutor || '-';
  const existingUsage = await one<{ id: number; request_code: string }>(
    "SELECT id, request_code FROM tb_material_usage WHERE wo_number=? AND job_executor=? AND status='OPEN' ORDER BY id DESC LIMIT 1",
    [woNumber, executor],
  );
  let requestCode = existingUsage?.request_code ?? '';

  if (!requestCode) {
    const header = await getHeader(woNumber);
    if (!header) return;
    requestCode = randomCode(10);
    const person = personPayload(user);
    await transaction(async (connection) => {
      await connection.execute(
        'INSERT INTO tb_material_usage (wo_number, date, id_equipment, company, job_title, type_wo, id_division, job_executor, status, request_code, created_at) VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,NOW())',
        [woNumber, header.id_equipment, header.company, header.job_title, header.type_wo, header.id_division, executor, 'OPEN', requestCode] as never,
      );
      await connection.execute("UPDATE tb_wo_mtc SET status='WAITING_PARTS', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
      await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=? AND job_executor=?", [woNumber, executor]);
      await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
        [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, 'Executor Request Material.']);
    });
  }

  const existingRequest = await one<{ id: number; material_request: string }>(
    'SELECT id, material_request FROM tb_material_request WHERE wo_number=? AND request_code=? AND job_executor=? AND part=? ORDER BY id DESC LIMIT 1',
    [woNumber, requestCode, executor, material],
  );
  if (existingRequest) {
    const newQty = Number(existingRequest.material_request ?? 0) + qty;
    await execute('UPDATE tb_material_request SET material_request=?, uom_request=? WHERE id=?', [String(newQty), unit, existingRequest.id]);
    return;
  }
  await execute(
    'INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date) VALUES (?,?,?,?,?,?,?,?)',
    [woNumber, 'mobile_request', material, String(qty), unit, executor, requestCode, new Date().toISOString().slice(0, 19).replace('T', ' ')],
  );
}

async function decodeBase64Attachments(input: unknown, prefix: string): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const saved: string[] = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const base64 = String(record.base64 ?? '');
    const filename = String(record.filename ?? `file-${index}`);
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    const raw = match ? match[2] : base64;
    if (!raw) continue;
    const ext = path.extname(filename) || '.bin';
    const safeName = `${prefix}-${index}${ext}`;
    const contentType = match ? match[1] : undefined;
    saved.push(await saveUploadedFile(Buffer.from(raw, 'base64'), 'wo_mtc', safeName, contentType));
  }
  return saved;
}

mesoRouter.use('/meso', authenticate, (req, res, next) => {
  if (req.method === 'GET') return next();
  const user = (req as AuthRequest).user!;
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const nativeAccess = Number(user.wo_mtc ?? 0) === 1 || Number(user.wo_mtc_all ?? 0) === 1;
  if (crossAccess && !nativeAccess) throw new HttpError(403, 'Cross WO Access is read-only');
  next();
});

// `DECLINE` gak pernah beneran kesimpen di kolom status manapun — status
// tolak yang asli adalah `REJECT` (dicek langsung ke data). Tetap disertain
// `DECLINE` buat jaga-jaga tanpa menghapusnya.
const LIST_EXCLUDED_STATUSES = ['CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'COMPLETE EXECUTOR', 'NEED_CLOSED', 'VOID', 'DECLINE', 'REJECT'];

function normalizeTypeWo(value: unknown): string {
  const upper = String(value ?? '').toUpperCase();
  if (['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'].includes(upper)) return 'preventive';
  if (['CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'].includes(upper)) return 'corrective';
  if (upper === 'PROJECT') return 'project';
  return String(value ?? '').toLowerCase();
}

async function listFromTable(table: string, user: User, status: string | undefined, params0: unknown[]): Promise<Record<string, unknown>[]> {
  const scope = visibilityScope(user, 'w');
  let where = 'WHERE 1=1';
  const params: unknown[] = [...params0];
  if (scope.sql) { where += ` AND ${scope.sql}`; params.push(...scope.params); }
  if (status) { where += ' AND w.status=?'; params.push(status); }
  else { where += ` AND w.status NOT IN (${LIST_EXCLUDED_STATUSES.map(() => '?').join(',')})`; params.push(...LIST_EXCLUDED_STATUSES); }
  return rows<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM \`${table}\` w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where} ORDER BY w.date DESC, w.created_at DESC`,
    params,
  );
}

mesoRouter.get('/meso/list', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!Number(user.wo_cross_access ?? 0) && !user.id_division) throw new HttpError(400, 'Division not found');
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const status = req.query.status ? String(req.query.status) : undefined;
  const typeWoFilter = req.query.type_wo ? String(req.query.type_wo) : undefined;

  const mtcRows = await listFromTable('tb_wo_mtc', user, status, []);
  const preventiveRows = (await tableExists('tb_wo_preventive')) ? await listFromTable('tb_wo_preventive', user, status, []) : [];

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...mtcRows, ...preventiveRows]) merged.set(String(row.wo_number), row);
  let items = [...merged.values()];

  if (typeWoFilter) {
    const normalized = normalizeTypeWo(typeWoFilter);
    items = items.filter((row) => normalizeTypeWo(row.type_wo) === normalized);
  }

  items.sort((a, b) => `${b.date} ${b.created_at}`.localeCompare(`${a.date} ${a.created_at}`));
  items = items.map((row) => ({ ...row, type_wo: normalizeTypeWo(row.type_wo) }));

  const total = items.length;
  legacyOk(res, { items: items.slice(offset, offset + limit), pagination: { total, limit, offset } });
}));

function statusListHandler(statuses: string[]) {
  return asyncHandler(async (req, res) => {
    const user = (req as AuthRequest).user!;
    const scope = visibilityScope(user, 'w');
    let where = `WHERE w.status IN (${statuses.map(() => '?').join(',')})`;
    const params: unknown[] = [...statuses];
    if (scope.sql) { where += ` AND ${scope.sql}`; params.push(...scope.params); }
    const data = await rows(
      `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_mtc w
       LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where} ORDER BY w.date DESC, w.created_at DESC`,
      params,
    );
    legacyOk(res, data);
  });
}

mesoRouter.get('/meso/pending', statusListHandler(['WAIT_KA_DIV']));
mesoRouter.get('/meso/approved', statusListHandler(['WAIT_KA_DEPT_MESO', 'WAIT_EXECUTOR_ADMIN', 'IN_PROGRESS_EXECUTOR', 'COMPLETE_EXECUTOR', 'NEED_CLOSED']));
mesoRouter.get('/meso/rejected', statusListHandler(['DECLINE', 'VOID']));

mesoRouter.get('/meso/detail', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  let header = await getWoDetail(woNumber, user);
  if (!header && (await tableExists('tb_wo_preventive'))) {
    const scope = visibilityScope(user, 'w');
    const where = scope.sql ? `AND ${scope.sql}` : '';
    header = await one<Record<string, unknown>>(
      `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_preventive w
       LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment WHERE w.wo_number=? ${where}`,
      [woNumber, ...scope.params],
    );
  }
  if (!header) throw new HttpError(404, 'Work Order not found or access denied');

  const assetCode = String(header.AssetCode ?? '');
  const [servicePhotos, executors, labor, material, partExecution, materialRequests, materialPurchase] = await Promise.all([
    getServicePhotos(woNumber),
    getExecutorList(woNumber),
    rows('SELECT * FROM tb_detail_labor WHERE wo_number=?', [woNumber]),
    rows('SELECT * FROM tb_detail_material WHERE wo_number=?', [woNumber]),
    getMtcPartExecution(woNumber, assetCode),
    rows('SELECT * FROM tb_material_request WHERE wo_number=? ORDER BY date ASC', [woNumber]),
    rows("SELECT * FROM tb_material_request WHERE wo_number=? AND level='others' ORDER BY date ASC", [woNumber]),
  ]);

  res.status(200).json({
    status: true,
    data: { ...header, service_photos: servicePhotos },
    extras: {
      executors, labor, material,
      preventive_parts: partExecution, part_execution: partExecution,
      material_requests: materialRequests, material_received: materialRequests,
      material_purchase: materialPurchase, service_photos: servicePhotos,
    },
  });
}));

mesoRouter.get('/meso/dashboard', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const company = String(req.query.company ?? 'ALL');
  const startDate = req.query.start_date ? String(req.query.start_date) : '';
  const endDate = req.query.end_date ? String(req.query.end_date) : '';
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;

  const buildWhere = (statuses: string[], dateColumn: string, closedDefault: boolean): { sql: string; params: unknown[] } => {
    let sql = `WHERE status IN (${statuses.map(() => '?').join(',')})`;
    const params: unknown[] = [...statuses];
    const effectiveStart = startDate || (closedDefault ? new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) : '');
    if (effectiveStart) { sql += ` AND ${dateColumn} >= ?`; params.push(effectiveStart); }
    if (endDate) { sql += ` AND ${dateColumn} <= ?`; params.push(endDate); }
    if (company !== 'ALL') { sql += ' AND company = ?'; params.push(company); }
    if (!crossAccess && user.id_division) { sql += ' AND id_division = ?'; params.push(user.id_division); }
    return { sql, params };
  };

  const open = buildWhere(['WAIT_KA_DIV'], 'date', false);
  const progress = buildWhere(['WAIT_KA_DEPT_MESO', 'WAIT_EXECUTOR_ADMIN', 'IN_PROGRESS_EXECUTOR', 'WAITING_PARTS', 'PARTS_RECEIVED', 'COMPLETE_EXECUTOR'], 'date', false);
  const closed = buildWhere(['CLOSED', 'COMPLETE', 'NEED_CLOSED'], 'closedDate', true);

  const [openCount, progressCount, closedCount] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_mtc ${open.sql}`, open.params),
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_mtc ${progress.sql}`, progress.params),
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_mtc ${closed.sql}`, closed.params),
  ]);

  const openN = Number(openCount?.total ?? 0);
  const progressN = Number(progressCount?.total ?? 0);
  const closedN = Number(closedCount?.total ?? 0);
  const total = openN + progressN + closedN;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  legacyOk(res, {
    open: openN, in_progress: progressN, closed: closedN, total,
    open_percentage: pct(openN), progress_percentage: pct(progressN), closed_percentage: pct(closedN),
    period: { start_date: startDate, end_date: endDate, company },
  }, 'Dashboard data retrieved successfully');
}));

mesoRouter.get('/meso/asset_history', asyncHandler(async (req, res) => {
  const idEquipment = String(req.query.id_equipment ?? '');
  if (!idEquipment) throw new HttpError(400, 'id_equipment is required');
  const mesoRows = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_mtc WHERE id_equipment=?', [idEquipment]);
  const maintenanceRows: Record<string, unknown>[] = (await tableExists('tb_wo_mtc_operational'))
    ? await rows<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_operational WHERE id_equipment=?', [idEquipment])
    : [];
  const combined: Record<string, unknown>[] = [
    ...mesoRows.map((r): Record<string, unknown> => ({ ...r, source_module: 'MESO' })),
    ...maintenanceRows.map((r): Record<string, unknown> => ({ ...r, source_module: 'MAINTENANCE' })),
  ];
  combined.sort((a, b) => String(b.created_at ?? b.date).localeCompare(String(a.created_at ?? a.date)));
  legacyOk(res, combined);
}));

mesoRouter.post('/meso/create', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  if (!b.job_title) throw new HttpError(400, 'job_title is required');
  const divisionCode = String(user.division_code ?? '');
  const woNumber = b.wo_number ? String(b.wo_number) : await generateWoNumber(divisionCode);
  const idEquipment = String(b.id_equipment ?? '').split('|')[0].trim() || null;
  const safePrefix = woNumber.replace(/[-/\\ ]/g, '').replace(/[^a-zA-Z0-9_]/g, '') || 'WO';
  const attachments = await decodeBase64Attachments(b.attachments, safePrefix);

  await execute(
    `INSERT INTO tb_wo_mtc (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment, job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [woNumber, b.date ?? new Date().toISOString().slice(0, 10), b.company ?? '', b.shift ?? '', b.type_wo ?? 'CORRECTIVE', b.priority ?? 'NORMAL',
      user.id_division, idEquipment, b.job_title, b.running_hours ?? null, b.job_requirement ?? '', attachments.join(','), 'MESO', 'WAIT_KA_DEPT_MESO', 'MESO', user.fullname],
  );

  legacyOk(res, { wo_number: woNumber }, 'Work Order created successfully', 201);
}));

mesoRouter.post('/meso/update', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const woNumber = String(b.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');

  const existingAttachments = String(header.attachment ?? '').split(',').filter(Boolean);
  const safePrefix = woNumber.replace(/[-/\\ ]/g, '').replace(/[^a-zA-Z0-9_]/g, '') || 'WO';
  const newAttachments = await decodeBase64Attachments(b.attachments, `${safePrefix}-${existingAttachments.length}`);

  const fields: Record<string, unknown> = {};
  for (const key of ['date', 'company', 'shift', 'type_wo', 'priority', 'job_title', 'running_hours', 'job_requirement']) {
    if (b[key] !== undefined) fields[key] = b[key];
  }
  if (b.id_equipment !== undefined) fields.id_equipment = String(b.id_equipment).split('|')[0].trim() || null;
  if (newAttachments.length) fields.attachment = [...existingAttachments, ...newAttachments].join(',');
  fields.status = 'WAIT_KA_DIV';

  const keys = Object.keys(fields);
  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, user.fullname, user.avatar ?? 'avatar.png', user.id_division, user.id_position, 'Updated Work order']);
    await connection.execute(`UPDATE tb_wo_mtc SET ${keys.map((k) => `\`${k}\`=?`).join(',')}, updated_at=NOW() WHERE wo_number=?`, [...keys.map((k) => fields[k]), woNumber] as never);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order updated successfully');
}));

mesoRouter.post('/meso/delete', asyncHandler(async (req, res) => {
  const woNumber = String(req.body.wo_number ?? req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');

  await transaction(async (connection) => {
    await connection.execute('DELETE FROM tb_approval WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_detail_labor WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_detail_material WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_wo_mtc WHERE wo_number=?', [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order deleted successfully');
}));

mesoRouter.get('/meso/generate_number', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const divisionCode = String(user.division_code ?? '');
  if (!divisionCode) throw new HttpError(400, 'Division not found');
  legacyOk(res, { wo_number: await generateWoNumber(divisionCode) });
}));

mesoRouter.get('/meso/executor', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await getExecutorList(woNumber));
}));

mesoRouter.get('/meso/executor_detail', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const row = await getExecutorByDivision(woNumber, String(user.division_code ?? ''));
  if (!row) throw new HttpError(404, 'Executor not found');
  legacyOk(res, row);
}));

mesoRouter.post('/meso/upload_attachment', attachmentUpload.single('file'), asyncHandler(async (req, res) => {
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  if (!req.file) throw new HttpError(400, 'file is required');
  const header = await one<{ attachment: string | null }>('SELECT attachment FROM tb_wo_mtc WHERE wo_number=?', [woNumber]);
  if (!header) throw new HttpError(404, 'Work Order not found');

  const relativePath = await saveUploadedFile(req.file.buffer, 'wo_mtc', req.file.originalname, req.file.mimetype);
  const existing = String(header.attachment ?? '').split(',').filter(Boolean);
  await execute('UPDATE tb_wo_mtc SET attachment=? WHERE wo_number=?', [[...existing, relativePath].join(','), woNumber]);

  legacyOk(res, { filename: path.basename(relativePath), url: `/uploads/${relativePath}` }, 'File uploaded successfully');
}));

mesoRouter.get('/meso/open_attachment', asyncHandler(async (req, res) => {
  const filename = path.basename(String(req.query.filename ?? ''));
  if (!filename || filename === '#') throw new HttpError(400, 'filename is required');
  const candidates = [path.join(MTC_DOCS_DIR, filename), path.join(config.uploadDir, filename)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) { res.sendFile(path.resolve(candidate)); return; }
  }
  const object = await getObjectStream(`wo_mtc/${filename}`);
  if (object) {
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    object.stream.pipe(res);
    return;
  }
  throw new HttpError(404, 'File not found');
}));

mesoRouter.post('/meso/approve', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Approve');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);
  const position = String(user.id_position ?? '').toUpperCase();

  let woDivisionCode = '';
  if (position === 'EXECUTOR_ADMIN') {
    const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
    woDivisionCode = divisionRow?.division_code ?? '';
  }

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    if (position === 'DIVHEAD') {
      await connection.execute("UPDATE tb_wo_mtc SET status='WAIT_KA_DEPT_MESO', pic='MESO', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    } else if (position === 'DEPTHEAD') {
      await connection.execute("UPDATE tb_wo_mtc SET status='WAIT_EXECUTOR_ADMIN', pic=?, updated_at=NOW() WHERE wo_number=?", [header.job_executor, woNumber] as never);
    } else if (position === 'EXECUTOR_ADMIN') {
      await connection.execute("UPDATE tb_wo_mtc SET status='COMPLETE_EXECUTOR', pic=?, updated_at=NOW() WHERE wo_number=?", [woDivisionCode, woNumber]);
    } else {
      throw new HttpError(500, 'Failed to approve WO MTC');
    }
  });

  legacyOk(res, { wo_number: woNumber }, 'WO MTC approved successfully');
}));

mesoRouter.post('/meso/complete', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Complete');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 8);
  const startedDate = req.body.started_actual ? String(req.body.started_actual) : (header.started_actual ? String(header.started_actual).slice(0, 10) : nowDate);
  const startedTime = req.body.started_actual_time ? String(req.body.started_actual_time) : nowTime;
  const finishedDate = req.body.finished_actual ? String(req.body.finished_actual) : nowDate;
  const finishedTime = req.body.finished_actual_time ? String(req.body.finished_actual_time) : nowTime;

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_mtc SET started_actual=?, finished_actual=?, status='NEED_CLOSED', updated_at=NOW() WHERE wo_number=?",
      [`${startedDate} ${startedTime}`, `${finishedDate} ${finishedTime}`, woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'NEED_CLOSED' }, 'WO MTC completed successfully');
}));

mesoRouter.post('/meso/close', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Close');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (String(header.status) !== 'NEED_CLOSED') throw new HttpError(409, 'Work Order is not awaiting closing');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_mtc SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'CLOSED' }, 'WO MTC closed successfully');
}));

mesoRouter.post('/meso/void', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1 && String(user.username).toUpperCase() !== 'SUPERUSER') throw new HttpError(403, 'You do not have permission to void this work order');
  const woNumber = String(req.body.wo_number ?? '');
  const reason = String(req.body.reason ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  if (!reason) throw new HttpError(400, 'reason is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute("UPDATE tb_wo_mtc SET status='VOID', reason=?, pic='-', updated_at=NOW() WHERE wo_number=?", [reason, woNumber]);
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, reason]);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order voided successfully');
}));

mesoRouter.post('/meso/job_explanation', servicePhotoUpload.array('service_photos', 10), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const status = String(req.body.status ?? 'IN_PROGRESS');
  if (status !== 'IN_PROGRESS' && status !== 'COMPLETE') throw new HttpError(400, 'status must be IN_PROGRESS or COMPLETE');
  const jobExplanation = String(req.body.job_explanation ?? '');
  const isExternalRaw = req.body.is_external;
  const isExternal = (String(isExternalRaw ?? '') === '1' || Number(isExternalRaw) === 1) ? '1' : '0';

  const header = (await getWoDetail(woNumber, user)) ?? (await getHeader(woNumber));
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (['CLOSED', 'VOID', 'NEED_CLOSED'].includes(String(header.status))) throw new HttpError(409, 'WO sudah selesai dan tidak dapat diperbarui.');

  const isPreventive = isPreventiveType(header.type_wo);
  const assetCode = String(header.AssetCode ?? '');

  if (status === 'COMPLETE' && isPreventive) {
    const parts = await getPreventiveCompletionParts(woNumber, assetCode);
    const pending = parts.filter((p) => String(p.maintenance_status) !== 'DONE');
    if (pending.length) throw new HttpError(400, 'Masih ada part preventive yang belum selesai.');
  }

  const divisionCode = String(user.division_code ?? '');
  let executor = await getExecutorByDivision(woNumber, divisionCode);
  if (!executor && isPreventive) executor = await getPreventiveExecutorForUpdate(woNumber);
  if (!executor) throw new HttpError(404, 'Executor not found');

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'At least one service photo is required');

  const currentExecutorString = String(header.job_executor ?? '');
  let nextExecutorString = currentExecutorString;
  if (isExternal === '1' && !currentExecutorString.includes(',EKS')) nextExecutorString = `${currentExecutorString},EKS`;
  if (isExternal === '0') nextExecutorString = currentExecutorString.replace(',EKS', '');

  const uploaded = await Promise.all(files.map(async (file) => ({
    file, relativePath: await saveUploadedFile(file.buffer, 'wo_mtc', file.originalname, file.mimetype),
  })));

  await transaction(async (connection) => {
    await connection.execute('UPDATE tb_wo_mtc SET is_external=?, job_executor=?, updated_at=NOW() WHERE wo_number=?', [isExternal, nextExecutorString, woNumber]);
    for (const { file, relativePath } of uploaded) {
      await connection.execute(
        'INSERT INTO tb_wo_service_evidence (wo_number, executor_id, module_code, file_name, file_path, file_ext, file_size_kb, mime_type, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
        [woNumber, executor!.id, 'MTC', file.originalname, relativePath, path.extname(file.originalname).slice(1), Math.round(file.size / 1024), file.mimetype, 'MOBILE', user.id_user] as never,
      );
    }
    await connection.execute('UPDATE tb_job_executor SET status=? WHERE id=?', [status, executor!.id] as never);
  });

  await syncDailyControlForWoUpdate({
    woNumber,
    company: String(header.company ?? ''),
    idEquipment: header.id_equipment,
    jobTitle: String(header.job_title ?? ''),
    notes: jobExplanation,
    actorUserId: Number(user.id_user),
    actorFullname: String(user.fullname ?? ''),
    actorDivisionId: user.id_division ? Number(user.id_division) : null,
    jobExecutorCode: String(executor.job_executor ?? executor.pic ?? divisionCode),
  });

  const person = personPayload(user);
  const stillWaiting = await one<{ total: number }>(
    "SELECT COUNT(*) total FROM tb_job_executor WHERE wo_number=? AND (status='WAITING' OR status='IN_PROGRESS')",
    [woNumber],
  );
  const othersPending = Number(stillWaiting?.total ?? 0) > 0;

  if (isPreventive && status === 'COMPLETE') {
    await transaction(async (connection) => {
      await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
        [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, jobExplanation]);
      await connection.execute("UPDATE tb_wo_mtc SET status='CLOSED', closedDate=NOW(), pic='-', job_explanation=?, updated_at=NOW() WHERE wo_number=?", [jobExplanation, woNumber]);
    });
  } else if (othersPending) {
    await insertApproval(woNumber, person, jobExplanation);
    await execute("UPDATE tb_wo_mtc SET status='IN_PROGRESS_EXECUTOR', job_explanation=?, updated_at=NOW() WHERE wo_number=?", [jobExplanation, woNumber]);
  } else {
    const position = String(user.id_position ?? '').toUpperCase();
    await transaction(async (connection) => {
      await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
        [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, jobExplanation]);
      if (position === 'DIVHEAD') {
        await connection.execute("UPDATE tb_wo_mtc SET status='WAIT_KA_DEPT_MESO', pic='MESO', job_explanation=?, updated_at=NOW() WHERE wo_number=?", [jobExplanation, woNumber]);
      } else if (position === 'DEPTHEAD') {
        await connection.execute("UPDATE tb_wo_mtc SET status='WAIT_EXECUTOR_ADMIN', pic=?, job_explanation=?, updated_at=NOW() WHERE wo_number=?", [header.job_executor ?? '', jobExplanation, woNumber] as never);
      } else if (position === 'EXECUTOR_ADMIN') {
        const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
        await connection.execute("UPDATE tb_wo_mtc SET status='COMPLETE_EXECUTOR', pic=?, job_explanation=?, updated_at=NOW() WHERE wo_number=?", [divisionRow?.division_code ?? '', jobExplanation, woNumber]);
      } else {
        await connection.execute('UPDATE tb_wo_mtc SET job_explanation=?, updated_at=NOW() WHERE wo_number=?', [jobExplanation, woNumber]);
      }
    });
  }

  const laborSaved = await saveLaborFromJobUpdate(woNumber, String(executor.job_executor), req.body);

  legacyOk(res, { labor_saved: laborSaved }, 'Job explanation saved successfully');
}));

mesoRouter.get('/meso/labor', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const jobExecutor = req.query.job_executor ? String(req.query.job_executor) : undefined;
  const where = jobExecutor ? 'WHERE wo_number=? AND job_executor=?' : 'WHERE wo_number=?';
  const params = jobExecutor ? [woNumber, jobExecutor] : [woNumber];
  legacyOk(res, await rows(`SELECT * FROM tb_detail_labor ${where} ORDER BY id_detail_labor ASC`, params));
}));

mesoRouter.post('/meso/labor', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const raw = req.body.trade;
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const trades = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
  if (!trades.length) throw new HttpError(400, 'PIC wajib dipilih');
  if (trades.length > 10) throw new HttpError(400, 'Maksimal 10 PIC');
  const men = req.body.men != null ? String(req.body.men) : null;
  const hours = req.body.hours != null ? String(req.body.hours) : null;
  const jobExecutor = String(user.division_code ?? '');

  await transaction(async (connection) => {
    for (const trade of trades) {
      await connection.execute('INSERT INTO tb_detail_labor (job_executor, wo_number, trade, men, hours, `for`) VALUES (?,?,?,?,?,?)', [jobExecutor, woNumber, trade, men, hours, 'MTC']);
    }
  });

  legacyOk(res, { inserted: trades.length }, 'Labor added successfully', 201);
}));

mesoRouter.delete('/meso/labor', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  const woNumber = req.query.wo_number ?? req.body.wo_number;
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  await execute('DELETE FROM tb_detail_labor WHERE id_detail_labor=? AND wo_number=?', [id, woNumber]);
  legacyOk(res, null, 'Labor removed successfully');
}));

mesoRouter.post('/meso/update_executor', asyncHandler(async (req, res) => {
  const b = req.body;
  const id = b.id;
  const woNumber = String(b.wo_number ?? '');
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (['CLOSED', 'VOID', 'NEED_CLOSED'].includes(String(header.status))) throw new HttpError(409, 'WO sudah selesai dan tidak dapat diperbarui.');
  const fields: Record<string, unknown> = {};
  if (b.job_executor !== undefined) fields.job_executor = b.job_executor;
  if (b.status !== undefined) fields.status = b.status;
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No changes provided');
  await execute(`UPDATE tb_job_executor SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id=? AND wo_number=?`, [...keys.map((k) => fields[k]), id, woNumber] as never);
  legacyOk(res, { id }, 'Executor updated successfully');
}));

mesoRouter.delete('/meso/delete_executor', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  if (!id) throw new HttpError(400, 'id is required');
  await execute('DELETE FROM tb_job_executor WHERE id=?', [id]);
  legacyOk(res, null, 'Executor removed successfully');
}));

mesoRouter.post('/meso/reject', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_mtc SET status='REJECT' WHERE wo_number=?", [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'REJECT' }, 'WO rejected successfully');
}));

mesoRouter.get('/meso/material', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await rows('SELECT * FROM tb_detail_material WHERE wo_number=? ORDER BY id_detail_material ASC', [woNumber]));
}));

mesoRouter.post('/meso/material', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const material = String(req.body.material ?? req.body.material_name ?? '');
  const qty = Number(req.body.qty ?? req.body.quantity ?? 0);
  const unit = req.body.unit != null ? String(req.body.unit) : 'PCS';
  const pr = req.body.pr != null ? String(req.body.pr) : null;
  if (!woNumber || !material || qty <= 0) throw new HttpError(400, 'wo_number, material and qty are required');
  const jobExecutor = String(user.division_code ?? '');

  const existing = await one<{ id_detail_material: number; qty: number }>(
    "SELECT id_detail_material, qty FROM tb_detail_material WHERE wo_number=? AND material=? AND job_executor=? AND `for`='MTC'",
    [woNumber, material, jobExecutor],
  );
  if (existing) {
    await execute('UPDATE tb_detail_material SET qty=?, unit=?, pr=? WHERE id_detail_material=?', [Number(existing.qty) + qty, unit, pr, existing.id_detail_material]);
  } else {
    await execute('INSERT INTO tb_detail_material (job_executor, wo_number, pr, material, qty, unit, `for`) VALUES (?,?,?,?,?,?,?)', [jobExecutor, woNumber, pr, material, qty, unit, 'MTC']);
  }

  await syncMaterialRequestFromMobile(woNumber, material, qty, unit, jobExecutor, user);
  legacyOk(res, null, 'Material added successfully', 201);
}));

mesoRouter.delete('/meso/material', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  const woNumber = req.query.wo_number ?? req.body.wo_number;
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  await execute('DELETE FROM tb_detail_material WHERE id_detail_material=? AND wo_number=?', [id, woNumber]);
  legacyOk(res, null, 'Material removed successfully');
}));

mesoRouter.get('/meso/approval', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await rows('SELECT * FROM tb_approval WHERE wo_number=? ORDER BY created_at ASC', [woNumber]));
}));

interface MaterialRequestRow { part: string; qty: number; level: string; uom: string }

function normalizeMaterialRequestRows(raw: unknown): MaterialRequestRow[] {
  let list: unknown[] = [];
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { list = []; } }
  else if (Array.isArray(raw)) list = raw;
  const merged = new Map<string, MaterialRequestRow>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const part = String(record.part ?? record.material ?? '').trim();
    const qty = Number(record.material_request ?? record.qty ?? 0);
    if (!part || qty <= 0) continue;
    const level = String(record.level ?? 'mobile_request');
    const uom = String(record.uom ?? record.uom_request ?? 'PCS');
    const key = `${level}|${part}|${uom}`.toUpperCase();
    const existing = merged.get(key);
    if (existing) existing.qty += qty; else merged.set(key, { part, qty, level, uom });
  }
  return [...merged.values()];
}

async function requestMaterialBatch(woNumber: string, divisionCode: string, user: User, normalized: MaterialRequestRow[]): Promise<void> {
  if (!normalized.length) return;

  const existingUsage = await one<{ id: number; request_code: string }>(
    "SELECT id, request_code FROM tb_material_usage WHERE wo_number=? AND job_executor=? AND status='OPEN' ORDER BY id DESC LIMIT 1",
    [woNumber, divisionCode],
  );

  if (existingUsage) {
    const signature = JSON.stringify(normalized.map((r) => [r.level, r.part, r.uom, r.qty]).sort());
    const existingRows = await rows<Record<string, unknown>>(
      'SELECT level, part, uom_request, material_request FROM tb_material_request WHERE wo_number=? AND request_code=? ORDER BY id ASC',
      [woNumber, existingUsage.request_code],
    );
    const existingSignature = JSON.stringify(existingRows.map((r) => [r.level, r.part, r.uom_request, Number(r.material_request)]).sort());
    if (signature === existingSignature) return;
  }

  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);
  const requestCode = randomCode(10);

  await transaction(async (connection) => {
    await connection.execute(
      'INSERT INTO tb_material_usage (wo_number, date, id_equipment, company, job_title, type_wo, id_division, job_executor, status, request_code, created_at) VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,NOW())',
      [woNumber, header.id_equipment, header.company, header.job_title, header.type_wo, header.id_division, divisionCode, 'OPEN', requestCode] as never,
    );
    await connection.execute("UPDATE tb_wo_mtc SET status='WAITING_PARTS', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=? AND job_executor=?", [woNumber, divisionCode]);
    await connection.execute('INSERT INTO tb_approval (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, 'Excecutor Request Material.']);
    for (const row of normalized) {
      await connection.execute('INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date) VALUES (?,?,?,?,?,?,?,NOW())',
        [woNumber, row.level, row.part, String(row.qty), row.uom, divisionCode, requestCode]);
    }
  });
}

mesoRouter.post('/meso/material_request', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const normalized = normalizeMaterialRequestRows(req.body.materials);
  if (!normalized.length) throw new HttpError(400, 'No valid material request items were provided');

  await requestMaterialBatch(woNumber, String(user.division_code ?? ''), user, normalized);
  legacyOk(res, { wo_number: woNumber }, 'Material request submitted');
}));

mesoRouter.get('/meso/material_received', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await rows('SELECT * FROM tb_material_request WHERE wo_number=? ORDER BY date ASC', [woNumber]));
}));

mesoRouter.get('/meso/material_purchase', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await rows("SELECT * FROM tb_material_request WHERE wo_number=? AND level='others' ORDER BY date ASC", [woNumber]));
}));

const SUB_WO_TARGETS: Record<string, { prefix: string; table: string; executor: string; status: string; pic: string }> = {
  GA: { prefix: 'WOGA', table: 'tb_wo_ga', executor: 'HRGA', status: 'WAIT_KA_DIV_HRGA', pic: 'HRGA' },
  IT: { prefix: 'WOIT', table: 'tb_wo_it', executor: 'ITS', status: 'WAIT_KA_DIV_ITIS', pic: 'ITS' },
  MTC: { prefix: 'WOPR', table: 'tb_wo_mtc_operational', executor: 'MTC', status: 'WAIT_KA_DIV_MTC', pic: 'MTC' },
};

mesoRouter.post('/meso/sub_wo', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const subto = String(req.body.subto ?? '').toUpperCase();
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const target = SUB_WO_TARGETS[subto];
  if (!target) throw new HttpError(400, 'Invalid subto');

  const original = await one<Record<string, unknown>>(
    'SELECT w.*, d.division_code FROM tb_wo_mtc w LEFT JOIN tb_division d ON d.id_division=w.id_division WHERE w.wo_number=?',
    [woNumber],
  );
  if (!original) throw new HttpError(404, 'Work Order not found');

  const now = new Date();
  const base = `${target.prefix}-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/SUB/${original.division_code ?? ''}`;
  const seqRow = await one<{ seq: number | null }>(`SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM \`${target.table}\` WHERE wo_number LIKE ?`, [`${base}/%`]);
  const subWoNumber = `${base}/${String(Number(seqRow?.seq ?? 0) + 1).padStart(4, '0')}`;

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO \`${target.table}\` (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment, job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
       VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [subWoNumber, original.company, original.shift, original.type_wo, original.priority, original.id_division, original.id_equipment,
        original.job_title, original.running_hours, original.job_requirement, original.attachment, target.executor, target.status, target.pic, user.fullname] as never,
    );
    await connection.execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [target.executor, subWoNumber, '', 'WAITING']);
  });

  legacyOk(res, { sub_wo_number: subWoNumber }, 'Sub Work Order created successfully', 201);
}));

mesoRouter.get('/meso/part_execution', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getWoDetail(woNumber, user);
  if (!header) throw new HttpError(404, 'Work Order not found or access denied');
  if (!isPreventiveType(header.type_wo)) { legacyOk(res, [], 'WO is not preventive'); return; }
  legacyOk(res, await getMtcPartExecution(woNumber, String(header.AssetCode ?? '')));
}));

mesoRouter.post('/meso/part_execution', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_executor ?? 0) !== 1) throw new HttpError(403, 'WO Executor permission is required');
  const woNumber = String(req.body.wo_number ?? '');
  let rowsInput = req.body.rows;
  if (typeof rowsInput === 'string') { try { rowsInput = JSON.parse(rowsInput); } catch { rowsInput = null; } }
  if (!woNumber || !Array.isArray(rowsInput)) throw new HttpError(400, 'wo_number and rows are required');

  const header = await getWoDetail(woNumber, user);
  if (!header) throw new HttpError(404, 'Work Order not found or access denied');
  if (!isPreventiveType(header.type_wo)) throw new HttpError(400, 'WO is not preventive');

  const assetCode = String(header.AssetCode ?? '');
  const definitions = await getPreventivePartDefinitions(woNumber, assetCode);
  const whitelist = new Map(definitions.map((d) => [partKey(d.custom_detail_id, d.part_mesin), d]));
  const requestRows: Record<string, unknown>[] = [];

  await transaction(async (connection) => {
    for (const row of rowsInput as Record<string, unknown>[]) {
      const customDetailId = Number(row.custom_detail_id ?? 0);
      const partMesin = String(row.part_mesin ?? '');
      const key = partKey(customDetailId, partMesin);
      const definition = whitelist.get(key);
      if (!definition) continue;

      const statusInput = String(row.maintenance_status ?? '').trim().toUpperCase();
      const maintenanceStatus = statusInput === 'DONE' ? 'DONE' : 'PENDING';
      const requestQty = Math.max(0, Number(row.request_qty ?? 0));
      const requestPart = String(row.request_part ?? '').trim() || definition.part_mesin;
      const requestUom = String(row.request_uom ?? 'PCS');
      const keterangan = String(row.keterangan ?? '');
      const updatedBy = String(user.fullname ?? '');

      const existing = customDetailId > 0
        ? await one<{ id: number }>('SELECT id FROM tb_wo_mtc_part_execution WHERE wo_number=? AND custom_detail_id=?', [woNumber, customDetailId])
        : await one<{ id: number }>('SELECT id FROM tb_wo_mtc_part_execution WHERE wo_number=? AND part_mesin=? AND custom_detail_id IS NULL', [woNumber, definition.part_mesin]);

      if (existing) {
        await connection.execute(
          'UPDATE tb_wo_mtc_part_execution SET bagian_mesin=?, maintenance_status=?, request_qty=?, request_part=?, request_uom=?, keterangan=?, updated_by=?, updated_at=NOW() WHERE id=?',
          [definition.bagian_mesin, maintenanceStatus, requestQty, requestPart, requestUom, keterangan, updatedBy, existing.id],
        );
      } else {
        await connection.execute(
          'INSERT INTO tb_wo_mtc_part_execution (wo_number, custom_detail_id, part_mesin, bagian_mesin, maintenance_status, request_qty, request_part, request_uom, keterangan, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
          [woNumber, customDetailId || null, definition.part_mesin, definition.bagian_mesin, maintenanceStatus, requestQty, requestPart, requestUom, keterangan, updatedBy],
        );
      }

      if (requestQty > 0 && requestPart) requestRows.push({ level: 'part_execution', part: requestPart, material_request: requestQty, uom: requestUom });
    }
  });

  if (requestRows.length) {
    const normalized = normalizeMaterialRequestRows(requestRows);
    await requestMaterialBatch(woNumber, String(user.division_code ?? ''), user, normalized);
  }

  legacyOk(res, null, 'Part execution updated');
}));

mesoRouter.post('/meso/part_execution_media', partExecutionMediaUpload.single('media'), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_executor ?? 0) !== 1) throw new HttpError(403, 'WO Executor permission is required');
  const woNumber = String(req.body.wo_number ?? '');
  const customDetailId = Number(req.body.custom_detail_id ?? 0);
  const partMesin = String(req.body.part_mesin ?? '');
  if (!woNumber || (customDetailId <= 0 && !partMesin) || !req.file) throw new HttpError(400, 'wo_number, part reference and media file are required');

  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  const mediaType = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) ? 'video' : 'image';
  const relativePath = await saveUploadedFile(req.file.buffer, 'wo_mtc_part_execution', req.file.originalname, req.file.mimetype);

  const result = await execute(
    'INSERT INTO tb_wo_mtc_part_execution_media (wo_number, custom_detail_id, part_mesin, media_type, media_name, media_path, created_by, created_at) VALUES (?,?,?,?,?,?,?,NOW())',
    [woNumber, customDetailId || null, partMesin || null, mediaType, req.file.originalname, relativePath, String(user.fullname ?? '')],
  );

  legacyOk(res, { id: result.insertId, url: `/uploads/${relativePath}`, name: req.file.originalname, media_type: mediaType }, 'Media uploaded', 201);
}));
