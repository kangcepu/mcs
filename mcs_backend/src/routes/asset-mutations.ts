import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest, User } from '../types.js';

export const assetMutationRouter = Router();

const UPLOAD_DIR = path.join(config.uploadDir, 'assetMutations');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'rar', 'mp4', 'mov', 'm4v'];

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_EXT.includes(path.extname(file.originalname).slice(1).toLowerCase())),
});

const canCreate = requirePermission('asset_mutation');
const canApprove = requirePermission('approval_asset_mutation');
const canAccess = requirePermission('asset_mutation', 'report_asset_mutation', 'approval_asset_mutation');

function permissionsOf(user: User) {
  return {
    can_create: Number(user.asset_mutation ?? 0) === 1,
    can_approve: Number(user.approval_asset_mutation ?? 0) === 1,
    can_access: Number(user.asset_mutation ?? 0) === 1 || Number(user.report_asset_mutation ?? 0) === 1 || Number(user.approval_asset_mutation ?? 0) === 1,
  };
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function generateDocNo(): Promise<string> {
  const now = new Date();
  const prefix = `HRGA-MA/${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/`;
  const row = await one<{ num: number | null }>('SELECT MAX(CAST(RIGHT(doc_no,4) AS UNSIGNED)) AS num FROM asset_mutation_header WHERE doc_no LIKE ?', [`${prefix}%`]);
  return `${prefix}${String(Number(row?.num ?? 0) + 1).padStart(4, '0')}`;
}

async function listCompanies(): Promise<Record<string, unknown>[]> {
  return rows('SELECT id_company, company_name FROM tb_company ORDER BY company_name ASC');
}

async function listLocations(): Promise<Record<string, unknown>[]> {
  return rows('SELECT id_location_asset, location_name FROM tb_location_asset ORDER BY location_name ASC');
}

async function listAssets(locationBefore: string, companyBefore: string, search: string, limit: number): Promise<Record<string, unknown>[]> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (locationBefore) { where += ' AND LocationAsset = ?'; params.push(locationBefore); }
  if (companyBefore) { where += ' AND CompanyName = ?'; params.push(companyBefore); }
  if (search) { where += ' AND (AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  return rows(
    `SELECT AssetID, AssetCode, AssetName, AliasName, CategoryAsset, CompanyName, LocationAsset, Keterangan FROM asset ${where} ORDER BY AssetCode ASC LIMIT ?`,
    [...params, limit],
  );
}

async function buildAttachmentRows(docNo: string, assetCode: string): Promise<Record<string, unknown>[]> {
  const attachments = await rows<{ id: number; file_name: string }>(
    'SELECT * FROM asset_mutation_attachments WHERE doc_no=? AND asset_code=? ORDER BY id ASC',
    [docNo, assetCode],
  );
  return attachments
    .filter((a) => String(a.file_name ?? '').trim() !== '')
    .map((a) => ({ id: a.id, file_name: a.file_name, url: `/uploads/assetMutations/${a.file_name}` }));
}

async function buildDetailRows(docNo: string): Promise<Record<string, unknown>[]> {
  const details = await rows<Record<string, unknown>>('SELECT * FROM asset_mutation_detail WHERE doc_no=? ORDER BY id ASC', [docNo]);
  const out: Record<string, unknown>[] = [];
  for (const detail of details) {
    const assetCode = String(detail.AssetCode ?? '');
    out.push({ ...detail, attachments: await buildAttachmentRows(docNo, assetCode) });
  }
  return out;
}

async function saveUploadedAttachments(files: Express.Multer.File[], docNo: string, assetCode: string): Promise<{ saved: Record<string, unknown>[]; errors: string[] }> {
  const saved: Record<string, unknown>[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const key = await saveUploadedFile(file.buffer, 'assetMutations', file.originalname, file.mimetype);
    const filename = path.basename(key);
    const token = crypto.createHash('md5').update(`amut${Date.now()}${Math.random()}`).digest('hex');
    await execute('INSERT INTO asset_mutation_attachments (doc_no, file_name, asset_code, token) VALUES (?,?,?,?)', [docNo, filename, assetCode, token]);
    saved.push({ file_name: filename, url: `/uploads/assetMutations/${filename}`, size: file.size, mime_type: file.mimetype });
  }
  return { saved, errors };
}

assetMutationRouter.get('/asset-mutations/meta', authenticate, canAccess, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const locationBefore = String(req.query.location_before ?? '').trim();
  const companyBefore = String(req.query.company_before ?? '').trim();
  const search = String(req.query.search ?? '').trim();
  const permissions = permissionsOf(user);

  ok(res, {
    permissions,
    document_no: permissions.can_create ? await generateDocNo() : null,
    companies: await listCompanies(),
    locations: await listLocations(),
    assets: permissions.can_create ? await listAssets(locationBefore, companyBefore, search, 120) : [],
  }, 'Asset mutation meta retrieved successfully');
}));

assetMutationRouter.get('/asset-mutations/assets', authenticate, canAccess, asyncHandler(async (req, res) => {
  const locationBefore = String(req.query.location_before ?? '').trim();
  const companyBefore = String(req.query.company_before ?? '').trim();
  const search = String(req.query.search ?? '').trim();
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 120)));

  const items = await listAssets(locationBefore, companyBefore, search, limit);
  ok(res, { items, total: items.length }, 'Assets retrieved successfully');
}));

assetMutationRouter.get('/asset-mutations', authenticate, canAccess, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').trim().toUpperCase();
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (status) { where += ' AND h.status = ?'; params.push(status); }
  if (search) { where += ' AND (h.doc_no LIKE ? OR h.location_before LIKE ? OR h.company_before LIKE ? OR h.creator LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }

  const items = await rows(
    `SELECT h.*, (SELECT COUNT(*) FROM asset_mutation_detail d WHERE d.doc_no = h.doc_no) AS detail_count FROM asset_mutation_header h ${where} ORDER BY h.created_at DESC LIMIT ?`,
    [...params, limit],
  );
  const permissions = permissionsOf(user);
  ok(res, { items, total: items.length, permissions: { can_create: permissions.can_create, can_approve: permissions.can_approve } }, 'Asset mutation requests retrieved successfully');
}));

assetMutationRouter.get('/asset-mutations/detail', authenticate, canAccess, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const docNo = String(req.query.doc_no ?? '').trim();
  if (!docNo) throw new HttpError(400, 'doc_no is required');

  const header = await one<Record<string, unknown>>('SELECT * FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  if (!header) throw new HttpError(404, 'Document not found');

  const details = await buildDetailRows(docNo);
  const approvals = await rows(
    'SELECT a.*, d.division_name FROM approval_asset_mutation a LEFT JOIN tb_division d ON d.id_division = a.id_division WHERE a.doc_no=? ORDER BY a.approved_at ASC',
    [docNo],
  );
  const permissions = permissionsOf(user);
  ok(res, { header, details, approvals, permissions: { can_create: permissions.can_create, can_approve: permissions.can_approve } }, 'Asset mutation request detail retrieved successfully');
}));

assetMutationRouter.post('/asset-mutations/detail-item', authenticate, canCreate, upload.array('attachments'), asyncHandler(async (req, res) => {
  const b = req.body;
  const docNo = String(b.doc_no ?? '').trim();
  const assetCode = String(b.asset_code ?? '').trim();
  const assetName = String(b.asset_name ?? '').trim();
  const aliasName = String(b.alias_name ?? '').trim();
  const category = String(b.category ?? '').trim();
  const companyAfter = String(b.company_after ?? '').trim();
  const locationAfter = String(b.location_after ?? '').trim();
  const mutationPurpose = String(b.mutation_purpose ?? '').trim();
  const assetId = Number(b.asset_id ?? 0);

  if (!docNo || !assetCode || !assetName) throw new HttpError(400, 'doc_no, asset_code, and asset_name are required');
  if (!companyAfter || !locationAfter || !mutationPurpose) throw new HttpError(400, 'company_after, location_after, and mutation_purpose are required');

  const header = await one<{ status: string }>('SELECT status FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  if (header && String(header.status ?? '').toUpperCase() === 'APPROVED') throw new HttpError(400, 'Document already approved and cannot be changed');

  const exists = await one('SELECT id FROM asset_mutation_detail WHERE doc_no=? AND AssetCode=?', [docNo, assetCode]);
  if (exists) throw new HttpError(409, 'Asset already added in this document');

  const result = await execute(
    'INSERT INTO asset_mutation_detail (doc_no, AssetID, AssetCode, AssetName, AliasName, category, company_after, location_after, mutation_purpose, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [docNo, assetId > 0 ? assetId : null, assetCode, assetName, aliasName, category, companyAfter, locationAfter, mutationPurpose, nowSql()],
  );

  const upload_ = await saveUploadedAttachments((req.files as Express.Multer.File[] | undefined) ?? [], docNo, assetCode);
  const detail = await one<Record<string, unknown>>('SELECT * FROM asset_mutation_detail WHERE id=?', [result.insertId]);

  created(res, {
    detail: { ...detail, attachments: await buildAttachmentRows(docNo, assetCode) },
    upload: upload_,
    details: await buildDetailRows(docNo),
  }, 'Detail item created');
}));

assetMutationRouter.post('/asset-mutations/detail-item-delete', authenticate, canCreate, asyncHandler(async (req, res) => {
  const id = Number(req.body.id ?? 0);
  if (id <= 0) throw new HttpError(400, 'id is required');

  const detail = await one<Record<string, unknown>>('SELECT * FROM asset_mutation_detail WHERE id=?', [id]);
  if (!detail) throw new HttpError(404, 'Detail item not found');

  const docNo = String(detail.doc_no ?? '');
  const assetCode = String(detail.AssetCode ?? '');
  const header = await one<{ status: string }>('SELECT status FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  if (header && String(header.status ?? '').toUpperCase() === 'APPROVED') throw new HttpError(400, 'Document already approved and cannot be changed');

  const attachments = await rows<{ id: number; file_name: string }>('SELECT id, file_name FROM asset_mutation_attachments WHERE doc_no=? AND asset_code=?', [docNo, assetCode]);
  for (const attachment of attachments) {
    const filename = String(attachment.file_name ?? '').trim();
    if (!filename) continue;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch { } }
    await deleteObjectKey(`assetMutations/${filename}`);
  }

  await execute('DELETE FROM asset_mutation_attachments WHERE doc_no=? AND asset_code=?', [docNo, assetCode]);
  await execute('DELETE FROM asset_mutation_detail WHERE id=?', [id]);

  ok(res, { doc_no: docNo, details: await buildDetailRows(docNo) }, 'Detail item deleted');
}));

assetMutationRouter.post('/asset-mutations/submit', authenticate, canCreate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const docNo = String(b.doc_no ?? '').trim();
  const date = String(b.date ?? '').trim();
  const locationBefore = String(b.location_before ?? '').trim();
  const companyBefore = String(b.company_before ?? '').trim();
  if (!docNo || !date || !locationBefore || !companyBefore) throw new HttpError(400, 'doc_no, date, location_before, and company_before are required');

  const exists = await one('SELECT doc_no, status FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  if (exists) throw new HttpError(409, 'Document already submitted');

  const detailsCount = await one<{ total: number }>('SELECT COUNT(*) AS total FROM asset_mutation_detail WHERE doc_no=?', [docNo]);
  if (Number(detailsCount?.total ?? 0) <= 0) throw new HttpError(400, 'Please add at least one detail item');

  const createdAt = nowSql();
  const header = { doc_no: docNo, location_before: locationBefore, date, company_before: companyBefore, creator: String(user.fullname ?? ''), status: 'NEED_APPROVED', created_at: createdAt };
  await execute('INSERT INTO asset_mutation_header (doc_no, location_before, date, company_before, creator, status, created_at) VALUES (?,?,?,?,?,?,?)', [docNo, locationBefore, date, companyBefore, header.creator, 'NEED_APPROVED', createdAt]);

  created(res, { header, details_count: Number(detailsCount?.total ?? 0) }, 'Asset mutation request submitted');
}));

assetMutationRouter.post('/asset-mutations/approve', authenticate, canApprove, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const docNo = String(req.body.doc_no ?? '').trim();
  if (!docNo) throw new HttpError(400, 'doc_no is required');

  const header = await one<Record<string, unknown>>('SELECT * FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  if (!header) throw new HttpError(404, 'Document not found');

  if (String(header.status ?? '').toUpperCase() === 'APPROVED') {
    ok(res, header, 'Document already approved');
    return;
  }

  const details = await rows<Record<string, unknown>>('SELECT * FROM asset_mutation_detail WHERE doc_no=?', [docNo]);
  if (!details.length) throw new HttpError(400, 'No detail items to approve');

  const approval = { doc_no: docNo, fullname: String(user.fullname ?? ''), id_division: user.id_division ?? null, id_position: String(user.id_position ?? ''), approved_at: nowSql() };

  await transaction(async (connection) => {
    for (const detail of details) {
      const companyAfter = String(detail.company_after ?? '');
      const locationAfter = String(detail.location_after ?? '');
      const assetId = Number(detail.AssetID ?? 0);
      const assetCode = String(detail.AssetCode ?? '');

      if (assetId > 0) {
        await connection.execute('UPDATE asset SET CompanyName=?, LocationAsset=?, updated_at=NOW(), updated_by=? WHERE AssetID=?', [companyAfter, locationAfter, approval.fullname, assetId]);
      } else if (assetCode) {
        await connection.execute('UPDATE asset SET CompanyName=?, LocationAsset=?, updated_at=NOW(), updated_by=? WHERE AssetCode=?', [companyAfter, locationAfter, approval.fullname, assetCode]);
      }
    }
    await connection.execute('UPDATE asset_mutation_header SET status=? WHERE doc_no=?', ['APPROVED', docNo]);
    await connection.execute(
      'INSERT INTO approval_asset_mutation (doc_no, fullname, id_division, id_position, approved_at) VALUES (?,?,?,?,?)',
      [approval.doc_no, approval.fullname, approval.id_division, approval.id_position, approval.approved_at],
    );
  });

  const updatedHeader = await one<Record<string, unknown>>('SELECT * FROM asset_mutation_header WHERE doc_no=?', [docNo]);
  ok(res, { header: updatedHeader, approval }, 'Asset mutation request approved');
}));
