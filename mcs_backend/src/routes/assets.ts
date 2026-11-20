import { getAssetAttachmentRows } from '../lib/asset-attachments.js';
import { getAssetAudit, recordAssetAudit } from '../lib/asset-audit.js';
import { buildAssetWoHistory } from '../lib/asset-history.js';
import { getAssetLocationHistory, recordAssetHierarchyHistory } from '../lib/asset-location-history.js';
import { normalizeAssetLookup } from '../lib/asset-lookup.js';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, hasColumn, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import { buildAssetImportTemplate, importAssetRows, readWorkbookRows } from '../lib/asset-import.js';
import { parseChildAssetWorkbook } from '../lib/child-asset-import.js';
import { buildCustomDetailTemplate, discardExtractedImages, parseCustomDetailWorkbook } from '../lib/custom-detail-import.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection } from 'mysql2/promise';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
const childAssetImportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const childAssetPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext));
  },
});
export const assetRouter = Router();

const assetFields = [
  'AssetCode', 'AssetName', 'AliasName', 'brand', 'CompanyName', 'CategoryAsset',
  'LocationAsset', 'Keterangan', 'active', 'status', 'Remarks', 'id_location_asset', 'mtc_area_key',
  'it_ownership_status', 'pic_user_id', 'pic_name',
];

function bodyFields(body: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined));
}

// Form Create/Edit Aset di web kirim nama field lowercase (asset_name, company,
// location, category, dst) — bodyFields di atas cuma cocokkan nama PERSIS sama
// kolom DB (PascalCase), jadi tanpa ini SEMUA field kecuali `brand` gak pernah
// kesimpen (create selalu gagal, edit "berhasil" tapi diam-diam gak nyimpen apa-apa).
const ASSET_FIELD_ALIASES: Record<string, string> = {
  asset_name: 'AssetName',
  company: 'CompanyName',
  location: 'LocationAsset',
  category: 'CategoryAsset',
  asset_code: 'AssetCode',
  alias_name: 'AliasName',
  serial_number: 'Remarks',
  keterangan: 'Keterangan',
  pic_id: 'pic_user_id',
};

async function resolveAssetPic(value: unknown): Promise<{ pic_user_id: number; pic_name: string }> {
  const id = Number(value ?? 0);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(422, 'PIC utama aset wajib dipilih.');
  const user = await one<{ id_user: number; fullname: string }>(
    'SELECT id_user, fullname FROM tb_user WHERE id_user=? AND active=1 LIMIT 1', [id],
  );
  if (!user) throw new HttpError(422, 'PIC yang dipilih tidak ditemukan atau sudah nonaktif.');
  return { pic_user_id: Number(user.id_user), pic_name: String(user.fullname).trim() };
}

function normalizeAssetBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const [from, to] of Object.entries(ASSET_FIELD_ALIASES)) {
    if (out[from] !== undefined && out[to] === undefined) out[to] = out[from];
  }
  if (out.is_active !== undefined && out.active === undefined) out.active = out.is_active ? 'active' : 'inactive';
  if (out.it_ownership_status === '') out.it_ownership_status = null;
  return out;
}

interface HierarchyAssetRow {
  AssetID: number;
  AssetCode: string;
  AssetName: string;
  CompanyName: string | null;
  parent_asset_id: number | null;
}

async function hierarchyAssetByCode(connection: PoolConnection, assetCode: string, lock = false): Promise<HierarchyAssetRow | null> {
  const [result] = await connection.execute(
    `SELECT AssetID, AssetCode, AssetName, CompanyName, parent_asset_id
     FROM asset WHERE AssetCode=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [assetCode],
  );
  return ((result as HierarchyAssetRow[])[0] ?? null);
}

async function assertHierarchyHasNoCycle(connection: PoolConnection, childId: number, parentId: number): Promise<void> {
  let cursor: number | null = parentId;
  const visited = new Set<number>();
  while (cursor) {
    if (cursor === childId) throw new HttpError(409, 'Relasi ini akan membuat siklus parent-child.');
    if (visited.has(cursor)) throw new HttpError(409, 'Struktur parent-child yang dipilih sudah mengandung siklus.');
    visited.add(cursor);
    const queryResult: unknown = (await connection.execute('SELECT parent_asset_id FROM asset WHERE AssetID=? LIMIT 1', [cursor]))[0];
    const row: { parent_asset_id: number | null } | undefined = (queryResult as Array<{ parent_asset_id: number | null }>)[0];
    cursor = row?.parent_asset_id ? Number(row.parent_asset_id) : null;
  }
}

const CUSTOM_DETAIL_DIR = path.join(config.uploadDir, 'customDetails');
fs.mkdirSync(CUSTOM_DETAIL_DIR, { recursive: true });

const IMPORT_DIR = path.join(config.uploadDir, 'customDetailImports');
fs.mkdirSync(IMPORT_DIR, { recursive: true });

function imageDiskStorage(dir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const customDetailImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext));
  },
});

const excelImportUpload = multer({ storage: imageDiskStorage(IMPORT_DIR), limits: { fileSize: 25 * 1024 * 1024 } });

async function customDetailRowsWithImages(assetCode: string): Promise<Record<string, unknown>[]> {
  const details = await rows<Record<string, unknown>>(
    'SELECT * FROM asset_custom_details WHERE asset_code = ? ORDER BY row_order, id',
    [assetCode],
  );
  if (!details.length) return [];

  const ids = details.map((d) => d.id);
  const images = await rows<Record<string, unknown>>(
    `SELECT * FROM asset_custom_detail_images WHERE custom_detail_id IN (${ids.map(() => '?').join(',')}) ORDER BY image_type, image_order`,
    ids,
  );

  return details.map((d) => ({
    ...d,
    images: images
      .filter((img) => img.custom_detail_id === d.id)
      .map((img) => ({ ...img, url: `/uploads/${String(img.image_path)}` })),
  }));
}

async function unlinkCustomDetailImage(imagePath: string): Promise<void> {
  if (!imagePath) return;
  const abs = path.join(config.uploadDir, imagePath);
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch {}
  }
  await deleteObjectKey(imagePath);
}

async function unlinkChildAssetPhoto(imagePath: string | null | undefined): Promise<void> {
  if (!imagePath) return;
  const abs = path.join(config.uploadDir, imagePath);
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); } catch {}
  }
  await deleteObjectKey(imagePath);
}

assetRouter.get('/assets/options', authenticate, asyncHandler(async (_req, res) => {
  // asset.CompanyName/CategoryAsset/LocationAsset simpan NAMA (bukan kode) —
  // value harus sama persis dengan itu supaya dropdown edit bisa cocokkan
  // aset yang sedang dibuka ke salah satu <option>-nya.
  const [companies, categories, locations] = await Promise.all([
    rows<{ company_name: string }>('SELECT * FROM tb_company'),
    rows<{ category_name: string }>('SELECT * FROM tb_category_asset'),
    rows<{ location_name: string }>('SELECT * FROM tb_location_asset'),
  ]);
  ok(res, {
    companies: companies.map((c) => ({ value: c.company_name, label: c.company_name })),
    categories: categories.map((c) => ({ value: c.category_name, label: c.category_name })),
    locations: locations.map((c) => ({ value: c.location_name, label: c.location_name })),
  });
}));

assetRouter.get('/assets/pic-options', authenticate, asyncHandler(async (_req, res) => {
  const picReady = await hasColumn('asset', 'pic_user_id');
  const data = await rows(
    `SELECT u.id_user AS value,u.fullname AS label,u.username,d.division_name AS division,
            ${picReady ? 'COUNT(a.AssetID)' : '0'} AS asset_count
     FROM tb_user u
     LEFT JOIN tb_division d ON d.id_division=u.id_division
     ${picReady ? 'LEFT JOIN asset a ON a.pic_user_id=u.id_user' : ''}
     WHERE u.active=1
     GROUP BY u.id_user,u.fullname,u.username,d.division_name
     ORDER BY u.fullname`,
  );
  ok(res, data);
}));

assetRouter.get('/assets/pic-summary', authenticate, asyncHandler(async (_req, res) => {
  if (!await hasColumn('asset', 'pic_user_id')) return ok(res, { rows: [], missing_pic: 0, migration_required: true });
  const data = await rows(
    `SELECT a.pic_user_id,u.fullname AS pic_name,u.username,d.division_name AS division,
            COUNT(*) AS total_assets,
            SUM(a.active='active') AS active_assets,
            SUM(a.active='inactive') AS disabled_assets,
            SUM(a.it_ownership_status='inventory') AS inventory_it_assets
     FROM asset a
     JOIN tb_user u ON u.id_user=a.pic_user_id
     LEFT JOIN tb_division d ON d.id_division=u.id_division
     GROUP BY a.pic_user_id,u.fullname,u.username,d.division_name
     ORDER BY u.fullname`,
  );
  const missing = await one<{ total: number }>(
    "SELECT COUNT(*) total FROM asset WHERE active='active' AND pic_user_id IS NULL",
  );
  ok(res, { rows: data, missing_pic: Number(missing?.total ?? 0) });
}));

assetRouter.get('/assets', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  // Halaman Assets Manage kirim `per_page` (bukan `limit`) dan meta
  // `total_pages` dibutuhkan Pagination untuk tombol "berikutnya" — tanpa
  // dua ini, list selalu ke-pin 25 baris dan tombol next selalu nonaktif.
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page ?? 25)));
  const q = normalizeAssetLookup(req.query.q);

  const where: string[] = [];
  const params: unknown[] = [];
  const picReady = await hasColumn('asset', 'pic_user_id');
  if (q) {
    const searchFields = ['AssetID', 'AssetCode', 'AssetName', 'AliasName', 'brand', 'Keterangan', 'CompanyName', 'LocationAsset', 'CategoryAsset', ...(picReady ? ['pic_name'] : [])];
    where.push(`(${searchFields.map((f) => `${f} LIKE ?`).join(' OR ')})`);
    params.push(...searchFields.map(() => `%${q}%`));
  }
  const company = String(req.query.company ?? '').trim();
  if (company) { where.push('CompanyName = ?'); params.push(company); }
  const location = String(req.query.location ?? '').trim();
  if (location) { where.push('LocationAsset = ?'); params.push(location); }
  const category = String(req.query.category ?? '').trim();
  if (category) { where.push('CategoryAsset = ?'); params.push(category); }
  const isActive = String(req.query.is_active ?? '').trim();
  if (isActive === '1') { where.push("active = 'active'"); }
  else if (isActive === '0') { where.push("active = 'inactive'"); }
  const scope = String(req.query.scope ?? '').trim().toLowerCase();
  if (scope === 'inventory_it') where.push("it_ownership_status = 'inventory'");
  else if (scope === 'disabled') where.push("active = 'inactive'");
  else if (scope === 'missing_pic') where.push(picReady ? 'pic_user_id IS NULL' : '1=0');
  const picUserId = Number(req.query.pic_user_id ?? 0);
  if (Number.isInteger(picUserId) && picUserId > 0) {
    if (!picReady) where.push('1=0');
    else { where.push('pic_user_id = ?'); params.push(picUserId); }
  }
  const unlinkedOnly = ['1', 'true', 'yes', 'on'].includes(String(req.query.unlinked_only ?? '').toLowerCase());
  if (unlinkedOnly) where.push('parent_asset_id IS NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM asset ${whereSql}`, params);
  const totalCount = Number(total?.total ?? 0);
  const data = await rows(`SELECT * FROM asset ${whereSql} ORDER BY AssetID DESC LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
  ok(res, data, 'OK', { page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)) });
}));

assetRouter.post('/assets', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  if (!await hasColumn('asset', 'pic_user_id')) throw new HttpError(503, 'Migration PIC aset belum dijalankan.');
  const fields = bodyFields(normalizeAssetBody(req.body), assetFields);
  if (!fields.AssetCode || !fields.AssetName) throw new HttpError(400, 'AssetCode and AssetName are required');
  Object.assign(fields, await resolveAssetPic(fields.pic_user_id));

  const keys = Object.keys(fields);
  const user = (req as AuthRequest).user!;
  const result = await execute(
    `INSERT INTO asset (${keys.map((k) => `\`${k}\``).join(', ')}, created_at, created_by, updated_by) VALUES (${keys.map(() => '?').join(', ')}, NOW(), ?, ?)`,
    [...Object.values(fields), user.fullname, user.fullname],
  );
  created(res, { AssetID: result.insertId }, 'Asset created');
}));

assetRouter.get('/assets/detail', authenticate, asyncHandler(async (req, res) => {
  // Web mengirim query param `asset` (lihat lib/api/assets.ts getAssetDetail) —
  // sebelumnya gak pernah dicek di sini, jadi endpoint ini SELALU gagal
  // "Asset ID is required" buat siapapun yang buka halaman detail aset.
  const rawId = req.query.id ?? req.query.AssetID ?? req.query.asset_id ?? req.query.asset;
  if (!rawId) throw new HttpError(400, 'Asset ID is required');
  const id = normalizeAssetLookup(rawId);
  if (!id) throw new HttpError(400, 'Asset ID is required');

  const asset = await one('SELECT * FROM asset WHERE AssetID = ? OR AssetCode = ? LIMIT 1', [id, id]);
  if (!asset) throw new HttpError(404, 'Asset not found');

  const code = String((asset as Record<string, unknown>).AssetCode);
  const assetId = Number((asset as Record<string, unknown>).AssetID ?? 0);
  const parentId = Number((asset as Record<string, unknown>).parent_asset_id ?? 0);
  const hasImportedGroups = await tableExists('asset_child_import_group');
  const hasImportedDetailPhotos = await tableExists('asset_child_import_detail_photo');
  const hasEnergyProfile = await tableExists('energy_asset_profile');
  const hasFleetProfile = await tableExists('fleet_vehicle_profile');
  const [details, attachments, parts, history, locationHistory, picHistory, auditTimeline, parent, children, importedGroups, energyProfile, fleetProfile] = await Promise.all([
    rows('SELECT * FROM asset_custom_details WHERE asset_code = ? ORDER BY row_order, id', [code]),
    getAssetAttachmentRows(code),
    rows('SELECT * FROM tb_parts_bom WHERE AssetCode = ? AND deleted_at IS NULL ORDER BY no_urut, id', [code]),
    assetId ? buildAssetWoHistory(assetId) : Promise.resolve([]),
    assetId ? getAssetLocationHistory(assetId) : Promise.resolve([]),
    assetId && await tableExists('asset_pic_history')
      ? rows(`SELECT * FROM asset_pic_history WHERE asset_id=? ORDER BY changed_at DESC,id DESC`, [assetId])
      : Promise.resolve([]),
    assetId ? getAssetAudit(assetId) : Promise.resolve([]),
    parentId ? one('SELECT AssetCode, AssetName FROM asset WHERE AssetID = ?', [parentId]) : Promise.resolve(null),
    assetId
      ? rows('SELECT AssetID, AssetCode, AssetName, CategoryAsset, LocationAsset, active FROM asset WHERE parent_asset_id = ? ORDER BY AssetName', [assetId])
      : Promise.resolve([]),
    assetId && hasImportedGroups
      ? rows(`SELECT g.id, g.child_name, g.source_row, g.source_file, g.created_at
              FROM asset_child_import_group g
              WHERE g.parent_asset_id = ? ORDER BY g.id`, [assetId])
      : Promise.resolve([]),
    assetId && hasEnergyProfile
      ? one(`SELECT p.*, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset,
              a.CategoryAsset, a.active AS asset_status,
              m.id AS meter_id, m.parent_meter_id, m.meter_number, m.meter_type,
              m.unit AS meter_unit, m.multiplier AS meter_multiplier, m.digit_count,
              m.rollover_value, m.reading_frequency,
              m.effective_from AS meter_effective_from, m.effective_to AS meter_effective_to,
              g.id AS genset_profile_id, g.serial_number, g.rated_kva, g.rated_kw,
              g.fuel_type AS genset_fuel_type, g.tank_capacity_liter,
              g.initial_hour_meter, g.current_hour_meter,
              t.id AS fuel_tank_id, t.tank_number, t.fuel_type AS tank_fuel_type,
              t.capacity_liter, t.minimum_level_liter, t.maximum_level_liter,
              t.reference_balance_liter
             FROM energy_asset_profile p
             INNER JOIN asset a ON a.AssetID=p.asset_id
             LEFT JOIN energy_meter m ON m.energy_profile_id=p.id
             LEFT JOIN energy_genset_profile g ON g.energy_profile_id=p.id
             LEFT JOIN energy_fuel_tank t ON t.energy_profile_id=p.id
             WHERE p.asset_id=? LIMIT 1`, [assetId])
      : Promise.resolve(null),
    assetId && hasFleetProfile
      ? one(`SELECT v.*,
          CASE
            WHEN (SELECT MAX(i.inspected_at) FROM fleet_daily_inspection i WHERE i.vehicle_id=v.id AND i.status='APPROVED') IS NULL THEN 1
            WHEN v.inspection_frequency='WEEKLY' THEN TIMESTAMPDIFF(DAY,(SELECT MAX(i.inspected_at) FROM fleet_daily_inspection i WHERE i.vehicle_id=v.id AND i.status='APPROVED'),NOW()) >= 7
            WHEN v.inspection_frequency='MONTHLY' THEN TIMESTAMPDIFF(DAY,(SELECT MAX(i.inspected_at) FROM fleet_daily_inspection i WHERE i.vehicle_id=v.id AND i.status='APPROVED'),NOW()) >= 30
            ELSE TIMESTAMPDIFF(DAY,(SELECT MAX(i.inspected_at) FROM fleet_daily_inspection i WHERE i.vehicle_id=v.id AND i.status='APPROVED'),NOW()) >= 1
          END AS inspection_due,
          CASE WHEN
            (v.preventive_interval_days IS NOT NULL AND (SELECT MAX(s.completed_at) FROM fleet_service_history s WHERE s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED') IS NULL)
            OR (v.preventive_interval_days IS NOT NULL AND TIMESTAMPDIFF(DAY,(SELECT MAX(s.completed_at) FROM fleet_service_history s WHERE s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED'),NOW()) >= v.preventive_interval_days)
            OR (v.preventive_interval_meter IS NOT NULL AND v.current_meter >= COALESCE((SELECT s.meter_value FROM fleet_service_history s WHERE s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED' ORDER BY s.completed_at DESC LIMIT 1),0)+v.preventive_interval_meter)
          THEN 1 ELSE 0 END AS preventive_due
        FROM fleet_vehicle_profile v WHERE v.asset_id=? LIMIT 1`, [assetId])
      : Promise.resolve(null),
  ]);
  const importedGroupRows = importedGroups as Array<Record<string, unknown>>;
  const importedGroupIds = importedGroupRows.map((group) => Number(group.id)).filter(Boolean);
  const importedDetailRows = importedGroupIds.length
    ? await rows<Record<string, unknown>>(
      `SELECT d.id, d.group_id, d.item_name, d.condition_text, d.frequency, d.pic, d.source_row, d.sort_order,
              l.linked_asset_id, a.AssetCode, a.AssetName, a.CategoryAsset, a.LocationAsset, a.active
       FROM asset_child_import_detail d
       LEFT JOIN asset_child_import_detail_link l ON l.detail_id = d.id
       LEFT JOIN asset a ON a.AssetID = l.linked_asset_id
       WHERE d.group_id IN (${importedGroupIds.map(() => '?').join(',')})
       ORDER BY d.group_id, d.sort_order, d.id`,
      importedGroupIds,
    )
    : [];
  const detailIds = importedDetailRows.map((detail) => Number(detail.id)).filter(Boolean);
  const detailPhotos = detailIds.length && hasImportedDetailPhotos
    ? await rows<Record<string, unknown>>(
      `SELECT detail_id, photo_1_path, photo_1_name, photo_1_mime,
              photo_2_path, photo_2_name, photo_2_mime
       FROM asset_child_import_detail_photo
       WHERE detail_id IN (${detailIds.map(() => '?').join(',')})`,
      detailIds,
    )
    : [];
  const photoByDetail = new Map(detailPhotos.map((photo) => [Number(photo.detail_id), photo]));
  const importedDetails: Record<string, unknown>[] = importedDetailRows.map((detail): Record<string, unknown> => {
    const photo = photoByDetail.get(Number(detail.id));
    return {
      ...detail,
      ...(photo ?? {}),
      photo_1_url: photo?.photo_1_path ? `/uploads/${String(photo.photo_1_path).replace(/^\/+/, '')}` : null,
      photo_2_url: photo?.photo_2_path ? `/uploads/${String(photo.photo_2_path).replace(/^\/+/, '')}` : null,
    };
  });
  const relatedGroups = importedGroupRows.map((group) => ({
    ...group,
    items: importedDetails.filter((item) => Number(item.group_id) === Number(group.id)),
  }));
  const parentRow = parent as Record<string, unknown> | null;
  ok(res, {
    ...asset as object,
    custom_details: details,
    attachments,
    parts,
    history,
    location_history: locationHistory,
    pic_history: picHistory,
    audit_timeline: auditTimeline,
    parent_asset_code: parentRow?.AssetCode ?? null,
    parent_asset_name: parentRow?.AssetName ?? null,
    children,
    related_groups: relatedGroups,
    energy_profile: energyProfile,
    fleet_profile: fleetProfile,
  });
}));

assetRouter.patch('/assets/detail', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  if (!await hasColumn('asset', 'pic_user_id')) throw new HttpError(503, 'Migration PIC aset belum dijalankan.');
  // Web mengirim `asset`/`asset_code` di body + query (lihat lib/api/assets.ts
  // updateAsset) — sebelumnya gak pernah dicek, jadi endpoint ini SELALU
  // gagal "Asset ID is required" buat siapapun yang nyimpen edit aset.
  const id = req.body.AssetID ?? req.query.id ?? req.body.asset ?? req.body.asset_code ?? req.query.asset;
  if (!id) throw new HttpError(400, 'Asset ID is required');

  const fields = bodyFields(normalizeAssetBody(req.body), assetFields);
  Object.assign(fields, await resolveAssetPic(fields.pic_user_id));
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No changes provided');

  // `id` bisa berupa AssetID numerik ATAU AssetCode (string) — sama seperti
  // GET /assets/detail, terima keduanya.
  await execute(
    `UPDATE asset SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = NOW(), updated_by = ? WHERE AssetID = ? OR AssetCode = ?`,
    [...Object.values(fields), (req as AuthRequest).user!.fullname, id, id],
  );
  ok(res, null, 'Asset updated');
}));

/**
 * Relasi induk-anak antar aset (mis. "Ruangan IT" sebagai induk, PC-PC di
 * dalamnya sebagai anak) — beda dari BOM (`tb_parts_bom`, spare part, bukan
 * aset). Satu aset cuma boleh punya 1 induk (pohon sederhana). Anak tetap
 * baris mandiri di daftar aset, cuma ditautkan lewat `parent_asset_id`.
 */
assetRouter.post('/assets/children', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const parentCode = String(req.body.parent_asset ?? '').trim();
  const childCode = String(req.body.child_asset ?? '').trim();
  if (!parentCode || !childCode) throw new HttpError(400, 'parent_asset and child_asset are required');
  if (parentCode === childCode) throw new HttpError(400, 'An asset cannot be its own parent');

  const actor = (req as AuthRequest).user!.fullname;
  await transaction(async (connection) => {
    const parent = await hierarchyAssetByCode(connection, parentCode, true);
    if (!parent) throw new HttpError(404, 'Parent asset not found');
    const child = await hierarchyAssetByCode(connection, childCode, true);
    if (!child) throw new HttpError(404, 'Child asset not found');
    if (Number(parent.AssetID) === Number(child.AssetID)) throw new HttpError(400, 'An asset cannot be its own parent');
    if (child.parent_asset_id) {
      const [currentResult] = await connection.execute('SELECT AssetCode FROM asset WHERE AssetID=? LIMIT 1', [child.parent_asset_id]);
      const currentCode = String((currentResult as Array<{ AssetCode: string }>)[0]?.AssetCode ?? 'asset lain');
      throw new HttpError(409, `Asset sudah tertaut ke ${currentCode}. Gunakan Mutasi/Pindah untuk mengganti parent.`);
    }
    await assertHierarchyHasNoCycle(connection, child.AssetID, parent.AssetID);
    await connection.execute('UPDATE asset SET parent_asset_id=?, updated_at=NOW(), updated_by=? WHERE AssetID=?', [parent.AssetID, actor, child.AssetID]);
    await recordAssetHierarchyHistory(connection, child, null, parent, actor);
  });
  ok(res, null, 'Child asset attached');
}));

assetRouter.post('/assets/children/detach', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const childCode = String(req.body.child_asset ?? '').trim();
  if (!childCode) throw new HttpError(400, 'child_asset is required');
  const actor = (req as AuthRequest).user!.fullname;
  const hasImportedDetailLinks = await tableExists('asset_child_import_detail_link');
  await transaction(async (connection) => {
    const child = await hierarchyAssetByCode(connection, childCode, true);
    if (!child) throw new HttpError(404, 'Child asset not found');
    if (!child.parent_asset_id) throw new HttpError(409, 'Asset ini tidak sedang tertaut ke parent mana pun.');
    const [parentResult] = await connection.execute(
      'SELECT AssetID, AssetCode, AssetName, CompanyName, parent_asset_id FROM asset WHERE AssetID=? LIMIT 1',
      [child.parent_asset_id],
    );
    const parent = ((parentResult as HierarchyAssetRow[])[0] ?? null);
    await connection.execute('UPDATE asset SET parent_asset_id=NULL, updated_at=NOW(), updated_by=? WHERE AssetID=?', [actor, child.AssetID]);
    if (hasImportedDetailLinks) await connection.execute('DELETE FROM asset_child_import_detail_link WHERE linked_asset_id=?', [child.AssetID]);
    await recordAssetHierarchyHistory(connection, child, parent, null, actor);
  });
  ok(res, null, 'Child asset detached');
}));

assetRouter.post('/assets/children/move', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const childCode = String(req.body.child_asset ?? '').trim();
  const nextParentCode = String(req.body.new_parent_asset ?? req.body.parent_asset ?? '').trim();
  if (!childCode || !nextParentCode) throw new HttpError(400, 'child_asset and new_parent_asset are required');
  const actor = (req as AuthRequest).user!.fullname;
  const hasImportedDetailLinks = await tableExists('asset_child_import_detail_link');

  await transaction(async (connection) => {
    const child = await hierarchyAssetByCode(connection, childCode, true);
    if (!child) throw new HttpError(404, 'Child asset not found');
    if (!child.parent_asset_id) throw new HttpError(409, 'Asset belum memiliki parent. Gunakan Tautkan, bukan Mutasi/Pindah.');
    const nextParent = await hierarchyAssetByCode(connection, nextParentCode, true);
    if (!nextParent) throw new HttpError(404, 'Parent tujuan tidak ditemukan');
    if (child.AssetID === nextParent.AssetID) throw new HttpError(400, 'Asset tidak dapat menjadi parent bagi dirinya sendiri.');
    if (Number(child.parent_asset_id) === Number(nextParent.AssetID)) throw new HttpError(409, 'Asset sudah tertaut ke parent tujuan tersebut.');

    const [previousResult] = await connection.execute(
      'SELECT AssetID, AssetCode, AssetName, CompanyName, parent_asset_id FROM asset WHERE AssetID=? LIMIT 1 FOR UPDATE',
      [child.parent_asset_id],
    );
    const previousParent = ((previousResult as HierarchyAssetRow[])[0] ?? null);
    await assertHierarchyHasNoCycle(connection, child.AssetID, nextParent.AssetID);
    await connection.execute('UPDATE asset SET parent_asset_id=?, updated_at=NOW(), updated_by=? WHERE AssetID=?', [nextParent.AssetID, actor, child.AssetID]);
    if (hasImportedDetailLinks) await connection.execute('DELETE FROM asset_child_import_detail_link WHERE linked_asset_id=?', [child.AssetID]);
    await recordAssetHierarchyHistory(connection, child, previousParent, nextParent, actor);
  });

  ok(res, null, 'Child asset moved');
}));

assetRouter.post('/assets/children/manual', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  if (!(await tableExists('asset_child_import_group')) || !(await tableExists('asset_child_import_detail')) || !(await tableExists('asset_child_import_detail_photo'))) {
    throw new HttpError(409, 'Migration asset_child_manual_photo belum dijalankan.');
  }

  const parentCode = normalizeAssetLookup(req.body.parent_asset ?? req.body.asset_code);
  const groupName = String(req.body.group_name ?? req.body.child_name ?? '').trim();
  const rawItems: unknown[] = Array.isArray(req.body.items) ? req.body.items : [];
  if (!parentCode || !groupName) throw new HttpError(422, 'Aset induk dan nama kelompok wajib diisi.');
  if (groupName.length > 255) throw new HttpError(422, 'Nama kelompok maksimal 255 karakter.');
  if (!rawItems.length) throw new HttpError(422, 'Tambahkan minimal satu komponen.');
  if (rawItems.length > 50) throw new HttpError(422, 'Maksimal 50 komponen dalam satu penyimpanan.');

  const items: Array<{ itemName: string; conditionText: string | null; frequency: string | null; pic: string | null }> = rawItems.map((raw: unknown, index: number) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const itemName = String(item.item_name ?? item.name ?? '').trim();
    if (!itemName) throw new HttpError(422, `Nama komponen baris ${index + 1} wajib diisi.`);
    if (itemName.length > 255) throw new HttpError(422, `Nama komponen baris ${index + 1} maksimal 255 karakter.`);
    return {
      itemName,
      conditionText: String(item.condition_text ?? '').trim() || null,
      frequency: String(item.frequency ?? '').trim().slice(0, 80) || null,
      pic: String(item.pic ?? '').trim().slice(0, 120) || null,
    };
  });
  const names = items.map((item) => item.itemName.toLocaleLowerCase('id-ID'));
  if (new Set(names).size !== names.length) throw new HttpError(409, 'Nama komponen dalam kelompok tidak boleh ganda.');

  const actor = (req as AuthRequest).user!.fullname;
  const result = await transaction(async (connection) => {
    const parent = await hierarchyAssetByCode(connection, parentCode, true);
    if (!parent) throw new HttpError(404, 'Aset induk tidak ditemukan.');

    const [groupRows] = await connection.execute(
      'SELECT id FROM asset_child_import_group WHERE parent_asset_id=? AND child_name=? LIMIT 1 FOR UPDATE',
      [parent.AssetID, groupName],
    );
    let groupId = Number((groupRows as Array<{ id: number }>)[0]?.id ?? 0);
    if (!groupId) {
      const [inserted] = await connection.execute(
        `INSERT INTO asset_child_import_group
          (parent_asset_id, child_name, source_file, created_by, created_at)
         VALUES (?, ?, 'MANUAL', ?, NOW())`,
        [parent.AssetID, groupName, actor],
      );
      groupId = Number((inserted as { insertId: number }).insertId);
    }

    const [duplicateRows] = await connection.execute(
      `SELECT item_name FROM asset_child_import_detail
       WHERE group_id=? AND item_name IN (${items.map(() => '?').join(',')})`,
      [groupId, ...items.map((item) => item.itemName)],
    );
    const duplicates = (duplicateRows as Array<{ item_name: string }>).map((row) => row.item_name);
    if (duplicates.length) throw new HttpError(409, `Komponen sudah tersedia: ${duplicates.join(', ')}.`);

    const [sortRows] = await connection.execute(
      'SELECT COALESCE(MAX(sort_order),0) AS max_sort FROM asset_child_import_detail WHERE group_id=? FOR UPDATE',
      [groupId],
    );
    let sortOrder = Number((sortRows as Array<{ max_sort: number }>)[0]?.max_sort ?? 0);
    const createdItems: Array<{ id: number; item_name: string }> = [];
    for (const item of items) {
      sortOrder += 1;
      const [inserted] = await connection.execute(
        `INSERT INTO asset_child_import_detail
          (group_id, item_name, condition_text, frequency, pic, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [groupId, item.itemName, item.conditionText, item.frequency, item.pic, sortOrder],
      );
      createdItems.push({ id: Number((inserted as { insertId: number }).insertId), item_name: item.itemName });
    }
    return { group_id: groupId, group_name: groupName, items: createdItems };
  });

  created(res, result, 'Kelompok aset terkait berhasil ditambahkan.');
}));

assetRouter.post(
  '/assets/children/pending/:id/photo',
  authenticate,
  requirePermission('privilage_asset'),
  childAssetPhotoUpload.single('photo'),
  asyncHandler(async (req, res) => {
    if (!(await tableExists('asset_child_import_detail_photo'))) throw new HttpError(409, 'Migration asset_child_manual_photo belum dijalankan.');
    const detailId = Number(req.params.id ?? 0);
    const slot = Number(req.body.slot ?? 0);
    if (!Number.isInteger(detailId) || detailId <= 0) throw new HttpError(422, 'ID komponen tidak valid.');
    if (slot !== 1 && slot !== 2) throw new HttpError(422, 'Slot foto harus 1 atau 2.');
    if (!req.file) throw new HttpError(422, 'Pilih file foto yang akan diunggah.');
    const detail = await one<{ id: number }>('SELECT id FROM asset_child_import_detail WHERE id=? LIMIT 1', [detailId]);
    if (!detail) throw new HttpError(404, 'Komponen aset terkait tidak ditemukan.');

    const existing = await one<Record<string, unknown>>('SELECT * FROM asset_child_import_detail_photo WHERE detail_id=? LIMIT 1', [detailId]);
    const oldPath = String(existing?.[`photo_${slot}_path`] ?? '');
    const photoPath = await saveUploadedFile(req.file.buffer, `assetChildren/${detailId}`, req.file.originalname, req.file.mimetype);
    const actor = (req as AuthRequest).user!.fullname;
    await execute(
      `INSERT INTO asset_child_import_detail_photo
        (detail_id, photo_${slot}_path, photo_${slot}_name, photo_${slot}_mime, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        photo_${slot}_path=VALUES(photo_${slot}_path), photo_${slot}_name=VALUES(photo_${slot}_name),
        photo_${slot}_mime=VALUES(photo_${slot}_mime), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [detailId, photoPath, req.file.originalname, req.file.mimetype, actor, actor],
    );
    if (oldPath && oldPath !== photoPath) await unlinkChildAssetPhoto(oldPath);
    ok(res, { detail_id: detailId, slot, url: `/uploads/${photoPath}` }, `Foto ${slot} berhasil disimpan.`);
  }),
);

assetRouter.delete('/assets/children/pending/:id/photo/:slot', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  if (!(await tableExists('asset_child_import_detail_photo'))) throw new HttpError(409, 'Migration asset_child_manual_photo belum dijalankan.');
  const detailId = Number(req.params.id ?? 0);
  const slot = Number(req.params.slot ?? 0);
  if (!Number.isInteger(detailId) || detailId <= 0 || (slot !== 1 && slot !== 2)) throw new HttpError(422, 'ID komponen atau slot foto tidak valid.');
  const existing = await one<Record<string, unknown>>('SELECT * FROM asset_child_import_detail_photo WHERE detail_id=? LIMIT 1', [detailId]);
  if (!existing) throw new HttpError(404, 'Foto komponen tidak ditemukan.');
  const oldPath = String(existing[`photo_${slot}_path`] ?? '');
  if (!oldPath) throw new HttpError(404, `Foto ${slot} belum diisi.`);
  await execute(
    `UPDATE asset_child_import_detail_photo
     SET photo_${slot}_path=NULL, photo_${slot}_name=NULL, photo_${slot}_mime=NULL, updated_at=NOW(), updated_by=?
     WHERE detail_id=?`,
    [(req as AuthRequest).user!.fullname, detailId],
  );
  await unlinkChildAssetPhoto(oldPath);
  ok(res, { detail_id: detailId, slot }, `Foto ${slot} dihapus.`);
}));

assetRouter.post('/assets/children/pending/link', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const pendingId = Number(req.body.pending_id ?? 0);
  const childCode = normalizeAssetLookup(req.body.child_asset);
  if (!Number.isInteger(pendingId) || pendingId <= 0 || !childCode) {
    throw new HttpError(422, 'pending_id dan child_asset wajib diisi.');
  }
  if (!(await tableExists('asset_child_import_detail_link'))) {
    throw new HttpError(409, 'Migration asset_child_import_hierarchy belum dijalankan.');
  }

  const actor = (req as AuthRequest).user!.fullname;
  await transaction(async (connection) => {
    const [pendingResult] = await connection.execute(
      `SELECT d.id, d.item_name, g.parent_asset_id, g.child_name, l.linked_asset_id,
              a.AssetID AS parent_id, a.AssetCode AS parent_code,
              a.AssetName AS parent_name, a.CompanyName AS parent_company
       FROM asset_child_import_detail d
       JOIN asset_child_import_group g ON g.id = d.group_id
       JOIN asset a ON a.AssetID = g.parent_asset_id
       LEFT JOIN asset_child_import_detail_link l ON l.detail_id = d.id
       WHERE d.id=? LIMIT 1 FOR UPDATE`,
      [pendingId],
    );
    const pending = (pendingResult as Array<{
      id: number;
      parent_asset_id: number;
      child_name: string;
      item_name: string;
      linked_asset_id: number | null;
      parent_id: number;
      parent_code: string;
      parent_name: string;
      parent_company: string | null;
    }>)[0];
    if (!pending) throw new HttpError(404, 'Komponen aset terkait tidak ditemukan.');
    if (pending.linked_asset_id) throw new HttpError(409, 'Komponen ini sudah tertaut ke asset. Lepas tautannya terlebih dahulu.');

    const child = await hierarchyAssetByCode(connection, childCode, true);
    if (!child) throw new HttpError(404, 'Asset Code / QR tidak ditemukan.');
    if (Number(child.AssetID) === Number(pending.parent_id)) throw new HttpError(400, 'Aset induk tidak dapat menjadi anak dari dirinya sendiri.');
    if (child.parent_asset_id) {
      const [currentResult] = await connection.execute('SELECT AssetCode FROM asset WHERE AssetID=? LIMIT 1', [child.parent_asset_id]);
      const currentCode = String((currentResult as Array<{ AssetCode: string }>)[0]?.AssetCode ?? 'asset lain');
      throw new HttpError(409, `Asset sudah tertaut ke ${currentCode}. Gunakan Mutasi/Pindah untuk mengganti parent.`);
    }

    await assertHierarchyHasNoCycle(connection, child.AssetID, pending.parent_id);
    await connection.execute(
      'UPDATE asset SET parent_asset_id=?, updated_at=NOW(), updated_by=? WHERE AssetID=?',
      [pending.parent_id, actor, child.AssetID],
    );
    await recordAssetHierarchyHistory(connection, child, null, {
      AssetID: pending.parent_id,
      AssetCode: pending.parent_code,
      AssetName: pending.parent_name,
      CompanyName: pending.parent_company,
    }, actor);
    await connection.execute(
      `INSERT INTO asset_child_import_detail_link (detail_id, linked_asset_id, created_by, created_at)
       VALUES (?, ?, ?, NOW())`,
      [pending.id, child.AssetID, actor],
    );
  });
  ok(res, null, 'Asset Code / QR berhasil ditautkan.');
}));

assetRouter.post('/assets/children/pending/delete', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const pendingId = Number(req.body.pending_id ?? 0);
  if (!Number.isInteger(pendingId) || pendingId <= 0) throw new HttpError(422, 'pending_id wajib diisi.');
  if (!(await tableExists('asset_child_import_detail_link'))) throw new HttpError(409, 'Migration asset_child_import_hierarchy belum dijalankan.');
  const hasPhotoTable = await tableExists('asset_child_import_detail_photo');
  const removed = await transaction(async (connection) => {
    const [detailRows] = await connection.execute(
      `SELECT d.group_id, l.linked_asset_id
       FROM asset_child_import_detail d
       LEFT JOIN asset_child_import_detail_link l ON l.detail_id=d.id
       WHERE d.id=? LIMIT 1 FOR UPDATE`,
      [pendingId],
    );
    const detail = (detailRows as Array<{ group_id: number; linked_asset_id: number | null }>)[0];
    if (!detail) throw new HttpError(404, 'Komponen aset terkait tidak ditemukan.');
    if (detail.linked_asset_id) throw new HttpError(409, 'Komponen masih tertaut ke asset. Lepas tautannya terlebih dahulu.');
    let photoPaths: string[] = [];
    if (hasPhotoTable) {
      const [photoRows] = await connection.execute(
        'SELECT photo_1_path, photo_2_path FROM asset_child_import_detail_photo WHERE detail_id=? LIMIT 1',
        [pendingId],
      );
      const photo = (photoRows as Array<{ photo_1_path: string | null; photo_2_path: string | null }>)[0];
      photoPaths = [photo?.photo_1_path, photo?.photo_2_path].filter(Boolean) as string[];
    }
    const [result] = await connection.execute('DELETE FROM asset_child_import_detail WHERE id=?', [pendingId]);
    await connection.execute(
      'DELETE FROM asset_child_import_group WHERE id=? AND NOT EXISTS (SELECT 1 FROM asset_child_import_detail WHERE group_id=?)',
      [detail.group_id, detail.group_id],
    );
    return { count: Number((result as { affectedRows?: number }).affectedRows ?? 0), photoPaths };
  });
  if (!removed.count) throw new HttpError(404, 'Kelompok tidak ditemukan atau masih tertaut ke asset.');
  await Promise.all(removed.photoPaths.map(unlinkChildAssetPhoto));
  ok(res, null, 'Slot aset terkait dihapus.');
}));

assetRouter.post(
  '/assets/children/import',
  authenticate,
  requirePermission('privilage_asset'),
  childAssetImportUpload.single('file'),
  asyncHandler(async (req, res) => {
    const parentCode = String(req.body.parent_asset ?? req.body.asset_code ?? '').trim();
    const dryRun = ['1', 'true', 'yes', 'on'].includes(String(req.body.dry_run ?? '').toLowerCase());
    if (!parentCode) throw new HttpError(422, 'parent_asset wajib diisi.');
    if (!req.file) throw new HttpError(422, 'File Excel (.xlsx) wajib diunggah pada field "file".');
    if (path.extname(req.file.originalname).toLowerCase() !== '.xlsx') throw new HttpError(422, 'Format file harus .xlsx.');

    const parent = await one<HierarchyAssetRow>('SELECT AssetID, AssetCode, AssetName, CompanyName, parent_asset_id FROM asset WHERE AssetCode=? LIMIT 1', [parentCode]);
    if (!parent) throw new HttpError(404, 'Aset induk tidak ditemukan.');
    if (!(await tableExists('asset_child_import_group')) || !(await tableExists('asset_child_import_detail')) || !(await tableExists('asset_child_import_detail_link'))) {
      throw new HttpError(409, 'Migration asset_child_import_hierarchy belum dijalankan.');
    }

    let parsed;
    try {
      parsed = await parseChildAssetWorkbook(req.file.buffer);
    } catch (error) {
      throw new HttpError(422, `Gagal membaca file: ${error instanceof Error ? error.message : String(error)}`);
    }

    const resultRows: Array<Record<string, unknown>> = [];
    const validChildren: Array<{
      sourceRow: number;
      AssetID: number;
      AssetCode: string;
      AssetName: string;
      CompanyName: string | null;
      previousParentId: number | null;
    }> = [];
    const seenIds = new Set<number>();
    let pendingCount = 0;
    let warnings = 0;
    let errors = 0;
    let unchanged = 0;

    for (const group of parsed.rows) {
      const resultItems: Array<Record<string, unknown>> = [];
      for (const detail of group.items) {
        if (!detail.identifier) {
          pendingCount++;
          resultItems.push({ ...detail, status: 'pending', message: 'Siap diimport. Asset Code / QR dapat diisi nanti.' });
          continue;
        }
        const numericIdentifier = /^\d+$/.test(detail.identifier);
        const child = await one<{ AssetID: number; AssetCode: string; AssetName: string; CompanyName: string | null; parent_asset_id: number | null; parent_asset_code: string | null }>(
          `SELECT a.AssetID, a.AssetCode, a.AssetName, a.CompanyName, a.parent_asset_id, p.AssetCode AS parent_asset_code
           FROM asset a
           LEFT JOIN asset p ON p.AssetID = a.parent_asset_id
           WHERE ${numericIdentifier ? 'a.AssetID = ?' : 'a.AssetCode = ?'}
           LIMIT 1`,
          [detail.identifier],
        );
        if (!child) {
          pendingCount++;
          warnings++;
          resultItems.push({
            ...detail,
            status: 'warning',
            message: `Asset Code / QR "${detail.lookup_value}" belum ditemukan. Komponen tetap dapat diimport dan ditautkan nanti.`,
          });
          continue;
        }
        if (Number(child.AssetID) === Number(parent.AssetID)) {
          pendingCount++;
          warnings++;
          resultItems.push({ ...detail, resolved_code: child.AssetCode, status: 'warning', message: 'Aset induk tidak dapat menjadi komponennya sendiri. Komponen diimport tanpa tautan.' });
          continue;
        }
        if (seenIds.has(Number(child.AssetID))) {
          pendingCount++;
          warnings++;
          resultItems.push({ ...detail, resolved_code: child.AssetCode, status: 'warning', message: 'Asset Code / QR yang sama dipakai pada lebih dari satu komponen. Komponen ini diimport tanpa tautan.' });
          continue;
        }
        seenIds.add(Number(child.AssetID));

        const existingComponent = await one<{ child_name: string; item_name: string }>(
          `SELECT g.child_name, d.item_name
           FROM asset_child_import_detail_link l
           JOIN asset_child_import_detail d ON d.id=l.detail_id
           JOIN asset_child_import_group g ON g.id=d.group_id
           WHERE l.linked_asset_id=? LIMIT 1`,
          [child.AssetID],
        );
        if (existingComponent && (
          existingComponent.child_name.trim().toLowerCase() !== group.child_name.trim().toLowerCase()
          || existingComponent.item_name.trim().toLowerCase() !== detail.item_name.trim().toLowerCase()
        )) {
          pendingCount++;
          warnings++;
          resultItems.push({
            ...detail,
            resolved_code: child.AssetCode,
            status: 'warning',
            message: `Asset sudah dipakai oleh ${existingComponent.child_name} / ${existingComponent.item_name}. Komponen tetap diimport tanpa tautan.`,
          });
          continue;
        }

        const alreadyInParent = Number(child.parent_asset_id ?? 0) === Number(parent.AssetID);
        if (child.parent_asset_id && !alreadyInParent) {
          pendingCount++;
          warnings++;
          resultItems.push({
            ...detail,
            resolved_code: child.AssetCode,
            resolved_name: child.AssetName,
            previous_parent: child.parent_asset_code,
            status: 'warning',
            message: `Sudah tertaut ke ${child.parent_asset_code}. Komponen tetap diimport tanpa tautan; gunakan Mutasi/Pindah bila aset ini akan digunakan.`,
          });
          continue;
        }
        if (alreadyInParent) unchanged++;
        resultItems.push({
          ...detail,
          resolved_code: child.AssetCode,
          resolved_name: child.AssetName,
          previous_parent: child.parent_asset_code,
          status: alreadyInParent ? 'unchanged' : 'ready',
          message: alreadyInParent ? 'Sudah berada di aset lokasi ini.' : 'Siap ditautkan.',
        });
        validChildren.push({
          sourceRow: detail.row,
          AssetID: Number(child.AssetID),
          AssetCode: child.AssetCode,
          AssetName: child.AssetName,
          CompanyName: child.CompanyName,
          previousParentId: child.parent_asset_id ? Number(child.parent_asset_id) : null,
        });
      }
      const groupHasErrors = resultItems.some((item) => item.status === 'error');
      const groupHasWarnings = resultItems.some((item) => item.status === 'warning');
      const groupHasPending = resultItems.some((item) => item.status === 'pending');
      resultRows.push({
        ...group,
        items: resultItems,
        status: groupHasErrors ? 'error' : (groupHasWarnings ? 'warning' : (groupHasPending ? 'pending' : 'ready')),
        message: `${resultItems.length} komponen dibaca.`,
      });
    }

    let attached = 0;
    let pendingImported = 0;
    let skippedExisting = 0;

    if (!dryRun && errors === 0) {
      await transaction(async (connection) => {
        // Serialkan import untuk parent yang sama. Selain mencegah race, ini
        // membuat import file yang sama berulang kali benar-benar idempotent.
        await connection.execute('SELECT AssetID FROM asset WHERE AssetID=? FOR UPDATE', [parent.AssetID]);
        for (const group of parsed.rows) {
          const normalizedGroupName = group.child_name.trim().replace(/\s+/g, ' ').toLowerCase();
          const [existingGroupRows] = await connection.execute(
            `SELECT id FROM asset_child_import_group
             WHERE parent_asset_id=? AND LOWER(TRIM(REGEXP_REPLACE(child_name, '[[:space:]]+', ' ')))=?
             ORDER BY id LIMIT 1`,
            [parent.AssetID, normalizedGroupName],
          );
          const existingGroupId = Number((existingGroupRows as Array<{ id: number }>)[0]?.id ?? 0);
          let groupId = existingGroupId;
          if (groupId) {
            await connection.execute(
              `UPDATE asset_child_import_group
               SET child_name=?, source_row=?, source_file=?, updated_at=NOW()
               WHERE id=?`,
              [group.child_name.trim().replace(/\s+/g, ' '), group.row, req.file!.originalname, groupId],
            );
          } else {
            const [result] = await connection.execute(
              `INSERT INTO asset_child_import_group
                 (parent_asset_id, child_name, source_row, source_file, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, NOW())`,
              [parent.AssetID, group.child_name.trim().replace(/\s+/g, ' '), group.row, req.file!.originalname, (req as AuthRequest).user!.fullname],
            );
            groupId = Number((result as { insertId?: number }).insertId ?? 0);
          }
          for (const [index, detail] of group.items.entries()) {
            const normalizedItemName = detail.item_name.trim().replace(/\s+/g, ' ').toLowerCase();
            const [existingDetailRows] = await connection.execute(
              `SELECT id FROM asset_child_import_detail
               WHERE group_id=? AND LOWER(TRIM(REGEXP_REPLACE(item_name, '[[:space:]]+', ' ')))=?
               ORDER BY id LIMIT 1`,
              [groupId, normalizedItemName],
            );
            const existingDetailId = Number((existingDetailRows as Array<{ id: number }>)[0]?.id ?? 0);
            let detailId = existingDetailId;
            if (detailId) {
              skippedExisting++;
              await connection.execute(
                `UPDATE asset_child_import_detail
                 SET item_name=?, condition_text=?, frequency=?, pic=?, source_row=?, sort_order=?, updated_at=NOW()
                 WHERE id=?`,
                [detail.item_name.trim().replace(/\s+/g, ' '), detail.condition_text || null, detail.frequency || null, detail.pic || null, detail.row, index, detailId],
              );
            } else {
              const [detailResult] = await connection.execute(
                `INSERT INTO asset_child_import_detail
                   (group_id, item_name, condition_text, frequency, pic, source_row, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [groupId, detail.item_name.trim().replace(/\s+/g, ' '), detail.condition_text || null, detail.frequency || null, detail.pic || null, detail.row, index],
              );
              detailId = Number((detailResult as { insertId?: number }).insertId ?? 0);
            }
            const child = validChildren.find((entry) => entry.sourceRow === detail.row);
            if (child) {
              if (child.previousParentId !== Number(parent.AssetID)) {
                await connection.execute(
                  'UPDATE asset SET parent_asset_id=?, updated_at=NOW(), updated_by=? WHERE AssetID=?',
                  [parent.AssetID, (req as AuthRequest).user!.fullname, child.AssetID],
                );
                await recordAssetHierarchyHistory(connection, child, null, parent, (req as AuthRequest).user!.fullname);
                attached++;
              }
              await connection.execute(
                `INSERT INTO asset_child_import_detail_link (detail_id, linked_asset_id, created_by, created_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE linked_asset_id=VALUES(linked_asset_id), updated_at=NOW()`,
                [detailId, child.AssetID, (req as AuthRequest).user!.fullname],
              );
            } else if (!existingDetailId) {
              pendingImported++;
            }
          }
        }
      });
    }

    const summary = {
      sheet: parsed.sheet,
      groups: parsed.rows.length,
      items: parsed.rows.reduce((total, group) => total + group.items.length, 0),
      valid: validChildren.length,
      attached,
      pending: pendingCount,
      pending_imported: pendingImported,
      skipped_existing: skippedExisting,
      unchanged,
      reassigned: 0,
      warnings,
      errors,
      dry_run: dryRun,
      applied: !dryRun && errors === 0,
    };
    const message = errors
      ? 'Impor dibatalkan karena masih ada baris error. Perbaiki file lalu coba kembali.'
      : (dryRun
          ? (warnings ? 'Pratinjau selesai. Komponen dengan peringatan tetap dapat diimport tanpa tautan.' : 'Pratinjau relasi aset selesai.')
          : (warnings ? 'Aset terkait berhasil diimpor. Komponen dengan peringatan disimpan tanpa tautan.' : 'Relasi aset berhasil diimpor.'));
    ok(res, { summary, rows: resultRows }, message);
  }),
);

assetRouter.get('/assets/children/import-template', authenticate, requirePermission('privilage_asset'), asyncHandler(async (_req, res) => {
  const templatePath = path.resolve('Form Preventive Audit - Siap Import.xlsx');
  if (!fs.existsSync(templatePath)) throw new HttpError(404, 'Template import aset terkait tidak ditemukan.');
  res.download(templatePath, 'Form Preventive Audit - Siap Import.xlsx');
}));

assetRouter.post('/assets/status', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  // Web mengirim `{ asset, is_active: boolean }` (lihat lib/api/assets.ts
  // setAssetStatus) — sebelumnya cuma cek `{ AssetID, active: 'active'|
  // 'inactive' }`, jadi endpoint ini SELALU gagal buat tombol
  // Aktifkan/Nonaktifkan di halaman manapun.
  const id = req.body.AssetID ?? req.body.asset ?? req.body.asset_code;
  const active = typeof req.body.active === 'string'
    ? req.body.active
    : (req.body.is_active !== undefined ? (req.body.is_active ? 'active' : 'inactive') : undefined);
  if (!id || !active || !['active', 'inactive'].includes(active)) throw new HttpError(400, 'AssetID and active status are required');

  await execute('UPDATE asset SET active = ?, updated_at = NOW(), updated_by = ? WHERE AssetID = ? OR AssetCode = ?', [active, (req as AuthRequest).user!.fullname, id, id]);
  ok(res, null, 'Asset status updated');
}));

assetRouter.post('/assets/generate-code', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  // Dulu motong 3 huruf pertama dari NAMA company/category/location, jadi hasilnya
  // gak match kode asli di master data (mis. lokasi "Human Resource & General
  // Affair" jadi "HUM" padahal kode resminya "HRGA") — beda dari pola AssetCode
  // yang sudah ada & dari cara legacy generate kodenya (lookup kode asli, bukan
  // potong nama). Samakan dengan lookup yang sama seperti bulk import aset.
  const companyName = String(req.body.company ?? '').trim();
  const locationName = String(req.body.location ?? '').trim();
  const categoryName = String(req.body.category ?? '').trim();
  const [company, location, category] = await Promise.all([
    one<{ id_company: string }>('SELECT id_company FROM tb_company WHERE company_name=?', [companyName]),
    one<{ location_code: string }>('SELECT location_code FROM tb_location_asset WHERE location_name=?', [locationName]),
    one<{ category_code: string }>('SELECT category_code FROM tb_category_asset WHERE category_name=?', [categoryName]),
  ]);
  if (!company || !location || !category) throw new HttpError(422, 'Company, lokasi, dan kategori harus cocok dengan master data.');
  const prefix = `${company.id_company}/${category.category_code}-${location.location_code}/`;
  const last = await one<{ seq: number }>('SELECT MAX(CAST(RIGHT(AssetCode, 4) AS UNSIGNED)) AS seq FROM asset WHERE AssetCode LIKE ?', [`${prefix}%`]);
  const assetCode = `${prefix}${String(Number(last?.seq ?? 0) + 1).padStart(4, '0')}`;
  // Web (lib/api/assets.ts generateAssetCode) baca `data.asset_code` — dulu di sini
  // cuma ngirim `AssetCode`, jadi tombol "Generate" selalu diam-diam gagal ngisi
  // field kode (gak ada error, cuma gak kefill).
  ok(res, { asset_code: assetCode, AssetCode: assetCode });
}));

const bulkImportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

assetRouter.post('/assets/import', authenticate, requirePermission('privilage_asset'), bulkImportUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'File Excel/CSV wajib diunggah pada field "file".', 'IMPORT_FILE_REQUIRED');
  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new HttpError(422, 'Format file harus .xlsx, .xls, atau .csv', 'IMPORT_FILE_TYPE');

  let parsedRows: Array<Record<string, string>>;
  try {
    parsedRows = await readWorkbookRows(req.file.buffer, ext);
  } catch (e) {
    throw new HttpError(422, `Gagal membaca file: ${e instanceof Error ? e.message : String(e)}`, 'IMPORT_PARSE_FAILED');
  }
  if (!parsedRows.length) throw new HttpError(422, 'File tidak berisi baris data (butuh 1 baris header + minimal 1 baris isi).', 'IMPORT_EMPTY');
  if (parsedRows.length > 2000) throw new HttpError(422, 'Maksimal 2000 baris per impor.', 'IMPORT_TOO_MANY_ROWS');

  const truthy = (v: unknown): boolean => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());
  const updateExisting = truthy(req.body.update_existing ?? req.query.update_existing);
  const dryRun = truthy(req.body.dry_run ?? req.query.dry_run);

  const result = await importAssetRows(parsedRows, (req as AuthRequest).user!, { updateExisting, dryRun });
  ok(res, result, dryRun ? 'Pratinjau impor selesai' : 'Impor aset selesai');
}));

assetRouter.get('/assets/import-template', authenticate, requirePermission('privilage_asset'), asyncHandler(async (_req, res) => {
  const buffer = await buildAssetImportTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template_import_asset.xlsx"');
  res.send(buffer);
}));

assetRouter.get('/assets/custom-details', authenticate, requirePermission('list_of_asset', 'privilage_asset'), asyncHandler(async (req, res) => {
  const code = String(req.query.asset_code ?? req.query.AssetCode ?? req.query.asset ?? '');
  if (!code) throw new HttpError(400, 'asset_code is required');
  ok(res, await customDetailRowsWithImages(code));
}));

assetRouter.post('/assets/custom-details', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = String(b.asset_code ?? b.asset ?? '');
  if (!code) throw new HttpError(422, 'asset_code is required');

  const who = (req as AuthRequest).user!.fullname;
  const next = await one<{ next: number }>('SELECT COALESCE(MAX(row_order),0)+1 AS next FROM asset_custom_details WHERE asset_code=?', [code]);
  const result = await execute(
    'INSERT INTO asset_custom_details (asset_code,row_order,bagian,bagian_mesin,part_mesin,kondisi,durasi_pengecekan,pic,part_diperlukan,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [code, Number(b.row_order ?? next?.next ?? 1), b.bagian ?? null, b.bagian_mesin ?? null, b.part_mesin ?? null, b.kondisi ?? null, b.durasi_pengecekan ?? null, b.pic ?? null, b.part_diperlukan ?? null, who, who],
  );
  await recordAssetAudit(code, 'CUSTOM_DETAIL_CREATED', 'CUSTOM_DETAIL', 'Custom detail aset ditambahkan', who, {
    after: { id: result.insertId, part_mesin: b.part_mesin ?? null, bagian_mesin: b.bagian_mesin ?? null },
    referenceType: 'CUSTOM_DETAIL', referenceId: result.insertId,
  });
  created(res, { id: result.insertId, custom_details: await customDetailRowsWithImages(code) }, 'Custom Detail dibuat');
}));

assetRouter.patch('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const existing = await one<Record<string, unknown> & { id: number; asset_code: string }>('SELECT * FROM asset_custom_details WHERE id=?', [req.params.id]);
  if (!existing) throw new HttpError(404, 'Custom Detail tidak ditemukan.');

  const b = bodyFields(req.body, ['row_order', 'bagian', 'bagian_mesin', 'part_mesin', 'kondisi', 'durasi_pengecekan', 'pic', 'part_diperlukan']);
  const keys = Object.keys(b);
  if (!keys.length) throw new HttpError(422, 'Tidak ada perubahan.');

  await execute(
    `UPDATE asset_custom_details SET ${keys.map((k) => `\`${k}\`=?`).join(', ')}, updated_by=? WHERE id=?`,
    [...Object.values(b), (req as AuthRequest).user!.fullname, req.params.id],
  );
  await recordAssetAudit(existing.asset_code, 'CUSTOM_DETAIL_UPDATED', 'CUSTOM_DETAIL', 'Custom detail aset diperbarui', (req as AuthRequest).user!.fullname, {
    before: existing, after: b, referenceType: 'CUSTOM_DETAIL', referenceId: existing.id,
  });
  ok(res, { id: existing.id, custom_details: await customDetailRowsWithImages(existing.asset_code) }, 'Custom Detail diperbarui');
}));

assetRouter.delete('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const existing = await one<Record<string, unknown> & { id: number; asset_code: string }>('SELECT * FROM asset_custom_details WHERE id=?', [req.params.id]);
  if (!existing) throw new HttpError(404, 'Custom Detail tidak ditemukan.');

  const imgs = await rows<{ image_path: string }>('SELECT image_path FROM asset_custom_detail_images WHERE custom_detail_id=?', [existing.id]);
  await Promise.all(imgs.map((im) => unlinkCustomDetailImage(im.image_path)));

  await execute('DELETE FROM asset_custom_detail_images WHERE custom_detail_id=?', [existing.id]);
  await execute('DELETE FROM asset_custom_details WHERE id = ?', [existing.id]);
  await recordAssetAudit(existing.asset_code, 'CUSTOM_DETAIL_DELETED', 'CUSTOM_DETAIL', 'Custom detail aset dihapus', (req as AuthRequest).user!.fullname, {
    before: existing, referenceType: 'CUSTOM_DETAIL', referenceId: existing.id,
  });
  ok(res, { id: existing.id, custom_details: await customDetailRowsWithImages(existing.asset_code) }, 'Custom Detail dihapus');
}));

assetRouter.post(
  '/assets/custom-details/:id/images',
  authenticate,
  requirePermission('privilage_asset'),
  customDetailImageUpload.single('image'),
  asyncHandler(async (req, res) => {
    const detail = await one<{ id: number; asset_code: string }>('SELECT id, asset_code FROM asset_custom_details WHERE id=?', [req.params.id]);
    if (!detail) throw new HttpError(404, 'Custom Detail tidak ditemukan.');
    if (!req.file) throw new HttpError(422, 'File gambar wajib diunggah.');

    let type = String(req.body.image_type ?? '').trim();
    if (!['tampak_jauh', 'tampak_dekat', 'detail_part'].includes(type)) type = 'detail_part';

    const relPath = await saveUploadedFile(req.file.buffer, 'customDetails', req.file.originalname, req.file.mimetype);
    const next = await one<{ next: number }>(
      'SELECT COALESCE(MAX(image_order),0)+1 AS next FROM asset_custom_detail_images WHERE custom_detail_id=? AND image_type=?',
      [detail.id, type],
    );
    const result = await execute(
      'INSERT INTO asset_custom_detail_images (custom_detail_id,image_type,image_name,image_path,image_order,file_size,mime_type,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())',
      [detail.id, type, path.basename(relPath), relPath, next?.next ?? 1, req.file.size, req.file.mimetype, (req as AuthRequest).user!.fullname],
    );
    await recordAssetAudit(detail.asset_code, 'CUSTOM_DETAIL_IMAGE_UPLOADED', 'ATTACHMENT', 'Gambar custom detail diunggah', (req as AuthRequest).user!.fullname, {
      after: { id: result.insertId, image_type: type, file_name: req.file.originalname },
      referenceType: 'CUSTOM_DETAIL_IMAGE', referenceId: result.insertId,
    });
    created(res, { id: result.insertId, url: `/uploads/${relPath}`, custom_details: await customDetailRowsWithImages(detail.asset_code) }, 'Gambar diunggah');
  }),
);

assetRouter.delete('/assets/custom-detail-images/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const img = await one<{ id: number; image_path: string; custom_detail_id: number }>(
    'SELECT id, image_path, custom_detail_id FROM asset_custom_detail_images WHERE id=?',
    [req.params.id],
  );
  if (!img) throw new HttpError(404, 'Gambar tidak ditemukan.');

  await unlinkCustomDetailImage(img.image_path);
  await execute('DELETE FROM asset_custom_detail_images WHERE id=?', [img.id]);

  const detail = await one<{ asset_code: string }>('SELECT asset_code FROM asset_custom_details WHERE id=?', [img.custom_detail_id]);
  if (detail) await recordAssetAudit(detail.asset_code, 'CUSTOM_DETAIL_IMAGE_DELETED', 'ATTACHMENT', 'Gambar custom detail dihapus', (req as AuthRequest).user!.fullname, {
    before: { id: img.id, image_path: img.image_path }, referenceType: 'CUSTOM_DETAIL_IMAGE', referenceId: img.id,
  });
  ok(res, { id: img.id, custom_details: detail ? await customDetailRowsWithImages(detail.asset_code) : [] }, 'Gambar dihapus');
}));

assetRouter.post(
  '/assets/custom-details/import',
  authenticate,
  requirePermission('privilage_asset'),
  excelImportUpload.fields([{ name: 'excel_file', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const code = String(b.asset_code ?? b.asset ?? '').trim();
    if (!code) throw new HttpError(422, 'asset_code wajib diisi.');

    const assetRow = await one('SELECT AssetCode FROM asset WHERE AssetCode=? LIMIT 1', [code]);
    if (!assetRow) throw new HttpError(404, 'Aset tidak ditemukan.');

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.excel_file?.[0] ?? files?.file?.[0];
    if (!file) throw new HttpError(422, 'File Excel (.xlsx) wajib diunggah pada field "excel_file".');

    const cleanup = () => fs.unlink(file.path, () => {});
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      cleanup();
      throw new HttpError(422, 'Format harus .xlsx (gambar di dalam sel hanya terbaca dari .xlsx).');
    }

    const mode = String(b.mode ?? '').toLowerCase() === 'append' ? 'append' : 'replace';
    const dryRun = ['1', 'true', 'yes', 'on'].includes(String(b.dry_run ?? '').toLowerCase());

    let parsed;
    try {
      parsed = await parseCustomDetailWorkbook(file.path, code, CUSTOM_DETAIL_DIR);
    } catch (err) {
      cleanup();
      throw new HttpError(422, `Gagal membaca file: ${(err as Error).message}`);
    }
    cleanup();

    if (!parsed.rows.length) {
      discardExtractedImages(parsed.rows, CUSTOM_DETAIL_DIR);
      throw new HttpError(422, 'Tidak ada baris dengan Part Mesin terisi.');
    }

    const summary = { rows: parsed.rows.length, images: parsed.imageCount, images_failed: parsed.imageFailed, image_engine: parsed.imageEngine, mode, created: 0 };
    const preview = parsed.rows.map((r, i) => ({
      no: i + 1,
      bagian: r.bagian,
      bagian_mesin: r.bagian_mesin,
      part_mesin: r.part_mesin,
      durasi_pengecekan: r.durasi_pengecekan,
      images: r.images.tampak_jauh.length + r.images.tampak_dekat.length + r.images.detail_part.length,
    }));

    if (dryRun) {
      discardExtractedImages(parsed.rows, CUSTOM_DETAIL_DIR);
      ok(res, { summary, rows: preview, custom_details: await customDetailRowsWithImages(code) }, 'Pratinjau impor Custom Detail selesai');
      return;
    }

    const who = (req as AuthRequest).user!.fullname;
    try {
      await transaction(async (connection) => {
        if (mode === 'replace') {
          const existing = await rows<{ id: number }>('SELECT id FROM asset_custom_details WHERE asset_code=?', [code]);
          for (const d of existing) {
            const imgs = await rows<{ image_path: string }>('SELECT image_path FROM asset_custom_detail_images WHERE custom_detail_id=?', [d.id]);
            await Promise.all(imgs.map((im) => unlinkCustomDetailImage(im.image_path)));
            await connection.execute('DELETE FROM asset_custom_detail_images WHERE custom_detail_id=?', [d.id]);
          }
          await connection.execute('DELETE FROM asset_custom_details WHERE asset_code=?', [code]);
        }

        const baseRow = mode === 'replace'
          ? 0
          : Number((await one<{ max: number | null }>('SELECT MAX(row_order) AS max FROM asset_custom_details WHERE asset_code=?', [code]))?.max ?? 0);

        let idx = 0;
        for (const r of parsed.rows) {
          idx++;
          const [insertResult] = await connection.execute<import('mysql2/promise').ResultSetHeader>(
            'INSERT INTO asset_custom_details (asset_code,row_order,bagian,bagian_mesin,part_mesin,kondisi,durasi_pengecekan,pic,part_diperlukan,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
            [code, baseRow + idx, r.bagian || null, r.bagian_mesin || null, r.part_mesin, r.kondisi || null, r.durasi_pengecekan || null, r.pic || null, r.part_diperlukan || null, who, who],
          );
          const cdId = insertResult.insertId;
          if (!cdId) continue;
          summary.created++;

          for (const type of ['tampak_jauh', 'tampak_dekat', 'detail_part'] as const) {
            let order = 0;
            for (const img of r.images[type]) {
              order++;
              await connection.execute(
                'INSERT INTO asset_custom_detail_images (custom_detail_id,image_type,image_name,image_path,image_order,file_size,mime_type,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())',
                [cdId, type, img.filename, `customDetails/${img.filename}`, order, img.filesize, img.mime_type, who],
              );
            }
          }
        }
      });
    } catch (err) {
      discardExtractedImages(parsed.rows, CUSTOM_DETAIL_DIR);
      throw err;
    }

    await recordAssetAudit(code, 'CUSTOM_DETAIL_IMPORTED', 'CUSTOM_DETAIL', `Custom detail diimpor (${summary.created} baris, mode ${mode})`, who, {
      after: summary, referenceType: 'CUSTOM_DETAIL_IMPORT', referenceId: file.originalname,
    });
    ok(res, { summary, rows: preview, custom_details: await customDetailRowsWithImages(code) }, 'Impor Custom Detail selesai');
  }),
);

assetRouter.get('/assets/custom-details/import-template', authenticate, requirePermission('privilage_asset'), asyncHandler(async (_req, res) => {
  const buffer = await buildCustomDetailTemplate();
  res
    .status(200)
    .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setHeader('Content-Disposition', 'attachment; filename="template_custom_detail.xlsx"')
    .send(Buffer.from(buffer));
}));

assetRouter.get('/assets/attachments', authenticate, requirePermission('list_of_asset', 'privilage_asset'), asyncHandler(async (req, res) => {
  const code = String(req.query.asset_code ?? req.query.AssetCode ?? req.query.asset ?? '');
  if (!code) throw new HttpError(400, 'asset_code is required');
  ok(res, await getAssetAttachmentRows(code));
}));

assetRouter.post('/assets/attachments', authenticate, requirePermission('privilage_asset'), upload.single('file'), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = String(b.AssetCode ?? b.asset_code ?? b.asset ?? '');
  if (!code) throw new HttpError(400, 'AssetCode is required');

  const file = req.file;
  if (!file) throw new HttpError(400, 'file is required');

  const relativePath = await saveUploadedFile(file.buffer, 'attachments', file.originalname, file.mimetype);
  const categoryId = Number(b.category_id ?? b.id_attachment_asset_category ?? 2);
  const next = await one<{ next: number }>('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM tb_attachment_asset WHERE AssetCode=?', [code]);
  const result = await execute(
    'INSERT INTO tb_attachment_asset (AssetCode, filename, original_filename, mime, sort_order, id_attachment_asset_category, created_by, created_at) VALUES (?,?,?,?,?,?,?,NOW())',
    [code, relativePath, file.originalname, file.mimetype, next?.next ?? 1, categoryId, (req as AuthRequest).user!.fullname],
  );
  await recordAssetAudit(code, 'ATTACHMENT_UPLOADED', 'ATTACHMENT', `Lampiran ${file.originalname} diunggah`, (req as AuthRequest).user!.fullname, {
    after: { id: result.insertId, file_name: file.originalname, mime: file.mimetype, category_id: categoryId },
    referenceType: 'ATTACHMENT', referenceId: result.insertId,
  });
  created(res, { id: result.insertId, filename: file.originalname }, 'Attachment uploaded');
}));

assetRouter.delete('/assets/attachments/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const row = await one<{ id: number; AssetCode: string; filename: string; original_filename: string | null }>('SELECT id,AssetCode,filename,original_filename FROM tb_attachment_asset WHERE id=?', [req.params.id]);
  if (!row) throw new HttpError(404, 'Attachment not found');

  await execute('DELETE FROM tb_attachment_asset WHERE id=?', [req.params.id]);
  await recordAssetAudit(row.AssetCode, 'ATTACHMENT_DELETED', 'ATTACHMENT', `Lampiran ${row.original_filename ?? row.filename} dihapus`, (req as AuthRequest).user!.fullname, {
    before: row, referenceType: 'ATTACHMENT', referenceId: row.id,
  });
  ok(res, null, 'Attachment deleted');
}));

assetRouter.post('/assets/attachments/reorder', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = String(b.asset ?? b.asset_code ?? '');
  const order = b.order ?? b.ids;
  if (!code || !Array.isArray(order) || !order.length) throw new HttpError(422, 'asset and order[] are required');

  await transaction(async (connection) => {
    let pos = 1;
    for (const id of order) {
      if (Number(id) <= 0) continue;
      await connection.execute('UPDATE tb_attachment_asset SET sort_order=? WHERE id=? AND AssetCode=?', [pos, id, code]);
      pos++;
    }
  });
  await recordAssetAudit(code, 'ATTACHMENT_REORDERED', 'ATTACHMENT', 'Urutan lampiran aset diperbarui', (req as AuthRequest).user!.fullname, {
    after: { order }, referenceType: 'ATTACHMENT_ORDER', referenceId: code,
  });
  ok(res, { attachments: await rows('SELECT * FROM tb_attachment_asset WHERE AssetCode=? AND part_id IS NULL ORDER BY sort_order,id', [code]) }, 'Urutan lampiran disimpan');
}));

assetRouter.get('/attachment-categories', authenticate, requirePermission('list_of_asset', 'privilage_asset'), asyncHandler(async (_req, res) => {
  ok(res, await rows('SELECT * FROM tb_attachment_asset_category ORDER BY number ASC'));
}));

assetRouter.post('/attachment-categories', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const name = String(req.body.category_name ?? '').trim();
  if (!name) throw new HttpError(422, 'category_name is required');

  const max = await one<{ max: number | null }>('SELECT MAX(number) AS max FROM tb_attachment_asset_category');
  const number = Number(max?.max ?? 0) + 1;
  const result = await execute('INSERT INTO tb_attachment_asset_category (category_name, number, created_at) VALUES (?,?,NOW())', [name, number]);
  created(res, { id: result.insertId, category_name: name, number }, 'Kategori dibuat');
}));

assetRouter.patch('/attachment-categories/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.category_name ?? '').trim();
  if (id <= 0 || !name) throw new HttpError(422, 'id dan category_name wajib diisi');

  await execute('UPDATE tb_attachment_asset_category SET category_name=? WHERE id=?', [name, id]);
  ok(res, { id, category_name: name }, 'Kategori diperbarui');
}));

assetRouter.delete('/attachment-categories/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id <= 0) throw new HttpError(422, 'id wajib diisi');

  const used = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_attachment_asset WHERE id_attachment_asset_category=?', [id]);
  if (Number(used?.total ?? 0) > 0) throw new HttpError(409, `Kategori masih dipakai oleh ${used?.total} lampiran.`);

  await execute('DELETE FROM tb_attachment_asset_category WHERE id=?', [id]);
  ok(res, { id }, 'Kategori dihapus');
}));

assetRouter.post('/attachment-categories/reorder', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const order = req.body.order ?? req.body.ids;
  if (!Array.isArray(order) || !order.length) throw new HttpError(422, 'order[] wajib diisi');

  await transaction(async (connection) => {
    let pos = 1;
    for (const id of order) {
      if (Number(id) <= 0) continue;
      await connection.execute('UPDATE tb_attachment_asset_category SET number=? WHERE id=?', [pos, id]);
      pos++;
    }
  });
  ok(res, await rows('SELECT * FROM tb_attachment_asset_category ORDER BY number ASC'), 'Urutan kategori disimpan');
}));
