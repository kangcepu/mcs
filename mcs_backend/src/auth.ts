import crypto from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { NextFunction, Response } from 'express';
import { config } from './config.js';
import { execute, one, rows } from './db.js';
import { HttpError } from './http.js';
import { clearEmployeeCache, findEmployeeForUserResult, resolveCompanyCode } from './lib/employee-api.js';
import { verifyApiKey } from './lib/api-clients.js';
import type { AuthRequest, User } from './types.js';

export const permissionFields = [
  'approved_write_off', 'approval_asset_mutation', 'approval_all', 'asset_mutation', 'approve_asset', 'report_cr',
  'list_of_asset', 'material_usage', 'master_data', 'privilage_asset', 'recap_wo', 'report_asset', 'report_asset_history',
  'report_asset_mutation', 'scanning_create_wo', 'scanning_edit', 'schedule', 'work_calendar', 'daily_control',
  'daily_control_all', 'mcs_mobile_upload', 'template_crystal_report', 'user_management', 'user_alias_edit',
  'material_part_selection', 'void', 'wo_ga', 'wo_it', 'wo_mtc', 'wo_mtc_all', 'wo_operational', 'wo_executor', 'wo_void',
  'wo_cross_access', 'wo_preventive', 'preventive_alarm', 'preventive_alarm_sound', 'write_off', 'wo_category_general',
  'wo_category_electrical', 'wo_category_mould', 'mtc_area_gsu_wnb', 'mtc_area_gsu_inject', 'mtc_area_ru_sawmill',
  'mtc_area_ru_production', 'report_so',
] as const;

export const md5 = (value: string): string => crypto.createHash('md5').update(value).digest('hex');

export async function findUserById(id: number): Promise<User | null> {
  return one<User>(`SELECT u.*, d.division_code, d.division_name, c.company_name
    FROM tb_user u
    LEFT JOIN tb_division d ON d.id_division = u.id_division
    LEFT JOIN tb_company c ON c.id_company = u.id_company
    WHERE u.id_user = ? LIMIT 1`, [id]);
}

export async function findUserByCredentials(username: string, password: string): Promise<User | null> {
  return one<User>(`SELECT u.*, d.division_code, d.division_name, c.company_name
    FROM tb_user u
    LEFT JOIN tb_division d ON d.id_division = u.id_division
    LEFT JOIN tb_company c ON c.id_company = u.id_company
    WHERE (u.username = ? OR u.email = ?) AND u.password = ? LIMIT 1`, [username, username, md5(password)]);
}

export async function findUserByIdentity(username: string): Promise<User | null> {
  return one<User>(`SELECT u.*, d.division_code, d.division_name, c.company_name
    FROM tb_user u
    LEFT JOIN tb_division d ON d.id_division = u.id_division
    LEFT JOIN tb_company c ON c.id_company = u.id_company
    WHERE (u.username = ? OR u.email = ?) LIMIT 1`, [username, username]);
}

const DEFAULT_PASSWORD_HASH = md5('12345');

export function isPasswordEmpty(user: User): boolean {
  return String(user.password ?? '').trim() === '';
}

export function isUsingDefaultPassword(user: User): boolean {
  const password = String(user.password ?? '');
  return password !== '' && password === DEFAULT_PASSWORD_HASH;
}

export function requiresPasswordChange(user: User): boolean {
  const forced = Number(user.force_password_change ?? 0) === 1;
  return forced || isUsingDefaultPassword(user) || isPasswordEmpty(user);
}

export async function syncEmployeeStatusFromApi(user: User): Promise<User> {
  const username = String(user.username ?? '').trim();
  const email = String(user.email ?? '').trim();
  const companyCode = resolveCompanyCode(String(user.company_name ?? ''));
  if (username === '' || companyCode === '') return user;

  const result = await findEmployeeForUserResult(companyCode, username, email);
  const emp = result.employee;

  if (result.status === 'found' && emp && String(emp.EmployeeCode ?? '') !== '') {
    const newFullname = String(emp.FullName ?? '');
    if (newFullname !== '' && newFullname !== String(user.fullname ?? '')) {
      await execute('UPDATE tb_user SET fullname = ? WHERE id_user = ?', [newFullname, user.id_user]);
      user.fullname = newFullname;
    }
    return user;
  }

  if (result.status !== 'not_found') return user;

  if (Number(user.active ?? 0) !== 0) {
    await execute('UPDATE tb_user SET active = 0 WHERE id_user = ?', [user.id_user]);
  }
  user.active = 0;
  return user;
}

export async function syncAllUsersEmployeeStatus(): Promise<{ checked: number; disabled: number }> {
  clearEmployeeCache();
  const users = await rows<User>(`SELECT u.*, d.division_code, d.division_name, c.company_name
    FROM tb_user u
    LEFT JOIN tb_division d ON d.id_division = u.id_division
    LEFT JOIN tb_company c ON c.id_company = u.id_company
    WHERE u.active = 1`);

  let disabled = 0;
  for (const user of users) {
    const username = String(user.username ?? '').trim();
    const email = String(user.email ?? '').trim();
    const companyCode = resolveCompanyCode(String(user.company_name ?? ''));
    if (username === '' || companyCode === '') continue;

    const result = await findEmployeeForUserResult(companyCode, username, email);
    if (result.status === 'found' && result.employee) {
      const newFullname = String(result.employee.FullName ?? '');
      if (newFullname !== '' && newFullname !== String(user.fullname ?? '')) {
        await execute('UPDATE tb_user SET fullname = ? WHERE id_user = ?', [newFullname, user.id_user]);
      }
      continue;
    }
    if (result.status !== 'not_found') continue;

    await execute('UPDATE tb_user SET active = 0 WHERE id_user = ?', [user.id_user]);
    disabled++;
  }
  return { checked: users.length, disabled };
}

export function applyAutomaticAccess(user: User): User {
  const position = String(user.id_position ?? '').toUpperCase();
  const division = `${user.division_code ?? ''} ${user.division_name ?? ''}`.toUpperCase();
  if ((position === 'DIVHEAD' && /(OTO|OTOMOTIF|AUTOMOTIVE)/.test(division)) || position.includes('MANAGEMENT')) {
    Object.assign(user, { wo_it: 1, wo_mtc: 1, wo_mtc_all: 1, wo_operational: 1, wo_preventive: 1, wo_cross_access: 1 });
  }
  return user;
}

/**
 * `tb_user.avatar` punya 2 format kayak `tb_attachment_asset.filename`: foto
 * lama hasil migrasi cuma nama file polos (butuh prefix folder lama
 * `assets/img/profile`), upload baru lewat `/profile/avatar` nyimpen
 * relative key sendiri (sudah ada `/`, dipakai apa adanya).
 */
export function resolveAvatarUrl(avatar: string | null | undefined): string | null {
  const trimmed = String(avatar ?? '').trim();
  if (!trimmed || trimmed === 'avatar.png') return null;
  if (trimmed.includes('/')) return `/uploads/${trimmed}`;
  return `/uploads/assets/img/profile/${trimmed}`;
}

export function publicUser(user: User): Record<string, unknown> {
  const permissions = Object.fromEntries(permissionFields.map((field) => [field, Number(user[field] ?? 0)]));
  return {
    id_user: user.id_user, username: user.username, fullname: user.fullname, email: user.email ?? '', avatar: user.avatar ?? 'avatar.png',
    avatar_url: resolveAvatarUrl(user.avatar),
    id_position: user.id_position ?? '',
    division: { id_division: user.id_division, division_name: user.division_name ?? '', division_code: user.division_code ?? '' },
    company: { id_company: user.id_company ?? null, company_name: user.company_name ?? null }, permissions,
  };
}

/**
 * `tb_user` tidak nyimpen nomor HP sama sekali, dan `company_name` lokal
 * cuma kode singkat ('UC'/'GSU'/'RU'). Halaman profil butuh data lebih
 * lengkap dari Employee API (dicocokkan by NIK/`username`) — sama kayak
 * `syncEmployeeStatusFromApi`, bukan panggilan baru yang mahal (cache
 * per-company di `employee-api.ts` sudah anget dari situ).
 */
export async function publicUserWithEmployee(user: User): Promise<Record<string, unknown>> {
  const base = publicUser(user);
  const companyCode = resolveCompanyCode(String(user.company_name ?? ''));
  const username = String(user.username ?? '').trim();
  const email = String(user.email ?? '').trim();
  if (companyCode === '' || username === '') return { ...base, phone: '' };

  const result = await findEmployeeForUserResult(companyCode, username, email);
  const emp = result.employee;
  if (!emp) return { ...base, phone: '' };

  const phone = String(emp.MobilePhone ?? emp.MOBILEPHONE ?? emp.Mobilephone ?? emp.Mobile_Phone ?? emp.Phone ?? emp.NoHP ?? '');
  const employeeCompany = String(emp.Company ?? '').trim();
  const company = base.company as { id_company: unknown; company_name: string | null };
  return {
    ...base,
    phone,
    company: { ...company, company_name: employeeCompany || company.company_name },
  };
}

export function signToken(user: User): string {
  return jwt.sign({ id_user: user.id_user, username: user.username, fullname: user.fullname, id_divisi: user.id_division,
    division_code: user.division_code ?? '', id_position: user.id_position, wo_cross_access: Number(user.wo_cross_access ?? 0), type: 'access_token' },
  config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    const raw = header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
    if (!raw) throw new HttpError(401, 'Token not provided');
    const payload = jwt.verify(raw, config.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
    const id = Number(payload.id_user);
    if (!Number.isSafeInteger(id)) throw new HttpError(401, 'Invalid token');
    const user = await findUserById(id);
    if (!user || Number(user.active) !== 1) throw new HttpError(401, 'User not found or inactive');
    req.user = applyAutomaticAccess(user);
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Invalid or expired token'));
  }
}

export const authenticateApiKey = (scope: string) => async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = req.header('x-api-key');
    if (!key) throw new HttpError(401, 'API key not provided');
    const client = await verifyApiKey(key, scope);
    if (!client) throw new HttpError(401, 'Invalid or inactive API key');
    req.apiClient = { id: client.id, name: client.name };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Invalid API key'));
  }
};

export const requirePermission = (...permissions: string[]) => (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const user = req.user;
  if (!user) return next(new HttpError(401, 'Unauthorized'));
  if (String(user.username).toUpperCase() === 'SUPERUSER' || permissions.some((p) => Number(user[p] ?? 0) === 1)) return next();
  return next(new HttpError(403, 'You do not have permission to access this resource'));
};
