import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one } from '../db.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import {
  closedMaterialUsage,
  detailHold,
  detailPurchase,
  detailRequest,
  ensurePartRequestHeader,
  getMaterialUsageHeader,
  listMaterialUsage,
  markErpSyncPaused,
  materialHold,
  removeEmptyPartRequestHeader,
  searchErpParts,
  selectPartRequestItems,
  updateOpen,
  woInfo,
} from '../lib/material-usage.js';
import type { AuthRequest } from '../types.js';

export const materialRouter = Router();

const canManage = requirePermission('material_usage');

materialRouter.get('/material-usage/list', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page ?? 25)));
  const status = String(req.query.status ?? '').trim();
  const woNumber = String(req.query.wo_number ?? '').trim();
  const q = String(req.query.q ?? '').trim();

  const { items, total } = await listMaterialUsage({ page, perPage, status, woNumber, q });
  ok(res, items, 'OK', { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
}));

materialRouter.post('/material-usage/request', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const wo = String(req.body.wo_number ?? '').trim();
  const executor = String(req.body.job_executor ?? '').trim();
  const note = String(req.body.note ?? '').trim();
  if (!wo) throw new HttpError(422, 'wo_number wajib diisi.', 'MU_WO_REQUIRED');

  let existingQuery = "SELECT id FROM tb_material_part_request WHERE wo_number=? AND status='PENDING'";
  const params: unknown[] = [wo];
  if (executor !== '') { existingQuery += ' AND job_executor=?'; params.push(executor); }
  else { existingQuery += " AND (job_executor IS NULL OR job_executor='')"; }
  if (await one(existingQuery, params)) throw new HttpError(409, 'Masih ada request part PENDING untuk WO ini.', 'MU_REQUEST_EXISTS');

  const name = String(user.fullname ?? 'User').trim();
  const insert = await execute(
    `INSERT INTO tb_material_part_request (wo_number, job_executor, requested_by, requested_by_name, request_note, status, erp_status, created_at)
     VALUES (?,?,?,?,?,'PENDING','PENDING',NOW())`,
    [wo, executor !== '' ? executor : null, user.id_user, name, note !== '' ? note : null],
  );
  await ensurePartRequestHeader(wo, executor);
  ok(res, { id: insert.insertId, wo_number: wo, status: 'PENDING' }, 'Request part berhasil dikirim');
}));

materialRouter.delete('/material-usage/cancel', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.query.id ?? req.body.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id wajib diisi.', 'MU_ID_REQUIRED');

  const request = await one<Record<string, unknown>>('SELECT * FROM tb_material_part_request WHERE id=?', [id]);
  if (!request) throw new HttpError(404, 'Request tidak ditemukan.', 'MU_NOT_FOUND');
  if (String(request.status ?? '') !== 'PENDING') throw new HttpError(409, 'Hanya request PENDING yang dapat dibatalkan.', 'MU_CANCEL_STATUS');
  if (Number(request.requested_by ?? 0) !== Number(user.id_user ?? 0)) throw new HttpError(403, 'Anda tidak dapat membatalkan request ini.', 'MU_CANCEL_DENIED');

  await execute("UPDATE tb_material_part_request SET status='CANCELLED' WHERE id=?", [id]);
  await removeEmptyPartRequestHeader(String(request.wo_number ?? ''), String(request.job_executor ?? ''));
  ok(res, { id, status: 'CANCELLED' }, 'Request berhasil dibatalkan');
}));

materialRouter.post('/material-usage/trigger_erp', authenticate, canManage, asyncHandler(async (req, res) => {
  const id = Number(req.body.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id wajib diisi.', 'MU_ID_REQUIRED');
  const request = await one<Record<string, unknown>>('SELECT * FROM tb_material_part_request WHERE id=?', [id]);
  if (!request) throw new HttpError(404, 'Request tidak ditemukan.', 'MU_NOT_FOUND');
  ok(res, { id, status: String(request.status ?? ''), note: 'ERP mengikuti proses Simpan Pemakaian Material.' }, 'Tidak ada trigger ERP terpisah pada alur Material Usage');
}));

materialRouter.get('/material-usage/detail', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.query.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'MU_ID_REQUIRED');

  let usage = await one<Record<string, unknown>>('SELECT * FROM tb_material_usage WHERE id=?', [id]);
  let req_: Record<string, unknown> | null = null;
  if (!usage) req_ = await one<Record<string, unknown>>('SELECT * FROM tb_material_part_request WHERE id=?', [id]);
  if (!usage && !req_) throw new HttpError(404, 'Request tidak ditemukan.', 'MU_NOT_FOUND');

  const wo = String(usage?.wo_number ?? req_?.wo_number ?? '').trim();
  const exec = String(usage?.job_executor ?? req_?.job_executor ?? '').trim() || '-';

  if (usage) {
    const legacyHeader = await getMaterialUsageHeader(Number(usage.id), exec);
    if (legacyHeader) usage = legacyHeader;
  }
  const wo_ = await woInfo(wo);

  if (!usage) {
    usage = await one<Record<string, unknown>>('SELECT * FROM tb_material_usage WHERE wo_number=? AND job_executor=? ORDER BY id DESC LIMIT 1', [wo, exec]);
  }
  if (!req_) {
    let q = 'SELECT * FROM tb_material_part_request WHERE wo_number=?';
    const params: unknown[] = [wo];
    if (exec !== '' && exec !== '-') { q += ' AND job_executor=?'; params.push(exec); }
    q += ' ORDER BY id DESC LIMIT 1';
    req_ = await one<Record<string, unknown>>(q, params) ?? {};
  }
  req_ = req_ ?? {};
  const requestCode = String(usage?.request_code ?? req_.request_code ?? '').trim();

  let parts: Record<string, unknown>[] = [];
  let purchase: Record<string, unknown>[] = [];
  let hold: Record<string, unknown>[] = [];
  if (requestCode) {
    parts = await detailRequest(wo, exec, requestCode).catch(() => []);
    purchase = await detailPurchase(wo, exec, requestCode).catch(() => []);
    hold = await detailHold(wo, requestCode, exec).catch(() => []);
  }

  ok(res, {
    request: req_,
    wo: wo_,
    usage_header: usage ?? null,
    request_code: requestCode,
    wo_number: wo,
    job_executor: exec,
    parts,
    purchase,
    hold: hold.length ? hold : null,
  });
}));

materialRouter.get('/material-usage/erp-parts', authenticate, canManage, asyncHandler(async (req, res) => {
  const company = String(req.query.company ?? '').trim();
  const q = String(req.query.q ?? req.query.term ?? '').trim();
  if (q.length < 2) { ok(res, []); return; }
  ok(res, await searchErpParts(company, q));
}));

materialRouter.post('/material-usage/select-parts', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.body.id ?? 0);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (id <= 0 || !items.length) throw new HttpError(422, 'id dan items wajib diisi.', 'MU_SELECT_INPUT');

  let partRequestId = id;
  const usage = await one<{ wo_number: string; job_executor: string }>('SELECT wo_number, job_executor FROM tb_material_usage WHERE id=?', [id]);
  if (usage) {
    const executor = String(usage.job_executor ?? '').trim();
    let q = "SELECT id FROM tb_material_part_request WHERE wo_number=? AND status='PENDING'";
    const params: unknown[] = [usage.wo_number];
    if (executor !== '' && executor !== '-') { q += ' AND job_executor=?'; params.push(executor); }
    else { q += " AND (job_executor IS NULL OR job_executor='')"; }
    q += ' ORDER BY id DESC LIMIT 1';
    const partRequest = await one<{ id: number }>(q, params);
    if (!partRequest) throw new HttpError(409, 'Request part PENDING untuk Material Usage ini tidak ditemukan.', 'MU_PENDING_REQUEST_MISSING');
    partRequestId = partRequest.id;
  }

  const result = await selectPartRequestItems(partRequestId, items, user.id_user, String(user.fullname ?? user.username ?? 'Material User'));
  if (!result.success) throw new HttpError(409, result.message ?? 'Gagal memilih part.', 'MU_SELECT_FAILED');
  ok(res, { request_code: result.request_code ?? null, part_request_id: partRequestId }, 'Part berhasil dipilih');
}));

materialRouter.post('/material-usage/set-usage', authenticate, canManage, asyncHandler(async (req, res) => {
  const wo = String(req.body.wo_number ?? '').trim();
  const exec = String(req.body.job_executor ?? '').trim() || '-';
  const rc = String(req.body.request_code ?? '').trim();
  const bodyRows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!wo || !rc || !bodyRows.length) throw new HttpError(422, 'wo_number, request_code, dan rows wajib diisi.', 'MU_USAGE_INPUT');

  const nested = bodyRows
    .filter((r: unknown) => r && typeof r === 'object')
    .map((r: Record<string, unknown>) => ({
      id_material_usage: Number(r.id ?? r.id_material_usage ?? 0),
      material_usage: Number(r.material_usage ?? 0),
      uom: String(r.uom ?? 'PCS'),
    }));

  await updateOpen({ wo_number: wo, job_executor: exec, request_code: rc, NestedRows: nested });

  const usage = await one<{ company: string }>('SELECT company FROM tb_material_usage WHERE request_code=? ORDER BY id DESC LIMIT 1', [rc]);
  const isGsu = String(usage?.company ?? '').trim().toUpperCase() === 'GSU';
  if (isGsu) await markErpSyncPaused(rc, 'Sinkronisasi Ascend dipause sementara; Material Usage tersimpan di MCS.');

  ok(res, { request_code: rc, erp_sync: isGsu ? 'PAUSED' : null }, isGsu
    ? 'Material Usage tersimpan di MCS. Sinkronisasi Ascend masih dipause.'
    : 'Pemakaian material disimpan');
}));

materialRouter.post('/material-usage/hold', authenticate, canManage, asyncHandler(async (req, res) => {
  const rowId = Number(req.body.id ?? 0);
  const qty = Number(req.body.hold_qty ?? 0);
  const remarks = String(req.body.remarks ?? '').trim();
  if (rowId <= 0 || qty <= 0) throw new HttpError(422, 'id dan hold_qty (> 0) wajib diisi.', 'MU_HOLD_INPUT');

  await materialHold({ id: rowId, hold_qty: qty, remarks });
  ok(res, { id: rowId }, 'Part berhasil ditahan (hold)');
}));

materialRouter.post('/material-usage/confirm', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const wo = String(req.body.wo_number ?? '').trim();
  const exec = String(req.body.job_executor ?? '').trim() || '-';
  const rc = String(req.body.request_code ?? '').trim();
  if (!wo || !rc) throw new HttpError(422, 'wo_number dan request_code wajib diisi.', 'MU_CONFIRM_INPUT');

  const purchaseRows = Array.isArray(req.body.purchase_rows) ? req.body.purchase_rows : [];
  const nested = purchaseRows
    .filter((r: unknown) => r && typeof r === 'object')
    .map((r: Record<string, unknown>) => ({
      part_prc: String(r.part_prc ?? r.part ?? ''),
      material_usage_prc: Number(r.material_usage_prc ?? 0),
      material_receive_prc: Number(r.material_receive_prc ?? r.material_receive ?? 0),
      uom_prc: String(r.uom_prc ?? r.uom ?? 'PCS'),
    }));

  const result = await closedMaterialUsage(
    { wo_number: wo, job_executor: exec, request_code: rc, NestedRows: nested },
    { fullname: String(user.fullname ?? ''), id_division: user.id_division ?? null, id_position: String(user.id_position ?? '') },
  );
  if (!result.status) throw new HttpError(422, result.message, 'MU_CONFIRM_FAILED');
  ok(res, { request_code: rc }, result.already_closed ? result.message : 'Material usage dikonfirmasi');
}));
