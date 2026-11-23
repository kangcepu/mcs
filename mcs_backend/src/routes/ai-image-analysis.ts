import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { kickAiImageAnalysisQueue } from '../lib/ai-image-analysis-worker.js';
import { buildAiImageAnalysisExport } from '../lib/ai-image-analysis-export.js';
import { saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

export const aiImageAnalysisRouter = Router();
const canView = requirePermission(
  'ai_image_analysis_view',
  'ai_image_analysis_create',
  'ai_image_analysis_retry',
  'ai_image_analysis_verify',
);
const canCreate = requirePermission('ai_image_analysis_create');
const canRetry = requirePermission('ai_image_analysis_retry');
const canVerify = requirePermission('ai_image_analysis_verify');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new HttpError(422, 'Foto harus berformat JPG, PNG, atau WEBP.'));
    }
    callback(null, true);
  },
});

async function ensureSchema(): Promise<void> {
  if (!await tableExists('ai_image_analysis') || !await tableExists('ai_image_analysis_value')) {
    throw new HttpError(503, 'Migration 20261121_ai_image_calibration_analysis.sql belum dijalankan.', 'AI_IMAGE_SCHEMA_REQUIRED');
  }
}

function number(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `AIA-${ymd}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function detail(id: number): Promise<Record<string, unknown>> {
  const header = await one<Record<string, unknown>>(
    `SELECT a.*, CONCAT('/uploads/', a.image_object_key) image_url
     FROM ai_image_analysis a WHERE a.id=? LIMIT 1`, [id],
  );
  if (!header) throw new HttpError(404, 'Hasil pembacaan gambar tidak ditemukan.');
  const hasRecommendations = await tableExists('ai_image_analysis_recommendation');
  const hasImages = await tableExists('ai_image_analysis_image');
  const [values, audits, recommendationRows, imageRows] = await Promise.all([
    rows('SELECT * FROM ai_image_analysis_value WHERE analysis_id=? ORDER BY sequence_no,id', [id]),
    rows('SELECT * FROM ai_image_analysis_audit WHERE analysis_id=? ORDER BY event_at DESC,id DESC', [id]),
    hasRecommendations
      ? rows<Record<string, unknown>>('SELECT * FROM ai_image_analysis_recommendation WHERE analysis_id=? ORDER BY recommendation_type,sequence_no,id', [id])
      : Promise.resolve([]),
    hasImages
      ? rows<Record<string, unknown>>(`SELECT id,sequence_no,file_name,mime_type,file_size,
          CONCAT('/uploads/',object_key) image_url FROM ai_image_analysis_image WHERE analysis_id=? ORDER BY sequence_no,id`, [id])
      : Promise.resolve([]),
  ]);
  let structured: Record<string, unknown> = {};
  try { structured = JSON.parse(String(header.structured_data || '{}')) as Record<string, unknown>; } catch { /* data lama */ }
  const fromTable = (type: string) => recommendationRows.filter((row) => row.recommendation_type === type);
  const suggestedProducts = fromTable('PRODUCT');
  const requiredMaterials = fromTable('RAW_MATERIAL');
  const images = imageRows.length ? imageRows : [{ sequence_no: 1, file_name: header.image_file_name,
    mime_type: header.image_mime_type, image_url: header.image_url }];
  return { ...header, values, audits, images, image_count: images.length,
    suggested_products: suggestedProducts.length ? suggestedProducts : (Array.isArray(structured.suggested_products) ? structured.suggested_products : []),
    required_materials: requiredMaterials.length ? requiredMaterials : (Array.isArray(structured.required_materials) ? structured.required_materials : []),
  };
}

aiImageAnalysisRouter.get('/ai-image-analysis/assets', authenticate, canView, asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return ok(res, []);
  const data = await rows(
    `SELECT AssetID asset_id,AssetCode asset_code,AssetName asset_name,CompanyName company_name,LocationAsset location_name
     FROM asset WHERE (AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ?)
     ORDER BY active='active' DESC,AssetName LIMIT 30`, [`%${q}%`, `%${q}%`, `%${q}%`],
  );
  ok(res, data);
}));

aiImageAnalysisRouter.get('/ai-image-analysis', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureSchema();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 20)));
  const where: string[] = [];
  const params: unknown[] = [];
  const q = String(req.query.q ?? '').trim();
  if (q) {
    where.push('(analysis_number LIKE ? OR asset_code LIKE ? OR asset_name LIKE ? OR activity_name LIKE ? OR raw_text LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  const status = String(req.query.status ?? '').trim();
  if (status) { where.push('status=?'); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM ai_image_analysis ${clause}`, params);
  const data = await rows(
    `SELECT id,analysis_number,module_code,asset_id,asset_code,asset_name,activity_name,captured_at,
            analysis_summary,llm_provider,llm_model,status,error_message,retry_count,max_retry,next_retry_at,
            last_attempt_at,processing_started_at,created_by,created_at,verified_by,verified_at,
            CONCAT('/uploads/',image_object_key) image_url
     FROM ai_image_analysis ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  ok(res, data, 'OK', { page, per_page: perPage, total: Number(total?.total ?? 0), total_pages: Math.ceil(Number(total?.total ?? 0) / perPage) });
}));

aiImageAnalysisRouter.get('/ai-image-analysis/:id', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureSchema();
  ok(res, await detail(Number(req.params.id)));
}));

aiImageAnalysisRouter.get('/ai-image-analysis/:id/export', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureSchema();
  const format = String(req.query.format ?? 'pdf').toLowerCase();
  if (!['pdf', 'xlsx'].includes(format)) throw new HttpError(422, 'Format export harus pdf atau xlsx.');
  const exported = await buildAiImageAnalysisExport(await detail(Number(req.params.id)), format as 'pdf' | 'xlsx');
  res.setHeader('Content-Type', exported.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
  res.send(exported.buffer);
}));

aiImageAnalysisRouter.post('/ai-image-analysis', authenticate, canCreate,
  upload.fields([{ name: 'images', maxCount: 8 }, { name: 'image', maxCount: 1 }]), asyncHandler(async (req, res) => {
  await ensureSchema();
  const uploaded = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const files = [...(uploaded.images ?? []), ...(uploaded.image ?? [])].slice(0, 8);
  if (!files.length) throw new HttpError(422, 'Minimal satu foto asset wajib diunggah.');
  const hasImageTable = await tableExists('ai_image_analysis_image');
  if (files.length > 1 && !hasImageTable) {
    throw new HttpError(503, 'Migration 20261123_ai_image_analysis_multiple_images.sql belum dijalankan.', 'AI_MULTI_IMAGE_SCHEMA_REQUIRED');
  }
  const activityName = String(req.body.activity_name ?? '').trim() || 'Analisis Gambar Asset';
  const assetIdInput = Number(req.body.asset_id ?? 0);
  const assetCodeInput = String(req.body.asset_code ?? '').trim();
  if (!(assetIdInput > 0) && !assetCodeInput) throw new HttpError(422, 'Pilih asset/mesin terlebih dahulu.');
  const asset = await one<{ AssetID: number; AssetCode: string; AssetName: string }>(
    'SELECT AssetID,AssetCode,AssetName FROM asset WHERE AssetID=? OR AssetCode=? LIMIT 1',
    [assetIdInput, assetCodeInput],
  );
  if (!asset) throw new HttpError(422, 'Asset/mesin tidak ditemukan.');

  const user = (req as AuthRequest).user!;
  const actor = String(user.fullname || user.username || user.id_user);
  const analysisNumber = number();
  const storedFiles = await Promise.all(files.map(async (file) => ({ file,
    objectKey: await saveUploadedFile(file.buffer, 'ai-image-analysis', file.originalname, file.mimetype) })));
  const primary = storedFiles[0];
  const inserted = await execute(
    `INSERT INTO ai_image_analysis
      (analysis_number,module_code,asset_id,asset_code,asset_name,activity_name,reference_note,captured_at,
       image_file_name,image_object_key,image_mime_type,status,next_retry_at,created_by_id,created_by,created_at)
     VALUES (?,'CALIBRATION',?,?,?,?,?,?,?,?,?,'QUEUED',NOW(),?,?,NOW())`,
    [analysisNumber, asset.AssetID, asset.AssetCode, asset.AssetName, activityName,
      null, null, primary.file.originalname, primary.objectKey, primary.file.mimetype, user.id_user, actor],
  );
  const id = Number(inserted.insertId);
  if (hasImageTable) {
    for (let index = 0; index < storedFiles.length; index += 1) {
      const item = storedFiles[index];
      await execute(
        `INSERT INTO ai_image_analysis_image
          (analysis_id,sequence_no,file_name,object_key,mime_type,file_size) VALUES (?,?,?,?,?,?)`,
        [id, index + 1, item.file.originalname, item.objectKey, item.file.mimetype, item.file.size],
      );
    }
  }
  await execute(
    `INSERT INTO ai_image_analysis_audit (analysis_id,event_type,to_status,event_note,actor_id,actor_name)
     VALUES (?,'CREATED','QUEUED',?, ?,?)`, [id, `${files.length} foto diterima dan masuk antrean analisis background.`, user.id_user, actor],
  );
  kickAiImageAnalysisQueue();
  created(res, await detail(id), `${files.length} foto tersimpan dan masuk antrean analisis background`);
}));

aiImageAnalysisRouter.post('/ai-image-analysis/:id/retry', authenticate, canRetry, asyncHandler(async (req, res) => {
  await ensureSchema();
  const id = Number(req.params.id);
  const current = await one<{ status: string }>('SELECT status FROM ai_image_analysis WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Hasil pembacaan gambar tidak ditemukan.');
  if (current.status === 'VERIFIED') throw new HttpError(422, 'Hasil yang sudah diverifikasi tidak dapat dianalisis ulang.');
  const user = (req as AuthRequest).user!;
  const actor = String(user.fullname || user.username || user.id_user);
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE ai_image_analysis SET status='QUEUED',retry_count=0,max_retry=0,next_retry_at=NOW(),processing_started_at=NULL,
        error_message=NULL,updated_at=NOW() WHERE id=?`, [id] as never,
    );
    await connection.execute(
      `INSERT INTO ai_image_analysis_audit (analysis_id,event_type,from_status,to_status,event_note,actor_id,actor_name)
       VALUES (?,'MANUAL_RETRY',?,'QUEUED','Analisis ulang diminta pengguna.',?,?)`,
      [id, current.status, user.id_user, actor] as never,
    );
  });
  kickAiImageAnalysisQueue();
  ok(res, await detail(id), 'Analisis ulang masuk antrean');
}));

aiImageAnalysisRouter.patch('/ai-image-analysis/:id/verify', authenticate, canVerify, asyncHandler(async (req, res) => {
  await ensureSchema();
  const id = Number(req.params.id);
  const current = await one<{ status: string }>('SELECT status FROM ai_image_analysis WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'Hasil pembacaan gambar tidak ditemukan.');
  if (current.status !== 'ANALYZED') throw new HttpError(422, 'Hanya hasil berstatus ANALYZED yang dapat diverifikasi.');
  const user = (req as AuthRequest).user!;
  const actor = String(user.fullname || user.username || user.id_user);
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE ai_image_analysis SET status='VERIFIED',verification_note=?,verified_by_id=?,verified_by=?,verified_at=NOW(),updated_at=NOW() WHERE id=?`,
      [String(req.body.note ?? '').trim() || null, user.id_user, actor, id] as never,
    );
    await connection.execute(
      `INSERT INTO ai_image_analysis_audit (analysis_id,event_type,from_status,to_status,event_note,actor_id,actor_name)
       VALUES (?,'VERIFIED','ANALYZED','VERIFIED',?,?,?)`,
      [id, String(req.body.note ?? '').trim() || null, user.id_user, actor] as never,
    );
  });
  ok(res, await detail(id), 'Hasil pembacaan diverifikasi');
}));
