import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { rows, tableExists, transaction } from '../db.js';

interface CatalogConfig {
  endpoint_id: number;
  catalog_url: string;
  system_code: string;
  timeout_seconds: number;
}

interface CatalogItem {
  type: string;
  title: string;
  description: string | null;
  category: string;
  format: string;
  params: string[];
}

export interface CatalogSyncResult {
  endpoint_id: number;
  discovered: number;
  created: number;
  updated: number;
  unavailable: number;
}

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

function normalize(payload: any, systemCode: string): CatalogItem[] {
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.reports) ? payload.reports : Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set<string>();
  const output: CatalogItem[] = [];
  for (const raw of source) {
    const type = clean(raw?.type ?? raw?.report_type ?? raw?.code, 120);
    const itemSystem = clean(raw?.system, 80);
    if (!type || seen.has(type) || (itemSystem && itemSystem.toLowerCase() !== systemCode.toLowerCase())) continue;
    seen.add(type);
    output.push({
      type,
      title: clean(raw?.title ?? raw?.name ?? type, 180),
      description: clean(raw?.description, 500) || null,
      category: clean(raw?.category ?? 'General', 120) || 'General',
      format: clean(raw?.format ?? 'PDF', 20).toUpperCase() || 'PDF',
      params: Array.isArray(raw?.params) ? raw.params.map((item: unknown) => clean(item, 80)).filter(Boolean) : [],
    });
  }
  return output;
}

async function endpointConfig(endpointId: number): Promise<CatalogConfig | null> {
  const data = await rows<CatalogConfig>(`SELECT a.endpoint_id,a.catalog_url,a.system_code,e.timeout_seconds
    FROM external_report_async_config a JOIN external_report_endpoint e ON e.id=a.endpoint_id
    WHERE a.endpoint_id=? AND e.status='ACTIVE' AND a.catalog_url IS NOT NULL AND TRIM(a.catalog_url)<>'' LIMIT 1`,[endpointId]);
  return data[0] ?? null;
}

async function fetchCatalog(source: CatalogConfig): Promise<CatalogItem[]> {
  const url = new URL(source.catalog_url);
  url.searchParams.set('system', source.system_code || 'mcs');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(120,Math.max(3,Number(source.timeout_seconds)||30))*1000);
  try {
    const response = await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`Catalog report HTTP ${response.status}`);
    return normalize(await response.json(),source.system_code||'mcs');
  } finally { clearTimeout(timer); }
}

async function applyCatalog(connection: PoolConnection, source: CatalogConfig, catalog: CatalogItem[]): Promise<CatalogSyncResult> {
  const [existingRows] = await connection.query<any[]>('SELECT id,report_type FROM external_report_definition WHERE endpoint_id=?',[source.endpoint_id]);
  const existing = new Set(existingRows.map((item) => String(item.report_type)));
  let created = 0;
  for(const item of catalog){
    if(!existing.has(item.type))created++;
    await connection.execute<ResultSetHeader>(`INSERT INTO external_report_definition
      (endpoint_id,report_type,report_title,description,category,output_format,default_params,catalog_params,required_permission,catalog_status,status,discovered_at,last_seen_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'{}',?,NULL,'AVAILABLE','INACTIVE',NOW(),NOW(),NOW(),NOW())
      ON DUPLICATE KEY UPDATE report_title=VALUES(report_title),description=COALESCE(VALUES(description),description),category=VALUES(category),output_format=VALUES(output_format),catalog_params=VALUES(catalog_params),catalog_status='AVAILABLE',last_seen_at=NOW(),updated_at=NOW()`,
      [source.endpoint_id,item.type,item.title,item.description,item.category,item.format,JSON.stringify(item.params)]);
  }
  let unavailable = 0;
  if(catalog.length){
    const placeholders=catalog.map(()=>'?').join(',');
    const [result]=await connection.execute<ResultSetHeader>(`UPDATE external_report_definition SET catalog_status='UNAVAILABLE',updated_at=NOW() WHERE endpoint_id=? AND report_type NOT IN (${placeholders}) AND catalog_status<>'UNAVAILABLE'`,[source.endpoint_id,...catalog.map(item=>item.type)]);
    unavailable=result.affectedRows;
  }else{
    const [result]=await connection.execute<ResultSetHeader>(`UPDATE external_report_definition SET catalog_status='UNAVAILABLE',updated_at=NOW() WHERE endpoint_id=? AND catalog_status<>'UNAVAILABLE'`,[source.endpoint_id]);
    unavailable=result.affectedRows;
  }
  return {endpoint_id:source.endpoint_id,discovered:catalog.length,created,updated:catalog.length-created,unavailable};
}

export async function syncReportCatalogEndpoint(endpointId:number):Promise<CatalogSyncResult>{
  const source=await endpointConfig(endpointId);
  if(!source)throw new Error('Endpoint katalog report tidak aktif atau belum dikonfigurasi.');
  const catalog=await fetchCatalog(source);
  return transaction(connection=>applyCatalog(connection,source,catalog));
}

export async function syncAllReportCatalogs():Promise<CatalogSyncResult[]>{
  if(!(await tableExists('external_report_async_config')) || !(await tableExists('external_report_definition')))return [];
  const configs=await rows<CatalogConfig>(`SELECT a.endpoint_id,a.catalog_url,a.system_code,e.timeout_seconds
    FROM external_report_async_config a JOIN external_report_endpoint e ON e.id=a.endpoint_id
    WHERE e.status='ACTIVE' AND a.catalog_url IS NOT NULL AND TRIM(a.catalog_url)<>''`);
  const output:CatalogSyncResult[]=[];
  for(const source of configs){
    try{output.push(await syncReportCatalogEndpoint(source.endpoint_id));}
    catch(error){console.error(`Report catalog sync endpoint ${source.endpoint_id} failed:`,error);}
  }
  return output;
}

