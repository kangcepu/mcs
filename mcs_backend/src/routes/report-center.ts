import { Readable } from 'node:stream';
import { Router } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';
import { authenticate, permissionFields, requirePermission } from '../auth.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const reportCenterRouter = Router();
const canConfigure = requirePermission('user_management');
const actor = (req: AuthRequest) => String(req.user?.fullname || req.user?.username || 'SYSTEM');
const text = (value: unknown, max: number, required = false) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new HttpError(422, 'Field wajib diisi.');
  if (result.length > max) throw new HttpError(422, `Maksimal ${max} karakter.`);
  return result || null;
};
async function ensureFeature() {
  if (!(await tableExists('external_report_endpoint'))) throw new HttpError(503, 'Migration External Report Center belum dijalankan.');
}
function validUrl(value: unknown) {
  let url: URL;
  try { url = new URL(String(value ?? '').trim()); } catch { throw new HttpError(422, 'URL endpoint tidak valid.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(422, 'Endpoint wajib menggunakan HTTP/HTTPS.');
  return url.toString().replace(/\/$/, '');
}
type Endpoint = { id:number;endpoint_name:string;catalog_url:string;auth_header_name:string|null;auth_header_value:string|null;timeout_seconds:number;status:string;notes:string|null;base_url?:string|null;system_code?:string|null };
type Report = { id:string;title:string;description:string|null;category:string;format:string;report_type?:string;run_url?:string;protocol:'CATALOG'|'ASYNC_JOB';endpoint_id?:number;endpoint_name?:string };
const authHeaders = (endpoint: Endpoint, accept: string) => {
  const headers: Record<string,string> = { Accept: accept };
  if (endpoint.auth_header_name && endpoint.auth_header_value) headers[endpoint.auth_header_name] = endpoint.auth_header_value;
  return headers;
};
function parseParams(value: unknown): Record<string,unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string,unknown>;
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* handled below */ }
  throw new HttpError(422, 'Params harus berupa JSON object.');
}
function normalizeCatalog(payload: any): Report[] {
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.reports) ? payload.reports : [];
  return source.map((item:any,index:number) => ({
    id:String(item.id ?? item.code ?? item.slug ?? index), title:String(item.title ?? item.name ?? item.label ?? item.code ?? `Report ${index+1}`),
    description:item.description ? String(item.description) : null, category:String(item.category ?? item.group ?? 'General'),
    format:String(item.format ?? item.output ?? 'PDF').toUpperCase(), run_url:String(item.run_url ?? item.url ?? item.endpoint ?? item.download_url ?? ''), protocol:'CATALOG' as const,
  })).filter((item:Report) => item.run_url);
}
async function loadCatalog(endpoint: Endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(120,Math.max(3,Number(endpoint.timeout_seconds)||30))*1000);
  try {
    const response = await fetch(endpoint.catalog_url,{headers:authHeaders(endpoint,'application/json'),signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizeCatalog(await response.json());
  } finally { clearTimeout(timer); }
}
const upstreamJobId = (payload:any) => String(payload?.jobId ?? payload?.job_id ?? payload?.id ?? payload?.data?.jobId ?? payload?.data?.job_id ?? payload?.data?.id ?? '').trim();
const upstreamStatus = (payload:any) => String(payload?.status ?? payload?.state ?? payload?.data?.status ?? payload?.data?.state ?? 'PROCESSING').trim().toUpperCase();
const userAuthorization = (req: AuthRequest) => {
  const value=String(req.header('authorization')??'').trim();
  if(!/^Bearer\s+\S+/i.test(value))throw new HttpError(401,'Token user MCS tidak tersedia.');
  return value;
};
const canAccessDefinition = (req: AuthRequest, requiredPermission: unknown) => {
  const user=req.user;if(!user)return false;
  if(String(user.username).toUpperCase()==='SUPERUSER')return true;
  const permission=String(requiredPermission??'').trim();
  return !permission || Number(user[permission]??0)===1;
};

async function asyncDefinition(endpointId: number, reportId: number) {
  return one<any>(`SELECT d.*,e.endpoint_name,e.timeout_seconds,a.base_url,a.system_code
    FROM external_report_definition d
    JOIN external_report_endpoint e ON e.id=d.endpoint_id
    JOIN external_report_async_config a ON a.endpoint_id=e.id
    WHERE d.id=? AND e.id=? AND d.status='ACTIVE' AND e.status='ACTIVE'`,[reportId,endpointId]);
}

function optionalFilter(value: unknown, max = 255) {
  const result=String(value??'').trim();
  if(result.length>max)throw new HttpError(422,`Filter maksimal ${max} karakter.`);
  return result;
}

async function validateReportParams(definition: any, input: Record<string,unknown>) {
  if(String(definition.report_type)!=='report-assets')return input;
  const company=optionalFilter(input.company);
  const location=optionalFilter(input.location);
  const status=optionalFilter(input.status,20).toLowerCase();
  if(status&&!['active','inactive'].includes(status))throw new HttpError(422,'Status asset tidak valid.');
  if(company&&!await one('SELECT AssetID FROM asset WHERE CompanyName=? LIMIT 1',[company]))throw new HttpError(422,'Company tidak ditemukan pada data asset.');
  if(location&&!await one("SELECT AssetID FROM asset WHERE LocationAsset=? AND (?='' OR CompanyName=?) LIMIT 1",[location,company,company]))throw new HttpError(422,'Lokasi tidak ditemukan pada scope company yang dipilih.');
  return {...input,company:company||undefined,location:location||undefined,status:status||undefined};
}

reportCenterRouter.get('/report-center/config',authenticate,canConfigure,asyncHandler(async(_req,res)=>{
  await ensureFeature();
  const asyncExists=await tableExists('external_report_async_config');
  const data=await rows<any>(asyncExists?`SELECT e.id,e.endpoint_name,e.catalog_url,e.auth_header_name,CASE WHEN e.auth_header_value IS NULL OR e.auth_header_value='' THEN 0 ELSE 1 END has_auth,e.timeout_seconds,e.status,e.notes,e.created_at,e.updated_at,
    CASE WHEN a.endpoint_id IS NULL THEN 'CATALOG' ELSE 'ASYNC_JOB' END protocol,a.base_url,a.system_code,d.report_type,d.report_title,d.description report_description,d.category,d.output_format,d.default_params,d.required_permission
    FROM external_report_endpoint e LEFT JOIN external_report_async_config a ON a.endpoint_id=e.id
    LEFT JOIN external_report_definition d ON d.endpoint_id=e.id AND d.status='ACTIVE' ORDER BY e.endpoint_name,d.report_title`
    :`SELECT id,endpoint_name,catalog_url,auth_header_name,CASE WHEN auth_header_value IS NULL OR auth_header_value='' THEN 0 ELSE 1 END has_auth,timeout_seconds,status,notes,created_at,updated_at,'CATALOG' protocol FROM external_report_endpoint ORDER BY endpoint_name`);
  ok(res,data);
}));

reportCenterRouter.post('/report-center/config',authenticate,canConfigure,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();
  const id=Number(req.body.id||0);const protocol=String(req.body.protocol??'CATALOG').toUpperCase();
  if(!['CATALOG','ASYNC_JOB'].includes(protocol))throw new HttpError(422,'Protocol endpoint tidak valid.');
  if(protocol==='ASYNC_JOB'&&!(await tableExists('external_report_async_config')))throw new HttpError(503,'Migration Async Report Job belum dijalankan.');
  const url=validUrl(req.body.base_url??req.body.catalog_url);const secret=text(req.body.auth_header_value,1000);
  const savedId=await transaction(async connection=>{
    let endpointId=id;
    if(endpointId){
      const [found]=await connection.query('SELECT id FROM external_report_endpoint WHERE id=?',[endpointId]);if(!(found as any[])[0])throw new HttpError(404,'Konfigurasi endpoint tidak ditemukan.');
      await connection.execute(`UPDATE external_report_endpoint SET endpoint_name=?,catalog_url=?,auth_header_name=?,auth_header_value=COALESCE(?,auth_header_value),timeout_seconds=?,status=?,notes=?,updated_by=?,updated_at=NOW() WHERE id=?`,[text(req.body.endpoint_name,120,true),url,text(req.body.auth_header_name,120),secret,Math.min(120,Math.max(3,Number(req.body.timeout_seconds)||30)),String(req.body.status||'ACTIVE').toUpperCase(),text(req.body.notes,500),actor(req),endpointId]);
    }else{
      const [insert]=await connection.execute<ResultSetHeader>(`INSERT INTO external_report_endpoint (endpoint_name,catalog_url,auth_header_name,auth_header_value,timeout_seconds,status,notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,[text(req.body.endpoint_name,120,true),url,text(req.body.auth_header_name,120),secret,Math.min(120,Math.max(3,Number(req.body.timeout_seconds)||30)),String(req.body.status||'ACTIVE').toUpperCase(),text(req.body.notes,500),actor(req),actor(req)]);endpointId=insert.insertId;
    }
    if(protocol==='ASYNC_JOB'){
      const reportType=String(text(req.body.report_type,120,true));const params=parseParams(req.body.default_params??'{}');
      await connection.execute(`INSERT INTO external_report_async_config (endpoint_id,base_url,system_code,created_at,updated_at) VALUES (?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE base_url=VALUES(base_url),system_code=VALUES(system_code),updated_at=NOW()`,[endpointId,url,text(req.body.system_code,80,true)]);
      const requiredPermission=String(req.body.required_permission??'').trim();if(requiredPermission&&!permissionFields.includes(requiredPermission as any))throw new HttpError(422,'Permission report tidak valid.');
      await connection.execute(`INSERT INTO external_report_definition (endpoint_id,report_type,report_title,description,category,output_format,default_params,required_permission,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'ACTIVE',NOW(),NOW()) ON DUPLICATE KEY UPDATE report_title=VALUES(report_title),description=VALUES(description),category=VALUES(category),output_format=VALUES(output_format),default_params=VALUES(default_params),required_permission=VALUES(required_permission),status='ACTIVE',updated_at=NOW()`,[endpointId,reportType,text(req.body.report_title,180,true),text(req.body.report_description,500),text(req.body.category,120)??'General',String(req.body.output_format??'PDF').toUpperCase(),JSON.stringify(params),requiredPermission||null]);
    }else await connection.execute('DELETE FROM external_report_async_config WHERE endpoint_id=?',[endpointId]);
    return endpointId;
  });
  if(id)ok(res,{id:savedId},'Konfigurasi endpoint diperbarui.');else created(res,{id:savedId},'Endpoint Report Center ditambahkan.');
}));

reportCenterRouter.delete('/report-center/config/:id',authenticate,canConfigure,asyncHandler(async(req,res)=>{await ensureFeature();await execute('DELETE FROM external_report_endpoint WHERE id=?',[Number(req.params.id)]);ok(res,null,'Endpoint dihapus.');}));

reportCenterRouter.get('/report-center/catalog',authenticate,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();const asyncExists=await tableExists('external_report_async_config');
  const endpoints=await rows<Endpoint>(asyncExists?`SELECT e.*,a.base_url,a.system_code FROM external_report_endpoint e LEFT JOIN external_report_async_config a ON a.endpoint_id=e.id WHERE e.status='ACTIVE' ORDER BY e.endpoint_name`:`SELECT * FROM external_report_endpoint WHERE status='ACTIVE' ORDER BY endpoint_name`);
  const output:Report[]=[];const errors:any[]=[];
  for(const endpoint of endpoints){try{if(endpoint.base_url){const definitions=await rows<any>(`SELECT * FROM external_report_definition WHERE endpoint_id=? AND status='ACTIVE' ORDER BY category,report_title`,[endpoint.id]);output.push(...definitions.filter(item=>canAccessDefinition(req,item.required_permission)).map(item=>({id:String(item.id),title:item.report_title,description:item.description,category:item.category,format:item.output_format,report_type:item.report_type,protocol:'ASYNC_JOB' as const,endpoint_id:endpoint.id,endpoint_name:endpoint.endpoint_name})));}else{const reports=await loadCatalog(endpoint);output.push(...reports.map(report=>({...report,endpoint_id:endpoint.id,endpoint_name:endpoint.endpoint_name})));}}catch(error){errors.push({endpoint_id:endpoint.id,endpoint_name:endpoint.endpoint_name,message:error instanceof Error?error.message:'Endpoint gagal dibaca'});}}
  ok(res,{reports:output,errors,endpoints_count:endpoints.length});
}));

reportCenterRouter.get('/report-center/filters/:endpointId/:reportId',authenticate,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();
  const definition=await asyncDefinition(Number(req.params.endpointId),Number(req.params.reportId));
  if(!definition)throw new HttpError(404,'Definisi async report tidak ditemukan atau belum aktif.');
  if(!canAccessDefinition(req,definition.required_permission))throw new HttpError(403,'Anda tidak memiliki permission untuk report ini.');
  if(String(definition.report_type)!=='report-assets')return ok(res,{report_type:definition.report_type,companies:[],locations:[],matched_assets:null});
  const company=optionalFilter(req.query.company);
  const location=optionalFilter(req.query.location);
  const status=optionalFilter(req.query.status,20).toLowerCase();
  if(status&&!['active','inactive'].includes(status))throw new HttpError(422,'Status asset tidak valid.');
  const [companies,locations]=await Promise.all([
    rows<{value:string;label:string}>(`SELECT DISTINCT CompanyName value,CompanyName label FROM asset WHERE CompanyName IS NOT NULL AND TRIM(CompanyName)<>'' AND TRIM(CompanyName)<>'-' ORDER BY CompanyName`),
    rows<{value:string;label:string}>(`SELECT DISTINCT LocationAsset value,LocationAsset label FROM asset WHERE LocationAsset IS NOT NULL AND TRIM(LocationAsset)<>'' AND TRIM(LocationAsset)<>'-' AND (?='' OR CompanyName=?) ORDER BY LocationAsset`,[company,company]),
  ]);
  const where:string[]=[];const params:unknown[]=[];
  if(company){where.push('CompanyName=?');params.push(company);}
  if(location){where.push('LocationAsset=?');params.push(location);}
  if(status){where.push('LOWER(active)=?');params.push(status);}
  const count=await one<{total:number}>(`SELECT COUNT(*) total FROM asset${where.length?` WHERE ${where.join(' AND ')}`:''}`,params);
  ok(res,{report_type:definition.report_type,companies,locations,matched_assets:Number(count?.total??0)});
}));

reportCenterRouter.get('/report-center/run/:endpointId/:reportId',authenticate,asyncHandler(async(req,res)=>{
  await ensureFeature();const endpoint=await one<Endpoint>(`SELECT * FROM external_report_endpoint WHERE id=? AND status='ACTIVE'`,[Number(req.params.endpointId)]);if(!endpoint)throw new HttpError(404,'Endpoint report tidak aktif.');const report=(await loadCatalog(endpoint)).find(item=>item.id===String(req.params.reportId));if(!report?.run_url)throw new HttpError(404,'Report tidak ditemukan pada endpoint.');const origin=new URL(endpoint.catalog_url);const runUrl=new URL(report.run_url,origin);if(runUrl.origin!==origin.origin)throw new HttpError(422,'URL report harus berada pada origin endpoint yang sama.');for(const [key,value] of Object.entries(req.query))if(typeof value==='string')runUrl.searchParams.set(key,value);const upstream=await fetch(runUrl,{headers:authHeaders(endpoint,'*/*')});if(!upstream.ok||!upstream.body)throw new HttpError(502,`Report endpoint gagal (HTTP ${upstream.status}).`);res.status(upstream.status);for(const name of ['content-type','content-disposition','content-length']){const value=upstream.headers.get(name);if(value)res.setHeader(name,value);}Readable.fromWeb(upstream.body as any).pipe(res);
}));

reportCenterRouter.post('/report-center/jobs/:endpointId/:reportId',authenticate,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();const definition=await asyncDefinition(Number(req.params.endpointId),Number(req.params.reportId));if(!definition)throw new HttpError(404,'Definisi async report tidak ditemukan atau belum aktif.');if(!canAccessDefinition(req,definition.required_permission))throw new HttpError(403,'Anda tidak memiliki permission untuk report ini.');const params=await validateReportParams(definition,{...parseParams(definition.default_params),...parseParams(req.body.params??{})});const url=new URL(definition.base_url);url.searchParams.set('system',definition.system_code||'mcs');const response=await fetch(url,{method:'POST',headers:{Authorization:userAuthorization(req),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({type:definition.report_type,params})});const payload=await response.json().catch(()=>null);if(!response.ok)throw new HttpError(response.status===401||response.status===403?response.status:502,`Gagal membuat job report (HTTP ${response.status}).`);const jobId=upstreamJobId(payload);if(!jobId)throw new HttpError(502,'Respons reporting tidak memiliki jobId.');const result=await execute(`INSERT INTO external_report_job (endpoint_id,report_definition_id,upstream_job_id,status,request_params,upstream_response,requested_by,requested_user_id,requested_at) VALUES (?,?,?,'QUEUED',?,?,?,?,NOW())`,[definition.endpoint_id,definition.id,jobId,JSON.stringify(params),JSON.stringify(payload),actor(req),req.user!.id_user]);created(res,{id:result.insertId,job_id:jobId,status:'QUEUED'},'Job report berhasil dibuat.');
}));

reportCenterRouter.get('/report-center/jobs/:id',authenticate,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();const job=await one<any>(`SELECT j.*,e.timeout_seconds,a.base_url FROM external_report_job j JOIN external_report_endpoint e ON e.id=j.endpoint_id JOIN external_report_async_config a ON a.endpoint_id=e.id WHERE j.id=?`,[Number(req.params.id)]);if(!job)throw new HttpError(404,'Job report tidak ditemukan.');if(String(req.user!.username).toUpperCase()!=='SUPERUSER'&&Number(job.requested_user_id)!==Number(req.user!.id_user))throw new HttpError(403,'Job report ini milik user lain.');const url=`${String(job.base_url).replace(/\/$/,'')}/${encodeURIComponent(job.upstream_job_id)}`;const response=await fetch(url,{headers:{Authorization:userAuthorization(req),Accept:'application/json'}});const payload=await response.json().catch(()=>null);if(!response.ok)throw new HttpError(response.status===401||response.status===403?response.status:502,`Gagal mengecek status report (HTTP ${response.status}).`);const status=upstreamStatus(payload);const ready=Boolean(payload?.ready??payload?.completed??payload?.data?.ready??payload?.data?.completed)||['COMPLETED','COMPLETE','SUCCESS','SUCCEEDED','DONE','READY','FINISHED'].includes(status);await execute(`UPDATE external_report_job SET status=?,upstream_response=?,last_checked_at=NOW(),completed_at=CASE WHEN ? THEN COALESCE(completed_at,NOW()) ELSE completed_at END WHERE id=?`,[status,JSON.stringify(payload),ready?1:0,job.id]);ok(res,{id:job.id,job_id:job.upstream_job_id,status,ready,response:payload});
}));

reportCenterRouter.get('/report-center/jobs/:id/download',authenticate,asyncHandler(async(req:AuthRequest,res)=>{
  await ensureFeature();const job=await one<any>(`SELECT j.*,e.timeout_seconds,a.base_url,d.report_title,d.output_format FROM external_report_job j JOIN external_report_endpoint e ON e.id=j.endpoint_id JOIN external_report_async_config a ON a.endpoint_id=e.id JOIN external_report_definition d ON d.id=j.report_definition_id WHERE j.id=?`,[Number(req.params.id)]);if(!job)throw new HttpError(404,'Job report tidak ditemukan.');if(String(req.user!.username).toUpperCase()!=='SUPERUSER'&&Number(job.requested_user_id)!==Number(req.user!.id_user))throw new HttpError(403,'Job report ini milik user lain.');const url=`${String(job.base_url).replace(/\/$/,'')}/${encodeURIComponent(job.upstream_job_id)}/download`;const upstream=await fetch(url,{headers:{Authorization:userAuthorization(req),Accept:'application/pdf'}});if(!upstream.ok||!upstream.body)throw new HttpError(upstream.status===401||upstream.status===403?upstream.status:502,`Download report gagal (HTTP ${upstream.status}).`);res.status(upstream.status);res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/pdf');res.setHeader('Content-Disposition',upstream.headers.get('content-disposition')||`attachment; filename="${String(job.report_title).replace(/[^a-z0-9_-]+/gi,'-')}.${String(job.output_format||'PDF').toLowerCase()}"`);Readable.fromWeb(upstream.body as any).pipe(res);
}));
