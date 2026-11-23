import crypto from 'node:crypto';
import multer from 'multer';
import { Router } from 'express';
import { authenticate } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { saveUploadedFile } from '../lib/storage.js';
import { addValidationEvidence, canAddValidationEvidence, decideValidationRequest, getValidationRequestDetail } from '../lib/validation-engine.js';
import { syncStockOpnameValidationDecision } from '../lib/stock-opname-validation.js';
import { recordValidationViolation, runValidationAutomation } from '../lib/validation-automation.js';
import type { AuthRequest } from '../types.js';

export const validationRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) callback(null, true);
    else callback(new HttpError(422, 'Format evidence harus JPG, PNG, WEBP, PDF, atau TXT.'));
  },
});

function positiveId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, 'ID request validasi tidak valid.');
  return id;
}

validationRouter.get('/validation/requests/:id', authenticate, asyncHandler(async (req, res) => {
  ok(res, await getValidationRequestDetail(positiveId(req.params.id), (req as AuthRequest).user!));
}));

validationRouter.post('/validation/requests/:id/evidence', authenticate, upload.array('files', 5), asyncHandler(async (req, res) => {
  const id = positiveId(req.params.id);
  const user = (req as AuthRequest).user!;
  await canAddValidationEvidence(id, user);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(422, 'Pilih minimal satu file evidence.');
  const evidenceType = String(req.body.evidence_type ?? 'SUPPORTING').toUpperCase().trim().slice(0, 40) || 'SUPPORTING';
  const saved = [];
  for (const file of files) {
    const objectKey = await saveUploadedFile(file.buffer, `validation/${id}`, file.originalname, file.mimetype);
    const evidenceId = await addValidationEvidence({
      requestId: id, evidenceType, fileName: file.originalname, objectKey, mimeType: file.mimetype,
      checksum: crypto.createHash('sha256').update(file.buffer).digest('hex'), user,
    });
    saved.push({ id: evidenceId, evidence_type: evidenceType, file_name: file.originalname, object_key: objectKey, url: `/uploads/${objectKey}` });
  }
  created(res, saved, 'Evidence validasi berhasil diunggah.');
}));

validationRouter.post('/validation/requests/:id/decision', authenticate, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.id);
  const user = (req as AuthRequest).user!;
  const action = String(req.body.action ?? '');
  const note = String(req.body.note ?? '');
  let result: Record<string, unknown>;
  try {
    result = await decideValidationRequest(id, action, note, String(req.body.reason_code ?? ''), user);
  } catch (error) {
    if (error instanceof HttpError && ['VALIDATION_SELF_APPROVE', 'VALIDATION_SELF_CHECK'].includes(String(error.code))) {
      await recordValidationViolation(id, 'MAKER_CHECKER_VIOLATION', error.message, user);
    }
    throw error;
  }
  const workflow = await syncStockOpnameValidationDecision(
    id, String(result.state ?? ''), action.toUpperCase(), note, String(req.headers.authorization ?? ''), user,
  );
  ok(res, { ...result, ...(workflow ? { stock_opname: workflow } : {}) }, 'Keputusan validasi berhasil disimpan.');
}));

const isValidationAdmin = (req: AuthRequest) => {
  const user = req.user!; const position = String(user.id_position ?? '').toUpperCase();
  return String(user.username ?? '').toUpperCase() === 'SUPERUSER' || Number(user.approval_all ?? 0) === 1
    || position.includes('MANAGEMENT') || position.includes('DIVHEAD');
};
const adminOnly = (req: AuthRequest) => { if (!isValidationAdmin(req)) throw new HttpError(403, 'Khusus administrator Validation Engine.'); };

validationRouter.get('/validation/notifications', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!(await tableExists('validation_notification'))) { ok(res, []); return; }
  ok(res, await rows(`SELECT * FROM validation_notification WHERE recipient_user_id=? ORDER BY read_at IS NULL DESC,scheduled_at DESC LIMIT 200`, [user.id_user]));
}));

validationRouter.patch('/validation/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const result = await execute(`UPDATE validation_notification SET status='READ',read_at=NOW() WHERE id=? AND recipient_user_id=?`, [positiveId(req.params.id), user.id_user]);
  if (!result.affectedRows) throw new HttpError(404, 'Notifikasi tidak ditemukan.'); ok(res, { id: positiveId(req.params.id) });
}));

validationRouter.get('/validation/ncr', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const user = authReq.user!;
  if (!(await tableExists('validation_ncr'))) { ok(res, []); return; }
  const status = String(req.query.status ?? '').toUpperCase();
  const params: unknown[] = [];
  let where = '';
  if (status) { where += ' AND n.status=?'; params.push(status); }
  if (!isValidationAdmin(authReq)) { where += ' AND (n.assigned_to_user_id=? OR r.maker_user_id=?)'; params.push(user.id_user, user.id_user); }
  ok(res, await rows(`SELECT n.*,r.request_number,r.module_code,r.source_route FROM validation_ncr n
    LEFT JOIN validation_request r ON r.id=n.request_id WHERE 1=1 ${where} ORDER BY n.status='OPEN' DESC,n.due_at,n.created_at DESC`, params));
}));

validationRouter.patch('/validation/ncr/:id', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; const user = authReq.user!; const id = positiveId(req.params.id);
  const current = await one<Record<string, unknown>>('SELECT * FROM validation_ncr WHERE id=?', [id]);
  if (!current) throw new HttpError(404, 'NCR tidak ditemukan.');
  if (!isValidationAdmin(authReq) && Number(current.assigned_to_user_id) !== user.id_user) throw new HttpError(403, 'NCR tidak ditugaskan kepada Anda.');
  const status = String(req.body.status ?? current.status).toUpperCase();
  if (!['OPEN', 'INVESTIGATING', 'CAPA_PENDING', 'VERIFIED', 'CLOSED'].includes(status)) throw new HttpError(422, 'Status NCR tidak valid.');
  await execute(`UPDATE validation_ncr SET status=?,root_cause=?,corrective_action=?,preventive_action=?,closed_by=IF(?='CLOSED',?,closed_by),closed_at=IF(?='CLOSED',NOW(),closed_at) WHERE id=?`,
    [status, String(req.body.root_cause ?? current.root_cause ?? '') || null, String(req.body.corrective_action ?? current.corrective_action ?? '') || null,
      String(req.body.preventive_action ?? current.preventive_action ?? '') || null, status, user.fullname, status, id]);
  ok(res, { id, status }, 'NCR diperbarui.');
}));

validationRouter.get('/validation/delegations', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq);
  ok(res, await rows(`SELECT d.*,a.fullname delegator_name,b.fullname delegate_name FROM validation_delegation d
    LEFT JOIN tb_user a ON a.id_user=d.delegator_user_id LEFT JOIN tb_user b ON b.id_user=d.delegate_user_id ORDER BY d.status='ACTIVE' DESC,d.valid_from DESC`));
}));

validationRouter.post('/validation/delegations', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); const user = authReq.user!;
  const delegator = Number(req.body.delegator_user_id); const delegate = Number(req.body.delegate_user_id);
  const actorType = String(req.body.actor_type ?? 'ALL').toUpperCase();
  const from = String(req.body.valid_from ?? ''); const until = String(req.body.valid_until ?? ''); const reason = String(req.body.reason ?? '').trim();
  if (!Number.isInteger(delegator) || !Number.isInteger(delegate) || delegator === delegate || !from || !until || !reason) throw new HttpError(422, 'Delegator, delegate, periode, dan alasan wajib valid.');
  const code = `DEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const id = await transaction(async (connection) => {
    const [inserted] = await connection.execute<any>(`INSERT INTO validation_delegation
      (delegation_code,delegator_user_id,delegate_user_id,actor_type,module_code,company_id,site_id,department_id,reason,valid_from,valid_until,status,approved_by_user_id,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,NOW())`,
    [code, delegator, delegate, actorType, String(req.body.module_code ?? '') || null, String(req.body.company_id ?? '') || null,
      String(req.body.site_id ?? '') || null, String(req.body.department_id ?? '') || null, reason, from, until, user.id_user, user.fullname]);
    await connection.execute(`INSERT INTO validation_assignment_audit
      (delegation_id,event_type,new_snapshot,actor_user_id,actor_name,event_at) VALUES (?,'DELEGATION_CREATED',?,?,?,NOW())`,
    [inserted.insertId, JSON.stringify(req.body), user.id_user, user.fullname]); return Number(inserted.insertId);
  });
  created(res, { id, delegation_code: code }, 'Delegasi dibuat.');
}));

validationRouter.patch('/validation/delegations/:id/status', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); const id = positiveId(req.params.id);
  const status = String(req.body.status ?? '').toUpperCase();
  if (!['ACTIVE', 'CANCELLED', 'EXPIRED'].includes(status)) throw new HttpError(422, 'Status delegasi tidak valid.');
  const old = await one('SELECT * FROM validation_delegation WHERE id=?', [id]); if (!old) throw new HttpError(404, 'Delegasi tidak ditemukan.');
  await transaction(async (connection) => {
    await connection.execute('UPDATE validation_delegation SET status=?,updated_at=NOW() WHERE id=?', [status, id]);
    await connection.execute(`INSERT INTO validation_assignment_audit
      (delegation_id,event_type,old_snapshot,new_snapshot,actor_user_id,actor_name,event_at) VALUES (?,'DELEGATION_STATUS_CHANGED',?,?,?,?,NOW())`,
    [id, JSON.stringify(old), JSON.stringify({ status }), authReq.user!.id_user, authReq.user!.fullname]);
  }); ok(res, { id, status });
}));

validationRouter.get('/validation/modules', authenticate, asyncHandler(async (_req, res) => {
  if (!(await tableExists('validation_module_registry'))) { ok(res, []); return; }
  ok(res, await rows('SELECT * FROM validation_module_registry ORDER BY rollout_order'));
}));

validationRouter.patch('/validation/modules/:code', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); const code = String(req.params.code ?? '').toUpperCase();
  const status = String(req.body.rollout_status ?? '').toUpperCase();
  if (!['REGISTERED', 'PILOT', 'ACTIVE', 'PAUSED'].includes(status)) throw new HttpError(422, 'Status rollout tidak valid.');
  const result = await execute(`UPDATE validation_module_registry SET rollout_status=?,evidence_config=COALESCE(?,evidence_config),
    transition_config=COALESCE(?,transition_config),activated_at=IF(? IN ('PILOT','ACTIVE'),COALESCE(activated_at,NOW()),activated_at),updated_at=NOW() WHERE module_code=?`,
  [status, req.body.evidence_config == null ? null : JSON.stringify(req.body.evidence_config),
    req.body.transition_config == null ? null : JSON.stringify(req.body.transition_config), status, code]);
  if (!result.affectedRows) throw new HttpError(404, 'Submodul tidak ditemukan.'); ok(res, { module_code: code, rollout_status: status });
}));

validationRouter.get('/validation/modules/:code/rules', authenticate, asyncHandler(async (req, res) => {
  const code = String(req.params.code ?? '').toUpperCase();
  ok(res, await rows('SELECT * FROM validation_rule WHERE module_code=? ORDER BY status=\'ACTIVE\' DESC,version_no DESC,id DESC', [code]));
}));

validationRouter.post('/validation/modules/:code/rules', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); const user = authReq.user!;
  const code = String(req.params.code ?? '').toUpperCase();
  const moduleRow = await one<Record<string, unknown>>('SELECT * FROM validation_module_registry WHERE module_code=?', [code]);
  if (!moduleRow) throw new HttpError(404, 'Submodul tidak ditemukan.');
  const ruleCode = String(req.body.rule_code ?? `${code}-DEFAULT`).toUpperCase().slice(0, 100);
  const version = Math.max(1, Number(req.body.version_no) || 1);
  const [inserted] = await transaction(async (connection) => connection.execute<any>(
    `INSERT INTO validation_rule
     (rule_code,module_code,feature_code,action_code,rule_name,risk_level,requires_checker,requires_approver,requires_evidence,
      prevent_self_check,prevent_self_approve,sla_hours,rule_config,version_no,status,created_by,updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ACTIVE',?,?,NOW(),NOW())`,
    [ruleCode, code, String(req.body.feature_code ?? `${code}-VALIDATION`), String(req.body.action_code ?? 'VALIDATE'),
      String(req.body.rule_name ?? `Validasi ${moduleRow.module_name}`), String(req.body.risk_level ?? moduleRow.default_risk_level ?? 'MEDIUM').toUpperCase(),
      req.body.requires_checker === false ? 0 : 1, req.body.requires_approver === false ? 0 : 1, req.body.requires_evidence === false ? 0 : 1,
      req.body.prevent_self_check === false ? 0 : 1, req.body.prevent_self_approve === false ? 0 : 1,
      Math.max(1, Number(req.body.sla_hours) || Number(moduleRow.default_sla_hours) || 24),
      JSON.stringify(req.body.rule_config ?? {}), version, user.fullname, user.fullname] as never));
  created(res, { id: inserted.insertId, rule_code: ruleCode, version_no: version }, 'Rule validasi dibuat.');
}));

validationRouter.get('/validation/rules/:id/assignments', authenticate, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.id);
  ok(res, await rows(`SELECT a.*,s.company_id,s.site_id,s.department_id,s.division_id,s.domain_code,u.fullname
    FROM validation_assignment a LEFT JOIN validation_scope s ON s.id=a.scope_id
    LEFT JOIN tb_user u ON u.id_user=a.user_id WHERE a.rule_id=? ORDER BY a.priority_no,a.id`, [id]));
}));

validationRouter.post('/validation/rules/:id/assignments', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); const user = authReq.user!; const ruleId = positiveId(req.params.id);
  if (!(await one('SELECT id FROM validation_rule WHERE id=?', [ruleId]))) throw new HttpError(404, 'Rule tidak ditemukan.');
  const actorType = String(req.body.actor_type ?? '').toUpperCase();
  if (!['CHECKER', 'VERIFIER', 'APPROVER', 'CLOSE_REVIEWER'].includes(actorType)) throw new HttpError(422, 'Actor assignment tidak valid.');
  const userId = Number(req.body.user_id) || null; const position = String(req.body.position_code ?? '').trim() || null;
  if (!userId && !position) throw new HttpError(422, 'Pilih user atau position assignment.');
  const id = await transaction(async (connection) => {
    let scopeId: number | null = null;
    const scope = req.body.scope && typeof req.body.scope === 'object' ? req.body.scope : null;
    if (scope) {
      const [scopeInsert] = await connection.execute<any>(`INSERT INTO validation_scope
        (rule_id,company_id,site_id,department_id,division_id,asset_category,asset_id,domain_code,status,created_at)
        VALUES (?,?,?,?,?,?,?,?, 'ACTIVE',NOW())`,
      [ruleId, scope.company_id || null, scope.site_id || null, scope.department_id || null, scope.division_id || null,
        scope.asset_category || null, Number(scope.asset_id) || null, scope.domain_code || null]); scopeId = Number(scopeInsert.insertId);
    }
    const [inserted] = await connection.execute<any>(`INSERT INTO validation_assignment
      (rule_id,scope_id,actor_type,user_id,position_code,priority_no,valid_from,valid_until,status,created_by,created_at)
      VALUES (?,?,?,?,?,?,COALESCE(?,NOW()),?,'ACTIVE',?,NOW())`,
    [ruleId, scopeId, actorType, userId, position, Math.max(1, Number(req.body.priority_no) || 1),
      req.body.valid_from || null, req.body.valid_until || null, user.fullname]);
    await connection.execute(`INSERT INTO validation_assignment_audit
      (assignment_id,event_type,new_snapshot,actor_user_id,actor_name,event_at) VALUES (?,'ASSIGNMENT_CREATED',?,?,?,NOW())`,
    [inserted.insertId, JSON.stringify(req.body), user.id_user, user.fullname]); return Number(inserted.insertId);
  });
  created(res, { id }, 'Assignment validasi dibuat.');
}));

validationRouter.post('/validation/requests', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!; const moduleCode = String(req.body.module_code ?? '').toUpperCase();
  const moduleRow = await one<Record<string, unknown>>(
    `SELECT * FROM validation_module_registry WHERE module_code=? AND rollout_status IN ('PILOT','ACTIVE')`, [moduleCode]);
  if (!moduleRow) throw new HttpError(422, 'Submodul belum aktif pada rollout Validation Engine.');
  const rule = await one<Record<string, unknown>>(
    `SELECT * FROM validation_rule WHERE module_code=? AND status='ACTIVE' AND effective_from<=NOW()
     AND (effective_until IS NULL OR effective_until>=NOW()) AND (?='' OR rule_code=?) ORDER BY version_no DESC,id DESC LIMIT 1`,
    [moduleCode, String(req.body.rule_code ?? ''), String(req.body.rule_code ?? '')]);
  if (!rule) throw new HttpError(422, 'Rule aktif untuk submodul belum tersedia.');
  const company = String(req.body.company_id ?? user.id_company ?? ''); const site = String(req.body.site_id ?? '');
  const findActor = async (actors: string[]) => one<{ user_id: number }>(
    `SELECT a.user_id FROM validation_assignment a LEFT JOIN validation_scope s ON s.id=a.scope_id AND s.status='ACTIVE'
     JOIN tb_user u ON u.id_user=a.user_id AND u.active=1 WHERE a.rule_id=? AND a.actor_type IN (${actors.map(() => '?').join(',')})
       AND a.status='ACTIVE' AND a.user_id<>? AND a.valid_from<=NOW() AND (a.valid_until IS NULL OR a.valid_until>=NOW())
       AND (s.id IS NULL OR ((s.company_id IS NULL OR s.company_id='' OR s.company_id=?) AND (s.site_id IS NULL OR s.site_id='' OR s.site_id=?)))
     ORDER BY a.priority_no,a.id LIMIT 1`, [rule.id, ...actors, user.id_user, company, site]);
  const checker = await findActor(['CHECKER', 'VERIFIER']); const approver = Number(rule.requires_approver) === 1 ? await findActor(['APPROVER']) : null;
  if (Number(rule.requires_checker) === 1 && !checker) throw new HttpError(422, 'Checker eksplisit aktif belum dikonfigurasi untuk scope ini.');
  if (Number(rule.requires_approver) === 1 && !approver) throw new HttpError(422, 'Approver eksplisit aktif belum dikonfigurasi untuk scope ini.');
  const sourceType = String(req.body.source_type ?? moduleCode); const sourceId = String(req.body.source_id ?? '').trim();
  if (!sourceId) throw new HttpError(422, 'source_id wajib diisi.');
  const requestNumber = `VAL-${moduleCode}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const [inserted] = await transaction(async (connection) => connection.execute<any>(`INSERT INTO validation_request
    (request_number,rule_id,source_type,source_id,source_reference,source_route,source_status,target_status,title,description,module_code,domain_code,
     company_id,site_id,department_id,division_id,asset_id,asset_code,maker_user_id,checker_user_id,approver_user_id,state,risk_level,submitted_at,due_at,
     payload_snapshot,created_by,updated_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'SUBMITTED',?,NOW(),DATE_ADD(NOW(),INTERVAL ? HOUR),?,?,?,NOW(),NOW())`,
  [requestNumber, rule.id, sourceType, sourceId, String(req.body.source_reference ?? sourceId), String(req.body.source_route ?? '') || null,
    String(req.body.source_status ?? '') || null, String(req.body.target_status ?? 'APPROVED'), String(req.body.title ?? `Validasi ${sourceId}`),
    String(req.body.description ?? '') || null, moduleCode, String(req.body.domain_code ?? '') || null, company, site || null,
    String(req.body.department_id ?? user.id_departement ?? '') || null, String(req.body.division_id ?? user.id_division ?? '') || null,
    Number(req.body.asset_id) || null, String(req.body.asset_code ?? '') || null, user.id_user, checker?.user_id ?? null, approver?.user_id ?? null,
    String(rule.risk_level), Math.max(1, Number(rule.sla_hours) || Number(moduleRow.default_sla_hours) || 24),
    JSON.stringify(req.body.payload ?? {}), user.fullname, user.fullname] as never));
  created(res, { id: inserted.insertId, request_number: requestNumber, state: 'SUBMITTED' }, 'Request validasi dibuat.');
}));

validationRouter.post('/validation/automation/run', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest; adminOnly(authReq); ok(res, await runValidationAutomation());
}));
