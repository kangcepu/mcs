import type { ResultSetHeader } from 'mysql2/promise';
import { one, rows, tableExists, transaction } from '../db.js';
import { HttpError } from '../http.js';
import type { User } from '../types.js';
import { getStockOpnameAssetDetail, getStockOpnameUnregisteredFindings, lockStockOpnameSource } from './stock-opname-proxy.js';

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const matchesLocation = (actual: string, id: string, name: string | null) => {
  const value = normalize(actual); const candidates = [normalize(id), normalize(name)].filter(Boolean);
  return candidates.some((candidate) => value === candidate || (candidate.length >= 4 && (value.includes(candidate) || candidate.includes(value))));
};

export async function stockOpnameValidationEnabled(): Promise<boolean> {
  return tableExists('stock_opname_validation_control');
}

async function ruleFor(type: string): Promise<Record<string, unknown>> {
  const code = type === 'BOM' ? 'AS06-DISPOSITION' : 'AS07-DISPOSITION';
  const rule = await one<Record<string, unknown>>(
    `SELECT * FROM validation_rule WHERE rule_code=? AND status='ACTIVE' AND effective_from<=NOW()
     AND (effective_until IS NULL OR effective_until>=NOW()) ORDER BY version_no DESC LIMIT 1`, [code]);
  if (!rule) throw new HttpError(422, `Rule ${code} belum aktif.`);
  return rule;
}

async function assignedUser(ruleId: number, actors: string[], company: string, location: string, exclude: number): Promise<number | null> {
  const marks = actors.map(() => '?').join(',');
  const result = await one<{ user_id: number }>(
    `SELECT va.user_id FROM validation_assignment va
     LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
     WHERE va.rule_id=? AND va.actor_type IN (${marks}) AND va.status='ACTIVE' AND va.user_id IS NOT NULL
       AND va.user_id<>? AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
       AND (vs.id IS NULL OR ((vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=?)
         AND (vs.site_id IS NULL OR vs.site_id='' OR vs.site_id=?)))
     ORDER BY va.priority_no,va.id LIMIT 1`, [ruleId, ...actors, exclude, company, location]);
  return result?.user_id ?? null;
}

async function hasPositionAssignment(ruleId: number, actors: string[], company: string, location: string): Promise<boolean> {
  const marks = actors.map(() => '?').join(',');
  return Boolean(await one(
    `SELECT va.id FROM validation_assignment va
     LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
     WHERE va.rule_id=? AND va.actor_type IN (${marks}) AND va.status='ACTIVE' AND va.user_id IS NULL
       AND va.position_code IS NOT NULL AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
       AND (vs.id IS NULL OR ((vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=?)
         AND (vs.site_id IS NULL OR vs.site_id='' OR vs.site_id=?))) LIMIT 1`, [ruleId, ...actors, company, location]));
}

function exceptionType(status: string, checked: boolean): string | null {
  if (!checked) return 'MISSING';
  if (/unsafe/i.test(status)) return 'UNSAFE';
  if (/rusak|damaged|broken/i.test(status)) return 'DAMAGED';
  if (/duplicate|duplikat/i.test(status)) return 'DUPLICATE';
  if (/lokasi|location|mismatch|selisih/i.test(status)) return 'LOCATION_VARIANCE';
  return null;
}

export async function getStockOpnameWorkflow(noSo: string): Promise<Record<string, unknown>> {
  if (!(await stockOpnameValidationEnabled())) return { no_so: noSo, status: 'COUNTING', locations: [], exceptions: [], recounts: [], transfer_proposals: [] };
  const control = await one<Record<string, unknown>>('SELECT * FROM stock_opname_validation_control WHERE no_so=?', [noSo]);
  if (!control) return { no_so: noSo, status: 'COUNTING', locations: [], exceptions: [], recounts: [], transfer_proposals: [] };
  const controlId = Number(control.id);
  const [locations, exceptions, recounts, transfers] = await Promise.all([
    rows<Record<string, unknown>>(`SELECT l.*,u.fullname counter_name,vr.request_number,vr.state validation_state
      FROM stock_opname_validation_location l LEFT JOIN tb_user u ON u.id_user=l.counter_user_id
      LEFT JOIN validation_request vr ON vr.id=l.validation_request_id WHERE l.control_id=? ORDER BY l.location_name,u.fullname`, [controlId]),
    rows<Record<string, unknown>>('SELECT * FROM stock_opname_validation_exception WHERE control_id=? ORDER BY status,created_at', [controlId]),
    rows<Record<string, unknown>>('SELECT * FROM stock_opname_validation_recount WHERE control_id=? ORDER BY requested_at DESC', [controlId]),
    rows<Record<string, unknown>>('SELECT * FROM stock_opname_transfer_proposal WHERE control_id=? ORDER BY proposed_at DESC', [controlId]),
  ]);
  return { ...control, locations, exceptions, recounts, transfer_proposals: transfers };
}

export async function assertStockOpnameCounting(noSo: string, user: User): Promise<void> {
  if (!(await stockOpnameValidationEnabled())) return;
  const control = await one<{ status: string }>('SELECT status FROM stock_opname_validation_control WHERE no_so=?', [noSo]);
  if (!control) return;
  if (!['COUNTING', 'RECOUNT'].includes(control.status)) throw new HttpError(409, `Stock Opname berstatus ${control.status}; count/scan sudah dikunci.`);
  const mine = await one<{ status: string }>(
    `SELECT l.status FROM stock_opname_validation_location l JOIN stock_opname_validation_control c ON c.id=l.control_id
     WHERE c.no_so=? AND l.counter_user_id=? AND l.status IN ('COUNTING','RECOUNT') LIMIT 1`, [noSo, user.id_user]);
  if (!mine && control.status === 'RECOUNT') throw new HttpError(403, 'Recount tidak ditugaskan kepada Anda.');
}

export async function submitStockOpnameLocation(noSo: string, token: string, user: User): Promise<Record<string, unknown>> {
  if (!(await stockOpnameValidationEnabled())) throw new HttpError(503, 'Jalankan migration 20261121_validation_stock_opname_rollout.sql.');
  const detail = await getStockOpnameAssetDetail(token, noSo);
  const unregistered = await getStockOpnameUnregisteredFindings(token, noSo).catch(() => ({ assets: [], parts: [] }));
  const rule = await ruleFor(detail.type);
  const assignments = await rows<{ location_id: string; location_name: string | null; user_id: number }>(
    `SELECT DISTINCT location_id,location_name,user_id FROM stock_opname_schedule_run_assignment
     WHERE no_so=? AND user_id=? AND status IN ('ASSIGNED','RECOUNT')`, [noSo, user.id_user]);
  if (!assignments.length) throw new HttpError(403, 'Tidak ada lokasi Stock Opname aktif yang ditugaskan kepada Anda.');

  const results: Record<string, unknown>[] = [];
  for (const assignment of assignments) {
    const scoped = detail.rows.filter((row) => matchesLocation(row.location, assignment.location_id, assignment.location_name));
    const checked = scoped.filter((row) => row.checked);
    const company = String(scoped.find((row) => row.company)?.company ?? user.id_company ?? '');
    const checkerId = await assignedUser(Number(rule.id), ['CHECKER', 'VERIFIER'], company, assignment.location_id, user.id_user);
    const approverId = await assignedUser(Number(rule.id), ['APPROVER'], company, assignment.location_id, user.id_user);
    if (!checkerId && !(await hasPositionAssignment(Number(rule.id), ['CHECKER', 'VERIFIER'], company, assignment.location_id))) {
      throw new HttpError(422, `Checker untuk lokasi ${assignment.location_name ?? assignment.location_id} belum dikonfigurasi.`);
    }
    if (Number(rule.requires_approver) === 1 && !approverId
      && !(await hasPositionAssignment(Number(rule.id), ['APPROVER'], company, assignment.location_id))) {
      throw new HttpError(422, `Approver untuk lokasi ${assignment.location_name ?? assignment.location_id} belum dikonfigurasi.`);
    }
    const missing = scoped.filter((row) => !row.checked).length;
    const exceptions = scoped.map((row) => ({ row, type: exceptionType(row.status, row.checked) })).filter((item) => item.type);
    const rawUnregistered = detail.type === 'BOM' ? unregistered.parts : unregistered.assets;
    const unregisteredForLocation = rawUnregistered.filter((item) => {
      const actual = String(item.LocationCode ?? item.location_code ?? item.LocationAsset ?? item.location ?? '');
      return assignments.length === 1 || !actual || matchesLocation(actual, assignment.location_id, assignment.location_name);
    });
    const requestNumber = `VAL-SO-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const requestSource = `${noSo}:${assignment.location_id}:${user.id_user}`;
    const result = await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO stock_opname_validation_control (no_so,opname_type,status,total_snapshot,checked_count,missing_count,variance_count,exception_count,submitted_by_user_id,submitted_by,submitted_at,created_at,updated_at)
         VALUES (?,?,'SUBMITTED',?,?,?,?,?,?,?,NOW(),NOW(),NOW()) ON DUPLICATE KEY UPDATE status=IF(status='RECOUNT','RECOUNT','SUBMITTED'),
         opname_type=VALUES(opname_type),total_snapshot=VALUES(total_snapshot),checked_count=VALUES(checked_count),missing_count=VALUES(missing_count),
         variance_count=VALUES(variance_count),exception_count=VALUES(exception_count),submitted_by_user_id=VALUES(submitted_by_user_id),submitted_by=VALUES(submitted_by),submitted_at=NOW(),updated_at=NOW()`,
        [noSo, detail.type, detail.rows.length, detail.rows.filter((row) => row.checked).length,
          detail.rows.filter((row) => !row.checked).length, exceptions.length + rawUnregistered.length,
          exceptions.length + rawUnregistered.length, user.id_user, user.fullname]);
      const [controls] = await connection.query('SELECT id FROM stock_opname_validation_control WHERE no_so=? FOR UPDATE', [noSo]);
      const controlId = Number((controls as Array<{ id: number }>)[0]?.id);
      const [existingRows] = await connection.query(
        `SELECT * FROM stock_opname_validation_location WHERE control_id=? AND location_id=? AND counter_user_id=? FOR UPDATE`,
        [controlId, assignment.location_id, user.id_user]);
      const existing = (existingRows as Array<Record<string, unknown>>)[0];
      let requestId = Number(existing?.validation_request_id ?? 0);
      if (requestId) {
        const [requestRows] = await connection.query('SELECT state FROM validation_request WHERE id=? FOR UPDATE', [requestId]);
        const state = String((requestRows as Array<{ state: string }>)[0]?.state ?? '');
        if (state === 'RETURNED') {
          await connection.execute(`UPDATE validation_request SET state='SUBMITTED',return_reason=NULL,submitted_at=NOW(),due_at=DATE_ADD(NOW(),INTERVAL ? HOUR),updated_by=?,updated_at=NOW() WHERE id=?`, [Number(rule.sla_hours ?? 48), user.fullname, requestId]);
          await connection.execute(`INSERT INTO validation_decision (request_id,stage,decision,from_state,to_state,decision_note,actor_user_id,actor_name,decided_at)
            VALUES (?,'MAKER','RESUBMIT','RETURNED','SUBMITTED','Recount submitted',?,?,NOW())`, [requestId, user.id_user, user.fullname]);
        } else if (!['SUBMITTED', 'CHECKING'].includes(state)) throw new HttpError(409, `Lokasi sudah berstatus ${state}.`);
      } else {
        const [inserted] = await connection.execute<ResultSetHeader>(
          `INSERT INTO validation_request
           (request_number,rule_id,source_type,source_id,source_reference,source_route,source_status,target_status,title,description,
            module_code,domain_code,company_id,site_id,maker_user_id,checker_user_id,approver_user_id,state,risk_level,submitted_at,due_at,payload_snapshot,created_by,updated_by,created_at,updated_at)
           VALUES (?,?, 'SO_LOCATION',?,?,?,'COUNTING','LOCKED',?,?,?,?,?,?,?,?,?,'SUBMITTED',?,NOW(),DATE_ADD(NOW(),INTERVAL ? HOUR),?,?,?,NOW(),NOW())`,
          [requestNumber, rule.id, requestSource, noSo, '/stock-opname', `Validasi SO ${noSo} · ${assignment.location_name ?? assignment.location_id}`,
            `Validasi hasil count petugas ${user.fullname}`, rule.module_code, detail.type, company, assignment.location_id,
            user.id_user, checkerId, approverId, rule.risk_level, Number(rule.sla_hours ?? 48),
            JSON.stringify({ no_so: noSo, location: assignment, rows: scoped }), user.fullname, user.fullname] as never);
        requestId = inserted.insertId;
        await connection.execute(`INSERT INTO validation_evidence
          (request_id,evidence_type,file_name,test_values,source_mode,uploaded_by_user_id,created_at)
          VALUES (?,'COUNT_SNAPSHOT','System count snapshot',?,'SYSTEM_SNAPSHOT',?,NOW())`, [requestId, JSON.stringify(scoped), user.id_user]);
        await connection.execute(`INSERT INTO validation_audit (request_id,event_type,new_snapshot,actor_user_id,actor_name,event_at)
          VALUES (?,'SO_LOCATION_SUBMITTED',?,?,?,NOW())`, [requestId, JSON.stringify({ no_so: noSo, location: assignment.location_id, total: scoped.length, checked: checked.length }), user.id_user, user.fullname]);
      }
      await connection.execute(
        `INSERT INTO stock_opname_validation_location
         (control_id,location_id,location_name,counter_user_id,validation_request_id,status,total_snapshot,checked_count,missing_count,duplicate_count,damaged_count,location_variance_count,unregistered_count,submitted_at,updated_at)
         VALUES (?,?,?,?,?,'SUBMITTED',?,?,?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE validation_request_id=VALUES(validation_request_id),status='SUBMITTED',
         total_snapshot=VALUES(total_snapshot),checked_count=VALUES(checked_count),missing_count=VALUES(missing_count),duplicate_count=VALUES(duplicate_count),
         damaged_count=VALUES(damaged_count),location_variance_count=VALUES(location_variance_count),submitted_at=NOW(),updated_at=NOW()`,
        [controlId, assignment.location_id, assignment.location_name, user.id_user, requestId, scoped.length, checked.length, missing,
          exceptions.filter((item) => item.type === 'DUPLICATE').length, exceptions.filter((item) => item.type === 'DAMAGED').length,
          exceptions.filter((item) => item.type === 'LOCATION_VARIANCE').length, unregisteredForLocation.length]);
      const [locations] = await connection.query(`SELECT id FROM stock_opname_validation_location WHERE control_id=? AND location_id=? AND counter_user_id=?`, [controlId, assignment.location_id, user.id_user]);
      const locationId = Number((locations as Array<{ id: number }>)[0]?.id);
      await connection.execute('DELETE FROM stock_opname_validation_exception WHERE location_validation_id=? AND status=\'OPEN\'', [locationId]);
      for (const item of exceptions) {
        const severity = ['UNSAFE', 'MISSING'].includes(String(item.type)) ? 'HIGH' : 'MEDIUM';
        const [exceptionInsert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO stock_opname_validation_exception
           (control_id,location_validation_id,validation_request_id,exception_type,severity,asset_code,asset_name,expected_location,actual_location,condition_status,description,status,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,NOW())`,
          [controlId, locationId, requestId, item.type, severity, item.row.asset_code, item.row.asset_name,
            assignment.location_name ?? assignment.location_id, item.row.location, item.row.status,
            `${item.type} pada ${item.row.asset_code || item.row.asset_name}`, user.fullname]);
        if (item.type === 'LOCATION_VARIANCE' && item.row.asset_code) {
          await connection.execute(
            `INSERT IGNORE INTO stock_opname_transfer_proposal
             (control_id,exception_id,asset_code,from_location,to_location,status,proposed_by,proposed_at)
             VALUES (?,?,?, ?,?,'PROPOSED',?,NOW())`,
            [controlId, exceptionInsert.insertId, item.row.asset_code, item.row.location,
              assignment.location_name ?? assignment.location_id, user.fullname]);
        }
      }
      for (const item of unregisteredForLocation) {
        const code = String(item.AssetCode ?? item.asset_code ?? item.PartCode ?? item.part_code ?? '');
        const name = String((item.NonAssetName ?? item.NonPartName ?? item.name ?? code) || 'Temuan tidak terdaftar');
        const actual = String(item.LocationCode ?? item.location_code ?? item.LocationAsset ?? item.location ?? '');
        await connection.execute(
          `INSERT INTO stock_opname_validation_exception
           (control_id,location_validation_id,validation_request_id,exception_type,severity,asset_code,asset_name,expected_location,actual_location,description,status,created_by,created_at)
           VALUES (?,?,?,'UNREGISTERED','HIGH',?,?,?,?,?,'OPEN',?,NOW())`,
          [controlId, locationId, requestId, code || null, name, assignment.location_name ?? assignment.location_id,
            actual || null, `Item tidak terdaftar ditemukan saat SO: ${name}`, user.fullname]);
      }
      await connection.execute(`UPDATE stock_opname_schedule_run_assignment SET status='SUBMITTED' WHERE no_so=? AND user_id=? AND location_id=?`, [noSo, user.id_user, assignment.location_id]);
      return { request_id: requestId, request_number: requestNumber, location_id: assignment.location_id, total: scoped.length, checked: checked.length, missing, exceptions: exceptions.length + unregisteredForLocation.length };
    });
    results.push(result);
  }
  return { no_so: noSo, status: 'SUBMITTED', locations: results };
}

export async function syncStockOpnameValidationDecision(requestId: number, state: string, action: string, note: string, authorization: string, actor: User): Promise<Record<string, unknown> | null> {
  if (!(await stockOpnameValidationEnabled())) return null;
  const context = await one<Record<string, unknown>>(
    `SELECT l.*,c.no_so,c.id control_id FROM stock_opname_validation_location l
     JOIN stock_opname_validation_control c ON c.id=l.control_id WHERE l.validation_request_id=?`, [requestId]);
  if (!context) return null;
  const controlId = Number(context.control_id); const locationId = Number(context.id); const noSo = String(context.no_so);
  if (state === 'RETURNED') {
    await transaction(async (connection) => {
      const next = Number(context.recount_no ?? 0) + 1;
      await connection.execute(`UPDATE stock_opname_validation_location SET status='RECOUNT',recount_no=?,updated_at=NOW() WHERE id=?`, [next, locationId]);
      await connection.execute(`UPDATE stock_opname_validation_control SET status='RECOUNT',updated_at=NOW() WHERE id=?`, [controlId]);
      await connection.execute(`INSERT INTO stock_opname_validation_recount
        (control_id,location_validation_id,recount_no,reason,requested_by_user_id,requested_by,assigned_to_user_id,status,requested_at)
        VALUES (?,?,?,?,?,?,?,'REQUESTED',NOW())`, [controlId, locationId, next, note || 'Recount diminta checker', actor.id_user, actor.fullname, Number(context.counter_user_id)]);
      await connection.execute(`UPDATE stock_opname_schedule_run_assignment SET status='RECOUNT' WHERE no_so=? AND user_id=? AND location_id=?`, [noSo, Number(context.counter_user_id), String(context.location_id)]);
    });
    return { no_so: noSo, status: 'RECOUNT' };
  }
  if (state === 'REJECTED') {
    await transaction(async (connection) => {
      await connection.execute(`UPDATE stock_opname_validation_location SET status='REJECTED',updated_at=NOW() WHERE id=?`, [locationId]);
      await connection.execute(`UPDATE stock_opname_validation_control SET status='REJECTED',updated_at=NOW() WHERE id=?`, [controlId]);
    });
    return { no_so: noSo, status: 'REJECTED' };
  }
  if (state === 'PENDING_APPROVAL') {
    await transaction(async (connection) => {
      await connection.execute(`UPDATE stock_opname_validation_location SET status='PENDING_APPROVAL',checked_at=NOW(),updated_at=NOW() WHERE id=?`, [locationId]);
      await connection.execute(`UPDATE stock_opname_validation_control SET status=IF(NOT EXISTS(
        SELECT 1 FROM stock_opname_validation_location WHERE control_id=? AND status NOT IN ('PENDING_APPROVAL','APPROVED')
      ),'PENDING_APPROVAL','CHECKING'),updated_at=NOW() WHERE id=?`, [controlId, controlId]);
    });
    return { no_so: noSo, status: 'PENDING_APPROVAL' };
  }
  if (state !== 'APPROVED') return null;
  const shouldLock = await transaction(async (connection) => {
    await connection.execute(`UPDATE stock_opname_validation_location SET status='APPROVED',approved_at=NOW(),updated_at=NOW() WHERE id=?`, [locationId]);
    const [pending] = await connection.query(`SELECT COUNT(*) total FROM stock_opname_validation_location WHERE control_id=? AND status<>'APPROVED'`, [controlId]);
    const allApproved = Number((pending as Array<{ total: number }>)[0]?.total ?? 0) === 0;
    if (allApproved) await connection.execute(`UPDATE stock_opname_validation_control SET status='APPROVED',approved_by_user_id=?,approved_by=?,approved_at=NOW(),updated_at=NOW() WHERE id=?`, [actor.id_user, actor.fullname, controlId]);
    return allApproved;
  });
  if (!shouldLock) return { no_so: noSo, status: 'PENDING_APPROVAL' };
  await lockStockOpnameSource(authorization, noSo);
  await transaction(async (connection) => {
    await connection.execute(`UPDATE stock_opname_validation_control SET status='LOCKED',locked_by_user_id=?,locked_by=?,locked_at=NOW(),source_locked_at=NOW(),updated_at=NOW() WHERE id=?`, [actor.id_user, actor.fullname, controlId]);
    await connection.execute(`UPDATE stock_opname_schedule_run_assignment SET status='COMPLETED',completed_at=NOW() WHERE no_so=?`, [noSo]);
  });
  return { no_so: noSo, status: 'LOCKED' };
}

export async function lockApprovedStockOpname(noSo: string, authorization: string, user: User): Promise<void> {
  const control = await one<{ id: number; status: string }>('SELECT id,status FROM stock_opname_validation_control WHERE no_so=?', [noSo]);
  if (!control || control.status !== 'APPROVED') throw new HttpError(409, 'SO hanya dapat dikunci setelah seluruh lokasi mendapat approval.');
  await lockStockOpnameSource(authorization, noSo);
  await transaction(async (connection) => {
    await connection.execute(`UPDATE stock_opname_validation_control SET status='LOCKED',locked_by_user_id=?,locked_by=?,locked_at=NOW(),source_locked_at=NOW(),updated_at=NOW() WHERE id=?`, [user.id_user, user.fullname, control.id]);
    await connection.execute(`UPDATE stock_opname_schedule_run_assignment SET status='COMPLETED',completed_at=NOW() WHERE no_so=?`, [noSo]);
  });
}
