import { apiV2 } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_V2_URL } from "@/lib/env";

export interface ReportEndpointConfig {id:number;endpoint_name:string;catalog_url:string;auth_header_name:string|null;has_auth:number;timeout_seconds:number;status:string;notes:string|null;protocol?:"CATALOG"|"ASYNC_JOB";base_url?:string|null;system_code?:string|null;report_type?:string|null;report_title?:string|null;report_description?:string|null;category?:string|null;output_format?:string|null;default_params?:string|null;required_permission?:string|null}
export interface ExternalReport {id:string;title:string;description:string|null;category:string;format:string;report_type?:string;endpoint_id:number;endpoint_name:string;protocol?:"CATALOG"|"ASYNC_JOB"}
export interface ReportCatalog {reports:ExternalReport[];errors:Array<{endpoint_id:number;endpoint_name:string;message:string}>;endpoints_count:number}
export interface ReportFilterOptions {report_type:string;companies:Array<{value:string;label:string}>;locations:Array<{value:string;label:string}>;matched_assets:number|null}
export const getReportEndpointConfigs=(signal?:AbortSignal)=>apiV2.get<ReportEndpointConfig[]>("/report-center/config",{signal});
export const saveReportEndpointConfig=(body:unknown)=>apiV2.post<{id:number}>("/report-center/config",body);
export const deleteReportEndpointConfig=(id:number)=>apiV2.delete(`/report-center/config/${id}`);
export const getExternalReportCatalog=(signal?:AbortSignal)=>apiV2.get<ReportCatalog>("/report-center/catalog",{signal});
export const getExternalReportFilters=(report:ExternalReport,params:Record<string,string>,signal?:AbortSignal)=>apiV2.get<ReportFilterOptions>(`/report-center/filters/${report.endpoint_id}/${encodeURIComponent(report.id)}`,{params,signal});

async function downloadBlob(url:string,report:ExternalReport){
  const token=getToken();const response=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!response.ok)throw new Error((await response.json().catch(()=>null))?.message||`Report gagal (HTTP ${response.status})`);
  const blob=await response.blob();const disposition=response.headers.get("content-disposition")||"";
  const filename=/filename\*?=(?:UTF-8''|\")?([^";]+)/i.exec(disposition)?.[1]||`${report.title}.${report.format.toLowerCase()}`;
  const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=decodeURIComponent(filename);anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

export async function downloadExternalReport(report:ExternalReport,params:Record<string,string>={}){
  if(report.protocol!=="ASYNC_JOB")return downloadBlob(`${API_V2_URL}/report-center/run/${report.endpoint_id}/${encodeURIComponent(report.id)}`,report);
  const created=await apiV2.post<{id:number;job_id:string;status:string}>(`/report-center/jobs/${report.endpoint_id}/${encodeURIComponent(report.id)}`,{params});
  const localJobId=created.data.id;
  for(let attempt=0;attempt<90;attempt+=1){
    if(attempt>0)await new Promise(resolve=>setTimeout(resolve,2000));
    const status=await apiV2.get<{id:number;job_id:string;status:string;ready:boolean}>(`/report-center/jobs/${localJobId}`);
    if(status.data.ready)return downloadBlob(`${API_V2_URL}/report-center/jobs/${localJobId}/download`,report);
    if(["FAILED","ERROR","CANCELLED","CANCELED"].includes(status.data.status))throw new Error(`Pembuatan report gagal dengan status ${status.data.status}.`);
  }
  throw new Error("Pembuatan report masih diproses setelah 3 menit. Silakan coba lagi.");
}
