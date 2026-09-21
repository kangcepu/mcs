import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import { deleteObjectKey, saveFileWithKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
export const equipmentRouter = Router();
const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const BOM_PHOTO_CATEGORY_ID = 13;
const GALLERY_CATEGORY_ID = 2;

const MASTER_ASSET_DIR = path.join(config.uploadDir, 'masterAsset');
fs.mkdirSync(MASTER_ASSET_DIR, { recursive: true });
const bomPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let bomCategoryIdCache: number | null = null;
async function getBomCategoryId(): Promise<number> {
  if (bomCategoryIdCache) return bomCategoryIdCache;
  const row = await one<{ id: number }>("SELECT id FROM tb_attachment_asset_category WHERE category_name='BOM Part' LIMIT 1");
  bomCategoryIdCache = row?.id ?? BOM_PHOTO_CATEGORY_ID;
  return bomCategoryIdCache;
}

function timestampCompact(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

equipmentRouter.get('/equipment/parts', authenticate, canRead, asyncHandler(async (req, res) => {
  const code = String(req.query.asset_code ?? req.query.AssetCode ?? '');
  if (!code) throw new HttpError(400, 'asset_code is required');
  ok(res, await rows('SELECT * FROM tb_parts_bom WHERE AssetCode=? AND deleted_at IS NULL ORDER BY no_urut,id', [code]));
}));

equipmentRouter.get('/equipment/part', authenticate, canRead, asyncHandler(async (req, res) => {
  const id = req.query.id;
  if (!id) throw new HttpError(400, 'id is required');

  const part = await one('SELECT * FROM tb_parts_bom WHERE id=?', [id]);
  if (!part) throw new HttpError(404, 'Part not found');
  ok(res, part);
}));

equipmentRouter.post('/equipment/parts/sub', authenticate, canManage, asyncHandler(async (req, res) => {
  const b = req.body;
  const code = String(b.asset_code ?? b.AssetCode ?? '');
  if (!code || !b.part) throw new HttpError(400, 'AssetCode and part are required');

  const next = await one<{ next: number }>('SELECT COALESCE(MAX(no_urut),0)+1 AS next FROM tb_parts_bom WHERE AssetCode=?', [code]);
  const result = await execute(
    'INSERT INTO tb_parts_bom (id_nested,AssetCode,level,parent,no_urut,header,part,qty_on_hand,uom,company,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())',
    [b.id_nested ?? `${Date.now()}`, code, b.level ?? 1, b.parent ?? 0, Number(b.no_urut ?? next?.next ?? 1), b.header ?? '', b.part, Number(b.qty_on_hand ?? 0), b.uom ?? 'PCS', b.company ?? ''],
  );
  created(res, { id: result.insertId }, 'Part created');
}));

equipmentRouter.post('/equipment/parts/toggle', authenticate, canManage, asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new HttpError(400, 'id is required');

  await execute('UPDATE tb_parts_bom SET is_active=IF(is_active=1,0,1),updated_at=NOW() WHERE id=?', [id]);
  ok(res, { id }, 'Part status updated');
}));

equipmentRouter.post('/equipment/parts/enable', authenticate, canManage, asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new HttpError(400, 'id is required');

  await execute('UPDATE tb_parts_bom SET is_active=1,updated_at=NOW() WHERE id=?', [id]);
  ok(res, { id }, 'Part status updated');
}));

equipmentRouter.post('/equipment/parts/disable', authenticate, canManage, asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new HttpError(400, 'id is required');

  const who = (req as AuthRequest).user!.fullname;
  await execute('UPDATE tb_parts_bom SET is_active=0,disabled_by=?,disabled_at=NOW(),updated_at=NOW() WHERE id=?', [who, id]);
  ok(res, { id }, 'Part status updated');
}));

equipmentRouter.post('/equipment/parts/use', authenticate, canManage, asyncHandler(async (req, res) => {
  const b = req.body;
  const partId = Number(b.part_id ?? 0);
  const qtyUsed = Number(b.qty_used ?? b.qty ?? 0);
  const usedFor = String(b.used_for ?? '').trim();
  if (partId <= 0 || qtyUsed <= 0 || !usedFor) throw new HttpError(422, 'part_id, qty_used and used_for are required');

  const part = await one<{ id: number; AssetCode: string; qty_on_hand: number }>('SELECT id, AssetCode, qty_on_hand FROM tb_parts_bom WHERE id=? AND deleted_at IS NULL', [partId]);
  if (!part) throw new HttpError(404, 'Part not found');

  const qtyBefore = Number(part.qty_on_hand ?? 0);
  const qtyAfter = qtyBefore - qtyUsed;
  if (qtyAfter < 0) throw new HttpError(422, `Insufficient stock: only ${qtyBefore} available`);

  const usedDate = b.used_date ? String(b.used_date) : new Date().toISOString().slice(0, 10);
  const who = (req as AuthRequest).user!.fullname;
  const isDisabled = qtyAfter === 0;

  await transaction(async (connection) => {
    await connection.execute(
      'INSERT INTO tb_parts_usage_history (part_id, AssetCode, qty_used, qty_before, qty_after, used_for, work_order_no, project_name, reference_no, used_date, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
      [partId, part.AssetCode, qtyUsed, qtyBefore, qtyAfter, usedFor, b.work_order_no ?? null, b.project_name ?? null, b.reference_no ?? null, usedDate, b.notes ?? null, who],
    );
    if (isDisabled) {
      await connection.execute(
        'UPDATE tb_parts_bom SET qty_on_hand=?, last_usage_date=?, total_used=COALESCE(total_used,0)+?, is_active=0, disabled_by=?, disabled_at=NOW(), updated_at=NOW() WHERE id=?',
        [qtyAfter, usedDate, qtyUsed, who, partId],
      );
    } else {
      await connection.execute(
        'UPDATE tb_parts_bom SET qty_on_hand=?, last_usage_date=?, total_used=COALESCE(total_used,0)+?, updated_at=NOW() WHERE id=?',
        [qtyAfter, usedDate, qtyUsed, partId],
      );
    }
  });

  ok(res, { qty_before: qtyBefore, qty_used: qtyUsed, qty_after: qtyAfter, is_disabled: isDisabled }, 'Part usage recorded');
}));

equipmentRouter.post('/equipment/parts/restock', authenticate, canManage, asyncHandler(async (req, res) => {
  const b = req.body;
  const partId = Number(b.part_id ?? 0);
  const qtyAdded = Number(b.qty_added ?? b.qty ?? 0);
  const notes = String(b.notes ?? '').trim();
  if (partId <= 0 || qtyAdded <= 0 || !notes) throw new HttpError(422, 'part_id, qty_added and notes are required');

  const part = await one<{ id: number; AssetCode: string; qty_on_hand: number; is_active: number }>('SELECT id, AssetCode, qty_on_hand, is_active FROM tb_parts_bom WHERE id=? AND deleted_at IS NULL', [partId]);
  if (!part) throw new HttpError(404, 'Part not found');

  const qtyBefore = Number(part.qty_on_hand ?? 0);
  const qtyAfter = qtyBefore + qtyAdded;
  const usedDate = b.used_date ? String(b.used_date) : new Date().toISOString().slice(0, 10);
  const who = (req as AuthRequest).user!.fullname;
  const isEnabled = Number(part.is_active ?? 0) === 0 && qtyAfter > 0;

  await transaction(async (connection) => {
    await connection.execute(
      'INSERT INTO tb_parts_usage_history (part_id, AssetCode, qty_used, qty_before, qty_after, used_for, reference_no, used_date, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())',
      [partId, part.AssetCode, -qtyAdded, qtyBefore, qtyAfter, 'RESTOCK', b.reference_no ?? null, usedDate, notes, who],
    );
    if (isEnabled) {
      await connection.execute('UPDATE tb_parts_bom SET qty_on_hand=?, is_active=1, disabled_by=NULL, disabled_at=NULL, updated_at=NOW() WHERE id=?', [qtyAfter, partId]);
    } else {
      await connection.execute('UPDATE tb_parts_bom SET qty_on_hand=?, updated_at=NOW() WHERE id=?', [qtyAfter, partId]);
    }
  });

  ok(res, { qty_before: qtyBefore, qty_added: qtyAdded, qty_after: qtyAfter, is_enabled: isEnabled }, 'Part restocked');
}));

equipmentRouter.get('/equipment/parts/history', authenticate, canRead, asyncHandler(async (req, res) => {
  const id = req.query.part_id;
  if (!id) throw new HttpError(400, 'part_id is required');

  ok(res, await rows(
    `SELECT h.*, p.part, p.uom, p.header FROM tb_parts_usage_history h LEFT JOIN tb_parts_bom p ON p.id=h.part_id
     WHERE h.part_id=? AND h.deleted_at IS NULL ORDER BY h.used_date DESC, h.created_at DESC`,
    [id],
  ));
}));

equipmentRouter.delete('/equipment/parts/history', authenticate, canManage, asyncHandler(async (req, res) => {
  const id = req.body.id ?? req.query.id;
  if (!id) throw new HttpError(400, 'id is required');

  const history = await one<{ id: number; part_id: number; qty_used: number }>('SELECT id, part_id, qty_used FROM tb_parts_usage_history WHERE id=? AND deleted_at IS NULL', [id]);
  if (!history) throw new HttpError(404, 'History not found');

  const who = (req as AuthRequest).user!.fullname;

  await transaction(async (connection) => {
    await connection.execute('UPDATE tb_parts_usage_history SET deleted_at=NOW(), deleted_by=? WHERE id=?', [who, id]);

    const part = await one<{ id: number; qty_on_hand: number; total_used: number | null; is_active: number }>('SELECT id, qty_on_hand, total_used, is_active FROM tb_parts_bom WHERE id=?', [history.part_id]);
    if (!part) return;

    const qtyUsed = Number(history.qty_used);
    const newStock = Number(part.qty_on_hand ?? 0) + qtyUsed;
    const newTotalUsed = Math.max(0, Number(part.total_used ?? 0) - qtyUsed);
    if (Number(part.is_active ?? 0) === 0 && newStock > 0) {
      await connection.execute('UPDATE tb_parts_bom SET qty_on_hand=?, total_used=?, is_active=1, disabled_by=NULL, disabled_at=NULL, updated_at=NOW() WHERE id=?', [newStock, newTotalUsed, part.id]);
    } else {
      await connection.execute('UPDATE tb_parts_bom SET qty_on_hand=?, total_used=?, updated_at=NOW() WHERE id=?', [newStock, newTotalUsed, part.id]);
    }
  });

  ok(res, { id }, 'History deleted');
}));

equipmentRouter.get('/equipment/bom-photos', authenticate, canRead, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  const partId = Number(req.query.part_id ?? 0);
  const bomIdNested = String(req.query.bom_id_nested ?? '').trim();
  const token = String(req.query.token ?? '').trim();
  if (!assetCode) throw new HttpError(422, 'asset_code is required');
  if (partId <= 0 && (!bomIdNested || !token)) throw new HttpError(422, 'part_id atau (bom_id_nested + token) wajib diisi.');

  const categoryId = await getBomCategoryId();
  let where = 'WHERE AssetCode=? AND id_attachment_asset_category=?';
  const params: unknown[] = [assetCode, categoryId];
  if (partId > 0) { where += ' AND part_id=?'; params.push(partId); }
  else { where += ' AND token=? AND bom_id_nested=?'; params.push(token, bomIdNested); }

  const items = await rows<Record<string, unknown>>(
    `SELECT id, filename, part_id, bom_id_nested, token, created_at, created_by, original_filename FROM tb_attachment_asset ${where} ORDER BY id DESC`,
    params,
  );
  ok(res, items.map((r) => ({ ...r, url: `/uploads/masterAsset/${r.filename}` })));
}));

equipmentRouter.post('/equipment/bom-photos', authenticate, canManage, bomPhotoUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'File photo wajib diunggah.');

  const b = req.body;
  const assetCode = String(b.asset_code ?? b.AssetCode ?? '').trim();
  const partId = Number(b.part_id ?? 0);
  const bomIdNested = String(b.bom_id_nested ?? '').trim();
  const token = String(b.token ?? '').trim();
  if (!assetCode) throw new HttpError(422, 'asset_code is required');
  if (partId <= 0 && (!bomIdNested || !token)) throw new HttpError(422, 'part_id atau (bom_id_nested + token) wajib diisi.');

  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new HttpError(422, 'Gambar tidak valid.');
  }

  const safeAsset = assetCode.replace(/[^A-Za-z0-9_-]/g, '_');
  const suffix = partId > 0 ? `p${partId}` : `n${bomIdNested.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const filename = `bompart_${safeAsset}_${suffix}_${timestampCompact(new Date())}_${crypto.randomBytes(4).toString('hex')}.webp`;
  await saveFileWithKey(webpBuffer, 'masterAsset', filename, 'image/webp');

  const categoryId = await getBomCategoryId();
  const result = await execute(
    'INSERT INTO tb_attachment_asset (filename, AssetCode, id_attachment_asset_category, part_id, bom_id_nested, token, original_filename, mime, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())',
    [filename, assetCode, categoryId, partId > 0 ? partId : null, partId > 0 ? null : bomIdNested, partId > 0 ? null : token, req.file.originalname, 'image/webp', (req as AuthRequest).user!.fullname],
  );
  created(res, { id: result.insertId, filename, url: `/uploads/masterAsset/${filename}` }, 'Foto diunggah');
}));

equipmentRouter.delete('/equipment/bom-photos', authenticate, canManage, asyncHandler(async (req, res) => {
  const id = Number(req.body.id ?? req.query.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required');

  const row = await one<{ id: number; filename: string }>('SELECT id, filename FROM tb_attachment_asset WHERE id=?', [id]);
  if (!row) throw new HttpError(422, 'Attachment not found');

  const filePath = path.join(MASTER_ASSET_DIR, row.filename);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch { } }
  await deleteObjectKey(`masterAsset/${row.filename}`);
  await execute('DELETE FROM tb_attachment_asset WHERE id=?', [id]);
  ok(res, { id }, 'Foto dihapus');
}));

equipmentRouter.post('/equipment/annotated-image', authenticate, canManage, asyncHandler(async (req, res) => {
  const b = req.body;
  const rowId = Number(b.row_id ?? 0);
  if (!rowId) throw new HttpError(400, 'row_id is required');

  const imageData = String(b.image ?? '');
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  const base64 = match ? match[2] : imageData;
  if (!base64) throw new HttpError(400, 'image is required');
  const contentType = match ? match[1] : 'image/png';

  const existing = await one<{ id: number; image_path: string }>('SELECT id, image_path FROM asset_custom_detail_images WHERE id=?', [rowId]);
  if (!existing) throw new HttpError(404, 'Image not found');

  const buffer = Buffer.from(base64, 'base64');
  const originalFilename = String(b.original_filename ?? 'annotated.png');
  const ext = contentType.split('/')[1] ?? path.extname(originalFilename).slice(1) ?? 'png';
  const filename = `${path.basename(originalFilename, path.extname(originalFilename)) || 'annotated'}.${ext}`;
  const relativePath = await saveUploadedFile(buffer, 'customDetails', filename, contentType);

  await execute('UPDATE asset_custom_detail_images SET image_name=?, image_path=?, file_size=?, mime_type=? WHERE id=?', [filename, relativePath, buffer.length, contentType, rowId]);

  const oldPath = existing.image_path;
  if (oldPath && oldPath !== relativePath) {
    const abs = path.join(config.uploadDir, oldPath);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch {} }
    await deleteObjectKey(oldPath);
  }

  ok(res, { filename, url: `/uploads/${relativePath}` }, 'Image updated');
}));

equipmentRouter.get('/equipment/custom-detail-image', authenticate, canRead, asyncHandler(async (req, res) => {
  const id = req.query.custom_detail_id;
  if (!id) throw new HttpError(400, 'custom_detail_id is required');
  ok(res, await rows('SELECT * FROM asset_custom_detail_images WHERE custom_detail_id=? ORDER BY image_type, image_order', [id]));
}));

equipmentRouter.get('/equipment/missing-area-alerts', authenticate, canManage, asyncHandler(async (req, res) => {
  let limit = Number(req.query.limit ?? 0);
  if (limit <= 0 || limit > 300) limit = 100;

  const items = await rows<Record<string, unknown>>(
    `SELECT w.wo_number, w.date, w.status, w.company AS wo_company, w.id_equipment, w.job_title, w.job_requirement,
            a.AssetCode, a.AssetName, a.CompanyName AS asset_company
     FROM tb_wo_it w LEFT JOIN asset a ON a.AssetID = w.id_equipment
     WHERE w.job_requirement LIKE '%[AREA GALLERY]%' AND w.job_requirement LIKE '%ADA AREA YANG BELUM DIFOTO%'
       AND w.status NOT IN ('CLOSED','VOID','REJECT','DECLINE')
       AND NOT EXISTS (SELECT 1 FROM tb_approval_it r WHERE r.wo_number = w.wo_number AND r.comment LIKE '%[AREA_REVIEW] %')
     ORDER BY w.date DESC, w.created_at DESC
     LIMIT ?`,
    [limit],
  );

  const enriched = items.map((row): Record<string, unknown> => {
    const jobReq = String(row.job_requirement ?? '');
    const match = jobReq.match(/- Area dipilih:\s*(.+)/);
    return {
      ...row,
      company_display: row.asset_company || row.wo_company,
      selected_area_labels: match ? match[1].trim() : '',
    };
  });
  const assetCodes = new Set(enriched.map((r) => r.AssetCode).filter(Boolean));

  ok(res, { items: enriched, summary: { total_wo: enriched.length, total_asset: assetCodes.size } });
}));

equipmentRouter.post('/equipment/missing-area-alerts/review', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '').trim();
  const decision = String(req.body.decision ?? '').trim().toUpperCase();
  const note = String(req.body.note ?? '').trim();
  if (!woNumber || !decision) throw new HttpError(422, 'wo_number dan decision wajib diisi.');
  if (!['ACCEPT', 'REJECT'].includes(decision)) throw new HttpError(422, 'Parameter tidak valid');

  const existing = await one('SELECT id_approval FROM tb_approval_it WHERE wo_number=? AND comment LIKE ? LIMIT 1', [woNumber, '%[AREA_REVIEW] %']);
  if (existing) {
    ok(res, { wo_number: woNumber }, 'Sudah ditinjau sebelumnya');
    return;
  }

  let comment = `[AREA_REVIEW] ${decision}`;
  if (note) comment += ` | NOTE: ${note.replace(/\s+/g, ' ')}`;

  await execute(
    'INSERT INTO tb_approval_it (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [woNumber, user.fullname || '-', user.avatar || 'default.jpg', user.id_division ?? 0, user.id_position || 'ADMIN_DIVISI', comment],
  );

  ok(res, { wo_number: woNumber }, 'Review disimpan');
}));

equipmentRouter.post('/equipment/gallery/reorder', authenticate, canManage, asyncHandler(async (req, res) => {
  const assetCode = String(req.body.asset_code ?? '').trim();
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((v: unknown) => Number(v)).filter((v: number) => v > 0) : [];
  if (!assetCode || !ids.length) throw new HttpError(422, 'asset_code dan ids wajib diisi.');

  await transaction(async (connection) => {
    let pos = 1;
    for (const id of ids) {
      await connection.execute('UPDATE tb_attachment_asset SET sort_order=? WHERE id=? AND AssetCode=? AND id_attachment_asset_category=?', [pos, id, assetCode, GALLERY_CATEGORY_ID]);
      pos++;
    }
  });
  ok(res, { asset_code: assetCode, count: ids.length }, 'Urutan gallery disimpan');
}));
