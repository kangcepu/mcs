import { findUserById as findFullUserById } from '../auth.js';
import { execute, one, rows } from '../db.js';
import { isFcmConfigured, sendToTokens } from './fcm.js';
import type { User } from '../types.js';

export interface DivisionScope {
  type: 'ALL' | 'NONE' | 'EXACT' | 'SELF' | 'MTC' | 'ITS' | 'MESO';
  divisionId?: number;
  userId?: number;
}

export interface ScopeFields {
  divisionIdField: string;
  codeField: string;
  nameField: string;
  userIdField: string;
}

export function hasAllDivisionPermission(user: User): boolean {
  return String(user.username ?? '').toUpperCase() === 'SUPERUSER' || Number(user.daily_control_all ?? 0) === 1;
}

export function hasDailyControlPermission(user: User): boolean {
  if (String(user.username ?? '').toUpperCase() === 'SUPERUSER') return true;
  if (!('daily_control' in user)) return true;
  return Number(user.daily_control ?? 0) === 1;
}

function classifyDivision(code: string, name: string): 'MTC' | 'ITS' | 'MESO' | null {
  const c = String(code ?? '');
  const n = String(name ?? '').toUpperCase();
  if (c.includes('ITS') || c.includes('ITIS') || n.includes('IT INFORMATION SYSTEM')) return 'ITS';
  if (c.includes('MESO') || c.includes('MES') || c.includes('MKL') || c.includes('ELC') || c.includes('SPL') || c.includes('OTO')
    || n.includes('MESO') || n.includes('MEKANIKAL') || n.includes('ELEKTRIKAL') || n.includes('SIPIL') || n.includes('OTOMOTIF')) return 'MESO';
  if (c.includes('MTC') || (n.includes('MAINTENANCE') && !n.includes('MESO'))) return 'MTC';
  return null;
}

export function getDivisionScope(user: User): DivisionScope {
  if (hasAllDivisionPermission(user)) return { type: 'ALL' };
  const idDivision = Number(user.id_division ?? 0);
  if (idDivision > 0) {
    const cls = classifyDivision(String(user.division_code ?? ''), String(user.division_name ?? ''));
    if (cls) return { type: cls, divisionId: idDivision };
    return { type: 'EXACT', divisionId: idDivision };
  }
  if (user.id_user) return { type: 'SELF', userId: Number(user.id_user) };
  return { type: 'NONE' };
}

export function applyDivisionScope(scope: DivisionScope, f: ScopeFields): { sql: string; params: unknown[] } {
  switch (scope.type) {
    case 'ALL':
      return { sql: '', params: [] };
    case 'NONE':
      return { sql: '1=0', params: [] };
    case 'EXACT':
      return scope.divisionId ? { sql: `${f.divisionIdField} = ?`, params: [scope.divisionId] } : { sql: '', params: [] };
    case 'SELF':
      return scope.userId ? { sql: `${f.userIdField} = ?`, params: [scope.userId] } : { sql: '1=0', params: [] };
    case 'MTC':
      return { sql: `((${f.codeField} LIKE '%MTC%') OR (UPPER(${f.nameField}) LIKE '%MAINTENANCE%' AND UPPER(${f.nameField}) NOT LIKE '%MESO%'))`, params: [] };
    case 'ITS':
      return { sql: `((${f.codeField} LIKE '%ITS%' OR ${f.codeField} LIKE '%ITIS%') OR (UPPER(${f.nameField}) LIKE '%IT INFORMATION SYSTEM%' OR UPPER(${f.nameField}) = 'IT'))`, params: [] };
    case 'MESO':
      return {
        sql: `((${f.codeField} LIKE '%MES%' OR ${f.codeField} LIKE '%MESO%' OR ${f.codeField} LIKE '%MKL%' OR ${f.codeField} LIKE '%ELC%' OR ${f.codeField} LIKE '%SPL%' OR ${f.codeField} LIKE '%OTO%')`
          + ` OR (UPPER(${f.nameField}) LIKE '%MESO%' OR UPPER(${f.nameField}) LIKE '%MEKANIKAL%' OR UPPER(${f.nameField}) LIKE '%ELEKTRIKAL%' OR UPPER(${f.nameField}) LIKE '%SIPIL%' OR UPPER(${f.nameField}) LIKE '%OTOMOTIF%'))`,
        params: [],
      };
    default:
      return scope.divisionId ? { sql: `${f.divisionIdField} = ?`, params: [scope.divisionId] } : { sql: '', params: [] };
  }
}

export const DC_SCOPE_FIELDS: ScopeFields = { divisionIdField: 'dc.id_division', codeField: 'd.division_code', nameField: 'd.division_name', userIdField: 'dc.id_user' };

function combine(baseWhere: string, baseParams: unknown[], scope: { sql: string; params: unknown[] }): { where: string; params: unknown[] } {
  if (!scope.sql) return { where: baseWhere, params: baseParams };
  return { where: `${baseWhere} AND ${scope.sql}`, params: [...baseParams, ...scope.params] };
}

const MTC_AREA_KEYS = new Set(['GSU_WNB', 'GSU_INJECT', 'RU_SAWMILL', 'RU_PRODUCTION']);
export function normalizeAreaKey(value: unknown): string | null {
  const norm = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return MTC_AREA_KEYS.has(norm) ? norm : null;
}

interface UserRow { id_user: number; fullname: string; alias?: string | null; username?: string }
const userCache = new Map<number, UserRow | null>();
async function findUserById(idUser: number): Promise<UserRow | null> {
  if (userCache.has(idUser)) return userCache.get(idUser)!;
  const row = await one<UserRow>('SELECT id_user, fullname, alias, username FROM tb_user WHERE id_user=?', [idUser]);
  userCache.set(idUser, row);
  return row;
}
const userByNameCache = new Map<string, UserRow | null>();
async function findUserByName(fullname: string): Promise<UserRow | null> {
  const key = fullname.trim().toUpperCase();
  if (!key) return null;
  if (userByNameCache.has(key)) return userByNameCache.get(key)!;
  const row = await one<UserRow>('SELECT id_user, fullname, alias, username FROM tb_user WHERE UPPER(TRIM(fullname))=?', [key]);
  userByNameCache.set(key, row);
  return row;
}

async function resolveActor(idUser: unknown, fullname: unknown): Promise<{ user: UserRow | null; displayName: string; userAlias: string | null }> {
  let user: UserRow | null = null;
  const idNum = Number(idUser ?? 0);
  if (idNum > 0) user = await findUserById(idNum);
  if (!user && fullname) user = await findUserByName(String(fullname));
  const alias = user?.alias ? String(user.alias).trim() : '';
  const displayName = alias || user?.fullname || String(fullname ?? '');
  return { user, displayName, userAlias: alias || null };
}

const INVALID_LABOR_TOKENS = new Set(['MTC', 'MESO', 'ITS', '-', '']);
function splitLaborNames(trade: unknown): string[] {
  return String(trade ?? '')
    .split(/[|;/]/)
    .map((s) => s.trim())
    .filter((s) => s && !INVALID_LABOR_TOKENS.has(s.toUpperCase()) && !/^WO\b/i.test(s));
}

const WO_SOURCE_TABLES: { table: string; sourceLabel: string }[] = [
  { table: 'tb_wo_mtc_operational', sourceLabel: 'WO MTC' },
  { table: 'tb_wo_mtc', sourceLabel: 'WO MESO' },
  { table: 'tb_wo_it', sourceLabel: 'WO IS' },
  { table: 'tb_wo_preventive', sourceLabel: 'WO PRODUKSI' },
  { table: 'tb_wo_ga', sourceLabel: 'WO GA' },
];

function classifyMesoSubtype(raw: string): string | null {
  const v = raw.toUpperCase();
  if (v.includes('MKL')) return 'MKL';
  if (v.includes('ELC')) return 'ELC';
  if (v.includes('SPL')) return 'SPL';
  if (v.includes('OTO')) return 'OTO';
  return null;
}

function classifyMaintenanceKind(typeWo: unknown): 'Preventive' | 'Project' | 'Corrective' {
  const v = String(typeWo ?? '').toUpperCase();
  if (['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'].includes(v)) return 'Preventive';
  if (v === 'PROJECT') return 'Project';
  return 'Corrective';
}

interface ExecutorMeta { executor_code_raw: string; meso_subtype: string | null; maintenance_kind: string; source_table: string | null; job_title: string | null }
async function findExecutorMetaByWoNumber(woNumber: string): Promise<ExecutorMeta | null> {
  for (const src of WO_SOURCE_TABLES) {
    const row = await one<{ job_executor: string | null; pic: string | null; type_wo: string | null; job_title: string | null }>(
      `SELECT job_executor, pic, type_wo, job_title FROM \`${src.table}\` WHERE wo_number=? LIMIT 1`,
      [woNumber],
    );
    if (row) {
      const raw = String(row.job_executor || row.pic || '');
      return {
        executor_code_raw: raw,
        meso_subtype: src.table === 'tb_wo_mtc' ? classifyMesoSubtype(raw) : null,
        maintenance_kind: classifyMaintenanceKind(row.type_wo),
        source_table: src.table,
        job_title: row.job_title,
      };
    }
  }
  return null;
}

const APPROVAL_TABLE_BY_SOURCE: Record<string, string> = {
  tb_wo_mtc: 'tb_approval',
  tb_wo_mtc_operational: 'tb_approval_operational',
  tb_wo_preventive: 'tb_approval_preventive',
  tb_wo_it: 'tb_approval_it',
  tb_wo_ga: 'tb_approval_ga',
};

function scoreApprovalComment(comment: string, index: number): number {
  const c = comment.toUpperCase();
  let score = -index;
  if (c.includes('REQUEST MATERIAL') || c.includes('REQ MATERIAL')) score += 100;
  else if (c.includes('UPDATED WORK ORDER') || c.includes('UPDATE WORK ORDER') || c.includes('JOB EXPLANATION') || c.includes('IN PROGRESS') || c.includes('COMPLETE')) score += 40;
  if (c.includes('MATERIAL RECEIVED') || c.includes('PARTS RECEIVED') || c.includes('RECEIVED') || c.includes('APPROVE MATERIAL')) score -= 80;
  return score;
}

async function findMaintenanceActionLabel(woNumber: string, sourceTable: string | null, date: string): Promise<string | null> {
  if (!sourceTable) return null;
  const approvalTable = APPROVAL_TABLE_BY_SOURCE[sourceTable];
  if (!approvalTable) return null;
  let approvalRows = await rows<{ comment: string; fullname: string }>(
    `SELECT comment, fullname FROM \`${approvalTable}\` WHERE wo_number=? AND DATE(created_at)=? ORDER BY id ASC`,
    [woNumber, date],
  ).catch(() => [] as { comment: string; fullname: string }[]);
  if (!approvalRows.length) {
    approvalRows = await rows<{ comment: string; fullname: string }>(`SELECT comment, fullname FROM \`${approvalTable}\` WHERE wo_number=? ORDER BY id ASC`, [woNumber]).catch(() => []);
  }
  const candidates = approvalRows
    .map((r, idx) => ({ ...r, score: scoreApprovalComment(String(r.comment ?? ''), idx) }))
    .filter((r) => {
      const fn = String(r.fullname ?? '').trim();
      return fn !== '' && fn.toUpperCase() !== 'ADMIN MAINTENANCE';
    });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return String(candidates[0].comment ?? '') || null;
}

async function findRequestPartLabel(woNumber: string): Promise<string> {
  const parts: string[] = [];
  const materialParts = await rows<{ part: string }>("SELECT DISTINCT part FROM tb_material_request WHERE wo_number=? AND part IS NOT NULL AND TRIM(part)<>'' LIMIT 5", [woNumber]);
  for (const r of materialParts) if (r.part) parts.push(String(r.part));
  const execParts = await rows<{ part_mesin: string; request_part: string | null }>(
    "SELECT part_mesin, request_part FROM tb_wo_operational_part_execution WHERE wo_number=? AND (request_qty>0 OR keterangan<>'') LIMIT 5",
    [woNumber],
  ).catch(() => []);
  for (const r of execParts) { const name = r.request_part || r.part_mesin; if (name) parts.push(String(name)); }
  const unique = [...new Set(parts)];
  if (!unique.length) return '';
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} +${unique.length - 3}`;
}

async function findParticipants(woNumber: string, actorIdUser: number | null): Promise<{ participantUserIds: number[]; participantNames: string[]; laborNames: string[] }> {
  const laborRows = await rows<{ trade: string }>('SELECT trade FROM tb_detail_labor WHERE wo_number=?', [woNumber]);
  const laborNames: string[] = [];
  for (const r of laborRows) laborNames.push(...splitLaborNames(r.trade));
  const uniqueLabor = [...new Set(laborNames)];

  const participantUserIds = new Set<number>();
  const participantNames = new Set<string>();
  if (actorIdUser) participantUserIds.add(actorIdUser);
  for (const name of uniqueLabor) {
    const match = await findUserByName(name);
    if (match) { participantUserIds.add(match.id_user); participantNames.add(match.alias || match.fullname); } else { participantNames.add(name); }
  }
  return { participantUserIds: [...participantUserIds], participantNames: [...participantNames], laborNames: uniqueLabor };
}

function buildDisplayFullname(laborLabel: string, updaterDisplayName: string, fallbackDisplayName: string): string {
  if (!laborLabel) return updaterDisplayName || fallbackDisplayName;
  if (!updaterDisplayName) return laborLabel;
  return `${laborLabel} By ${updaterDisplayName}`;
}

async function resolveDisplayAlias(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const match = await findUserByName(trimmed);
  return (match?.alias?.trim() || match?.fullname || trimmed).trim();
}

export interface ActivityRow { id: number; wo_number: string | null; AssetCode: string | null; id_user: number; fullname: string; created_by: string | null; updated_by: string | null; type_wo?: string | null; [key: string]: unknown }

async function enrichActivityRow(rawRow: Record<string, unknown>, selectedDate: string, requestUserId: number, full: boolean): Promise<Record<string, unknown>> {
  const { __hasMedia: _hasMedia, ...row } = rawRow;
  const woNumber = String(row.wo_number ?? '');
  const actor = await resolveActor(row.id_user, row.fullname ?? row.created_by ?? row.updated_by);
  const executorMeta = woNumber ? await findExecutorMetaByWoNumber(woNumber) : null;

  const participants = woNumber ? await findParticipants(woNumber, Number(row.id_user) || null) : { participantUserIds: [] as number[], participantNames: [] as string[], laborNames: [] as string[] };
  const rawUpdaterName = String(row.updated_by ?? row.fullname ?? '').trim();
  const updaterIsLabor = rawUpdaterName !== '' &&
    participants.laborNames.some((l) => l.trim().toUpperCase() === rawUpdaterName.toUpperCase());
  const updaterDisplayName = rawUpdaterName !== '' && !updaterIsLabor
    ? await resolveDisplayAlias(rawUpdaterName)
    : '';
  const laborLabel = (await Promise.all(participants.laborNames.map(resolveDisplayAlias))).join(', ');
  const displayFullname = buildDisplayFullname(laborLabel, updaterDisplayName, actor.displayName);

  const commentCount = Number((await one<{ total: number }>('SELECT COUNT(*) total FROM tb_daily_control_comment WHERE daily_control_id=?', [row.id]))?.total ?? 0);
  const unreadCount = requestUserId ? await countUnreadForActivity(Number(row.id), requestUserId) : 0;

  const enriched: Record<string, unknown> = {
    ...row,
    user_alias: actor.userAlias,
    display_name: actor.displayName,
    executor_code_raw: executorMeta?.executor_code_raw ?? null,
    meso_subtype: executorMeta?.meso_subtype ?? null,
    maintenance_kind: executorMeta?.maintenance_kind ?? null,
    source_table: executorMeta?.source_table ?? null,
    participant_user_ids: participants.participantUserIds,
    participant_names: participants.participantNames,
    labor_names: participants.laborNames,
    display_fullname: displayFullname,
    comment_count: commentCount,
    unread_count: unreadCount,
  };

  if (full) {
    enriched.tags = (await rows<{ tag_fullname: string; tag_user_id: number | null; tag_role: string | null }>('SELECT * FROM tb_daily_control_tag WHERE daily_control_id=? ORDER BY id ASC', [row.id]))
      .map((t) => ({ ...t, tag_fullname: t.tag_fullname }));
    const mediaRows = await rows<Record<string, unknown>>('SELECT * FROM tb_daily_control_media WHERE daily_control_id=? ORDER BY id ASC', [row.id]);
    enriched.media = mediaRows.map((m) => ({ ...m, media_url: `/uploads/${String(m.media_path)}` }));
    enriched.followups = await rows('SELECT * FROM tb_daily_control_followup WHERE daily_control_id=? ORDER BY id ASC', [row.id]);
    enriched.reader_names = await getReaderNames(Number(row.id));
    enriched.request_part_label = woNumber ? await findRequestPartLabel(woNumber) : '';
    enriched.maintenance_action_label = woNumber ? await findMaintenanceActionLabel(woNumber, executorMeta?.source_table ?? null, selectedDate) : null;
    if (actor.user) {
      const flagRow = await one<Record<string, unknown>>(
        'SELECT wo_category_general, wo_category_electrical, wo_category_mould, mtc_area_gsu_wnb, mtc_area_gsu_inject, mtc_area_ru_sawmill, mtc_area_ru_production FROM tb_user WHERE id_user=?',
        [actor.user.id_user],
      );
      Object.assign(enriched, flagRow ?? {});
    }
  } else {
    const mediaRows = await rows<Record<string, unknown>>('SELECT id, media_type, media_path FROM tb_daily_control_media WHERE daily_control_id=? ORDER BY id ASC LIMIT 1', [row.id]);
    const preview = mediaRows.find((m) => m.media_type === 'image') ?? mediaRows[0];
    enriched.preview_media_url = preview ? `/uploads/${String(preview.media_path)}` : null;
    enriched.executor_label = executorMeta?.executor_code_raw ?? null;
    if (!row.job_title && executorMeta?.job_title) enriched.job_title = executorMeta.job_title;
  }

  return enriched;
}

function collapseLatestByWo(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  for (const item of items) {
    const wo = String(item.wo_number ?? '');
    const sourceType = String(item.source_type ?? '');
    if (!wo || sourceType !== 'WO_MAINTENANCE') { order.push(`__nowo_${order.length}`); seen.set(`__nowo_${order.length - 1}`, item); continue; }
    if (!seen.has(wo)) { seen.set(wo, item); order.push(wo); continue; }
    const existing = seen.get(wo)!;
    if (!existing.__hasMedia && item.__hasMedia) seen.set(wo, item);
  }
  return order.map((k) => seen.get(k)!);
}

export async function getActivitiesByDate(selectedDate: string, scope: DivisionScope, sourceType: string | null, areaKey: string | null, requestUserId: number): Promise<Record<string, unknown>[]> {
  let where = 'WHERE dc.activity_date = ?';
  const params: unknown[] = [selectedDate];
  let join = 'LEFT JOIN tb_division d ON d.id_division=dc.id_division LEFT JOIN tb_company c ON c.id_company=dc.id_company LEFT JOIN asset a ON a.AssetCode=dc.AssetCode';
  if (areaKey) { where += ' AND a.mtc_area_key = ?'; params.push(areaKey); }
  if (sourceType) { where += ' AND dc.source_type = ?'; params.push(sourceType); }

  const scoped = combine(where, params, applyDivisionScope(scope, DC_SCOPE_FIELDS));
  const baseRows = await rows<Record<string, unknown>>(
    `SELECT dc.*, d.division_name, d.division_code, c.company_name, a.AssetName AS asset_name, a.mtc_area_key
     FROM tb_daily_control dc ${join} ${scoped.where} ORDER BY dc.activity_time DESC, dc.id DESC`,
    scoped.params,
  );

  const withMediaFlag = await Promise.all(baseRows.map(async (row) => {
    const mediaCount = Number((await one<{ total: number }>('SELECT COUNT(*) total FROM tb_daily_control_media WHERE daily_control_id=?', [row.id]))?.total ?? 0);
    return { ...row, __hasMedia: mediaCount > 0 };
  }));
  const collapsed = collapseLatestByWo(withMediaFlag);

  return Promise.all(collapsed.map((row) => enrichActivityRow(row, selectedDate, requestUserId, true)));
}

export async function getV2ActivityFeed(
  selectedDate: string, scope: DivisionScope, sourceType: string | null, areaKey: string | null, requestUserId: number, page: number, perPage: number,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  let where = 'WHERE dc.activity_date = ?';
  const params: unknown[] = [selectedDate];
  const join = 'LEFT JOIN tb_division d ON d.id_division=dc.id_division LEFT JOIN asset a ON a.AssetCode=dc.AssetCode';
  if (areaKey) { where += ' AND a.mtc_area_key = ?'; params.push(areaKey); }
  if (sourceType) { where += ' AND dc.source_type = ?'; params.push(sourceType); }

  const scoped = combine(where, params, applyDivisionScope(scope, DC_SCOPE_FIELDS));
  const baseRows = await rows<Record<string, unknown>>(
    `SELECT dc.id, dc.activity_date, dc.activity_time, dc.wo_number, dc.AssetCode, dc.fullname, dc.created_by, dc.updated_by,
            dc.title AS job_title, dc.notes AS keterangan, dc.created_at, dc.id_user, dc.source_type, d.division_name, d.division_code
     FROM tb_daily_control dc ${join} ${scoped.where} ORDER BY dc.activity_time DESC, dc.id DESC`,
    scoped.params,
  );

  const withMediaFlag = await Promise.all(baseRows.map(async (row) => {
    const mediaCount = Number((await one<{ total: number }>('SELECT COUNT(*) total FROM tb_daily_control_media WHERE daily_control_id=?', [row.id]))?.total ?? 0);
    return { ...row, __hasMedia: mediaCount > 0 };
  }));
  const collapsed = collapseLatestByWo(withMediaFlag);
  const total = collapsed.length;
  const pageItems = collapsed.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

  const items = await Promise.all(pageItems.map((row) => enrichActivityRow(row, selectedDate, requestUserId, false)));
  return { items, total };
}

export async function getActivityById(id: number, requestUserId: number): Promise<Record<string, unknown> | null> {
  const row = await one<Record<string, unknown>>(
    `SELECT dc.*, d.division_name, d.division_code, c.company_name, a.AssetName AS asset_name
     FROM tb_daily_control dc LEFT JOIN tb_division d ON d.id_division=dc.id_division LEFT JOIN tb_company c ON c.id_company=dc.id_company
     LEFT JOIN asset a ON a.AssetCode=dc.AssetCode WHERE dc.id=?`,
    [id],
  );
  if (!row) return null;
  const enriched = await enrichActivityRow(row, String(row.activity_date), requestUserId, true);
  enriched.comments = await getCommentsByDailyControl(id);
  return enriched;
}

export async function isActivityInScope(id: number, scope: DivisionScope): Promise<boolean> {
  const scoped = combine('WHERE dc.id = ?', [id], applyDivisionScope(scope, DC_SCOPE_FIELDS));
  const row = await one<{ id: number }>(`SELECT dc.id FROM tb_daily_control dc LEFT JOIN tb_division d ON d.id_division=dc.id_division ${scoped.where}`, scoped.params);
  return !!row;
}

export async function getReaderNames(dailyControlId: number): Promise<string[]> {
  const readers = await rows<{ fullname: string; alias: string | null }>(
    'SELECT u.fullname, u.alias FROM tb_daily_control_read r JOIN tb_user u ON u.id_user=r.id_user WHERE r.daily_control_id=? ORDER BY r.last_read_at DESC',
    [dailyControlId],
  );
  const names: string[] = [];
  const seen = new Set<string>();
  for (const r of readers) {
    const name = (r.alias && r.alias.trim()) || r.fullname;
    if (!seen.has(name)) { seen.add(name); names.push(name); }
  }
  return names;
}

async function countUnreadForActivity(dailyControlId: number, userId: number): Promise<number> {
  const row = await one<{ total: number }>(
    `SELECT COUNT(*) total FROM tb_daily_control_comment c
     LEFT JOIN tb_daily_control_read r ON r.daily_control_id=c.daily_control_id AND r.id_user=?
     WHERE c.daily_control_id=? AND c.id_user<>? AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)`,
    [userId, dailyControlId, userId],
  );
  return Number(row?.total ?? 0);
}

export async function getVisibleDailyControlIds(scope: DivisionScope, sourceType: string | null): Promise<number[]> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (sourceType) { where += ' AND dc.source_type = ?'; params.push(sourceType); }
  const scoped = combine(where, params, applyDivisionScope(scope, DC_SCOPE_FIELDS));
  const result = await rows<{ id: number }>(`SELECT dc.id FROM tb_daily_control dc LEFT JOIN tb_division d ON d.id_division=dc.id_division ${scoped.where}`, scoped.params);
  return result.map((r) => r.id);
}

export async function getTotalUnreadActivityCountForUser(userId: number, scope: DivisionScope, sourceType: string | null = 'WO_MAINTENANCE'): Promise<number> {
  const ids = await getVisibleDailyControlIds(scope, sourceType);
  if (!ids.length) return 0;
  const result = await rows<{ daily_control_id: number }>(
    `SELECT c.daily_control_id FROM tb_daily_control_comment c
     LEFT JOIN tb_daily_control_read r ON r.daily_control_id=c.daily_control_id AND r.id_user=?
     WHERE c.daily_control_id IN (${ids.map(() => '?').join(',')}) AND c.id_user<>? AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
     GROUP BY c.daily_control_id`,
    [userId, ...ids, userId],
  );
  return Math.max(0, result.length);
}

export async function getUnreadActivitiesForUser(userId: number, scope: DivisionScope, sourceType: string | null, limit: number): Promise<Record<string, unknown>[]> {
  const ids = await getVisibleDailyControlIds(scope, sourceType);
  if (!ids.length) return [];
  const unreadRows = await rows<{ daily_control_id: number }>(
    `SELECT c.daily_control_id FROM tb_daily_control_comment c
     LEFT JOIN tb_daily_control_read r ON r.daily_control_id=c.daily_control_id AND r.id_user=?
     WHERE c.daily_control_id IN (${ids.map(() => '?').join(',')}) AND c.id_user<>? AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
     GROUP BY c.daily_control_id`,
    [userId, ...ids, userId],
  );
  const unreadIds = unreadRows.map((r) => r.daily_control_id);
  if (!unreadIds.length) return [];

  const baseRows = await rows<Record<string, unknown>>(
    `SELECT dc.*, d.division_name, d.division_code, c.company_name, a.AssetName AS asset_name
     FROM tb_daily_control dc LEFT JOIN tb_division d ON d.id_division=dc.id_division LEFT JOIN tb_company c ON c.id_company=dc.id_company
     LEFT JOIN asset a ON a.AssetCode=dc.AssetCode WHERE dc.id IN (${unreadIds.map(() => '?').join(',')})
     ORDER BY dc.activity_date DESC, dc.activity_time DESC, dc.id DESC LIMIT ?`,
    [...unreadIds, limit],
  );

  return Promise.all(baseRows.map(async (row) => {
    const actor = await resolveActor(row.id_user, row.fullname);
    const unreadCount = await countUnreadForActivity(Number(row.id), userId);
    const latest = await one<{ message: string; created_at: string; fullname: string }>(
      `SELECT c.message, c.created_at, c.fullname FROM tb_daily_control_comment c
       LEFT JOIN tb_daily_control_read r ON r.daily_control_id=c.daily_control_id AND r.id_user=?
       WHERE c.daily_control_id=? AND c.id_user<>? AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
       ORDER BY c.created_at DESC LIMIT 1`,
      [userId, row.id, userId],
    );
    return {
      ...row,
      user_alias: actor.userAlias,
      display_name: actor.displayName,
      unread_count: unreadCount,
      latest_unread_message: latest?.message ?? null,
      latest_unread_at: latest?.created_at ?? null,
      latest_unread_sender: latest?.fullname ?? null,
    };
  }));
}

export async function markAsRead(dailyControlId: number, userId: number): Promise<boolean> {
  const existing = await one<{ id: number }>('SELECT id FROM tb_daily_control_read WHERE daily_control_id=? AND id_user=?', [dailyControlId, userId]);
  if (existing) {
    await execute('UPDATE tb_daily_control_read SET last_read_at=NOW() WHERE id=?', [existing.id]);
  } else {
    await execute('INSERT INTO tb_daily_control_read (daily_control_id, id_user, last_read_at) VALUES (?,?,NOW())', [dailyControlId, userId]);
  }
  return true;
}

function buildCommentTree(flat: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<number, Record<string, unknown>>();
  for (const c of flat) byId.set(Number(c.id), { ...c, replies: [] });
  const roots: Record<string, unknown>[] = [];
  for (const c of byId.values()) {
    const parentId = c.parent_id ? Number(c.parent_id) : null;
    if (parentId && byId.has(parentId)) (byId.get(parentId)!.replies as Record<string, unknown>[]).push(c);
    else roots.push(c);
  }
  return roots;
}

export async function getCommentsByDailyControl(dailyControlId: number): Promise<Record<string, unknown>[]> {
  const comments = await rows<Record<string, unknown>>('SELECT * FROM tb_daily_control_comment WHERE daily_control_id=? ORDER BY created_at ASC', [dailyControlId]);
  const withMedia = await Promise.all(comments.map(async (c) => {
    const media = await rows<Record<string, unknown>>('SELECT * FROM tb_daily_control_comment_media WHERE comment_id=? ORDER BY id ASC', [c.id]);
    return { ...c, media: media.map((m) => ({ ...m, media_url: `/uploads/${String(m.media_path)}` })) };
  }));
  return buildCommentTree(withMedia);
}

export async function createComment(dailyControlId: number, userId: number, fallbackName: string, divisionName: string, message: string, parentId: number | null): Promise<number | null> {
  if (parentId) {
    const parent = await one<{ daily_control_id: number }>('SELECT daily_control_id FROM tb_daily_control_comment WHERE id=?', [parentId]);
    if (!parent || Number(parent.daily_control_id) !== dailyControlId) return null;
  }
  const actor = await resolveActor(userId, fallbackName);
  const finalName = actor.displayName || fallbackName;
  const finalMessage = message || 'Lampiran foto';
  const result = await execute(
    'INSERT INTO tb_daily_control_comment (daily_control_id, parent_id, id_user, fullname, division_name, message, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [dailyControlId, parentId, userId, finalName, divisionName, finalMessage],
  );
  return result.insertId || null;
}

export async function getCommentById(id: number): Promise<Record<string, unknown> | null> {
  const comment = await one<Record<string, unknown>>('SELECT * FROM tb_daily_control_comment WHERE id=?', [id]);
  if (!comment) return null;
  const media = await rows<Record<string, unknown>>('SELECT * FROM tb_daily_control_comment_media WHERE comment_id=? ORDER BY id ASC', [id]);
  return { ...comment, media: media.map((m) => ({ ...m, media_url: `/uploads/${String(m.media_path)}` })) };
}

export async function notifyCommentRecipients(dailyControlId: number, comment: Record<string, unknown> | null, senderId: number, senderName: string): Promise<void> {
  try {
    if (!(await isFcmConfigured())) return;
    const activity = await getActivityById(dailyControlId, 0);
    if (!activity) return;

    const recipientIds = new Set<number>();
    const ownerId = Number(activity.id_user ?? 0);
    if (ownerId > 0) recipientIds.add(ownerId);
    for (const id of (activity.participant_user_ids as number[] | undefined) ?? []) {
      if (Number(id) > 0) recipientIds.add(Number(id));
    }
    const commentUsers = await rows<{ id_user: number }>('SELECT DISTINCT id_user FROM tb_daily_control_comment WHERE daily_control_id=? AND id_user IS NOT NULL', [dailyControlId]);
    for (const r of commentUsers) if (Number(r.id_user) > 0) recipientIds.add(Number(r.id_user));
    const readUsers = await rows<{ id_user: number }>('SELECT DISTINCT id_user FROM tb_daily_control_read WHERE daily_control_id=? AND id_user IS NOT NULL', [dailyControlId]);
    for (const r of readUsers) if (Number(r.id_user) > 0) recipientIds.add(Number(r.id_user));
    recipientIds.delete(senderId);
    if (!recipientIds.size) return;

    const idList = [...recipientIds];
    const tokenRows = await rows<{ id_user: number; token: string }>(
      `SELECT id_user, token FROM tb_user_device_token WHERE id_user IN (${idList.map(() => '?').join(',')}) AND is_active=1 AND TRIM(COALESCE(token,'')) <> '' ORDER BY updated_at DESC`,
      idList,
    );
    if (!tokenRows.length) return;

    const tokensByUser = new Map<number, string[]>();
    for (const r of tokenRows) {
      const list = tokensByUser.get(r.id_user) ?? [];
      list.push(r.token);
      tokensByUser.set(r.id_user, list);
    }

    const assetName = String(activity.asset_name ?? '').trim();
    const titleParts = ['Daily Control'];
    if (assetName) titleParts.push(assetName);
    const commentMessage = String(comment?.message ?? '').trim() || 'Mengirim komentar baru';
    const body = `${senderName}: ${commentMessage}`.slice(0, 160);

    const invalidTokens: string[] = [];
    let totalFailed = 0;
    for (const [recipientUserId, userTokens] of tokensByUser) {
      const recipientUser = await findFullUserById(recipientUserId);
      const badgeCount = recipientUser ? await getTotalUnreadActivityCountForUser(recipientUserId, getDivisionScope(recipientUser), null) : 0;

      const result = await sendToTokens(userTokens, {
        title: titleParts.join(' - '),
        body,
        data: {
          type: 'daily_control_comment',
          daily_control_id: String(dailyControlId),
          comment_id: String(Number(comment?.id ?? 0)),
          wo_number: String(activity.wo_number ?? ''),
          activity_date: String(activity.activity_date ?? ''),
          asset_name: assetName,
          sender_name: senderName,
          activity_title: String(activity.title ?? ''),
          badge_count: String(badgeCount),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        badgeCount,
      });
      invalidTokens.push(...result.invalidTokens);
      totalFailed += result.failed;
    }

    if (invalidTokens.length) {
      const unique = [...new Set(invalidTokens)];
      await execute(`UPDATE tb_user_device_token SET is_active=0, updated_at=NOW() WHERE token IN (${unique.map(() => '?').join(',')})`, unique);
    }
    if (totalFailed > 0) console.error(`Daily Control comment FCM failed for activity ${dailyControlId} on ${totalFailed} token(s)`);
  } catch (error) {
    console.error('Daily Control notifyCommentRecipients error:', error);
  }
}

export async function getTeamUsers(scope: DivisionScope): Promise<Record<string, unknown>[]> {
  const scoped = applyDivisionScope(scope, { divisionIdField: 'u.id_division', codeField: 'd.division_code', nameField: 'd.division_name', userIdField: 'u.id_user' });
  let where = "WHERE u.active=1 AND u.fullname != 'superuser'";
  const params: unknown[] = [];
  if (scoped.sql) { where += ` AND ${scoped.sql}`; params.push(...scoped.params); }
  return rows(
    `SELECT u.id_user, u.fullname, u.alias, u.id_position, u.id_division, d.division_name, d.division_code,
            u.wo_category_general, u.wo_category_electrical, u.wo_category_mould,
            u.mtc_area_gsu_wnb, u.mtc_area_gsu_inject, u.mtc_area_ru_sawmill, u.mtc_area_ru_production
     FROM tb_user u LEFT JOIN tb_division d ON d.id_division=u.id_division ${where} ORDER BY u.fullname ASC`,
    params,
  );
}

function isSummaryDivisionUser(row: Record<string, unknown>): boolean {
  return classifyDivision(String(row.division_code ?? ''), String(row.division_name ?? '')) !== null;
}

function normalizeNameForMatch(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function buildUserUpdateSummary(teamUsers: Record<string, unknown>[], activities: Record<string, unknown>[]): Record<string, unknown> {
  const relevantUsers = teamUsers.filter(isSummaryDivisionUser);
  const updatedIds = new Set<number>();
  for (const activity of activities) {
    const ids = (activity.participant_user_ids as number[] | undefined) ?? [];
    for (const id of ids) updatedIds.add(id);
    const names = (activity.participant_names as string[] | undefined) ?? [];
    for (const user of relevantUsers) {
      const uid = Number(user.id_user);
      if (updatedIds.has(uid)) continue;
      const userName = normalizeNameForMatch(String((user.alias as string) || user.fullname));
      for (const name of names) {
        const normalized = normalizeNameForMatch(name);
        if (normalized && (normalized === userName || normalized.includes(userName) || userName.includes(normalized))) { updatedIds.add(uid); break; }
      }
    }
  }
  const toDisplay = (u: Record<string, unknown>) => ({ id_user: u.id_user, fullname: u.fullname, display_name: (u.alias as string) || (u.fullname as string) });
  const updated = relevantUsers.filter((u) => updatedIds.has(Number(u.id_user))).map(toDisplay).sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
  const pending = relevantUsers.filter((u) => !updatedIds.has(Number(u.id_user))).map(toDisplay).sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
  return {
    total_user_count: relevantUsers.length,
    updated_user_count: updated.length,
    pending_user_count: pending.length,
    updated_users: updated,
    pending_users: pending,
  };
}

export async function searchAssets(term: string, limit = 30): Promise<Record<string, unknown>[]> {
  let where = "WHERE AssetCode IS NOT NULL AND TRIM(AssetCode)<>''";
  const params: unknown[] = [];
  if (term) { where += ' AND (AssetCode LIKE ? OR AssetName LIKE ? OR CompanyName LIKE ?)'; params.push(`%${term}%`, `%${term}%`, `%${term}%`); }
  const items = await rows<{ AssetCode: string; AssetName: string; CompanyName: string }>(`SELECT AssetCode, AssetName, CompanyName FROM asset ${where} ORDER BY AssetCode ASC LIMIT ?`, [...params, limit]);
  return items.filter((r) => r.AssetCode).map((r) => {
    let text = r.AssetCode;
    if (r.AssetName) text += ` | ${r.AssetName}`;
    if (r.CompanyName) text += ` (${r.CompanyName})`;
    return { id: r.AssetCode, text, asset_code: r.AssetCode, asset_name: r.AssetName, company_name: r.CompanyName };
  });
}

export async function getAssetParts(assetCode: string): Promise<Record<string, unknown>[]> {
  if (!assetCode) return [];
  const items = await rows<{ part_mesin: string }>(
    "SELECT part_mesin FROM asset_custom_details WHERE asset_code=? AND part_mesin IS NOT NULL AND TRIM(part_mesin)<>'' GROUP BY part_mesin ORDER BY part_mesin ASC",
    [assetCode],
  ).catch(() => []);
  return items.map((r) => ({ id: r.part_mesin, text: r.part_mesin }));
}

function buildPartMentionItem(row: Record<string, unknown>): Record<string, unknown> {
  const partName = String(row.request_part || row.part_mesin || '');
  const subtitleParts = [row.bagian_mesin, row.schedule_type, row.maintenance_status ? String(row.maintenance_status).toUpperCase() : null].filter(Boolean);
  return {
    id: row.custom_detail_id || partName,
    custom_detail_id: row.custom_detail_id ?? null,
    part_name: partName,
    section_name: row.bagian_mesin ?? null,
    schedule_type: row.schedule_type ?? null,
    maintenance_status: row.maintenance_status ? String(row.maintenance_status).toUpperCase() : null,
    notes: row.keterangan ?? null,
    mention_text: `@${partName}`,
    text: partName,
    subtitle: subtitleParts.join(' | '),
  };
}

export async function getActivityPartMentions(dailyControlId: number): Promise<Record<string, unknown>[]> {
  const activity = await one<{ wo_number: string | null }>('SELECT wo_number FROM tb_daily_control WHERE id=?', [dailyControlId]);
  const woNumber = activity?.wo_number ? String(activity.wo_number) : '';
  if (!woNumber) return [];

  const execRows = await rows<Record<string, unknown>>(
    'SELECT id, custom_detail_id, part_mesin, bagian_mesin, maintenance_status, request_qty, request_part, request_uom, keterangan, updated_at FROM tb_wo_operational_part_execution WHERE wo_number=? ORDER BY updated_at DESC, id ASC',
    [woNumber],
  ).catch(() => []);
  const execByKey = new Map<string, Record<string, unknown>>();
  for (const r of execRows) {
    const key = r.custom_detail_id ? `id:${r.custom_detail_id}` : `name:${String(r.part_mesin ?? '').toLowerCase()}`;
    if (!execByKey.has(key)) execByKey.set(key, r);
  }

  const items: Record<string, unknown>[] = [];
  const usedKeys = new Set<string>();
  const seenNames = new Set<string>();

  const definitions = await rows<Record<string, unknown>>(
    'SELECT id, part_mesin, bagian_mesin, durasi_pengecekan FROM asset_custom_details WHERE asset_code=(SELECT AssetCode FROM asset a JOIN tb_daily_control dc ON dc.AssetCode=a.AssetCode WHERE dc.id=? LIMIT 1)',
    [dailyControlId],
  ).catch(() => []);

  for (const def of definitions) {
    const key = def.id ? `id:${def.id}` : `name:${String(def.part_mesin ?? '').toLowerCase()}`;
    const exec = execByKey.get(key);
    const merged: Record<string, unknown> = {
      custom_detail_id: def.id ?? exec?.custom_detail_id ?? null,
      part_mesin: def.part_mesin ?? exec?.part_mesin,
      bagian_mesin: def.bagian_mesin ?? exec?.bagian_mesin,
      schedule_type: def.durasi_pengecekan ?? null,
      maintenance_status: exec?.maintenance_status ?? 'PENDING',
      keterangan: exec?.keterangan ?? null,
      request_part: exec?.request_part ?? null,
    };
    usedKeys.add(key);
    const name = String(merged.request_part || merged.part_mesin || '').toLowerCase();
    if (name && !seenNames.has(name)) { seenNames.add(name); items.push(buildPartMentionItem(merged)); }
  }

  for (const [key, exec] of execByKey) {
    if (usedKeys.has(key)) continue;
    const name = String(exec.request_part || exec.part_mesin || '').toLowerCase();
    if (name && !seenNames.has(name)) { seenNames.add(name); items.push(buildPartMentionItem(exec)); }
  }

  return items;
}

export async function searchWorkOrders(term: string, limit: number, assetCode: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const src of WO_SOURCE_TABLES) {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let join = '';
    if (assetCode) { join = 'JOIN asset a ON a.AssetID = wo.id_equipment'; where += ' AND a.AssetCode = ?'; params.push(assetCode); }
    if (term) { where += ' AND (wo.wo_number LIKE ? OR wo.job_title LIKE ?)'; params.push(`%${term}%`, `%${term}%`); }
    const list = await rows<{ wo_number: string; job_title: string; date: string }>(
      `SELECT wo.wo_number, wo.job_title, wo.date FROM \`${src.table}\` wo ${join} ${where} ORDER BY wo.date DESC LIMIT 30`,
      params,
    ).catch(() => []);
    for (const r of list) {
      if (seen.has(r.wo_number)) continue;
      seen.add(r.wo_number);
      results.push({ id: r.wo_number, text: `${r.wo_number} | ${r.job_title} (${src.sourceLabel})`, wo_number: r.wo_number, job_title: r.job_title, source: src.sourceLabel, date: r.date });
    }
  }
  results.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return results.slice(0, limit);
}
