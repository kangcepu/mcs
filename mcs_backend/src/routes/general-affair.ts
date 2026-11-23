import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { saveUploadedFile } from '../lib/storage.js';
import { runDueGeneralAffairSchedules } from '../lib/general-affair-schedule.js';
import { getGeneralAffairSubmoduleDashboard } from '../lib/general-affair-dashboard.js';
import type { AuthRequest } from '../types.js';

export const generalAffairRouter = Router();
const canRead = requirePermission('wo_ga', 'daily_control', 'daily_control_all', 'approval_all');
const canManage = requirePermission('wo_ga', 'daily_control_all', 'approval_all');
const canApprove = requirePermission('approval_all', 'wo_cross_access_ga');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 8 } });
const modules = new Set(Array.from({ length: 10 }, (_, index) => `GA${String(index + 1).padStart(2, '0')}`));
const actor = (req: AuthRequest) => String(req.user?.fullname || req.user?.username || 'SYSTEM').trim();
const actorId = (req: AuthRequest) => Number(req.user?.id_user ?? 0) || null;
const text = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max) || null;
const id = (value: unknown, label = 'ID') => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HttpError(422, `${label} tidak valid.`);
  return parsed;
};
const moduleCode = (value: unknown) => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!modules.has(code)) throw new HttpError(422, 'Kode submodul GA tidak valid.');
  return code;
};
const date = (value: unknown, label = 'Tanggal') => {
  const result = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new HttpError(422, `${label} tidak valid.`);
  return result;
};
const dateTime = (value: unknown, required = false) => {
  const result = String(value ?? '').trim().replace('T', ' ');
  if (!result && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(result)) throw new HttpError(422, 'Tanggal dan waktu tidak valid.');
  return result.length === 16 ? `${result}:00` : result;
};

async function ensureFoundation() {
  if (!(await tableExists('ga_task')) || !(await tableExists('ga_cctv_event'))) {
    throw new HttpError(503, 'GA01-GA10 belum tersedia. Jalankan migration 20261122_general_affair_ga01_ga10.sql.');
  }
}

async function audit(entityType: string, entityId: number, eventType: string, fromStatus: string | null,
  toStatus: string | null, note: string | null, req: AuthRequest) {
  await execute(`INSERT INTO ga_audit
    (entity_type,entity_id,event_type,from_status,to_status,event_note,actor_user_id,actor_name,event_at)
    VALUES (?,?,?,?,?,?,?,?,NOW())`, [entityType, entityId, eventType, fromStatus, toStatus, note, actorId(req), actor(req)]);
}

async function createNcr(module: string, sourceType: string, sourceId: number, category: string,
  severity: string, title: string, description: string, req: AuthRequest) {
  const number = `GA-NCR-${Date.now()}-${sourceId}`;
  await execute(`INSERT IGNORE INTO ga_exception_ncr
    (ncr_number,module_code,source_type,source_id,category,severity,title,description,status,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?, 'OPEN',?,NOW())`,
  [number, module, sourceType, sourceId, category, severity, title, description, actor(req)]);
}

async function foundationMiddleware(_req: AuthRequest, _res: Response, next: NextFunction) {
  try { await ensureFoundation(); next(); } catch (error) { next(error); }
}
generalAffairRouter.use('/general-affair', authenticate, foundationMiddleware);

generalAffairRouter.get('/general-affair/dashboard', canRead, asyncHandler(async (_req, res) => {
  const [taskCounts, moduleCounts, cctv, weighbridge, ncr, publications] = await Promise.all([
    one<Record<string, number>>(`SELECT COUNT(*) total,
      SUM(status IN ('PLANNED','IN_PROGRESS','REJECTED')) open_tasks,
      SUM(status IN ('SUBMITTED','CHECKED')) pending_validation,
      SUM(status IN ('APPROVED','CLOSED')) completed,
      SUM(due_at<NOW() AND status NOT IN ('APPROVED','CLOSED')) overdue FROM ga_task`),
    rows(`SELECT module_code,COUNT(*) total,SUM(status IN ('PLANNED','IN_PROGRESS','REJECTED')) open_count,
      SUM(status IN ('SUBMITTED','CHECKED')) pending_count,SUM(status IN ('APPROVED','CLOSED')) done_count
      FROM ga_task GROUP BY module_code ORDER BY module_code`),
    one<Record<string, number>>(`SELECT COUNT(*) total,SUM(status='OFFLINE') offline,
      SUM(status IN ('RESTORED','PENDING_VERIFICATION')) pending_verification,
      SUM(risk_level IN ('HIGH','CRITICAL') AND status<>'APPROVED') critical FROM ga_cctv_event`),
    one<Record<string, number>>(`SELECT COUNT(*) total,SUM(status IN ('SUBMITTED','CHECKED')) pending,
      SUM(COALESCE(match_time,0)=0 OR COALESCE(match_plate,0)=0 OR COALESCE(match_cargo,0)=0) mismatch
      FROM ga_weighbridge_reconciliation`),
    one<Record<string, number>>(`SELECT COUNT(*) total,SUM(status NOT IN ('CLOSED','CANCELLED')) open_count,
      SUM(severity IN ('HIGH','CRITICAL') AND status NOT IN ('CLOSED','CANCELLED')) critical FROM ga_exception_ncr`),
    one<Record<string, number>>(`SELECT COUNT(*) total,SUM(status='DRAFT') draft,SUM(status='PUBLISHED') published FROM ga_weekly_publication`),
  ]);
  ok(res, { tasks: taskCounts, modules: moduleCounts, cctv, weighbridge, ncr, publications });
}));

generalAffairRouter.get('/general-affair/submodule-dashboard', canRead, asyncHandler(async(req,res)=>{
  const code=moduleCode(req.query.module_code??'GA01');
  const today=new Date();const defaultFrom=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
  const from=req.query.date_from?date(req.query.date_from,'Tanggal awal'):defaultFrom;
  const to=req.query.date_to?date(req.query.date_to,'Tanggal akhir'):today.toISOString().slice(0,10);
  if(to<from)throw new HttpError(422,'Tanggal akhir tidak boleh sebelum tanggal awal.');
  ok(res,await getGeneralAffairSubmoduleDashboard({moduleCode:code,company:text(req.query.company,80),site:text(req.query.site,80),from,to}));
}));

generalAffairRouter.get('/general-affair/objects', canRead, asyncHandler(async (req, res) => {
  const where: string[] = []; const params: unknown[] = [];
  if (req.query.module_code) { where.push('module_code=?'); params.push(moduleCode(req.query.module_code)); }
  if (req.query.status) { where.push('status=?'); params.push(String(req.query.status).toUpperCase()); }
  ok(res, await rows(`SELECT * FROM ga_area_object ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY module_code,company_code,location_name,object_name`, params));
}));

generalAffairRouter.post('/general-affair/objects', canManage, asyncHandler(async (req, res) => {
  const code = moduleCode(req.body.module_code);
  const objectCode = text(req.body.object_code, 100); const name = text(req.body.object_name); const location = text(req.body.location_name);
  const company = text(req.body.company_code, 80); const type = text(req.body.object_type, 80);
  if (!objectCode || !name || !location || !company || !type) throw new HttpError(422, 'Kode, nama, jenis, company, dan lokasi wajib diisi.');
  const result = await execute(`INSERT INTO ga_area_object
    (module_code,object_code,object_name,object_type,company_code,site_code,location_name,route_name,custodian,capacity_value,capacity_unit,risk_level,condition_standard,metadata,status,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,NOW())`, [code, objectCode, name, type, company, text(req.body.site_code,80), location,
      text(req.body.route_name,180), text(req.body.custodian,120), req.body.capacity_value || null, text(req.body.capacity_unit,40),
      String(req.body.risk_level ?? 'MEDIUM').toUpperCase(), text(req.body.condition_standard,5000), req.body.metadata ? JSON.stringify(req.body.metadata) : null,
      String(req.body.status ?? 'ACTIVE').toUpperCase(), actor(req as AuthRequest)]);
  await audit('AREA_OBJECT', result.insertId, 'CREATED', null, 'ACTIVE', null, req as AuthRequest);
  created(res, { id: result.insertId }, 'Master area/objek GA dibuat.');
}));

generalAffairRouter.get('/general-affair/templates', canRead, asyncHandler(async (req,res)=>{
  const code=req.query.module_code?moduleCode(req.query.module_code):null;
  ok(res,await rows(`SELECT t.*,(SELECT COUNT(*) FROM ga_checklist_item i WHERE i.template_id=t.id) item_count
    FROM ga_checklist_template t ${code?'WHERE t.module_code=?':''} ORDER BY t.module_code,t.template_code,t.version_no DESC`,code?[code]:[]));
}));
generalAffairRouter.post('/general-affair/templates', canManage, asyncHandler(async(req,res)=>{
  const code=moduleCode(req.body.module_code),templateCode=text(req.body.template_code,100),name=text(req.body.template_name);
  if(!templateCode||!name)throw new HttpError(422,'Kode dan nama template wajib diisi.');
  const items=Array.isArray(req.body.items)?req.body.items:[];
  const result=await transaction(async connection=>{
    const [header]=await connection.execute<any>(`INSERT INTO ga_checklist_template
      (module_code,template_code,template_name,version_no,frequency_type,work_standard,evidence_before_required,evidence_after_required,status,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?, 'DRAFT',?,NOW())`,[code,templateCode,name,Number(req.body.version_no??1),String(req.body.frequency_type??'DAILY').toUpperCase(),text(req.body.work_standard,5000),req.body.evidence_before_required===false?0:1,req.body.evidence_after_required===false?0:1,actor(req as AuthRequest)]);
    for(let index=0;index<items.length;index++){const item=items[index];await connection.execute(`INSERT INTO ga_checklist_item (template_id,sequence_no,item_code,item_label,response_type,required_flag,minimum_value,maximum_value,unit) VALUES (?,?,?,?,?,?,?,?,?)`,[header.insertId,index+1,text(item.item_code,100)||`ITEM-${index+1}`,text(item.item_label,500),String(item.response_type??'PASS_FAIL').toUpperCase(),item.required_flag===false?0:1,item.minimum_value??null,item.maximum_value??null,text(item.unit,40)]);}
    return header.insertId as number;
  });await audit('TEMPLATE',result,'CREATED',null,'DRAFT',null,req as AuthRequest);created(res,{id:result});
}));
generalAffairRouter.post('/general-affair/templates/:id/approve', canApprove, asyncHandler(async(req,res)=>{
  const templateId=id(req.params.id);const template=await one<any>('SELECT * FROM ga_checklist_template WHERE id=?',[templateId]);if(!template)throw new HttpError(404,'Template tidak ditemukan.');if(template.created_by===actor(req as AuthRequest))throw new HttpError(409,'Pembuat template tidak boleh menyetujui template sendiri.');
  await execute(`UPDATE ga_checklist_template SET status='ACTIVE',approved_by_id=?,approved_by=?,approved_at=NOW(),updated_at=NOW() WHERE id=?`,[actorId(req as AuthRequest),actor(req as AuthRequest),templateId]);await audit('TEMPLATE',templateId,'APPROVED',template.status,'ACTIVE',null,req as AuthRequest);ok(res,{id:templateId,status:'ACTIVE'});
}));

generalAffairRouter.get('/general-affair/schedules', canRead, asyncHandler(async(req,res)=>{
  const code=req.query.module_code?moduleCode(req.query.module_code):null;
  ok(res,await rows(`SELECT s.*,o.object_code,o.object_name,o.company_code,o.location_name,t.template_code,t.template_name
    FROM ga_preventive_schedule s JOIN ga_area_object o ON o.id=s.area_object_id JOIN ga_checklist_template t ON t.id=s.template_id
    ${code?'WHERE s.module_code=?':''} ORDER BY s.status='ACTIVE' DESC,s.next_due_date`,code?[code]:[]));
}));
generalAffairRouter.post('/general-affair/schedules', canManage, asyncHandler(async(req,res)=>{
  const code=moduleCode(req.body.module_code),objectId=id(req.body.area_object_id,'Area/objek'),templateId=id(req.body.template_id,'Template');const start=date(req.body.start_date,'Tanggal mulai'),next=date(req.body.next_due_date??start,'Next due');
  const scheduleCode=text(req.body.schedule_code,100)||`GA-SCH-${Date.now().toString(36).toUpperCase()}`;const result=await execute(`INSERT INTO ga_preventive_schedule
    (schedule_code,module_code,area_object_id,template_id,frequency_type,interval_value,shift_code,start_date,next_due_date,pic_user_id,backup_pic_user_id,checker_user_id,approver_user_id,version_no,status,change_reason,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?,NOW())`,[scheduleCode,code,objectId,templateId,String(req.body.frequency_type??'DAILY').toUpperCase(),Math.max(1,Number(req.body.interval_value??1)),text(req.body.shift_code,40),start,next,req.body.pic_user_id||null,req.body.backup_pic_user_id||null,req.body.checker_user_id||null,req.body.approver_user_id||null,Number(req.body.version_no??1),text(req.body.change_reason,500),actor(req as AuthRequest)]);
  await audit('SCHEDULE',result.insertId,'CREATED',null,'DRAFT',null,req as AuthRequest);created(res,{id:result.insertId,schedule_code:scheduleCode});
}));
generalAffairRouter.post('/general-affair/schedules/:id/approve', canApprove, asyncHandler(async(req,res)=>{
  const scheduleId=id(req.params.id);const schedule=await one<any>('SELECT * FROM ga_preventive_schedule WHERE id=?',[scheduleId]);if(!schedule)throw new HttpError(404,'Jadwal tidak ditemukan.');if(schedule.created_by===actor(req as AuthRequest))throw new HttpError(409,'Pembuat jadwal tidak boleh menyetujui jadwal sendiri.');
  await execute(`UPDATE ga_preventive_schedule SET status='ACTIVE',approved_by=?,approved_at=NOW(),frozen_at=NOW(),updated_at=NOW() WHERE id=?`,[actor(req as AuthRequest),scheduleId]);await audit('SCHEDULE',scheduleId,'APPROVED',schedule.status,'ACTIVE',text(req.body.note,500),req as AuthRequest);ok(res,{id:scheduleId,status:'ACTIVE'});
}));

generalAffairRouter.get('/general-affair/tasks', canRead, asyncHandler(async (req, res) => {
  const where: string[] = []; const params: unknown[] = [];
  if (req.query.module_code) { where.push('t.module_code=?'); params.push(moduleCode(req.query.module_code)); }
  if (req.query.status) { where.push('t.status=?'); params.push(String(req.query.status).toUpperCase()); }
  if (req.query.mine === '1') { where.push('(t.maker_user_id=? OR t.checker_user_id=? OR t.approver_user_id=?)'); params.push(actorId(req as AuthRequest),actorId(req as AuthRequest),actorId(req as AuthRequest)); }
  const q = text(req.query.q, 120); if (q) { where.push('(t.task_number LIKE ? OR t.title LIKE ? OR t.location_name LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  ok(res, await rows(`SELECT t.*,o.object_code,o.object_name,
    (SELECT COUNT(*) FROM ga_evidence e WHERE e.entity_type='TASK' AND e.entity_id=t.id) evidence_count,
    (SELECT COUNT(*) FROM ga_exception_ncr n WHERE n.source_type='TASK' AND n.source_id=t.id AND n.status NOT IN ('CLOSED','CANCELLED')) open_ncr_count
    FROM ga_task t LEFT JOIN ga_area_object o ON o.id=t.area_object_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.planned_date DESC,t.id DESC LIMIT 500`, params));
}));

generalAffairRouter.get('/general-affair/tasks/:id', canRead, asyncHandler(async (req, res) => {
  const taskId = id(req.params.id);
  const task = await one(`SELECT t.*,o.object_code,o.object_name FROM ga_task t LEFT JOIN ga_area_object o ON o.id=t.area_object_id WHERE t.id=?`, [taskId]);
  if (!task) throw new HttpError(404, 'Task GA tidak ditemukan.');
  const [checklist, evidence, timeline, ncrs] = await Promise.all([
    rows(`SELECT i.id checklist_item_id,i.sequence_no,i.item_code,i.item_label,i.response_type,i.required_flag,i.minimum_value,i.maximum_value,i.unit,
      r.result_code,r.result_text,r.result_value,r.note,r.recorded_by,r.recorded_at FROM ga_checklist_item i
      JOIN ga_task t ON t.template_id=i.template_id LEFT JOIN ga_task_checklist_result r ON r.task_id=t.id AND r.checklist_item_id=i.id
      WHERE t.id=? ORDER BY i.sequence_no`, [taskId]),
    rows(`SELECT * FROM ga_evidence WHERE entity_type='TASK' AND entity_id=? ORDER BY created_at`, [taskId]),
    rows(`SELECT * FROM ga_audit WHERE entity_type='TASK' AND entity_id=? ORDER BY event_at,id`, [taskId]),
    rows(`SELECT * FROM ga_exception_ncr WHERE source_type='TASK' AND source_id=? ORDER BY created_at DESC`, [taskId]),
  ]);
  ok(res, { task, checklist, evidence, timeline, ncrs });
}));

generalAffairRouter.post('/general-affair/tasks', canManage, asyncHandler(async (req, res) => {
  const code = moduleCode(req.body.module_code);
  if (code === 'GA08' || code === 'GA09' || code === 'GA10') throw new HttpError(422, 'Gunakan form khusus submodul ini.');
  const title = text(req.body.title); const company = text(req.body.company_code,80); const location = text(req.body.location_name);
  if (!title || !company || !location) throw new HttpError(422, 'Judul, company, dan lokasi wajib diisi.');
  const number = `GA-${code}-${Date.now().toString(36).toUpperCase()}`;
  const result = await execute(`INSERT INTO ga_task
    (task_number,module_code,task_type,area_object_id,template_id,schedule_id,source_task_id,title,description,company_code,site_code,location_name,shift_code,planned_date,due_at,risk_level,maker_user_id,maker_name,checker_user_id,approver_user_id,status,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'PLANNED',?,NOW())`, [number,code,String(req.body.task_type ?? 'ROUTINE').toUpperCase(),req.body.area_object_id || null,
      req.body.template_id || null,req.body.schedule_id || null,req.body.source_task_id || null,title,text(req.body.description,5000),company,text(req.body.site_code,80),location,
      text(req.body.shift_code,40),date(req.body.planned_date),dateTime(req.body.due_at),String(req.body.risk_level ?? 'MEDIUM').toUpperCase(),
      Number(req.body.maker_user_id || actorId(req as AuthRequest)) || null,actor(req as AuthRequest),req.body.checker_user_id || null,req.body.approver_user_id || null,actor(req as AuthRequest)]);
  await audit('TASK', result.insertId, 'CREATED', null, 'PLANNED', null, req as AuthRequest);
  created(res, { id: result.insertId, task_number: number }, 'Task GA dibuat.');
}));

generalAffairRouter.post('/general-affair/tasks/:id/results', canManage, asyncHandler(async (req, res) => {
  const taskId = id(req.params.id); const task = await one<{ status:string }>('SELECT status FROM ga_task WHERE id=?', [taskId]);
  if (!task) throw new HttpError(404, 'Task GA tidak ditemukan.');
  if (!['PLANNED','IN_PROGRESS','REJECTED'].includes(task.status)) throw new HttpError(409, 'Hasil task yang sudah diajukan tidak dapat diubah.');
  const results = Array.isArray(req.body.results) ? req.body.results : [];
  await transaction(async (connection) => {
    for (const item of results) await connection.execute(`INSERT INTO ga_task_checklist_result
      (task_id,checklist_item_id,result_code,result_text,result_value,note,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE result_code=VALUES(result_code),result_text=VALUES(result_text),result_value=VALUES(result_value),note=VALUES(note),recorded_by=VALUES(recorded_by),recorded_at=NOW()`,
    [taskId,id(item.checklist_item_id,'Checklist'),text(item.result_code,30),text(item.result_text,500),item.result_value ?? null,text(item.note,500),actor(req as AuthRequest)]);
    await connection.execute(`UPDATE ga_task SET result_code=?,condition_code=?,finding=?,corrective_action=?,quantity_total=?,quantity_repaired=?,quantity_scrap=?,latitude=?,longitude=?,status='IN_PROGRESS',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=?`,
      [text(req.body.result_code,40),text(req.body.condition_code,40),text(req.body.finding,5000),text(req.body.corrective_action,5000),req.body.quantity_total ?? null,req.body.quantity_repaired ?? null,req.body.quantity_scrap ?? null,req.body.latitude ?? null,req.body.longitude ?? null,taskId]);
  });
  await audit('TASK',taskId,'RESULT_UPDATED',task.status,'IN_PROGRESS',null,req as AuthRequest); ok(res,{ id:taskId });
}));

generalAffairRouter.post('/general-affair/tasks/:id/evidence', canManage, upload.array('files', 8), asyncHandler(async (req, res) => {
  const taskId = id(req.params.id); if (!await one('SELECT id FROM ga_task WHERE id=?',[taskId])) throw new HttpError(404,'Task GA tidak ditemukan.');
  const files = (req.files as Express.Multer.File[] | undefined) ?? []; if (!files.length) throw new HttpError(422,'Pilih minimal satu file evidence.');
  const evidenceType = String(req.body.evidence_type ?? 'SUPPORTING').toUpperCase(); const saved: unknown[] = [];
  for (const file of files) { const key = await saveUploadedFile(file.buffer,'general-affair',file.originalname,file.mimetype);
    const result = await execute(`INSERT INTO ga_evidence (entity_type,entity_id,evidence_type,file_name,object_key,mime_type,file_size,latitude,longitude,captured_at,uploaded_by,created_at)
      VALUES ('TASK',?,?,?,?,?,?,?,?,?,?,NOW())`,[taskId,evidenceType,file.originalname,key,file.mimetype,file.size,req.body.latitude||null,req.body.longitude||null,dateTime(req.body.captured_at),actor(req as AuthRequest)]);
    saved.push({id:result.insertId,object_key:key}); }
  await audit('TASK',taskId,'EVIDENCE_ADDED',null,null,`${files.length} file`,req as AuthRequest); created(res,saved,'Evidence tersimpan.');
}));

generalAffairRouter.post('/general-affair/tasks/:id/transition', canRead, asyncHandler(async (req, res) => {
  const taskId=id(req.params.id); const action=String(req.body.action??'').toUpperCase();
  const task=await one<any>('SELECT * FROM ga_task WHERE id=?',[taskId]); if(!task)throw new HttpError(404,'Task GA tidak ditemukan.');
  const transitions:Record<string,{from:string[];to:string}>={START:{from:['PLANNED','REJECTED'],to:'IN_PROGRESS'},SUBMIT:{from:['IN_PROGRESS'],to:'SUBMITTED'},CHECK:{from:['SUBMITTED'],to:'CHECKED'},REJECT:{from:['SUBMITTED','CHECKED'],to:'REJECTED'},APPROVE:{from:['CHECKED'],to:'APPROVED'},CLOSE:{from:['APPROVED'],to:'CLOSED'},SKIP:{from:['PLANNED','IN_PROGRESS'],to:'SUBMITTED'}};
  const transition=transitions[action]; if(!transition||!transition.from.includes(task.status))throw new HttpError(409,'Transisi status task GA tidak diizinkan.');
  const auth=req as AuthRequest; const uid=actorId(auth); const note=text(req.body.note,2000);
  if(['CHECK','APPROVE','REJECT'].includes(action)&&uid===Number(task.maker_user_id))throw new HttpError(409,'Maker tidak boleh memeriksa atau menyetujui pekerjaannya sendiri.');
  if(action==='APPROVE'&&uid===Number(task.checker_user_id))throw new HttpError(409,'Checker dan approver harus berbeda.');
  if(action==='SUBMIT'){
    const required=await one<{missing:number}>(`SELECT COUNT(*) missing FROM ga_checklist_item i JOIN ga_task t ON t.template_id=i.template_id
      LEFT JOIN ga_task_checklist_result r ON r.task_id=t.id AND r.checklist_item_id=i.id WHERE t.id=? AND i.required_flag=1 AND r.id IS NULL`,[taskId]);
    if(Number(required?.missing??0)>0)throw new HttpError(422,'Checklist wajib belum lengkap.');
    const evidence=await one<{total:number}>(`SELECT COUNT(*) total FROM ga_evidence WHERE entity_type='TASK' AND entity_id=?`,[taskId]);
    if(Number(evidence?.total??0)<1)throw new HttpError(422,'Minimal satu evidence wajib sebelum submit.');
  }
  if(action==='SKIP'&&!note)throw new HttpError(422,'Alasan skip wajib diisi.');
  const fields:string[]=['status=?','updated_at=NOW()']; const params:unknown[]=[transition.to];
  if(action==='START')fields.push('started_at=NOW()');
  if(action==='SUBMIT'||action==='SKIP')fields.push('submitted_at=NOW()');
  if(action==='CHECK'){fields.push('checker_user_id=?','checker_name=?','checked_at=NOW()');params.push(uid,actor(auth));}
  if(action==='APPROVE'){fields.push('approver_user_id=?','approver_name=?','approved_at=NOW()');params.push(uid,actor(auth));}
  if(action==='CLOSE')fields.push('closed_at=NOW()'); if(action==='SKIP'){fields.push('skipped_reason=?');params.push(note);}
  params.push(taskId); await execute(`UPDATE ga_task SET ${fields.join(',')} WHERE id=?`,params);
  if(action==='REJECT'||['HIGH','CRITICAL'].includes(String(task.risk_level))&&action==='SUBMIT'&&task.finding){
    await createNcr(task.module_code,'TASK',taskId,action==='REJECT'?'INVALID_EVIDENCE':'UNSAFE_FINDING',task.risk_level,`Temuan ${task.task_number}`,note||task.finding||'Temuan GA memerlukan tindak lanjut.',auth);
  }
  await audit('TASK',taskId,action,task.status,transition.to,note,auth); ok(res,{id:taskId,status:transition.to},'Status task diperbarui.');
}));

generalAffairRouter.get('/general-affair/cctv-events', canRead, asyncHandler(async (_req,res)=>ok(res,await rows(`SELECT e.*,o.object_code camera_code,o.object_name camera_name,o.location_name,o.company_code FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id ORDER BY e.offline_at DESC LIMIT 500`))));
generalAffairRouter.post('/general-affair/cctv-events', canManage, asyncHandler(async (req,res)=>{
  const camera=id(req.body.camera_object_id,'CCTV'); const offline=dateTime(req.body.offline_at,true)!;
  const previous=await one<{total:number}>(`SELECT COUNT(*) total FROM ga_cctv_event WHERE camera_object_id=? AND offline_at>=DATE_SUB(?,INTERVAL 30 DAY)`,[camera,offline]);
  const repeat=Number(previous?.total??0)+1; const risk=repeat>=3?'CRITICAL':String(req.body.risk_level??'MEDIUM').toUpperCase(); const number=`GA-CCTV-${Date.now().toString(36).toUpperCase()}`;
  const result=await execute(`INSERT INTO ga_cctv_event (event_number,camera_object_id,offline_at,source_type,source_reference,repeat_count,risk_level,repair_wo_number,status,reported_by,created_at)
    VALUES (?,?,?,?,?,?,?,?, 'OFFLINE',?,NOW())`,[number,camera,offline,String(req.body.source_type??'MANUAL').toUpperCase(),text(req.body.source_reference),repeat,risk,text(req.body.repair_wo_number,120),actor(req as AuthRequest)]);
  if(repeat>=3)await createNcr('GA08','CCTV_EVENT',result.insertId,'REPEATED_OFFLINE','CRITICAL',`CCTV berulang offline: ${number}`,`CCTV telah offline ${repeat} kali dalam 30 hari.`,req as AuthRequest);
  await audit('CCTV_EVENT',result.insertId,'OFFLINE_RECORDED',null,'OFFLINE',null,req as AuthRequest); created(res,{id:result.insertId,event_number:number});
}));
generalAffairRouter.post('/general-affair/cctv-events/:id/restore', canManage, asyncHandler(async(req,res)=>{
  const eventId=id(req.params.id); const event=await one<any>('SELECT * FROM ga_cctv_event WHERE id=?',[eventId]);if(!event)throw new HttpError(404,'Event CCTV tidak ditemukan.');
  const online=dateTime(req.body.online_at,true)!; if(online<event.offline_at)throw new HttpError(422,'Waktu online tidak boleh sebelum waktu offline.');
  await execute(`UPDATE ga_cctv_event SET online_at=?,duration_minutes=TIMESTAMPDIFF(MINUTE,offline_at,?),restoration_note=?,status='PENDING_VERIFICATION',updated_at=NOW() WHERE id=?`,[online,online,text(req.body.restoration_note,500),eventId]);
  await audit('CCTV_EVENT',eventId,'RESTORED',event.status,'PENDING_VERIFICATION',text(req.body.restoration_note,500),req as AuthRequest);ok(res,{id:eventId,status:'PENDING_VERIFICATION'});
}));
generalAffairRouter.post('/general-affair/cctv-events/:id/approve', canApprove, asyncHandler(async(req,res)=>{
  const eventId=id(req.params.id);const event=await one<any>('SELECT * FROM ga_cctv_event WHERE id=?',[eventId]);if(!event||event.status!=='PENDING_VERIFICATION')throw new HttpError(409,'CCTV belum siap diverifikasi.');
  if(actor(req as AuthRequest)===event.reported_by)throw new HttpError(409,'Pelapor tidak boleh memverifikasi pemulihannya sendiri.');
  await execute(`UPDATE ga_cctv_event SET status='APPROVED',verified_by=?,verified_at=NOW(),approved_by=?,approved_at=NOW(),updated_at=NOW() WHERE id=?`,[actor(req as AuthRequest),actor(req as AuthRequest),eventId]);
  await audit('CCTV_EVENT',eventId,'APPROVED',event.status,'APPROVED',null,req as AuthRequest);ok(res,{id:eventId,status:'APPROVED'});
}));

generalAffairRouter.get('/general-affair/weighbridge', canRead, asyncHandler(async (_req,res)=>ok(res,await rows('SELECT * FROM ga_weighbridge_reconciliation ORDER BY ticket_entry_at DESC LIMIT 500'))));
generalAffairRouter.post('/general-affair/weighbridge', canManage, asyncHandler(async(req,res)=>{
  const ticket=text(req.body.ticket_number,120),plate=text(req.body.vehicle_plate,40),company=text(req.body.company_code,80);if(!ticket||!plate||!company)throw new HttpError(422,'Company, tiket, dan nomor kendaraan wajib diisi.');
  const tolerance=Math.max(0,Math.min(1440,Number(req.body.tolerance_minutes??15))); const ticketAt=dateTime(req.body.ticket_entry_at,true)!;const securityAt=dateTime(req.body.security_entry_at);const cctvAt=dateTime(req.body.cctv_observed_at);
  const matchTime=securityAt?Math.abs(new Date(ticketAt).getTime()-new Date(securityAt).getTime())<=tolerance*60000:null; const matchPlate=text(req.body.cctv_plate,40)?String(req.body.cctv_plate).replace(/\s/g,'').toUpperCase()===plate.replace(/\s/g,'').toUpperCase():null;
  const number=`GA-WB-${Date.now().toString(36).toUpperCase()}`; const mismatch=matchTime===false||matchPlate===false||req.body.match_cargo===false;
  const result=await execute(`INSERT INTO ga_weighbridge_reconciliation
    (reconciliation_number,company_code,site_code,ticket_number,vehicle_plate,cargo_name,ticket_entry_at,ticket_exit_at,security_entry_at,security_exit_at,cctv_plate,cctv_observed_at,tolerance_minutes,match_time,match_plate,match_cargo,exception_note,status,maker_user_id,maker_name,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?,NOW())`,[number,company,text(req.body.site_code,80),ticket,plate,text(req.body.cargo_name),ticketAt,dateTime(req.body.ticket_exit_at),securityAt,dateTime(req.body.security_exit_at),text(req.body.cctv_plate,40),cctvAt,tolerance,matchTime,matchPlate,req.body.match_cargo??null,text(req.body.exception_note,5000),actorId(req as AuthRequest),actor(req as AuthRequest)]);
  if(mismatch)await createNcr('GA09','WEIGHBRIDGE',result.insertId,'RECON_MISMATCH','HIGH',`Mismatch tiket timbang ${ticket}`,text(req.body.exception_note,5000)||'Waktu, plate, atau muatan tidak cocok.',req as AuthRequest);
  await audit('WEIGHBRIDGE',result.insertId,'CREATED',null,'DRAFT',null,req as AuthRequest);created(res,{id:result.insertId,reconciliation_number:number,mismatch});
}));
generalAffairRouter.post('/general-affair/weighbridge/:id/transition', canRead, asyncHandler(async(req,res)=>{
  const recordId=id(req.params.id);const action=String(req.body.action??'').toUpperCase();const item=await one<any>('SELECT * FROM ga_weighbridge_reconciliation WHERE id=?',[recordId]);if(!item)throw new HttpError(404,'Rekonsiliasi tidak ditemukan.');
  const map:any={SUBMIT:['DRAFT','SUBMITTED'],CHECK:['SUBMITTED','CHECKED'],APPROVE:['CHECKED','APPROVED'],REJECT:['SUBMITTED','REJECTED']};const transition=map[action];if(!transition||item.status!==transition[0])throw new HttpError(409,'Transisi rekonsiliasi tidak diizinkan.');
  const uid=actorId(req as AuthRequest);if(action!=='SUBMIT'&&uid===Number(item.maker_user_id))throw new HttpError(409,'Maker tidak boleh memeriksa atau menyetujui data sendiri.');if(action==='APPROVE'&&uid===Number(item.checker_user_id))throw new HttpError(409,'Checker dan approver harus berbeda.');
  const fields=['status=?','updated_at=NOW()'];const params:any[]=[transition[1]];if(action==='SUBMIT')fields.push('submitted_at=NOW()');if(action==='CHECK'){fields.push('checker_user_id=?','checker_name=?','checked_at=NOW()');params.push(uid,actor(req as AuthRequest));}if(action==='APPROVE'){fields.push('approver_user_id=?','approver_name=?','approved_at=NOW()');params.push(uid,actor(req as AuthRequest));}params.push(recordId);
  await execute(`UPDATE ga_weighbridge_reconciliation SET ${fields.join(',')} WHERE id=?`,params);await audit('WEIGHBRIDGE',recordId,action,item.status,transition[1],text(req.body.note,2000),req as AuthRequest);ok(res,{id:recordId,status:transition[1]});
}));

generalAffairRouter.get('/general-affair/ncr', canRead, asyncHandler(async(req,res)=>{const status=text(req.query.status,30);ok(res,await rows(`SELECT * FROM ga_exception_ncr ${status?'WHERE status=?':''} ORDER BY FIELD(severity,'CRITICAL','HIGH','MEDIUM','LOW'),created_at DESC`,status?[status.toUpperCase()]:[]));}));
generalAffairRouter.get('/general-affair/publications', canRead, asyncHandler(async(_req,res)=>ok(res,await rows('SELECT * FROM ga_weekly_publication ORDER BY period_end DESC,version_no DESC'))));
generalAffairRouter.post('/general-affair/publications', canManage, asyncHandler(async(req,res)=>{
  const start=date(req.body.period_start,'Awal periode'),end=date(req.body.period_end,'Akhir periode');if(end<start)throw new HttpError(422,'Akhir periode tidak valid.');const company=text(req.body.company_code,80);if(!company)throw new HttpError(422,'Company wajib diisi.');
  const sources=await rows(`SELECT module_code,status,COUNT(*) total FROM ga_task WHERE company_code=? AND planned_date BETWEEN ? AND ? AND status IN ('APPROVED','CLOSED') GROUP BY module_code,status`,[company,start,end]);
  const cctv=await rows(`SELECT status,COUNT(*) total FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE o.company_code=? AND DATE(e.offline_at) BETWEEN ? AND ? AND e.status='APPROVED' GROUP BY status`,[company,start,end]);
  const weighbridge=await rows(`SELECT status,COUNT(*) total FROM ga_weighbridge_reconciliation WHERE company_code=? AND DATE(ticket_entry_at) BETWEEN ? AND ? AND status='APPROVED' GROUP BY status`,[company,start,end]);
  const variant=String(req.body.report_variant??'WEEKLY_GA').toUpperCase();const previous=await one<{version_no:number}>('SELECT MAX(version_no) version_no FROM ga_weekly_publication WHERE company_code=? AND COALESCE(site_code,\'\')=COALESCE(?,\'\') AND period_start=? AND period_end=? AND report_variant=?',[company,text(req.body.site_code,80),start,end,variant]);const version=Number(previous?.version_no??0)+1;const number=`GA-RPT-${start.replaceAll('-','')}-${Date.now().toString(36).toUpperCase()}`;
  const result=await execute(`INSERT INTO ga_weekly_publication (publication_number,company_code,site_code,period_start,period_end,report_variant,version_no,source_snapshot,exception_summary,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?, 'DRAFT',?,NOW())`,[number,company,text(req.body.site_code,80),start,end,variant,version,JSON.stringify({tasks:sources,cctv,weighbridge}),text(req.body.exception_summary,5000),actor(req as AuthRequest)]);
  await audit('PUBLICATION',result.insertId,'CREATED',null,'DRAFT',null,req as AuthRequest);created(res,{id:result.insertId,publication_number:number,version_no:version});
}));
generalAffairRouter.post('/general-affair/publications/:id/transition', canApprove, asyncHandler(async(req,res)=>{
  const publicationId=id(req.params.id);const action=String(req.body.action??'').toUpperCase();const item=await one<any>('SELECT * FROM ga_weekly_publication WHERE id=?',[publicationId]);if(!item)throw new HttpError(404,'Publikasi tidak ditemukan.');const map:any={REVIEW:['DRAFT','REVIEWED'],APPROVE:['REVIEWED','APPROVED'],PUBLISH:['APPROVED','PUBLISHED']};const transition=map[action];if(!transition||item.status!==transition[0])throw new HttpError(409,'Transisi publikasi tidak diizinkan.');if(item.created_by===actor(req as AuthRequest))throw new HttpError(409,'Pembuat publikasi tidak boleh mengesahkan publikasinya sendiri.');
  const fields=['status=?','updated_at=NOW()'];const params:any[]=[transition[1]];if(action==='REVIEW'){fields.push('reviewed_by=?','reviewed_at=NOW()','reviewer_comment=?');params.push(actor(req as AuthRequest),text(req.body.note,5000));}if(action==='APPROVE'){fields.push('approved_by=?','approved_at=NOW()');params.push(actor(req as AuthRequest));}if(action==='PUBLISH')fields.push('published_at=NOW()');params.push(publicationId);await execute(`UPDATE ga_weekly_publication SET ${fields.join(',')} WHERE id=?`,params);await audit('PUBLICATION',publicationId,action,item.status,transition[1],text(req.body.note,2000),req as AuthRequest);ok(res,{id:publicationId,status:transition[1]});
}));

generalAffairRouter.post('/general-affair/schedules/run', canManage, asyncHandler(async(req,res)=>{
  const made=await runDueGeneralAffairSchedules();
  ok(res,{generated:made.length,tasks:made},'Jadwal GA diproses.');
}));
