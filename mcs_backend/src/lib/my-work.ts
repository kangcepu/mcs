import { hasColumn, rows, tableExists } from '../db.js';
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
const FINAL_WO_STATUSES = new Set(['CLOSED', 'AUTO_CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'COMPLETE EXECUTOR', 'NEED_CLOSED', 'VOID', 'DECLINE', 'REJECT']);
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

export interface MissingAssetPicRow {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  company: string;
  location: string;
  category: string;
  status: string;
  found_at: string | null;
}

export async function getAssignedStockOpnameSchedules(user: User): Promise<Record<string, unknown>[]> {
  if (!(await tableExists('stock_opname_schedule')) || !(await tableExists('stock_opname_schedule_assignee'))) return [];
  return rows<Record<string, unknown>>(
    `SELECT s.id schedule_id,s.schedule_name,s.next_run_date,s.is_bom,s.company_ids,s.category_ids,s.location_ids,
       (SELECT r.no_so FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id ORDER BY r.due_date DESC,r.id DESC LIMIT 1) no_so,
       (SELECT r.status FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id ORDER BY r.due_date DESC,r.id DESC LIMIT 1) run_status
     FROM stock_opname_schedule s JOIN stock_opname_schedule_assignee a ON a.schedule_id=s.id
     WHERE a.user_id=? AND s.status='ACTIVE' AND (s.end_date IS NULL OR s.end_date>=CURDATE())
     ORDER BY s.next_run_date,s.schedule_name`, [user.id_user],
  );
}

export async function getMissingAssetPics(user: User): Promise<MissingAssetPicRow[]> {
  if (String(user.username ?? '').toUpperCase() !== 'SUPERUSER' && Number(user.privilage_asset ?? 0) !== 1) return [];
  if (!await hasColumn('asset', 'pic_user_id')) return [];
  const data = await rows<Record<string, unknown>>(
    `SELECT AssetID asset_id,AssetCode asset_code,AssetName asset_name,
            CompanyName company,LocationAsset location,CategoryAsset category,
            'OPEN' status,COALESCE(updated_at,created_at) found_at
     FROM asset
     WHERE active='active' AND pic_user_id IS NULL
     ORDER BY CompanyName,LocationAsset,AssetName`,
  );
  return data as unknown as MissingAssetPicRow[];
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

export type ValidationQueueKey = 'validation_pending' | 'validation_approval' | 'validation_returned' | 'validation_close_review';

/**
 * Antrean Validation Engine untuk My Work. Assignment dapat eksplisit pada
 * request atau berasal dari master assignment berdasarkan user/position dan
 * scope organisasi. Permission/delegation detail akan menjadi gate aksi pada
 * tahap UI keputusan; daftar ini sudah row-level dan tidak membuka lintas scope.
 */
export async function getValidationQueue(user: User, queue: ValidationQueueKey): Promise<Record<string, unknown>[]> {
  if (!(await tableExists('validation_request')) || !(await tableExists('validation_assignment'))
    || !(await tableExists('validation_rule'))) return [];

  const configs: Record<ValidationQueueKey, { states: string[]; direct: string; actors: string[] }> = {
    validation_pending: { states: ['SUBMITTED', 'CHECKING'], direct: 'r.checker_user_id', actors: ['CHECKER', 'VERIFIER'] },
    validation_approval: { states: ['PENDING_APPROVAL'], direct: 'r.approver_user_id', actors: ['APPROVER'] },
    validation_returned: { states: ['RETURNED'], direct: 'r.maker_user_id', actors: ['MAKER'] },
    validation_close_review: { states: ['PENDING_CLOSE_REVIEW'], direct: 'r.close_reviewer_user_id', actors: ['CLOSE_REVIEWER', 'CHECKER', 'VERIFIER'] },
  };
  const config = configs[queue];
  const stateMarks = config.states.map(() => '?').join(',');
  const actorMarks = config.actors.map(() => '?').join(',');
  const position = String(user.id_position ?? '').trim();
  const data = await rows<Record<string, unknown>>(
    `SELECT r.id validation_id,r.request_number,r.source_type,r.source_id,r.source_reference,r.source_route,
       r.title,r.description,r.module_code,r.domain_code,r.company_id company,r.site_id,r.department_id,
       r.division_id,r.asset_id,r.asset_code,r.state status,r.risk_level,r.submitted_at,r.due_at,
       r.return_reason,r.maker_user_id,m.fullname maker_name,vr.rule_code,vr.rule_name
     FROM validation_request r
     JOIN validation_rule vr ON vr.id=r.rule_id
     LEFT JOIN tb_user m ON m.id_user=r.maker_user_id
     WHERE r.state IN (${stateMarks})
       AND (
         ${config.direct}=?
         OR ((r.company_id IS NULL OR r.company_id='' OR r.company_id IN (?,?)) AND EXISTS (
           SELECT 1 FROM validation_assignment va
           LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
           WHERE va.rule_id=r.rule_id AND va.actor_type IN (${actorMarks}) AND va.status='ACTIVE'
             AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
             AND (va.user_id=? OR (va.user_id IS NULL AND va.position_code=?))
             AND (vs.id IS NULL OR (
               (vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=r.company_id)
               AND (vs.site_id IS NULL OR vs.site_id='' OR vs.site_id=r.site_id)
               AND (vs.department_id IS NULL OR vs.department_id='' OR vs.department_id=r.department_id)
               AND (vs.division_id IS NULL OR vs.division_id='' OR vs.division_id=r.division_id)
               AND (vs.domain_code IS NULL OR vs.domain_code='' OR vs.domain_code=r.domain_code)
             ))
         ))
       )
     ORDER BY CASE r.risk_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
       r.due_at IS NULL,r.due_at,r.submitted_at DESC
     LIMIT 500`,
    [...config.states, user.id_user, String(user.id_company ?? ''), String(user.company_name ?? ''), ...config.actors, user.id_user, position],
  );
  return data.map((item) => ({ ...item, queue_role: queue, is_overdue: Boolean(item.due_at && String(item.due_at) < new Date().toISOString()) }));
}

/** NCR dari domain yang sudah live, dipersonalisasi berdasarkan assigned_to. */
export async function getAssignedNcrDue(user: User): Promise<Record<string, unknown>[]> {
  const actorNames = [String(user.username ?? '').trim(), String(user.fullname ?? '').trim()].filter(Boolean);
  if (!actorNames.length) return [];
  const output: Record<string, unknown>[] = [];
  const marks = actorNames.map(() => '?').join(',');
  if (await tableExists('validation_ncr')) output.push(...await rows<Record<string, unknown>>(
    `SELECT CONCAT('VALIDATION:',n.id) validation_id,n.ncr_number source_reference,'VALIDATION_NCR' source_type,
       COALESCE(r.source_route,'/my-work') source_route,n.title,n.description,COALESCE(r.module_code,'GV04') module_code,
       r.asset_code,n.status,n.severity risk_level,n.created_at submitted_at,n.due_at,
       COALESCE(n.assigned_to,u.fullname) assigned_to
     FROM validation_ncr n LEFT JOIN validation_request r ON r.id=n.request_id
     LEFT JOIN tb_user u ON u.id_user=n.assigned_to_user_id
     WHERE (n.assigned_to_user_id=? OR n.assigned_to IN (${marks}))
       AND n.status NOT IN ('CLOSED','CANCELLED','REJECTED')`, [user.id_user, ...actorNames],
  ));
  if (await tableExists('preventive_ncr')) output.push(...await rows<Record<string, unknown>>(
    `SELECT CONCAT('PREVENTIVE:',id) validation_id,ncr_number source_reference,'PREVENTIVE_NCR' source_type,
       '/preventive-ncr' source_route,title,description,module_code,asset_code,status,severity risk_level,
       detected_at submitted_at,due_date due_at,assigned_to
     FROM preventive_ncr WHERE assigned_to IN (${marks}) AND status NOT IN ('CLOSED','CANCELLED','REJECTED')`, actorNames,
  ));
  if (await tableExists('sparepart_governance_ncr')) output.push(...await rows<Record<string, unknown>>(
    `SELECT CONCAT('SPAREPART:',id) validation_id,ncr_number source_reference,'SPAREPART_NCR' source_type,
       '/spareparts' source_route,title,description,'SPAREPART' module_code,NULL asset_code,status,severity risk_level,
       created_at submitted_at,due_date due_at,assigned_to
     FROM sparepart_governance_ncr WHERE assigned_to IN (${marks}) AND status NOT IN ('CLOSED','CANCELLED','REJECTED')`, actorNames,
  ));
  if (await tableExists('energy_governance_ncr')) output.push(...await rows<Record<string, unknown>>(
    `SELECT CONCAT('ENERGY:',id) validation_id,ncr_number source_reference,'ENERGY_NCR' source_type,
       '/governance' source_route,title,description,'ENERGY' module_code,NULL asset_code,status,severity risk_level,
       detected_at submitted_at,due_date due_at,assigned_to
     FROM energy_governance_ncr WHERE assigned_to IN (${marks}) AND status NOT IN ('CLOSED','CANCELLED','REJECTED')`, actorNames,
  ));
  return output.sort((a, b) => String(a.due_at ?? '9999').localeCompare(String(b.due_at ?? '9999')));
}
