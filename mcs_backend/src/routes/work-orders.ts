import { resolveAssetAttachmentUrl } from '../lib/asset-attachments.js';
import { Router } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import { resolveCompanyCode } from '../lib/employee-api.js';
import { getMaintenancePreventiveParts, getMesoPreventiveParts, saveMaintenancePreventiveParts, saveMesoPreventiveParts } from '../lib/preventive-parts.js';
import { isPendingWoApproval, isPendingWoClosing } from '../lib/approval-center.js';
import type { AuthRequest, User } from '../types.js';

export const workOrderRouter = Router();
type Domain = 'is' | 'ga' | 'meso' | 'maintenance' | 'production';
const domains: Record<Domain, { table: string; approval: string; prefix: string; permission: string; executor: string }> = {
  is: { table: 'tb_wo_it', approval: 'tb_approval_it', prefix: 'WOIT', permission: 'wo_it', executor: 'ITS' },
  ga: { table: 'tb_wo_ga', approval: 'tb_approval_ga', prefix: 'WOGA', permission: 'wo_ga', executor: 'HRGA' },
  meso: { table: 'tb_wo_mtc', approval: 'tb_approval', prefix: 'WO', permission: 'wo_mtc', executor: 'MESO' },
  maintenance: { table: 'tb_wo_mtc_operational', approval: 'tb_approval_operational', prefix: 'WOPR', permission: 'wo_operational', executor: 'MTC' },
  production: { table: 'tb_wo_preventive', approval: 'tb_approval_preventive', prefix: 'PREV', permission: 'wo_preventive', executor: '' },
};
const domainOf = (value: string): Domain => { if (!(value in domains)) throw new HttpError(404, 'Unknown work order domain'); return value as Domain; };
const terminal = new Set(['CLOSED', 'VOID', 'REJECT', 'DECLINE']);
const permissive = (user: User, permission: string): boolean => String(user.username).toUpperCase() === 'SUPERUSER' || Number(user[permission] ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;
const executorFor = (domain: Domain, user: User): string => domains[domain].executor || String(user.division_code ?? user.id_division ?? '');
const executorCodeToDomain: Record<string, Domain> = { GA: 'ga', HRGA: 'ga', IT: 'is', ITS: 'is', MTC: 'maintenance', MESO: 'meso' };
const resolveTargetDomain = (value: string): Domain => domainOf(value in domains ? value : (executorCodeToDomain[value.toUpperCase()] ?? value));

async function nextNumber(connection: PoolConnection, domain: Domain, division: string): Promise<string> {
  const d = domains[domain]; const date = new Date(); const month = String(date.getMonth() + 1).padStart(2, '0'); const year = date.getFullYear(); const base = `${d.prefix}-${month}${year}/${division}`;
  const [query] = await connection.query('SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM ?? WHERE wo_number LIKE ?', [d.table, `${base}/%`]);
  const sequence = (query as Array<{ seq: number | null }>)[0]?.seq ?? 0;
  return `${base}/${String(Number(sequence) + 1).padStart(4, '0')}`;
}
async function header(domain: Domain, wo: string) { const d = domains[domain]; return one(`SELECT w.*, a.AssetCode, a.AssetName, d.division_name, d.division_code FROM \`${d.table}\` w LEFT JOIN asset a ON a.AssetID=w.id_equipment LEFT JOIN tb_division d ON d.id_division=w.id_division WHERE w.wo_number=?`, [wo]); }
async function resolveAssetId(body: Record<string, unknown>): Promise<number | null> {
  if (body.id_equipment !== undefined && body.id_equipment !== null && String(body.id_equipment) !== '') return Number(body.id_equipment);
  const code = String(body.asset_code ?? '').trim();
  if (!code) return null;
  const asset = await one<{ AssetID: number }>('SELECT AssetID FROM asset WHERE AssetCode=? LIMIT 1', [code]);
  return asset ? Number(asset.AssetID) : null;
}
async function approval(connection: PoolConnection, table: string, wo: string, user: User, comment: string) { await connection.execute(`INSERT INTO \`${table}\` (wo_number,fullname,avatar,id_division,id_position,comment,created_at) VALUES (?,?,?,?,?,?,NOW())`, [wo, user.fullname, user.avatar ?? 'avatar.png', user.id_division, user.id_position, comment]); }

const WO_TYPE_OPTIONS = [
  { code: 'CORRECTIVE MAINTENANCE', label: 'Corrective Maintenance' },
  { code: 'PREVENTIVE MAINTENANCE', label: 'Preventive Maintenance' },
  { code: 'PROJECT', label: 'Project' },
];
const titleCase = (v: string): string => v.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const humanizeStatus = (v: string): string => titleCase(v.replace(/_/g, ' '));

/**
 * `type_wo` kesimpen dengan banyak varian penulisan buat konsep yang sama
 * ('preventive'/'PREVENTIVE'/'PREV MAINTENANCE', 'CORRECTIVE'/'CORRECTIVE
 * MAINTENANCE', dst — beda-beda tergantung jalur pembuatan WO-nya, sebagian
 * migrasi dari legacy). Filter dropdown cuma punya 3 nilai kanonik, jadi
 * exact-match gak akan ketemu apa-apa buat sebagian besar data.
 */
function normalizeTypeWo(raw: string): string {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return '';
  if (v.includes('PREVENTIVE') || v.startsWith('PREV')) return 'PREVENTIVE MAINTENANCE';
  if (v.includes('CORRECTIVE') || v === 'CM') return 'CORRECTIVE MAINTENANCE';
  if (v.includes('PROJECT')) return 'PROJECT';
  return v;
}
const TYPE_WO_VARIANTS: Record<string, string[]> = {
  'CORRECTIVE MAINTENANCE': ['CORRECTIVE MAINTENANCE', 'CORRECTIVE', 'CM'],
  'PREVENTIVE MAINTENANCE': ['PREVENTIVE MAINTENANCE', 'PREVENTIVE', 'preventive', 'PREV MAINTENANCE'],
  PROJECT: ['PROJECT', 'project'],
};
workOrderRouter.get('/work-orders/options', authenticate, asyncHandler(async (_req, res) => {
  const [priorityRows, shiftRows, statusRows, assets] = await Promise.all([
    rows<{ value: string }>('SELECT DISTINCT priority AS value FROM tb_wo_mtc_operational WHERE priority IS NOT NULL'),
    rows<{ value: string }>('SELECT DISTINCT shift AS value FROM tb_wo_mtc_operational WHERE shift IS NOT NULL'),
    // Filter status dipakai lintas semua domain (Maintenance/MESO/Production/
    // IS/GA) sekaligus, jadi daftar opsinya gabungan status nyata dari kelima
    // tabel WO — bukan cuma enum satu tabel — biar status yang cuma dipakai
    // domain tertentu (mis. WAITING_PARTS di MESO) tetap muncul di filter.
    rows<{ value: string }>(
      Object.values(domains).map((d) => `SELECT DISTINCT status AS value FROM \`${d.table}\` WHERE status IS NOT NULL`).join(' UNION '),
    ),
    rows('SELECT AssetID,AssetCode,AssetName FROM asset WHERE active="active" ORDER BY AssetName LIMIT 500'),
  ]);
  ok(res, {
    types: WO_TYPE_OPTIONS,
    priorities: priorityRows.map((r) => ({ code: r.value, label: titleCase(r.value) })),
    shifts: shiftRows.map((r) => ({ code: r.value, label: titleCase(r.value) })),
    statuses: statusRows
      .map((r) => ({ code: r.value, label: humanizeStatus(r.value) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    assets,
  });
}));
workOrderRouter.get('/work-orders', authenticate, asyncHandler(async (req, res) => {
  const domain = String(req.query.module ?? ''); const selected = (domain === 'all' || domain === '') ? Object.keys(domains) as Domain[] : [domainOf(domain)]; const user = (req as AuthRequest).user!;
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const typeWo = String(req.query.type_wo ?? '').trim();
  const company = String(req.query.company ?? '').trim();
  const assetId = String(req.query.asset_id ?? '').trim();
  const dateFrom = String(req.query.date_from ?? '').trim();
  const dateTo = String(req.query.date_to ?? '').trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page ?? req.query.limit ?? 50)));

  const buildWhere = (key: Domain): { where: string; params: unknown[] } => {
    let where = 'WHERE 1=1'; const params: unknown[] = [];
    if (q) { where += ' AND (w.wo_number LIKE ? OR w.job_title LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (status) { where += ' AND w.status = ?'; params.push(status); }
    if (typeWo) { const variants = TYPE_WO_VARIANTS[typeWo] ?? [typeWo]; where += ` AND w.type_wo IN (${variants.map(() => '?').join(',')})`; params.push(...variants); }
    if (company) { where += ' AND w.company LIKE ?'; params.push(`%${company}%`); }
    if (assetId) { where += ' AND w.id_equipment = ?'; params.push(assetId); }
    if (dateFrom) { where += ' AND w.date >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND w.date <= ?'; params.push(dateTo); }
    // Legacy PHP (`M_Schedule::sync_preventive_header_to_wo_mtc`) nge-mirror
    // OTOMATIS setiap WO preventive (prefix "PREV-", domain Production) ke
    // tb_wo_mtc (MESO) — statusnya gak pernah disinkron lagi setelahnya jadi
    // nyangkut. Salinan ini bukan WO MESO beneran, jangan tampil di sini;
    // WO aslinya tetap kelihatan di tab Production.
    if (key === 'meso') where += " AND w.wo_number NOT LIKE 'PREV-%'";
    return { where, params };
  };

  const allowedDomains = selected.filter((key) => permissive(user, domains[key].permission));
  // Setiap modul punya tabelnya sendiri (bukan satu tabel WO gabungan), jadi
  // gabungan lintas-modul dikerjakan di JS: ambil sejumlah baris terurut per
  // tabel yang cukup buat nutup halaman yang diminta, gabung, urutkan ulang,
  // baru dipotong sesuai halaman.
  const perDomainLimit = page * perPage;
  const [rowSets, countSets] = await Promise.all([
    Promise.all(allowedDomains.map((key) => {
      const { where, params } = buildWhere(key);
      // Sebagian WO hasil auto-generate jadwal preventive lama gak pernah
      // keisi created_at (bug terpisah, sudah diperbaiki di
      // preventive-schedule.ts untuk WO baru) — fallback ke `date` biar WO
      // lama itu tetap kesortir & tampil, bukan ketendang ke akhir daftar.
      return rows(`SELECT '${key}' AS module, w.wo_number,w.date,w.company,w.type_wo,w.priority,w.id_division,w.id_equipment,w.job_title,w.status,w.pic,w.job_executor,w.creator,COALESCE(w.created_at,CONCAT(w.date,' 00:00:00')) AS created_at,w.updated_at, a.AssetCode AS asset_code, a.AssetName AS asset_name FROM \`${domains[key].table}\` w LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where} ORDER BY COALESCE(w.created_at,CONCAT(w.date,' 00:00:00')) DESC LIMIT ?`, [...params, perDomainLimit]);
    })),
    Promise.all(allowedDomains.map((key) => {
      const { where, params } = buildWhere(key);
      return one<{ total: number }>(`SELECT COUNT(*) total FROM \`${domains[key].table}\` w ${where}`, params);
    })),
  ]);

  const totalCount = countSets.reduce((sum, c) => sum + Number(c?.total ?? 0), 0);
  const merged = rowSets.flat().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const start = (page - 1) * perPage;
  // Sebagian WO lama nyimpen nama company panjang ("Ganda Saribu Utama")
  // alih-alih kode singkat ("GSU") — normalisasi di sini biar konsisten
  // tanpa perlu migrasi data.
  const page_ = merged.slice(start, start + perPage).map((r) => ({
    ...r,
    company: resolveCompanyCode(String(r.company ?? '')) || r.company,
    type_wo: normalizeTypeWo(String(r.type_wo ?? '')) || r.type_wo,
  }));
  ok(res, page_, 'OK', { page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)) });
}));
workOrderRouter.get('/work-orders/detail', authenticate, asyncHandler(async (req, res) => {
  const domain = domainOf(String(req.query.module ?? 'maintenance')); const wo = String(req.query.wo_number ?? ''); if (!wo) throw new HttpError(400, 'wo_number is required'); const d = domains[domain]; const item = await header(domain, wo); if (!item) throw new HttpError(404, 'Work order not found');
  const [executors, labors, materials, approvals, evidences] = await Promise.all([rows('SELECT * FROM tb_job_executor WHERE wo_number=? ORDER BY id', [wo]), rows('SELECT * FROM tb_detail_labor WHERE wo_number=? ORDER BY id_detail_labor', [wo]), rows('SELECT * FROM tb_detail_material WHERE wo_number=? ORDER BY id_detail_material', [wo]), rows(`SELECT * FROM \`${d.approval}\` WHERE wo_number=? ORDER BY created_at`, [wo]), rows('SELECT * FROM tb_wo_service_evidence WHERE wo_number=? ORDER BY created_at', [wo])]);
  // Nama field harus persis `labors`/`evidences` (jamak) — itu yang dibaca
  // halaman detail WO web, bukan `labor`/`evidence`.
  // "Riwayat" di legacy PHP bukan tabel terpisah — dia baca tabel approval
  // yang sama ini secara kronologis (fullname+comment+created_at, gak ada
  // kolom action/status terstruktur di sana juga), jadi disini di-mapping
  // ulang ke bentuk yang dibaca komponen Timeline, bukan query baru.
  const histories = approvals.map((a) => ({ actor: a.fullname, note: a.comment, at: a.created_at }));
  // Web hanya nampilin tombol Setujui/Tolak/Tutup kalau `actions.can_*` ada —
  // sebelumnya field ini gak pernah dikirim sama sekali, jadi tombolnya gak
  // pernah muncul di halaman detail WO (harus lewat Approval Center). Pakai
  // logic yang sama kayak Approval Center (isPendingWoApproval/Closing),
  // bukan cuma cek status, karena status WAIT dipakai ulang buat executor/part
  // dan gak selalu berarti user yang sedang login boleh approve WO ini.
  // Approval Center tag baris pending-nya pakai moduleKey gaya "wo_x", beda
  // dari key domain di sini ("maintenance") — harus ditranslasi dulu.
  const approvalModuleKey: Record<Domain, string> = { is: 'wo_it', ga: 'wo_ga', meso: 'wo_mtc', maintenance: 'wo_operational', production: 'wo_preventive' };
  const user = (req as AuthRequest).user!;
  const [canApprove, canClose] = await Promise.all([
    isPendingWoApproval(user, approvalModuleKey[domain], wo),
    isPendingWoClosing(user, approvalModuleKey[domain], wo),
  ]);
  ok(res, { ...item as object, module: domain, executors, labors, materials, approvals, evidences, histories, actions: { can_approve: canApprove, can_close: canClose } });
}));

workOrderRouter.post('/work-orders/create', authenticate, asyncHandler(async (req, res) => {
  const domain = domainOf(String(req.body.module ?? 'maintenance')); const d = domains[domain]; const user = (req as AuthRequest).user!; if (!permissive(user, d.permission)) throw new HttpError(403, 'You do not have permission to create this work order');
  const b = req.body; if (!b.job_title) throw new HttpError(400, 'job_title is required'); const idEquipment = await resolveAssetId(b); if (!idEquipment) throw new HttpError(400, 'asset_code is required'); const isPreventive = /preventive/i.test(String(b.type_wo ?? '')); const executor = executorFor(domain, user); const wo = await transaction(async (connection) => { const number = b.wo_number ?? await nextNumber(connection, domain, String(user.division_code ?? user.id_division)); const status = domain === 'maintenance' && isPreventive ? 'IN_PROGRESS_EXECUTOR' : (b.status ?? 'WAIT_KA_DIV'); const values = [number, b.date ?? new Date().toISOString().slice(0, 10), b.company ?? user.company_name ?? '', b.shift ?? '', b.type_wo ?? 'CORRECTIVE', b.priority ?? 'NORMAL', b.id_division ?? user.id_division, idEquipment, b.job_title, b.running_hours ?? null, b.job_requirement ?? '', executor, status, executor, user.fullname]; await connection.execute(`INSERT INTO \`${d.table}\` (wo_number,date,company,shift,type_wo,priority,id_division,id_equipment,job_title,running_hours,job_requirement,job_executor,status,pic,creator,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`, values); await connection.execute('INSERT INTO tb_job_executor (job_executor,wo_number,status,created_at) VALUES (?,?,?,NOW())', [executor, number, isPreventive ? 'IN_PROGRESS' : 'WAITING']); return number; }); created(res, { wo_number: wo, module: domain }, 'Work order created');
}));
workOrderRouter.post('/work-orders/update', authenticate, asyncHandler(async (req, res) => { const domain = domainOf(String(req.body.module ?? 'maintenance')); const d = domains[domain]; const wo = String(req.body.wo_number ?? ''); if (!wo) throw new HttpError(400, 'wo_number is required'); const item = await header(domain, wo) as Record<string, unknown> | null; if (!item) throw new HttpError(404, 'Work order not found'); if (terminal.has(String(item.status).toUpperCase())) throw new HttpError(409, 'Terminal work order cannot be edited');
  const body = { ...req.body } as Record<string, unknown>;
  if (body.asset_code !== undefined && body.id_equipment === undefined) { const resolved = await resolveAssetId(body); if (resolved) body.id_equipment = resolved; }
  const fields = ['date','company','shift','type_wo','priority','id_division','id_equipment','job_title','running_hours','job_requirement','attachment'].filter((key) => body[key] !== undefined);
  if (!fields.length) throw new HttpError(400, 'No changes provided'); await execute(`UPDATE \`${d.table}\` SET ${fields.map((key) => `\`${key}\`=?`).join(', ')}, updated_at=NOW() WHERE wo_number=?`, [...fields.map((key) => body[key]), wo]); ok(res, { wo_number: wo, module: domain }, 'Work order updated'); }));

workOrderRouter.post('/work-orders/approve', authenticate, asyncHandler(async (req, res) => transition(req as AuthRequest, res, 'approve')));
workOrderRouter.post('/work-orders/reject', authenticate, asyncHandler(async (req, res) => transition(req as AuthRequest, res, 'reject')));
workOrderRouter.post('/work-orders/close', authenticate, asyncHandler(async (req, res) => transition(req as AuthRequest, res, 'close')));
workOrderRouter.post('/work-orders/void', authenticate, asyncHandler(async (req, res) => transition(req as AuthRequest, res, 'void')));
async function transition(req: AuthRequest, res: import('express').Response, action: 'approve'|'reject'|'close'|'void'): Promise<void> { const domain = domainOf(String(req.body.module ?? 'maintenance')); const d = domains[domain]; const wo = String(req.body.wo_number ?? ''); const comment = String(req.body.comment ?? req.body.reason ?? ''); if (!wo) throw new HttpError(400, 'wo_number is required'); const item = await header(domain, wo) as Record<string, unknown> | null; if (!item) throw new HttpError(404, 'Work order not found'); if (terminal.has(String(item.status).toUpperCase())) throw new HttpError(409, 'Work order is already terminal'); const target = action === 'approve' ? 'IN_PROGRESS_EXECUTOR' : action === 'reject' ? 'REJECT' : action === 'close' ? 'CLOSED' : 'VOID'; await transaction(async (connection) => { await approval(connection, d.approval, wo, req.user!, comment); await connection.execute(`UPDATE \`${d.table}\` SET status=?, pic=?, updated_at=NOW()${action === 'close' ? ', closedDate=NOW()' : ''}${action === 'void' ? ', reason=?' : ''} WHERE wo_number=?`, action === 'void' ? [target, '-', comment, wo] : [target, action === 'approve' ? executorFor(domain, req.user!) : '-', wo]); }); ok(res, { wo_number: wo, status: target }, `Work order ${action}d`); }

workOrderRouter.post('/work-orders/planner', authenticate, asyncHandler(async (req, res) => { const domain = domainOf(String(req.body.module ?? 'maintenance')); const wo = String(req.body.wo_number ?? ''); if (!wo) throw new HttpError(400, 'wo_number is required'); const rawExecutors = Array.isArray(req.body.job_executor) ? req.body.job_executor : (Array.isArray(req.body.executors) ? req.body.executors : []); const executors = rawExecutors.map((e: unknown) => typeof e === 'object' && e !== null ? String((e as Record<string, unknown>).job_executor ?? '') : String(e)).filter(Boolean); const startedPlanner = req.body.started_planner ?? null; const finishedPlanner = req.body.finished_planner ?? null; const estimatePlanner = req.body.estimate_planner ?? null; await transaction(async (connection) => { if (executors.length) { await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [wo]); for (const executor of executors) await connection.execute('INSERT INTO tb_job_executor (wo_number,job_executor,status,created_at) VALUES (?,?,?,NOW())', [wo, executor, 'IN_PROGRESS']); } await connection.execute(`UPDATE \`${domains[domain].table}\` SET status='IN_PROGRESS_EXECUTOR', started_planner=?, finished_planner=?, estimate_planner=?, updated_at=NOW() WHERE wo_number=?`, [startedPlanner, finishedPlanner, estimatePlanner, wo]); }); ok(res, { wo_number: wo, job_executor: executors.join(',') }, 'Planner assignment saved'); }));
workOrderRouter.post('/work-orders/sub', authenticate, asyncHandler(async (req, res) => { const source = domainOf(String(req.body.module ?? 'maintenance')); const target = resolveTargetDomain(String(req.body.target_domain ?? req.body.sub_to ?? req.body.subto ?? '')); const sourceWoNumber = String(req.body.wo_number ?? ''); const original = await header(source, sourceWoNumber) as Record<string, unknown> | null; if (!original) throw new HttpError(404, 'Source work order not found'); const user = (req as AuthRequest).user!; const d = domains[target]; const executor = executorFor(target, user); const number = await transaction(async (connection) => { const n = await nextNumber(connection, target, String(user.division_code ?? user.id_division)); await connection.execute(`INSERT INTO \`${d.table}\` (wo_number,date,company,shift,type_wo,priority,id_division,id_equipment,job_title,running_hours,job_requirement,job_executor,status,pic,creator,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`, [n, new Date().toISOString().slice(0,10), original.company ?? '', original.shift ?? '', original.type_wo ?? 'CORRECTIVE', original.priority ?? 'NORMAL', original.id_division, original.id_equipment, original.job_title, original.running_hours ?? null, original.job_requirement ?? '', executor, 'WAIT_KA_DIV', executor, user.fullname] as never); return n; }); created(res, { wo_number: sourceWoNumber, sub_wo_number: number, sub_to: executor, module: target }, 'Sub work order created'); }));

workOrderRouter.get('/work-orders/assets', authenticate, asyncHandler(async (req, res) => {
  const term = `%${String(req.query.q ?? '')}%`;
  const assets = await rows<{ AssetCode: string; [key: string]: unknown }>(
    'SELECT AssetID,AssetCode,AssetName,CompanyName,LocationAsset,mtc_area_key FROM asset WHERE active="active" AND (AssetCode LIKE ? OR AssetName LIKE ?) ORDER BY AssetName LIMIT 100',
    [term, term],
  );
  const codes = assets.map((a) => a.AssetCode);
  const photosByCode = new Map<string, string[]>();
  if (codes.length) {
    const placeholders = codes.map(() => '?').join(',');
    /**
     * Kategori attachment "Foto" = id 2 (lihat tb_attachment_asset_category) —
     * ini filter yang dipakai legacy `M_Equipment::getCompanyAttachment()`,
     * bukan cocokin ekstensi file (kategori lain kayak "Gambar Teknik" juga
     * bisa berisi file gambar tapi bukan foto aset).
     */
    const photos = await rows<{ AssetCode: string; filename: string }>(
      `SELECT AssetCode, filename FROM tb_attachment_asset
       WHERE AssetCode IN (${placeholders}) AND part_id IS NULL AND id_attachment_asset_category = 2
       ORDER BY sort_order, id`,
      codes,
    );
    for (const p of photos) {
      const url = resolveAssetAttachmentUrl(p.filename);
      if (!url) continue;
      const list = photosByCode.get(p.AssetCode);
      if (list) list.push(url);
      else photosByCode.set(p.AssetCode, [url]);
    }
  }
  ok(res, assets.map((a) => {
    const photoUrls = photosByCode.get(a.AssetCode) ?? [];
    return { ...a, photo_url: photoUrls[0] ?? null, photo_urls: photoUrls };
  }));
}));
/**
 * WO detail (web) nampilin 3 jejak material yang beda sumber di 1 tab:
 * `tb_material_request` (alur Material Usage klasik: request/ambil/pakai per
 * part), `tb_material_part_request` (alur "Ajukan Part" executor -> tim
 * Sparepart), dan `tb_detail_material` (material dicatat langsung di WO).
 * Endpoint ini sebelumnya cuma query tb_detail_material dan balikin array
 * polos — frontend butuh object {line_items,requests,recorded,...}.
 */
workOrderRouter.get('/work-orders/materials', authenticate, asyncHandler(async (req, res) => {
  const wo = String(req.query.wo_number ?? '');
  if (!wo) throw new HttpError(400, 'wo_number is required');
  const [lineItems, materialRequests, recorded] = await Promise.all([
    rows(`SELECT *, material_request AS qty_request, material_receive AS qty_receive, material_usage AS qty_usage
          FROM tb_material_request WHERE wo_number=? ORDER BY id`, [wo]),
    rows('SELECT * FROM tb_material_part_request WHERE wo_number=? ORDER BY id', [wo]),
    rows('SELECT * FROM tb_detail_material WHERE wo_number=? ORDER BY id_detail_material', [wo]),
  ]);
  ok(res, {
    line_items: lineItems,
    requests: materialRequests,
    recorded,
    headers: [],
    summary: { line_items: lineItems.length, requests: materialRequests.length, recorded: recorded.length },
  });
}));

const canMesoParts = (user: User): boolean => Number(user.wo_executor ?? 0) === 1 || Number(user.wo_mtc ?? 0) === 1 || Number(user.wo_mtc_all ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;
const canMaintenanceParts = (user: User): boolean => Number(user.wo_executor ?? 0) === 1 || Number(user.wo_operational ?? 0) === 1 || Number(user.wo_mtc_all ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;

workOrderRouter.get('/work-orders/meso-parts', authenticate, asyncHandler(async (req, res) => {
  const wo = String(req.query.wo_number ?? '').trim();
  if (!wo) throw new HttpError(422, 'wo_number wajib diisi.', 'WO_NUMBER_REQUIRED');
  const { data, partRequest } = await getMesoPreventiveParts(wo);
  ok(res, data, undefined, { part_request: partRequest });
}));

workOrderRouter.post('/work-orders/meso-parts', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canMesoParts(user)) throw new HttpError(403, 'Butuh permission eksekutor / WO MESO.', 'WO_MESO_PARTS_DENIED');
  const wo = String(req.body.wo_number ?? '').trim();
  const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!wo || !inputRows.length) throw new HttpError(422, 'wo_number dan rows wajib diisi.', 'WO_MESO_PARTS_INPUT');
  ok(res, await saveMesoPreventiveParts(wo, user, inputRows), 'Checklist part disimpan');
}));

workOrderRouter.get('/work-orders/maintenance-parts', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canMaintenanceParts(user)) throw new HttpError(403, 'Butuh permission WO Maintenance / eksekutor.', 'WO_MTC_PARTS_DENIED');
  const wo = String(req.query.wo_number ?? '').trim();
  if (!wo) throw new HttpError(422, 'wo_number wajib diisi.', 'WO_NUMBER_REQUIRED');
  const { data, partRequest } = await getMaintenancePreventiveParts(wo);
  ok(res, data, undefined, { part_request: partRequest });
}));

workOrderRouter.post('/work-orders/maintenance-parts', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canMaintenanceParts(user)) throw new HttpError(403, 'Butuh permission WO Maintenance / eksekutor.', 'WO_MTC_PARTS_DENIED');
  const wo = String(req.body.wo_number ?? '').trim();
  const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!wo || !inputRows.length) throw new HttpError(422, 'wo_number dan rows wajib diisi.', 'WO_MTC_PARTS_INPUT');
  try {
    ok(res, await saveMaintenancePreventiveParts(wo, user, inputRows), 'Checklist part disimpan');
  } catch (e) {
    if (e instanceof Error && e.message === 'WO_NOT_FOUND') throw new HttpError(404, 'WO tidak ditemukan.', 'WO_NOT_FOUND');
    if (e instanceof Error && e.message === 'WO_NOT_PREVENTIVE') throw new HttpError(422, 'WO bukan preventive.', 'WO_NOT_PREVENTIVE');
    throw e;
  }
}));
