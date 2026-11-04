import { rows } from '../db.js';
import { getStockOpnameReport } from './stock-opname-proxy.js';
import type { User } from '../types.js';

const DOMAIN_TABLES: Record<string, string> = {
  meso: 'tb_wo_mtc',
  maintenance: 'tb_wo_mtc_operational',
  is: 'tb_wo_it',
  ga: 'tb_wo_ga',
  production: 'tb_wo_preventive',
};
const MODULE_LABELS: Record<string, string> = {
  meso: 'MESO', maintenance: 'Maintenance', is: 'IS', ga: 'GA', production: 'Production',
};
// WO yang sudah final — jangan ikut nongol di "belum dikerjakan".
const FINAL_WO_STATUSES = new Set(['CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'COMPLETE EXECUTOR', 'NEED_CLOSED', 'VOID', 'DECLINE', 'REJECT']);
// Status "menunggu approval" per modul (sama kayak approvalJobs() di
// approval-center.ts) — ini sudah kecover di kategori "Approve WO", jangan
// dobel tampil di "belum dikerjakan".
const APPROVAL_PENDING_STATUSES: Record<string, string[]> = {
  meso: ['WAIT_KA_DIV', 'WAIT_KA_DEPT_MESO', 'FROM_MAINTENANCE', 'WAIT_PLANNER_ADMIN', 'WAIT_PLANNER_HEAD'],
  maintenance: ['WAIT_KA_DIV', 'WAIT_KA_DIV_MTC'],
  is: ['WAIT_KA_DIV', 'WAIT_KA_DIV_ITIS'],
  ga: ['WAIT_KA_DIV', 'WAIT_KA_DIV_HRGA'],
  production: ['WAIT_KA_DIV', 'WAIT_KA_DIV_MTC'],
};

export interface WoTodoRow {
  module: string;
  module_label: string;
  wo_number: string;
  job_title: string;
  status: string;
  date: string | null;
  asset_name: string;
}

/**
 * "WO belum dikerjakan" — WO yang di-assign ke divisi user ini (job_executor
 * di WO-nya sendiri, BUKAN status tb_job_executor — WO preventive auto-
 * generate langsung mulai berstatus IN_PROGRESS_EXECUTOR di tb_job_executor
 * walau checklist-nya belum disentuh siapapun, jadi filter `status=WAITING`
 * yang dipakai sebelumnya selalu kosong buat preventive), yang statusnya
 * bukan final DAN bukan lagi nunggu approval (itu kecover di "Approve WO").
 * Sengaja cuma EXECUTOR_ADMIN/HEAD — ADMIN_DIVISI/DIVHEAD/DEPTHEAD urusannya
 * udah kecover di WO Approval/Closing.
 */
export async function getWoTodo(user: User): Promise<WoTodoRow[]> {
  const position = String(user.id_position ?? '').toUpperCase();
  if (position !== 'EXECUTOR_ADMIN' && position !== 'EXECUTOR_HEAD') return [];
  const divCode = String(user.division_code ?? '').trim();
  if (!divCode) return [];

  const results = await Promise.all(
    Object.entries(DOMAIN_TABLES).map(async ([module, table]) => {
      const excluded = [...FINAL_WO_STATUSES, ...(APPROVAL_PENDING_STATUSES[module] ?? [])];
      const placeholders = excluded.map(() => '?').join(',');
      const data = await rows<Record<string, unknown>>(
        `SELECT '${module}' AS module, w.wo_number, w.job_title, w.status, w.date, a.AssetName AS asset_name
         FROM \`${table}\` w
         LEFT JOIN asset a ON a.AssetID = w.id_equipment
         WHERE w.job_executor LIKE ?
           AND UPPER(TRIM(w.status)) NOT IN (${placeholders})
         ORDER BY w.date DESC LIMIT 50`,
        [`%${divCode}%`, ...excluded],
      );
      return data;
    }),
  );

  return results
    .flat()
    .map((r) => ({
      module: String(r.module),
      module_label: MODULE_LABELS[String(r.module)] ?? String(r.module),
      wo_number: String(r.wo_number ?? ''),
      job_title: String(r.job_title ?? ''),
      status: String(r.status ?? ''),
      date: r.date ? String(r.date) : null,
      asset_name: String(r.asset_name ?? ''),
    }))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

export interface UnlockedSoRow {
  no_so: string;
  type: string;
  tanggal: string;
}

/**
 * "Stock Opname belum dikunci" — gak ada konsep divisi/executor di Stock
 * Opname (itu proxy ke service terpisah), jadi relevansinya digerbang lewat
 * `privilage_asset` (permission yang sama dipakai buat kelola Asset/SO),
 * bukan di-scope per-user kayak kategori WO.
 */
export async function getUnlockedStockOpnames(token: string, user: User): Promise<UnlockedSoRow[]> {
  if (String(user.username ?? '').toUpperCase() !== 'SUPERUSER' && Number(user.privilage_asset ?? 0) !== 1) return [];
  try {
    const { rows: list } = await getStockOpnameReport(token, { page: 1, perPage: 500 });
    return list
      .filter((row) => !String(row.locked_date ?? '').trim())
      .map((row) => ({
        no_so: String(row.no_so ?? ''),
        type: String(row.type ?? ''),
        tanggal: String(row.tanggal ?? ''),
      }))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  } catch {
    return [];
  }
}
