import crypto from 'node:crypto';
import { execute, one, rows, transaction } from '../db.js';
import { searchMaterialItemsUcRu, searchUsageItemGsu } from './erp.js';
import { HttpError } from '../http.js';
import type { PoolConnection } from 'mysql2/promise';

const WO_TABLES = ['tb_wo_mtc_operational', 'tb_wo_mtc', 'tb_wo_it', 'tb_wo_ga', 'tb_wo_preventive'] as const;
const APPROVAL_TABLE: Record<string, string> = {
  tb_wo_mtc: 'tb_approval',
  tb_wo_mtc_operational: 'tb_approval_operational',
  tb_wo_it: 'tb_approval_it',
  tb_wo_preventive: 'tb_approval_preventive',
  tb_wo_ga: 'tb_approval_ga',
};

function materialUsageKey(woNumber: string, jobExecutor: string): string {
  const executor = jobExecutor.trim();
  return `${woNumber.trim()}\x1F${executor !== '' && executor !== '-' ? executor : '-'}`;
}

function materialUsageSummaryKey(woNumber: string, jobExecutor: string, requestCode: string): string {
  return `${materialUsageKey(woNumber, jobExecutor)}\x1F${requestCode.trim()}`;
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export interface MaterialUsageFilters {
  page: number;
  perPage: number;
  status: string;
  woNumber: string;
  q: string;
}

export async function listMaterialUsage(filters: MaterialUsageFilters): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const isWoReferenceSearch = filters.q !== '' && /^(?:WO|WOPR)-/i.test(filters.q);

  const where: string[] = [];
  const params: unknown[] = [];
  where.push(
    "(SUBSTRING_INDEX(SUBSTRING_INDEX(mu.wo_number,'-',-1),'/',1) NOT REGEXP '^[0-9]{6}$' OR CAST(RIGHT(SUBSTRING_INDEX(SUBSTRING_INDEX(mu.wo_number,'-',-1),'/',1),4) AS UNSIGNED) >= YEAR(CURDATE()))",
  );
  where.push('mu.date >= ?');
  params.push(currentYearStart);
  where.push(`NOT (
    UPPER(COALESCE(mu.status,'')) IN ('OPEN','IN_PROGRESS')
    AND NOT EXISTS (SELECT 1 FROM tb_material_request mr_current WHERE mr_current.wo_number=mu.wo_number AND COALESCE(NULLIF(TRIM(mr_current.job_executor),''),'-')=COALESCE(NULLIF(TRIM(mu.job_executor),''),'-') AND mr_current.request_code=mu.request_code)
    AND EXISTS (SELECT 1 FROM tb_material_usage mu_closed WHERE mu_closed.wo_number=mu.wo_number AND COALESCE(NULLIF(TRIM(mu_closed.job_executor),''),'-')=COALESCE(NULLIF(TRIM(mu.job_executor),''),'-') AND UPPER(COALESCE(mu_closed.status,''))='CLOSED' AND EXISTS (SELECT 1 FROM tb_material_request mr_closed WHERE mr_closed.wo_number=mu_closed.wo_number AND COALESCE(NULLIF(TRIM(mr_closed.job_executor),''),'-')=COALESCE(NULLIF(TRIM(mu_closed.job_executor),''),'-') AND mr_closed.request_code=mu_closed.request_code))
    AND NOT EXISTS (SELECT 1 FROM tb_material_part_request pr_pending WHERE pr_pending.wo_number=mu.wo_number AND COALESCE(NULLIF(TRIM(pr_pending.job_executor),''),'-')=COALESCE(NULLIF(TRIM(mu.job_executor),''),'-') AND UPPER(COALESCE(pr_pending.status,''))='PENDING')
  )`);
  if (filters.status) { where.push('mu.status = ?'); params.push(filters.status); }
  if (filters.woNumber) { where.push('mu.wo_number = ?'); params.push(filters.woNumber); }
  if (filters.q) {
    if (isWoReferenceSearch) { where.push('mu.wo_number LIKE ?'); params.push(`${filters.q}%`); }
    else {
      where.push('(mu.wo_number LIKE ? OR mu.request_code LIKE ? OR mu.job_title LIKE ? OR mu.job_executor LIKE ? OR a.AssetName LIKE ? OR a.AssetCode LIKE ?)');
      params.push(...Array(6).fill(`%${filters.q}%`));
    }
  }
  const whereSql = where.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT COUNT(*) AS total FROM tb_material_usage mu LEFT JOIN asset a ON a.AssetID = mu.id_equipment WHERE ${whereSql}`,
    params,
  );
  const total = Number(totalRow?.total ?? 0);

  const items = await rows<Record<string, unknown>>(
    `SELECT mu.*, a.AssetCode AS asset_code, a.AssetName AS asset_name
     FROM tb_material_usage mu LEFT JOIN asset a ON a.AssetID = mu.id_equipment
     WHERE ${whereSql}
     ORDER BY (mu.status = 'CLOSED') ASC, mu.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, filters.perPage, (filters.page - 1) * filters.perPage],
  );

  await enrichMaterialUsageRows(items);
  return { items, total };
}

async function enrichMaterialUsageRows(items: Record<string, unknown>[]): Promise<void> {
  if (!items.length) return;
  const woNumbers = [...new Set(items.map((r) => String(r.wo_number ?? '').trim()).filter(Boolean))];

  const partRequestByKey = new Map<string, Record<string, unknown>>();
  const partRequestByRequestCode = new Map<string, Record<string, unknown>>();
  if (woNumbers.length) {
    const requestRows = await rows<Record<string, unknown>>(
      `SELECT * FROM tb_material_part_request WHERE wo_number IN (${woNumbers.map(() => '?').join(',')}) AND status = 'PENDING' ORDER BY id DESC`,
      woNumbers,
    );
    for (const item of requestRows) {
      const key = materialUsageKey(String(item.wo_number ?? ''), String(item.job_executor ?? ''));
      if (!partRequestByKey.has(key)) partRequestByKey.set(key, item);
      const requestCode = String(item.request_code ?? '').trim();
      if (requestCode) {
        const summaryKey = materialUsageSummaryKey(String(item.wo_number ?? ''), String(item.job_executor ?? ''), requestCode);
        if (!partRequestByRequestCode.has(summaryKey)) partRequestByRequestCode.set(summaryKey, item);
      }
    }
  }

  const partSummaryByKey = new Map<string, { total: number; used: number; first_requested_at: string | null }>();
  if (woNumbers.length) {
    const summaryRows = await rows<{ wo_number: string; job_executor: string; request_code: string; total: number; used: number; first_requested_at: string | null }>(
      `SELECT wo_number, job_executor, request_code, COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(material_usage,0) > 0 THEN 1 ELSE 0 END) AS used,
              MIN(date) AS first_requested_at
       FROM tb_material_request WHERE wo_number IN (${woNumbers.map(() => '?').join(',')})
       GROUP BY wo_number, job_executor, request_code`,
      woNumbers,
    );
    for (const item of summaryRows) {
      const key = materialUsageSummaryKey(item.wo_number ?? '', item.job_executor ?? '', item.request_code ?? '');
      partSummaryByKey.set(key, { total: Number(item.total ?? 0), used: Number(item.used ?? 0), first_requested_at: item.first_requested_at });
    }
  }

  const requesterEventByWo = new Map<string, { fullname: string; created_at: string }>();
  if (woNumbers.length) {
    for (const table of ['tb_approval_operational', 'tb_approval_mtc', 'tb_approval_preventive', 'tb_approval_it', 'tb_approval_ga']) {
      const events = await rows<{ wo_number: string; fullname: string; created_at: string }>(
        `SELECT wo_number, fullname, created_at FROM ${table} WHERE wo_number IN (${woNumbers.map(() => '?').join(',')}) AND comment LIKE '%Request Material%' ORDER BY created_at ASC`,
        woNumbers,
      ).catch(() => [] as { wo_number: string; fullname: string; created_at: string }[]);
      for (const row of events) {
        const wo = String(row.wo_number ?? '');
        if (!wo || !row.fullname) continue;
        const existing = requesterEventByWo.get(wo);
        if (!existing || String(row.created_at) < existing.created_at) {
          requesterEventByWo.set(wo, { fullname: String(row.fullname).trim(), created_at: String(row.created_at ?? '') });
        }
      }
    }
  }

  for (const r of items) {
    r.id = Number(r.id ?? 0);
    r.created_at = r.created_at ?? r.date ?? null;
    r.requested_at = r.date ?? r.created_at;
    r.requested_by_name = r.requested_by_name ?? null;
    r.request_note = r.request_note ?? null;
    r.erp_status = r.erp_status ?? null;
    r.erp_sent_at = r.erp_sent_at ?? null;

    const wo = String(r.wo_number ?? '');
    const executor = String(r.job_executor ?? '');
    const key = materialUsageKey(wo, executor);
    const requestCode = String(r.request_code ?? '').trim();
    let pr: Record<string, unknown> = {};
    if (requestCode) pr = partRequestByRequestCode.get(materialUsageSummaryKey(wo, executor, requestCode)) ?? {};
    if (!Object.keys(pr).length) pr = partRequestByKey.get(key) ?? {};

    if (Object.keys(pr).length) {
      r.part_request_id = Number(pr.id ?? 0);
      r.requested_by_name = pr.requested_by_name ?? r.requested_by_name;
      r.request_note = pr.request_note ?? r.request_note;
      r.pr_number = (r.pr_number as unknown) || (pr.pr_number ?? null);
      r.part_name = r.part_name ?? (pr.part_name ?? null);
      r.erp_status = pr.erp_status ?? r.erp_status;
      r.erp_sent_at = pr.erp_sent_at ?? r.erp_sent_at;
    }

    const requesterEvent = requesterEventByWo.get(wo);
    if (String(r.requested_by_name ?? '').trim() === '') r.requested_by_name = requesterEvent?.fullname ?? null;

    let partCount = 0;
    let usedCount = 0;
    let summary: { total: number; used: number; first_requested_at: string | null } | undefined;
    if (requestCode) {
      summary = partSummaryByKey.get(materialUsageSummaryKey(wo, executor, requestCode));
      partCount = summary?.total ?? 0;
      usedCount = summary?.used ?? 0;
    }

    if (requesterEvent?.created_at) r.requested_at = requesterEvent.created_at;
    else if (pr.created_at) r.requested_at = pr.created_at;
    else if (summary?.first_requested_at) r.requested_at = summary.first_requested_at;

    const headerStatus = String(r.status ?? 'OPEN').toUpperCase().trim();
    const requestStatus = String(pr.status ?? '').toUpperCase().trim();
    if (headerStatus === 'CLOSED') r.workflow_status = 'CLOSED';
    else if (headerStatus === 'IN_PROGRESS' || usedCount > 0) r.workflow_status = 'USAGE_RECORDED';
    else if (partCount > 0 || ['SELECTED', 'SENT_ERP', 'RECEIVED'].includes(requestStatus)) r.workflow_status = 'WAITING_PART_PICKUP';
    else if (requestStatus === 'PENDING') r.workflow_status = 'WAITING_PART_SELECTION';
    else r.workflow_status = headerStatus;
  }
}

async function getPartRequestWoHeader(woNumber: string): Promise<Record<string, unknown> | null> {
  for (const table of WO_TABLES) {
    const row = await one<Record<string, unknown>>(`SELECT * FROM ${table} WHERE wo_number = ?`, [woNumber]);
    if (row) return row;
  }
  return null;
}

export async function woInfo(woNumber: string): Promise<Record<string, unknown>> {
  const wo = woNumber.trim();
  if (!wo) return {};
  for (const table of WO_TABLES) {
    const row = await one<Record<string, unknown>>(`SELECT wo_number, job_title, company, status, id_equipment FROM ${table} WHERE wo_number = ?`, [wo]);
    if (!row) continue;
    const idEquipment = Number(row.id_equipment ?? 0);
    delete row.id_equipment;
    if (idEquipment > 0) {
      const asset = await one<{ AssetCode: string; AssetName: string }>('SELECT AssetCode, AssetName FROM asset WHERE AssetID = ?', [idEquipment]);
      row.asset_code = asset?.AssetCode ?? '';
      row.asset_name = asset?.AssetName ?? '';
    }
    return row;
  }
  return {};
}

async function getPendingPartRequest(woNumber: string, jobExecutor: string): Promise<Record<string, unknown> | null> {
  const executor = jobExecutor.trim();
  let sql = "SELECT id, request_note, requested_by_name, created_at FROM tb_material_part_request WHERE wo_number = ? AND status = 'PENDING'";
  const params: unknown[] = [woNumber];
  if (executor !== '' && executor !== '-') { sql += ' AND job_executor = ?'; params.push(executor); }
  sql += ' ORDER BY id DESC LIMIT 1';
  return one<Record<string, unknown>>(sql, params);
}

export async function ensurePartRequestHeader(woNumber: string, jobExecutor: string): Promise<{ id: number; request_code: string } | null> {
  const wo = woNumber.trim();
  if (!wo) return null;
  const executor = jobExecutor.trim() || '-';

  const existing = await one<{ id: number; request_code: string }>(
    "SELECT id, request_code FROM tb_material_usage WHERE wo_number = ? AND job_executor = ? AND status IN ('OPEN','IN_PROGRESS') ORDER BY id DESC LIMIT 1",
    [wo, executor],
  );
  if (existing?.request_code) return existing;

  const header = await getPartRequestWoHeader(wo);
  if (!header) return null;

  const requestCode = crypto.randomBytes(8).toString('hex').slice(0, 10).toUpperCase();
  const now = nowSql();
  const result = await execute(
    `INSERT INTO tb_material_usage (wo_number, date, id_equipment, company, job_title, type_wo, id_division, job_executor, status, request_code, created_at)
     VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [wo, header.id_equipment ?? null, header.company ?? null, header.job_title ?? null, header.type_wo ?? null, header.id_division ?? null, executor, requestCode, now],
  );
  return { id: result.insertId, request_code: requestCode };
}

export async function removeEmptyPartRequestHeader(woNumber: string, jobExecutor: string): Promise<void> {
  if (await getPendingPartRequest(woNumber, jobExecutor)) return;
  const executor = jobExecutor.trim() || '-';
  const usage = await one<{ id: number; request_code: string }>(
    "SELECT id, request_code FROM tb_material_usage WHERE wo_number = ? AND job_executor = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1",
    [woNumber, executor],
  );
  if (!usage) return;
  const countRow = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_material_request WHERE request_code = ?', [usage.request_code]);
  if (Number(countRow?.total ?? 0) === 0) await execute('DELETE FROM tb_material_usage WHERE id = ?', [usage.id]);
}

async function upsertPartRequestMaterial(
  connection: PoolConnection,
  woNumber: string,
  jobExecutor: string,
  requestCode: string,
  partName: string,
  qty: number,
  uom: string,
  erp: { erp_company: string; erp_item_id: number; erp_item_code: string; erp_uom_level: number; erp_warehouse_id: number },
): Promise<void> {
  const executor = jobExecutor.trim();
  const executorClause = executor ? 'job_executor = ?' : 'job_executor IS NULL';
  const params: unknown[] = [woNumber];
  if (executor) params.push(executor);
  params.push(requestCode, partName);

  const [existingRows] = await connection.execute(
    `SELECT id, material_request FROM tb_material_request WHERE wo_number = ? AND ${executorClause} AND request_code = ? AND part = ? LIMIT 1`,
    params as never,
  );
  const existing = (existingRows as { id: number; material_request: string }[])[0];

  if (existing) {
    const newQty = (Number(existing.material_request) || 0) + qty;
    await connection.execute(
      'UPDATE tb_material_request SET material_request=?, uom_request=?, erp_company=?, erp_item_id=?, erp_item_code=?, erp_uom_level=?, erp_warehouse_id=? WHERE id=?',
      [String(newQty), uom, erp.erp_company || null, erp.erp_item_id || null, erp.erp_item_code || null, erp.erp_uom_level || null, erp.erp_warehouse_id || null, existing.id],
    );
  } else {
    await connection.execute(
      `INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date, erp_company, erp_item_id, erp_item_code, erp_uom_level, erp_warehouse_id)
       VALUES (?, 'mobile_part_request', ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [woNumber, partName, String(qty), uom, executor || null, requestCode, erp.erp_company || null, erp.erp_item_id || null, erp.erp_item_code || null, erp.erp_uom_level || null, erp.erp_warehouse_id || null],
    );
  }
}

async function setPartRequestWoWaitingParts(connection: PoolConnection, woNumber: string): Promise<void> {
  for (const table of WO_TABLES) {
    await connection.execute(`UPDATE ${table} SET status='WAITING_PARTS' WHERE wo_number = ?`, [woNumber]);
  }
  await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number = ?", [woNumber]);
}

export interface SelectPartItemInput {
  part_name?: string;
  qty?: number | string;
  uom?: string;
  pr_number?: string;
  erp_company?: string;
  erp_item_id?: number | string;
  erp_item_code?: string;
  erp_uom_level?: number | string;
  erp_warehouse_id?: number | string;
}

export async function selectPartRequestItems(
  partRequestId: number,
  items: SelectPartItemInput[],
  selectedBy: number,
  selectedByName: string,
): Promise<{ success: boolean; message?: string; request_code?: string }> {
  const request = await one<Record<string, unknown>>("SELECT * FROM tb_material_part_request WHERE id = ? AND status = 'PENDING'", [partRequestId]);
  if (!request) return { success: false, message: 'Request sudah diproses atau tidak ditemukan.' };

  const validItems: { part_name: string; qty: number; uom: string; pr_number: string; erp_company: string; erp_item_id: number; erp_item_code: string; erp_uom_level: number; erp_warehouse_id: number }[] = [];
  for (const item of items) {
    const partName = String(item.part_name ?? '').trim();
    const qty = Number(item.qty ?? 0);
    const uom = String(item.uom ?? '').trim() || 'PCS';
    const prNumber = String(item.pr_number ?? '').trim();
    if (partName === '' || qty <= 0) return { success: false, message: 'Setiap part harus memiliki nama dan qty lebih dari 0.' };

    const erpCompany = String(item.erp_company ?? '').trim().toUpperCase();
    const erpItemId = Number(item.erp_item_id ?? 0);
    const erpItemCode = String(item.erp_item_code ?? '').trim();
    const erpUomLevel = Number(item.erp_uom_level ?? 0);
    const erpWarehouseId = Number(item.erp_warehouse_id ?? 0);
    if (erpCompany === 'GSU' && (erpItemId <= 0 || erpItemCode === '' || erpUomLevel <= 0 || erpWarehouseId <= 0)) {
      return { success: false, message: 'Part wajib dipilih dari master ERP.' };
    }
    validItems.push({ part_name: partName, qty, uom, pr_number: prNumber, erp_company: erpCompany, erp_item_id: erpItemId, erp_item_code: erpItemCode, erp_uom_level: erpUomLevel, erp_warehouse_id: erpWarehouseId });
  }
  if (!validItems.length) return { success: false, message: 'Minimal satu part wajib diisi.' };

  const woNumber = String(request.wo_number ?? '');
  const jobExecutor = String(request.job_executor ?? '');

  return transaction(async (connection) => {
    const usage = await ensurePartRequestHeader(woNumber, jobExecutor);
    if (!usage?.request_code) return { success: false, message: 'Header Material Usage untuk WO tidak ditemukan.' };

    const partNames = validItems.map((i) => i.part_name).join(', ');
    const totalQty = validItems.reduce((sum, i) => sum + i.qty, 0);
    const uoms = new Set(validItems.map((i) => i.uom));
    const uom = uoms.size === 1 ? [...uoms][0] : 'MULTI';
    const prNumbers = new Set(validItems.map((i) => i.pr_number).filter(Boolean));
    const prNumber = prNumbers.size === 1 ? [...prNumbers][0] : null;

    await connection.execute(
      "UPDATE tb_material_part_request SET part_name=?, qty=?, uom=?, pr_number=?, selected_by=?, selected_by_name=?, selected_at=NOW(), status='SELECTED' WHERE id=?",
      [partNames, totalQty, uom, prNumber, selectedBy, selectedByName, partRequestId],
    );

    for (const item of validItems) {
      await upsertPartRequestMaterial(connection, woNumber, jobExecutor, usage.request_code, item.part_name, item.qty, item.uom, item);
    }
    await setPartRequestWoWaitingParts(connection, woNumber);

    return { success: true, request_code: usage.request_code };
  });
}

/**
 * Void request yang statusnya sudah SELECTED (part sudah dipilih tim
 * Sparepart) tapi ternyata gak jadi diambil. Beda dari `/material-usage/cancel`
 * yang cuma buat status PENDING oleh pemohon sendiri — ini buat tim
 * Sparepart/management setelah part terlanjur dipilih.
 *
 * Aman dijalankan cuma kalau: (1) belum ada qty yang diambil/dipakai sama
 * sekali, dan (2) request ini satu-satunya kontributor baris
 * tb_material_request untuk request_code-nya — kalau ada sesi pilih-part lain
 * yang ikut nyumbang ke baris yang sama, qty gabungannya gak bisa dipisah
 * lagi secara akurat, jadi ditolak & diarahkan buat ditangani manual.
 */
export async function voidSelectedPartRequest(partRequestId: number): Promise<{ success: boolean; message?: string }> {
  const request = await one<Record<string, unknown>>("SELECT * FROM tb_material_part_request WHERE id = ? AND status = 'SELECTED'", [partRequestId]);
  if (!request) return { success: false, message: 'Request tidak ditemukan atau bukan status SELECTED.' };

  const woNumber = String(request.wo_number ?? '');
  const jobExecutor = String(request.job_executor ?? '').trim();
  const usage = await ensurePartRequestHeader(woNumber, jobExecutor);
  const requestCode = usage?.request_code;
  if (!requestCode) return { success: false, message: 'Header Material Usage untuk WO tidak ditemukan.' };

  const otherContributors = await one<{ total: number }>(
    "SELECT COUNT(*) AS total FROM tb_material_part_request WHERE wo_number=? AND job_executor=? AND status IN ('SELECTED','SENT_ERP') AND id != ?",
    [woNumber, jobExecutor || null, partRequestId],
  );
  if (Number(otherContributors?.total ?? 0) > 0) {
    return { success: false, message: 'Ada request part lain yang sudah dipilih untuk WO/executor ini — qty gabungan tidak bisa dipisah otomatis. Hubungi admin.' };
  }

  const movedRow = await one<{ moved: number }>(
    "SELECT COUNT(*) AS moved FROM tb_material_request WHERE request_code=? AND (COALESCE(material_receive,'')<>'' OR COALESCE(material_usage,'')<>'')",
    [requestCode],
  );
  if (Number(movedRow?.moved ?? 0) > 0) {
    return { success: false, message: 'Sudah ada part yang diambil/dipakai untuk request ini, tidak bisa di-void.' };
  }

  return transaction(async (connection) => {
    await connection.execute("UPDATE tb_material_part_request SET status='CANCELLED' WHERE id=?", [partRequestId]);
    await connection.execute('DELETE FROM tb_material_request WHERE request_code=?', [requestCode]);
    return { success: true };
  });
}

/**
 * `job_executor` disimpan NULL di database saat WO tidak punya executor
 * (bukan string kosong) — jangan match pakai `= ?` dengan nilai kosong/'-'
 * (dipakai buat tampilan doang), match persis cuma kalau memang ada isinya.
 */
export async function detailRequest(woNumber: string, jobExecutor: string, requestCode: string): Promise<Record<string, unknown>[]> {
  let sql = 'SELECT * FROM tb_material_request WHERE wo_number=? AND request_code=?';
  const params: unknown[] = [woNumber, requestCode];
  if (jobExecutor.trim() && jobExecutor.trim() !== '-') { sql += ' AND job_executor=?'; params.push(jobExecutor); }
  return rows(sql, params);
}

export async function detailPurchase(woNumber: string, jobExecutor: string, requestCode: string): Promise<Record<string, unknown>[]> {
  let sql = 'SELECT * FROM tb_material_purchase WHERE wo_number=? AND request_code=?';
  const params: unknown[] = [woNumber, requestCode];
  if (jobExecutor.trim() && jobExecutor.trim() !== '-') { sql += ' AND job_executor=?'; params.push(jobExecutor); }
  return rows(sql, params);
}

export async function detailHold(woNumber: string, requestCode: string, jobExecutor: string): Promise<Record<string, unknown>[]> {
  let sql = 'SELECT * FROM tb_material_hold WHERE wo_number = ?';
  const params: unknown[] = [woNumber];
  if (requestCode.trim()) { sql += ' AND request_code = ?'; params.push(requestCode); }
  if (jobExecutor.trim() && jobExecutor.trim() !== '-') { sql += ' AND job_executor = ?'; params.push(jobExecutor); }
  return rows(sql, params);
}

export async function getMaterialUsageHeader(id: number, jobExecutor: string): Promise<Record<string, unknown> | null> {
  return one(
    `SELECT mu.*, d.division_name, d.division_code FROM tb_material_usage mu
     LEFT JOIN tb_division d ON d.id_division = mu.id_division
     WHERE mu.job_executor = ? AND mu.id = ?`,
    [jobExecutor, id],
  );
}

interface UpdateOpenInput {
  wo_number: string;
  job_executor: string;
  request_code: string;
  NestedRows: { id_material_usage: number; material_usage: number; uom: string }[];
}

async function queueErpUsageDryRun(connection: PoolConnection, data: UpdateOpenInput): Promise<void> {
  const ids = [...new Set(data.NestedRows.map((r) => r.id_material_usage).filter((id) => id > 0))];
  if (!ids.length) return;
  const [rowsResult] = await connection.execute(
    `SELECT id, part, material_usage, erp_company, erp_item_id, erp_item_code, erp_uom_level, erp_warehouse_id
     FROM tb_material_request WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const materialRows = rowsResult as Record<string, unknown>[];
  const items: { item_id: number; item_code: string; item_name: string; quantity: number; uom_level: number; warehouse_id: number }[] = [];
  const companies = new Set<string>();
  for (const row of materialRows) {
    const materialUsage = Number(row.material_usage) || 0;
    const erpCompany = String(row.erp_company ?? '').trim();
    const erpItemId = Number(row.erp_item_id ?? 0);
    const erpUomLevel = Number(row.erp_uom_level ?? 0);
    const erpWarehouseId = Number(row.erp_warehouse_id ?? 0);
    if (materialUsage <= 0 || erpCompany === '' || erpItemId <= 0 || erpUomLevel <= 0 || erpWarehouseId <= 0) continue;
    companies.add(erpCompany);
    items.push({ item_id: erpItemId, item_code: String(row.erp_item_code ?? ''), item_name: String(row.part ?? ''), quantity: materialUsage, uom_level: erpUomLevel, warehouse_id: erpWarehouseId });
  }
  if (!items.length || companies.size > 1) return;

  const externalRef = `MCS-${data.request_code}`;
  const payload = JSON.stringify(items);
  const now = nowSql();
  const [existingRows] = await connection.execute('SELECT id FROM tb_material_erp_sync WHERE external_ref = ?', [externalRef]);
  const existing = (existingRows as { id: number }[])[0];
  if (existing) {
    await connection.execute(
      "UPDATE tb_material_erp_sync SET wo_number=?, request_code=?, company=?, status='PAUSED', payload=?, updated_at=? WHERE id=?",
      [data.wo_number, data.request_code, [...companies][0], payload, now, existing.id],
    );
  } else {
    await connection.execute(
      "INSERT INTO tb_material_erp_sync (external_ref, wo_number, request_code, company, status, payload, created_at, updated_at) VALUES (?,?,?,?,'PAUSED',?,?,?)",
      [externalRef, data.wo_number, data.request_code, [...companies][0], payload, now, now],
    );
  }
}

export async function updateOpen(data: UpdateOpenInput): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute("UPDATE tb_material_usage SET status='IN_PROGRESS' WHERE wo_number=? AND job_executor=? AND request_code=?", [data.wo_number, data.job_executor, data.request_code]);
    for (const row of data.NestedRows) {
      await connection.execute(
        'UPDATE tb_material_request SET material_usage=?, purchase_request=0, uom_usage=?, uom_purchase=?, material_receive=? WHERE id=?',
        [String(row.material_usage), row.uom, row.uom, String(row.material_usage), row.id_material_usage],
      );
    }
    await queueErpUsageDryRun(connection, data);
  });
}

export async function markErpSyncPaused(requestCode: string, reason: string): Promise<void> {
  await execute(
    "UPDATE tb_material_erp_sync SET status='PAUSED', erp_usage_id=NULL, erp_usage_number=NULL, last_error=?, updated_at=NOW() WHERE request_code=? AND status IN ('PENDING_DRY_RUN','FAILED_TEST','PAUSED')",
    [reason || 'Sinkronisasi Ascend dipause sementara.', requestCode],
  );
}

export async function materialHold(input: { id: number; hold_qty: number; remarks: string }): Promise<void> {
  const materialRequest = await one<Record<string, unknown>>('SELECT * FROM tb_material_request WHERE id = ?', [input.id]);
  if (!materialRequest) throw new HttpError(404, 'Material request row not found', 'MU_HOLD_NOT_FOUND');

  await transaction(async (connection) => {
    const woNumber = String(materialRequest.wo_number ?? '');
    const level = String(materialRequest.level ?? '');
    const part = String(materialRequest.part ?? '');
    const requestCode = String(materialRequest.request_code ?? '');
    const jobExecutor = String(materialRequest.job_executor ?? '');
    const date = materialRequest.date;

    const [existingRows] = await connection.execute(
      'SELECT id FROM tb_material_hold WHERE request_code = ? AND job_executor = ? AND part = ?',
      [requestCode, jobExecutor, part],
    );
    const existing = (existingRows as { id: number }[])[0];

    if (existing) {
      await connection.execute(
        'UPDATE tb_material_hold SET wo_number=?, level=?, hold_qty=?, hold_uom=?, remarks=?, date=? WHERE id=?',
        [woNumber, level, String(input.hold_qty), String(materialRequest.uom_request ?? ''), input.remarks, date, existing.id] as never,
      );
    } else {
      await connection.execute(
        'INSERT INTO tb_material_hold (wo_number, level, part, hold_qty, hold_uom, date, job_executor, request_code, remarks) VALUES (?,?,?,?,?,?,?,?,?)',
        [woNumber, level, part, String(input.hold_qty), String(materialRequest.uom_request ?? ''), date, jobExecutor, requestCode, input.remarks] as never,
      );
    }
    await connection.execute('UPDATE tb_material_request SET hold=? WHERE id=?', [String(input.hold_qty), input.id]);
  });
}

interface ClosedInput {
  wo_number: string;
  job_executor: string;
  request_code: string;
  NestedRows: { part_prc: string; material_usage_prc: number; material_receive_prc: number; uom_prc: string }[];
}

export async function closedMaterialUsage(
  data: ClosedInput,
  approver: { fullname: string; id_division: string | null; id_position: string },
): Promise<{ status: boolean; message: string; already_closed?: boolean }> {
  const existingHeader = await one<{ status: string }>(
    'SELECT status FROM tb_material_usage WHERE wo_number=? AND job_executor=? AND request_code=?',
    [data.wo_number, data.job_executor, data.request_code],
  );
  if (existingHeader && String(existingHeader.status).toUpperCase() === 'CLOSED') {
    return { status: true, message: 'Material Usage sudah dikonfirmasi sebelumnya.', already_closed: true };
  }

  try {
    await transaction(async (connection) => {
      for (const row of data.NestedRows) {
        await connection.execute(
          'UPDATE tb_material_purchase SET material_usage_prc=?, material_receive=?, uom_receive=?, uom_usage_prc=?, date=NOW() WHERE wo_number=? AND job_executor=? AND request_code=? AND part=?',
          [String(row.material_usage_prc), String(row.material_receive_prc), row.uom_prc, row.uom_prc, data.wo_number, data.job_executor, data.request_code, row.part_prc],
        );

        const [foundRows] = await connection.execute(
          'SELECT * FROM tb_material_request WHERE wo_number=? AND job_executor=? AND request_code=? AND part=?',
          [data.wo_number, data.job_executor, data.request_code, row.part_prc],
        );
        const found = (foundRows as Record<string, unknown>[])[0];
        if (!found) throw new HttpError(422, 'Detail material tidak ditemukan.', 'MU_DETAIL_NOT_FOUND');

        const receiveItem = (Number(found.material_usage) || 0) + row.material_usage_prc;
        await connection.execute(
          'UPDATE tb_material_request SET material_receive=? WHERE wo_number=? AND job_executor=? AND request_code=? AND part=?',
          [String(receiveItem), data.wo_number, data.job_executor, data.request_code, row.part_prc],
        );
      }

      let foundTable: string | null = null;
      for (const table of ['tb_wo_mtc', 'tb_wo_mtc_operational', 'tb_wo_it', 'tb_wo_preventive', 'tb_wo_ga']) {
        const [existsRows] = await connection.execute(`SELECT wo_number, job_executor FROM ${table} WHERE wo_number = ?`, [data.wo_number]);
        const existsRow = (existsRows as { wo_number: string; job_executor: string }[])[0];
        if (existsRow) { foundTable = table; break; }
      }

      if (foundTable) {
        const [getRows] = await connection.execute(`SELECT wo_number, job_executor FROM ${foundTable} WHERE wo_number = ?`, [data.wo_number]);
        const get = (getRows as { wo_number: string; job_executor: string }[])[0];
        const approvalTable = APPROVAL_TABLE[foundTable];
        await connection.execute(
          `INSERT INTO ${approvalTable} (wo_number, fullname, id_division, id_position, comment, created_at) VALUES (?,?,?,?, 'Material Received.', NOW())`,
          [data.wo_number, approver.fullname, approver.id_division, approver.id_position],
        );
        await connection.execute(`UPDATE ${foundTable} SET status='PARTS_RECEIVED', pic=? WHERE wo_number=?`, [get?.job_executor ?? null, data.wo_number]);
      }

      await connection.execute("UPDATE tb_material_usage SET status='CLOSED' WHERE wo_number=? AND job_executor=? AND request_code=?", [data.wo_number, data.job_executor, data.request_code]);
    });
  } catch (error) {
    if (error instanceof HttpError) return { status: false, message: error.message };
    return { status: false, message: 'Gagal menyimpan konfirmasi Material Usage.' };
  }

  return { status: true, message: 'Material Usage berhasil dikonfirmasi.' };
}

export interface ErpPartResult {
  part_name: string;
  item_id: number | null;
  item_code: string;
  company: string;
  uom: string;
  uom_level: number | null;
}

export async function searchErpParts(company: string, term: string): Promise<ErpPartResult[]> {
  const normalizedCompany = company.toUpperCase().trim();
  const [gsu, ucRu] = await Promise.all([
    searchUsageItemGsu(term).catch(() => []),
    searchMaterialItemsUcRu(term).catch(() => []),
  ]);

  const results: ErpPartResult[] = [
    ...gsu.map((item) => ({
      part_name: `${item.item_name} (${item.item_code})`,
      item_id: item.item_id,
      item_code: item.item_code,
      company: 'GSU',
      uom: item.uom,
      uom_level: item.uom_level,
    })),
    ...ucRu.map((item) => ({
      part_name: `${item.item_name} (${item.item_code})`,
      item_id: item.item_id,
      item_code: item.item_code,
      company: item.company,
      uom: item.uom,
      uom_level: item.uom_level,
    })),
  ];

  // Prioritaskan company WO agar pilihan paling relevan muncul di atas,
  // lalu hapus duplikasi yang berasal dari query berulang di satu ERP.
  const unique = new Map<string, ErpPartResult>();
  for (const item of results) {
    const key = `${item.company}:${item.item_id}:${item.item_code}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => {
    const aPreferred = a.company === normalizedCompany ? 0 : 1;
    const bPreferred = b.company === normalizedCompany ? 0 : 1;
    return aPreferred - bPreferred || a.part_name.localeCompare(b.part_name);
  });
}
