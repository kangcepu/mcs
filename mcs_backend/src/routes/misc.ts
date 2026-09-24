import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission, md5, resolveAvatarUrl } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists } from '../db.js';
import { asyncHandler, HttpError, ok, created, legacyOk } from '../http.js';
import { deleteSetting, ensureAppSettingTable, getSetting, putSetting } from '../lib/app-settings.js';
import { encryptSecret } from '../lib/crypto-secrets.js';
import { FIREBASE_CREDENTIAL_SETTING_KEY } from '../lib/fcm.js';
import { getAssetReportList, getAssetsHistoryReport, getQrReport, recapWorkOrderOptions } from '../lib/reports.js';
import { getNotificationDetail, getNotificationSummary } from '../lib/notifications.js';
import { nowInJakarta } from '../lib/daily-control.js';
import { runPreventiveAlarmCron } from '../lib/preventive-alarm.js';
import { getObjectStream, getStorageConfig, getStorageStatus, isValidStorageUrl, putStorageConfig, saveFileWithKey, saveUploadedFile, testStorageConnection } from '../lib/storage.js';
import { checkSync, getSyncStatus, startSync, stepSync, stopSync } from '../lib/storage-sync.js';
import { getWoUnifiedList } from '../lib/void-center.js';
import type { AuthRequest } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
export const miscRouter = Router();

const BRANDING_MAX_BYTES = 460800;
const BRANDING_ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'];
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BRANDING_MAX_BYTES } });
const FIREBASE_CREDENTIAL_MAX_BYTES = 65536;
const firebaseCredentialUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FIREBASE_CREDENTIAL_MAX_BYTES } });
const MIME_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
};
const mimeFor = (ext: string): string => MIME_TYPES[ext] ?? 'application/octet-stream';

function requireUserManagement(req: AuthRequest): void {
  if (Number(req.user!.user_management ?? 0) !== 1) throw new HttpError(403, 'User management permission is required');
}

async function brandingPayload() {
  const logo = await getSetting('branding_logo_data', '');
  return {
    app_name: await getSetting('branding_app_name', 'MCS'),
    app_subtitle: await getSetting('branding_app_subtitle', 'Maintenance Control System'),
    logo_url: logo !== '' ? logo : null,
    favicon_url: logo !== '' ? logo : null,
    updated_at: await getSetting('branding_updated_at', ''),
  };
}

interface CompanyLogoEntry { id_company: string; company_name: string; logo_url: string; has_custom: boolean }
async function companyLogoList(): Promise<CompanyLogoEntry[]> {
  if (!(await tableExists('tb_company'))) return [];
  const companies = await rows<{ id_company: string; company_name: string }>('SELECT id_company, company_name FROM tb_company ORDER BY company_name ASC');
  const out: CompanyLogoEntry[] = [];
  for (const c of companies) {
    const id = String(c.id_company ?? '').trim().toUpperCase();
    if (!id) continue;
    const custom = await getSetting(`company_logo_${id}`, '');
    out.push({ id_company: id, company_name: String(c.company_name ?? id), logo_url: custom, has_custom: custom !== '' });
  }
  return out;
}
miscRouter.post('/profile/password', authenticate, asyncHandler(async(req,res)=>{const {current_password,confirm_password}=req.body;const password=req.body.password??req.body.new_password;if(!password||password!==confirm_password)throw new HttpError(400,'Valid password and confirm_password are required');const user=(req as AuthRequest).user!;if(current_password && md5(current_password)!==String(user.password))throw new HttpError(401,'Invalid current password');await execute('UPDATE tb_user SET password=?,updated_at=NOW() WHERE id_user=?',[md5(password),user.id_user]);ok(res,null,'Password changed successfully');}));
miscRouter.post('/profile/avatar',authenticate,upload.any(),asyncHandler(async(req,res)=>{const file=(req.files as Express.Multer.File[] | undefined)?.[0];if(!file)throw new HttpError(400,'file is required');const user=(req as AuthRequest).user!;const key=await saveUploadedFile(file.buffer,'avatars',file.originalname,file.mimetype);const avatar=`${config.uploadDir}/${key}`;await execute('UPDATE tb_user SET avatar=?,updated_at=NOW() WHERE id_user=?',[avatar,user.id_user]);ok(res,{avatar,avatar_url:resolveAvatarUrl(avatar)},'Avatar updated');}));
miscRouter.delete('/profile/avatar',authenticate,asyncHandler(async(req,res)=>{await execute('UPDATE tb_user SET avatar="avatar.png",updated_at=NOW() WHERE id_user=?',[(req as AuthRequest).user!.id_user]);ok(res,{avatar:'avatar.png',avatar_url:null},'Avatar deleted');}));
miscRouter.get('/settings/branding', asyncHandler(async (_req, res) => { await ensureAppSettingTable(); ok(res, await brandingPayload()); }));

miscRouter.post('/settings/branding', authenticate, memoryUpload.single('logo'), asyncHandler(async (req, res) => {
  await ensureAppSettingTable();
  requireUserManagement(req as AuthRequest);

  const appName = String(req.body.app_name ?? '').trim();
  const appSubtitle = String(req.body.app_subtitle ?? '').trim();
  if (appName !== '') await putSetting('branding_app_name', appName);
  if (appSubtitle !== '') await putSetting('branding_app_subtitle', appSubtitle);

  if (String(req.body.remove ?? '') === '1') {
    await putSetting('branding_logo_data', '');
  } else if (req.file) {
    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    if (!BRANDING_ALLOWED_EXT.includes(ext)) throw new HttpError(422, 'Format tidak didukung. Gunakan PNG, JPG, WEBP, SVG, GIF, atau ICO.');
    if (req.file.size > BRANDING_MAX_BYTES) throw new HttpError(422, 'Ukuran maksimal 450 KB.');
    await putSetting('branding_logo_data', `data:${mimeFor(ext)};base64,${req.file.buffer.toString('base64')}`);
  }

  await putSetting('branding_updated_at', new Date().toISOString());
  ok(res, await brandingPayload());
}));

miscRouter.get('/settings/company-logos', authenticate, asyncHandler(async (req, res) => {
  await ensureAppSettingTable();
  requireUserManagement(req as AuthRequest);
  ok(res, { companies: await companyLogoList(), updated_at: await getSetting('company_logo_updated_at', '') });
}));

miscRouter.post('/settings/company-logos', authenticate, memoryUpload.single('logo'), asyncHandler(async (req, res) => {
  await ensureAppSettingTable();
  requireUserManagement(req as AuthRequest);

  const idCompany = String(req.body.id_company ?? '').trim().toUpperCase();
  if (!idCompany || !/^[A-Z0-9_-]{1,32}$/.test(idCompany)) throw new HttpError(422, 'id_company wajib diisi (maks 32 karakter alfanumerik).');
  const known = await companyLogoList();
  if (known.length && !known.some((c) => c.id_company === idCompany)) throw new HttpError(422, `Company tidak dikenal: ${idCompany}`);

  const key = `company_logo_${idCompany}`;
  if (String(req.body.remove ?? '') === '1') {
    await putSetting(key, '');
    await putSetting('company_logo_updated_at', new Date().toISOString());
    return ok(res, { companies: await companyLogoList() }, 'Logo dihapus');
  }

  if (!req.file) throw new HttpError(422, 'File logo wajib diunggah.');
  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) throw new HttpError(422, 'Format tidak didukung. Gunakan PNG, JPG, WEBP, atau SVG.');
  if (req.file.size > BRANDING_MAX_BYTES) throw new HttpError(422, 'Ukuran maksimal 1 MB.');
  await putSetting(key, `data:${mimeFor(ext)};base64,${req.file.buffer.toString('base64')}`);
  await putSetting('company_logo_updated_at', new Date().toISOString());
  ok(res, { companies: await companyLogoList() }, 'Logo company disimpan');
}));

async function firebaseCredentialPayload() {
  const encrypted = await getSetting(FIREBASE_CREDENTIAL_SETTING_KEY, '');
  return {
    configured: encrypted !== '',
    project_id: await getSetting('firebase_service_account_project_id', ''),
    client_email: await getSetting('firebase_service_account_client_email', ''),
    updated_at: await getSetting('firebase_service_account_updated_at', ''),
  };
}

miscRouter.get('/settings/firebase-credentials', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  ok(res, await firebaseCredentialPayload());
}));

miscRouter.post('/settings/firebase-credentials', authenticate, firebaseCredentialUpload.single('file'), asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  if (!req.file) throw new HttpError(422, 'File JSON service account wajib diunggah.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(req.file.buffer.toString('utf8'));
  } catch {
    throw new HttpError(422, 'File bukan JSON yang valid.');
  }

  const projectId = String(parsed.project_id ?? '').trim();
  const clientEmail = String(parsed.client_email ?? '').trim();
  const privateKey = String(parsed.private_key ?? '').trim();
  if (parsed.type !== 'service_account' || !projectId || !clientEmail || !privateKey) {
    throw new HttpError(422, 'File tidak dikenali sebagai Firebase service account JSON yang valid.');
  }

  await putSetting(FIREBASE_CREDENTIAL_SETTING_KEY, encryptSecret(req.file.buffer.toString('utf8')));
  await putSetting('firebase_service_account_project_id', projectId);
  await putSetting('firebase_service_account_client_email', clientEmail);
  await putSetting('firebase_service_account_updated_at', new Date().toISOString());
  ok(res, await firebaseCredentialPayload(), 'Kredensial Firebase disimpan');
}));

miscRouter.delete('/settings/firebase-credentials', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  await deleteSetting(FIREBASE_CREDENTIAL_SETTING_KEY);
  await deleteSetting('firebase_service_account_project_id');
  await deleteSetting('firebase_service_account_client_email');
  await deleteSetting('firebase_service_account_updated_at');
  ok(res, await firebaseCredentialPayload(), 'Kredensial Firebase dihapus');
}));

miscRouter.get('/settings/storage', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  ok(res, await getStorageStatus());
}));

miscRouter.post('/settings/storage', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  const b = req.body;

  const endpoint = String(b.endpoint ?? '').trim().replace(/\/+$/, '');
  const region = String(b.region ?? '').trim() || 'us-east-1';
  const bucket = String(b.bucket ?? '').trim();
  const accessKey = String(b.access_key ?? '').trim();
  const secretKey = String(b.secret_key ?? '');
  const pathStyle = b.path_style === undefined ? true : Boolean(b.path_style) && b.path_style !== '0' && b.path_style !== 'false';
  const enabled = Boolean(b.enabled) && b.enabled !== '0' && b.enabled !== 'false';
  const serve = Boolean(b.serve) && b.serve !== '0' && b.serve !== 'false';
  const gateway = Boolean(b.gateway) && b.gateway !== '0' && b.gateway !== 'false';
  const isPublic = Boolean(b.public) && b.public !== '0' && b.public !== 'false';
  const verify = b.verify === undefined ? true : Boolean(b.verify) && b.verify !== '0' && b.verify !== 'false';
  const publicEndpoint = String(b.public_endpoint ?? '').trim().replace(/\/+$/, '');

  if (publicEndpoint !== '' && !isValidStorageUrl(publicEndpoint)) {
    throw new HttpError(422, 'Endpoint publik tidak valid. Contoh: https://files.domain.com', 'STORAGE_PUB_ENDPOINT');
  }
  if (endpoint === '' || bucket === '' || accessKey === '') {
    throw new HttpError(422, 'Endpoint, bucket, dan access key wajib diisi.', 'STORAGE_INPUT');
  }
  if (!isValidStorageUrl(endpoint)) {
    throw new HttpError(422, 'Endpoint tidak valid. Contoh: http://192.168.8.4:9000', 'STORAGE_ENDPOINT');
  }
  const current = await getStorageConfig();
  if (secretKey === '' && current.secretKey === '') {
    throw new HttpError(422, 'Secret key wajib diisi.', 'STORAGE_SECRET');
  }

  await putStorageConfig({ endpoint, region, bucket, accessKey, secretKey, pathStyle, enabled, serve, gateway, public: isPublic, verify, publicEndpoint });
  ok(res, await getStorageStatus(), 'Konfigurasi storage disimpan');
}));

miscRouter.post('/settings/storage/test', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  const b = req.body;
  const stored = await getStorageConfig();

  const endpoint = String(b.endpoint ?? stored.endpoint).trim().replace(/\/+$/, '');
  const region = String(b.region ?? stored.region).trim() || 'us-east-1';
  const bucket = String(b.bucket ?? stored.bucket).trim();
  const accessKey = String(b.access_key ?? stored.accessKey).trim();
  const secretKey = String(b.secret_key ?? '') !== '' ? String(b.secret_key) : stored.secretKey;
  const pathStyle = b.path_style !== undefined ? Boolean(b.path_style) && b.path_style !== '0' && b.path_style !== 'false' : stored.pathStyle;

  if (endpoint === '' || bucket === '' || accessKey === '' || secretKey === '') {
    throw new HttpError(422, 'Lengkapi endpoint, bucket, access key, dan secret key terlebih dahulu.', 'STORAGE_TEST_INPUT');
  }
  ok(res, await testStorageConnection({ endpoint, region, bucket, accessKey, secretKey, pathStyle }));
}));

miscRouter.get('/settings/storage/sync', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  ok(res, await getSyncStatus());
}));

miscRouter.post('/settings/storage/sync', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement(req as AuthRequest);
  const action = String(req.body.action ?? 'status').toLowerCase().trim();
  const root = String(req.body.root ?? 'assets/docs');
  const force = req.body.force === true || req.body.force === '1' || req.body.force === 'true';

  if (action === 'status') return ok(res, await getSyncStatus());
  if (action === 'start') return ok(res, await startSync(root, force));
  if (action === 'step') return ok(res, await stepSync());
  if (action === 'stop') return ok(res, await stopSync());
  if (action === 'check') return ok(res, await checkSync(root));
  throw new HttpError(422, 'action tidak dikenal (status|start|step|stop|check).', 'SYNC_ACTION');
}));

miscRouter.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  legacyOk(res, await getNotificationSummary(user), 'Success');
}));

miscRouter.post('/preventive-alarm/run', authenticate, requirePermission('preventive_alarm_sound'), asyncHandler(async (req, res) => {
  const date = String(req.body.date ?? '').trim() || undefined;
  const result = await runPreventiveAlarmCron(date);
  ok(res, result, result.ran ? 'Preventive alarm cron executed' : (result.reason ?? 'Preventive alarm cron skipped'));
}));
miscRouter.get('/notifications/detail', authenticate, asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '').trim();
  if (!woNumber) throw new HttpError(400, 'Missing required parameter: wo_number');
  const detail = await getNotificationDetail(woNumber);
  if (!detail) throw new HttpError(404, 'WO not found');
  legacyOk(res, detail, 'Success');
}));
function canReadAssets(user: AuthRequest['user']): boolean {
  return Number(user?.list_of_asset ?? 0) === 1 || Number(user?.privilage_asset ?? 0) === 1;
}

miscRouter.get('/reports/:report', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const report = String(req.params.report).toLowerCase().trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(500, Math.max(10, Number(req.query.per_page ?? 50)));
  const q = (key: string): string => String(req.query[key] ?? '');

  if (report === 'recap-work-orders-options') {
    ok(res, await recapWorkOrderOptions());
    return;
  }
  if (report === 'assets' || report === 'list-of-assets') {
    if (!canReadAssets(user)) throw new HttpError(403, 'Asset access is not permitted', 'REPORT_ACCESS_DENIED');
    const { data, meta } = await getAssetReportList({ q: q('q'), company: q('company'), location: q('location'), category: q('category'), active: q('active'), page, per_page: perPage });
    ok(res, data, undefined, meta);
    return;
  }
  if (report === 'recap-work-orders') {
    const { data, meta } = await getWoUnifiedList({
      module: q('module'), date_from: q('date_from'), date_to: q('date_to'), status: q('status'), type_wo: q('type_wo'),
      company: q('company'), priority: q('priority'), shift: q('shift'), id_division: q('id_division'),
      job_executor: q('job_executor'), asset_id: q('asset_id'), q: q('q'), legacy_recap: true, page, per_page: perPage,
    }, user);
    ok(res, data, undefined, meta);
    return;
  }
  if (report === 'assets-history') {
    if (!canReadAssets(user)) throw new HttpError(403, 'Asset access is not permitted', 'REPORT_ACCESS_DENIED');
    const { data, meta } = await getAssetsHistoryReport({ asset_code: q('asset_code'), date_from: q('date_from'), date_to: q('date_to'), page, per_page: perPage });
    ok(res, data, undefined, meta);
    return;
  }
  if (report === 'qr') {
    const result = await getQrReport(q('asset') || q('asset_code'));
    if (!result) throw new HttpError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    ok(res, result);
    return;
  }
  throw new HttpError(404, 'Unknown report resource', 'REPORT_NOT_FOUND');
}));
const MOBILE_RELEASE_DEFAULT = {
  version: '1.0.0', version_code: 1, download_url: '/uploads/downloads/mcs-mobile-v1.apk', file_name: 'mcs-mobile-v1.apk',
  release_notes: '- Bug fixes', force_update: true, uploaded_by: '-', uploaded_at: '-',
};
async function mobileReleaseConfig(): Promise<Record<string, unknown>> {
  const raw = await getSetting('mcs_mobile_release', '');
  if (raw === '') return MOBILE_RELEASE_DEFAULT;
  try {
    const decoded = JSON.parse(raw) as Record<string, unknown>;
    return { ...MOBILE_RELEASE_DEFAULT, ...decoded };
  } catch {
    return MOBILE_RELEASE_DEFAULT;
  }
}
export function canUploadMobileRelease(user: AuthRequest['user']): boolean {
  if (String(user?.username ?? '').toUpperCase() === 'SUPERUSER') return true;
  return Number(user?.mcs_mobile_upload ?? 0) === 1;
}
const mobileReleaseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['apk', 'aab'].includes(path.extname(file.originalname).slice(1).toLowerCase())),
});

miscRouter.get('/mcs-mobile/release', asyncHandler(async (_req, res) => ok(res, await mobileReleaseConfig())));

miscRouter.post('/mcs-mobile/release', authenticate, mobileReleaseUpload.single('apk_file'), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canUploadMobileRelease(user)) throw new HttpError(403, 'MCS Mobile upload permission is required', 'MCS_MOBILE_UPLOAD_DENIED');

  const version = String(req.body.version ?? '').trim();
  const versionCode = Number(req.body.version_code ?? 0);
  const releaseNotes = String(req.body.release_notes ?? '').trim();
  const forceUpdate = Boolean(req.body.force_update) && req.body.force_update !== '0' && req.body.force_update !== 'false';

  if (version === '' || !(versionCode > 0)) throw new HttpError(422, 'Version and version code are required', 'MCS_MOBILE_VERSION_REQUIRED');
  if (!req.file) throw new HttpError(422, 'APK or AAB release file is required', 'MCS_MOBILE_FILE_REQUIRED');

  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  if (!['apk', 'aab'].includes(ext)) throw new HttpError(422, 'Unsupported file format. Use .apk or .aab', 'MCS_MOBILE_FILE_FORMAT');

  const safeVersion = version.replace(/[^0-9A-Za-z.\-_]/g, '') || 'release';
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `mcs-mobile-v${safeVersion}-${timestamp}.${ext}`;
  const key = await saveFileWithKey(req.file.buffer, 'downloads', filename, req.file.mimetype);

  const release = {
    version, version_code: versionCode, download_url: `/uploads/${key}`, file_name: filename,
    release_notes: releaseNotes !== '' ? releaseNotes : '-', force_update: forceUpdate,
    // toISOString() itu UTC — server jalan di jam UTC tapi jam yang ditampilkan
    // ke user harus WIB, sama akar masalahnya kayak bug activity_time lain
    // yang sudah diperbaiki (selisih 7 jam kalau dibiarkan pakai UTC).
    uploaded_by: String(user.fullname ?? user.username ?? '-'), uploaded_at: `${nowInJakarta().date} ${nowInJakarta().time}`,
  };
  await putSetting('mcs_mobile_release', JSON.stringify(release));
  ok(res, await mobileReleaseConfig(), 'MCS Mobile release uploaded');
}));

miscRouter.get('/mcs-mobile/devices', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canUploadMobileRelease(user)) throw new HttpError(403, 'MCS Mobile upload permission is required', 'MCS_MOBILE_UPLOAD_DENIED');

  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? req.query.limit ?? 25)));
  const q = String(req.query.q ?? '').trim();
  const platform = String(req.query.platform ?? '').trim();
  const status = String(req.query.status ?? '').trim();

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (q) { where += ' AND (u.fullname LIKE ? OR u.username LIKE ? OR t.device_name LIKE ? OR t.ip_address LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (platform) { where += ' AND t.platform = ?'; params.push(platform); }
  if (status === 'active') where += ' AND t.is_active = 1';
  else if (status === 'inactive') where += ' AND t.is_active = 0';

  const baseFrom = 'FROM tb_user_device_token t INNER JOIN tb_user u ON u.id_user = t.id_user';
  const total = await one<{ total: number }>(`SELECT COUNT(*) total ${baseFrom} ${where}`, params);
  const data = await rows(
    `SELECT t.id, t.id_user, u.fullname, u.username, t.platform, t.device_name, t.app_version, t.build_number,
            REPLACE(t.ip_address, '::ffff:', '') AS ip_address, t.is_active, t.last_seen_at, t.created_at, t.updated_at
     ${baseFrom} ${where} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  const summary = await one<{ total_devices: number; active_devices: number; android: number; ios: number }>(
    `SELECT COUNT(*) total_devices, SUM(t.is_active = 1) active_devices,
            SUM(t.is_active = 1 AND t.platform = 'android') android, SUM(t.is_active = 1 AND t.platform = 'ios') ios
     FROM tb_user_device_token t`,
  );
  const totalCount = Number(total?.total ?? 0);
  ok(res, data, 'OK', {
    page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
    summary: {
      total_devices: Number(summary?.total_devices ?? 0),
      active_devices: Number(summary?.active_devices ?? 0),
      android: Number(summary?.android ?? 0),
      ios: Number(summary?.ios ?? 0),
    },
  });
}));

miscRouter.get('/media',authenticate,asyncHandler(async(req,res)=>{const relative=String(req.query.path??'');if(!relative||relative.includes('..'))throw new HttpError(400,'Valid path is required');const file=path.resolve(relative);try{await fs.access(file);res.sendFile(file);return;}catch{}const object=await getObjectStream(relative);if(!object)throw new HttpError(404,'Media not found');res.setHeader('Content-Type',object.contentType);res.setHeader('Cache-Control','public, max-age=604800');object.stream.pipe(res);}));
