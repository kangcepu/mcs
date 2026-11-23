import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { one, rows, tableExists, transaction } from '../db.js';
import { HttpError } from '../http.js';
import type { User } from '../types.js';
import { MODULE_MAP } from './approval-center.js';
import { processPreventiveCompletion } from './preventive-compliance.js';

type ValidationActor = 'MAKER' | 'CHECKER' | 'VERIFIER' | 'APPROVER' | 'CLOSE_REVIEWER';

interface ValidationRequestRow extends Record<string, unknown> {
  id: number;
  rule_id: number;
  request_number: string;
  source_type: string;
  source_id: string;
  source_reference: string;
  source_status: string | null;
  target_status: string | null;
  module_code: string;
  domain_code: string | null;
  company_id: string | null;
  site_id: string | null;
  department_id: string | null;
  division_id: string | null;
  maker_user_id: number;
  checker_user_id: number | null;
  approver_user_id: number | null;
  close_reviewer_user_id: number | null;
  state: string;
  requires_checker: number;
  requires_approver: number;
  requires_evidence: number;
  prevent_self_check: number;
  prevent_self_approve: number;
}

function actorDirectColumn(actor: ValidationActor): keyof ValidationRequestRow | null {
  if (actor === 'MAKER') return 'maker_user_id';
  if (actor === 'APPROVER') return 'approver_user_id';
  if (actor === 'CLOSE_REVIEWER') return 'close_reviewer_user_id';
  if (actor === 'CHECKER' || actor === 'VERIFIER') return 'checker_user_id';
  return null;
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.query(sql, params as never);
  return ((result as T[])[0] ?? null);
}

async function requestForUpdate(connection: PoolConnection, id: number): Promise<ValidationRequestRow | null> {
  return connectionOne<ValidationRequestRow>(connection,
    `SELECT r.*,vr.rule_code,vr.rule_name,vr.requires_checker,vr.requires_approver,vr.requires_evidence,
       vr.prevent_self_check,vr.prevent_self_approve,vr.rule_config
     FROM validation_request r JOIN validation_rule vr ON vr.id=r.rule_id
     WHERE r.id=? FOR UPDATE`, [id]);
}

async function assignmentAllows(connection: PoolConnection, request: ValidationRequestRow, user: User, actors: ValidationActor[]): Promise<boolean> {
  for (const actor of actors) {
    const direct = actorDirectColumn(actor);
    if (direct && Number(request[direct] ?? 0) === Number(user.id_user)) return true;
  }
  const marks = actors.map(() => '?').join(',');
  return Boolean(await connectionOne(connection,
    `SELECT va.id FROM validation_assignment va
     LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
     WHERE va.rule_id=? AND va.actor_type IN (${marks}) AND va.status='ACTIVE'
       AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
       AND (va.user_id=? OR (va.user_id IS NULL AND va.position_code=?))
       AND (vs.id IS NULL OR (
         (vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=?)
         AND (vs.site_id IS NULL OR vs.site_id='' OR vs.site_id=?)
         AND (vs.department_id IS NULL OR vs.department_id='' OR vs.department_id=?)
         AND (vs.division_id IS NULL OR vs.division_id='' OR vs.division_id=?)
         AND (vs.domain_code IS NULL OR vs.domain_code='' OR vs.domain_code=?)
       )) LIMIT 1`,
    [request.rule_id, ...actors, user.id_user, String(user.id_position ?? ''), request.company_id, request.site_id,
      request.department_id, request.division_id, request.domain_code]));
}

function assertSeparation(request: ValidationRequestRow, user: User, stage: string): void {
  if (stage === 'APPROVAL' && Number(request.prevent_self_approve) === 1
    && Number(request.maker_user_id) === Number(user.id_user)) {
    throw new HttpError(403, 'Maker tidak boleh melakukan approval pada transaksi yang sama.', 'VALIDATION_SELF_APPROVE');
  }
  if (stage !== 'APPROVAL' && Number(request.prevent_self_check) === 1
    && Number(request.maker_user_id) === Number(user.id_user)) {
    throw new HttpError(403, 'Maker tidak boleh memvalidasi transaksi yang dibuat sendiri.', 'VALIDATION_SELF_CHECK');
  }
}

async function finalizeSource(connection: PoolConnection, request: ValidationRequestRow): Promise<void> {
  if (request.source_type !== 'WO_CLOSE') return;
  const cfg = MODULE_MAP[String(request.domain_code ?? '')];
  if (!cfg) throw new HttpError(422, 'Modul sumber validasi tidak dikenali.', 'VALIDATION_SOURCE_UNKNOWN');
  const [result] = await connection.execute<ResultSetHeader>(
    `UPDATE ${cfg.table} SET status='CLOSED',closedDate=NOW(),pic='-',updated_at=NOW()
     WHERE wo_number=? AND status IN ('NEED_CLOSED','COMPLETE_EXECUTOR','PENDING_CLOSE_REVIEW')`, [request.source_id]);
  if (result.affectedRows !== 1) throw new HttpError(409, 'Status WO sumber sudah berubah. Muat ulang data.', 'VALIDATION_SOURCE_CHANGED');
}

export async function getValidationRequestDetail(id: number, user: User): Promise<Record<string, unknown>> {
  if (!(await tableExists('validation_request'))) throw new HttpError(404, 'Validation Engine belum diaktifkan.');
  const item = await one<ValidationRequestRow & Record<string, unknown>>(
    `SELECT r.*,vr.rule_code,vr.rule_name,vr.requires_checker,vr.requires_approver,vr.requires_evidence,
       vr.prevent_self_check,vr.prevent_self_approve,m.fullname maker_name,c.fullname checker_name,
       a.fullname approver_name,cr.fullname close_reviewer_name
     FROM validation_request r JOIN validation_rule vr ON vr.id=r.rule_id
     LEFT JOIN tb_user m ON m.id_user=r.maker_user_id
     LEFT JOIN tb_user c ON c.id_user=r.checker_user_id
     LEFT JOIN tb_user a ON a.id_user=r.approver_user_id
     LEFT JOIN tb_user cr ON cr.id_user=r.close_reviewer_user_id WHERE r.id=?`, [id]);
  if (!item) throw new HttpError(404, 'Request validasi tidak ditemukan.');
  const visible = await transaction(async (connection) => Number(item.maker_user_id) === Number(user.id_user)
    || assignmentAllows(connection, item, user, ['CHECKER', 'VERIFIER', 'APPROVER', 'CLOSE_REVIEWER']));
  if (!visible) throw new HttpError(403, 'Request validasi berada di luar scope Anda.');
  const [decisions, evidence, exceptions, stockOpnameExceptions] = await Promise.all([
    rows<Record<string, unknown>>('SELECT * FROM validation_decision WHERE request_id=? ORDER BY decided_at DESC,id DESC', [id]),
    rows<Record<string, unknown>>(`SELECT *,CONCAT('/uploads/',object_key) url FROM validation_evidence WHERE request_id=? ORDER BY created_at DESC,id DESC`, [id]),
    rows<Record<string, unknown>>('SELECT * FROM validation_exception WHERE request_id=? ORDER BY created_at DESC,id DESC', [id]),
    item.source_type === 'SO_LOCATION' && await tableExists('stock_opname_validation_exception')
      ? rows<Record<string, unknown>>(`SELECT id,exception_type,severity,description exception_summary,
          CONCAT_WS(' → ',expected_location,actual_location) exception_detail,status,asset_code,asset_name,disposition,created_at
        FROM stock_opname_validation_exception WHERE validation_request_id=? ORDER BY created_at DESC,id DESC`, [id]) : Promise.resolve([]),
  ]);
  return { ...item, decisions, evidence, exceptions: [...exceptions, ...stockOpnameExceptions] };
}

export async function canAddValidationEvidence(id: number, user: User): Promise<void> {
  await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id);
    if (!request) throw new HttpError(404, 'Request validasi tidak ditemukan.');
    if (['APPROVED', 'CLOSE_APPROVED', 'REJECTED', 'CANCELLED'].includes(request.state)) {
      throw new HttpError(409, 'Evidence pada request final sudah dikunci.');
    }
    const allowed = Number(request.maker_user_id) === Number(user.id_user)
      || await assignmentAllows(connection, request, user, ['CHECKER', 'VERIFIER', 'APPROVER', 'CLOSE_REVIEWER']);
    if (!allowed) throw new HttpError(403, 'Anda tidak memiliki scope untuk menambah evidence.');
  });
}

export async function addValidationEvidence(input: {
  requestId: number; evidenceType: string; fileName: string; objectKey: string; mimeType: string;
  checksum: string; user: User;
}): Promise<number> {
  const result = await transaction(async (connection) => {
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO validation_evidence
       (request_id,evidence_type,file_name,object_key,mime_type,checksum,source_mode,uploaded_by_user_id,created_at)
       VALUES (?,?,?,?,?,?,'UPLOAD',?,NOW())`,
      [input.requestId, input.evidenceType, input.fileName, input.objectKey, input.mimeType, input.checksum, input.user.id_user]);
    await connection.execute(
      `INSERT INTO validation_audit (request_id,event_type,new_snapshot,actor_user_id,actor_name,event_at)
       VALUES (?,'EVIDENCE_UPLOADED',?,?,?,NOW())`,
      [input.requestId, JSON.stringify({ evidence_type: input.evidenceType, file_name: input.fileName, object_key: input.objectKey }), input.user.id_user, input.user.fullname]);
    return inserted.insertId;
  });
  return result;
}

export async function decideValidationRequest(id: number, actionRaw: string, noteRaw: string, reasonCode: string, user: User): Promise<Record<string, unknown>> {
  const action = actionRaw.toUpperCase().trim();
  const note = noteRaw.trim();
  if (!['APPROVE', 'RETURN', 'REJECT', 'RESUBMIT'].includes(action)) throw new HttpError(422, 'Aksi validasi tidak dikenali.');
  if (['RETURN', 'REJECT'].includes(action) && note.length < 5) throw new HttpError(422, 'Alasan minimal 5 karakter wajib diisi.');

  const result = await transaction(async (connection) => {
    const request = await requestForUpdate(connection, id);
    if (!request) throw new HttpError(404, 'Request validasi tidak ditemukan.');
    const fromState = String(request.state);
    let stage = 'CHECKING';
    let actors: ValidationActor[] = ['CHECKER', 'VERIFIER'];

    if (action === 'RESUBMIT') {
      if (fromState !== 'RETURNED' || Number(request.maker_user_id) !== Number(user.id_user)) {
        throw new HttpError(403, 'Hanya maker yang dapat mengirim ulang request yang dikembalikan.');
      }
      const toState = request.source_type === 'WO_CLOSE' ? 'PENDING_CLOSE_REVIEW' : 'SUBMITTED';
      await connection.execute('UPDATE validation_request SET state=?,return_reason=NULL,submitted_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?',
        [toState, user.fullname, id]);
      await connection.execute(`INSERT INTO validation_decision
        (request_id,stage,decision,from_state,to_state,decision_note,actor_user_id,actor_name,decided_at)
        VALUES (?,'MAKER','RESUBMIT',?,?,?,?,?,NOW())`, [id, fromState, toState, note || null, user.id_user, user.fullname]);
      await connection.execute(`INSERT INTO validation_audit
        (request_id,event_type,old_snapshot,new_snapshot,actor_user_id,actor_name,event_at)
        VALUES (?,'RESUBMITTED',?,?,?,?,NOW())`, [id, JSON.stringify({ state: fromState }), JSON.stringify({ state: toState }), user.id_user, user.fullname]);
      return { id, state: toState };
    }

    if (fromState === 'PENDING_APPROVAL') { stage = 'APPROVAL'; actors = ['APPROVER']; }
    else if (fromState === 'PENDING_CLOSE_REVIEW') { stage = 'CLOSE_REVIEW'; actors = ['CLOSE_REVIEWER', 'CHECKER', 'VERIFIER']; }
    else if (!['SUBMITTED', 'CHECKING'].includes(fromState)) throw new HttpError(409, 'Request tidak sedang menunggu keputusan.');

    if (!(await assignmentAllows(connection, request, user, actors))) throw new HttpError(403, 'Request tidak ditugaskan kepada Anda.');
    assertSeparation(request, user, stage);

    let toState: string;
    if (action === 'RETURN') toState = 'RETURNED';
    else if (action === 'REJECT') toState = 'REJECTED';
    else {
      if (stage !== 'APPROVAL' && Number(request.requires_evidence) === 1) {
        const evidence = await connectionOne<{ total: number }>(connection, 'SELECT COUNT(*) total FROM validation_evidence WHERE request_id=?', [id]);
        if (Number(evidence?.total ?? 0) < 1) throw new HttpError(422, 'Minimal satu evidence wajib tersedia sebelum validasi.');
      }
      if (stage !== 'APPROVAL' && Number(request.requires_approver) === 1) toState = 'PENDING_APPROVAL';
      else toState = request.source_type === 'WO_CLOSE' ? 'CLOSE_APPROVED' : 'APPROVED';
    }

    if (['APPROVED', 'CLOSE_APPROVED'].includes(toState)) await finalizeSource(connection, request);
    await connection.execute(
      `UPDATE validation_request SET state=?,return_reason=?,checked_at=IF(?='CHECKING' OR ?='CLOSE_REVIEW',NOW(),checked_at),
       approved_at=IF(?='APPROVAL',NOW(),approved_at),closed_at=IF(? IN ('APPROVED','CLOSE_APPROVED','REJECTED'),NOW(),closed_at),
       updated_by=?,updated_at=NOW() WHERE id=?`,
      [toState, action === 'RETURN' ? note : null, stage, stage, stage, toState, user.fullname, id]);
    await connection.execute(
      `INSERT INTO validation_decision
       (request_id,stage,decision,from_state,to_state,reason_code,decision_note,actor_user_id,actor_name,decided_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [id, stage, action, fromState, toState, reasonCode || null, note || null, user.id_user, user.fullname]);
    await connection.execute(
      `INSERT INTO validation_audit
       (request_id,event_type,old_snapshot,new_snapshot,actor_user_id,actor_name,event_at)
       VALUES (?,'DECISION_RECORDED',?,?,?,?,NOW())`,
      [id, JSON.stringify({ state: fromState }), JSON.stringify({ state: toState, decision: action }), user.id_user, user.fullname]);
    return { id, state: toState, decision: action };
  });
  if (result.state === 'CLOSE_APPROVED') {
    const completed = await one<{ source_type: string; source_id: string; domain_code: string }>(
      'SELECT source_type,source_id,domain_code FROM validation_request WHERE id=?', [id]);
    if (completed?.source_type === 'WO_CLOSE' && ['production', 'wo_preventive'].includes(completed.domain_code)) {
      await processPreventiveCompletion({ moduleCode: 'PRODUCTION', woNumber: completed.source_id, actor: user.fullname });
    }
  }
  return result;
}

async function assignedUser(ruleId: number, actorTypes: ValidationActor[], scope: Record<string, unknown>, excludeUserId: number): Promise<number | null> {
  const marks = actorTypes.map(() => '?').join(',');
  const item = await one<{ user_id: number }>(
    `SELECT va.user_id FROM validation_assignment va
     LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
     WHERE va.rule_id=? AND va.actor_type IN (${marks}) AND va.status='ACTIVE' AND va.user_id IS NOT NULL
       AND va.user_id<>? AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
       AND (vs.id IS NULL OR (
         (vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=?)
         AND (vs.department_id IS NULL OR vs.department_id='' OR vs.department_id=?)
         AND (vs.division_id IS NULL OR vs.division_id='' OR vs.division_id=?)
         AND (vs.domain_code IS NULL OR vs.domain_code='' OR vs.domain_code=?)
       )) ORDER BY va.priority_no,va.id LIMIT 1`,
    [ruleId, ...actorTypes, excludeUserId, scope.company, scope.id_departement, scope.id_division, scope.domain]);
  return item?.user_id ?? null;
}

async function hasPositionAssignment(ruleId: number, actorTypes: ValidationActor[], scope: Record<string, unknown>): Promise<boolean> {
  const marks = actorTypes.map(() => '?').join(',');
  return Boolean(await one(
    `SELECT va.id FROM validation_assignment va
     LEFT JOIN validation_scope vs ON vs.id=va.scope_id AND vs.status='ACTIVE'
     WHERE va.rule_id=? AND va.actor_type IN (${marks}) AND va.status='ACTIVE'
       AND va.user_id IS NULL AND va.position_code IS NOT NULL
       AND va.valid_from<=NOW() AND (va.valid_until IS NULL OR va.valid_until>=NOW())
       AND (vs.id IS NULL OR (
         (vs.company_id IS NULL OR vs.company_id='' OR vs.company_id=?)
         AND (vs.department_id IS NULL OR vs.department_id='' OR vs.department_id=?)
         AND (vs.division_id IS NULL OR vs.division_id='' OR vs.division_id=?)
         AND (vs.domain_code IS NULL OR vs.domain_code='' OR vs.domain_code=?)
       )) LIMIT 1`,
    [ruleId, ...actorTypes, scope.company, scope.id_departement, scope.id_division, scope.domain]));
}

/** Adapter pilot Tahap 4. Return null berarti konfigurasi belum lengkap dan caller boleh memakai alur legacy. */
export async function requestPreventiveWoCloseValidation(moduleKey: string, woNumber: string, user: User, comment: string): Promise<Record<string, unknown> | null> {
  if (!['production', 'wo_preventive'].includes(moduleKey)) return null;
  if (!(await tableExists('validation_request')) || !(await tableExists('validation_assignment'))) return null;
  const rule = await one<Record<string, unknown>>(
    `SELECT * FROM validation_rule WHERE rule_code='MT02-CLOSE' AND status='ACTIVE'
     AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>=NOW()) ORDER BY version_no DESC LIMIT 1`);
  if (!rule) return null;
  const cfg = MODULE_MAP[moduleKey];
  const header = await one<Record<string, unknown>>(`SELECT * FROM ${cfg.table} WHERE wo_number=? LIMIT 1`, [woNumber]);
  if (!header) throw new HttpError(404, 'Work Order tidak ditemukan.');
  if (!['NEED_CLOSED', 'COMPLETE_EXECUTOR'].includes(String(header.status ?? ''))) return null;
  const existing = await one<Record<string, unknown>>(
    `SELECT id,request_number,state FROM validation_request WHERE rule_id=? AND source_type='WO_CLOSE' AND source_id=? AND target_status='CLOSED' LIMIT 1`,
    [rule.id, woNumber]);
  if (existing) return existing;

  const scope = { company: header.company ?? user.id_company, id_departement: user.id_departement, id_division: header.id_division ?? user.id_division, domain: moduleKey };
  const reviewerId = await assignedUser(Number(rule.id), ['CLOSE_REVIEWER', 'CHECKER', 'VERIFIER'], scope, user.id_user);
  const hasPositionReviewer = await hasPositionAssignment(Number(rule.id), ['CLOSE_REVIEWER', 'CHECKER', 'VERIFIER'], scope);
  if (!reviewerId && !hasPositionReviewer) return null;
  const approverId = Number(rule.requires_approver) === 1
    ? await assignedUser(Number(rule.id), ['APPROVER'], scope, user.id_user) : null;
  const hasPositionApprover = Number(rule.requires_approver) === 1
    ? await hasPositionAssignment(Number(rule.id), ['APPROVER'], scope) : false;
  if (Number(rule.requires_approver) === 1 && !approverId && !hasPositionApprover) return null;
  const requestNumber = `VAL-WO-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const sourceRoute = `/work-orders/production/${woNumber.split('/').map(encodeURIComponent).join('/')}`;
  const dueHours = Number(rule.sla_hours ?? 24);
  const hasWoEvidence = await tableExists('tb_wo_service_evidence');
  const id = await transaction(async (connection) => {
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO validation_request
       (request_number,rule_id,source_type,source_id,source_reference,source_route,source_status,target_status,
        title,description,module_code,domain_code,company_id,department_id,division_id,asset_id,maker_user_id,
        checker_user_id,approver_user_id,close_reviewer_user_id,state,risk_level,submitted_at,due_at,payload_snapshot,
        created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'CLOSED',?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_CLOSE_REVIEW',?,NOW(),DATE_ADD(NOW(),INTERVAL ? HOUR),?,?,?,NOW(),NOW())`,
      [requestNumber, rule.id, 'WO_CLOSE', woNumber, woNumber, sourceRoute, header.status,
        `Close Review ${woNumber}`, comment || `Review penutupan WO ${woNumber}`, rule.module_code, moduleKey,
        scope.company, scope.id_departement, scope.id_division, header.id_equipment ?? null, user.id_user,
        reviewerId, approverId, reviewerId, rule.risk_level, dueHours, JSON.stringify(header), user.fullname, user.fullname] as never);
    await connection.execute(
      `INSERT INTO validation_audit (request_id,event_type,new_snapshot,actor_user_id,actor_name,event_at)
       VALUES (?,'REQUEST_CREATED',?,?,?,NOW())`,
      [inserted.insertId, JSON.stringify({ state: 'PENDING_CLOSE_REVIEW', source_status: header.status }), user.id_user, user.fullname]);
    if (hasWoEvidence) {
      await connection.execute(
        `INSERT INTO validation_evidence
         (request_id,evidence_type,file_name,object_key,mime_type,source_mode,created_at)
         SELECT ?,'WO_EXECUTION',file_name,file_path,mime_type,'SOURCE_TRANSACTION',NOW()
         FROM tb_wo_service_evidence WHERE wo_number=?`, [inserted.insertId, woNumber]);
    }
    return inserted.insertId;
  });
  return { id, request_number: requestNumber, state: 'PENDING_CLOSE_REVIEW' };
}
