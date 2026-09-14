import { Router } from 'express';
import { authenticate, md5, permissionFields } from '../auth.js';
import { execute, one, rows, tableColumns, tableExists } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { searchEmployees } from '../lib/employee-api.js';
import type { AuthRequest, User } from '../types.js';

export const masterRouter = Router();

type SimpleResource = 'company-structure' | 'divisions' | 'asset-categories' | 'asset-locations';
type GenericResource = SimpleResource | 'permission-groups' | 'users';
type Resource = GenericResource | 'user-aliases';

const TABLES: Record<GenericResource, { table: string; key: string }> = {
  'company-structure': { table: 'tb_company', key: 'id_company' },
  divisions: { table: 'tb_division', key: 'id_division' },
  'asset-categories': { table: 'tb_category_asset', key: 'id_category_asset' },
  'asset-locations': { table: 'tb_location_asset', key: 'id_location_asset' },
  'permission-groups': { table: 'tb_permission_group', key: 'id_permission_group' },
  users: { table: 'tb_user', key: 'id_user' },
};

const GENERIC_FIELDS: Record<SimpleResource, string[]> = {
  'company-structure': ['id_company', 'company_name'],
  divisions: ['id_company', 'division_code', 'division_name'],
  'asset-categories': ['category_name', 'category_code'],
  'asset-locations': ['location_name', 'location_code'],
};

const SEARCHABLE_FIELDS = new Set([
  'company_name', 'id_company', 'category_name', 'category_code', 'location_name', 'location_code',
  'division_name', 'division_code', 'group_name', 'description', 'fullname', 'username', 'email', 'alias',
]);

function isGenericResource(value: string): value is GenericResource {
  return Object.prototype.hasOwnProperty.call(TABLES, value);
}
function isResource(value: string): value is Resource {
  return value === 'user-aliases' || isGenericResource(value);
}

const truthy = (user: User, field: string): boolean => Number(user[field] ?? 0) === 1;

function canReadMaster(user: User, resource: Resource): boolean {
  if (resource === 'asset-categories' || resource === 'asset-locations') return truthy(user, 'privilage_asset') || truthy(user, 'list_of_asset');
  if (resource === 'user-aliases') return truthy(user, 'user_alias_edit') || truthy(user, 'user_management');
  return truthy(user, 'user_management');
}
function canManageMaster(user: User, resource: Resource): boolean {
  if (resource === 'asset-categories' || resource === 'asset-locations') return truthy(user, 'privilage_asset');
  if (resource === 'user-aliases') return truthy(user, 'user_alias_edit') || truthy(user, 'user_management');
  return truthy(user, 'user_management');
}
function requireUserManagement(user: User): void {
  if (!truthy(user, 'user_management')) throw new HttpError(403, 'User management permission is required');
}

async function safeFields(table: string): Promise<string[]> {
  const cols = await tableColumns(table);
  const excluded = new Set(['password', 'reset_token', 'remember_token']);
  return [...cols].filter((f) => !excluded.has(f.toLowerCase()));
}

function safeParsePermissions(value: unknown): string[] {
  try {
    const decoded = JSON.parse(String(value ?? '[]'));
    return Array.isArray(decoded) ? sanitizePermissions(decoded) : [];
  } catch {
    return [];
  }
}

function sanitizePermissions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return permissionFields.filter((f) => list.includes(f));
}

async function enrichUser(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...row, division_name: null, company_name: null, permission_group_name: null };
  if (row.id_division) {
    const d = await one<{ division_name: string }>('SELECT division_name FROM tb_division WHERE id_division = ?', [row.id_division]);
    if (d) out.division_name = d.division_name;
  }
  if (row.id_company) {
    const c = await one<{ company_name: string }>('SELECT company_name FROM tb_company WHERE id_company = ?', [row.id_company]);
    if (c) out.company_name = c.company_name;
  }
  if (row.permission_group_id) {
    const g = await one<{ group_name: string }>('SELECT group_name FROM tb_permission_group WHERE id_permission_group = ?', [row.permission_group_id]);
    if (g) out.permission_group_name = g.group_name;
  }
  return out;
}

async function enrichDivision(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!row.id_company) return row;
  const c = await one<{ company_name: string }>('SELECT company_name FROM tb_company WHERE id_company = ?', [row.id_company]);
  return c ? { ...row, company_name: c.company_name } : row;
}

async function fetchRecord(resource: Resource, id: unknown): Promise<Record<string, unknown> | null> {
  if (id === null || id === undefined || id === '') return null;
  if (resource === 'user-aliases') {
    return one<Record<string, unknown>>(
      `SELECT u.id_user,u.fullname,u.username,u.alias,u.active,d.division_code,d.division_name
       FROM tb_user u LEFT JOIN tb_division d ON d.id_division = u.id_division WHERE u.id_user = ?`,
      [id],
    );
  }
  const { table, key } = TABLES[resource];
  const fields = await safeFields(table);
  const columnList = fields.map((f) => `\`${f}\``).join(',');
  const row = await one<Record<string, unknown>>(`SELECT ${columnList} FROM \`${table}\` WHERE \`${key}\` = ?`, [id]);
  if (!row) return null;
  if (resource === 'permission-groups') row.permissions = safeParsePermissions(row.permissions);
  if (resource === 'users') return enrichUser(row);
  if (resource === 'divisions') return enrichDivision(row);
  return row;
}

async function saveSimple(resource: SimpleResource, id: number, input: Record<string, unknown>): Promise<number | string | false> {
  const { table, key } = TABLES[resource];
  const allowed = GENERIC_FIELDS[resource];
  const cols = await tableColumns(table);
  const data: Record<string, unknown> = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, field) && cols.has(field)) {
      const value = input[field];
      data[field] = typeof value === 'string' ? value.trim() : value;
    }
  }
  if (!Object.keys(data).length) return false;

  if (id > 0) {
    const keys = Object.keys(data);
    const timestampSql = cols.has('updated_at') ? ', `updated_at` = NOW()' : '';
    await execute(`UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\`=?`).join(',')}${timestampSql} WHERE \`${key}\` = ?`, [...Object.values(data), id]);
    return id;
  }

  if (resource === 'company-structure' && !data.id_company) return false;
  const keys = Object.keys(data);
  const insertKeys = cols.has('created_at') ? [...keys, 'created_at'] : keys;
  const placeholders = [...keys.map(() => '?'), ...(cols.has('created_at') ? ['NOW()'] : [])];
  const result = await execute(`INSERT INTO \`${table}\` (${insertKeys.map((k) => `\`${k}\``).join(',')}) VALUES (${placeholders.join(',')})`, Object.values(data));
  return resource === 'company-structure' ? String(data.id_company) : result.insertId;
}

async function buildPermissionPayload(permissions: string[]): Promise<Record<string, number>> {
  const selected = new Set(permissions);
  const cols = await tableColumns('tb_user');
  const payload: Record<string, number> = {};
  for (const field of permissionFields) if (cols.has(field)) payload[field] = selected.has(field) ? 1 : 0;
  return payload;
}

async function getActivePermissionPayload(groupId: number): Promise<Record<string, number> | null> {
  const group = await one<{ permissions: string; active: number }>('SELECT permissions, active FROM tb_permission_group WHERE id_permission_group = ?', [groupId]);
  if (!group || Number(group.active) !== 1) return null;
  return buildPermissionPayload(safeParsePermissions(group.permissions));
}

async function savePermissionGroup(id: number, input: Record<string, unknown>): Promise<number | false> {
  const name = String(input.group_name ?? input.name ?? '').trim();
  if (!name) return false;
  const description = String(input.description ?? '').trim();
  const permissions = sanitizePermissions(input.permissions);
  const active = 'active' in input ? (input.active ? 1 : 0) : 1;

  if (id > 0) {
    await execute('UPDATE tb_permission_group SET group_name=?, description=?, permissions=?, active=?, updated_at=NOW() WHERE id_permission_group=?',
      [name, description, JSON.stringify(permissions), active, id]);
    const payload = await buildPermissionPayload(permissions);
    const payloadKeys = Object.keys(payload);
    if (payloadKeys.length) {
      const setClause = payloadKeys.map((k) => `\`${k}\`=?`).join(',');
      await execute(`UPDATE tb_user SET ${setClause} WHERE permission_group_id=?`, [...Object.values(payload), id]);
    }
    return id;
  }
  const result = await execute('INSERT INTO tb_permission_group (group_name, description, permissions, active, created_at) VALUES (?,?,?,1,NOW())',
    [name, description, JSON.stringify(permissions)]);
  return result.insertId;
}

const USER_DIRECT_FIELDS = ['username', 'fullname', 'email', 'id_division', 'id_position', 'id_company', 'id_section', 'location', 'alias', 'phone'];

async function saveUser(id: number, input: Record<string, unknown>): Promise<number | false> {
  const cols = await tableColumns('tb_user');
  const data: Record<string, unknown> = {};

  for (const field of USER_DIRECT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field) && cols.has(field)) {
      const value = input[field];
      data[field] = typeof value === 'string' ? value.trim() : value;
    }
  }
  if ('active' in input && cols.has('active')) data.active = input.active ? 1 : 0;

  const password = String(input.password ?? '').trim();
  if (password !== '' && cols.has('password')) data.password = md5(password);

  const groupId = Number(input.permission_group_id ?? input.permission_group ?? 0);
  if (groupId > 0) {
    const payload = await getActivePermissionPayload(groupId);
    if (payload) {
      if (cols.has('permission_group_id')) data.permission_group_id = groupId;
      Object.assign(data, payload);
    }
  } else {
    if (cols.has('permission_group_id')) data.permission_group_id = null;
    if (Array.isArray(input.permissions)) {
      const selected = new Set(sanitizePermissions(input.permissions));
      for (const field of permissionFields) if (cols.has(field)) data[field] = selected.has(field) ? 1 : 0;
    }
  }

  if (id > 0) {
    if (!Object.keys(data).length) return false;
    const keys = Object.keys(data);
    const timestampSql = cols.has('updated_at') ? ', `updated_at` = NOW()' : '';
    await execute(`UPDATE tb_user SET ${keys.map((k) => `\`${k}\`=?`).join(',')}${timestampSql} WHERE id_user = ?`, [...Object.values(data), id]);
    return id;
  }

  if (!data.username || !data.fullname) return false;
  const existing = await one('SELECT id_user FROM tb_user WHERE username = ?', [data.username]);
  if (existing) return false;
  if (!('active' in data) && cols.has('active')) data.active = 1;
  const newId = Math.floor(Date.now() / 1000);
  if (cols.has('id_user')) data.id_user = newId;
  if (!('password' in data) && cols.has('password')) data.password = '';
  if (cols.has('force_password_change') && !('force_password_change' in data)) data.force_password_change = 1;

  const keys = Object.keys(data);
  const insertKeys = cols.has('created_at') ? [...keys, 'created_at'] : keys;
  const placeholders = [...keys.map(() => '?'), ...(cols.has('created_at') ? ['NOW()'] : [])];
  await execute(`INSERT INTO tb_user (${insertKeys.map((k) => `\`${k}\``).join(',')}) VALUES (${placeholders.join(',')})`, Object.values(data));
  return newId;
}

async function deleteMaster(resource: GenericResource, id: number): Promise<boolean> {
  if (resource === 'permission-groups') {
    await execute('UPDATE tb_user SET permission_group_id=NULL WHERE permission_group_id=?', [id]);
    const result = await execute('DELETE FROM tb_permission_group WHERE id_permission_group=?', [id]);
    return result.affectedRows > 0;
  }
  if (resource === 'users') {
    const result = await execute('DELETE FROM tb_user WHERE id_user=?', [id]);
    return result.affectedRows > 0;
  }
  const { table, key } = TABLES[resource];
  const result = await execute(`DELETE FROM \`${table}\` WHERE \`${key}\` = ?`, [id]);
  return result.affectedRows > 0;
}

let activityTableReady = false;
async function ensureActivityTable(): Promise<void> {
  if (activityTableReady) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_master_activity_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    resource VARCHAR(64) NOT NULL,
    action VARCHAR(16) NOT NULL,
    record_id VARCHAR(64) NULL,
    record_label VARCHAR(255) NOT NULL DEFAULT '',
    actor_id BIGINT NULL,
    actor_username VARCHAR(100) NOT NULL DEFAULT '',
    actor_fullname VARCHAR(255) NOT NULL DEFAULT '',
    before_data MEDIUMTEXT NULL,
    after_data MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_master_activity_created (created_at),
    KEY idx_master_activity_resource (resource)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  activityTableReady = true;
}

function activityLabel(resource: string, row: Record<string, unknown> | null): string {
  const keys = ['fullname', 'username', 'group_name', 'company_name', 'category_name', 'location_name', 'division_name', 'alias', 'name'];
  for (const key of keys) if (row && row[key]) return String(row[key]);
  return resource;
}

function stripSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const { password: _password, password_hash: _passwordHash, ...rest } = data;
  return rest;
}

async function recordMasterActivity(
  resource: string, action: 'create' | 'update' | 'delete', actor: User,
  recordId: unknown, before: Record<string, unknown> | null, after: Record<string, unknown> | null,
): Promise<void> {
  try {
    await ensureActivityTable();
    const label = activityLabel(resource, after ?? before);
    await execute(
      `INSERT INTO tb_master_activity_log
       (resource, action, record_id, record_label, actor_id, actor_username, actor_fullname, before_data, after_data, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [
        resource.slice(0, 64), action, recordId === null || recordId === undefined ? null : String(recordId).slice(0, 64), label.slice(0, 255),
        actor.id_user ?? null, String(actor.username ?? '').slice(0, 100), String(actor.fullname ?? '').slice(0, 255),
        before ? JSON.stringify(stripSecrets(before)) : null, after ? JSON.stringify(stripSecrets(after)) : null,
      ],
    );
  } catch {}
}

async function optionRows(table: string, key: string, labelCols: string[]): Promise<{ value: string; label: string }[]> {
  const cols = await tableColumns(table);
  if (!cols.size) return [];
  const selectCols = [key, ...labelCols].filter((c) => cols.has(c));
  if (!selectCols.length) return [];
  const orderBy = labelCols.find((c) => cols.has(c)) ?? key;
  const data = await rows<Record<string, unknown>>(`SELECT ${selectCols.map((c) => `\`${c}\``).join(',')} FROM \`${table}\` ORDER BY \`${orderBy}\` ASC`);
  return data.map((r) => {
    let label = '';
    for (const lc of labelCols) if (r[lc]) { label = String(r[lc]); break; }
    const value = String(r[key] ?? '');
    return { value, label: label || value };
  });
}

async function positionsOptions(): Promise<{ value: string; label: string }[]> {
  if (await tableExists('tb_position')) {
    const data = await optionRows('tb_position', 'id_position', ['position_name']);
    if (data.length) return data;
  }
  const data = await rows<{ id_position: string }>("SELECT DISTINCT id_position FROM tb_user WHERE id_position IS NOT NULL AND id_position != '' ORDER BY id_position ASC");
  return data.map((r) => ({ value: r.id_position, label: r.id_position }));
}

async function permissionGroupOptions(): Promise<{ value: string; label: string }[]> {
  if (!(await tableExists('tb_permission_group'))) return [];
  const data = await rows<{ id_permission_group: number; group_name: string }>('SELECT id_permission_group, group_name FROM tb_permission_group ORDER BY group_name ASC');
  return data.map((r) => ({ value: String(r.id_permission_group), label: r.group_name }));
}

async function formOptions() {
  return {
    companies: await optionRows('tb_company', 'id_company', ['company_name', 'company_code']),
    divisions: await optionRows('tb_division', 'id_division', ['division_name', 'division_code']),
    positions: await positionsOptions(),
    sections: await optionRows('tb_section', 'id_section', ['section_name']),
    permission_groups: await permissionGroupOptions(),
  };
}

async function permissionCatalog() {
  const cols = await tableColumns('tb_user');
  return permissionFields.map((field) => ({
    field,
    label: field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    on_user: cols.has(field),
  }));
}

masterRouter.post('/master/users/:id/reset-password', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  requireUserManagement(user);
  const id = Number(req.params.id);
  const cols = await tableColumns('tb_user');
  const data: Record<string, unknown> = { password: '' };
  if (cols.has('force_password_change')) data.force_password_change = 1;
  const keys = Object.keys(data);
  await execute(`UPDATE tb_user SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id_user = ?`, [...Object.values(data), id]);
  await recordMasterActivity('users', 'update', user, id, null, { id_user: id, note: 'password reset' });
  ok(res, { id }, 'Password reset — user must set a new password on next login');
}));

masterRouter.get('/master/options', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement((req as AuthRequest).user!);
  ok(res, await formOptions());
}));

masterRouter.get('/master/permission-catalog', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement((req as AuthRequest).user!);
  ok(res, await permissionCatalog());
}));

masterRouter.get('/master/employees', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement((req as AuthRequest).user!);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return ok(res, []);
  ok(res, await searchEmployees(q, String(req.query.company ?? '')));
}));

masterRouter.get('/master/activity-log', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement((req as AuthRequest).user!);
  await ensureActivityTable();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? req.query.limit ?? 25)));
  const q = String(req.query.q ?? '').trim();
  const resourceFilter = String(req.query.resource ?? '').trim();
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (resourceFilter) { where += ' AND resource = ?'; params.push(resourceFilter); }
  if (q) { where += ' AND (record_label LIKE ? OR actor_fullname LIKE ? OR actor_username LIKE ? OR action LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM tb_master_activity_log ${where}`, params);
  const data = await rows(`SELECT * FROM tb_master_activity_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
  const totalCount = Number(total?.total ?? 0);
  ok(res, data, 'OK', { page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)) });
}));

masterRouter.get('/system-activity-log', authenticate, asyncHandler(async (req, res) => {
  requireUserManagement((req as AuthRequest).user!);
  ok(res, await rows('SELECT * FROM tb_system_activity_log ORDER BY id DESC LIMIT ?', [Math.min(Number(req.query.limit ?? 100), 500)]));
}));

masterRouter.get('/master/:resource', authenticate, asyncHandler(async (req, res) => {
  const resourceParam = String(req.params.resource);
  if (!isResource(resourceParam)) throw new HttpError(404, 'Unknown master data resource');
  const resource = resourceParam;
  const user = (req as AuthRequest).user!;
  if (!canReadMaster(user, resource)) throw new HttpError(403, 'Master data access is not permitted');

  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? req.query.limit ?? 25)));
  const q = String(req.query.q ?? '').trim();
  const offset = (page - 1) * perPage;

  if (resource === 'user-aliases') {
    let where = '';
    const params: unknown[] = [];
    if (q) { where = 'WHERE u.fullname LIKE ? OR u.username LIKE ? OR u.alias LIKE ?'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM tb_user u ${where}`, params);
    const data = await rows(
      `SELECT u.id_user,u.fullname,u.username,u.alias,u.active,d.division_code,d.division_name
       FROM tb_user u LEFT JOIN tb_division d ON d.id_division = u.id_division ${where}
       ORDER BY u.fullname ASC LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );
    const totalCount = Number(total?.total ?? 0);
    return ok(res, data, 'OK', { page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)) });
  }

  const { table, key } = TABLES[resource];
  const fields = await safeFields(table);
  const search = fields.filter((f) => SEARCHABLE_FIELDS.has(f));
  let where = '';
  const params: unknown[] = [];
  if (q && search.length) {
    where = `WHERE ${search.map((f) => `\`${f}\` LIKE ?`).join(' OR ')}`;
    params.push(...search.map(() => `%${q}%`));
  }
  if (resource === 'users' && fields.includes('active')) {
    const activeParam = req.query.active;
    if (activeParam !== undefined && activeParam !== '') {
      where += where ? ' AND `active` = ?' : 'WHERE `active` = ?';
      params.push(Number(activeParam));
    }
  }
  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM \`${table}\` ${where}`, params);
  const columnList = fields.map((f) => `\`${f}\``).join(',');
  let data = await rows<Record<string, unknown>>(`SELECT ${columnList} FROM \`${table}\` ${where} ORDER BY \`${key}\` DESC LIMIT ? OFFSET ?`, [...params, perPage, offset]);
  if (resource === 'permission-groups') data = data.map((r) => ({ ...r, permissions: safeParsePermissions(r.permissions) }));
  if (resource === 'users') data = await Promise.all(data.map((r) => enrichUser(r)));
  if (resource === 'divisions') data = await Promise.all(data.map((r) => enrichDivision(r)));
  const totalCount = Number(total?.total ?? 0);
  ok(res, data, 'OK', { page, per_page: perPage, total: totalCount, total_pages: Math.max(1, Math.ceil(totalCount / perPage)) });
}));

masterRouter.get('/master/:resource/detail/:id', authenticate, asyncHandler(async (req, res) => {
  const resourceParam = String(req.params.resource);
  if (!isResource(resourceParam)) throw new HttpError(404, 'Unknown master data resource');
  const resource = resourceParam;
  const user = (req as AuthRequest).user!;
  if (!canReadMaster(user, resource)) throw new HttpError(403, 'Master data access is not permitted');
  const data = await fetchRecord(resource, req.params.id);
  if (!data) throw new HttpError(404, 'Master data record not found');
  ok(res, data);
}));

masterRouter.post('/master/:resource', authenticate, asyncHandler(async (req, res) => {
  const resourceParam = String(req.params.resource);
  if (!isGenericResource(resourceParam)) throw new HttpError(404, 'Unknown master data resource');
  const resource = resourceParam;
  const user = (req as AuthRequest).user!;
  if (!canManageMaster(user, resource)) throw new HttpError(403, 'Master data management is not permitted');

  let id: number | string | false;
  if (resource === 'permission-groups') id = await savePermissionGroup(0, req.body);
  else if (resource === 'users') id = await saveUser(0, req.body);
  else id = await saveSimple(resource, 0, req.body);

  if (id === false) throw new HttpError(422, 'Unable to create master data');
  const after = await fetchRecord(resource, id);
  await recordMasterActivity(resource, 'create', user, id, null, after);
  created(res, { id }, 'Master data created');
}));

masterRouter.patch('/master/:resource/detail/:id', authenticate, asyncHandler(async (req, res) => {
  const resourceParam = String(req.params.resource);
  if (!isResource(resourceParam)) throw new HttpError(404, 'Unknown master data resource');
  const resource = resourceParam;
  const user = (req as AuthRequest).user!;
  const id = Number(req.params.id);
  const before = await fetchRecord(resource, id);

  let saved: number | string | false;
  if (resource === 'user-aliases') {
    if (!canManageMaster(user, resource)) throw new HttpError(403, 'User Alias permission is required');
    const alias = String(req.body.alias ?? '').trim();
    if (alias.length > 100) throw new HttpError(422, 'Alias maksimal 100 karakter');
    await execute('UPDATE tb_user SET alias=?, updated_at=NOW() WHERE id_user=?', [alias === '' ? null : alias, id]);
    saved = id;
  } else if (!canManageMaster(user, resource)) {
    throw new HttpError(403, 'Master data management is not permitted');
  } else if (resource === 'permission-groups') {
    saved = await savePermissionGroup(id, req.body);
  } else if (resource === 'users') {
    saved = await saveUser(id, req.body);
  } else {
    saved = await saveSimple(resource, id, req.body);
  }

  if (saved === false) throw new HttpError(422, 'Unable to update master data');
  const after = await fetchRecord(resource, id);
  await recordMasterActivity(resource, 'update', user, id, before, after);
  ok(res, null, 'Master data updated');
}));

masterRouter.delete('/master/:resource/detail/:id', authenticate, asyncHandler(async (req, res) => {
  const resourceParam = String(req.params.resource);
  if (!isGenericResource(resourceParam)) throw new HttpError(404, 'Unknown master data resource');
  const resource = resourceParam;
  const user = (req as AuthRequest).user!;
  if (!canManageMaster(user, resource)) throw new HttpError(403, 'Master data management is not permitted');
  const id = Number(req.params.id);
  if (resource === 'users' && id === Number(user.id_user)) throw new HttpError(422, 'You cannot delete your own account');
  const before = await fetchRecord(resource, id);
  const deleted = await deleteMaster(resource, id);
  if (!deleted) throw new HttpError(422, 'Unable to remove master data');
  await recordMasterActivity(resource, 'delete', user, id, before, null);
  ok(res, { id }, 'Master data removed');
}));
