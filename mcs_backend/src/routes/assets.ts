import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import { buildAssetImportTemplate, importAssetRows, readWorkbookRows } from '../lib/asset-import.js';
import { buildCustomDetailTemplate, discardExtractedImages, parseCustomDetailWorkbook } from '../lib/custom-detail-import.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
export const assetRouter = Router();

const assetFields = [
  'AssetCode', 'AssetName', 'AliasName', 'brand', 'CompanyName', 'CategoryAsset',
  'LocationAsset', 'Keterangan', 'active', 'status', 'Remarks', 'id_location_asset', 'mtc_area_key',
];

function bodyFields(body: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined));
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

assetRouter.get('/assets/options', authenticate, asyncHandler(async (_req, res) => {
  const [companies, categories, locations] = await Promise.all([
    rows('SELECT * FROM tb_company'),
    rows('SELECT * FROM tb_category_asset'),
    rows('SELECT * FROM tb_location_asset'),
  ]);
  ok(res, { companies, categories, locations });
}));

assetRouter.get('/assets', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 25)));
  const q = String(req.query.q ?? '');
  const where = 'WHERE AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ?';
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];

  const total = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM asset ${where}`, params);
  const data = await rows(`SELECT * FROM asset ${where} ORDER BY AssetID DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  ok(res, data, 'OK', { page, limit, total: Number(total?.total ?? 0) });
}));

assetRouter.post('/assets', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const fields = bodyFields(req.body, assetFields);
  if (!fields.AssetCode || !fields.AssetName) throw new HttpError(400, 'AssetCode and AssetName are required');

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
  const id = req.query.id ?? req.query.AssetID ?? req.query.asset_id ?? req.query.asset;
  if (!id) throw new HttpError(400, 'Asset ID is required');

  const asset = await one('SELECT * FROM asset WHERE AssetID = ? OR AssetCode = ? LIMIT 1', [id, id]);
  if (!asset) throw new HttpError(404, 'Asset not found');

  const code = String((asset as Record<string, unknown>).AssetCode);
  const [details, attachments, parts] = await Promise.all([
    rows('SELECT * FROM asset_custom_details WHERE asset_code = ? ORDER BY row_order, id', [code]),
    rows('SELECT * FROM tb_attachment_asset WHERE AssetCode = ? AND part_id IS NULL ORDER BY sort_order, id', [code]),
    rows('SELECT * FROM tb_parts_bom WHERE AssetCode = ? AND deleted_at IS NULL ORDER BY no_urut, id', [code]),
  ]);
  ok(res, { ...asset as object, custom_details: details, attachments, parts });
}));

assetRouter.patch('/assets/detail', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  // Web mengirim `asset`/`asset_code` di body + query (lihat lib/api/assets.ts
  // updateAsset) — sebelumnya gak pernah dicek, jadi endpoint ini SELALU
  // gagal "Asset ID is required" buat siapapun yang nyimpen edit aset.
  const id = req.body.AssetID ?? req.query.id ?? req.body.asset ?? req.body.asset_code ?? req.query.asset;
  if (!id) throw new HttpError(400, 'Asset ID is required');

  const fields = bodyFields(req.body, assetFields);
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
  const { company = 'MCS', category = 'ASSET', location = 'GENERAL' } = req.body;
  const prefix = `${String(company).slice(0, 3).toUpperCase()}/${String(category).slice(0, 3).toUpperCase()}-${String(location).slice(0, 3).toUpperCase()}`;
  const last = await one<{ seq: number }>('SELECT MAX(CAST(RIGHT(AssetCode, 4) AS UNSIGNED)) AS seq FROM asset WHERE AssetCode LIKE ?', [`${prefix}/%`]);
  ok(res, { AssetCode: `${prefix}/${String(Number(last?.seq ?? 0) + 1).padStart(4, '0')}` });
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
  const code = String(req.query.asset_code ?? req.query.AssetCode ?? '');
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
  created(res, { id: result.insertId, custom_details: await customDetailRowsWithImages(code) }, 'Custom Detail dibuat');
}));

assetRouter.patch('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const existing = await one<{ id: number; asset_code: string }>('SELECT id, asset_code FROM asset_custom_details WHERE id=?', [req.params.id]);
  if (!existing) throw new HttpError(404, 'Custom Detail tidak ditemukan.');

  const b = bodyFields(req.body, ['row_order', 'bagian', 'bagian_mesin', 'part_mesin', 'kondisi', 'durasi_pengecekan', 'pic', 'part_diperlukan']);
  const keys = Object.keys(b);
  if (!keys.length) throw new HttpError(422, 'Tidak ada perubahan.');

  await execute(
    `UPDATE asset_custom_details SET ${keys.map((k) => `\`${k}\`=?`).join(', ')}, updated_by=? WHERE id=?`,
    [...Object.values(b), (req as AuthRequest).user!.fullname, req.params.id],
  );
  ok(res, { id: existing.id, custom_details: await customDetailRowsWithImages(existing.asset_code) }, 'Custom Detail diperbarui');
}));

assetRouter.delete('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const existing = await one<{ id: number; asset_code: string }>('SELECT id, asset_code FROM asset_custom_details WHERE id=?', [req.params.id]);
  if (!existing) throw new HttpError(404, 'Custom Detail tidak ditemukan.');

  const imgs = await rows<{ image_path: string }>('SELECT image_path FROM asset_custom_detail_images WHERE custom_detail_id=?', [existing.id]);
  await Promise.all(imgs.map((im) => unlinkCustomDetailImage(im.image_path)));

  await execute('DELETE FROM asset_custom_detail_images WHERE custom_detail_id=?', [existing.id]);
  await execute('DELETE FROM asset_custom_details WHERE id = ?', [existing.id]);
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
  const code = String(req.query.asset_code ?? req.query.AssetCode ?? '');
  if (!code) throw new HttpError(400, 'asset_code is required');
  ok(res, await rows('SELECT * FROM tb_attachment_asset WHERE AssetCode=? AND part_id IS NULL ORDER BY sort_order,id', [code]));
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
  created(res, { id: result.insertId, filename: file.originalname }, 'Attachment uploaded');
}));

assetRouter.delete('/assets/attachments/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const row = await one<{ filename: string }>('SELECT filename FROM tb_attachment_asset WHERE id=?', [req.params.id]);
  if (!row) throw new HttpError(404, 'Attachment not found');

  await execute('DELETE FROM tb_attachment_asset WHERE id=?', [req.params.id]);
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
