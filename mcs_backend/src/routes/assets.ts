import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import type { AuthRequest } from '../types.js';

const upload = multer({ dest: config.uploadDir, limits: { fileSize: config.maxUploadBytes } });
export const assetRouter = Router();
const assetFields = ['AssetCode', 'AssetName', 'AliasName', 'brand', 'CompanyName', 'CategoryAsset', 'LocationAsset', 'Keterangan', 'active', 'status', 'Remarks', 'id_location_asset', 'mtc_area_key'];
const bodyFields = (body: Record<string, unknown>, allowed: string[]) => Object.fromEntries(Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined));

assetRouter.get('/assets/options', authenticate, asyncHandler(async (_req, res) => {
  const [companies, categories, locations] = await Promise.all([rows('SELECT * FROM tb_company'), rows('SELECT * FROM tb_category_asset'), rows('SELECT * FROM tb_location_asset')]); ok(res, { companies, categories, locations });
}));
assetRouter.get('/assets', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1)); const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 25))); const q = String(req.query.q ?? '');
  const where = 'WHERE AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ?'; const params = [`%${q}%`, `%${q}%`, `%${q}%`];
  const total = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM asset ${where}`, params);
  const data = await rows(`SELECT * FROM asset ${where} ORDER BY AssetID DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  ok(res, data, 'OK', { page, limit, total: Number(total?.total ?? 0) });
}));
assetRouter.post('/assets', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => {
  const fields = bodyFields(req.body, assetFields); if (!fields.AssetCode || !fields.AssetName) throw new HttpError(400, 'AssetCode and AssetName are required');
  const keys = Object.keys(fields); const user = (req as AuthRequest).user!;
  const result = await execute(`INSERT INTO asset (${keys.map((k) => `\`${k}\``).join(', ')}, created_at, created_by, updated_by) VALUES (${keys.map(() => '?').join(', ')}, NOW(), ?, ?)`, [...Object.values(fields), user.fullname, user.fullname]);
  created(res, { AssetID: result.insertId }, 'Asset created');
}));
assetRouter.get('/assets/detail', authenticate, asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.query.AssetID ?? req.query.asset_id; if (!id) throw new HttpError(400, 'Asset ID is required');
  const asset = await one('SELECT * FROM asset WHERE AssetID = ? OR AssetCode = ? LIMIT 1', [id, id]); if (!asset) throw new HttpError(404, 'Asset not found');
  const code = String((asset as Record<string, unknown>).AssetCode); const [details, attachments, parts] = await Promise.all([rows('SELECT * FROM asset_custom_details WHERE asset_code = ? ORDER BY row_order, id', [code]), rows('SELECT * FROM tb_attachment_asset WHERE AssetCode = ? ORDER BY position, id', [code]), rows('SELECT * FROM tb_parts_bom WHERE AssetCode = ? AND deleted_at IS NULL ORDER BY no_urut, id', [code])]);
  ok(res, { ...asset as object, custom_details: details, attachments, parts });
}));
assetRouter.patch('/assets/detail', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { const id = req.body.AssetID ?? req.query.id; if (!id) throw new HttpError(400, 'Asset ID is required'); const fields = bodyFields(req.body, assetFields); const keys = Object.keys(fields); if (!keys.length) throw new HttpError(400, 'No changes provided'); await execute(`UPDATE asset SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = NOW(), updated_by = ? WHERE AssetID = ?`, [...Object.values(fields), (req as AuthRequest).user!.fullname, id]); ok(res, null, 'Asset updated'); }));
assetRouter.post('/assets/status', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { const { AssetID, active } = req.body; if (!AssetID || !['active', 'inactive'].includes(active)) throw new HttpError(400, 'AssetID and active status are required'); await execute('UPDATE asset SET active = ?, updated_at = NOW(), updated_by = ? WHERE AssetID = ?', [active, (req as AuthRequest).user!.fullname, AssetID]); ok(res, null, 'Asset status updated'); }));
assetRouter.post('/assets/generate-code', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { const { company = 'MCS', category = 'ASSET', location = 'GENERAL' } = req.body; const prefix = `${String(company).slice(0, 3).toUpperCase()}/${String(category).slice(0, 3).toUpperCase()}-${String(location).slice(0, 3).toUpperCase()}`; const last = await one<{ seq: number }>('SELECT MAX(CAST(RIGHT(AssetCode, 4) AS UNSIGNED)) AS seq FROM asset WHERE AssetCode LIKE ?', [`${prefix}/%`]); ok(res, { AssetCode: `${prefix}/${String(Number(last?.seq ?? 0) + 1).padStart(4, '0')}` }); }));

assetRouter.get('/assets/custom-details', authenticate, asyncHandler(async (req, res) => { const code = String(req.query.asset_code ?? req.query.AssetCode ?? ''); if (!code) throw new HttpError(400, 'asset_code is required'); ok(res, await rows('SELECT * FROM asset_custom_details WHERE asset_code = ? ORDER BY row_order, id', [code])); }));
assetRouter.post('/assets/custom-details', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { const b = req.body; if (!b.asset_code || !b.part_mesin) throw new HttpError(400, 'asset_code and part_mesin are required'); const result = await execute('INSERT INTO asset_custom_details (asset_code,row_order,bagian,bagian_mesin,part_mesin,kondisi,durasi_pengecekan,pic,part_diperlukan,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [b.asset_code, Number(b.row_order ?? 0), b.bagian ?? null, b.bagian_mesin ?? null, b.part_mesin, b.kondisi ?? null, b.durasi_pengecekan ?? null, b.pic ?? null, b.part_diperlukan ?? null, (req as AuthRequest).user!.fullname, (req as AuthRequest).user!.fullname]); created(res, { id: result.insertId }, 'Custom detail created'); }));
assetRouter.patch('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { const b = bodyFields(req.body, ['row_order','bagian','bagian_mesin','part_mesin','kondisi','durasi_pengecekan','pic','part_diperlukan']); const keys = Object.keys(b); if (!keys.length) throw new HttpError(400, 'No changes provided'); await execute(`UPDATE asset_custom_details SET ${keys.map((k) => `\`${k}\`=?`).join(', ')}, updated_by=? WHERE id=?`, [...Object.values(b), (req as AuthRequest).user!.fullname, req.params.id]); ok(res, null, 'Custom detail updated'); }));
assetRouter.delete('/assets/custom-details/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { await execute('DELETE FROM asset_custom_details WHERE id = ?', [req.params.id]); ok(res, null, 'Custom detail deleted'); }));

assetRouter.get('/assets/attachments', authenticate, asyncHandler(async (req, res) => { const code = String(req.query.asset_code ?? req.query.AssetCode ?? ''); if (!code) throw new HttpError(400, 'asset_code is required'); ok(res, await rows('SELECT * FROM tb_attachment_asset WHERE AssetCode=? ORDER BY position,id', [code])); }));
assetRouter.post('/assets/attachments', authenticate, requirePermission('privilage_asset'), upload.single('file'), asyncHandler(async (req, res) => { const b = req.body; if (!b.AssetCode && !b.asset_code) throw new HttpError(400, 'AssetCode is required'); const file = req.file; if (!file) throw new HttpError(400, 'file is required'); const result = await execute('INSERT INTO tb_attachment_asset (AssetCode, attachment, filename, category_id, position, created_at) VALUES (?,?,?,?,?,NOW())', [b.AssetCode ?? b.asset_code, file.path.replaceAll('\\', '/'), file.originalname, b.category_id ?? null, Number(b.position ?? 0)]); created(res, { id: result.insertId, filename: file.originalname }, 'Attachment uploaded'); }));
assetRouter.delete('/assets/attachments/:id', authenticate, requirePermission('privilage_asset'), asyncHandler(async (req, res) => { await execute('DELETE FROM tb_attachment_asset WHERE id=?', [req.params.id]); ok(res, null, 'Attachment deleted'); }));
