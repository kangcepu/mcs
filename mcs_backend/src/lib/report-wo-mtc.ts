import { one, rows } from '../db.js';

export type WoDomain = 'meso' | 'is' | 'operational' | 'preventive' | 'ga';

export interface DomainConfig {
  table: string;
  approvalTable: string;
  executePosition: string;
  closedPosition: string;
  label: string;
  hasJobExecutorFilter: boolean;
}

export const DOMAINS: Record<WoDomain, DomainConfig> = {
  meso: { table: 'tb_wo_mtc', approvalTable: 'tb_approval', executePosition: 'EXECUTOR_ADMIN', closedPosition: 'DIVHEAD', label: 'MESO', hasJobExecutorFilter: true },
  is: { table: 'tb_wo_it', approvalTable: 'tb_approval_it', executePosition: 'ADMIN_DIVISI', closedPosition: 'DIVHEAD', label: 'IT', hasJobExecutorFilter: false },
  operational: { table: 'tb_wo_mtc_operational', approvalTable: 'tb_approval_operational', executePosition: 'ADMIN_DIVISI', closedPosition: 'DIVHEAD', label: 'OPERATIONAL', hasJobExecutorFilter: false },
  preventive: { table: 'tb_wo_preventive', approvalTable: 'tb_approval_preventive', executePosition: 'ADMIN_DIVISI', closedPosition: 'DIVHEAD', label: 'PRODUKSI', hasJobExecutorFilter: true },
  ga: { table: 'tb_wo_ga', approvalTable: 'tb_approval_ga', executePosition: 'ADMIN_DIVISI', closedPosition: 'DIVHEAD', label: 'GA', hasJobExecutorFilter: false },
};

const TYPE_WO_ALIASES: Record<string, string[]> = {
  PREVENTIVE: ['preventive', 'PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'],
  CORRECTIVE: ['corrective', 'CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'],
  BREAKDOWN: ['breakdown', 'BREAKDOWN', 'BM'],
  PROJECT: ['project', 'PROJECT'],
};

const EXECUTOR_ALIASES: Record<string, string[]> = {
  MKL: ['MKL', 'MEC', 'MEKANIK', 'MEKANIKAL', 'MECHANICAL'],
  ELC: ['ELC', 'ELEKTRIK', 'ELEKTRIKAL', 'ELECTR', 'ELECTRICAL'],
  SPL: ['SPL', 'CVL', 'SIPIL', 'CIVIL'],
  OTO: ['OTO', 'OTOMOT', 'OTOMOTIF', 'AUTOMOT', 'AUTOMOTIVE'],
  EKS: ['EKS', 'EKSTERNAL', 'EXTERNAL'],
};

const DISCIPLINE_CODES = ['MKL', 'ELC', 'SPL', 'OTO', 'EKS', 'MEC', 'CVL'];

export interface ReportFilters {
  company?: string;
  idDivision?: number;
  typeWo?: string;
  jobExecutor?: string;
  startDate?: string;
  endDate?: string;
}

async function mtcExecutorDisciplineFromDivision(idDivision: number): Promise<string | null> {
  const division = await one<{ division_code: string | null; division_name: string | null }>(
    'SELECT division_code, division_name FROM tb_division WHERE id_division = ?', [idDivision],
  );
  if (!division) return null;
  const code = String(division.division_code ?? '').toUpperCase();
  const name = String(division.division_name ?? '').toUpperCase();
  if (DISCIPLINE_CODES.includes(code)) return code === 'MEC' ? 'MKL' : code === 'CVL' ? 'SPL' : code;
  if (/MEKANIK/.test(name)) return 'MKL';
  if (/ELEKTR/.test(name)) return 'ELC';
  if (/SIPIL|CIVIL/.test(name)) return 'SPL';
  if (/OTOMOT|AUTOMOT/.test(name)) return 'OTO';
  if (/EKSTERN|EXTERNAL/.test(name)) return 'EKS';
  return null;
}

async function operationalShouldSkipDivision(idDivision: number): Promise<boolean> {
  const division = await one<{ division_code: string | null; division_name: string | null }>(
    'SELECT division_code, division_name FROM tb_division WHERE id_division = ?', [idDivision],
  );
  if (!division) return false;
  return String(division.division_code ?? '').toUpperCase() === 'MTC' || String(division.division_name ?? '').toUpperCase() === 'MAINTENANCE';
}

export async function buildWhere(domain: WoDomain, filters: ReportFilters): Promise<{ where: string; params: unknown[] }> {
  const cfg = DOMAINS[domain];
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  let effectiveExecutor = filters.jobExecutor?.trim();

  if (filters.idDivision) {
    let skipDivision = false;
    if (domain === 'meso') {
      const discipline = await mtcExecutorDisciplineFromDivision(filters.idDivision);
      if (discipline) {
        skipDivision = true;
        if (!effectiveExecutor) effectiveExecutor = discipline;
      }
    } else if (domain === 'operational') {
      skipDivision = await operationalShouldSkipDivision(filters.idDivision);
    }
    if (!skipDivision) { where.push('wo.id_division = ?'); params.push(filters.idDivision); }
  }

  if (filters.startDate && filters.endDate) {
    where.push('wo.date >= ? AND wo.date <= ?');
    params.push(filters.startDate, filters.endDate);
  }

  if (filters.typeWo) {
    const aliases = TYPE_WO_ALIASES[filters.typeWo.toUpperCase()];
    if (aliases) { where.push(`wo.type_wo IN (${aliases.map(() => '?').join(',')})`); params.push(...aliases); }
    else { where.push('wo.type_wo = ?'); params.push(filters.typeWo); }
  }

  if (filters.company) { where.push('wo.company = ?'); params.push(filters.company); }

  if (effectiveExecutor && cfg.hasJobExecutorFilter) {
    if (domain === 'meso') {
      const aliases = EXECUTOR_ALIASES[effectiveExecutor.toUpperCase()] ?? [effectiveExecutor];
      const clauses = aliases.map(() => '(wo.job_executor LIKE ? OR je.job_executor LIKE ?)').join(' OR ');
      where.push(`(${clauses})`);
      for (const a of aliases) params.push(`%${a}%`, `%${a}%`);
    } else {
      where.push('wo.job_executor = ?');
      params.push(effectiveExecutor);
    }
  }

  return { where: where.join(' AND '), params };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchApprovalCheckpoints(table: string, woNumbers: string[], position: string): Promise<{ wo_number: string; created_at: string }[]> {
  const batches = await Promise.all(
    chunk(woNumbers, 500).map((batch) =>
      rows<{ wo_number: string; created_at: string }>(
        `SELECT wo_number, MAX(created_at) AS created_at FROM ${table} WHERE wo_number IN (${batch.map(() => '?').join(',')}) AND id_position = ? GROUP BY wo_number`,
        [...batch, position],
      ),
    ),
  );
  return batches.flat();
}

async function fetchAssetNames(equipmentIds: number[]): Promise<{ AssetID: number; AssetName: string }[]> {
  const batches = await Promise.all(
    chunk(equipmentIds, 1000).map((batch) =>
      rows<{ AssetID: number; AssetName: string }>(`SELECT AssetID, AssetName FROM asset WHERE AssetID IN (${batch.map(() => '?').join(',')})`, batch),
    ),
  );
  return batches.flat();
}

export async function fetchWoRows(domain: WoDomain, filters: ReportFilters): Promise<Record<string, unknown>[]> {
  const cfg = DOMAINS[domain];
  const { where, params } = await buildWhere(domain, filters);
  const joinExecutor = domain === 'meso' ? 'LEFT JOIN tb_job_executor je ON je.wo_number = wo.wo_number' : '';
  const list = await rows<Record<string, unknown>>(
    `SELECT wo.wo_number, wo.type_wo, wo.job_title, wo.status, wo.date, wo.created_at, wo.company, wo.id_division, wo.id_equipment, wo.job_executor
     FROM ${cfg.table} wo ${joinExecutor}
     WHERE ${where}
     GROUP BY wo.wo_number
     ORDER BY wo.created_at DESC`,
    params,
  );
  if (!list.length) return list;

  const woNumbers = list.map((r) => String(r.wo_number));
  const equipmentIds = [...new Set(list.map((r) => Number(r.id_equipment)).filter((n) => Number.isFinite(n) && n > 0))];

  const [executes, closes, assets] = await Promise.all([
    fetchApprovalCheckpoints(cfg.approvalTable, woNumbers, cfg.executePosition),
    fetchApprovalCheckpoints(cfg.approvalTable, woNumbers, cfg.closedPosition),
    fetchAssetNames(equipmentIds),
  ]);

  const executeMap = new Map(executes.map((e) => [e.wo_number, e.created_at]));
  const closeMap = new Map(closes.map((c) => [c.wo_number, c.created_at]));
  const assetMap = new Map(assets.map((a) => [a.AssetID, a.AssetName]));

  return list.map((wo) => {
    const woNumber = String(wo.wo_number);
    const createdAt = wo.created_at ? new Date(String(wo.created_at)) : null;
    const executeAt = executeMap.get(woNumber) ?? null;
    const closedAt = closeMap.get(woNumber) ?? null;
    const executeDays = createdAt && executeAt ? Math.round((new Date(executeAt).getTime() - createdAt.getTime()) / 86400000) : null;
    const closedDays = createdAt && closedAt ? Math.round((new Date(closedAt).getTime() - createdAt.getTime()) / 86400000) : null;
    return {
      wo_number: woNumber,
      type_wo: wo.type_wo,
      job_title: wo.job_title,
      status: wo.status,
      date: wo.date,
      created_at: wo.created_at,
      company: wo.company,
      asset_name: assetMap.get(Number(wo.id_equipment)) ?? null,
      executor: wo.job_executor,
      execute_at: executeAt,
      closed_at: closedAt,
      execute_days: executeDays,
      closed_days: closedDays,
    };
  });
}

async function countByStatus(domain: WoDomain, filters: ReportFilters, statuses: string[]): Promise<number> {
  const cfg = DOMAINS[domain];
  const { where, params } = await buildWhere(domain, filters);
  const row = await one<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${cfg.table} wo WHERE ${where} AND wo.status IN (${statuses.map(() => '?').join(',')})`,
    [...params, ...statuses],
  );
  return Number(row?.total ?? 0);
}

async function countByExecutorStatus(domain: WoDomain, filters: ReportFilters, status: string): Promise<number> {
  const cfg = DOMAINS[domain];
  const { where, params } = await buildWhere(domain, filters);
  const row = await one<{ total: number }>(
    `SELECT COUNT(DISTINCT wo.wo_number) AS total FROM ${cfg.table} wo
     JOIN tb_job_executor je ON je.wo_number = wo.wo_number AND je.status = ?
     WHERE ${where}`,
    [status, ...params],
  );
  return Number(row?.total ?? 0);
}

export async function fetchSummary(domain: WoDomain, filters: ReportFilters): Promise<{ total: number; waiting: number; in_progress: number; complete: number }> {
  const cfg = DOMAINS[domain];
  const { where, params } = await buildWhere(domain, filters);
  const totalRow = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM ${cfg.table} wo WHERE ${where}`, params);
  const total = Number(totalRow?.total ?? 0);

  if (domain === 'meso') {
    const [waiting, in_progress, complete] = await Promise.all([
      countByStatus(domain, filters, ['WAIT_KA_DEPT_MESO', 'WAIT_EXECUTOR_ADMIN']),
      countByStatus(domain, filters, ['IN_PROGRESS_EXECUTOR', 'WAITING_PARTS', 'PARTS_RECEIVED', 'NEED_CLOSED', 'COMPLETE_EXECUTOR']),
      countByStatus(domain, filters, ['CLOSED']),
    ]);
    return { total, waiting, in_progress, complete };
  }

  if (domain === 'preventive' || domain === 'ga') {
    const [waiting, in_progress, complete] = await Promise.all([
      countByExecutorStatus(domain, filters, 'WAITING'),
      countByExecutorStatus(domain, filters, 'IN_PROGRESS'),
      countByStatus(domain, filters, ['CLOSED']),
    ]);
    return { total, waiting, in_progress, complete };
  }

  const [waiting, in_progress, complete] = await Promise.all([
    countByExecutorStatus(domain, filters, 'WAITING'),
    countByExecutorStatus(domain, filters, 'IN_PROGRESS'),
    countByExecutorStatus(domain, filters, 'COMPLETE'),
  ]);
  return { total, waiting, in_progress, complete };
}

export function formatPercentage(count: number, total: number): string {
  return total <= 0 ? '0.00%' : `${((count / total) * 100).toFixed(2)}%`;
}
