import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { kickAiImageAnalysisQueue } from '../lib/ai-image-analysis-worker.js';
import { buildAiImageAnalysisExport, cleanAiOcrText } from '../lib/ai-image-analysis-export.js';
import { saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

export const aiImageAnalysisRouter = Router();
const canView = requirePermission(
  'ai_image_analysis_view',
  'ai_image_analysis_create',
  'ai_image_analysis_retry',
  'ai_image_analysis_verify',
  'ai_image_analysis_master',
);
const canCreate = requirePermission('ai_image_analysis_create');
const canRetry = requirePermission('ai_image_analysis_retry');
const canVerify = requirePermission('ai_image_analysis_verify');
const canManageMaster = requirePermission('ai_image_analysis_master');
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

async function ensureMachineSchema(): Promise<void> {
  await ensureSchema();
  if (!await tableExists('ai_image_parameter_master')) {
    throw new HttpError(503, 'Migration 20261125_ai_image_machine_parameter_master.sql belum dijalankan.', 'AI_MACHINE_PARAMETER_SCHEMA_REQUIRED');
  }
}

function actor(req: AuthRequest): { id: number; name: string } {
  const user = req.user!;
  return { id: Number(user.id_user), name: String(user.fullname || user.username || user.id_user) };
}

function optionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parameterReference(parameter: Record<string, unknown>): string {
  const unit = String(parameter.unit ?? '').trim();
  const parts: string[] = [];
  if (parameter.minimum_value !== null && parameter.minimum_value !== undefined) parts.push(`Minimum ${parameter.minimum_value}${unit ? ` ${unit}` : ''}`);
  if (parameter.target_value !== null && parameter.target_value !== undefined) parts.push(`Target ${parameter.target_value}${unit ? ` ${unit}` : ''}`);
  if (parameter.maximum_value !== null && parameter.maximum_value !== undefined) parts.push(`Maksimum ${parameter.maximum_value}${unit ? ` ${unit}` : ''}`);
  if (String(parameter.reference_text ?? '').trim()) parts.push(String(parameter.reference_text).trim());
  if (String(parameter.photo_instruction ?? '').trim()) parts.push(`Instruksi foto: ${String(parameter.photo_instruction).trim()}`);
  return parts.join('. ') || 'Tidak ada nilai acuan; baca dan transkripsikan parameter tanpa menyimpulkan normal/abnormal.';
}

function number(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `AIA-${ymd}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function detail(id: number): Promise<Record<string, unknown>> {
  const hasParameterMaster = await tableExists('ai_image_parameter_master');
  const header = await one<Record<string, unknown>>(
    `SELECT a.*, CONCAT('/uploads/', a.image_object_key) image_url,
       ${hasParameterMaster ? `p.parameter_code,p.parameter_name,p.parameter_group,p.reference_type,p.minimum_value,p.target_value,
       p.maximum_value,p.reference_text parameter_reference_text,p.unit parameter_unit,p.photo_instruction` : 'NULL parameter_code,NULL parameter_name,NULL parameter_group'}
     FROM ai_image_analysis a
     ${hasParameterMaster ? 'LEFT JOIN ai_image_parameter_master p ON p.id=a.parameter_id' : ''}
     WHERE a.id=? LIMIT 1`, [id],
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
  return { ...header, raw_text: cleanAiOcrText(header.raw_text), values, audits, images, image_count: images.length,
    suggested_products: suggestedProducts.length ? suggestedProducts : (Array.isArray(structured.suggested_products) ? structured.suggested_products : []),
    required_materials: requiredMaterials.length ? requiredMaterials : (Array.isArray(structured.required_materials) ? structured.required_materials : []),
  };
}

aiImageAnalysisRouter.get('/ai-image-analysis/assets', authenticate, canView, asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return ok(res, []);
  const data = await rows(
    `SELECT AssetID asset_id,AssetCode asset_code,AssetName asset_name,CompanyName company_name,LocationAsset location_name
     FROM asset WHERE active='active' AND CategoryAsset='Mesin Pabrik'
       AND (AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ?)
     ORDER BY active='active' DESC,AssetName LIMIT 30`, [`%${q}%`, `%${q}%`, `%${q}%`],
  );
  ok(res, data);
}));

aiImageAnalysisRouter.get('/ai-image-analysis/machines', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureMachineSchema();
  const q = String(req.query.q ?? '').trim();
  const company = String(req.query.company ?? '').trim();
  const where = ["a.active='active'", "a.CategoryAsset='Mesin Pabrik'"];
  const params: unknown[] = [];
  if (q) { where.push('(a.AssetCode LIKE ? OR a.AssetName LIKE ? OR a.AliasName LIKE ? OR a.LocationAsset LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  if (company) { where.push('a.CompanyName=?'); params.push(company); }
  const data = await rows(
    `SELECT a.AssetID asset_id,a.AssetCode asset_code,a.AssetName asset_name,a.AliasName alias_name,
       a.CompanyName company_name,a.LocationAsset location_name,a.brand,
       COALESCE(p.parameter_count,0) parameter_count,COALESCE(x.analysis_count,0) analysis_count,
       COALESCE(x.unmapped_count,0) unmapped_count,x.latest_analysis_at,x.latest_status,
       COALESCE(x.attention_count,0) attention_count
     FROM asset a
     LEFT JOIN (SELECT asset_id,COUNT(*) parameter_count FROM ai_image_parameter_master WHERE status='ACTIVE' GROUP BY asset_id) p ON p.asset_id=a.AssetID
     LEFT JOIN (
       SELECT asset_id,COUNT(*) analysis_count,SUM(parameter_id IS NULL) unmapped_count,MAX(created_at) latest_analysis_at,
         SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC,id DESC),',',1) latest_status,
         SUM(status='FAILED' OR findings LIKE '%CRITICAL%' OR findings LIKE '%WARNING%') attention_count
       FROM ai_image_analysis GROUP BY asset_id
     ) x ON x.asset_id=a.AssetID
     WHERE ${where.join(' AND ')} ORDER BY (x.latest_analysis_at IS NULL),x.latest_analysis_at DESC,a.AssetName LIMIT 500`, params,
  );
  ok(res, data);
}));

aiImageAnalysisRouter.get('/ai-image-analysis/machines/:assetId', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureMachineSchema();
  const assetId = Number(req.params.assetId);
  const machine = await one<Record<string, unknown>>(
    `SELECT AssetID asset_id,AssetCode asset_code,AssetName asset_name,AliasName alias_name,brand,
       CompanyName company_name,LocationAsset location_name,CategoryAsset category
     FROM asset WHERE AssetID=? AND active='active' AND CategoryAsset='Mesin Pabrik' LIMIT 1`, [assetId],
  );
  if (!machine) throw new HttpError(404, 'Machine tidak ditemukan pada Asset Management.');
  const parameters = await rows<Record<string, unknown>>(
    `SELECT p.*,
       COUNT(a.id) analysis_count,MAX(a.created_at) latest_analysis_at,
       SUBSTRING_INDEX(GROUP_CONCAT(a.status ORDER BY a.created_at DESC,a.id DESC),',',1) latest_status,
       SUBSTRING_INDEX(GROUP_CONCAT(a.id ORDER BY a.created_at DESC,a.id DESC),',',1) latest_analysis_id
     FROM ai_image_parameter_master p
     LEFT JOIN ai_image_analysis a ON a.parameter_id=p.id
     WHERE p.asset_id=? GROUP BY p.id ORDER BY p.status='ACTIVE' DESC,p.sort_order,p.parameter_group,p.parameter_name`, [assetId],
  );
  const unmapped = await rows<Record<string, unknown>>(
    `SELECT id,analysis_number,activity_name,status,analysis_summary,created_by,created_at,
       CONCAT('/uploads/',image_object_key) image_url
     FROM ai_image_analysis WHERE asset_id=? AND parameter_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 50`, [assetId],
  );
  ok(res, { machine, parameters, unmapped_analyses: unmapped });
}));

aiImageAnalysisRouter.get('/ai-image-analysis/parameters/:id/history', authenticate, canView, asyncHandler(async (req, res) => {
  await ensureMachineSchema();
  const id = Number(req.params.id);
  const parameter = await one('SELECT * FROM ai_image_parameter_master WHERE id=?', [id]);
  if (!parameter) throw new HttpError(404, 'Master parameter tidak ditemukan.');
  const data = await rows(
    `SELECT id,analysis_number,asset_id,asset_code,asset_name,parameter_id,activity_name,status,analysis_summary,
       error_message,created_by,created_at,verified_by,verified_at,CONCAT('/uploads/',image_object_key) image_url
     FROM ai_image_analysis WHERE parameter_id=? ORDER BY created_at DESC,id DESC LIMIT 100`, [id],
  );
  ok(res, { parameter, analyses: data });
}));

aiImageAnalysisRouter.post('/ai-image-analysis/machines/:assetId/parameters', authenticate, canManageMaster, asyncHandler(async (req, res) => {
  await ensureMachineSchema();
  const assetId = Number(req.params.assetId);
  const machine = await one('SELECT AssetID FROM asset WHERE AssetID=? AND active=\'active\' AND CategoryAsset=\'Mesin Pabrik\'', [assetId]);
  if (!machine) throw new HttpError(422, 'Machine tidak ditemukan pada Asset Management.');
  const name = String(req.body.parameter_name ?? '').trim();
  if (!name) throw new HttpError(422, 'Nama parameter wajib diisi.');
  const code = String(req.body.parameter_code ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_')
    || `PAR-${randomBytes(3).toString('hex').toUpperCase()}`;
  const refType = String(req.body.reference_type ?? 'NONE').toUpperCase();
  if (!['NONE', 'RANGE', 'TARGET', 'TEXT'].includes(refType)) throw new HttpError(422, 'Jenis acuan tidak valid.');
  const user = actor(req as AuthRequest);
  const inserted = await execute(
    `INSERT INTO ai_image_parameter_master
      (asset_id,parameter_code,parameter_name,parameter_group,description,reference_type,minimum_value,target_value,
       maximum_value,reference_text,unit,photo_instruction,minimum_photo_count,check_interval_days,sort_order,
       is_required,status,created_by_id,created_by,updated_by_id,updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ACTIVE',?,?,?,?,NOW(),NOW())`,
    [assetId, code, name, String(req.body.parameter_group ?? '').trim() || null,
      String(req.body.description ?? '').trim() || null, refType, optionalNumber(req.body.minimum_value),
      optionalNumber(req.body.target_value), optionalNumber(req.body.maximum_value),
      String(req.body.reference_text ?? '').trim() || null, String(req.body.unit ?? '').trim() || null,
      String(req.body.photo_instruction ?? '').trim() || null,
      Math.max(1, Math.min(8, Number(req.body.minimum_photo_count ?? 1))), optionalNumber(req.body.check_interval_days),
      Math.max(0, Number(req.body.sort_order ?? 0)), Number(req.body.is_required ?? 1) ? 1 : 0,
      user.id, user.name, user.id, user.name],
  );
  const createdParameter = await one<Record<string, unknown>>('SELECT * FROM ai_image_parameter_master WHERE id=?', [inserted.insertId]);
  await execute(`INSERT INTO ai_image_parameter_audit
    (parameter_id,event_type,after_data,event_note,actor_id,actor_name) VALUES (?,'CREATED',?,'Master parameter dibuat.',?,?)`,
  [inserted.insertId, JSON.stringify(createdParameter), user.id, user.name]);
  created(res, createdParameter, 'Master parameter machine dibuat');
}));

aiImageAnalysisRouter.patch('/ai-image-analysis/parameters/:id', authenticate, canManageMaster, asyncHandler(async (req, res) => {
  await ensureMachineSchema();
  const id = Number(req.params.id);
  const before = await one<Record<string, unknown>>('SELECT * FROM ai_image_parameter_master WHERE id=?', [id]);
  if (!before) throw new HttpError(404, 'Master parameter tidak ditemukan.');
  const refType = String(req.body.reference_type ?? before.reference_type ?? 'NONE').toUpperCase();
  const status = String(req.body.status ?? before.status ?? 'ACTIVE').toUpperCase();
  if (!['NONE', 'RANGE', 'TARGET', 'TEXT'].includes(refType) || !['ACTIVE', 'INACTIVE'].includes(status)) throw new HttpError(422, 'Acuan atau status tidak valid.');
  const user = actor(req as AuthRequest);
  await execute(
    `UPDATE ai_image_parameter_master SET parameter_code=?,parameter_name=?,parameter_group=?,description=?,reference_type=?,
       minimum_value=?,target_value=?,maximum_value=?,reference_text=?,unit=?,photo_instruction=?,minimum_photo_count=?,
       check_interval_days=?,sort_order=?,is_required=?,status=?,updated_by_id=?,updated_by=?,updated_at=NOW() WHERE id=?`,
    [String(req.body.parameter_code ?? before.parameter_code).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_'),
      String(req.body.parameter_name ?? before.parameter_name).trim(), String(req.body.parameter_group ?? before.parameter_group ?? '').trim() || null,
      String(req.body.description ?? before.description ?? '').trim() || null, refType,
      optionalNumber(req.body.minimum_value ?? before.minimum_value), optionalNumber(req.body.target_value ?? before.target_value),
      optionalNumber(req.body.maximum_value ?? before.maximum_value), String(req.body.reference_text ?? before.reference_text ?? '').trim() || null,
      String(req.body.unit ?? before.unit ?? '').trim() || null, String(req.body.photo_instruction ?? before.photo_instruction ?? '').trim() || null,
      Math.max(1, Math.min(8, Number(req.body.minimum_photo_count ?? before.minimum_photo_count ?? 1))),
      optionalNumber(req.body.check_interval_days ?? before.check_interval_days), Math.max(0, Number(req.body.sort_order ?? before.sort_order ?? 0)),
      Number(req.body.is_required ?? before.is_required) ? 1 : 0, status, user.id, user.name, id],
  );
  const after = await one<Record<string, unknown>>('SELECT * FROM ai_image_parameter_master WHERE id=?', [id]);
  await execute(`INSERT INTO ai_image_parameter_audit
    (parameter_id,event_type,before_data,after_data,event_note,actor_id,actor_name) VALUES (?,'UPDATED',?,?,?, ?,?)`,
  [id, JSON.stringify(before), JSON.stringify(after), String(req.body.event_note ?? '').trim() || 'Master parameter diperbarui.', user.id, user.name]);
  ok(res, after, 'Master parameter diperbarui');
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
  const assetId = Number(req.query.asset_id ?? 0);
  if (assetId > 0) { where.push('asset_id=?'); params.push(assetId); }
  const parameterId = Number(req.query.parameter_id ?? 0);
  if (parameterId > 0) { where.push('parameter_id=?'); params.push(parameterId); }
  const dateFrom = String(req.query.date_from ?? '').trim();
  const dateTo = String(req.query.date_to ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    where.push('created_at>=?'); params.push(`${dateFrom} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    where.push('created_at<DATE_ADD(?,INTERVAL 1 DAY)'); params.push(dateTo);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM ai_image_analysis ${clause}`, params);
  const data = await rows(
    `SELECT id,analysis_number,module_code,asset_id,asset_code,asset_name,activity_name,captured_at,
            parameter_id,analysis_summary,llm_provider,llm_model,status,error_message,retry_count,max_retry,next_retry_at,
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
  await ensureMachineSchema();
  const uploaded = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const files = [...(uploaded.images ?? []), ...(uploaded.image ?? [])].slice(0, 8);
  if (!files.length) throw new HttpError(422, 'Minimal satu foto asset wajib diunggah.');
  const hasImageTable = await tableExists('ai_image_analysis_image');
  if (files.length > 1 && !hasImageTable) {
    throw new HttpError(503, 'Migration 20261123_ai_image_analysis_multiple_images.sql belum dijalankan.', 'AI_MULTI_IMAGE_SCHEMA_REQUIRED');
  }
  const assetIdInput = Number(req.body.asset_id ?? 0);
  const assetCodeInput = String(req.body.asset_code ?? '').trim();
  if (!(assetIdInput > 0) && !assetCodeInput) throw new HttpError(422, 'Pilih asset/mesin terlebih dahulu.');
  const asset = await one<{ AssetID: number; AssetCode: string; AssetName: string; CategoryAsset: string }>(
    "SELECT AssetID,AssetCode,AssetName,CategoryAsset FROM asset WHERE active='active' AND CategoryAsset='Mesin Pabrik' AND (AssetID=? OR AssetCode=?) LIMIT 1",
    [assetIdInput, assetCodeInput],
  );
  if (!asset) throw new HttpError(422, 'Asset/mesin tidak ditemukan.');
  const parameterId = Number(req.body.parameter_id ?? 0);
  if (!(parameterId > 0)) throw new HttpError(422, 'Pilih master parameter machine sebelum mengunggah foto.');
  const parameter = await one<Record<string, unknown>>(
    "SELECT * FROM ai_image_parameter_master WHERE id=? AND asset_id=? AND status='ACTIVE' LIMIT 1", [parameterId, asset.AssetID],
  );
  if (!parameter) throw new HttpError(422, 'Parameter tidak aktif atau bukan milik machine yang dipilih.');
  const minimumPhotos = Math.max(1, Number(parameter.minimum_photo_count ?? 1));
  if (files.length < minimumPhotos) throw new HttpError(422, `Parameter ini membutuhkan minimal ${minimumPhotos} foto.`);

  const user = (req as AuthRequest).user!;
  const actor = String(user.fullname || user.username || user.id_user);
  const analysisNumber = number();
  const storedFiles = await Promise.all(files.map(async (file) => ({ file,
    objectKey: await saveUploadedFile(file.buffer, 'ai-image-analysis', file.originalname, file.mimetype) })));
  const primary = storedFiles[0];
  const inserted = await execute(
    `INSERT INTO ai_image_analysis
      (analysis_number,module_code,asset_id,asset_code,asset_name,parameter_id,activity_name,reference_note,captured_at,
       image_file_name,image_object_key,image_mime_type,status,next_retry_at,created_by_id,created_by,created_at)
     VALUES (?,'CALIBRATION',?,?,?,?,?,?,?,?,?,?,'QUEUED',NOW(),?,?,NOW())`,
    [analysisNumber, asset.AssetID, asset.AssetCode, asset.AssetName, parameterId,
      String(parameter.parameter_name), parameterReference(parameter),
      null, primary.file.originalname, primary.objectKey, primary.file.mimetype, user.id_user, actor],
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
