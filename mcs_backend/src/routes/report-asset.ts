import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { one, rows } from '../db.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import { qrPngDataUrl } from '../lib/qr.js';

export const reportAssetRouter = Router();

const canAccess = requirePermission('report_asset');

const SEARCH_COLUMNS = ['AssetCode', 'AssetName', 'AliasName', 'CompanyName', 'CategoryAsset', 'LocationAsset', 'Keterangan'];
const SORT_COLUMNS: Record<string, string> = {
  AssetCode: 'AssetCode', AssetName: 'AssetName', AliasName: 'AliasName', CompanyName: 'CompanyName',
  CategoryAsset: 'CategoryAsset', LocationAsset: 'LocationAsset', Keterangan: 'Keterangan', AssetID: 'AssetID',
};

async function attachAttachments(assetCodes: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const map = new Map<string, Record<string, unknown>[]>();
  if (!assetCodes.length) return map;
  const placeholders = assetCodes.map(() => '?').join(',');
  const attachments = await rows<{ AssetCode: string; filename: string; id: number; category_name: string | null; category_number: number | null }>(
    `SELECT a.AssetCode, a.filename, a.id, c.category_name, c.number AS category_number
     FROM tb_attachment_asset a
     LEFT JOIN tb_attachment_asset_category c ON c.id = a.id_attachment_asset_category
     WHERE a.AssetCode IN (${placeholders})
     ORDER BY COALESCE(c.number, 999999) ASC, a.sort_order ASC, a.id ASC`,
    assetCodes,
  );
  for (const att of attachments) {
    const list = map.get(att.AssetCode) ?? [];
    list.push({
      id: att.id,
      filename: att.filename,
      url: `/uploads/masterAsset/${att.filename}`,
      category: att.category_name ?? 'Uncategorized',
    });
    map.set(att.AssetCode, list);
  }
  return map;
}

reportAssetRouter.get('/report-asset/list', authenticate, canAccess, asyncHandler(async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(req.query.page_size ?? 25)));
  const sortBy = SORT_COLUMNS[String(req.query.sort_by ?? '')] ?? 'AssetID';
  const sortDir = String(req.query.sort_dir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (search) {
    where += ` AND (${SEARCH_COLUMNS.map((c) => `${c} LIKE ?`).join(' OR ')})`;
    params.push(...SEARCH_COLUMNS.map(() => `%${search}%`));
  }

  const totalRow = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM asset ${where}`, params);
  const total = Number(totalRow?.total ?? 0);

  const items = await rows<Record<string, unknown>>(
    `SELECT AssetID, AssetCode, AssetName, AliasName, CompanyName, CategoryAsset, LocationAsset, Keterangan, Remarks, active, status
     FROM asset ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  const attachmentMap = await attachAttachments(items.map((i) => String(i.AssetCode)));
  const data = items.map((row) => ({
    ...row,
    is_active: String(row.active).toLowerCase() === 'active',
    attachments: attachmentMap.get(String(row.AssetCode)) ?? [],
  }));

  ok(res, { items: data, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) }, 'Asset report retrieved successfully');
}));

reportAssetRouter.get('/report-asset/detail', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  if (!assetCode) throw new HttpError(400, 'asset_code is required');
  const asset = await one<Record<string, unknown>>('SELECT * FROM asset WHERE AssetCode = ?', [assetCode]);
  if (!asset) throw new HttpError(404, 'Asset not found');
  const attachmentMap = await attachAttachments([assetCode]);
  ok(res, { ...asset, is_active: String(asset.active).toLowerCase() === 'active', attachments: attachmentMap.get(assetCode) ?? [] }, 'Asset detail retrieved successfully');
}));

reportAssetRouter.get('/report-asset/qrcode', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  if (!assetCode) throw new HttpError(400, 'asset_code is required');
  const asset = await one<Record<string, unknown>>('SELECT AssetID, AssetCode, AssetName FROM asset WHERE AssetCode = ?', [assetCode]);
  if (!asset) throw new HttpError(404, 'Asset not found');

  const qrImage = await qrPngDataUrl(assetCode);
  ok(res, { title: `QR Code ${asset.AssetCode}`, asset_code: asset.AssetCode, asset_name: asset.AssetName, asset_id: asset.AssetID, qr_image: qrImage }, 'QR code generated successfully');
}));

reportAssetRouter.get('/report-asset/export', authenticate, canAccess, asyncHandler(async (_req, res) => {
  const items = await rows<Record<string, unknown>>('SELECT AssetCode, AssetName, AliasName, CompanyName, CategoryAsset, LocationAsset, Keterangan FROM asset ORDER BY AssetID DESC');
  const attachmentMap = await attachAttachments(items.map((i) => String(i.AssetCode)));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`LIST ASSETS ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`);
  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'Export List Asset';
  sheet.getCell('A1').font = { bold: true, size: 14 };

  const header = ['NO.', 'ASSET CODE', 'ASSET NAME', 'ALIAS NAME', 'COMPANY NAME', 'CATEGORY ASSET', 'LOCATION ASSET', 'KETERANGAN', 'ATTACHMENT'];
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  items.forEach((item, i) => {
    const files = (attachmentMap.get(String(item.AssetCode)) ?? []).map((a) => a.filename).join(', ');
    const row = sheet.addRow([i + 1, item.AssetCode, item.AssetName, item.AliasName, item.CompanyName, item.CategoryAsset, item.LocationAsset, item.Keterangan, files]);
    row.alignment = { horizontal: 'center' };
  });
  sheet.columns.forEach((col) => { col.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `LIST ASSETS${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, '-')}.xlsx`;
  res.status(200).set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  }).send(Buffer.from(buffer));
}));

reportAssetRouter.get('/report-asset/qr-list', authenticate, asyncHandler(async (_req, res) => {
  const items = await rows(
    `SELECT AssetID AS asset_id, AssetCode AS asset_code, AssetName AS asset_name, CompanyName AS company_name,
            LocationAsset AS location_asset, Keterangan AS asset_keterangan
     FROM asset ORDER BY AssetCode ASC`,
  );
  ok(res, { items, total: items.length }, 'Assets for QR printing retrieved successfully');
}));
