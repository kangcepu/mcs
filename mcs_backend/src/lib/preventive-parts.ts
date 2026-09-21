import { execute, one, rows, transaction } from '../db.js';
import { ensurePartRequestHeader } from './material-usage.js';
import type { User } from '../types.js';

const PREVENTIVE_TYPES = new Set(['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM']);
function isPreventiveType(typeWo: unknown): boolean {
  const upper = String(typeWo ?? '').toUpperCase();
  return upper !== '' && (upper.includes('PREV') || upper === 'PM');
}

interface ImageRef { name: string; path: string; url: string }
interface CustomDetailInfo { bagian_mesin: string; kondisi: string; pic: string; tampak_jauh: ImageRef[]; tampak_dekat: ImageRef[]; detail_part: ImageRef[] }

async function buildCustomDetailMap(assetCode: string): Promise<Map<string, CustomDetailInfo>> {
  const map = new Map<string, CustomDetailInfo>();
  if (!assetCode) return map;
  const details = await rows<Record<string, unknown>>('SELECT id, bagian, bagian_mesin, part_mesin, kondisi, pic FROM asset_custom_details WHERE asset_code=?', [assetCode]);
  if (!details.length) return map;

  const ids = details.map((d) => Number(d.id));
  const images = await rows<{ custom_detail_id: number; image_type: string; image_path: string }>(
    `SELECT custom_detail_id, image_type, image_path FROM asset_custom_detail_images WHERE custom_detail_id IN (${ids.map(() => '?').join(',')}) ORDER BY image_order ASC`,
    ids,
  );
  const imagesByDetailId = new Map<number, Record<string, unknown>[]>();
  for (const img of images) {
    const list = imagesByDetailId.get(img.custom_detail_id) ?? [];
    list.push(img);
    imagesByDetailId.set(img.custom_detail_id, list);
  }

  for (const d of details) {
    const key = String(d.part_mesin ?? '').toLowerCase().trim();
    if (!key) continue;
    const imgRows = imagesByDetailId.get(Number(d.id)) ?? [];
    const grouped: Record<'tampak_jauh' | 'tampak_dekat' | 'detail_part', ImageRef[]> = { tampak_jauh: [], tampak_dekat: [], detail_part: [] };
    for (const img of imgRows) {
      const type = String(img.image_type ?? '') as 'tampak_jauh' | 'tampak_dekat' | 'detail_part';
      if (!(type in grouped)) continue;
      const p = String(img.image_path ?? '').replace(/^\.?\//, '');
      if (!p) continue;
      grouped[type].push({ name: p.split('/').pop() ?? p, path: p, url: `/uploads/${p}` });
    }
    map.set(key, {
      bagian_mesin: String(d.bagian_mesin ?? d.bagian ?? ''),
      kondisi: String(d.kondisi ?? ''),
      pic: String(d.pic ?? ''),
      tampak_jauh: grouped.tampak_jauh, tampak_dekat: grouped.tampak_dekat, detail_part: grouped.detail_part,
    });
  }
  return map;
}

async function partRequestMeta(woNumber: string): Promise<Record<string, unknown> | null> {
  const pending = await one<{ id: number; request_note: string | null; requested_by_name: string | null; created_at: string; status: string }>(
    "SELECT id, request_note, requested_by_name, created_at, status FROM tb_material_part_request WHERE wo_number=? AND status='PENDING' ORDER BY id DESC LIMIT 1",
    [woNumber],
  );
  if (!pending) return null;
  return { exists: true, status: pending.status, note: pending.request_note ?? '', requested_by: pending.requested_by_name ?? '', created_at: pending.created_at };
}

async function syncPartRequest(woNumber: string, user: User, parts: string[], notes: string[]): Promise<number> {
  const existing = await one<{ id: number }>("SELECT id FROM tb_material_part_request WHERE wo_number=? AND status='PENDING' ORDER BY id DESC LIMIT 1", [woNumber]);
  if (!parts.length) return existing ? 1 : 0;

  const uniqueParts = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  let note = `Permohonan part preventive MESO (${uniqueParts.length} part): ${uniqueParts.join(', ')}.`;
  if (notes.length) note += ` Catatan: ${notes.join('; ')}`;

  if (existing) {
    await execute('UPDATE tb_material_part_request SET request_note=?, updated_at=NOW() WHERE id=?', [note, existing.id]);
  } else {
    await execute(
      `INSERT INTO tb_material_part_request (wo_number, job_executor, requested_by, requested_by_name, request_note, status, erp_status, created_at)
       VALUES (?,NULL,?,?,?,'PENDING','PENDING',NOW())`,
      [woNumber, user.id_user, String(user.alias ?? user.fullname ?? user.username ?? 'User').trim(), note],
    );
  }
  await ensurePartRequestHeader(woNumber, '').catch(() => undefined);
  return 1;
}

export interface PreventivePartsResult { data: Record<string, unknown>[]; partRequest: Record<string, unknown> | null }

export async function getMesoPreventiveParts(woNumber: string): Promise<PreventivePartsResult> {
  const detailRows = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_meso_detail WHERE wo_number=? ORDER BY id ASC', [woNumber]);
  if (!detailRows.length) return { data: [], partRequest: null };

  const assetCode = String(detailRows[0].asset_code ?? '').trim();
  const cdMap = await buildCustomDetailMap(assetCode);

  const data = detailRows.map((r) => {
    const key = String(r.part_mesin ?? '').toLowerCase().trim();
    const cd = cdMap.get(key);
    const status = String(r.maintenance_status ?? 'PENDING').toUpperCase().trim();
    return {
      custom_detail_id: Number(r.id),
      part_mesin: String(r.part_mesin ?? ''),
      bagian_mesin: cd?.bagian_mesin || String(r.job_title ?? ''),
      tipe_jadwal: String(r.type_schedule ?? ''),
      kondisi: cd?.kondisi ?? '',
      pic: cd?.pic || String(r.executor ?? ''),
      maintenance_status: status === 'DONE' ? 'DONE' : 'PENDING',
      need_request_part: Number(r.need_request_part ?? 0) === 1,
      keterangan: String(r.keterangan ?? ''),
      tampak_jauh: cd?.tampak_jauh ?? [],
      tampak_dekat: cd?.tampak_dekat ?? [],
      detail_part: cd?.detail_part ?? [],
      execution_media: [],
    };
  });

  return { data, partRequest: await partRequestMeta(woNumber) };
}

export async function saveMesoPreventiveParts(woNumber: string, user: User, inputRows: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const who = String(user.fullname ?? user.username ?? '');
  let updated = 0;
  const reqParts: string[] = [];
  const reqNotes: string[] = [];

  await transaction(async (connection) => {
    for (const row of inputRows) {
      const id = Number(row.custom_detail_id ?? row.id ?? 0);
      if (id <= 0) continue;
      const statusInput = String(row.maintenance_status ?? 'PENDING').toUpperCase().trim();
      const status = statusInput === 'DONE' ? 'DONE' : 'PENDING';
      const need = row.need_request_part === true || row.need_request_part === 'true' || row.need_request_part === 1 || row.need_request_part === '1';
      const keterangan = String(row.keterangan ?? '').trim();

      const [result] = await connection.execute(
        'UPDATE tb_wo_meso_detail SET maintenance_status=?, need_request_part=?, keterangan=?, done_at=?, done_by=?, updated_at=NOW() WHERE id=? AND wo_number=?',
        [status, need ? 1 : 0, keterangan, status === 'DONE' ? new Date() : null, status === 'DONE' ? who : null, id, woNumber] as never,
      );
      if ((result as { affectedRows: number }).affectedRows > 0) updated++;

      if (need) {
        let partMesin = String(row.part_mesin ?? '').trim();
        if (!partMesin) {
          const cur = await one<{ part_mesin: string }>('SELECT part_mesin FROM tb_wo_meso_detail WHERE id=? AND wo_number=?', [id, woNumber]);
          partMesin = String(cur?.part_mesin ?? '').trim();
        }
        if (partMesin) reqParts.push(partMesin);
        if (keterangan) reqNotes.push(partMesin ? `${partMesin}: ${keterangan}` : keterangan);
      }
    }
  });

  const requested = await syncPartRequest(woNumber, user, reqParts, reqNotes);

  const summary = await one<{ total: number; done: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN UPPER(TRIM(COALESCE(maintenance_status,'PENDING')))='DONE' THEN 1 ELSE 0 END) AS done FROM tb_wo_meso_detail WHERE wo_number=?",
    [woNumber],
  );
  const totalParts = Number(summary?.total ?? 0);
  const doneParts = Number(summary?.done ?? 0);
  let statusChanged = false;

  if (doneParts > 0) {
    const header = await one<{ status: string }>('SELECT status FROM tb_wo_mtc WHERE wo_number=?', [woNumber]);
    const currentStatus = String(header?.status ?? '').toUpperCase().trim();
    const protectedStatuses = ['CLOSED', 'VOID', 'NEED_CLOSED', 'COMPLETE_EXECUTOR', 'WAITING_PARTS', 'PARTS_RECEIVED'];
    if (header && !protectedStatuses.includes(currentStatus)) {
      await execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=? AND status='WAITING'", [woNumber]);
      await execute("UPDATE tb_wo_mtc SET status='IN_PROGRESS_EXECUTOR', updated_at=NOW() WHERE wo_number=?", [woNumber]);
      statusChanged = true;
    }
  }

  return { wo_number: woNumber, updated, done: doneParts, total: totalParts, status: statusChanged ? 'IN_PROGRESS_EXECUTOR' : null, requested };
}

interface PartExecutionDefinition { custom_detail_id: number; part_mesin: string }

export async function getMaintenancePreventiveParts(woNumber: string): Promise<PreventivePartsResult> {
  const header = await one<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_operational WHERE wo_number=?', [woNumber]);
  if (!header) return { data: [], partRequest: null };
  if (!isPreventiveType(header.type_wo)) return { data: [], partRequest: null };

  const assetRow = header.id_equipment ? await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=?', [header.id_equipment]) : null;
  const assetCode = String(assetRow?.AssetCode ?? '').trim();
  const cdMap = await buildCustomDetailMap(assetCode);

  const definitions: PartExecutionDefinition[] = assetCode
    ? (await rows<{ id: number; part_mesin: string }>(
      "SELECT id, part_mesin FROM asset_custom_details WHERE asset_code=? AND part_mesin IS NOT NULL AND TRIM(part_mesin) <> '' ORDER BY row_order ASC, id ASC",
      [assetCode],
    )).map((r) => ({ custom_detail_id: Number(r.id), part_mesin: String(r.part_mesin ?? '') }))
    : [];

  const existingRows = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_operational_part_execution WHERE wo_number=?', [woNumber]);
  const existingByKey = new Map<string, Record<string, unknown>>();
  for (const row of existingRows) {
    const key = Number(row.custom_detail_id ?? 0) > 0 ? `id:${row.custom_detail_id}` : `part:${String(row.part_mesin ?? '').toLowerCase().trim()}`;
    existingByKey.set(key, row);
  }

  const mediaRows = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_operational_part_execution_media WHERE wo_number=? ORDER BY id DESC', [woNumber]);
  const mediaByKey = new Map<string, Record<string, unknown>[]>();
  for (const row of mediaRows) {
    const key = Number(row.custom_detail_id ?? 0) > 0 ? `id:${row.custom_detail_id}` : `part:${String(row.part_mesin ?? '').toLowerCase().trim()}`;
    const list = mediaByKey.get(key) ?? [];
    list.push({ id: row.id, name: row.media_name, path: row.media_path, url: `/uploads/${String(row.media_path)}`, media_type: row.media_type, created_at: row.created_at });
    mediaByKey.set(key, list);
  }

  const usedKeys = new Set<string>();
  const data: Record<string, unknown>[] = [];
  for (const def of definitions) {
    const key = def.custom_detail_id > 0 ? `id:${def.custom_detail_id}` : `part:${def.part_mesin.toLowerCase().trim()}`;
    usedKeys.add(key);
    const current = existingByKey.get(key);
    const cd = cdMap.get(def.part_mesin.toLowerCase().trim());
    data.push({
      custom_detail_id: def.custom_detail_id,
      part_mesin: def.part_mesin,
      bagian_mesin: cd?.bagian_mesin ?? '',
      tipe_jadwal: null,
      maintenance_status: current?.maintenance_status ?? 'PENDING',
      request_qty: Number(current?.request_qty ?? 0),
      request_part: (current?.request_part && String(current.request_part).trim() !== '') ? current.request_part : def.part_mesin,
      request_uom: current?.request_uom ?? 'PCS',
      keterangan: current?.keterangan ?? '',
      pic: cd?.pic ?? '',
      kondisi: cd?.kondisi ?? '',
      tampak_jauh: cd?.tampak_jauh ?? [],
      tampak_dekat: cd?.tampak_dekat ?? [],
      detail_part: cd?.detail_part ?? [],
      execution_media: mediaByKey.get(key) ?? [],
    });
  }
  for (const [key, row] of existingByKey) {
    if (usedKeys.has(key)) continue;
    data.push({
      custom_detail_id: Number(row.custom_detail_id ?? 0),
      part_mesin: String(row.part_mesin ?? ''),
      bagian_mesin: String(row.bagian_mesin ?? ''),
      tipe_jadwal: null,
      maintenance_status: row.maintenance_status ?? 'PENDING',
      request_qty: Number(row.request_qty ?? 0),
      request_part: (row.request_part && String(row.request_part).trim() !== '') ? row.request_part : row.part_mesin,
      request_uom: row.request_uom ?? 'PCS',
      keterangan: row.keterangan ?? '',
      pic: '', kondisi: '', tampak_jauh: [], tampak_dekat: [], detail_part: [],
      execution_media: mediaByKey.get(key) ?? [],
    });
  }

  return { data, partRequest: await partRequestMeta(woNumber) };
}

export async function saveMaintenancePreventiveParts(woNumber: string, user: User, inputRows: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const header = await one<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_operational WHERE wo_number=?', [woNumber]);
  if (!header) throw new Error('WO_NOT_FOUND');
  if (!isPreventiveType(header.type_wo)) throw new Error('WO_NOT_PREVENTIVE');

  const assetRow = header.id_equipment ? await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=?', [header.id_equipment]) : null;
  const assetCode = String(assetRow?.AssetCode ?? '').trim();
  const allowed = new Set<string>();
  if (assetCode) {
    const definitions = await rows<{ id: number; part_mesin: string }>(
      "SELECT id, part_mesin FROM asset_custom_details WHERE asset_code=? AND part_mesin IS NOT NULL AND TRIM(part_mesin) <> ''",
      [assetCode],
    );
    for (const d of definitions) {
      allowed.add(`id:${d.id}`);
      allowed.add(`part:${String(d.part_mesin ?? '').toLowerCase().trim()}`);
    }
  }

  const who = String(user.fullname ?? user.username ?? 'api v2');
  const reqRows: Array<{ part: string; qty: number; uom: string }> = [];

  await transaction(async (connection) => {
    for (const row of inputRows) {
      const partMesin = String(row.part_mesin ?? '').trim();
      if (!partMesin) continue;
      const customDetailId = Number(row.custom_detail_id ?? 0);
      const key = customDetailId > 0 ? `id:${customDetailId}` : `part:${partMesin.toLowerCase()}`;
      if (allowed.size && !allowed.has(key)) continue;

      const bagianMesin = String(row.bagian_mesin ?? '').trim();
      const statusInput = String(row.maintenance_status ?? 'PENDING').toUpperCase().trim();
      const maintenanceStatus = statusInput === 'DONE' ? 'DONE' : 'PENDING';
      const requestQty = Math.max(0, Number(row.request_qty ?? 0));
      const requestPart = String(row.request_part ?? '').trim() || partMesin;
      const requestUom = String(row.request_uom ?? '').trim() || 'PCS';
      const keterangan = String(row.keterangan ?? '').trim();

      const existing = customDetailId > 0
        ? await one<{ id: number }>('SELECT id FROM tb_wo_operational_part_execution WHERE wo_number=? AND part_mesin=? AND custom_detail_id=?', [woNumber, partMesin, customDetailId])
        : await one<{ id: number }>('SELECT id FROM tb_wo_operational_part_execution WHERE wo_number=? AND part_mesin=?', [woNumber, partMesin]);

      if (existing) {
        await connection.execute(
          'UPDATE tb_wo_operational_part_execution SET bagian_mesin=?, maintenance_status=?, request_qty=?, request_part=?, request_uom=?, keterangan=?, updated_by=?, updated_at=NOW() WHERE id=?',
          [bagianMesin, maintenanceStatus, requestQty, requestPart, requestUom, keterangan, who, existing.id],
        );
      } else {
        await connection.execute(
          'INSERT INTO tb_wo_operational_part_execution (wo_number, custom_detail_id, part_mesin, bagian_mesin, maintenance_status, request_qty, request_part, request_uom, keterangan, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
          [woNumber, customDetailId || null, partMesin, bagianMesin, maintenanceStatus, requestQty, requestPart, requestUom, keterangan, who],
        );
      }

      if (requestQty > 0 && requestPart) reqRows.push({ part: requestPart, qty: requestQty, uom: requestUom });
    }
  });

  await execute("DELETE FROM tb_material_request WHERE wo_number=? AND level='part_execution'", [woNumber]);
  const divisionCode = String(user.division_code ?? '');
  for (const r of reqRows) {
    await execute(
      'INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date) VALUES (?,?,?,?,?,?,?,NOW())',
      [woNumber, 'part_execution', r.part, String(r.qty), r.uom, divisionCode, Math.random().toString(36).slice(2, 12)],
    );
  }

  const currentStatus = String(header.status ?? '').toUpperCase().trim();
  if (currentStatus === 'WAIT_KA_DIV_MTC') {
    const activity = await one<{ total: number }>(
      "SELECT COUNT(*) AS total FROM tb_wo_operational_part_execution WHERE wo_number=? AND (maintenance_status='DONE' OR IFNULL(request_qty,0)>0 OR TRIM(IFNULL(keterangan,''))<>'')",
      [woNumber],
    );
    const media = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_wo_operational_part_execution_media WHERE wo_number=?', [woNumber]);
    if (Number(activity?.total ?? 0) > 0 || Number(media?.total ?? 0) > 0) {
      await execute("UPDATE tb_wo_mtc_operational SET status='IN_PROGRESS_EXECUTOR', updated_at=NOW() WHERE wo_number=?", [woNumber]);
      await execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=? AND status='WAITING'", [woNumber]);
    }
  }

  return { wo_number: woNumber, requested: reqRows.length };
}
