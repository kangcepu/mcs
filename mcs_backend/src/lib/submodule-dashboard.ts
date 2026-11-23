import { one, rows, tableExists } from '../db.js';
import { getGeneralAffairSubmoduleDashboard } from './general-affair-dashboard.js';
import type { User } from '../types.js';
import { HttpError } from '../http.js';
import { permissionFields } from '../auth.js';

type Filters={moduleCode?:string;group?:string;status?:string;search?:string;company?:string|null;site?:string|null;from:string;to:string};
const percent=(a:number,b:number)=>b>0?Number((a*100/b).toFixed(2)):null;
const num=(value:unknown)=>Number(value??0);

type CatalogMetric={module_code:string;transaction_count:number;pending_count:number;overdue_count:number;last_activity_at:string|null};

const PENDING_WO_STATUSES=new Set([
  'WAIT_KA_DIV','WAIT_KA_DIV_MTC','WAIT_EXECUTOR_ADMIN',
  'COMPLETE_EXECUTOR','NEED_CLOSED','PENDING_CLOSE_REVIEW',
]);
const FINAL_WO_STATUSES=new Set(['CLOSED','AUTO_CLOSED','VOID','REJECT','DECLINE','DONE','COMPLETE']);

function newerDate(a:unknown,b:unknown):string|null{
  const left=String(a??'').trim(),right=String(b??'').trim();
  if(!left)return right||null;if(!right)return left||null;return left>right?left:right;
}

/**
 * MT01-MT13 masih menggunakan tabel transaksi WO legacy. Validation Engine
 * hanya menyimpan pekerjaan yang memang memerlukan checker/approver baru,
 * sehingga menjadikannya satu-satunya sumber membuat seluruh kartu bernilai 0.
 * Adapter ini mengelompokkan transaksi existing tanpa memindahkan datanya.
 */
async function maintenanceCatalogMetrics(filters:Filters):Promise<Map<string,CatalogMetric>>{
  const companySql=filters.company?' AND UPPER(TRIM(w.company))=UPPER(TRIM(?))':'';
  const opParams:unknown[]=[filters.from,filters.to,...(filters.company?[filters.company]:[])];
  const mesoParams:unknown[]=[filters.from,filters.to,...(filters.company?[filters.company]:[])];
  const [schedule,sourceRows]=await Promise.all([
    one<Record<string,unknown>>(`SELECT COUNT(*) transaction_count,
      MAX(NULLIF(last_update,'')) last_activity_at
      FROM tbl_schedules_detail
      WHERE is_pause='started'${filters.company?' AND UPPER(TRIM(company))=UPPER(TRIM(?))':''}`,
      filters.company?[filters.company]:[]),
    rows<Record<string,unknown>>(`
      SELECT 'OPERATIONAL' source,UPPER(TRIM(COALESCE(w.type_wo,''))) type_key,
        LOWER(TRIM(COALESCE(w.category_maintenance,''))) category_key,
        UPPER(TRIM(COALESCE(a.mtc_area_key,''))) area_key,
        UPPER(TRIM(COALESCE(a.LocationAsset,w.location,''))) location_key,
        CASE WHEN UPPER(CONCAT_WS(' ',w.job_title,w.job_requirement)) REGEXP 'LOTO|LOCK.?OUT|TAG.?OUT|SAFETY' THEN 1 ELSE 0 END safety_key,
        UPPER(TRIM(COALESCE(w.status,''))) status,COUNT(*) total,
        MAX(COALESCE(w.updated_at,w.created_at)) last_activity_at,
        SUM(w.date<CURDATE()) older_than_today
      FROM tb_wo_mtc_operational w LEFT JOIN asset a ON a.AssetID=w.id_equipment
      WHERE w.date BETWEEN ? AND ?${companySql}
      GROUP BY type_key,category_key,area_key,location_key,safety_key,status
      UNION ALL
      SELECT 'MESO' source,UPPER(TRIM(COALESCE(w.type_wo,''))) type_key,
        '' category_key,UPPER(TRIM(COALESCE(a.mtc_area_key,''))) area_key,
        UPPER(TRIM(COALESCE(a.LocationAsset,w.location,''))) location_key,
        CASE WHEN UPPER(CONCAT_WS(' ',w.job_title,w.job_requirement)) REGEXP 'LOTO|LOCK.?OUT|TAG.?OUT|SAFETY' THEN 1 ELSE 0 END safety_key,
        UPPER(TRIM(COALESCE(w.status,''))) status,COUNT(*) total,
        MAX(COALESCE(w.updated_at,w.created_at)) last_activity_at,
        SUM(w.date<CURDATE()) older_than_today
      FROM tb_wo_mtc w LEFT JOIN asset a ON a.AssetID=w.id_equipment
      WHERE w.date BETWEEN ? AND ?${companySql}
      GROUP BY type_key,area_key,location_key,safety_key,status`,
      [...opParams,...mesoParams]),
  ]);
  const result=new Map<string,CatalogMetric>();
  const add=(code:string,row:Record<string,unknown>)=>{
    const current=result.get(code)??{module_code:code,transaction_count:0,pending_count:0,overdue_count:0,last_activity_at:null};
    const total=num(row.total),status=String(row.status??'');
    current.transaction_count+=total;
    if(PENDING_WO_STATUSES.has(status))current.pending_count+=total;
    if(!FINAL_WO_STATUSES.has(status))current.overdue_count+=num(row.older_than_today);
    current.last_activity_at=newerDate(current.last_activity_at,row.last_activity_at);
    result.set(code,current);
  };
  result.set('MT01',{module_code:'MT01',transaction_count:num(schedule?.transaction_count),pending_count:0,overdue_count:0,last_activity_at:String(schedule?.last_activity_at??'')||null});
  for(const row of sourceRows){
    const source=String(row.source),type=String(row.type_key),category=String(row.category_key);
    const area=String(row.area_key),location=String(row.location_key);
    const preventive=type.includes('PREV');
    const corrective=type.includes('CORRECT')||type.includes('BREAKDOWN');
    if(preventive)add('MT02',row);
    if(corrective&&source==='OPERATIONAL')add('MT03',row);
    if(corrective&&source==='MESO')add('MT04',row);
    if(area.includes('WNB')||location.includes('BROKER')||location.includes('WASHING'))add('MT05',row);
    if(area.includes('INJECT')||location.includes('INJECT')||location.includes('MOULD')||location.includes('MOLD'))add('MT06',row);
    if(area.includes('SAWMILL')||location.includes('SAWMILL'))add('MT07',row);
    if(location.includes('FJLB'))add('MT08',row);
    if(source==='OPERATIONAL'&&['','general','mechanical','mekanikal'].includes(category))add('MT09',row);
    if(source==='OPERATIONAL'&&(category.includes('electric')||category.includes('elektrik')))add('MT10',row);
    if(source==='OPERATIONAL'&&(category.includes('civil')||category.includes('sipil')))add('MT11',row);
    if(source==='OPERATIONAL'&&(category.includes('automotive')||category.includes('otomotif')))add('MT12',row);
    if(num(row.safety_key)===1)add('MT13',row);
  }
  return result;
}

type TableMetricSpec={table:string;dateColumn?:string;statusColumn?:string;dueColumn?:string;companyColumn?:string;where?:string;allTime?:boolean};
const TABLE_METRICS:Record<string,TableMetricSpec>={
  AS01:{table:'asset',dateColumn:'created_at',companyColumn:'CompanyName',where:"active=1",allTime:true},
  AS02:{table:'asset',dateColumn:'created_at',companyColumn:'CompanyName',where:"TRIM(COALESCE(CategoryAsset,''))<>''",allTime:true},
  AS03:{table:'asset_location_history',dateColumn:'moved_at',companyColumn:'company_to'},
  AS04:{table:'asset_mutation_header',dateColumn:'created_at',statusColumn:'status',companyColumn:'company_before'},
  AS05:{table:'asset_custom_details',dateColumn:'created_at',allTime:true},
  AS06:{table:'stock_opname_validation_control',dateColumn:'created_at',statusColumn:'status',where:"UPPER(opname_type)='BOM'"},
  AS07:{table:'stock_opname_validation_control',dateColumn:'created_at',statusColumn:'status',where:"UPPER(opname_type)<>'BOM'"},
  AS08:{table:'asset_audit_timeline',dateColumn:'event_at',where:"event_category='CONDITION'"},
  AS09:{table:'asset_audit_timeline',dateColumn:'event_at'},
  AS10:{table:'asset',dateColumn:'updated_at',companyColumn:'CompanyName',where:"active=0 OR UPPER(COALESCE(status,'')) IN ('INACTIVE','DISABLED','DISPOSED')",allTime:true},
  SP01:{table:'sparepart_master',dateColumn:'created_at',allTime:true},
  SP02:{table:'sparepart_receipt',dateColumn:'created_at',statusColumn:'status'},
  SP03:{table:'sparepart_receipt',dateColumn:'submitted_at',statusColumn:'status',where:"submitted_at IS NOT NULL"},
  SP04:{table:'sparepart_stock_ledger',dateColumn:'movement_at'},
  SP05:{table:'sparepart_warehouse',dateColumn:'created_at',companyColumn:'company_code',allTime:true},
  SP06:{table:'sparepart_wo_request',dateColumn:'created_at',statusColumn:'status'},
  SP07:{table:'sparepart_wo_allocation',dateColumn:'created_at'},
  SP08:{table:'sparepart_stock_ledger',dateColumn:'movement_at',where:"UPPER(movement_type) LIKE '%RETURN%'"},
  SP09:{table:'sparepart_stock_transfer',dateColumn:'created_at',statusColumn:'status'},
  SP10:{table:'sparepart_stock_opname',dateColumn:'created_at',statusColumn:'status'},
  SP11:{table:'sparepart_erp_reconciliation',dateColumn:'created_at',statusColumn:'status',companyColumn:'company_code'},
  SP12:{table:'sparepart_governance_ncr',dateColumn:'created_at',statusColumn:'status',dueColumn:'due_date',where:"UPPER(category) LIKE '%SHORT%' OR UPPER(title) LIKE '%REORDER%' OR UPPER(title) LIKE '%SHORT%'"},
  FL01:{table:'fleet_vehicle_profile',dateColumn:'created_at',allTime:true},
  FL02:{table:'fleet_daily_inspection',dateColumn:'inspected_at',statusColumn:'status'},
  FL03:{table:'fleet_fuel_transaction',dateColumn:'fueled_at',statusColumn:'status',where:"UPPER(COALESCE(reference_number,'')) NOT LIKE '%FORKLIFT%'"},
  FL04:{table:'fleet_fuel_transaction',dateColumn:'fueled_at',statusColumn:'status',where:"UPPER(COALESCE(reference_number,'')) LIKE '%FORKLIFT%'"},
  FL05:{table:'fleet_meter_reading',dateColumn:'reading_at',statusColumn:'status'},
  FL06:{table:'fleet_preventive_reminder',dateColumn:'created_at',statusColumn:'status',dueColumn:'due_date'},
  FL07:{table:'fleet_service_history',dateColumn:'created_at',statusColumn:'status'},
  FL08:{table:'fleet_anomaly',dateColumn:'detected_at',statusColumn:'status'},
  EN01:{table:'energy_meter',dateColumn:'created_at',allTime:true},
  EN02:{table:'energy_meter_reading',dateColumn:'read_at',statusColumn:'status'},
  EN03:{table:'energy_efficiency_kpi',dateColumn:'created_at',allTime:true},
  EN04:{table:'energy_genset_profile',dateColumn:'created_at',allTime:true},
  EN05:{table:'energy_genset_operation',dateColumn:'started_at',statusColumn:'status'},
  EN06:{table:'energy_genset_fuel_usage',dateColumn:'created_at'},
  EN07:{table:'energy_fuel_stock_opname',dateColumn:'opname_at',statusColumn:'status'},
  EN08:{table:'energy_meter_reading',dateColumn:'read_at',statusColumn:'status',where:"meter_id IN (SELECT id FROM energy_meter WHERE UPPER(meter_type) LIKE '%WATER%')"},
  EN09:{table:'energy_utility_operation',dateColumn:'inspected_at',statusColumn:'status'},
  EN10:{table:'energy_utility_allocation',dateColumn:'created_at',statusColumn:'status'},
  GV01:{table:'validation_request',dateColumn:'created_at',statusColumn:'state',dueColumn:'due_at'},
  GV02:{table:'validation_rule',dateColumn:'created_at',allTime:true},
  GV03:{table:'external_report_job',dateColumn:'requested_at',statusColumn:'status'},
  GV04:{table:'validation_ncr',dateColumn:'created_at',statusColumn:'status',dueColumn:'due_at'},
  GV05:{table:'external_report_definition',dateColumn:'created_at',where:"UPPER(COALESCE(category,'')) REGEXP 'MANUAL|SOP|ISO'",allTime:true},
  GV06:{table:'sparepart_erp_reconciliation',dateColumn:'created_at',statusColumn:'status'},
};

const PENDING_GENERIC=['SUBMITTED','CHECKING','PENDING_APPROVAL','PENDING','WAITING','OPEN','DRAFT','REVIEWED','CHECKED','RECOUNT'];
const DONE_GENERIC=['APPROVED','CLOSED','LOCKED','COMPLETED','COMPLETE','DONE','PUBLISHED','RESOLVED','REJECTED','REJECT','CANCELLED','VOID'];

async function tableCatalogMetric(code:string,spec:TableMetricSpec,filters:Filters):Promise<CatalogMetric>{
  const empty={module_code:code,transaction_count:0,pending_count:0,overdue_count:0,last_activity_at:null};
  if(!await tableExists(spec.table))return empty;
  const where=[spec.where?`(${spec.where})`:'1=1'];const params:unknown[]=[];
  if(!spec.allTime&&spec.dateColumn){where.push(`DATE(\`${spec.dateColumn}\`) BETWEEN ? AND ?`);params.push(filters.from,filters.to);}
  if(filters.company&&spec.companyColumn){where.push(`UPPER(TRIM(\`${spec.companyColumn}\`))=UPPER(TRIM(?))`);params.push(filters.company);}
  const status=spec.statusColumn?`UPPER(TRIM(COALESCE(\`${spec.statusColumn}\`,'')))`:"''";
  const pending=spec.statusColumn?`SUM(${status} IN (${PENDING_GENERIC.map(()=>'?').join(',')}))`:'0';
  const overdue=spec.dueColumn?`SUM(\`${spec.dueColumn}\`<NOW() AND ${status} NOT IN (${DONE_GENERIC.map(()=>'?').join(',')}))`:'0';
  const last=spec.dateColumn?`MAX(\`${spec.dateColumn}\`)`:'NULL';
  const row=await one<Record<string,unknown>>(`SELECT COUNT(*) transaction_count,${pending} pending_count,
    ${overdue} overdue_count,${last} last_activity_at FROM \`${spec.table}\` WHERE ${where.join(' AND ')}`,
    [...(spec.statusColumn?PENDING_GENERIC:[]),...(spec.dueColumn?DONE_GENERIC:[]),...params]);
  return {module_code:code,transaction_count:num(row?.transaction_count),pending_count:num(row?.pending_count),
    overdue_count:num(row?.overdue_count),last_activity_at:String(row?.last_activity_at??'')||null};
}

async function tableCatalogMetrics(group:string,filters:Filters):Promise<Map<string,CatalogMetric>>{
  const entries=Object.entries(TABLE_METRICS).filter(([code])=>
    (group==='ASSET'&&code.startsWith('AS'))||(group==='SPAREPART'&&code.startsWith('SP'))||
    (group==='FLEET'&&code.startsWith('FL'))||(group==='ENERGY'&&code.startsWith('EN'))||
    (group==='GOVERNANCE'&&code.startsWith('GV')));
  const metrics=await Promise.all(entries.map(([code,spec])=>tableCatalogMetric(code,spec,filters)));
  return new Map(metrics.map(metric=>[metric.module_code,metric]));
}

async function generalAffairCatalogMetrics(catalog:Array<Record<string,unknown>>,filters:Filters):Promise<Map<string,CatalogMetric>>{
  const metrics=await Promise.all(catalog.map(async(item)=>{
    const code=String(item.module_code);
    const data=await getGeneralAffairSubmoduleDashboard({moduleCode:code,company:filters.company,site:filters.site,from:filters.from,to:filters.to});
    return {module_code:code,transaction_count:num(data.summary.total),pending_count:num(data.summary.pending_validation),
      overdue_count:num(data.summary.overdue),last_activity_at:null} satisfies CatalogMetric;
  }));
  return new Map(metrics.map(metric=>[metric.module_code,metric]));
}

function elevated(user:User){const position=String(user.id_position??'').toUpperCase();return String(user.username??'').toUpperCase()==='SUPERUSER'||Number(user.approval_all??0)===1||position.includes('MANAGEMENT')||position.includes('DIVHEAD');}
function grantedPermissions(user:User){return permissionFields.filter(key=>Number(user[key]??0)===1);}

export async function listSubmoduleDashboards(filters:Filters,user:User){
  const where=['1=1'];const params:unknown[]=[];
  if(filters.group){where.push('r.module_group=?');params.push(filters.group);}
  if(filters.status){where.push('r.rollout_status=?');params.push(filters.status);}
  if(filters.search){where.push('(r.module_code LIKE ? OR r.module_name LIKE ?)');const q=`%${filters.search}%`;params.push(q,q);}
  if(!elevated(user)){
    const granted=grantedPermissions(user);const permissionAccess=granted.length?` OR (a.user_id IS NULL AND a.permission_code IN (${granted.map(()=>'?').join(',')}))`:'';
    where.push(`(EXISTS(SELECT 1 FROM validation_request mine WHERE mine.module_code=r.module_code AND (mine.maker_user_id=? OR mine.checker_user_id=? OR mine.approver_user_id=? OR mine.close_reviewer_user_id=?))
      OR EXISTS(SELECT 1 FROM validation_assignment a JOIN validation_rule ar ON ar.id=a.rule_id WHERE ar.module_code=r.module_code AND (a.user_id=?${permissionAccess}) AND a.status='ACTIVE' AND a.valid_from<=NOW() AND (a.valid_until IS NULL OR a.valid_until>=NOW())))`);
    params.push(user.id_user,user.id_user,user.id_user,user.id_user,user.id_user,...granted);
  }
  const scope:string[]=['DATE(v.submitted_at) BETWEEN ? AND ?'];const scopeParams:unknown[]=[filters.from,filters.to];
  if(filters.company){scope.push('v.company_id=?');scopeParams.push(filters.company);}
  if(filters.site){scope.push('v.site_id=?');scopeParams.push(filters.site);}
  if(!elevated(user)){scope.push('(v.maker_user_id=? OR v.checker_user_id=? OR v.approver_user_id=? OR v.close_reviewer_user_id=?)');scopeParams.push(user.id_user,user.id_user,user.id_user,user.id_user);}
  const catalog=await rows<Record<string,unknown>>(`SELECT r.module_code,r.module_group,r.module_name,r.rollout_order,r.rollout_status,
    r.default_risk_level,r.default_sla_hours,r.adapter_code,
    COUNT(v.id) transaction_count,
    SUM(v.state IN ('SUBMITTED','CHECKING','PENDING_APPROVAL')) pending_count,
    SUM(v.due_at<NOW() AND v.state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')) overdue_count,
    MAX(COALESCE(v.updated_at,v.created_at)) last_activity_at
    FROM validation_module_registry r
    LEFT JOIN validation_request v ON v.module_code=r.module_code AND ${scope.join(' AND ')}
    WHERE ${where.join(' AND ')} GROUP BY r.module_code,r.module_group,r.module_name,r.rollout_order,
      r.rollout_status,r.default_risk_level,r.default_sla_hours,r.adapter_code
    ORDER BY r.rollout_order`,[...scopeParams,...params]);
  let actual:Map<string,CatalogMetric>;
  if(filters.group==='MAINTENANCE')actual=await maintenanceCatalogMetrics(filters);
  else if(filters.group==='GENERAL_AFFAIR')actual=await generalAffairCatalogMetrics(catalog,filters);
  else if(['ASSET','SPAREPART','FLEET','ENERGY','GOVERNANCE'].includes(String(filters.group)))actual=await tableCatalogMetrics(String(filters.group),filters);
  else return catalog;
  return catalog.map((item)=>{
    const metric=actual.get(String(item.module_code));
    if(!metric)return item;
    return {...item,transaction_count:metric.transaction_count,
      pending_count:metric.pending_count+num(item.pending_count),
      overdue_count:metric.overdue_count+num(item.overdue_count),
      last_activity_at:newerDate(metric.last_activity_at,item.last_activity_at)};
  });
}

async function genericDashboard(filters:Required<Pick<Filters,'moduleCode'|'from'|'to'>>&Filters,user:User){
  const registry=await one<any>('SELECT * FROM validation_module_registry WHERE module_code=?',[filters.moduleCode]);
  if(!registry) throw new HttpError(404,'Submodul dashboard tidak ditemukan');
  const where=['v.module_code=?','DATE(v.submitted_at) BETWEEN ? AND ?'];const p:unknown[]=[filters.moduleCode,filters.from,filters.to];
  if(filters.company){where.push('v.company_id=?');p.push(filters.company);}
  if(filters.site){where.push('v.site_id=?');p.push(filters.site);}
  if(!elevated(user)){where.push('(v.maker_user_id=? OR v.checker_user_id=? OR v.approver_user_id=? OR v.close_reviewer_user_id=?)');p.push(user.id_user,user.id_user,user.id_user,user.id_user);}
  const scope=where.join(' AND ');
  const [summary,statusCounts,trend,comparisons,queue,ncrs,companies,sites]=await Promise.all([
    one<any>(`SELECT COUNT(*) total,SUM(state IN ('APPROVED','CLOSED','LOCKED')) completed,
      SUM(state IN ('SUBMITTED','CHECKING','PENDING_APPROVAL')) pending_validation,
      SUM(state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')) open_count,
      SUM(due_at<NOW() AND state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')) overdue,
      SUM(approved_at IS NOT NULL AND (due_at IS NULL OR approved_at<=due_at)) on_time,
      SUM(EXISTS(SELECT 1 FROM validation_evidence e WHERE e.request_id=v.id)) with_evidence
      FROM validation_request v WHERE ${scope}`,p),
    rows(`SELECT state status,COUNT(*) count FROM validation_request v WHERE ${scope} GROUP BY state ORDER BY count DESC`,p),
    rows(`SELECT DATE(submitted_at) date,COUNT(*) planned,SUM(state IN ('APPROVED','CLOSED','LOCKED')) completed,
      SUM(due_at<NOW() AND state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')) overdue
      FROM validation_request v WHERE ${scope} GROUP BY DATE(submitted_at) ORDER BY date`,p),
    rows(`SELECT COALESCE(site_id,company_id,'Tanpa scope') label,COUNT(*) total,
      SUM(state IN ('APPROVED','CLOSED','LOCKED')) completed,
      SUM(state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')) open_count
      FROM validation_request v WHERE ${scope} GROUP BY COALESCE(site_id,company_id,'Tanpa scope') ORDER BY total DESC LIMIT 12`,p),
    rows(`SELECT id,request_number reference,title,site_id location_name,company_id company_code,site_id site_code,
      COALESCE(updated_by,created_by) owner,due_at,state status,risk_level FROM validation_request v
      WHERE ${scope} AND state NOT IN ('APPROVED','CLOSED','LOCKED','REJECTED')
      ORDER BY FIELD(risk_level,'CRITICAL','HIGH','MEDIUM','LOW'),due_at IS NULL,due_at LIMIT 50`,p),
    rows(`SELECT n.id,n.ncr_number reference,n.title,n.severity,n.status,n.due_at,n.assigned_to owner
      FROM validation_ncr n JOIN validation_request v ON v.id=n.request_id WHERE ${scope}
      ORDER BY FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.created_at DESC LIMIT 50`,p),
    rows<{value:string}>('SELECT DISTINCT company_id value FROM validation_request WHERE module_code=? AND company_id IS NOT NULL ORDER BY company_id',[filters.moduleCode]),
    rows<{value:string}>('SELECT DISTINCT site_id value FROM validation_request WHERE module_code=? AND site_id IS NOT NULL ORDER BY site_id',[filters.moduleCode]),
  ]);
  const total=num(summary?.total),completed=num(summary?.completed);
  return {module_code:registry.module_code,module_name:registry.module_name,module_group:registry.module_group,
    rollout_status:registry.rollout_status,adapter_code:registry.adapter_code??'VALIDATION_ENGINE',
    period:{from:filters.from,to:filters.to},filters:{company:filters.company??null,site:filters.site??null,companies:companies.map(x=>x.value),sites:sites.map(x=>x.value)},
    freshness:{generated_at:new Date().toISOString(),timezone:'Asia/Jakarta',source:'MCS_VALIDATION_ENGINE'},
    data_notice:total===0?'Submodul sudah terdaftar. Belum ada transaksi yang masuk ke Validation Engine pada scope ini; KPI ditampilkan N/M.':null,
    kpis:[
      {code:`KPI-${registry.module_code}-01`,label:`${registry.module_name} completion`,value:percent(completed,total),unit:'%',numerator:completed,denominator:total},
      {code:`KPI-${registry.module_code}-02`,label:'Validation timeliness',value:percent(num(summary?.on_time),completed),unit:'%',numerator:num(summary?.on_time),denominator:completed},
      {code:`KPI-${registry.module_code}-03`,label:'Evidence completeness',value:percent(num(summary?.with_evidence),total),unit:'%',numerator:num(summary?.with_evidence),denominator:total},
    ],summary:{total,completed,open_count:num(summary?.open_count),pending_validation:num(summary?.pending_validation),overdue:num(summary?.overdue)},
    status_counts:statusCounts,trend,comparisons,queue,ncrs};
}

export async function getSubmoduleDashboard(filters:Required<Pick<Filters,'moduleCode'|'from'|'to'>>&Filters,user:User){
  if(!elevated(user)){
    const granted=grantedPermissions(user);const permissionAccess=granted.length?` OR (a.user_id IS NULL AND a.permission_code IN (${granted.map(()=>'?').join(',')}))`:'';
    const access=await one<{allowed:number}>(`SELECT 1 allowed FROM validation_module_registry r WHERE r.module_code=? AND (
      EXISTS(SELECT 1 FROM validation_request v WHERE v.module_code=r.module_code AND (v.maker_user_id=? OR v.checker_user_id=? OR v.approver_user_id=? OR v.close_reviewer_user_id=?))
      OR EXISTS(SELECT 1 FROM validation_assignment a JOIN validation_rule ar ON ar.id=a.rule_id WHERE ar.module_code=r.module_code AND (a.user_id=?${permissionAccess}) AND a.status='ACTIVE' AND a.valid_from<=NOW() AND (a.valid_until IS NULL OR a.valid_until>=NOW()))) LIMIT 1`,
      [filters.moduleCode,user.id_user,user.id_user,user.id_user,user.id_user,user.id_user,...granted]);
    if(!access) throw new HttpError(403,'Anda tidak memiliki assignment pada submodul ini');
  }
  if(/^GA(0[1-9]|10)$/.test(filters.moduleCode)){
    const company=filters.company??(!elevated(user)?String(user.company_name??'')||null:null);
    const result=await getGeneralAffairSubmoduleDashboard({moduleCode:filters.moduleCode,company,site:filters.site,from:filters.from,to:filters.to});
    return {...result,module_group:'GENERAL_AFFAIR',rollout_status:'ACTIVE',adapter_code:'GENERAL_AFFAIR'};
  }
  return genericDashboard(filters,user);
}
