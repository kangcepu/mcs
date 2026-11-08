import crypto from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyGovernanceRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset', 'approve_asset', 'approval_all');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];
    if (!allowed.includes(file.mimetype)) return callback(new HttpError(422, 'Evidence harus berupa PDF, JPG, PNG, WEBP, atau TXT.'));
    callback(null, true);
  },
});

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

async function ensureFeature(): Promise<void> {
  if (!(await tableExists('energy_governance_ncr')) || !(await tableExists('energy_governance_audit'))) {
    throw new HttpError(503, 'Energy Governance belum tersedia. Jalankan migration 20261108_energy_governance.sql.');
  }
}

function positiveId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, `${field} tidak valid.`);
  return id;
}

function requiredText(value: unknown, field: string, max: number): string {
  const result = String(value ?? '').trim();
  if (!result) throw new HttpError(422, `${field} wajib diisi.`);
  if (result.length > max) throw new HttpError(422, `${field} maksimal ${max} karakter.`);
  return result;
}

function optionalText(value: unknown, max: number): string | null {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (result.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return result;
}

function dateOnly(value: unknown): string | null {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new HttpError(422, 'Tanggal tidak valid.');
  return result;
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

async function audit(connection: PoolConnection, entityId: number, type: string, summary: string, actor: string, data?: unknown): Promise<void> {
  await connection.execute(
    `INSERT INTO energy_governance_audit (entity_type,entity_id,event_type,event_summary,event_data,actor_name,event_at)
     VALUES ('NCR',?,?,?,?,?,NOW())`,
    [entityId, type, summary, data ? JSON.stringify(data) : null, actor] as never,
  );
}

async function syncAutomaticNcr(): Promise<void> {
  const inserts: Array<{ table: string; sql: string }> = [
    {
      table: 'energy_utility_operation',
      sql: `INSERT IGNORE INTO energy_governance_ncr
        (ncr_number,source_type,source_id,source_key,energy_profile_id,category,severity,title,description,detected_at,status,created_by,created_at)
        SELECT CONCAT('NCR-UTL-',o.id),'UTILITY_OPERATION',o.id,CONCAT('UTILITY_OPERATION:',o.id),u.energy_profile_id,
          'ABNORMAL_OPERATION','HIGH',CONCAT('Parameter abnormal - ',a.AssetName),
          CONCAT('Pemeriksaan utility mencatat kondisi abnormal. ',COALESCE(o.abnormal_reasons,'Periksa detail inspeksi.')),
          o.inspected_at,'OPEN','SYSTEM',NOW()
        FROM energy_utility_operation o JOIN energy_utility_profile u ON u.id=o.utility_profile_id
        JOIN energy_asset_profile p ON p.id=u.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
        WHERE o.status='LOCKED' AND o.condition_status='ABNORMAL'`,
    },
    {
      table: 'energy_meter_calibration',
      sql: `INSERT IGNORE INTO energy_governance_ncr
        (ncr_number,source_type,source_id,source_key,energy_profile_id,category,severity,title,description,detected_at,status,created_by,created_at)
        SELECT CONCAT('NCR-CAL-',c.id),'METER_CALIBRATION',c.id,CONCAT('METER_CALIBRATION:',c.id),m.energy_profile_id,
          'CALIBRATION_FAIL','CRITICAL',CONCAT('Kalibrasi gagal - ',a.AssetName),
          CONCAT('Hasil kalibrasi ',c.calibration_number,' berstatus FAIL. Sertifikat: ',COALESCE(c.certificate_number,'-')),
          c.performed_at,'OPEN','SYSTEM',NOW()
        FROM energy_meter_calibration c JOIN energy_meter m ON m.id=c.meter_id
        JOIN energy_asset_profile p ON p.id=m.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
        WHERE c.status='APPROVED' AND c.result='FAIL'`,
    },
    {
      table: 'energy_fuel_stock_opname',
      sql: `INSERT IGNORE INTO energy_governance_ncr
        (ncr_number,source_type,source_id,source_key,energy_profile_id,category,severity,title,description,detected_at,status,created_by,created_at)
        SELECT CONCAT('NCR-OPN-',o.id),'FUEL_STOCK_OPNAME',o.id,CONCAT('FUEL_STOCK_OPNAME:',o.id),t.energy_profile_id,
          'STOCK_VARIANCE',CASE WHEN ABS(o.variance_liter)>GREATEST(o.tolerance_liter*2,1) THEN 'HIGH' ELSE 'MEDIUM' END,
          CONCAT('Selisih stok fuel - ',a.AssetName),
          CONCAT('Opname ',o.opname_number,' memiliki selisih ',o.variance_liter,' liter; toleransi ',o.tolerance_liter,' liter.'),
          o.opname_at,'OPEN','SYSTEM',NOW()
        FROM energy_fuel_stock_opname o JOIN energy_fuel_tank t ON t.id=o.fuel_tank_id
        JOIN energy_asset_profile p ON p.id=t.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
        WHERE o.status='APPROVED' AND ABS(o.variance_liter)>o.tolerance_liter`,
    },
  ];
  for (const item of inserts) {
    if (!(await tableExists(item.table))) continue;
    await rows(item.sql);
  }
  await rows(`INSERT INTO energy_governance_audit
    (entity_type,entity_id,event_type,event_summary,event_data,actor_name,event_at)
    SELECT 'NCR',n.id,'AUTO_DETECTED',CONCAT(n.ncr_number,' terdeteksi otomatis'),
      JSON_OBJECT('source_type',n.source_type,'source_id',n.source_id,'severity',n.severity),'SYSTEM',n.created_at
    FROM energy_governance_ncr n
    WHERE n.created_by='SYSTEM' AND NOT EXISTS (
      SELECT 1 FROM energy_governance_audit a
      WHERE a.entity_type='NCR' AND a.entity_id=n.id AND a.event_type='AUTO_DETECTED'
    )`);
}

export async function syncAutomaticEnergyNcr(): Promise<void> {
  if (!config.energyModuleEnabled || !(await tableExists('energy_governance_ncr'))) return;
  await syncAutomaticNcr();
}

type ApprovalItem = Record<string, unknown> & { source_type: string; source_id: number; submitted_at: string };

async function approvalQueue(): Promise<ApprovalItem[]> {
  const definitions: Array<{ table: string; sql: string }> = [
    { table: 'energy_meter_reading', sql: `SELECT 'METER_READING' source_type,r.id source_id,CONCAT('Reading ',a.AssetCode) reference_label,a.AssetCode asset_code,a.AssetName asset_name,r.status,r.submitted_at,CONCAT(r.consumption,' ',m.unit) detail FROM energy_meter_reading r JOIN energy_meter m ON m.id=r.meter_id JOIN energy_asset_profile p ON p.id=m.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE r.status IN ('SUBMITTED','VALIDATED')` },
    { table: 'energy_meter_correction', sql: `SELECT 'METER_CORRECTION' source_type,c.id source_id,CONCAT('Koreksi reading ',a.AssetCode) reference_label,a.AssetCode asset_code,a.AssetName asset_name,c.status,c.requested_at submitted_at,c.reason detail FROM energy_meter_correction c JOIN energy_meter_reading r ON r.id=c.reading_id JOIN energy_meter m ON m.id=r.meter_id JOIN energy_asset_profile p ON p.id=m.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE c.status='REQUESTED'` },
    { table: 'energy_genset_operation', sql: `SELECT 'GENSET_OPERATION' source_type,o.id source_id,CONCAT('Operasi genset ',a.AssetCode) reference_label,a.AssetCode asset_code,a.AssetName asset_name,o.status,o.updated_at submitted_at,CONCAT(COALESCE(o.fuel_consumed_liter,0),' L fuel') detail FROM energy_genset_operation o JOIN energy_genset_profile g ON g.id=o.genset_profile_id JOIN energy_asset_profile p ON p.id=g.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE o.status='SUBMITTED'` },
    { table: 'energy_fuel_movement', sql: `SELECT 'FUEL_MOVEMENT' source_type,m.id source_id,CONCAT(m.movement_type,' ',COALESCE(m.reference_number,'')) reference_label,a.AssetCode asset_code,a.AssetName asset_name,m.status,m.updated_at submitted_at,CONCAT(m.quantity_liter,' L') detail FROM energy_fuel_movement m JOIN energy_fuel_tank t ON t.id=m.fuel_tank_id JOIN energy_asset_profile p ON p.id=t.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE m.status='SUBMITTED'` },
    { table: 'energy_fuel_stock_opname', sql: `SELECT 'FUEL_STOCK_OPNAME' source_type,o.id source_id,o.opname_number reference_label,a.AssetCode asset_code,a.AssetName asset_name,o.status,o.submitted_at,CONCAT('Selisih ',o.variance_liter,' L') detail FROM energy_fuel_stock_opname o JOIN energy_fuel_tank t ON t.id=o.fuel_tank_id JOIN energy_asset_profile p ON p.id=t.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE o.status='SUBMITTED'` },
    { table: 'energy_utility_operation', sql: `SELECT 'UTILITY_OPERATION' source_type,o.id source_id,CONCAT('Inspeksi ',a.AssetCode) reference_label,a.AssetCode asset_code,a.AssetName asset_name,o.status,o.submitted_at,o.condition_status detail FROM energy_utility_operation o JOIN energy_utility_profile u ON u.id=o.utility_profile_id JOIN energy_asset_profile p ON p.id=u.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE o.status='SUBMITTED'` },
    { table: 'energy_utility_allocation', sql: `SELECT 'UTILITY_ALLOCATION' source_type,x.id source_id,x.allocation_number reference_label,a.AssetCode asset_code,a.AssetName asset_name,x.status,x.submitted_at,CONCAT(x.source_quantity,' ',x.unit) detail FROM energy_utility_allocation x JOIN energy_asset_profile p ON p.id=x.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE x.status='SUBMITTED'` },
    { table: 'energy_meter_calibration', sql: `SELECT 'METER_CALIBRATION' source_type,c.id source_id,c.calibration_number reference_label,a.AssetCode asset_code,a.AssetName asset_name,c.status,c.submitted_at,c.result detail FROM energy_meter_calibration c JOIN energy_meter m ON m.id=c.meter_id JOIN energy_asset_profile p ON p.id=m.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE c.status='SUBMITTED'` },
  ];
  const result: ApprovalItem[] = [];
  for (const definition of definitions) {
    if (await tableExists(definition.table)) result.push(...await rows<ApprovalItem>(definition.sql));
  }
  return result.sort((a, b) => String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? '')));
}

energyGovernanceRouter.use('/energy', authenticate, featureEnabled);

energyGovernanceRouter.get('/energy/governance', canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  await syncAutomaticNcr();
  const status = optionalText(req.query.status, 30);
  const severity = optionalText(req.query.severity, 20);
  const q = optionalText(req.query.q, 120);
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push('n.status=?'); params.push(status.toUpperCase()); }
  if (severity) { where.push('n.severity=?'); params.push(severity.toUpperCase()); }
  if (q) { where.push('(n.ncr_number LIKE ? OR n.title LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  const ncrs = await rows<Record<string, unknown>>(
    `SELECT n.*,a.AssetCode,a.AssetName,a.CompanyName,a.LocationAsset,
      (SELECT COUNT(*) FROM energy_governance_evidence e WHERE e.ncr_id=n.id) evidence_count,
      (SELECT COUNT(*) FROM energy_governance_ncr_action x WHERE x.ncr_id=n.id) action_count
     FROM energy_governance_ncr n LEFT JOIN energy_asset_profile p ON p.id=n.energy_profile_id
     LEFT JOIN asset a ON a.AssetID=p.asset_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(n.status,'OPEN','IN_PROGRESS','PENDING_VERIFICATION','CLOSED','CANCELLED'),FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.detected_at DESC`, params);
  const approvals = await approvalQueue();
  const counts = await one<Record<string, number | string>>(
    `SELECT COUNT(*) total,
      SUM(status IN ('OPEN','IN_PROGRESS','PENDING_VERIFICATION')) open_total,
      SUM(severity IN ('CRITICAL','HIGH') AND status NOT IN ('CLOSED','CANCELLED')) high_total,
      SUM(due_date<CURDATE() AND status NOT IN ('CLOSED','CANCELLED')) overdue_total
     FROM energy_governance_ncr`);
  const governanceAudit = await rows<Record<string, unknown>>(
    `SELECT g.*,n.ncr_number,n.title FROM energy_governance_audit g
     LEFT JOIN energy_governance_ncr n ON n.id=g.entity_id AND g.entity_type='NCR'
     ORDER BY g.event_at DESC,g.id DESC LIMIT 150`);
  const systemAudit = await tableExists('tb_system_activity_log') ? await rows<Record<string, unknown>>(
    `SELECT id,'SYSTEM' entity_type,0 entity_id,action event_type,CONCAT(method,' ',route) event_summary,
      request_data event_data,actor_fullname actor_name,created_at event_at,outcome,http_status
     FROM tb_system_activity_log WHERE route LIKE 'api/v2/energy/%' ORDER BY created_at DESC,id DESC LIMIT 100`) : [];
  ok(res, {
    summary: { total: Number(counts?.total ?? 0), open: Number(counts?.open_total ?? 0), high: Number(counts?.high_total ?? 0), overdue: Number(counts?.overdue_total ?? 0), approvals: approvals.length },
    approvals, ncrs,
    audit: [...governanceAudit, ...systemAudit].sort((a, b) => String(b.event_at).localeCompare(String(a.event_at))).slice(0, 200),
  });
}));

energyGovernanceRouter.get('/energy/governance/ncr/:id', canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = positiveId(req.params.id, 'NCR ID');
  const item = await one<Record<string, unknown>>(
    `SELECT n.*,a.AssetCode,a.AssetName,a.CompanyName,a.LocationAsset FROM energy_governance_ncr n
     LEFT JOIN energy_asset_profile p ON p.id=n.energy_profile_id LEFT JOIN asset a ON a.AssetID=p.asset_id WHERE n.id=?`, [id]);
  if (!item) throw new HttpError(404, 'NCR tidak ditemukan.');
  const actions = await rows('SELECT * FROM energy_governance_ncr_action WHERE ncr_id=? ORDER BY acted_at DESC,id DESC', [id]);
  const evidence = await rows<Record<string, unknown>>('SELECT * FROM energy_governance_evidence WHERE ncr_id=? ORDER BY created_at DESC,id DESC', [id]);
  ok(res, { ...item, actions, evidence: evidence.map((file) => ({ ...file, url: `/uploads/${String(file.object_key).replace(/^\/+/, '')}` })) });
}));

energyGovernanceRouter.post('/energy/governance/ncr', canManage, asyncHandler(async (req, res) => {
  await ensureFeature();
  const actor = String((req as AuthRequest).user!.fullname);
  const profileId = req.body.energy_profile_id ? positiveId(req.body.energy_profile_id, 'Energy Profile ID') : null;
  if (profileId && !(await one('SELECT id FROM energy_asset_profile WHERE id=?', [profileId]))) throw new HttpError(404, 'Energy Asset Profile tidak ditemukan.');
  const severity = String(req.body.severity ?? 'MEDIUM').toUpperCase();
  if (!['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity)) throw new HttpError(422, 'Severity NCR tidak valid.');
  const number = `NCR-ENG-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const id = await transaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_governance_ncr
       (ncr_number,source_type,source_id,source_key,energy_profile_id,category,severity,title,description,detected_at,due_date,assigned_to,status,created_by,updated_by,created_at,updated_at)
       VALUES (?,'MANUAL',NULL,?,?,?, ?,?,?,NOW(),?,?,'OPEN',?,?,NOW(),NOW())`,
      [number,`MANUAL:${crypto.randomUUID()}`,profileId,requiredText(req.body.category,'Kategori',40).toUpperCase(),severity,
        requiredText(req.body.title,'Judul',220),requiredText(req.body.description,'Deskripsi',5000),dateOnly(req.body.due_date),optionalText(req.body.assigned_to,120),actor,actor] as never);
    await connection.execute(`INSERT INTO energy_governance_ncr_action (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,'CREATE',NULL,'OPEN',?, ?,NOW())`, [result.insertId, optionalText(req.body.note,2000), actor]);
    await audit(connection, result.insertId, 'NCR_CREATED', `NCR ${number} dibuat`, actor);
    return result.insertId;
  });
  created(res, { id, ncr_number: number }, 'NCR Energy dibuat.');
}));

energyGovernanceRouter.patch('/energy/governance/ncr/:id/action', canManage, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = positiveId(req.params.id, 'NCR ID');
  const action = String(req.body.action ?? '').toUpperCase();
  const transitions: Record<string, { allowed: string[]; target: string }> = {
    ASSIGN: { allowed: ['OPEN','IN_PROGRESS'], target: 'IN_PROGRESS' },
    START: { allowed: ['OPEN'], target: 'IN_PROGRESS' },
    SUBMIT_VERIFICATION: { allowed: ['IN_PROGRESS'], target: 'PENDING_VERIFICATION' },
    REOPEN: { allowed: ['PENDING_VERIFICATION','CLOSED'], target: 'IN_PROGRESS' },
    CANCEL: { allowed: ['OPEN','IN_PROGRESS'], target: 'CANCELLED' },
  };
  if (!transitions[action]) throw new HttpError(422, 'Action NCR tidak valid.');
  const actor = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{status:string;ncr_number:string}>(connection, 'SELECT status,ncr_number FROM energy_governance_ncr WHERE id=? FOR UPDATE', [id]);
    if (!item) throw new HttpError(404, 'NCR tidak ditemukan.');
    const transition = transitions[action];
    if (!transition.allowed.includes(item.status)) throw new HttpError(409, `NCR berstatus ${item.status} tidak dapat diproses dengan action ${action}.`);
    const root = optionalText(req.body.root_cause,5000);
    const corrective = optionalText(req.body.corrective_action,5000);
    if (action === 'SUBMIT_VERIFICATION' && (!root || !corrective)) throw new HttpError(422, 'Root cause dan corrective action wajib diisi sebelum verifikasi.');
    await connection.execute(
      `UPDATE energy_governance_ncr SET status=?,assigned_to=COALESCE(?,assigned_to),due_date=COALESCE(?,due_date),
       root_cause=COALESCE(?,root_cause),corrective_action=COALESCE(?,corrective_action),preventive_action=COALESCE(?,preventive_action),
       updated_by=?,updated_at=NOW() WHERE id=?`,
      [transition.target,optionalText(req.body.assigned_to,120),dateOnly(req.body.due_date),root,corrective,optionalText(req.body.preventive_action,5000),actor,id] as never);
    const note = optionalText(req.body.action_note,5000);
    await connection.execute(`INSERT INTO energy_governance_ncr_action (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,?,?,?,?,?,NOW())`, [id,action,item.status,transition.target,note,actor]);
    await audit(connection,id,action,`${item.ncr_number}: ${item.status} → ${transition.target}`,actor,{note});
  });
  ok(res,{id,status:transitions[action].target},'Status NCR diperbarui.');
}));

energyGovernanceRouter.post('/energy/governance/ncr/:id/verify', canApprove, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = positiveId(req.params.id, 'NCR ID');
  const action = String(req.body.action ?? '').toUpperCase();
  if (!['CLOSE','REJECT'].includes(action)) throw new HttpError(422, 'Action harus CLOSE atau REJECT.');
  const actor = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{status:string;ncr_number:string}>(connection,'SELECT status,ncr_number FROM energy_governance_ncr WHERE id=? FOR UPDATE',[id]);
    if (!item) throw new HttpError(404,'NCR tidak ditemukan.');
    if (item.status !== 'PENDING_VERIFICATION') throw new HttpError(409,'NCR harus menunggu verifikasi.');
    const target = action === 'CLOSE' ? 'CLOSED' : 'IN_PROGRESS';
    const note = requiredText(req.body.verification_note,'Catatan verifikasi',5000);
    await connection.execute(
      `UPDATE energy_governance_ncr SET status=?,resolution_note=?,verified_by=?,verified_at=NOW(),closed_by=?,closed_at=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [target,note,actor,action==='CLOSE'?actor:null,action==='CLOSE'?new Date():null,actor,id] as never);
    await connection.execute(`INSERT INTO energy_governance_ncr_action (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,?,?,?,?,?,NOW())`,[id,action,item.status,target,note,actor]);
    await audit(connection,id,action,`${item.ncr_number}: ${action==='CLOSE'?'ditutup':'dikembalikan'}`,actor,{note});
  });
  ok(res,{id,status:action==='CLOSE'?'CLOSED':'IN_PROGRESS'},action==='CLOSE'?'NCR diverifikasi dan ditutup.':'NCR dikembalikan untuk perbaikan.');
}));

energyGovernanceRouter.post('/energy/governance/ncr/:id/evidence', canManage, evidenceUpload.array('files',5), asyncHandler(async (req,res)=>{
  await ensureFeature();
  const id=positiveId(req.params.id,'NCR ID');
  const item=await one<{ncr_number:string}>('SELECT ncr_number FROM energy_governance_ncr WHERE id=?',[id]);
  if(!item) throw new HttpError(404,'NCR tidak ditemukan.');
  const files=(req.files as Express.Multer.File[]|undefined)??[];
  if(!files.length) throw new HttpError(422,'Pilih minimal satu evidence.');
  const documentType=String(req.body.document_type??'OTHER').toUpperCase();
  if(!['SOP','ISO','PHOTO','CERTIFICATE','REPORT','OTHER'].includes(documentType)) throw new HttpError(422,'Jenis evidence tidak valid.');
  const actor=String((req as AuthRequest).user!.fullname);
  const saved=[];
  for(const file of files){
    const key=await saveUploadedFile(file.buffer,`energy/governance/${id}`,file.originalname,file.mimetype);
    const evidenceId=await transaction(async connection=>{
      const [result]=await connection.execute<ResultSetHeader>(`INSERT INTO energy_governance_evidence
        (ncr_id,document_type,standard_reference,revision_number,effective_date,description,file_name,object_key,mime_type,file_size,uploaded_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,[id,documentType,optionalText(req.body.standard_reference,180),optionalText(req.body.revision_number,60),dateOnly(req.body.effective_date),optionalText(req.body.description,500),file.originalname,key,file.mimetype,file.size,actor] as never);
      await audit(connection,id,'EVIDENCE_UPLOADED',`${documentType}: ${file.originalname}`,actor);
      return result.insertId;
    });
    saved.push({id:evidenceId,file_name:file.originalname,url:`/uploads/${key}`});
  }
  created(res,saved,'Evidence NCR diunggah.');
}));

energyGovernanceRouter.delete('/energy/governance/evidence/:id', canManage, asyncHandler(async(req,res)=>{
  await ensureFeature();
  const id=positiveId(req.params.id,'Evidence ID');
  const item=await one<{ncr_id:number;object_key:string;file_name:string}>('SELECT ncr_id,object_key,file_name FROM energy_governance_evidence WHERE id=?',[id]);
  if(!item) throw new HttpError(404,'Evidence tidak ditemukan.');
  const actor=String((req as AuthRequest).user!.fullname);
  await transaction(async connection=>{await connection.execute('DELETE FROM energy_governance_evidence WHERE id=?',[id]);await audit(connection,item.ncr_id,'EVIDENCE_DELETED',`Evidence ${item.file_name} dihapus`,actor);});
  await deleteObjectKey(item.object_key);
  ok(res,{id},'Evidence dihapus.');
}));
