import type { ResultSetHeader } from 'mysql2/promise';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import type { User } from '../types.js';

const terminal = ['APPROVED', 'CLOSE_APPROVED', 'REJECTED', 'CANCELLED'];

function actorForState(state: string): { type: string; column: string } {
  if (state === 'PENDING_APPROVAL') return { type: 'APPROVER', column: 'approver_user_id' };
  if (state === 'PENDING_CLOSE_REVIEW') return { type: 'CLOSE_REVIEWER', column: 'close_reviewer_user_id' };
  if (state === 'RETURNED') return { type: 'MAKER', column: 'maker_user_id' };
  return { type: 'CHECKER', column: 'checker_user_id' };
}

async function createNcr(input: {
  requestId?: number | null; sourceType: string; sourceReference: string; type: string;
  severity?: string; title: string; description: string; assignee?: number | null; createdBy?: string;
}): Promise<number | null> {
  if (!(await tableExists('validation_ncr'))) return null;
  const number = `NCR-VAL-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const result = await execute(
    `INSERT INTO validation_ncr
     (ncr_number,request_id,source_type,source_reference,ncr_type,severity,title,description,assigned_to_user_id,due_at,status,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 48 HOUR),'OPEN',?,NOW())
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),description=VALUES(description)`,
    [number, input.requestId ?? null, input.sourceType, input.sourceReference, input.type, input.severity ?? 'HIGH',
      input.title, input.description, input.assignee ?? null, input.createdBy ?? 'SYSTEM'],
  );
  return result.insertId || null;
}

export async function recordValidationViolation(requestId: number, type: string, description: string, user: User): Promise<void> {
  const request = await one<{ request_number: string; source_type: string; source_reference: string }>(
    'SELECT request_number,source_type,source_reference FROM validation_request WHERE id=?', [requestId]);
  if (!request) return;
  await createNcr({ requestId, sourceType: request.source_type, sourceReference: `${request.source_reference}:${user.id_user}`,
    type, severity: 'CRITICAL', title: `Pelanggaran validasi ${request.request_number}`, description, createdBy: user.fullname });
}

export async function runValidationAutomation(): Promise<Record<string, number>> {
  if (!(await tableExists('validation_notification')) || !(await tableExists('validation_request'))) {
    return { delegated: 0, reminders: 0, escalations: 0, ncr: 0, expired: 0 };
  }
  let delegated = 0; let reminders = 0; let escalations = 0; let ncr = 0; let expired = 0;

  const expiredRows = await rows<{ id: number }>(
    `SELECT id FROM validation_delegation WHERE status='ACTIVE' AND valid_until<NOW()`);
  for (const item of expiredRows) {
    await transaction(async (connection) => {
      await connection.execute(`UPDATE validation_delegation SET status='EXPIRED',updated_at=NOW() WHERE id=? AND status='ACTIVE'`, [item.id]);
      await connection.execute(`INSERT INTO validation_assignment_audit
        (delegation_id,event_type,new_snapshot,actor_name,event_at) VALUES (?,'DELEGATION_EXPIRED',?,'SYSTEM',NOW())`,
      [item.id, JSON.stringify({ status: 'EXPIRED' })]);
    }); expired += 1;
  }

  const open = await rows<Record<string, unknown>>(
    `SELECT r.*,u.active assigned_active FROM validation_request r
     LEFT JOIN tb_user u ON u.id_user=CASE
       WHEN r.state='PENDING_APPROVAL' THEN r.approver_user_id
       WHEN r.state='PENDING_CLOSE_REVIEW' THEN r.close_reviewer_user_id
       WHEN r.state='RETURNED' THEN r.maker_user_id ELSE r.checker_user_id END
     WHERE r.state NOT IN (${terminal.map(() => '?').join(',')})`, terminal);

  for (const request of open) {
    const state = String(request.state); const actor = actorForState(state);
    let recipient = Number(request[actor.column] ?? 0) || null;
    if (!recipient) {
      const assigned = await one<{ user_id: number }>(
        `SELECT u.id_user user_id FROM validation_assignment a
         LEFT JOIN validation_scope s ON s.id=a.scope_id AND s.status='ACTIVE'
         JOIN tb_user u ON u.active=1 AND (u.id_user=a.user_id OR (a.user_id IS NULL AND a.position_code=u.id_position))
         WHERE a.rule_id=? AND a.actor_type IN (?,IF(?='CHECKER','VERIFIER',?)) AND a.status='ACTIVE'
           AND a.valid_from<=NOW() AND (a.valid_until IS NULL OR a.valid_until>=NOW())
           AND (s.id IS NULL OR ((s.company_id IS NULL OR s.company_id='' OR s.company_id=?)
             AND (s.site_id IS NULL OR s.site_id='' OR s.site_id=?)))
         ORDER BY a.priority_no,a.id,u.id_user LIMIT 1`,
        [request.rule_id, actor.type, actor.type, actor.type, request.company_id, request.site_id]);
      recipient = assigned?.user_id ?? null;
    }
    if (recipient && Number(request.assigned_active ?? 0) !== 1) {
      const delegate = await one<{ id: number; delegate_user_id: number }>(
        `SELECT d.id,d.delegate_user_id FROM validation_delegation d JOIN tb_user u ON u.id_user=d.delegate_user_id AND u.active=1
         WHERE d.status='ACTIVE' AND d.delegator_user_id=? AND d.actor_type IN (?, 'ALL')
           AND (d.module_code IS NULL OR d.module_code='' OR d.module_code=?)
           AND (d.company_id IS NULL OR d.company_id='' OR d.company_id=?)
           AND d.valid_from<=NOW() AND d.valid_until>=NOW() ORDER BY d.valid_until,d.id LIMIT 1`,
        [recipient, actor.type, request.module_code, request.company_id]);
      if (delegate) {
        await transaction(async (connection) => {
          await connection.execute(`UPDATE validation_request SET ${actor.column}=?,updated_by='SYSTEM_DELEGATION',updated_at=NOW() WHERE id=?`, [delegate.delegate_user_id, Number(request.id)]);
          await connection.execute(`INSERT INTO validation_assignment_audit
            (delegation_id,event_type,old_snapshot,new_snapshot,actor_name,event_at)
            VALUES (?,'REQUEST_DELEGATED',?,?, 'SYSTEM',NOW())`,
          [delegate.id, JSON.stringify({ user_id: recipient }), JSON.stringify({ user_id: delegate.delegate_user_id, request_id: request.id })]);
        }); recipient = delegate.delegate_user_id; delegated += 1;
      }
    }
    if (!recipient) continue;
    const due = request.due_at ? new Date(String(request.due_at)) : null;
    const hours = due ? (Date.now() - due.getTime()) / 3600000 : -999;
    const kind = hours >= 0 ? 'OVERDUE' : 'REMINDER';
    const bucket = hours >= 0 ? Math.min(3, Math.floor(hours / 24) + 1) : 0;
    if (hours >= -24) {
      const notification = await execute(
        `INSERT IGNORE INTO validation_notification
         (request_id,recipient_user_id,notification_type,notification_key,title,message,status,scheduled_at,created_at)
         VALUES (?,?,?,?,?,?,'PENDING',NOW(),NOW())`,
        [request.id, recipient, kind, `${request.id}:${kind}:${bucket}`, `${kind === 'OVERDUE' ? 'Overdue' : 'Reminder'} validasi ${request.request_number}`,
          `${request.title} ${hours >= 0 ? `terlambat ${Math.ceil(hours)} jam` : 'mendekati SLA'}.`]);
      reminders += notification.affectedRows;
    }
    if (hours >= 0) {
      const level = Math.min(3, Math.floor(hours / 24) + 1);
      const supervisor = await one<{ id_user: number }>(
        `SELECT id_user FROM tb_user WHERE active=1 AND id_user<>?
         AND (approval_all=1 OR UPPER(id_position) LIKE '%DIVHEAD%' OR UPPER(id_position) LIKE '%MANAGEMENT%')
         AND (?='' OR id_company=?) ORDER BY approval_all DESC,id_user LIMIT 1`,
        [recipient, String(request.company_id ?? ''), String(request.company_id ?? '')]);
      const escalation = await execute(
        `INSERT IGNORE INTO validation_escalation
         (request_id,escalation_level,from_user_id,to_user_id,reason,escalated_at,status)
         VALUES (?,?,?,?,?,NOW(),'OPEN')`,
        [request.id, level, recipient, supervisor?.id_user ?? null, `SLA overdue ${Math.ceil(hours)} jam`]);
      escalations += escalation.affectedRows;
      if (supervisor?.id_user) {
        const escalatedNotice = await execute(
          `INSERT IGNORE INTO validation_notification
           (request_id,recipient_user_id,notification_type,notification_key,title,message,status,scheduled_at,created_at)
           VALUES (?,?,'ESCALATION',?,?,?,'PENDING',NOW(),NOW())`,
          [request.id, supervisor.id_user, `${request.id}:ESCALATION:${level}`, `Eskalasi level ${level} ${request.request_number}`,
            `${request.title} overdue ${Math.ceil(hours)} jam.`]);
        reminders += escalatedNotice.affectedRows;
      }
      if (level >= 2) {
        const ncrId = await createNcr({ requestId: Number(request.id), sourceType: String(request.source_type),
          sourceReference: String(request.source_reference), type: 'SLA_OVERDUE', title: `SLA validasi overdue ${request.request_number}`,
          description: `${request.title} terlambat ${Math.ceil(hours)} jam.`, assignee: recipient });
        if (ncrId) ncr += 1;
      }
    }
  }

  if (await tableExists('stock_opname_validation_exception')) {
    const exceptions = await rows<Record<string, unknown>>(
      `SELECT e.*,c.no_so FROM stock_opname_validation_exception e JOIN stock_opname_validation_control c ON c.id=e.control_id
       WHERE e.status='OPEN' AND e.ncr_id IS NULL AND e.exception_type IN ('MISSING','DAMAGED','UNREGISTERED','UNSAFE','INVALID_EVIDENCE','MAKER_CHECKER_VIOLATION')`);
    for (const item of exceptions) {
      const ncrId = await createNcr({ requestId: Number(item.validation_request_id) || null, sourceType: 'STOCK_OPNAME',
        sourceReference: `${item.no_so}:${item.id}`, type: String(item.exception_type), severity: String(item.severity),
        title: `${item.exception_type} Stock Opname ${item.no_so}`, description: String(item.description) });
      if (ncrId) { await execute('UPDATE stock_opname_validation_exception SET ncr_id=? WHERE id=?', [ncrId, item.id]); ncr += 1; }
    }
  }
  return { delegated, reminders, escalations, ncr, expired };
}
