import { apiV2 } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_V2_URL } from "@/lib/env";

export interface ReportEndpointConfig {id:number;endpoint_name:string;catalog_url:string;auth_header_name:string|null;has_auth:number;timeout_seconds:number;status:string;notes:string|null;protocol?:"CATALOG"|"ASYNC_JOB";base_url?:string|null;report_catalog_url?:string|null;system_code?:string|null;report_definition_id?:number|null;report_type?:string|null;report_title?:string|null;report_description?:string|null;category?:string|null;output_format?:string|null;default_params?:string|null;catalog_params?:string|null;required_permission?:string|null;report_status?:string|null;catalog_status?:string|null;discovered_at?:string|null;last_seen_at?:string|null}
export interface ExternalReport {id:string;title:string;description:string|null;category:string;format:string;report_type?:string;params?:string[];endpoint_id:number;endpoint_name:string;protocol?:"CATALOG"|"ASYNC_JOB"}
export interface ReportCatalog {reports:ExternalReport[];errors:Array<{endpoint_id:number;endpoint_name:string;message:string}>;endpoints_count:number}
export interface ReportFilterOptions {report_type:string;companies:Array<{value:string;label:string}>;locations:Array<{value:string;label:string}>;categories:Array<{value:string;label:string}>;statuses:Array<{value:string;label:string}>;types:Array<{value:string;label:string}>;priorities:Array<{value:string;label:string}>;shifts:Array<{value:string;label:string}>;divisions:Array<{value:string;label:string}>;matched_assets:number|null}
export const getReportEndpointConfigs=(signal?:AbortSignal)=>apiV2.get<ReportEndpointConfig[]>("/report-center/config",{signal});
export const saveReportEndpointConfig=(body:unknown)=>apiV2.post<{id:number}>("/report-center/config",body);
export const deleteReportEndpointConfig=(id:number)=>apiV2.delete(`/report-center/config/${id}`);
export const syncReportCatalog=(endpointId:number)=>apiV2.post<{endpoint_id:number;discovered:number;created:number;updated:number;unavailable:number}>(`/report-center/catalog-sync/${endpointId}`,{});
export const updateReportDefinition=(id:number,body:{status:"ACTIVE"|"INACTIVE";required_permission:string})=>apiV2.patch<{id:number;status:string;required_permission:string|null}>(`/report-center/definitions/${id}`,body);
export const getExternalReportCatalog=(signal?:AbortSignal)=>apiV2.get<ReportCatalog>("/report-center/catalog",{signal});
export const getExternalReportFilters=(report:ExternalReport,params:Record<string,string>,signal?:AbortSignal)=>apiV2.get<ReportFilterOptions>(`/report-center/filters/${report.endpoint_id}/${encodeURIComponent(report.id)}`,{params,signal});

type ReportGenerationOptions = {
  signal?: AbortSignal;
  onProgress?: (progress:number|null,status:string) => void;
};

function wait(milliseconds:number,signal?:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    if(signal?.aborted)return reject(new DOMException("Dibatalkan","AbortError"));
    const timer=setTimeout(resolve,milliseconds);
    signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(new DOMException("Dibatalkan","AbortError"));},{once:true});
  });
}

async function fetchReportBlob(url:string,report:ExternalReport,signal?:AbortSignal){
  const token=getToken();const response=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},signal});
  if(!response.ok)throw new Error((await response.json().catch(()=>null))?.message||`Report gagal (HTTP ${response.status})`);
  const blob=await response.blob();const disposition=response.headers.get("content-disposition")||"";
  const filename=/filename\*?=(?:UTF-8''|\")?([^";]+)/i.exec(disposition)?.[1]||`${report.title}.${report.format.toLowerCase()}`;
  return {blob,filename:decodeURIComponent(filename)};
}

async function generateExternalReport(report:ExternalReport,params:Record<string,string>={},options:ReportGenerationOptions={}){
  if(report.protocol!=="ASYNC_JOB")return fetchReportBlob(`${API_V2_URL}/report-center/run/${report.endpoint_id}/${encodeURIComponent(report.id)}`,report,options.signal);
  const created=await apiV2.post<{id:number;job_id:string;status:string;reused?:boolean;ready?:boolean}>(`/report-center/jobs/${report.endpoint_id}/${encodeURIComponent(report.id)}`,{params},{signal:options.signal});
  const localJobId=created.data.id;
  options.onProgress?.(0,"QUEUED");
  if(created.data.ready){options.onProgress?.(100,"COMPLETED");return fetchReportBlob(`${API_V2_URL}/report-center/jobs/${localJobId}/download`,report,options.signal);}
  for(let attempt=0;attempt<12;attempt+=1){
    if(attempt>0)await wait(5000,options.signal);
    const status=await apiV2.get<{id:number;job_id:string;status:string;ready:boolean;response?:{progress?:number}}>(`/report-center/jobs/${localJobId}`,{signal:options.signal});
    const progress=Number(status.data.response?.progress);
    options.onProgress?.(Number.isFinite(progress)?Math.max(0,Math.min(100,progress)):null,status.data.status);
    if(status.data.ready)return fetchReportBlob(`${API_V2_URL}/report-center/jobs/${localJobId}/download`,report,options.signal);
    if(["FAILED","ERROR","CANCELLED","CANCELED"].includes(status.data.status)){const detail=(status.data.response as {error?:string;message?:string}|undefined)?.error||(status.data.response as {error?:string;message?:string}|undefined)?.message;throw new Error(detail||`Pembuatan report gagal dengan status ${status.data.status}.`);}
  }
  throw new Error("Layanan reporting belum menyelesaikan report setelah 60 detik. Proses di server reporting kemungkinan tertahan; silakan coba lagi atau hubungi tim reporting.");
}

export async function downloadExternalReport(report:ExternalReport,params:Record<string,string>={},options:ReportGenerationOptions={}){
  const {blob,filename}=await generateExternalReport(report,params,options);
  const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

export async function prepareExternalReportPreview(report:ExternalReport,params:Record<string,string>={},options:ReportGenerationOptions={}){
  const {blob,filename}=await generateExternalReport(report,params,options);
  if(report.format.toUpperCase()!=="PDF"){
    const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);return null;
  }
  return {url:URL.createObjectURL(blob),filename,title:report.title};
}
