import { execute, one, rows, transaction } from '../db.js';
import { HttpError } from '../http.js';
import type { User } from '../types.js';

interface WoJob {
  table: string;
  moduleKey: string;
  moduleLabel: string;
  statuses: string[];
  where: Record<string, unknown>;
  actionLabel: string;
  excludePreventive: boolean;
  excludeScheduleGenerated: boolean;
}

function job(table: string, moduleKey: string, moduleLabel: string, statuses: string[], where: Record<string, unknown> = {}, actionLabel = 'Approve', excludePreventive = false, excludeScheduleGenerated = false): WoJob {
  return { table, moduleKey, moduleLabel, statuses, where, actionLabel, excludePreventive, excludeScheduleGenerated };
}

export function isManagementUser(user: User): boolean {
  const position = String(user.id_position ?? '').toUpperCase().trim();
  return position !== '' && position.includes('MANAGEMENT');
}

export function isManagementRole(user: User): boolean {
  return isManagementUser(user) && Number(user.approval_all ?? 0) !== 1;
}

function hasAllApprovalAccess(user: User): boolean {
  return isManagementUser(user) || Number(user.approval_all ?? 0) === 1;
}

export function canVoidWorkOrder(user: User): boolean {
  return Number(user.wo_void ?? 0) === 1 || Number(user.void ?? 0) === 1 || Number(user.approval_all ?? 0) === 1;
}

const MODULE_LABELS: Record<string, string> = { wo_it: 'WO IS', wo_ga: 'WO GA', wo_operational: 'WO MTC', wo_preventive: 'WO Production', wo_mtc: 'WO MESO' };

function classifyWoNumberModule(woNumber: string): string {
  const wo = woNumber.toUpperCase().trim();
  if (wo.startsWith('WOIT')) return 'wo_it';
  if (wo.startsWith('WOGA')) return 'wo_ga';
  if (wo.startsWith('WOPR')) return 'wo_operational';
  if (wo.startsWith('PREV')) return 'wo_preventive';
  if (wo.startsWith('WO-') || wo.startsWith('WO/')) return 'wo_mtc';
  return '';
}

function shortCompany(value: unknown): string {
  const map: Record<string, string> = { 'Ganda Saribu Utama': 'GSU', 'Utama Corporation': 'UC', 'Ratimdo Utama': 'RU' };
  const company = String(value ?? '').trim();
  return map[company] ?? company;
}

function approvalJobs(user: User): WoJob[] {
  if (hasAllApprovalAccess(user)) {
    return [
      job('tb_wo_it', 'wo_it', 'WO IS', ['WAIT_KA_DIV', 'WAIT_KA_DIV_ITIS']),
      job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['WAIT_KA_DIV']),
      job('tb_wo_mtc_operational', 'wo_operational', 'WO MTC', ['WAIT_KA_DIV', 'WAIT_KA_DIV_MTC'], {}, 'Approve', true),
      job('tb_wo_ga', 'wo_ga', 'WO GA', ['WAIT_KA_DIV', 'WAIT_KA_DIV_HRGA']),
      job('tb_wo_preventive', 'wo_preventive', 'WO Production', ['WAIT_KA_DIV', 'WAIT_KA_DIV_MTC']),
    ];
  }

  const div = Number(user.id_division ?? 0);
  const code = String(user.division_code ?? '').toUpperCase();
  const pos = String(user.id_position ?? '').toUpperCase();
  const jobs: WoJob[] = [];

  if (pos === 'DIVHEAD') {
    jobs.push(
      job('tb_wo_it', 'wo_it', 'WO IS', ['WAIT_KA_DIV'], { id_division: div }),
      job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['WAIT_KA_DIV'], { id_division: div }),
      job('tb_wo_mtc_operational', 'wo_operational', 'WO MTC', ['WAIT_KA_DIV'], { id_division: div }, 'Approve', true),
      job('tb_wo_preventive', 'wo_preventive', 'WO Production', ['WAIT_KA_DIV'], { id_division: div }),
      job('tb_wo_ga', 'wo_ga', 'WO GA', ['WAIT_KA_DIV'], { id_division: div }),
    );
    if (code === 'ITS') jobs.push(job('tb_wo_it', 'wo_it', 'WO IS', ['WAIT_KA_DIV_ITIS']));
    if (code === 'MTC') {
      jobs.push(job('tb_wo_mtc_operational', 'wo_operational', 'WO MTC', ['WAIT_KA_DIV_MTC'], {}, 'Approve', true));
      jobs.push(job('tb_wo_preventive', 'wo_preventive', 'WO Production', ['WAIT_KA_DIV_MTC']));
    }
    if (code === 'HRGA') jobs.push(job('tb_wo_ga', 'wo_ga', 'WO GA', ['WAIT_KA_DIV_HRGA']));
  } else if (pos === 'DEPTHEAD') {
    jobs.push(job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['WAIT_KA_DEPT_MESO', 'FROM_MAINTENANCE']));
  } else if (pos === 'PLANNER_ADMIN') {
    jobs.push(job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['WAIT_PLANNER_ADMIN']));
  } else if (pos === 'PLANNER_HEAD') {
    jobs.push(job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['WAIT_PLANNER_HEAD']));
  }

  return jobs;
}

function closingJobs(user: User): WoJob[] {
  if (hasAllApprovalAccess(user)) {
    return [
      job('tb_wo_it', 'wo_it', 'WO IS', ['NEED_CLOSED'], {}, 'Closed'),
      job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['NEED_CLOSED'], {}, 'Closed', true),
      job('tb_wo_mtc_operational', 'wo_operational', 'WO MTC', ['NEED_CLOSED'], {}, 'Closed'),
      job('tb_wo_ga', 'wo_ga', 'WO GA', ['NEED_CLOSED'], {}, 'Closed'),
      job('tb_wo_preventive', 'wo_preventive', 'WO Production', ['NEED_CLOSED'], {}, 'Closed'),
    ];
  }

  const div = Number(user.id_division ?? 0);
  const pos = String(user.id_position ?? '').toUpperCase();
  const jobs: WoJob[] = [];

  if (pos === 'DIVHEAD') {
    jobs.push(
      job('tb_wo_it', 'wo_it', 'WO IS', ['NEED_CLOSED'], { id_division: div }, 'Closed'),
      job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['NEED_CLOSED'], { id_division: div }, 'Closed', true),
      job('tb_wo_mtc_operational', 'wo_operational', 'WO MTC', ['NEED_CLOSED'], { id_division: div }, 'Closed'),
      job('tb_wo_preventive', 'wo_preventive', 'WO Production', ['NEED_CLOSED'], { id_division: div }, 'Closed'),
      job('tb_wo_ga', 'wo_ga', 'WO GA', ['NEED_CLOSED'], { id_division: div }, 'Closed'),
    );
  } else if (pos === 'DEPTHEAD') {
    jobs.push(job('tb_wo_mtc', 'wo_mtc', 'WO MESO', ['COMPLETE_EXECUTOR'], { id_division: div }, 'Closed', true));
  }

  return jobs;
}

function nonPreventiveFilterSql(alias = 'wo'): string {
  const a = alias.replace(/[^a-zA-Z0-9_]/g, '');
  return `(
    UPPER(TRIM(COALESCE(${a}.type_wo,''))) NOT IN ('PREVENTIVE','PREVENTIVE MAINTENANCE','PREV MAINTENANCE','PREV','PM')
    AND (
      UPPER(TRIM(COALESCE(${a}.type_wo,''))) <> ''
      OR UPPER(COALESCE(${a}.wo_number,'')) NOT LIKE 'PREV-%'
    )
    AND UPPER(COALESCE(${a}.job_title,'')) NOT LIKE 'PREVENTIVE %'
  )`;
}

function buildJobWhere(j: WoJob): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (j.statuses.length) {
    clauses.push(`wo.status IN (${j.statuses.map(() => '?').join(',')})`);
    params.push(...j.statuses);
  }
  if (j.excludePreventive) clauses.push(nonPreventiveFilterSql('wo'));
  if (j.excludeScheduleGenerated) {
    clauses.push(`(LOWER(TRIM(COALESCE(wo.auto_generate,''))) NOT IN ('yes','1','true') AND UPPER(TRIM(COALESCE(wo.job_requirement,''))) NOT LIKE 'AUTO FROM SCHEDULE:%')`);
  }
  for (const [field, value] of Object.entries(j.where)) {
    if (value === null || value === undefined || value === '') continue;
    clauses.push(`wo.\`${field}\` = ?`);
    params.push(value);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

interface PendingWoRow {
  module_key: string;
  module_label: string;
  wo_number: string;
  date: string | null;
  company: string;
  job_title: string;
  type_wo: string;
  status: string;
  asset_name: string;
  action_label: string;
  action_type: string;
}

async function fetchWoRows(j: WoJob): Promise<PendingWoRow[]> {
  const { sql, params } = buildJobWhere(j);
  const raw = await rows<Record<string, unknown>>(
    `SELECT wo.wo_number, wo.date, wo.company, wo.job_title, wo.status, wo.id_division, wo.type_wo, asset.AssetName
     FROM ${j.table} wo LEFT JOIN asset ON asset.AssetID = wo.id_equipment ${sql} ORDER BY wo.date DESC`,
    params,
  );
  return raw.map((row) => ({
    module_key: j.moduleKey,
    module_label: j.moduleLabel,
    wo_number: String(row.wo_number ?? ''),
    date: row.date ? String(row.date) : null,
    company: shortCompany(row.company),
    job_title: String(row.job_title ?? ''),
    type_wo: String(row.type_wo ?? ''),
    status: String(row.status ?? ''),
    asset_name: row.AssetName ? String(row.AssetName) : '-',
    action_label: j.actionLabel,
    action_type: j.actionLabel === 'Closed' ? 'close_wo' : j.actionLabel === 'Waiting Part' ? '' : 'approve_wo',
  }));
}

async function fetchWoCount(j: WoJob): Promise<number> {
  const { sql, params } = buildJobWhere(j);
  const row = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM ${j.table} wo ${sql}`, params);
  return Number(row?.total ?? 0);
}

function deduplicateApprovalItems<T extends { module_key?: string; wo_number?: string; action_type?: string }>(list: T[]): T[] {
  const unique = new Map<string, T>();
  const passthrough: T[] = [];
  for (const row of list) {
    const key = `${String(row.module_key ?? '').toLowerCase().trim()}|${String(row.wo_number ?? '').trim()}|${String(row.action_type ?? '').toLowerCase().trim()}`;
    if (key === '||') { passthrough.push(row); continue; }
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values(), ...passthrough];
}

function sortRowsDesc<T extends { date?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const left = a.date ? new Date(a.date).getTime() : new Date('1970-01-01').getTime();
    const right = b.date ? new Date(b.date).getTime() : new Date('1970-01-01').getTime();
    return right - left;
  });
}

export async function getPendingWoApprovals(user: User): Promise<PendingWoRow[]> {
  const jobs = approvalJobs(user);
  const lists = await Promise.all(jobs.map(fetchWoRows));
  return sortRowsDesc(deduplicateApprovalItems(lists.flat()));
}

export async function getPendingWoClosings(user: User): Promise<PendingWoRow[]> {
  const jobs = closingJobs(user);
  const lists = await Promise.all(jobs.map(fetchWoRows));
  return sortRowsDesc(deduplicateApprovalItems(lists.flat()));
}

export async function countPendingWoApprovals(user: User): Promise<number> {
  const jobs = approvalJobs(user);
  const counts = await Promise.all(jobs.map(fetchWoCount));
  return counts.reduce((a, b) => a + b, 0);
}

export async function countPendingWoClosings(user: User): Promise<number> {
  const jobs = closingJobs(user);
  const counts = await Promise.all(jobs.map(fetchWoCount));
  return counts.reduce((a, b) => a + b, 0);
}

export async function isPendingWoApproval(user: User, moduleKey: string, woNumber: string): Promise<boolean> {
  const list = await getPendingWoApprovals(user);
  return list.some((r) => r.module_key === moduleKey && r.wo_number === woNumber);
}

export async function isPendingWoClosing(user: User, moduleKey: string, woNumber: string): Promise<boolean> {
  const list = await getPendingWoClosings(user);
  return list.some((r) => r.module_key === moduleKey && r.wo_number === woNumber);
}

interface PendingMutationRow {
  doc_no: string;
  date: string | null;
  location_before: string;
  company_before: string;
  status: string;
  creator: string;
  action_label: string;
  action_type: string;
}

export async function getPendingAssetMutations(user: User): Promise<PendingMutationRow[]> {
  if (!isManagementUser(user) && Number(user.approval_asset_mutation ?? 0) !== 1) return [];
  const raw = await rows<Record<string, unknown>>(
    "SELECT doc_no, date, location_before, company_before, status, creator, created_at FROM asset_mutation_header WHERE status='NEED_APPROVED' ORDER BY created_at DESC",
  );
  return raw.map((row) => ({
    doc_no: String(row.doc_no ?? ''),
    date: row.date ? String(row.date) : null,
    location_before: String(row.location_before ?? ''),
    company_before: shortCompany(row.company_before),
    status: String(row.status ?? ''),
    creator: String(row.creator ?? ''),
    action_label: 'Approve',
    action_type: 'approve_mutation',
  }));
}

export async function countPendingAssetMutations(user: User): Promise<number> {
  if (!isManagementUser(user) && Number(user.approval_asset_mutation ?? 0) !== 1) return 0;
  const row = await one<{ total: number }>("SELECT COUNT(*) AS total FROM asset_mutation_header WHERE status='NEED_APPROVED'");
  return Number(row?.total ?? 0);
}

export async function isPendingAssetMutation(user: User, docNo: string): Promise<boolean> {
  const list = await getPendingAssetMutations(user);
  return list.some((r) => r.doc_no === docNo);
}

const MATERIAL_REQUEST_WO_TABLES: { table: string; moduleKey: string }[] = [
  { table: 'tb_wo_mtc_operational', moduleKey: 'wo_operational' },
  { table: 'tb_wo_mtc', moduleKey: 'wo_mtc' },
  { table: 'tb_wo_it', moduleKey: 'wo_it' },
  { table: 'tb_wo_ga', moduleKey: 'wo_ga' },
  { table: 'tb_wo_preventive', moduleKey: 'wo_preventive' },
];

async function materialRequestWoHeader(woNumber: string): Promise<Record<string, unknown>> {
  const wo = woNumber.trim();
  if (!wo) return {};
  for (const { table } of MATERIAL_REQUEST_WO_TABLES) {
    const row = await one<Record<string, unknown>>(`SELECT wo_number, company, job_title, type_wo, id_equipment FROM ${table} WHERE wo_number = ? LIMIT 1`, [wo]);
    if (!row) continue;
    const idEquipment = Number(row.id_equipment ?? 0);
    if (idEquipment > 0) {
      const asset = await one<{ AssetName: string }>('SELECT AssetName FROM asset WHERE AssetID = ? LIMIT 1', [idEquipment]);
      row.asset_name = asset?.AssetName ?? '-';
    }
    return row;
  }
  return {};
}

interface PendingMaterialRow {
  module_key: string;
  module_label: string;
  request_code: string;
  wo_number: string;
  date: string | null;
  company: string;
  job_title: string;
  type_wo: string;
  job_executor: string;
  requested_by_name: string;
  status: string;
  asset_name: string;
  action_label: string;
  action_type: string;
}

export async function getPendingMaterialRequests(user: User): Promise<PendingMaterialRow[]> {
  if (!isManagementUser(user) && Number(user.material_usage ?? 0) !== 1) return [];
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const raw = await rows<Record<string, unknown>>(
    `SELECT id, wo_number, job_executor, status, requested_by_name, request_note, created_at
     FROM tb_material_part_request
     WHERE status='PENDING' AND (selected_at IS NULL OR TRIM(selected_at)='') AND (selected_by IS NULL OR selected_by=0)
       AND created_at >= ?
     ORDER BY created_at DESC`,
    [currentYearStart],
  );
  const out: PendingMaterialRow[] = [];
  for (const row of raw) {
    const wo = await materialRequestWoHeader(String(row.wo_number ?? ''));
    const moduleKey = classifyWoNumberModule(String(row.wo_number ?? ''));
    out.push({
      module_key: moduleKey || 'material_usage',
      module_label: moduleKey ? MODULE_LABELS[moduleKey] : 'Material Request',
      request_code: `Request #${Number(row.id ?? 0)}`,
      wo_number: String(row.wo_number ?? ''),
      date: row.created_at ? String(row.created_at) : null,
      company: shortCompany(wo.company ?? ''),
      job_title: String(wo.job_title ?? row.request_note ?? 'Permintaan part'),
      type_wo: String(wo.type_wo ?? ''),
      job_executor: String(row.job_executor ?? ''),
      requested_by_name: String(row.requested_by_name ?? ''),
      status: 'PENDING',
      asset_name: String(wo.asset_name ?? '-'),
      action_label: 'Waiting Part',
      action_type: '',
    });
  }
  return out;
}

export async function countPendingMaterialRequests(user: User): Promise<number> {
  return (await getPendingMaterialRequests(user)).length;
}

export async function getCategoryCounts(user: User): Promise<Record<'MTC' | 'MESO' | 'IS' | 'GA' | 'PRO', number>> {
  const counts = { MTC: 0, MESO: 0, IS: 0, GA: 0, PRO: 0 };
  const moduleToCat: Record<string, keyof typeof counts> = { wo_operational: 'MTC', wo_mtc: 'MESO', wo_it: 'IS', wo_ga: 'GA', wo_preventive: 'PRO' };

  const jobs = [...approvalJobs(user), ...closingJobs(user)];
  const jobCounts = await Promise.all(jobs.map(fetchWoCount));
  jobs.forEach((j, i) => {
    const cat = moduleToCat[j.moduleKey];
    if (cat) counts[cat] += jobCounts[i];
  });

  if (Number(user.material_usage ?? 0) === 1 || isManagementUser(user)) {
    for (const row of await getPendingMaterialRequests(user)) {
      const cat = moduleToCat[row.module_key];
      if (cat) counts[cat]++;
    }
  }

  return counts;
}

export async function isFinalWorkOrder(moduleKey: string, woNumber: string): Promise<boolean> {
  const cfg = MODULE_MAP[moduleKey];
  if (!cfg) return false;
  const row = await one<{ status: string }>(`SELECT status FROM ${cfg.table} WHERE wo_number=? LIMIT 1`, [woNumber]);
  if (!row) return true;
  return ['CLOSED', 'VOID', 'REJECT', 'REJECTED', 'DECLINE', 'DECLINED'].includes(String(row.status ?? '').toUpperCase().trim());
}

export const MODULE_MAP: Record<string, { table: string; approvalTable: string }> = {
  meso: { table: 'tb_wo_mtc', approvalTable: 'tb_approval' },
  wo_mtc: { table: 'tb_wo_mtc', approvalTable: 'tb_approval' },
  maintenance: { table: 'tb_wo_mtc_operational', approvalTable: 'tb_approval_operational' },
  wo_operational: { table: 'tb_wo_mtc_operational', approvalTable: 'tb_approval_operational' },
  production: { table: 'tb_wo_preventive', approvalTable: 'tb_approval_preventive' },
  wo_preventive: { table: 'tb_wo_preventive', approvalTable: 'tb_approval_preventive' },
  is: { table: 'tb_wo_it', approvalTable: 'tb_approval_it' },
  wo_it: { table: 'tb_wo_it', approvalTable: 'tb_approval_it' },
  ga: { table: 'tb_wo_ga', approvalTable: 'tb_approval_ga' },
  wo_ga: { table: 'tb_wo_ga', approvalTable: 'tb_approval_ga' },
};

interface Person { fullname: string; avatar: string; id_division: unknown; id_position: string; division_code: string }

function personPayload(user: User): Person {
  return {
    fullname: String(user.fullname ?? ''),
    avatar: String(user.avatar ?? 'avatar.png'),
    id_division: user.id_division,
    id_position: String(user.id_position ?? ''),
    division_code: String(user.division_code ?? ''),
  };
}

async function insertApproval(approvalTable: string, woNumber: string, person: Person, comment: string): Promise<void> {
  await execute(`INSERT INTO ${approvalTable} (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
    [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
}

async function divisionCodeOf(idDivision: unknown): Promise<string> {
  const row = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [idDivision]);
  return row?.division_code ?? '';
}

export async function approveWo(moduleKey: string, woNumber: string, user: User, comment: string): Promise<void> {
  const cfg = MODULE_MAP[moduleKey];
  if (!cfg) throw new HttpError(422, 'Unknown WO module', 'APPROVAL_MODULE_UNKNOWN');
  const header = await one<Record<string, unknown>>(`SELECT * FROM ${cfg.table} WHERE wo_number=?`, [woNumber]);
  if (!header) throw new HttpError(404, 'Work Order not found');
  const person = personPayload(user);
  const position = person.id_position.toUpperCase();

  let targetStatus: string;
  let pic: string | null = null;

  if (moduleKey === 'meso' || moduleKey === 'wo_mtc') {
    if (position === 'DIVHEAD') { targetStatus = 'WAIT_KA_DEPT_MESO'; pic = 'MESO'; }
    else if (position === 'DEPTHEAD') { targetStatus = 'WAIT_EXECUTOR_ADMIN'; pic = String(header.job_executor ?? ''); }
    else if (position === 'EXECUTOR_ADMIN') { targetStatus = 'COMPLETE_EXECUTOR'; pic = await divisionCodeOf(header.id_division); }
    else throw new HttpError(500, 'Failed to approve WO MTC');
  } else if (moduleKey === 'maintenance' || moduleKey === 'wo_operational') {
    const callerIsMtc = person.division_code.toUpperCase() === 'MTC';
    if (position === 'DIVHEAD' && callerIsMtc) { targetStatus = 'WAIT_EXECUTOR_ADMIN'; pic = String(header.job_executor ?? 'MTC'); }
    else if (position === 'DIVHEAD') { targetStatus = 'WAIT_KA_DIV_MTC'; pic = 'MTC'; }
    else if (position === 'ADMIN_DIVISI' && callerIsMtc) { targetStatus = 'COMPLETE_EXECUTOR'; pic = (await divisionCodeOf(header.id_division)) || '-'; }
    else if (position === 'ADMIN_DIVISI') { targetStatus = 'CLOSED'; pic = '-'; }
    else { targetStatus = 'COMPLETE_EXECUTOR'; pic = (await divisionCodeOf(header.id_division)) || '-'; }
  } else if (moduleKey === 'is' || moduleKey === 'wo_it') {
    const callerIsIts = person.division_code.toUpperCase() === 'ITS';
    if (position === 'DIVHEAD' && callerIsIts) { targetStatus = 'WAIT_EXECUTOR_ADMIN'; pic = String(header.job_executor ?? 'ITS'); }
    else if (position === 'DIVHEAD') {
      if (!['NEED_CLOSED', 'COMPLETE_EXECUTOR'].includes(String(header.status))) throw new HttpError(409, 'Work Order belum siap untuk ditutup');
      targetStatus = 'CLOSED'; pic = '-';
    } else if (position === 'ADMIN_DIVISI' && callerIsIts) { targetStatus = 'COMPLETE_EXECUTOR'; pic = await divisionCodeOf(header.id_division); }
    else if (position === 'ADMIN_DIVISI') { targetStatus = 'NEED_CLOSED'; pic = await divisionCodeOf(header.id_division); }
    else throw new HttpError(500, 'Failed to approve WO');
  } else if (moduleKey === 'ga' || moduleKey === 'wo_ga') {
    const callerIsHrga = person.division_code.toUpperCase() === 'HRGA';
    if (position === 'DIVHEAD' && callerIsHrga) { targetStatus = 'WAIT_EXECUTOR_ADMIN'; pic = String(header.job_executor ?? 'HRGA'); }
    else if (position === 'DIVHEAD') {
      if (!['NEED_CLOSED', 'COMPLETE_EXECUTOR'].includes(String(header.status))) throw new HttpError(409, 'Work Order belum siap untuk ditutup');
      targetStatus = 'CLOSED'; pic = '-';
    } else if (position === 'ADMIN_DIVISI' && callerIsHrga) { targetStatus = 'COMPLETE_EXECUTOR'; pic = await divisionCodeOf(header.id_division); }
    else if (position === 'ADMIN_DIVISI') { targetStatus = 'NEED_CLOSED'; pic = await divisionCodeOf(header.id_division); }
    else throw new HttpError(500, 'Failed to approve WO');
  } else {
    if (position === 'DIVHEAD') {
      if (!['NEED_CLOSED', 'WAIT_KA_DIV'].includes(String(header.status))) throw new HttpError(409, 'Work Order belum siap untuk ditutup');
      targetStatus = 'CLOSED';
    } else if (position === 'ADMIN_DIVISI') {
      targetStatus = 'WAIT_KA_DIV';
    } else throw new HttpError(500, 'Failed to approve WO');
  }

  await transaction(async (connection) => {
    await connection.execute(`INSERT INTO ${cfg.approvalTable} (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment] as never);
    if (targetStatus === 'CLOSED') {
      await connection.execute(`UPDATE ${cfg.table} SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?`, [woNumber]);
    } else if (pic !== null) {
      await connection.execute(`UPDATE ${cfg.table} SET status=?, pic=?, updated_at=NOW() WHERE wo_number=?`, [targetStatus, pic, woNumber] as never);
    } else {
      await connection.execute(`UPDATE ${cfg.table} SET status=?, updated_at=NOW() WHERE wo_number=?`, [targetStatus, woNumber] as never);
    }
  });
}

export async function rejectWo(moduleKey: string, woNumber: string, user: User, comment: string): Promise<void> {
  const cfg = MODULE_MAP[moduleKey];
  if (!cfg) throw new HttpError(422, 'Unknown WO module', 'APPROVAL_MODULE_UNKNOWN');
  const person = personPayload(user);
  await transaction(async (connection) => {
    await connection.execute(`INSERT INTO ${cfg.approvalTable} (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment] as never);
    await connection.execute(`UPDATE ${cfg.table} SET status='REJECT' WHERE wo_number=?`, [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
  });
}

export async function closeWo(moduleKey: string, woNumber: string, user: User, comment: string): Promise<void> {
  const cfg = MODULE_MAP[moduleKey];
  if (!cfg) throw new HttpError(422, 'Unknown WO module', 'APPROVAL_MODULE_UNKNOWN');
  const person = personPayload(user);
  await transaction(async (connection) => {
    await connection.execute(`INSERT INTO ${cfg.approvalTable} (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment] as never);
    await connection.execute(`UPDATE ${cfg.table} SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?`, [woNumber]);
  });
}

export async function voidWo(moduleKey: string, woNumber: string, user: User, reason: string): Promise<void> {
  const cfg = MODULE_MAP[moduleKey];
  if (!cfg) throw new HttpError(422, 'Unknown WO module', 'APPROVAL_MODULE_UNKNOWN');
  const person = personPayload(user);
  await transaction(async (connection) => {
    await connection.execute(`UPDATE ${cfg.table} SET status='VOID', reason=?, pic='-', updated_at=NOW() WHERE wo_number=?`, [reason, woNumber] as never);
    await connection.execute(`INSERT INTO ${cfg.approvalTable} (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, reason] as never);
  });
}

export async function approveMutation(docNo: string, user: User): Promise<void> {
  const person = personPayload(user);
  await transaction(async (connection) => {
    const [detailRows] = await connection.execute('SELECT * FROM asset_mutation_detail WHERE doc_no=?', [docNo]);
    for (const detail of detailRows as Record<string, unknown>[]) {
      await connection.execute('UPDATE asset SET CompanyName=?, LocationAsset=? WHERE AssetID=?',
        [detail.company_after, detail.location_after, detail.AssetID] as never);
    }
    await connection.execute("UPDATE asset_mutation_header SET status='APPROVED' WHERE doc_no=?", [docNo]);
    await connection.execute('INSERT INTO approval_asset_mutation (doc_no, fullname, id_division, id_position, approved_at) VALUES (?,?,?,?,NOW())',
      [docNo, person.fullname, person.id_division, person.id_position] as never);
  });
}

let mutationRejectEnumEnsured = false;
async function ensureMutationRejectEnum(): Promise<void> {
  if (mutationRejectEnumEnsured) return;
  await execute("ALTER TABLE asset_mutation_header MODIFY status ENUM('NEED_APPROVED','APPROVED','REJECT')").catch(() => undefined);
  mutationRejectEnumEnsured = true;
}

export async function rejectMutation(docNo: string): Promise<void> {
  await ensureMutationRejectEnum();
  await execute("UPDATE asset_mutation_header SET status='REJECT' WHERE doc_no=?", [docNo]);
}
