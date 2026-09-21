import { one, rows } from '../db.js';
import type { User } from '../types.js';

interface ModuleCfg {
  table: string;
  permission: string;
  allPermission: string;
  viewAllPerm: string | null;
  hqDiv: number;
  areaScope: boolean;
}

const MODULES: Record<string, ModuleCfg> = {
  meso: { table: 'tb_wo_mtc', permission: 'wo_mtc', allPermission: 'wo_mtc_all', viewAllPerm: 'wo_mtc_all', hqDiv: 0, areaScope: false },
  maintenance: { table: 'tb_wo_mtc_operational', permission: 'wo_operational', allPermission: 'wo_mtc_all', viewAllPerm: 'wo_mtc_all', hqDiv: 15, areaScope: true },
  production: { table: 'tb_wo_preventive', permission: 'wo_preventive', allPermission: 'wo_preventive', viewAllPerm: null, hqDiv: 15, areaScope: false },
  is: { table: 'tb_wo_it', permission: 'wo_it', allPermission: 'wo_it', viewAllPerm: null, hqDiv: 6, areaScope: false },
  ga: { table: 'tb_wo_ga', permission: 'wo_ga', allPermission: 'wo_ga', viewAllPerm: null, hqDiv: 7, areaScope: false },
};

const MODULE_LABELS: Record<string, string> = { meso: 'MESO', maintenance: 'MAINTENANCE', production: 'PRODUCTION', is: 'IS', ga: 'GA' };

function canReadModule(user: User, cfg: ModuleCfg): boolean {
  return Number(user[cfg.permission] ?? 0) === 1 || Number(user[cfg.allPermission] ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;
}

function canSeeAllModule(user: User, cfg: ModuleCfg): boolean {
  if (Number(user.wo_cross_access ?? 0) === 1) return true;
  if (cfg.viewAllPerm && Number(user[cfg.viewAllPerm] ?? 0) === 1) return true;
  const pos = String(user.id_position ?? '').toUpperCase().trim();
  if (pos === 'EXECUTOR_ADMIN' || pos === 'EXECUTOR_HEAD') return false;
  if (pos === 'ADMIN_DIVISI' || pos === 'DIVHEAD') return cfg.hqDiv > 0 && Number(user.id_division) === cfg.hqDiv;
  return true;
}

function legacyScopeClause(user: User, cfg: ModuleCfg, alias: string): { sql: string; params: unknown[] } | null {
  if (canSeeAllModule(user, cfg)) return null;
  const pos = String(user.id_position ?? '').toUpperCase().trim();
  if (pos === 'EXECUTOR_ADMIN' || pos === 'EXECUTOR_HEAD') {
    const code = String(user.division_code ?? '').trim();
    if (!code) return null;
    return { sql: `${alias}.job_executor LIKE ?`, params: [`%${code}%`] };
  }
  return { sql: `${alias}.id_division = ?`, params: [user.id_division] };
}

const AREA_MAP: Array<[string, string]> = [
  ['mtc_area_gsu_wnb', 'GSU_WNB'], ['mtc_area_gsu_inject', 'GSU_INJECT'],
  ['mtc_area_ru_sawmill', 'RU_SAWMILL'], ['mtc_area_ru_production', 'RU_PRODUCTION'],
];

function areaScopeClause(user: User, cfg: ModuleCfg, assetAlias: string): { sql: string; params: unknown[] } | null {
  if (!cfg.areaScope || Number(user.wo_cross_access ?? 0) === 1) return null;
  const areas = AREA_MAP.filter(([col]) => Number(user[col] ?? 0) === 1).map(([, key]) => key);
  if (!areas.length) return null;
  return { sql: `${assetAlias}.mtc_area_key IN (${areas.map(() => '?').join(',')})`, params: areas };
}

function isDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

const TYPE_WO_GROUPS: string[][] = [
  ['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'],
  ['CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'],
];

function typeWoAliases(typeWo: string): string[] {
  const value = typeWo.toUpperCase().trim();
  const group = TYPE_WO_GROUPS.find((g) => g.includes(value));
  if (group) return group;
  if (value === 'PROJECT') return ['PROJECT'];
  return [value];
}

const divisionCodeCache = new Map<number, string>();
async function divisionCode(divisionId: number): Promise<string> {
  if (!(divisionId > 0)) return '';
  if (divisionCodeCache.has(divisionId)) return divisionCodeCache.get(divisionId)!;
  const row = await one<{ division_code: string | null }>('SELECT division_code FROM tb_division WHERE id_division=? LIMIT 1', [divisionId]);
  const code = String(row?.division_code ?? '').toUpperCase().trim();
  divisionCodeCache.set(divisionId, code);
  return code;
}

function executorDivisionClause(alias: string, divCode: string): { sql: string; params: unknown[] } | null {
  const code = divCode.toUpperCase().trim();
  if (!code) return null;
  const parts = [
    `FIND_IN_SET(?, REPLACE(UPPER(COALESCE(${alias}.job_executor, '')), ' ', '')) > 0`,
    `FIND_IN_SET(?, REPLACE(UPPER(COALESCE(${alias}.pic, '')), ' ', '')) > 0`,
    `EXISTS (SELECT 1 FROM tb_job_executor ex WHERE ex.wo_number = ${alias}.wo_number AND UPPER(TRIM(ex.job_executor)) = ?)`,
  ];
  return { sql: `(${parts.join(' OR ')})`, params: [code, code, code] };
}

export interface WoListFilters {
  module?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  company?: string;
  priority?: string;
  shift?: string;
  type_wo?: string;
  id_division?: string;
  job_executor?: string;
  asset_id?: string;
  page?: number;
  per_page?: number;
  exclude_final?: boolean;
  legacy_recap?: boolean;
}

function selectedModules(requested: string, user: User): Array<[string, ModuleCfg]> {
  const req = requested.toLowerCase().trim();
  if (req !== '' && req !== 'all' && !MODULES[req]) return [];
  return Object.entries(MODULES).filter(([key, cfg]) => (req === '' || req === 'all' || req === key) && canReadModule(user, cfg));
}

async function buildWhere(filters: WoListFilters, user: User, cfg: ModuleCfg, alias: string): Promise<{ sql: string; params: unknown[] }> {
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];
  const isRecap = Boolean(filters.legacy_recap);
  const reqDiv = String(filters.id_division ?? '').trim();

  if (isRecap && reqDiv !== '' && reqDiv.toUpperCase() !== 'ALL') {
    const code = await divisionCode(Number(reqDiv));
    const executorClause = executorDivisionClause(alias, code);
    if (executorClause) { clauses.push(executorClause.sql); params.push(...executorClause.params); }
    else clauses.push('1=0');
  } else if (!isRecap) {
    const scope = legacyScopeClause(user, cfg, alias);
    if (scope) { clauses.push(scope.sql); params.push(...scope.params); }
  }

  if (!isRecap) {
    const area = areaScopeClause(user, cfg, 'a');
    if (area) { clauses.push(area.sql); params.push(...area.params); }
  }

  const dateFrom = String(filters.date_from ?? '').trim();
  if (isDateStr(dateFrom)) { clauses.push(`${alias}.date >= ?`); params.push(dateFrom); }
  const dateTo = String(filters.date_to ?? '').trim();
  if (isDateStr(dateTo)) { clauses.push(`${alias}.date <= ?`); params.push(dateTo); }

  for (const field of ['status', 'company', 'priority', 'shift'] as const) {
    const value = String(filters[field] ?? '').trim();
    if (value !== '') { clauses.push(`${alias}.${field} = ?`); params.push(value); }
  }

  const typeWo = String(filters.type_wo ?? '').trim();
  if (typeWo !== '') {
    const types = typeWoAliases(typeWo);
    clauses.push(`UPPER(TRIM(${alias}.type_wo)) IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }

  if (filters.exclude_final) {
    clauses.push(`UPPER(COALESCE(${alias}.status, '')) NOT IN ('CLOSED','VOID','REJECT','REJECTED','DECLINE','DECLINED')`);
  }

  if (!isRecap && reqDiv !== '' && canSeeAllModule(user, cfg)) {
    clauses.push(`${alias}.id_division = ?`);
    params.push(Number(reqDiv));
  }

  const assetId = String(filters.asset_id ?? '').trim();
  if (assetId !== '') { clauses.push(`${alias}.id_equipment = ?`); params.push(assetId); }

  const jobExecutor = String(filters.job_executor ?? '').trim();
  if (jobExecutor !== '') {
    const like = `%${jobExecutor}%`;
    clauses.push(`(${alias}.job_executor LIKE ? OR ${alias}.pic LIKE ?)`);
    params.push(like, like);
  }

  const q = String(filters.q ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    clauses.push(`(${alias}.wo_number LIKE ? OR ${alias}.job_title LIKE ? OR ${alias}.job_requirement LIKE ? OR a.AssetName LIKE ? OR a.AssetCode LIKE ?)`);
    params.push(like, like, like, like, like);
  }

  return { sql: clauses.join(' AND '), params };
}

const HEADER_FIELDS = ['wo_number', 'date', 'company', 'shift', 'type_wo', 'priority', 'id_division', 'id_equipment', 'job_title', 'job_requirement', 'running_hours', 'job_executor', 'pic', 'status', 'creator', 'created_at', 'updated_at'];

function meta(page: number, perPage: number, total: number): Record<string, unknown> {
  return { page, per_page: perPage, total, total_pages: total > 0 ? Math.ceil(total / perPage) : 0 };
}

export async function getWoUnifiedList(filters: WoListFilters, user: User): Promise<{ data: Record<string, unknown>[]; meta: Record<string, unknown> }> {
  const selected = selectedModules(String(filters.module ?? ''), user);
  const page = Math.max(1, Number(filters.page ?? 1));
  const perPage = Math.min(500, Math.max(10, Number(filters.per_page ?? 25)));
  if (!selected.length) return { data: [], meta: meta(page, perPage, 0) };

  const parts: string[] = [];
  const countParts: string[] = [];
  const partParams: unknown[] = [];
  const countParams: unknown[] = [];

  for (const [key, cfg] of selected) {
    const where = await buildWhere(filters, user, cfg, 'w');
    const assetJoin = ' LEFT JOIN `asset` a ON a.AssetID = w.id_equipment';
    countParts.push(`SELECT 1 AS row_marker FROM \`${cfg.table}\` w${assetJoin} WHERE ${where.sql}`);
    countParams.push(...where.params);
    const fields = HEADER_FIELDS.map((f) => `w.\`${f}\` AS \`${f}\``).join(', ');
    parts.push(`SELECT '${key}' AS module, '${MODULE_LABELS[key]}' AS module_label, ${fields}, a.AssetCode AS asset_code, a.AssetName AS asset_name FROM \`${cfg.table}\` w${assetJoin} WHERE ${where.sql}`);
    partParams.push(...where.params);
  }

  const countUnion = countParts.join(' UNION ALL ');
  const totalRow = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM (${countUnion}) all_wo_count`, countParams);
  const total = Number(totalRow?.total ?? 0);

  const offset = (page - 1) * perPage;
  const union = parts.join(' UNION ALL ');
  const data = await rows<Record<string, unknown>>(
    `SELECT * FROM (${union}) all_wo ORDER BY date DESC, created_at DESC, wo_number DESC LIMIT ? OFFSET ?`,
    [...partParams, perPage, offset],
  );

  return { data, meta: meta(page, perPage, total) };
}

export async function getVoidCenterList(filters: WoListFilters, user: User): Promise<{ data: Record<string, unknown>[]; meta: Record<string, unknown> }> {
  return getWoUnifiedList({ ...filters, exclude_final: true }, user);
}
