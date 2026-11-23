import { one, rows } from '../db.js';

const NAMES: Record<string,string> = {
  GA01:'Daily Cleaning & Hygiene Checklist', GA02:'Waste, TPS & Environmental Housekeeping',
  GA03:'Landscaping, Garden & Drainage', GA04:'Outdoor Area Condition Monitoring',
  GA05:'Pallet & Minor Facility Handling', GA06:'GA Preventive Plan & Calendar',
  GA07:'GA Preventive Work Order & Close Approval', GA08:'CCTV Offline Monitoring & Escalation',
  GA09:'Weighbridge CCTV & Security Log Reconciliation', GA10:'GA Report Center & Weekly Governance',
};
const PRIMARY: Record<string,string> = {
  GA01:'Cleaning Completion Rate', GA02:'Waste Route Compliance', GA03:'Landscape Task Compliance',
  GA04:'Outdoor Inspection Completion', GA05:'Pallet Work Completion', GA06:'GA Preventive Coverage',
  GA07:'GA PM On-Time Approved Closure', GA08:'CCTV Availability', GA09:'Weighbridge CCTV Match Rate',
  GA10:'GA Report Timely Publication',
};
const percent = (numerator:number, denominator:number) => denominator > 0 ? Number((numerator * 100 / denominator).toFixed(2)) : null;
const num = (value: unknown) => Number(value ?? 0);

export type GaDashboardFilters = { moduleCode:string; company?:string|null; site?:string|null; from:string; to:string };

function taskScope(filters:GaDashboardFilters, alias='t') {
  const where=[`${alias}.module_code=?`,`${alias}.planned_date BETWEEN ? AND ?`];
  const params:unknown[]=[filters.moduleCode,filters.from,filters.to];
  if(filters.company){where.push(`${alias}.company_code=?`);params.push(filters.company);}
  if(filters.site){where.push(`${alias}.site_code=?`);params.push(filters.site);}
  return { where:where.join(' AND '), params };
}

async function taskDashboard(filters:GaDashboardFilters) {
  const scope=taskScope(filters);
  const summary=await one<any>(`SELECT COUNT(*) total,
    SUM(t.status IN ('APPROVED','CLOSED')) completed,
    SUM(t.status IN ('SUBMITTED','CHECKED')) pending_validation,
    SUM(t.status IN ('PLANNED','IN_PROGRESS','REJECTED')) open_count,
    SUM(t.due_at<NOW() AND t.status NOT IN ('APPROVED','CLOSED')) overdue,
    SUM(t.due_at IS NOT NULL AND t.due_at<=CONCAT(?,' 23:59:59')) due_count,
    SUM(t.status IN ('APPROVED','CLOSED') AND t.approved_at IS NOT NULL AND (t.due_at IS NULL OR t.approved_at<=t.due_at)) on_time,
    SUM(t.status IN ('APPROVED','CLOSED') AND EXISTS(SELECT 1 FROM ga_evidence e WHERE e.entity_type='TASK' AND e.entity_id=t.id)) with_evidence
    FROM ga_task t WHERE ${scope.where}`, [filters.to,...scope.params]);
  const total=num(summary?.total),completed=num(summary?.completed),due=num(summary?.due_count);
  let primaryNumerator=completed,primaryDenominator=total;
  if(filters.moduleCode==='GA06'){
    const clauses=[`o.module_code='GA06'`,`o.status='ACTIVE'`];const p:unknown[]=[];
    if(filters.company){clauses.push('o.company_code=?');p.push(filters.company);}
    if(filters.site){clauses.push('o.site_code=?');p.push(filters.site);}
    const coverage=await one<any>(`SELECT COUNT(DISTINCT o.id) required_count,
      COUNT(DISTINCT CASE WHEN s.status='ACTIVE' THEN o.id END) covered_count
      FROM ga_area_object o LEFT JOIN ga_preventive_schedule s ON s.area_object_id=o.id WHERE ${clauses.join(' AND ')}`,p);
    primaryNumerator=num(coverage?.covered_count);primaryDenominator=num(coverage?.required_count);
  }
  const [statusCounts,trend,locations,queue,ncrs]=await Promise.all([
    rows(`SELECT status,COUNT(*) count FROM ga_task t WHERE ${scope.where} GROUP BY status ORDER BY count DESC`,scope.params),
    rows(`SELECT planned_date date,COUNT(*) planned,SUM(status IN ('APPROVED','CLOSED')) completed,
      SUM(due_at<NOW() AND status NOT IN ('APPROVED','CLOSED')) overdue FROM ga_task t WHERE ${scope.where}
      GROUP BY planned_date ORDER BY planned_date`,scope.params),
    rows(`SELECT location_name label,COUNT(*) total,SUM(status IN ('APPROVED','CLOSED')) completed,
      SUM(status IN ('PLANNED','IN_PROGRESS','REJECTED')) open_count FROM ga_task t WHERE ${scope.where}
      GROUP BY location_name ORDER BY total DESC LIMIT 12`,scope.params),
    rows(`SELECT id,task_number reference,title,location_name,company_code,site_code,maker_name owner,due_at,status,risk_level
      FROM ga_task t WHERE ${scope.where} AND status NOT IN ('APPROVED','CLOSED')
      ORDER BY FIELD(risk_level,'CRITICAL','HIGH','MEDIUM','LOW'),due_at IS NULL,due_at LIMIT 50`,scope.params),
    rows(`SELECT n.id,n.ncr_number reference,n.title,n.severity,n.status,n.due_at,n.assigned_to owner
      FROM ga_exception_ncr n WHERE n.module_code=? AND DATE(n.created_at) BETWEEN ? AND ?
      ${filters.company?'AND EXISTS(SELECT 1 FROM ga_task tx WHERE tx.id=n.source_id AND n.source_type=\'TASK\' AND tx.company_code=?)':''}
      ORDER BY FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.created_at DESC LIMIT 50`,
      [filters.moduleCode,filters.from,filters.to,...(filters.company?[filters.company]:[])]),
  ]);
  return {
    kpis:[
      {code:`KPI-${filters.moduleCode}-01`,label:PRIMARY[filters.moduleCode],value:percent(primaryNumerator,primaryDenominator),unit:'%',numerator:primaryNumerator,denominator:primaryDenominator},
      {code:`KPI-${filters.moduleCode}-02`,label:'Task timeliness',value:percent(num(summary?.on_time),due),unit:'%',numerator:num(summary?.on_time),denominator:due},
      {code:`KPI-${filters.moduleCode}-03`,label:'Evidence completeness',value:percent(num(summary?.with_evidence),completed),unit:'%',numerator:num(summary?.with_evidence),denominator:completed},
    ], summary:{total,completed,open_count:num(summary?.open_count),pending_validation:num(summary?.pending_validation),overdue:num(summary?.overdue)},
    status_counts:statusCounts,trend,comparisons:locations,queue,ncrs,
  };
}

async function cctvDashboard(filters:GaDashboardFilters) {
  const where=[`DATE(e.offline_at) BETWEEN ? AND ?`];const params:unknown[]=[filters.from,filters.to];
  if(filters.company){where.push('o.company_code=?');params.push(filters.company);}
  if(filters.site){where.push('o.site_code=?');params.push(filters.site);}
  const whereSql=where.join(' AND ');
  const days=Math.max(1,Math.floor((new Date(`${filters.to}T00:00:00`).getTime()-new Date(`${filters.from}T00:00:00`).getTime())/86400000)+1);
  const cameras=await one<any>(`SELECT COUNT(*) total FROM ga_area_object o WHERE o.module_code='GA08' AND o.status='ACTIVE' ${filters.company?'AND o.company_code=?':''} ${filters.site?'AND o.site_code=?':''}`,[...(filters.company?[filters.company]:[]),...(filters.site?[filters.site]:[])]);
  const summary=await one<any>(`SELECT COUNT(*) total,SUM(e.status='OFFLINE') offline,SUM(e.status='APPROVED') approved,
    SUM(e.repeat_count>=3) repeated_count,SUM(COALESCE(e.duration_minutes,TIMESTAMPDIFF(MINUTE,e.offline_at,NOW()))) outage_minutes,
    SUM(e.online_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE,e.offline_at,e.online_at)<=240) restored_on_time,
    SUM(EXISTS(SELECT 1 FROM ga_evidence x WHERE x.entity_type='CCTV_EVENT' AND x.entity_id=e.id)) with_evidence
    FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE ${whereSql}`,params);
  const cameraCount=num(cameras?.total),calendarMinutes=cameraCount*days*1440,outage=num(summary?.outage_minutes),total=num(summary?.total),approved=num(summary?.approved);
  const [statusCounts,trend,locations,queue,ncrs]=await Promise.all([
    rows(`SELECT e.status,COUNT(*) count FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE ${whereSql} GROUP BY e.status`,params),
    rows(`SELECT DATE(e.offline_at) date,COUNT(*) planned,SUM(e.status='APPROVED') completed,SUM(e.status='OFFLINE') overdue FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE ${whereSql} GROUP BY DATE(e.offline_at) ORDER BY date`,params),
    rows(`SELECT o.location_name label,COUNT(*) total,SUM(e.status='APPROVED') completed,SUM(e.status='OFFLINE') open_count FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE ${whereSql} GROUP BY o.location_name ORDER BY total DESC LIMIT 12`,params),
    rows(`SELECT e.id,e.event_number reference,CONCAT(o.object_code,' · ',o.object_name) title,o.location_name,o.company_code,o.site_code,e.reported_by owner,e.offline_at due_at,e.status,e.risk_level FROM ga_cctv_event e JOIN ga_area_object o ON o.id=e.camera_object_id WHERE ${whereSql} AND e.status<>'APPROVED' ORDER BY FIELD(e.risk_level,'CRITICAL','HIGH','MEDIUM','LOW'),e.offline_at LIMIT 50`,params),
    rows(`SELECT n.id,n.ncr_number reference,n.title,n.severity,n.status,n.due_at,n.assigned_to owner FROM ga_exception_ncr n WHERE n.module_code='GA08' AND DATE(n.created_at) BETWEEN ? AND ? ORDER BY FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.created_at DESC LIMIT 50`,[filters.from,filters.to]),
  ]);
  return {kpis:[
    {code:'KPI-GA08-01',label:PRIMARY.GA08,value:percent(Math.max(0,calendarMinutes-outage),calendarMinutes),unit:'%',numerator:Math.max(0,calendarMinutes-outage),denominator:calendarMinutes},
    {code:'KPI-GA08-02',label:'Restoration timeliness',value:percent(num(summary?.restored_on_time),total),unit:'%',numerator:num(summary?.restored_on_time),denominator:total},
    {code:'KPI-GA08-03',label:'Evidence completeness',value:percent(num(summary?.with_evidence),approved),unit:'%',numerator:num(summary?.with_evidence),denominator:approved},
  ],summary:{total,completed:approved,open_count:num(summary?.offline),pending_validation:Math.max(0,total-approved-num(summary?.offline)),overdue:num(summary?.repeated_count)},status_counts:statusCounts,trend,comparisons:locations,queue,ncrs};
}

async function weighbridgeDashboard(filters:GaDashboardFilters) {
  const where=[`DATE(w.ticket_entry_at) BETWEEN ? AND ?`];const params:unknown[]=[filters.from,filters.to];
  if(filters.company){where.push('w.company_code=?');params.push(filters.company);}
  if(filters.site){where.push('w.site_code=?');params.push(filters.site);}
  const scope=where.join(' AND ');
  const summary=await one<any>(`SELECT COUNT(*) total,SUM(status='APPROVED') approved,SUM(status IN ('SUBMITTED','CHECKED')) pending_validation,
    SUM(COALESCE(match_time,0)=0 OR COALESCE(match_plate,0)=0 OR COALESCE(match_cargo,0)=0) mismatch,
    SUM(status='APPROVED' AND match_time=1 AND match_plate=1 AND match_cargo=1) matched,
    SUM(checked_at IS NOT NULL AND TIMESTAMPDIFF(HOUR,ticket_entry_at,checked_at)<=24) checked_on_time,
    SUM(match_time IS NOT NULL AND match_plate IS NOT NULL AND match_cargo IS NOT NULL) evidence_complete
    FROM ga_weighbridge_reconciliation w WHERE ${scope}`,params);
  const total=num(summary?.total),approved=num(summary?.approved);
  const [statusCounts,trend,locations,queue,ncrs]=await Promise.all([
    rows(`SELECT status,COUNT(*) count FROM ga_weighbridge_reconciliation w WHERE ${scope} GROUP BY status`,params),
    rows(`SELECT DATE(ticket_entry_at) date,COUNT(*) planned,SUM(status='APPROVED') completed,SUM(COALESCE(match_time,0)=0 OR COALESCE(match_plate,0)=0 OR COALESCE(match_cargo,0)=0) overdue FROM ga_weighbridge_reconciliation w WHERE ${scope} GROUP BY DATE(ticket_entry_at) ORDER BY date`,params),
    rows(`SELECT COALESCE(site_code,'Tanpa site') label,COUNT(*) total,SUM(status='APPROVED') completed,SUM(status NOT IN ('APPROVED','REJECTED')) open_count FROM ga_weighbridge_reconciliation w WHERE ${scope} GROUP BY site_code ORDER BY total DESC`,params),
    rows(`SELECT id,reconciliation_number reference,CONCAT(ticket_number,' · ',vehicle_plate) title,site_code location_name,company_code,site_code,maker_name owner,ticket_entry_at due_at,status,IF(COALESCE(match_time,0)=0 OR COALESCE(match_plate,0)=0 OR COALESCE(match_cargo,0)=0,'HIGH','MEDIUM') risk_level FROM ga_weighbridge_reconciliation w WHERE ${scope} AND status<>'APPROVED' ORDER BY ticket_entry_at LIMIT 50`,params),
    rows(`SELECT n.id,n.ncr_number reference,n.title,n.severity,n.status,n.due_at,n.assigned_to owner FROM ga_exception_ncr n WHERE n.module_code='GA09' AND DATE(n.created_at) BETWEEN ? AND ? ORDER BY FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.created_at DESC LIMIT 50`,[filters.from,filters.to]),
  ]);
  return {kpis:[
    {code:'KPI-GA09-01',label:PRIMARY.GA09,value:percent(num(summary?.matched),approved),unit:'%',numerator:num(summary?.matched),denominator:approved},
    {code:'KPI-GA09-02',label:'Reconciliation timeliness',value:percent(num(summary?.checked_on_time),total),unit:'%',numerator:num(summary?.checked_on_time),denominator:total},
    {code:'KPI-GA09-03',label:'Evidence completeness',value:percent(num(summary?.evidence_complete),total),unit:'%',numerator:num(summary?.evidence_complete),denominator:total},
  ],summary:{total,completed:approved,open_count:Math.max(0,total-approved-num(summary?.pending_validation)),pending_validation:num(summary?.pending_validation),overdue:num(summary?.mismatch)},status_counts:statusCounts,trend,comparisons:locations,queue,ncrs};
}

async function publicationDashboard(filters:GaDashboardFilters) {
  const where=[`p.period_end BETWEEN ? AND ?`];const params:unknown[]=[filters.from,filters.to];
  if(filters.company){where.push('p.company_code=?');params.push(filters.company);}
  if(filters.site){where.push('p.site_code=?');params.push(filters.site);}
  const scope=where.join(' AND ');
  const summary=await one<any>(`SELECT COUNT(*) total,SUM(status='PUBLISHED') published,SUM(status IN ('REVIEWED','APPROVED')) pending_validation,
    SUM(status='PUBLISHED' AND DATE(published_at)<=DATE_ADD(period_end,INTERVAL 2 DAY)) published_on_time,
    SUM(approved_at IS NOT NULL AND TIMESTAMPDIFF(HOUR,created_at,approved_at)<=48) approved_on_time,
    SUM(source_snapshot IS NOT NULL AND JSON_VALID(source_snapshot)) evidence_complete,
    SUM(period_end<CURDATE() AND status<>'PUBLISHED') overdue FROM ga_weekly_publication p WHERE ${scope}`,params);
  const total=num(summary?.total),published=num(summary?.published);
  const [statusCounts,trend,locations,queue,ncrs]=await Promise.all([
    rows(`SELECT status,COUNT(*) count FROM ga_weekly_publication p WHERE ${scope} GROUP BY status`,params),
    rows(`SELECT period_end date,COUNT(*) planned,SUM(status='PUBLISHED') completed,SUM(period_end<CURDATE() AND status<>'PUBLISHED') overdue FROM ga_weekly_publication p WHERE ${scope} GROUP BY period_end ORDER BY period_end`,params),
    rows(`SELECT COALESCE(site_code,'Tanpa site') label,COUNT(*) total,SUM(status='PUBLISHED') completed,SUM(status<>'PUBLISHED') open_count FROM ga_weekly_publication p WHERE ${scope} GROUP BY site_code ORDER BY total DESC`,params),
    rows(`SELECT id,publication_number reference,CONCAT(report_variant,' · v',version_no) title,site_code location_name,company_code,site_code,created_by owner,CONCAT(period_end,' 23:59:59') due_at,status,'MEDIUM' risk_level FROM ga_weekly_publication p WHERE ${scope} AND status<>'PUBLISHED' ORDER BY period_end LIMIT 50`,params),
    rows(`SELECT n.id,n.ncr_number reference,n.title,n.severity,n.status,n.due_at,n.assigned_to owner FROM ga_exception_ncr n WHERE n.module_code='GA10' AND DATE(n.created_at) BETWEEN ? AND ? ORDER BY FIELD(n.severity,'CRITICAL','HIGH','MEDIUM','LOW'),n.created_at DESC LIMIT 50`,[filters.from,filters.to]),
  ]);
  return {kpis:[
    {code:'KPI-GA10-01',label:PRIMARY.GA10,value:percent(num(summary?.published_on_time),total),unit:'%',numerator:num(summary?.published_on_time),denominator:total},
    {code:'KPI-GA10-02',label:'Approval timeliness',value:percent(num(summary?.approved_on_time),total),unit:'%',numerator:num(summary?.approved_on_time),denominator:total},
    {code:'KPI-GA10-03',label:'Source traceability',value:percent(num(summary?.evidence_complete),total),unit:'%',numerator:num(summary?.evidence_complete),denominator:total},
  ],summary:{total,completed:published,open_count:Math.max(0,total-published-num(summary?.pending_validation)),pending_validation:num(summary?.pending_validation),overdue:num(summary?.overdue)},status_counts:statusCounts,trend,comparisons:locations,queue,ncrs};
}

export async function getGeneralAffairSubmoduleDashboard(filters:GaDashboardFilters) {
  const core=filters.moduleCode==='GA08'?await cctvDashboard(filters):filters.moduleCode==='GA09'?await weighbridgeDashboard(filters):filters.moduleCode==='GA10'?await publicationDashboard(filters):await taskDashboard(filters);
  const [companies,sites]=await Promise.all([
    rows<{value:string}>(`SELECT DISTINCT company_code value FROM ga_area_object WHERE status='ACTIVE' UNION SELECT DISTINCT company_code FROM ga_task UNION SELECT DISTINCT company_code FROM ga_weighbridge_reconciliation UNION SELECT DISTINCT company_code FROM ga_weekly_publication ORDER BY value`),
    rows<{value:string}>(`SELECT DISTINCT site_code value FROM ga_area_object WHERE site_code IS NOT NULL AND site_code<>'' ${filters.company?'AND company_code=?':''} UNION SELECT DISTINCT site_code FROM ga_task WHERE site_code IS NOT NULL AND site_code<>'' ${filters.company?'AND company_code=?':''} ORDER BY value`,filters.company?[filters.company,filters.company]:[]),
  ]);
  return {module_code:filters.moduleCode,module_name:NAMES[filters.moduleCode],period:{from:filters.from,to:filters.to},filters:{company:filters.company??null,site:filters.site??null,companies:companies.map(x=>x.value),sites:sites.map(x=>x.value)},freshness:{generated_at:new Date().toISOString(),timezone:'Asia/Jakarta',source:'MCS_GA'},...core};
}
