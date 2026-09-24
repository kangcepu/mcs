import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, legacyOk } from '../http.js';
import { syncDailyControlForWoUpdate } from '../lib/daily-control.js';
import { saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest, User } from '../types.js';

export const productionRouter = Router();

const DOCS_DIR = path.join(config.uploadDir, 'wo_production');
fs.mkdirSync(DOCS_DIR, { recursive: true });

function extensionFilter(allowed: string[]) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, allowed.includes(ext));
  };
}

const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'pdf']) });
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

async function insertApprovalPreventive(woNumber: string, person: ReturnType<typeof personPayload>, comment: string): Promise<void> {
  await execute(
    'INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment],
  );
}

async function approveWithoutStatus(woNumber: string, person: ReturnType<typeof personPayload>, comment: string): Promise<void> {
  await insertApprovalPreventive(woNumber, person, comment);
  await execute("UPDATE tb_wo_preventive SET status='IN_PROGRESS_EXECUTOR', updated_at=NOW() WHERE wo_number=?", [woNumber]);
  const firstExecutor = await one<{ id: number; job_executor: string; status: string }>(
    'SELECT id, job_executor, status FROM tb_job_executor WHERE wo_number=? ORDER BY id ASC LIMIT 1', [woNumber],
  );
  if (firstExecutor && String(firstExecutor.status) === 'IN_PROGRESS') {
    await execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())',
      [firstExecutor.job_executor, woNumber, comment, 'ADDITIONAL']);
  }
}

let mtcDivisionIdCache: string | null = null;
async function getMtcDivisionId(): Promise<string> {
  if (mtcDivisionIdCache) return mtcDivisionIdCache;
  const row = await one<{ id_division: string }>("SELECT id_division FROM tb_division WHERE division_code='MTC' LIMIT 1", []);
  mtcDivisionIdCache = String(row?.id_division ?? '15');
  return mtcDivisionIdCache;
}

function visibilityScope(user: User, tableAlias: string, mtcDivisionId: string): { sql: string; params: unknown[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const position = String(user.id_position ?? '').toUpperCase();
  if (crossAccess || !position) return { sql: '', params: [] };
  if (position === 'EXECUTOR_ADMIN' || position === 'EXECUTOR_HEAD') {
    return { sql: `${prefix}job_executor LIKE ?`, params: [`%${user.division_code ?? ''}%`] };
  }
  if (position === 'ADMIN_DIVISI' || position === 'DIVHEAD' || position === 'DEPTHEAD') {
    if (String(user.id_division ?? '') === mtcDivisionId) return { sql: '', params: [] };
    if (position === 'ADMIN_DIVISI') return { sql: `${prefix}id_division = ?`, params: [user.id_division] };
    return { sql: `(${prefix}job_executor LIKE ? OR ${prefix}id_division = ?)`, params: [`%${user.division_code ?? ''}%`, user.id_division] };
  }
  return { sql: '', params: [] };
}

async function generateWoNumber(divisionCode: string): Promise<string> {
  const now = new Date();
  const base = `PREV-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
  const row = await one<{ seq: number | null }>('SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM tb_wo_preventive WHERE wo_number LIKE ?', [`${base}/%`]);
  const next = Number(row?.seq ?? 0) + 1;
  return `${base}/${String(next).padStart(4, '0')}`;
}

async function getHeader(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>('SELECT * FROM tb_wo_preventive WHERE wo_number=?', [woNumber]);
}

const TYPE_WO_ALIASES: Record<string, string[]> = {
  preventive: ['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'],
  corrective: ['CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'],
  project: ['PROJECT'],
};

function normalizeTypeWo(value: unknown): string {
  const upper = String(value ?? '').toUpperCase();
  for (const [canonical, aliases] of Object.entries(TYPE_WO_ALIASES)) {
    if (aliases.includes(upper)) return canonical;
  }
  return String(value ?? '').toLowerCase();
}

async function getServicePhotos(woNumber: string): Promise<Record<string, unknown>[]> {
  const evidenceRows = await rows<Record<string, unknown>>('SELECT file_name, file_path, created_at FROM tb_wo_service_evidence WHERE wo_number=? ORDER BY created_at DESC', [woNumber]);
  return evidenceRows.map((r) => ({ name: r.file_name, path: r.file_path, url: `/uploads/${String(r.file_path)}`, created_at: r.created_at }));
}

async function getExecutors(woNumber: string): Promise<Record<string, unknown>[]> {
  return rows<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE wo_number=?', [woNumber]);
}

async function getExecutorByDivision(woNumber: string, divisionCode: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE wo_number=? AND job_executor=? ORDER BY id ASC LIMIT 1', [woNumber, divisionCode]);
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
    saved.push(await saveUploadedFile(Buffer.from(raw, 'base64'), 'wo_production', safeName, contentType));
  }
  return saved;
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
      await connection.execute("UPDATE tb_wo_preventive SET status='WAITING_PARTS', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
      await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=?", [woNumber]);
      await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
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

productionRouter.use('/production', authenticate, (req, res, next) => {
  if (req.method === 'GET') return next();
  const user = (req as AuthRequest).user!;
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const nativeAccess = Number(user.wo_preventive ?? 0) === 1;
  if (crossAccess && !nativeAccess) throw new HttpError(403, 'Cross WO Access is read-only');
  next();
});

// Samakan sama daftar exclude di maintenance/meso/is/ga — sebelumnya cuma
// exclude 'CLOSED', jadi WO VOID/REJECT/COMPLETE_EXECUTOR nyampah di list
// "aktif". `DECLINE` gak pernah beneran kesimpen, status tolak asli 'REJECT'.
const LIST_EXCLUDED_STATUSES = ['CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'COMPLETE EXECUTOR', 'NEED_CLOSED', 'VOID', 'DECLINE', 'REJECT'];

productionRouter.get('/production/list', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const mtcDivisionId = await getMtcDivisionId();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const typeWoFilter = req.query.type_wo ? normalizeTypeWo(String(req.query.type_wo)) : undefined;

  const scope = visibilityScope(user, 'w', mtcDivisionId);
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (scope.sql) { where += ` AND ${scope.sql}`; params.push(...scope.params); }
  // Exclusion cuma dipakai kalau user gak minta status spesifik, biar filter
  // status='VOID' misalnya gak jadi kontradiktif sama exclusion ini.
  if (status) { where += ' AND w.status = ?'; params.push(status); }
  else { where += ` AND w.status NOT IN (${LIST_EXCLUDED_STATUSES.map(() => '?').join(',')})`; params.push(...LIST_EXCLUDED_STATUSES); }
  if (search) { where += ' AND (w.wo_number LIKE ? OR w.job_title LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ?)'; params.push(...Array(4).fill(`%${search}%`)); }
  if (typeWoFilter) {
    const aliases = TYPE_WO_ALIASES[typeWoFilter] ?? [typeWoFilter.toUpperCase()];
    where += ` AND UPPER(w.type_wo) IN (${aliases.map(() => '?').join(',')})`;
    params.push(...aliases);
  }

  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_preventive w LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}`, params);
  const items = (await rows<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetID, a.AssetCode, a.AssetName FROM tb_wo_preventive w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}
     ORDER BY w.date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )).map((row) => ({ ...row, type_wo: normalizeTypeWo(row.type_wo) }));

  const totalCount = Number(total?.total ?? 0);
  legacyOk(res, { total: totalCount, limit, offset, items }, 'Work Order list retrieved successfully');
}));

productionRouter.get('/production/my_wo', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 10)));

  const total = await one<{ total: number }>("SELECT COUNT(*) total FROM tb_wo_preventive WHERE status != 'CLOSED' AND creator=?", [user.fullname]);
  const items = await rows<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetID, a.AssetCode, a.AssetName FROM tb_wo_preventive w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment
     WHERE w.status != 'CLOSED' AND w.creator=? ORDER BY w.date DESC LIMIT ? OFFSET ?`,
    [user.fullname, limit, (page - 1) * limit],
  );
  const totalCount = Number(total?.total ?? 0);
  legacyOk(res, { items: items.map((row) => ({ ...row, type_wo: normalizeTypeWo(row.type_wo) })), pagination: { total: totalCount, page, limit, total_pages: Math.max(1, Math.ceil(totalCount / limit)) } }, 'My WO list retrieved');
}));

productionRouter.get('/production/detail', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await one<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetID, a.AssetCode, a.AssetName FROM tb_wo_preventive w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment WHERE w.wo_number=?`,
    [woNumber],
  );
  if (!header) throw new HttpError(404, 'Work Order not found');

  const [executors, labor, material, approvals, servicePhotos] = await Promise.all([
    getExecutors(woNumber),
    rows("SELECT * FROM tb_detail_labor WHERE wo_number=? AND `for`='MTC'", [woNumber]),
    rows('SELECT * FROM tb_material_request WHERE wo_number=?', [woNumber]),
    rows('SELECT * FROM tb_approval_preventive WHERE wo_number=?', [woNumber]),
    getServicePhotos(woNumber),
  ]);

  legacyOk(res, { wo_header: header, executors, labor, material, approvals, service_photos: servicePhotos }, 'Work Order retrieved successfully');
}));

productionRouter.get('/production/dashboard', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const mtcDivisionId = await getMtcDivisionId();
  const company = String(req.query.company ?? 'ALL');
  const startDate = req.query.start_date ? String(req.query.start_date) : '';
  const endDate = req.query.end_date ? String(req.query.end_date) : '';

  const buildWhere = (statuses: string[], dateColumn: string, closedDefault: boolean): { sql: string; params: unknown[] } => {
    let sql = `WHERE status IN (${statuses.map(() => '?').join(',')})`;
    const params: unknown[] = [...statuses];
    const effectiveStart = startDate || (closedDefault ? new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) : '');
    if (effectiveStart) { sql += ` AND ${dateColumn} >= ?`; params.push(effectiveStart); }
    if (endDate) { sql += ` AND ${dateColumn} <= ?`; params.push(endDate); }
    if (company !== 'ALL') { sql += ' AND company = ?'; params.push(company); }
    const scope = visibilityScope(user, '', mtcDivisionId);
    if (scope.sql) { sql += ` AND ${scope.sql}`; params.push(...scope.params); }
    return { sql, params };
  };

  const open = buildWhere(['WAIT_KA_DIV', 'WAIT_EXECUTOR_ADMIN'], 'date', false);
  const progress = buildWhere(['IN_PROGRESS_EXECUTOR', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'WAITING_PARTS', 'PARTS_RECEIVED'], 'date', false);
  const closed = buildWhere(['CLOSED'], 'closedDate', true);

  const [openCount, progressCount, closedCount] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_preventive ${open.sql}`, open.params),
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_preventive ${progress.sql}`, progress.params),
    one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_preventive ${closed.sql}`, closed.params),
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

productionRouter.get('/production/get_new', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const divisionCode = String(user.division_code ?? '');
  if (!divisionCode) throw new HttpError(400, 'Division code not found');
  legacyOk(res, { wo_number: await generateWoNumber(divisionCode) }, 'New WO number generated');
}));

productionRouter.get('/production/test_user', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  legacyOk(res, { id_user: user.id_user, fullname: user.fullname, id_position: user.id_position, id_division: user.id_division, division_code: user.division_code });
}));

productionRouter.post('/production/create', attachmentUpload.array('attachment', 10), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  if (!b.date || !b.company || !b.type_wo || !b.id_division || !b.id_equipment || !b.job_title) {
    throw new HttpError(400, 'Required fields: date, company, type_wo, id_division, id_equipment, job_title');
  }
  const division = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [b.id_division]);
  if (!division) throw new HttpError(404, 'Division not found');
  const creatorDivisionCode = String(user.division_code ?? division.division_code ?? '');

  const idEquipment = String(b.id_equipment).split('|')[0].trim() || null;
  const woNumber = b.wo_number ? String(b.wo_number) : await generateWoNumber(String(division.division_code ?? creatorDivisionCode));
  const uploaded = await Promise.all(((req.files as Express.Multer.File[] | undefined) ?? [])
    .map((f) => saveUploadedFile(f.buffer, 'wo_production', f.originalname, f.mimetype)));
  const base64Attachments = await decodeBase64Attachments(b.attachments, `${Date.now()}`);
  const attachment = [...uploaded, ...base64Attachments].join(',');

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO tb_wo_preventive (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment, job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [woNumber, b.date, b.company, b.shift ?? 'REGULAR', b.type_wo, b.priority ?? 'NORMAL', b.id_division, idEquipment, b.job_title,
        b.running_hours ?? '', b.job_requirement ?? '', attachment, creatorDivisionCode, 'WAIT_EXECUTOR_ADMIN', creatorDivisionCode, user.fullname ?? 'API User'] as never,
    );
    await connection.execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [creatorDivisionCode, woNumber, '', 'WAITING']);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order created successfully', 201);
}));

async function updateHandler(req: AuthRequest, res: import('express').Response): Promise<void> {
  const user = req.user!;
  const woNumber = String(req.query.wo_number ?? req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');

  const existingAttachments = String(header.attachment ?? '').split(',').filter(Boolean);
  const newAttachments = await decodeBase64Attachments(req.body.attachments, `${woNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`);
  const uploaded = await Promise.all(((req.files as Express.Multer.File[] | undefined) ?? [])
    .map((f) => saveUploadedFile(f.buffer, 'wo_production', f.originalname, f.mimetype)));

  const fields: Record<string, unknown> = {};
  for (const key of ['date', 'company', 'shift', 'type_wo', 'priority', 'job_title', 'running_hours', 'job_requirement']) {
    if (req.body[key] !== undefined && req.body[key] !== null && req.body[key] !== '') fields[key] = req.body[key];
  }
  if (req.body.id_equipment !== undefined && String(req.body.id_equipment).trim() !== '') fields.id_equipment = String(req.body.id_equipment).split('|')[0].trim() || null;
  if (req.body.job_executor !== undefined && req.body.job_executor !== '') fields.job_executor = req.body.job_executor;
  if (newAttachments.length || uploaded.length) fields.attachment = [...existingAttachments, ...uploaded, ...newAttachments].join(',');

  if (!Object.keys(fields).length) throw new HttpError(400, 'No data to update');

  const protectedStatuses = new Set(['CLOSED', 'VOID', 'WAITING_PARTS', 'PARTS_RECEIVED']);
  if (!protectedStatuses.has(String(header.status).toUpperCase())) fields.status = 'IN_PROGRESS_EXECUTOR';

  const keys = Object.keys(fields);
  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, user.fullname, user.avatar ?? 'avatar.png', user.id_division, user.id_position, 'Updated Work order']);
    await connection.execute(`UPDATE tb_wo_preventive SET ${keys.map((k) => `\`${k}\`=?`).join(',')}, updated_at=NOW() WHERE wo_number=?`, [...keys.map((k) => fields[k]), woNumber] as never);
  });

  const updated = await getHeader(woNumber);
  legacyOk(res, { wo_number: woNumber, updated_fields: keys, wo_detail: updated }, 'Work Order updated successfully');
}

productionRouter.put('/production/update', asyncHandler((req, res) => updateHandler(req as AuthRequest, res)));
productionRouter.post('/production/update', attachmentUpload.array('attachment', 10), asyncHandler((req, res) => updateHandler(req as AuthRequest, res)));

async function approveTransition(woNumber: string, person: ReturnType<typeof personPayload>, position: string, comment: string): Promise<string> {
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');

  let targetStatus: string;
  if (position === 'DIVHEAD') {
    if (!['NEED_CLOSED', 'WAIT_KA_DIV'].includes(String(header.status))) throw new HttpError(409, 'Work Order belum siap untuk ditutup');
    targetStatus = 'CLOSED';
  } else if (position === 'ADMIN_DIVISI') {
    targetStatus = 'WAIT_KA_DIV';
  } else {
    throw new HttpError(500, 'Failed to approve WO');
  }

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute('UPDATE tb_wo_preventive SET status=?, updated_at=NOW() WHERE wo_number=?', [targetStatus, woNumber]);
  });

  return targetStatus;
}

productionRouter.post('/production/approve', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const person = personPayload(user);
  const position = String(user.id_position ?? '').toUpperCase();
  const comment = String(req.body.comment ?? '');

  await approveTransition(woNumber, person, position, comment);
  legacyOk(res, { wo_number: woNumber }, 'WO approved successfully');
}));

productionRouter.post('/production/add_job_explanation', servicePhotoUpload.array('service_photos', 10), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const jobExplanation = String(b.job_explanation ?? '');
  if (!jobExplanation) throw new HttpError(400, 'job_explanation is required');
  const status = String(b.status ?? 'COMPLETE');

  let executor = b.id ? await one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE id=?', [b.id]) : null;
  if (!executor) {
    const woNumber = String(b.wo_number ?? '');
    if (!woNumber) throw new HttpError(400, 'wo_number is required');
    executor = await getExecutorByDivision(woNumber, String(user.division_code ?? ''));
  }
  if (!executor) throw new HttpError(404, 'Executor not found');
  const woNumber = String(executor.wo_number);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'At least one service photo is required');

  const uploaded = await Promise.all(files.map(async (file) => ({
    file, relativePath: await saveUploadedFile(file.buffer, 'wo_production', file.originalname, file.mimetype),
  })));

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 8);
  const startedPlanner = b.started_planner ? String(b.started_planner) : null;
  const finishedPlanner = b.finished_planner ? String(b.finished_planner) : null;
  const estimatePlanner = b.estimate_planner ? String(b.estimate_planner) : null;
  const startedActual = `${nowDate} ${b.started_actual_time ? String(b.started_actual_time) : nowTime}`;
  const finishedActual = `${nowDate} ${b.finished_actual_time ? String(b.finished_actual_time) : nowTime}`;

  await transaction(async (connection) => {
    await connection.execute(
      'UPDATE tb_wo_preventive SET started_planner=?, finished_planner=?, estimate_planner=?, started_actual=?, finished_actual=?, job_explanation=?, updated_at=NOW() WHERE wo_number=?',
      [startedPlanner, finishedPlanner, estimatePlanner, startedActual, finishedActual, jobExplanation, woNumber],
    );
    for (const { file, relativePath } of uploaded) {
      await connection.execute(
        'INSERT INTO tb_wo_service_evidence (wo_number, executor_id, module_code, file_name, file_path, file_ext, file_size_kb, mime_type, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
        [woNumber, executor!.id, 'PRODUCTION', file.originalname, relativePath, path.extname(file.originalname).slice(1), Math.round(file.size / 1024), file.mimetype, 'MOBILE', user.id_user] as never,
      );
    }
  });

  const header = await getHeader(woNumber);
  await syncDailyControlForWoUpdate({
    woNumber,
    company: String(header?.company ?? ''),
    idEquipment: header?.id_equipment,
    jobTitle: String(header?.job_title ?? ''),
    notes: jobExplanation,
    actorUserId: Number(user.id_user),
    actorFullname: String(user.fullname ?? ''),
    actorDivisionId: user.id_division ? Number(user.id_division) : null,
    jobExecutorCode: String(executor.job_executor ?? executor.pic ?? user.division_code ?? ''),
  });

  const person = personPayload(user);
  const position = String(user.id_position ?? '').toUpperCase();

  await execute('UPDATE tb_job_executor SET status=? WHERE id=?', [status, executor.id] as never);

  if (status === 'COMPLETE') {
    await execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [String(user.division_code ?? ''), woNumber, jobExplanation, 'ADDITIONAL']);

    if (normalizeTypeWo(header?.type_wo) === 'preventive') {
      await insertApprovalPreventive(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_preventive SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    } else if (position === 'DIVHEAD') {
      await insertApprovalPreventive(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_preventive SET status='WAIT_KA_DIV', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    } else if (position === 'ADMIN_DIVISI') {
      await insertApprovalPreventive(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_preventive SET status='WAIT_KA_DIV', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    }
  } else if (status === 'IN_PROGRESS') {
    await approveWithoutStatus(woNumber, person, jobExplanation);
  } else {
    const stillWaiting = await one<{ total: number }>("SELECT COUNT(*) total FROM tb_job_executor WHERE wo_number=? AND (status='WAITING' OR status='IN_PROGRESS')", [woNumber]);
    if (Number(stillWaiting?.total ?? 0) > 0) {
      await approveWithoutStatus(woNumber, person, jobExplanation);
    }
  }

  legacyOk(res, { wo_number: woNumber }, 'Job explanation updated');
}));

productionRouter.post('/production/add_labor', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  let executor = b.id ? await one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE id=?', [b.id]) : null;
  if (!executor) {
    const woNumber = String(b.wo_number ?? '');
    if (!woNumber) throw new HttpError(400, 'wo_number is required');
    executor = await getExecutorByDivision(woNumber, String(user.division_code ?? ''));
  }
  if (!executor) throw new HttpError(404, 'Executor not found');

  const raw = b.trade;
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const trades = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
  if (!trades.length) throw new HttpError(400, 'PIC wajib dipilih');
  if (trades.length > 10) throw new HttpError(400, 'Maksimal 10 PIC');
  const men = b.men != null ? String(b.men) : null;
  const hours = b.hours != null ? String(b.hours) : null;

  await transaction(async (connection) => {
    for (const trade of trades) {
      await connection.execute('INSERT INTO tb_detail_labor (job_executor, wo_number, trade, men, hours, `for`) VALUES (?,?,?,?,?,?)',
        [executor!.job_executor, executor!.wo_number, trade, men, hours, 'MTC'] as never);
    }
  });

  legacyOk(res, { inserted: trades.length }, 'Labor added', 201);
}));

const FINAL_STATUSES = new Set(['CLOSED', 'VOID', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'DECLINE', 'REJECT']);

productionRouter.post('/production/update_executor', asyncHandler(async (req, res) => {
  const b = req.body;
  const id = b.id;
  const woNumber = String(b.wo_number ?? '');
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (FINAL_STATUSES.has(String(header.status ?? '').toUpperCase().trim())) throw new HttpError(409, 'WO sudah selesai dan tidak dapat diperbarui.');
  const fields: Record<string, unknown> = {};
  if (b.job_executor !== undefined) fields.job_executor = b.job_executor;
  if (b.status !== undefined) fields.status = b.status;
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No changes provided');
  await execute(`UPDATE tb_job_executor SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id=? AND wo_number=?`, [...keys.map((k) => fields[k]), id, woNumber] as never);
  legacyOk(res, { id }, 'Executor updated successfully');
}));

productionRouter.delete('/production/delete_executor', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  if (!id) throw new HttpError(400, 'id is required');
  await execute('DELETE FROM tb_job_executor WHERE id=?', [id]);
  legacyOk(res, null, 'Executor removed successfully');
}));

productionRouter.post('/production/reject', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_preventive SET status='REJECT' WHERE wo_number=?", [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'REJECT' }, 'WO rejected successfully');
}));

productionRouter.post('/production/add_material', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const material = String(b.material ?? b.material_name ?? '');
  if (!material || (!b.wo_number && !b.id)) throw new HttpError(400, 'material and wo_number are required');

  let executor = b.id ? await one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE id=?', [b.id]) : null;
  if (!executor) executor = await getExecutorByDivision(String(b.wo_number), String(user.division_code ?? ''));
  if (!executor) throw new HttpError(404, 'Executor not found');

  const woNumber = String(executor.wo_number);
  const jobExecutor = String(executor.job_executor ?? user.division_code ?? '');
  const qty = Number(b.qty ?? b.quantity ?? 0);
  const unit = b.unit != null ? String(b.unit) : 'PCS';
  const pr = b.pr != null ? String(b.pr) : null;

  const existing = await one<{ id_detail_material: number; qty: number }>(
    "SELECT id_detail_material, qty FROM tb_detail_material WHERE wo_number=? AND material=? AND job_executor=? AND `for`='MTC' ORDER BY id_detail_material DESC LIMIT 1",
    [woNumber, material, jobExecutor],
  );
  let row: Record<string, unknown>;
  if (existing) {
    await execute('UPDATE tb_detail_material SET qty=?, unit=?, pr=? WHERE id_detail_material=?', [Number(existing.qty) + qty, unit, pr, existing.id_detail_material]);
    row = { id_detail_material: existing.id_detail_material, wo_number: woNumber, job_executor: jobExecutor, material, qty: Number(existing.qty) + qty, unit, pr };
  } else {
    const result = await execute('INSERT INTO tb_detail_material (job_executor, wo_number, pr, material, qty, unit, `for`) VALUES (?,?,?,?,?,?,?)', [jobExecutor, woNumber, pr, material, qty, unit, 'MTC']);
    row = { id_detail_material: result.insertId, wo_number: woNumber, job_executor: jobExecutor, material, qty, unit, pr };
  }

  await syncMaterialRequestFromMobile(woNumber, material, qty, unit, jobExecutor, user);
  legacyOk(res, row, 'Material added', 201);
}));

productionRouter.post('/production/complete', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Complete');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const person = personPayload(user);

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 8);
  const startedDate = req.body.started_actual ? String(req.body.started_actual) : nowDate;
  const startedTime = req.body.started_actual_time ? String(req.body.started_actual_time) : nowTime;
  const finishedDate = req.body.finished_actual ? String(req.body.finished_actual) : nowDate;
  const finishedTime = req.body.finished_actual_time ? String(req.body.finished_actual_time) : nowTime;

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_preventive SET started_actual=?, finished_actual=?, status='NEED_CLOSED', updated_at=NOW() WHERE wo_number=?",
      [`${startedDate} ${startedTime}`, `${finishedDate} ${finishedTime}`, woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'NEED_CLOSED' }, 'WO completed');
}));

productionRouter.post('/production/closed', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Closed');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (String(header.status) !== 'NEED_CLOSED') throw new HttpError(409, 'Work Order belum siap untuk ditutup');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_preventive SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'CLOSED' }, 'WO closed');
}));

productionRouter.post('/production/void', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1 && String(user.username).toUpperCase() !== 'SUPERUSER') throw new HttpError(403, 'You do not have permission to void this work order');
  const woNumber = String(req.body.wo_number ?? '');
  const reason = String(req.body.reason ?? '');
  if (!woNumber || !reason) throw new HttpError(400, 'wo_number and reason are required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute("UPDATE tb_wo_preventive SET status='VOID', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    await connection.execute('INSERT INTO tb_approval_preventive (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, reason]);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order voided successfully');
}));
