import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { authenticate, requirePermission, md5 } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists } from '../db.js';
import { asyncHandler, HttpError, ok, created } from '../http.js';
import type { AuthRequest } from '../types.js';

const upload = multer({ dest: config.uploadDir, limits: { fileSize: config.maxUploadBytes } });
export const miscRouter = Router();

const BRANDING_MAX_BYTES = 460800;
const BRANDING_ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'];
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BRANDING_MAX_BYTES } });
const MIME_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
};
const mimeFor = (ext: string): string => MIME_TYPES[ext] ?? 'application/octet-stream';

let appSettingTableReady = false;
async function ensureAppSettingTable(): Promise<void> {
  if (appSettingTableReady) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_app_setting (
    skey VARCHAR(64) NOT NULL, svalue LONGTEXT NULL, updated_at DATETIME NULL, PRIMARY KEY (skey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  appSettingTableReady = true;
}
async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await one<{ svalue: string | null }>('SELECT svalue FROM tb_app_setting WHERE skey = ?', [key]);
  return row && row.svalue !== null ? String(row.svalue) : fallback;
}
async function putSetting(key: string, value: string): Promise<void> {
  await execute('INSERT INTO tb_app_setting (skey,svalue,updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue),updated_at=NOW()', [key, value]);
}
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
miscRouter.post('/profile/password', authenticate, asyncHandler(async(req,res)=>{const {current_password,password,confirm_password}=req.body;if(!password||password!==confirm_password)throw new HttpError(400,'Valid password and confirm_password are required');const user=(req as AuthRequest).user!;if(current_password && md5(current_password)!==String(user.password))throw new HttpError(401,'Invalid current password');await execute('UPDATE tb_user SET password=?,updated_at=NOW() WHERE id_user=?',[md5(password),user.id_user]);ok(res,null,'Password changed successfully');}));
miscRouter.post('/profile/avatar',authenticate,upload.single('file'),asyncHandler(async(req,res)=>{if(!req.file)throw new HttpError(400,'file is required');const user=(req as AuthRequest).user!;await execute('UPDATE tb_user SET avatar=?,updated_at=NOW() WHERE id_user=?',[req.file.path.replaceAll('\\','/'),user.id_user]);ok(res,{avatar:req.file.path.replaceAll('\\','/')},'Avatar updated');}));
miscRouter.delete('/profile/avatar',authenticate,asyncHandler(async(req,res)=>{await execute('UPDATE tb_user SET avatar="avatar.png",updated_at=NOW() WHERE id_user=?',[(req as AuthRequest).user!.id_user]);ok(res,{avatar:'avatar.png'},'Avatar deleted');}));
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
miscRouter.get('/notifications',authenticate,asyncHandler(async(req,res)=>{const user=(req as AuthRequest).user!;const data=await rows('SELECT * FROM tb_queue_email WHERE recipient LIKE ? ORDER BY created_at DESC LIMIT 50',[`%${user.email}%`]);ok(res,{items:data,unread:0});}));
miscRouter.get('/notifications/detail',authenticate,asyncHandler(async(req,res)=>{const id=req.query.id;if(!id)throw new HttpError(400,'id is required');const item=await one('SELECT * FROM tb_queue_email WHERE id=?',[id]);if(!item)throw new HttpError(404,'Notification not found');ok(res,item);}));
miscRouter.get('/reports/:report',authenticate,asyncHandler(async(req,res)=>{const report=String(req.params.report);const map:Record<string,string>={assets:'SELECT * FROM asset',work_orders:'SELECT * FROM tb_wo_mtc_operational',stock_opname:'SELECT * FROM tb_stockopname_h',material_usage:'SELECT * FROM tb_material_part_request',daily_control:'SELECT * FROM tb_daily_control'};const sql=map[report];if(!sql)throw new HttpError(404,'Unknown report');ok(res,await rows(`${sql} ORDER BY 1 DESC LIMIT ?`,[Math.min(Number(req.query.limit??100),500)]));}));
miscRouter.get('/mcs-mobile/release',asyncHandler(async(_req,res)=>{const item=await one('SELECT * FROM tb_app_setting WHERE skey="mcs_mobile_release"');ok(res,item??{version:null});}));
miscRouter.post('/mcs-mobile/release',authenticate,requirePermission('master_data'),asyncHandler(async(req,res)=>{await execute('INSERT INTO tb_app_setting (skey,svalue,updated_at) VALUES ("mcs_mobile_release", ?,NOW()) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue),updated_at=NOW()',[JSON.stringify(req.body)]);ok(res,req.body,'Release saved');}));
miscRouter.get('/media',authenticate,asyncHandler(async(req,res)=>{const relative=String(req.query.path??'');if(!relative||relative.includes('..'))throw new HttpError(400,'Valid path is required');const file=path.resolve(relative);try{await fs.access(file);res.sendFile(file);}catch{throw new HttpError(404,'Media not found');}}));
