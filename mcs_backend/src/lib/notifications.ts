import { one, rows } from '../db.js';
import type { User } from '../types.js';

const MESO_FAMILY_DIVISIONS = [1, 16003, 16004, 16005, 16006];

function isMesoFamily(idDivision: unknown): boolean {
  const id = Number(idDivision);
  return id === 15 || MESO_FAMILY_DIVISIONS.includes(id);
}

interface WoRow extends Record<string, unknown> {
  wo_number: string;
  date: string;
}

function positionScopeClause(idPosition: string, idDivision: unknown, divisionCode: string, table: string): { sql: string; params: unknown[] } {
  const pos = idPosition;
  if (pos === 'EXECUTOR_ADMIN' || pos === 'EXECUTOR_HEAD') {
    if (divisionCode !== '') return { sql: ' AND wo.job_executor LIKE ?', params: [`%${divisionCode}%`] };
    return { sql: '', params: [] };
  }
  if (pos === 'ADMIN_DIVISI') {
    return { sql: ' AND wo.id_division = ?', params: [idDivision] };
  }
  if (pos === 'DIVHEAD' || pos === 'DEPTHEAD') {
    if (Number(idDivision) === 1 && table === 'tb_wo_mtc') {
      return { sql: ` AND wo.id_division IN (${MESO_FAMILY_DIVISIONS.map(() => '?').join(',')})`, params: [...MESO_FAMILY_DIVISIONS] };
    }
    if (divisionCode !== '') {
      return { sql: ' AND (wo.job_executor LIKE ? OR wo.id_division = ?)', params: [`%${divisionCode}%`, idDivision] };
    }
    return { sql: ' AND wo.id_division = ?', params: [idDivision] };
  }
  return { sql: '', params: [] };
}

async function fetchMtcFamilyRows(table: string, statuses: string[], idDivision: unknown, divisionCode: string, idPosition: string): Promise<WoRow[]> {
  const scope = positionScopeClause(idPosition, idDivision, divisionCode, table);
  const sql = `SELECT wo.wo_number, wo.date, wo.job_title, wo.company, wo.status, wo.pic, wo.job_executor, wo.type_wo,
      asset.AssetName, asset.AssetID, asset.AssetCode, tb_division.division_name, tb_division.division_code
    FROM \`${table}\` wo
    LEFT JOIN tb_division ON tb_division.id_division = wo.id_division
    LEFT JOIN asset ON asset.AssetID = wo.id_equipment
    WHERE wo.status IN (${statuses.map(() => '?').join(',')})${scope.sql}
    ORDER BY wo.date DESC`;
  return rows<WoRow>(sql, [...statuses, ...scope.params]);
}

function dedupSortSlice(tableRows: WoRow[], limit: number, countOnly: boolean): WoRow[] | number {
  const deduped = new Map<string, WoRow>();
  for (const row of tableRows) {
    const wo = String(row.wo_number ?? '');
    if (!wo) continue;
    deduped.set(wo, row);
  }
  let result = [...deduped.values()];
  result.sort((a, b) => {
    const da = new Date(String(a.date ?? '1970-01-01')).getTime();
    const db = new Date(String(b.date ?? '1970-01-01')).getTime();
    return db - da;
  });
  if (countOnly) return result.length;
  if (limit > 0) result = result.slice(0, limit);
  return result;
}

async function getMtcFamilyWo(statuses: string[], idDivision: unknown, divisionCode: string, idPosition: string, limit: number, countOnly: boolean): Promise<WoRow[] | number> {
  const mtcRows = await fetchMtcFamilyRows('tb_wo_mtc', statuses, idDivision, divisionCode, idPosition);
  const preventiveRows = await fetchMtcFamilyRows('tb_wo_preventive', statuses, idDivision, divisionCode, idPosition);
  return dedupSortSlice([...mtcRows, ...preventiveRows], limit, countOnly);
}

async function getSingleTableWo(table: string, statuses: string[], idDivision: unknown, divisionCode: string, idPosition: string, limit: number, countOnly: boolean): Promise<WoRow[] | number> {
  const scope = positionScopeClause(idPosition, idDivision, divisionCode, table);
  const where = `wo.status IN (${statuses.map(() => '?').join(',')})${scope.sql}`;
  const params = [...statuses, ...scope.params];

  if (countOnly) {
    const row = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM \`${table}\` wo WHERE ${where}`, params);
    return Number(row?.total ?? 0);
  }
  const limitSql = limit > 0 ? ' LIMIT ?' : '';
  const finalParams = limit > 0 ? [...params, limit] : params;
  return rows<WoRow>(
    `SELECT wo.wo_number, wo.date, wo.job_title, wo.company, wo.status, wo.pic, wo.job_executor, wo.type_wo,
        asset.AssetName, asset.AssetID, tb_division.division_name, tb_division.division_code
      FROM \`${table}\` wo
      LEFT JOIN tb_division ON tb_division.id_division = wo.id_division
      LEFT JOIN asset ON asset.AssetID = wo.id_equipment
      WHERE ${where} ORDER BY wo.date DESC${limitSql}`,
    finalParams,
  );
}

const PENDING_STATUSES_MTC = ['WAIT_KA_DIV', 'WAIT_KA_DEPT_MESO', 'WAIT_EXECUTOR_ADMIN'];
const IN_PROGRESS_STATUSES = ['IN_PROGRESS_EXECUTOR', 'PARTS_RECEIVED', 'WAITING_PARTS', 'COMPLETE_EXECUTOR', 'NEED_CLOSED'];
const PENDING_STATUSES_SINGLE = ['WAIT_EXECUTOR_ADMIN'];

export async function getNotificationSummary(user: User): Promise<Record<string, unknown>> {
  const idDivision = user.id_division;
  const divisionCode = String(user.division_code ?? '').trim();
  const idPosition = String(user.id_position ?? '');
  const useMtc = isMesoFamily(idDivision);

  let preventiveWo: WoRow[];
  let inProgressWo: WoRow[];
  let totalPreventive: number;
  let totalInProgress: number;

  if (useMtc) {
    preventiveWo = await getMtcFamilyWo(PENDING_STATUSES_MTC, idDivision, divisionCode, idPosition, 10, false) as WoRow[];
    inProgressWo = await getMtcFamilyWo(IN_PROGRESS_STATUSES, idDivision, divisionCode, idPosition, 10, false) as WoRow[];
    totalPreventive = await getMtcFamilyWo(PENDING_STATUSES_MTC, idDivision, divisionCode, idPosition, 0, true) as number;
    totalInProgress = await getMtcFamilyWo(IN_PROGRESS_STATUSES, idDivision, divisionCode, idPosition, 0, true) as number;
  } else {
    preventiveWo = await getSingleTableWo('tb_wo_preventive', PENDING_STATUSES_SINGLE, idDivision, divisionCode, idPosition, 10, false) as WoRow[];
    inProgressWo = await getSingleTableWo('tb_wo_preventive', IN_PROGRESS_STATUSES, idDivision, divisionCode, idPosition, 10, false) as WoRow[];
    totalPreventive = await getSingleTableWo('tb_wo_preventive', PENDING_STATUSES_SINGLE, idDivision, divisionCode, idPosition, 0, true) as number;
    totalInProgress = await getSingleTableWo('tb_wo_preventive', IN_PROGRESS_STATUSES, idDivision, divisionCode, idPosition, 0, true) as number;
  }

  return {
    total_notifications: totalPreventive + totalInProgress,
    preventive_wo: preventiveWo,
    in_progress_wo: inProgressWo,
    summary: { total_preventive: totalPreventive, total_in_progress: totalInProgress },
    debug: { division_code: divisionCode, id_division: idDivision, id_position: idPosition, source_table: useMtc ? 'tb_wo_mtc' : 'tb_wo_preventive' },
  };
}

export async function getNotificationDetail(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>(
    `SELECT wo.*, tb_division.division_name, tb_division.division_code
     FROM tb_wo_preventive wo
     LEFT JOIN tb_division ON tb_division.id_division = wo.id_division
     WHERE wo.wo_number = ?`,
    [woNumber],
  );
}
