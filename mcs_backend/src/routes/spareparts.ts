import { Router } from 'express';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { getSparepartErpItems, getSparepartErpPurchaseOrder, listSparepartErpCatalog, listSparepartErpPurchaseOrders, type SparepartErpCompany } from '../lib/erp.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const sparepartRouter = Router();

const canUse = requirePermission('material_usage');
const CRITICALITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const STATUSES = ['ACTIVE', 'INACTIVE'];
const ERP_COMPANIES: SparepartErpCompany[] = ['UC', 'RU', 'GSU'];
const SPAREPART_ERP_SYSTEM = 'ACCURATE_MSSQL';

function actor(req: AuthRequest): string {
  return String(req.user?.fullname || req.user?.username || 'SYSTEM').trim();
}

function requiredText(value: unknown, label: string, max: number): string {
  const result = String(value ?? '').trim();
  if (!result) throw new HttpError(422, `${label} wajib diisi.`);
  if (result.length > max) throw new HttpError(422, `${label} maksimal ${max} karakter.`);
  return result;
}

function optionalText(value: unknown, max: number): string | null {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (result.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return result;
}

function positiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, `${label} tidak valid.`);
  return id;
}

function enumText(value: unknown, allowed: string[], label: string, fallback?: string): string {
  const normalized = String(value ?? fallback ?? '').trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new HttpError(422, `${label} tidak valid.`);
  return normalized;
}

function bool(value: unknown): number {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' ? 1 : 0;
}

function quantity(value: unknown, label: string, required = true): number | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(422, `${label} wajib diisi.`);
    return null;
  }
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(422, `${label} harus berupa angka minimal 0.`);
  return parsed;
}

function dateTime(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(normalized)) throw new HttpError(422, `${label} tidak valid.`);
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function receiptNumber(): string {
  const d = new Date();
  const stamp = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'), String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'), String(d.getSeconds()).padStart(2, '0')].join('');
  return `SP-RCV-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureReceiving(): Promise<void> {
  await ensureFoundation();
  if (!(await tableExists('sparepart_receipt')) || !(await tableExists('sparepart_stock_ledger'))) {
    throw new HttpError(503, 'Migration Sparepart Receiving & Stock belum dijalankan.');
  }
}

type ReceiptLineInput = {
  sparepart_id?: unknown; bin_id?: unknown; ordered_qty?: unknown; received_qty?: unknown;
  accepted_qty?: unknown; hold_qty?: unknown; rejected_qty?: unknown; lot_number?: unknown;
  expiry_date?: unknown; qc_note?: unknown; serials?: unknown;
};

async function insertReceiptLines(connection: PoolConnection, receiptId: number, warehouseId: number, rawLines: unknown): Promise<void> {
  const lines = Array.isArray(rawLines) ? rawLines as ReceiptLineInput[] : [];
  if (!lines.length) throw new HttpError(422, 'Minimal satu baris sparepart wajib diisi.');
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    const sparepartId = positiveId(line.sparepart_id, `Sparepart baris ${number}`);
    const binId = positiveId(line.bin_id, `Bin baris ${number}`);
    const [partRows] = await connection.query(`SELECT id,base_uom,is_serialized,is_lot_controlled,has_expiry,status FROM sparepart_master WHERE id=? LIMIT 1`, [sparepartId]);
    const part = (partRows as any[])[0];
    if (!part || part.status !== 'ACTIVE') throw new HttpError(422, `Sparepart baris ${number} tidak aktif atau tidak ditemukan.`);
    const [binRows] = await connection.query(`SELECT b.id FROM sparepart_bin b JOIN sparepart_rack r ON r.id=b.rack_id WHERE b.id=? AND r.warehouse_id=? AND b.status='ACTIVE' AND r.status='ACTIVE' LIMIT 1`, [binId, warehouseId]);
    if (!(binRows as any[])[0]) throw new HttpError(422, `Bin baris ${number} tidak berada pada warehouse terpilih atau tidak aktif.`);
    const received = quantity(line.received_qty, `Qty diterima baris ${number}`)!;
    const accepted = quantity(line.accepted_qty, `Qty accepted baris ${number}`)!;
    const hold = quantity(line.hold_qty, `Qty hold baris ${number}`)!;
    const rejected = quantity(line.rejected_qty, `Qty rejected baris ${number}`)!;
    if (received <= 0) throw new HttpError(422, `Qty diterima baris ${number} harus lebih dari 0.`);
    if (Math.abs(received - accepted - hold - rejected) > 0.000001) throw new HttpError(422, `Accepted + hold + rejected pada baris ${number} harus sama dengan qty diterima.`);
    const lot = optionalText(line.lot_number, 120);
    const expiry = optionalText(line.expiry_date, 10);
    if (Number(part.is_lot_controlled) === 1 && !lot) throw new HttpError(422, `Lot/batch baris ${number} wajib diisi.`);
    if (Number(part.has_expiry) === 1 && !expiry) throw new HttpError(422, `Expiry date baris ${number} wajib diisi.`);
    const nonZero = [accepted, hold, rejected].filter((value) => value > 0);
    const qcStatus = nonZero.length > 1 ? 'MIXED' : accepted > 0 ? 'ACCEPTED' : hold > 0 ? 'HOLD' : 'REJECTED';
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO sparepart_receipt_line
       (receipt_id,sparepart_id,bin_id,ordered_qty,received_qty,accepted_qty,hold_qty,rejected_qty,uom,qc_status,lot_number,expiry_date,qc_note,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [receiptId, sparepartId, binId, quantity(line.ordered_qty, `Qty PO baris ${number}`, false), received, accepted, hold, rejected, part.base_uom, qcStatus, lot, expiry, optionalText(line.qc_note, 5000)],
    );
    const serials = Array.isArray(line.serials) ? line.serials as Array<{ serial_number?: unknown; qc_status?: unknown }> : [];
    if (Number(part.is_serialized) === 1) {
      if (!Number.isInteger(received)) throw new HttpError(422, `Qty sparepart serial baris ${number} harus bilangan bulat.`);
      if (serials.length !== received) throw new HttpError(422, `Jumlah serial baris ${number} harus sama dengan qty diterima (${received}).`);
      const counts = { ACCEPTED: 0, HOLD: 0, REJECTED: 0 };
      for (const serial of serials) {
        const serialStatus = enumText(serial.qc_status, ['ACCEPTED', 'HOLD', 'REJECTED'], 'Status QC serial');
        counts[serialStatus as keyof typeof counts] += 1;
        await connection.execute(`INSERT INTO sparepart_receipt_serial (receipt_line_id,sparepart_id,serial_number,qc_status,stock_status,created_at) VALUES (?,?,?,?,'PENDING',NOW())`, [insert.insertId, sparepartId, requiredText(serial.serial_number, 'Serial number', 160), serialStatus]);
      }
      if (counts.ACCEPTED !== accepted || counts.HOLD !== hold || counts.REJECTED !== rejected) throw new HttpError(422, `Status serial baris ${number} tidak sesuai pembagian qty QC.`);
    } else if (serials.length) {
      throw new HttpError(422, `Sparepart baris ${number} tidak menggunakan serial number.`);
    }
  }
}

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('sparepart_master'))) {
    throw new HttpError(503, 'Migration Sparepart Foundation belum dijalankan.');
  }
}

async function ensureErpReferenceSync(): Promise<void> {
  await ensureFoundation();
  if (!(await tableExists('sparepart_erp_snapshot')) || !(await tableExists('sparepart_erp_sync_history'))) {
    throw new HttpError(503, 'Migration Sparepart ERP Reference Sync belum dijalankan.');
  }
}

function erpCompany(value: unknown): SparepartErpCompany {
  const company = String(value ?? '').trim().toUpperCase() as SparepartErpCompany;
  if (!ERP_COMPANIES.includes(company)) throw new HttpError(422, 'Company ERP tidak valid.');
  return company;
}

function syncNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `SP-ERP-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function duplicate(error: unknown, message: string): never {
  if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') throw new HttpError(409, message);
  throw error;
}

sparepartRouter.use('/spareparts', authenticate, canUse);

sparepartRouter.get('/spareparts/foundation', asyncHandler(async (req, res) => {
  await ensureFoundation();
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '').trim().toUpperCase();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (q) {
    where.push('(p.part_code LIKE ? OR p.part_name LIKE ? OR p.part_number LIKE ? OR p.category LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (STATUSES.includes(status)) { where.push('p.status=?'); params.push(status); }

  const [parts, compatibility, warehouses, racks, bins, mappings, categories, companies] = await Promise.all([
    rows<any>(`SELECT p.*,
      (SELECT COUNT(*) FROM sparepart_asset_compatibility c WHERE c.sparepart_id=p.id) compatibility_count,
      (SELECT COUNT(*) FROM sparepart_erp_mapping m WHERE m.sparepart_id=p.id AND m.status='ACTIVE') erp_mapping_count
      FROM sparepart_master p WHERE ${where.join(' AND ')} ORDER BY p.part_name,p.part_code`, params),
    rows<any>(`SELECT c.*,p.part_code,p.part_name,a.AssetCode,a.AssetName,a.CompanyName
      FROM sparepart_asset_compatibility c
      JOIN sparepart_master p ON p.id=c.sparepart_id
      LEFT JOIN asset a ON a.AssetID=c.asset_id
      ORDER BY p.part_name,c.compatibility_type,a.AssetName,c.asset_category`),
    rows<any>('SELECT * FROM sparepart_warehouse ORDER BY company_code,warehouse_name'),
    rows<any>(`SELECT r.*,w.warehouse_code,w.warehouse_name FROM sparepart_rack r
      JOIN sparepart_warehouse w ON w.id=r.warehouse_id ORDER BY w.warehouse_name,r.rack_code`),
    rows<any>(`SELECT b.*,r.rack_code,w.warehouse_code FROM sparepart_bin b
      JOIN sparepart_rack r ON r.id=b.rack_id JOIN sparepart_warehouse w ON w.id=r.warehouse_id
      ORDER BY w.warehouse_code,r.rack_code,b.bin_code`),
    rows<any>(`SELECT m.*,p.part_code,p.part_name FROM sparepart_erp_mapping m
      JOIN sparepart_master p ON p.id=m.sparepart_id ORDER BY m.company_code,p.part_name`),
    rows<{ value: string }>(`SELECT DISTINCT CategoryAsset value FROM asset
      WHERE CategoryAsset IS NOT NULL AND TRIM(CategoryAsset)<>'' ORDER BY CategoryAsset`),
    rows<{ value: string }>(`SELECT DISTINCT CompanyName value FROM asset
      WHERE CompanyName IS NOT NULL AND TRIM(CompanyName)<>'' ORDER BY CompanyName`),
  ]);
  ok(res, { parts, compatibility, warehouses, racks, bins, erp_mappings: mappings, asset_categories: categories.map((x) => x.value), companies: companies.map((x) => x.value) });
}));

sparepartRouter.get('/spareparts/erp/catalog', asyncHandler(async (req, res) => {
  await ensureErpReferenceSync();
  const company = erpCompany(req.query.company ?? 'GSU');
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? 25) || 25));
  const q = String(req.query.q ?? '').trim().slice(0, 120);
  const activeOnly = String(req.query.active_only ?? '1') !== '0';
  const catalog = await listSparepartErpCatalog({ company, q, page, perPage, activeOnly });
  const codes = catalog.items.map((item) => item.item_code).filter(Boolean);
  const mappings = codes.length
    ? await rows<any>(`SELECT m.id mapping_id,m.sparepart_id,m.erp_item_code,m.last_reference_at,
        p.part_code,p.part_name,s.balance_qty snapshot_balance,s.last_synced_at
      FROM sparepart_erp_mapping m JOIN sparepart_master p ON p.id=m.sparepart_id
      LEFT JOIN sparepart_erp_snapshot s ON s.mapping_id=m.id
      WHERE m.company_code=? AND m.erp_system=? AND m.erp_item_code IN (${codes.map(() => '?').join(',')})`,
      [company, SPAREPART_ERP_SYSTEM, ...codes])
    : [];
  const byCode = new Map(mappings.map((mapping) => [String(mapping.erp_item_code), mapping]));
  const history = await rows<any>(`SELECT * FROM sparepart_erp_sync_history WHERE company_code=? ORDER BY synced_at DESC,id DESC LIMIT 10`, [company]);
  const synced = await one<{ total: number }>(`SELECT COUNT(*) total FROM sparepart_erp_mapping WHERE company_code=? AND erp_system=? AND status='ACTIVE'`, [company, SPAREPART_ERP_SYSTEM]);
  ok(res, {
    company,
    items: catalog.items.map((item) => ({ ...item, mapping: byCode.get(item.item_code) ?? null })),
    history,
    synced_count: Number(synced?.total ?? 0),
    balance_source: 'IC_ItemBalanceCache',
    read_only: true,
  }, 'Katalog ERP berhasil dimuat.', { page, per_page: perPage, total: catalog.total, total_pages: Math.max(1, Math.ceil(catalog.total / perPage)) });
}));

sparepartRouter.get('/spareparts/erp/purchase-orders', asyncHandler(async (req, res) => {
  await ensureErpReferenceSync();
  const company = erpCompany(req.query.company ?? 'GSU');
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? 25) || 25));
  const q = String(req.query.q ?? '').trim().slice(0, 120);
  const result = await listSparepartErpPurchaseOrders({
    company, q, page, perPage, includeClosed: String(req.query.include_closed ?? '0') === '1',
  });
  ok(res, { company, items: result.items, read_only: true }, 'Purchase Order ERP berhasil dimuat.', {
    page, per_page: perPage, total: result.total, total_pages: Math.max(1, Math.ceil(result.total / perPage)),
  });
}));

sparepartRouter.get('/spareparts/erp/purchase-orders/:poId', asyncHandler(async (req, res) => {
  await ensureErpReferenceSync();
  const company = erpCompany(req.query.company ?? 'GSU');
  const poId = positiveId(req.params.poId, 'Purchase Order ERP');
  const purchaseOrder = await getSparepartErpPurchaseOrder(company, poId);
  if (!purchaseOrder) throw new HttpError(404, 'Purchase Order tidak ditemukan di ERP.');
  const codes = purchaseOrder.lines.map((line) => line.item_code).filter(Boolean);
  const mappings = codes.length ? await rows<any>(`SELECT m.id mapping_id,m.sparepart_id,m.erp_item_code,
      p.part_code,p.part_name,p.base_uom,p.is_serialized,p.is_lot_controlled,p.has_expiry,p.status
    FROM sparepart_erp_mapping m JOIN sparepart_master p ON p.id=m.sparepart_id
    WHERE m.company_code=? AND m.erp_system=? AND m.status='ACTIVE'
      AND m.erp_item_code IN (${codes.map(() => '?').join(',')})`, [company, SPAREPART_ERP_SYSTEM, ...codes]) : [];
  const byCode = new Map(mappings.map((mapping) => [String(mapping.erp_item_code), mapping]));
  ok(res, {
    company, ...purchaseOrder.header,
    lines: purchaseOrder.lines.map((line) => ({ ...line, mapping: byCode.get(line.item_code) ?? null })),
    read_only: true,
  }, 'Detail Purchase Order ERP berhasil dimuat.');
}));

sparepartRouter.post('/spareparts/erp/sync', asyncHandler(async (req: AuthRequest, res) => {
  await ensureErpReferenceSync();
  const company = erpCompany(req.body.company);
  const rawIds: unknown[] = Array.isArray(req.body.item_ids) ? req.body.item_ids : [];
  const itemIds: number[] = [...new Set<number>(
    rawIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0),
  )];
  if (!itemIds.length) throw new HttpError(422, 'Pilih minimal satu item ERP untuk disinkronkan.');
  if (itemIds.length > 100) throw new HttpError(422, 'Maksimal 100 item per proses sinkronisasi.');
  const sourceItems = await getSparepartErpItems(company, itemIds);
  const sourceById = new Map(sourceItems.map((item) => [item.item_id, item]));
  const username = actor(req);
  const result = await transaction(async (connection) => {
    let createdCount = 0;
    let updatedCount = 0;
    const failures: Array<{ item_id: number; message: string }> = [];
    for (const itemId of itemIds) {
      const item = sourceById.get(itemId);
      if (!item) { failures.push({ item_id: itemId, message: 'Item tidak ditemukan di ERP.' }); continue; }
      if (!item.item_code || !item.item_name) { failures.push({ item_id: itemId, message: 'Kode atau nama item ERP kosong.' }); continue; }
      if (item.item_code.length > 80) { failures.push({ item_id: itemId, message: 'Kode item ERP melebihi 80 karakter.' }); continue; }
      try {
        const [mappingRows] = await connection.query(
          `SELECT m.id,m.sparepart_id FROM sparepart_erp_mapping m WHERE m.company_code=? AND m.erp_system=? AND m.erp_item_code=? LIMIT 1`,
          [company, SPAREPART_ERP_SYSTEM, item.item_code],
        );
        let mapping = (mappingRows as any[])[0] as { id: number; sparepart_id: number } | undefined;
        let sparepartId = Number(mapping?.sparepart_id ?? 0);
        let createdPart = false;
        if (!sparepartId) {
          const [partRows] = await connection.query(`SELECT id FROM sparepart_master WHERE part_code=? LIMIT 1`, [item.item_code]);
          sparepartId = Number((partRows as any[])[0]?.id ?? 0);
          if (sparepartId) {
            const [conflicts] = await connection.query(
              `SELECT erp_item_code FROM sparepart_erp_mapping WHERE sparepart_id=? AND company_code=? AND erp_system=? LIMIT 1`,
              [sparepartId, company, SPAREPART_ERP_SYSTEM],
            );
            const conflict = (conflicts as any[])[0];
            if (conflict && String(conflict.erp_item_code) !== item.item_code) {
              failures.push({ item_id: itemId, message: `Master ${item.item_code} sudah terhubung ke item ERP lain.` });
              continue;
            }
          } else {
            const [insertPart] = await connection.execute<ResultSetHeader>(
              `INSERT INTO sparepart_master (part_code,part_name,category,brand,base_uom,criticality,is_serialized,is_lot_controlled,has_expiry,status,description,created_by,updated_by,created_at,updated_at)
               VALUES (?,?,?,?,?,'NORMAL',?,0,?,?,'Sinkron referensi read-only dari ERP.',?,?,NOW(),NOW())`,
              [item.item_code, item.item_name.slice(0, 180), item.category_name?.slice(0, 120) ?? null, item.brand_name?.slice(0, 100) ?? null, item.uom.slice(0, 30), item.is_serialized ? 1 : 0, item.has_expiry ? 1 : 0, item.disabled || item.discontinued ? 'INACTIVE' : 'ACTIVE', username, username],
            );
            sparepartId = insertPart.insertId;
            createdPart = true;
          }
          const [insertMapping] = await connection.execute<ResultSetHeader>(
            `INSERT INTO sparepart_erp_mapping (sparepart_id,company_code,erp_system,erp_item_code,erp_item_name,erp_uom,sync_mode,status,last_reference_at,created_by,updated_by,created_at,updated_at)
             VALUES (?,?,?,?,?,?,'REFERENCE_ONLY','ACTIVE',NOW(),?,?,NOW(),NOW())`,
            [sparepartId, company, SPAREPART_ERP_SYSTEM, item.item_code, item.item_name.slice(0, 180), item.uom.slice(0, 30), username, username],
          );
          mapping = { id: insertMapping.insertId, sparepart_id: sparepartId };
        } else {
          await connection.execute(
            `UPDATE sparepart_erp_mapping SET erp_item_name=?,erp_uom=?,status='ACTIVE',last_reference_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?`,
            [item.item_name.slice(0, 180), item.uom.slice(0, 30), username, mapping!.id],
          );
        }
        await connection.execute(
          `UPDATE sparepart_master SET part_name=?,category=?,brand=?,base_uom=?,is_serialized=?,has_expiry=?,status=?,updated_by=?,updated_at=NOW() WHERE id=?`,
          [item.item_name.slice(0, 180), item.category_name?.slice(0, 120) ?? null, item.brand_name?.slice(0, 100) ?? null, item.uom.slice(0, 30), item.is_serialized ? 1 : 0, item.has_expiry ? 1 : 0, item.disabled || item.discontinued ? 'INACTIVE' : 'ACTIVE', username, sparepartId],
        );
        await connection.execute(
          `INSERT INTO sparepart_erp_snapshot (mapping_id,erp_item_id,balance_qty,category_name,brand_name,is_serialized,has_expiry,minimum_qty,maximum_qty,reorder_point,lead_time_days,source_updated_at,last_synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
           ON DUPLICATE KEY UPDATE erp_item_id=VALUES(erp_item_id),balance_qty=VALUES(balance_qty),category_name=VALUES(category_name),brand_name=VALUES(brand_name),is_serialized=VALUES(is_serialized),has_expiry=VALUES(has_expiry),minimum_qty=VALUES(minimum_qty),maximum_qty=VALUES(maximum_qty),reorder_point=VALUES(reorder_point),lead_time_days=VALUES(lead_time_days),source_updated_at=VALUES(source_updated_at),last_synced_at=NOW()`,
          [mapping!.id, item.item_id, item.balance_qty, item.category_name, item.brand_name, item.is_serialized ? 1 : 0, item.has_expiry ? 1 : 0, item.minimum_qty, item.maximum_qty, item.reorder_point, item.lead_time_days, item.source_updated_at],
        );
        if (createdPart) createdCount += 1; else updatedCount += 1;
      } catch (error) {
        failures.push({ item_id: itemId, message: (error as Error).message || 'Gagal menyinkronkan item.' });
      }
    }
    const number = syncNumber();
    const status = failures.length === itemIds.length ? 'FAILED' : failures.length ? 'PARTIAL' : 'SUCCESS';
    await connection.execute(
      `INSERT INTO sparepart_erp_sync_history (sync_number,company_code,sync_type,requested_count,created_count,updated_count,failed_count,status,result_detail,synced_by,synced_at)
       VALUES (?,?,'SELECTED_ITEMS',?,?,?,?,?,?,?,NOW())`,
      [number, company, itemIds.length, createdCount, updatedCount, failures.length, status, JSON.stringify({ failures }), username],
    );
    return { sync_number: number, company, requested_count: itemIds.length, created_count: createdCount, updated_count: updatedCount, failed_count: failures.length, status, failures };
  });
  ok(res, result, result.failed_count ? 'Sinkronisasi selesai dengan beberapa kegagalan.' : 'Item ERP berhasil disinkronkan ke MCS.');
}));

sparepartRouter.post('/spareparts', asyncHandler(async (req: AuthRequest, res) => {
  await ensureFoundation();
  const partCode = requiredText(req.body.part_code, 'Kode sparepart', 80).toUpperCase();
  const partName = requiredText(req.body.part_name, 'Nama sparepart', 180);
  const criticality = enumText(req.body.criticality, CRITICALITIES, 'Criticality', 'NORMAL');
  try {
    const result = await execute(
      `INSERT INTO sparepart_master
       (part_code,part_name,part_number,category,brand,model,base_uom,criticality,is_serialized,is_lot_controlled,has_expiry,status,description,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,NOW(),NOW())`,
      [partCode, partName, optionalText(req.body.part_number, 120), optionalText(req.body.category, 120), optionalText(req.body.brand, 100), optionalText(req.body.model, 100), requiredText(req.body.base_uom, 'Satuan dasar', 30).toUpperCase(), criticality, bool(req.body.is_serialized), bool(req.body.is_lot_controlled), bool(req.body.has_expiry), optionalText(req.body.description, 5000), actor(req), actor(req)],
    );
    created(res, { id: result.insertId }, 'Master sparepart berhasil dibuat.');
  } catch (error) { duplicate(error, 'Kode sparepart sudah digunakan.'); }
}));

sparepartRouter.patch('/spareparts/:id', asyncHandler(async (req: AuthRequest, res) => {
  await ensureFoundation();
  const id = positiveId(req.params.id, 'Sparepart');
  if (!(await one('SELECT id FROM sparepart_master WHERE id=?', [id]))) throw new HttpError(404, 'Sparepart tidak ditemukan.');
  try {
    await execute(
      `UPDATE sparepart_master SET part_code=?,part_name=?,part_number=?,category=?,brand=?,model=?,base_uom=?,criticality=?,
       is_serialized=?,is_lot_controlled=?,has_expiry=?,status=?,description=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [requiredText(req.body.part_code, 'Kode sparepart', 80).toUpperCase(), requiredText(req.body.part_name, 'Nama sparepart', 180), optionalText(req.body.part_number, 120), optionalText(req.body.category, 120), optionalText(req.body.brand, 100), optionalText(req.body.model, 100), requiredText(req.body.base_uom, 'Satuan dasar', 30).toUpperCase(), enumText(req.body.criticality, CRITICALITIES, 'Criticality', 'NORMAL'), bool(req.body.is_serialized), bool(req.body.is_lot_controlled), bool(req.body.has_expiry), enumText(req.body.status, STATUSES, 'Status', 'ACTIVE'), optionalText(req.body.description, 5000), actor(req), id],
    );
    ok(res, { id }, 'Master sparepart berhasil diperbarui.');
  } catch (error) { duplicate(error, 'Kode sparepart sudah digunakan.'); }
}));

sparepartRouter.post('/spareparts/compatibility', asyncHandler(async (req: AuthRequest, res) => {
  await ensureFoundation();
  const sparepartId = positiveId(req.body.sparepart_id, 'Sparepart');
  if (!(await one('SELECT id FROM sparepart_master WHERE id=?', [sparepartId]))) throw new HttpError(404, 'Sparepart tidak ditemukan.');
  const type = enumText(req.body.compatibility_type, ['ASSET', 'ASSET_CATEGORY'], 'Jenis kompatibilitas');
  let assetId: number | null = null;
  let category: string | null = null;
  let targetKey: string;
  if (type === 'ASSET') {
    assetId = positiveId(req.body.asset_id, 'Asset');
    if (!(await one('SELECT AssetID FROM asset WHERE AssetID=?', [assetId]))) throw new HttpError(404, 'Asset tidak ditemukan.');
    targetKey = `ASSET:${assetId}`;
  } else {
    category = requiredText(req.body.asset_category, 'Kategori asset', 255);
    targetKey = `ASSET_CATEGORY:${category.toUpperCase()}`;
  }
  try {
    const result = await execute(
      `INSERT INTO sparepart_asset_compatibility
       (sparepart_id,compatibility_type,target_key,asset_id,asset_category,notes,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,NOW())`,
      [sparepartId, type, targetKey, assetId, category, optionalText(req.body.notes, 500), actor(req)],
    );
    created(res, { id: result.insertId }, 'Kompatibilitas sparepart berhasil ditambahkan.');
  } catch (error) { duplicate(error, 'Kompatibilitas tersebut sudah terdaftar.'); }
}));

sparepartRouter.delete('/spareparts/compatibility/:id', asyncHandler(async (req, res) => {
  await ensureFoundation();
  const id = positiveId(req.params.id, 'Kompatibilitas');
  const result = await execute('DELETE FROM sparepart_asset_compatibility WHERE id=?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Kompatibilitas tidak ditemukan.');
  ok(res, { id }, 'Kompatibilitas berhasil dihapus.');
}));

sparepartRouter.post('/spareparts/warehouses', asyncHandler(async (req: AuthRequest, res) => {
  await ensureFoundation();
  try {
    const result = await execute(
      `INSERT INTO sparepart_warehouse
       (warehouse_code,warehouse_name,company_code,location_description,custodian_name,status,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,'ACTIVE',?,?,NOW(),NOW())`,
      [requiredText(req.body.warehouse_code, 'Kode warehouse', 60).toUpperCase(), requiredText(req.body.warehouse_name, 'Nama warehouse', 160), requiredText(req.body.company_code ?? 'GLOBAL', 'Perusahaan', 80), optionalText(req.body.location_description, 255), optionalText(req.body.custodian_name, 120), actor(req), actor(req)],
    );
    created(res, { id: result.insertId }, 'Warehouse berhasil dibuat.');
  } catch (error) { duplicate(error, 'Kode warehouse sudah digunakan.'); }
}));

sparepartRouter.patch('/spareparts/warehouses/:id', asyncHandler(async (req: AuthRequest, res) => {
  const id = positiveId(req.params.id, 'Warehouse');
  try {
    const result = await execute(
      `UPDATE sparepart_warehouse SET warehouse_code=?,warehouse_name=?,company_code=?,location_description=?,custodian_name=?,status=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [requiredText(req.body.warehouse_code, 'Kode warehouse', 60).toUpperCase(), requiredText(req.body.warehouse_name, 'Nama warehouse', 160), requiredText(req.body.company_code ?? 'GLOBAL', 'Perusahaan', 80), optionalText(req.body.location_description, 255), optionalText(req.body.custodian_name, 120), enumText(req.body.status, STATUSES, 'Status', 'ACTIVE'), actor(req), id],
    );
    if (!result.affectedRows) throw new HttpError(404, 'Warehouse tidak ditemukan.');
    ok(res, { id }, 'Warehouse berhasil diperbarui.');
  } catch (error) { duplicate(error, 'Kode warehouse sudah digunakan.'); }
}));

sparepartRouter.post('/spareparts/racks', asyncHandler(async (req: AuthRequest, res) => {
  const warehouseId = positiveId(req.body.warehouse_id, 'Warehouse');
  if (!(await one('SELECT id FROM sparepart_warehouse WHERE id=?', [warehouseId]))) throw new HttpError(404, 'Warehouse tidak ditemukan.');
  try {
    const result = await execute(
      `INSERT INTO sparepart_rack (warehouse_id,rack_code,rack_name,status,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,'ACTIVE',?,?,NOW(),NOW())`,
      [warehouseId, requiredText(req.body.rack_code, 'Kode rack', 60).toUpperCase(), optionalText(req.body.rack_name, 160), actor(req), actor(req)],
    );
    created(res, { id: result.insertId }, 'Rack berhasil dibuat.');
  } catch (error) { duplicate(error, 'Kode rack sudah ada pada warehouse tersebut.'); }
}));

sparepartRouter.patch('/spareparts/racks/:id', asyncHandler(async (req: AuthRequest, res) => {
  const id = positiveId(req.params.id, 'Rack');
  const warehouseId = positiveId(req.body.warehouse_id, 'Warehouse');
  try {
    const result = await execute(
      `UPDATE sparepart_rack SET warehouse_id=?,rack_code=?,rack_name=?,status=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [warehouseId, requiredText(req.body.rack_code, 'Kode rack', 60).toUpperCase(), optionalText(req.body.rack_name, 160), enumText(req.body.status, STATUSES, 'Status', 'ACTIVE'), actor(req), id],
    );
    if (!result.affectedRows) throw new HttpError(404, 'Rack tidak ditemukan.');
    ok(res, { id }, 'Rack berhasil diperbarui.');
  } catch (error) { duplicate(error, 'Kode rack sudah ada pada warehouse tersebut.'); }
}));

sparepartRouter.post('/spareparts/bins', asyncHandler(async (req: AuthRequest, res) => {
  const rackId = positiveId(req.body.rack_id, 'Rack');
  if (!(await one('SELECT id FROM sparepart_rack WHERE id=?', [rackId]))) throw new HttpError(404, 'Rack tidak ditemukan.');
  try {
    const result = await execute(
      `INSERT INTO sparepart_bin (rack_id,bin_code,bin_name,status,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,'ACTIVE',?,?,NOW(),NOW())`,
      [rackId, requiredText(req.body.bin_code, 'Kode bin', 60).toUpperCase(), optionalText(req.body.bin_name, 160), actor(req), actor(req)],
    );
    created(res, { id: result.insertId }, 'Bin berhasil dibuat.');
  } catch (error) { duplicate(error, 'Kode bin sudah ada pada rack tersebut.'); }
}));

sparepartRouter.patch('/spareparts/bins/:id', asyncHandler(async (req: AuthRequest, res) => {
  const id = positiveId(req.params.id, 'Bin');
  const rackId = positiveId(req.body.rack_id, 'Rack');
  try {
    const result = await execute(
      `UPDATE sparepart_bin SET rack_id=?,bin_code=?,bin_name=?,status=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [rackId, requiredText(req.body.bin_code, 'Kode bin', 60).toUpperCase(), optionalText(req.body.bin_name, 160), enumText(req.body.status, STATUSES, 'Status', 'ACTIVE'), actor(req), id],
    );
    if (!result.affectedRows) throw new HttpError(404, 'Bin tidak ditemukan.');
    ok(res, { id }, 'Bin berhasil diperbarui.');
  } catch (error) { duplicate(error, 'Kode bin sudah ada pada rack tersebut.'); }
}));

sparepartRouter.post('/spareparts/erp-mappings', asyncHandler(async (req: AuthRequest, res) => {
  await ensureFoundation();
  const sparepartId = positiveId(req.body.sparepart_id, 'Sparepart');
  if (!(await one('SELECT id FROM sparepart_master WHERE id=?', [sparepartId]))) throw new HttpError(404, 'Sparepart tidak ditemukan.');
  try {
    const result = await execute(
      `INSERT INTO sparepart_erp_mapping
       (sparepart_id,company_code,erp_system,erp_item_code,erp_item_name,erp_uom,sync_mode,status,last_reference_at,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'REFERENCE_ONLY','ACTIVE',NOW(),?,?,NOW(),NOW())`,
      [sparepartId, requiredText(req.body.company_code ?? 'GLOBAL', 'Perusahaan', 80), requiredText(req.body.erp_system ?? 'ERP_REFERENCE', 'Sistem ERP', 40).toUpperCase(), requiredText(req.body.erp_item_code, 'Kode item ERP', 120), optionalText(req.body.erp_item_name, 180), optionalText(req.body.erp_uom, 30), actor(req), actor(req)],
    );
    created(res, { id: result.insertId, sync_mode: 'REFERENCE_ONLY' }, 'Mapping referensi ERP berhasil disimpan.');
  } catch (error) { duplicate(error, 'Mapping part atau kode item ERP tersebut sudah terdaftar untuk perusahaan yang sama.'); }
}));

sparepartRouter.patch('/spareparts/erp-mappings/:id', asyncHandler(async (req: AuthRequest, res) => {
  const id = positiveId(req.params.id, 'Mapping ERP');
  try {
    const result = await execute(
      `UPDATE sparepart_erp_mapping SET company_code=?,erp_system=?,erp_item_code=?,erp_item_name=?,erp_uom=?,sync_mode='REFERENCE_ONLY',status=?,last_reference_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?`,
      [requiredText(req.body.company_code ?? 'GLOBAL', 'Perusahaan', 80), requiredText(req.body.erp_system ?? 'ERP_REFERENCE', 'Sistem ERP', 40).toUpperCase(), requiredText(req.body.erp_item_code, 'Kode item ERP', 120), optionalText(req.body.erp_item_name, 180), optionalText(req.body.erp_uom, 30), enumText(req.body.status, STATUSES, 'Status', 'ACTIVE'), actor(req), id],
    );
    if (!result.affectedRows) throw new HttpError(404, 'Mapping ERP tidak ditemukan.');
    ok(res, { id, sync_mode: 'REFERENCE_ONLY' }, 'Mapping referensi ERP berhasil diperbarui.');
  } catch (error) { duplicate(error, 'Mapping part atau kode item ERP tersebut sudah terdaftar untuk perusahaan yang sama.'); }
}));

sparepartRouter.get('/spareparts/receiving', asyncHandler(async (req, res) => {
  await ensureReceiving();
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '').trim().toUpperCase();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (q) { where.push('(h.receipt_number LIKE ? OR h.po_reference LIKE ? OR h.supplier_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (['SUBMITTED', 'LOCKED', 'CANCELLED'].includes(status)) { where.push('h.status=?'); params.push(status); }
  const [receipts, balances, ledger, parts, bins, stats] = await Promise.all([
    rows<any>(`SELECT h.*,w.warehouse_code,w.warehouse_name,
      COUNT(l.id) line_count,COALESCE(SUM(l.received_qty),0) received_qty,
      COALESCE(SUM(l.accepted_qty),0) accepted_qty,COALESCE(SUM(l.hold_qty),0) hold_qty,COALESCE(SUM(l.rejected_qty),0) rejected_qty
      FROM sparepart_receipt h JOIN sparepart_warehouse w ON w.id=h.warehouse_id
      LEFT JOIN sparepart_receipt_line l ON l.receipt_id=h.id
      WHERE ${where.join(' AND ')} GROUP BY h.id ORDER BY h.received_at DESC,h.id DESC LIMIT 200`, params),
    rows<any>(`SELECT p.id sparepart_id,p.part_code,p.part_name,p.base_uom,w.id warehouse_id,w.warehouse_code,w.warehouse_name,
      b.id bin_id,b.bin_code,r.rack_code,l.lot_number,l.expiry_date,
      COALESCE(SUM(CASE WHEN l.stock_bucket='AVAILABLE' THEN l.quantity_delta ELSE 0 END),0) available_qty,
      COALESCE(SUM(CASE WHEN l.stock_bucket='HOLD' THEN l.quantity_delta ELSE 0 END),0) hold_qty
      FROM sparepart_stock_ledger l JOIN sparepart_master p ON p.id=l.sparepart_id
      JOIN sparepart_warehouse w ON w.id=l.warehouse_id JOIN sparepart_bin b ON b.id=l.bin_id JOIN sparepart_rack r ON r.id=b.rack_id
      GROUP BY p.id,w.id,b.id,l.lot_number,l.expiry_date
      HAVING available_qty<>0 OR hold_qty<>0 ORDER BY p.part_name,w.warehouse_name,r.rack_code,b.bin_code,l.expiry_date`),
    rows<any>(`SELECT l.*,p.part_code,p.part_name,w.warehouse_code,r.rack_code,b.bin_code
      FROM sparepart_stock_ledger l JOIN sparepart_master p ON p.id=l.sparepart_id
      JOIN sparepart_warehouse w ON w.id=l.warehouse_id JOIN sparepart_bin b ON b.id=l.bin_id JOIN sparepart_rack r ON r.id=b.rack_id
      ORDER BY l.movement_at DESC,l.id DESC LIMIT 300`),
    rows<any>(`SELECT id,part_code,part_name,base_uom,is_serialized,is_lot_controlled,has_expiry FROM sparepart_master WHERE status='ACTIVE' ORDER BY part_name`),
    rows<any>(`SELECT b.id,b.bin_code,b.bin_name,r.id rack_id,r.rack_code,w.id warehouse_id,w.warehouse_code,w.warehouse_name
      FROM sparepart_bin b JOIN sparepart_rack r ON r.id=b.rack_id JOIN sparepart_warehouse w ON w.id=r.warehouse_id
      WHERE b.status='ACTIVE' AND r.status='ACTIVE' AND w.status='ACTIVE' ORDER BY w.warehouse_name,r.rack_code,b.bin_code`),
    one<any>(`SELECT
      (SELECT COUNT(*) FROM sparepart_receipt WHERE status='SUBMITTED') pending_receipts,
      (SELECT COUNT(*) FROM sparepart_receipt WHERE status='LOCKED') locked_receipts,
      (SELECT COALESCE(SUM(CASE WHEN stock_bucket='AVAILABLE' THEN quantity_delta ELSE 0 END),0) FROM sparepart_stock_ledger) available_qty,
      (SELECT COALESCE(SUM(CASE WHEN stock_bucket='HOLD' THEN quantity_delta ELSE 0 END),0) FROM sparepart_stock_ledger) hold_qty`),
  ]);
  ok(res, { receipts, balances, ledger, parts, bins, stats });
}));

sparepartRouter.get('/spareparts/receipts/:id', asyncHandler(async (req, res) => {
  await ensureReceiving();
  const id = positiveId(req.params.id, 'Receiving');
  const header = await one<any>(`SELECT h.*,w.warehouse_code,w.warehouse_name FROM sparepart_receipt h JOIN sparepart_warehouse w ON w.id=h.warehouse_id WHERE h.id=?`, [id]);
  if (!header) throw new HttpError(404, 'Dokumen receiving tidak ditemukan.');
  const lines = await rows<any>(`SELECT l.*,p.part_code,p.part_name,p.is_serialized,p.is_lot_controlled,p.has_expiry,r.rack_code,b.bin_code
    FROM sparepart_receipt_line l JOIN sparepart_master p ON p.id=l.sparepart_id JOIN sparepart_bin b ON b.id=l.bin_id JOIN sparepart_rack r ON r.id=b.rack_id
    WHERE l.receipt_id=? ORDER BY l.id`, [id]);
  const serials = await rows<any>(`SELECT s.* FROM sparepart_receipt_serial s JOIN sparepart_receipt_line l ON l.id=s.receipt_line_id WHERE l.receipt_id=? ORDER BY s.receipt_line_id,s.serial_number`, [id]);
  ok(res, { ...header, lines: lines.map((line) => ({ ...line, serials: serials.filter((serial) => serial.receipt_line_id === line.id) })) });
}));

sparepartRouter.post('/spareparts/receipts', asyncHandler(async (req: AuthRequest, res) => {
  await ensureReceiving();
  const warehouseId = positiveId(req.body.warehouse_id, 'Warehouse');
  const warehouse = await one<any>(`SELECT id FROM sparepart_warehouse WHERE id=? AND status='ACTIVE'`, [warehouseId]);
  if (!warehouse) throw new HttpError(422, 'Warehouse tidak aktif atau tidak ditemukan.');
  try {
    const id = await transaction(async (connection) => {
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sparepart_receipt
         (receipt_number,po_reference,supplier_name,warehouse_id,received_at,delivery_note,status,notes,submitted_by,submitted_at,created_by,created_at)
         VALUES (?,?,?,?,?,?,'SUBMITTED',?,?,NOW(),?,NOW())`,
        [receiptNumber(), requiredText(req.body.po_reference, 'Referensi PO', 120), optionalText(req.body.supplier_name, 180), warehouseId, dateTime(req.body.received_at, 'Tanggal penerimaan'), optionalText(req.body.delivery_note, 120), optionalText(req.body.notes, 5000), actor(req), actor(req)],
      );
      await insertReceiptLines(connection, insert.insertId, warehouseId, req.body.lines);
      if (await tableExists('sparepart_receipt_erp_reference')) {
        const sourceCompany = req.body.erp_company ? erpCompany(req.body.erp_company) : null;
        const sourcePoId = Number(req.body.erp_po_id ?? 0);
        if (sourceCompany && Number.isInteger(sourcePoId) && sourcePoId > 0) {
          await connection.execute(
            `INSERT INTO sparepart_receipt_erp_reference (receipt_id,company_code,erp_po_id,erp_po_number,pulled_by,pulled_at)
             VALUES (?,?,?,?,?,NOW())`,
            [insert.insertId, sourceCompany, sourcePoId, requiredText(req.body.po_reference, 'Referensi PO', 120), actor(req)],
          );
        }
      }
      return insert.insertId;
    });
    const saved = await one<any>('SELECT receipt_number,status FROM sparepart_receipt WHERE id=?', [id]);
    created(res, { id, ...saved }, 'Receiving berhasil dicatat dan menunggu penguncian stok.');
  } catch (error) {
    if ((error as any)?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Nomor serial sudah pernah tercatat atau dokumen receiving terduplikasi.');
    throw error;
  }
}));

sparepartRouter.post('/spareparts/receipts/:id/lock', asyncHandler(async (req: AuthRequest, res) => {
  await ensureReceiving();
  const id = positiveId(req.params.id, 'Receiving');
  await transaction(async (connection) => {
    const [headerRows] = await connection.query(`SELECT * FROM sparepart_receipt WHERE id=? FOR UPDATE`, [id]);
    const header = (headerRows as any[])[0];
    if (!header) throw new HttpError(404, 'Dokumen receiving tidak ditemukan.');
    if (header.status === 'LOCKED') return;
    if (header.status !== 'SUBMITTED') throw new HttpError(409, 'Hanya receiving SUBMITTED yang dapat dikunci.');
    const [lineRows] = await connection.query(`SELECT * FROM sparepart_receipt_line WHERE receipt_id=? ORDER BY id`, [id]);
    for (const line of lineRows as any[]) {
      const movements = [
        { bucket: 'AVAILABLE', qty: Number(line.accepted_qty), type: 'RECEIPT_ACCEPTED' },
        { bucket: 'HOLD', qty: Number(line.hold_qty), type: 'RECEIPT_HOLD' },
      ];
      for (const movement of movements) {
        if (movement.qty <= 0) continue;
        await connection.execute(
          `INSERT INTO sparepart_stock_ledger
           (movement_number,movement_type,stock_bucket,sparepart_id,warehouse_id,bin_id,lot_number,expiry_date,quantity_delta,uom,source_type,source_id,source_line_id,reference_number,movement_at,notes,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?, 'RECEIPT',?,?,?,?,?,?,NOW())`,
          [`${header.receipt_number}-${line.id}-${movement.bucket}`, movement.type, movement.bucket, line.sparepart_id, header.warehouse_id, line.bin_id, line.lot_number, line.expiry_date, movement.qty, line.uom, id, line.id, header.po_reference, header.received_at, line.qc_note, actor(req)],
        );
      }
    }
    await connection.execute(`UPDATE sparepart_receipt_serial s JOIN sparepart_receipt_line l ON l.id=s.receipt_line_id SET s.stock_status=CASE s.qc_status WHEN 'ACCEPTED' THEN 'IN_STOCK' WHEN 'HOLD' THEN 'HOLD' ELSE 'REJECTED' END WHERE l.receipt_id=?`, [id]);
    if (await tableExists('sparepart_serial_location')) {
      await connection.execute(`INSERT INTO sparepart_serial_location (receipt_serial_id,sparepart_id,bin_id,stock_bucket,status,updated_at)
        SELECT s.id,s.sparepart_id,l.bin_id,CASE WHEN s.qc_status='HOLD' THEN 'HOLD' ELSE 'AVAILABLE' END,
          CASE WHEN s.qc_status='ACCEPTED' THEN 'IN_STOCK' WHEN s.qc_status='HOLD' THEN 'HOLD' ELSE 'REJECTED' END,NOW()
        FROM sparepart_receipt_serial s JOIN sparepart_receipt_line l ON l.id=s.receipt_line_id
        WHERE l.receipt_id=? AND s.qc_status IN ('ACCEPTED','HOLD')
        ON DUPLICATE KEY UPDATE bin_id=VALUES(bin_id),stock_bucket=VALUES(stock_bucket),status=VALUES(status),updated_at=NOW()`, [id]);
    }
    await connection.execute(`UPDATE sparepart_receipt SET status='LOCKED',locked_by=?,locked_at=NOW() WHERE id=?`, [actor(req), id]);
  });
  ok(res, { id, status: 'LOCKED' }, 'Receiving dikunci dan kartu stok berhasil diperbarui.');
}));

sparepartRouter.post('/spareparts/receipts/:id/cancel', asyncHandler(async (req: AuthRequest, res) => {
  await ensureReceiving();
  const id = positiveId(req.params.id, 'Receiving');
  const result = await execute(`UPDATE sparepart_receipt SET status='CANCELLED',notes=CONCAT_WS('\n',notes,?),locked_by=?,locked_at=NOW() WHERE id=? AND status='SUBMITTED'`, [optionalText(req.body.reason, 500) ?? 'Dibatalkan', actor(req), id]);
  if (!result.affectedRows) throw new HttpError(409, 'Receiving tidak ditemukan atau sudah dikunci/dibatalkan.');
  ok(res, { id, status: 'CANCELLED' }, 'Receiving berhasil dibatalkan tanpa memengaruhi stok.');
}));
