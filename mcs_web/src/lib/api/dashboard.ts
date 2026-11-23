import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface DashboardBucket {
  total: number;
  open: number;
  in_progress: number;
  closed: number;
  rejected: number;
}

export interface DashboardModule extends DashboardBucket {
  module: string;
  label: string;
}

export interface DashboardData {
  range_days: number;
  from: string;
  to: string;
  generated_at: string;
  totals: DashboardBucket;
  delta: {
    total_prev: number;
    closed_prev: number;
    total_pct: number | null;
    closed_pct: number | null;
  };
  by_module: DashboardModule[];
  by_status: { status: string; label: string; count: number }[];
  by_company: { company: string; total: number }[];
  top_assets: {
    asset_id: string | number;
    asset_code: string;
    asset_name: string;
    count: number;
  }[];
  trend: { date: string; created: number; closed: number; closed_corrective: number }[];
  aging: { bucket: string; count: number }[];
  by_type: {
    preventive: number;
    corrective: number;
    project: number;
    other: number;
    /** % preventive dari (preventive+corrective) — makin tinggi makin proaktif. */
    preventive_ratio: number | null;
    preventive_ratio_prev: number | null;
    preventive_ratio_delta_pts: number | null;
    corrective_prev: number;
    corrective_pct: number | null;
    project_prev: number;
    project_pct: number | null;
    ratio_trend: { date: string; ratio: number | null }[];
  };
  preventive_daily: {
    date: string;
    closed: number;
    in_progress: number;
    open: number;
    total: number;
    closed_pct: number;
    in_progress_pct: number;
    open_pct: number;
  }[];
  preventive_coverage: {
    required: number;
    scheduled: number;
    missing: number;
    coverage_percent: number;
    by_area: Array<{
      key: string;
      label: string;
      required: number;
      scheduled: number;
      missing: number;
      coverage_percent: number;
    }>;
  };
  enterprise: {
    version: string;
    generated_at: string;
    last_success_at: string;
    data_quality_status: string;
    scope: {
      company: string | null;
      available_companies: string[];
      period_from: string;
      period_to: string;
      timezone: string;
    };
    headline: Record<string, {
      key: string;
      label: string;
      value: number | null;
      unit: string;
      numerator?: number;
      denominator?: number;
      data_quality_status: string;
      detail_route: string | null;
      source?: string;
    }>;
    domains: Array<{
      key: string;
      label: string;
      status: "available" | "not_active" | "no_permission";
      primary: { label: string; value: number | null; unit?: string };
      secondary: Array<{ label: string; value: number | null; unit?: string }>;
      detail_route: string | null;
      note?: string;
    }>;
  };
}

export type SubmoduleCatalogItem={module_code:string;module_group:string;module_name:string;rollout_order:number;rollout_status:string;default_risk_level:string;default_sla_hours:number;adapter_code:string|null;transaction_count:number;pending_count:number;overdue_count:number;last_activity_at:string|null};
export type SubmoduleDashboard={module_code:string;module_name:string;module_group:string;rollout_status:string;adapter_code:string;data_notice?:string|null;period:{from:string;to:string};freshness:{generated_at:string;source:string};filters:{company:string|null;site:string|null;companies:string[];sites:string[]};kpis:Array<{code:string;label:string;value:number|null;unit:string;numerator:number;denominator:number}>;summary:{total:number;completed:number;open_count:number;pending_validation:number;overdue:number};status_counts:Array<{status:string;count:number}>;trend:Array<{date:string;planned:number;completed:number;overdue:number}>;comparisons:Array<{label:string;total:number;completed:number;open_count:number}>;queue:Array<{id:number;reference:string;title:string;location_name?:string;owner?:string;due_at?:string;status:string;risk_level:string}>;ncrs:Array<{id:number;reference:string;title:string;severity:string;status:string;due_at?:string;owner?:string}>};

export function getSubmoduleCatalog(params:Record<string,string>,signal?:AbortSignal){return apiV2.get<SubmoduleCatalogItem[]>('/dashboard/submodules',{params,signal});}
export function getSubmoduleDashboard(moduleCode:string,params:Record<string,string>,signal?:AbortSignal){return apiV2.get<SubmoduleDashboard>(`/dashboard/submodules/${moduleCode}`,{params,signal});}

/** GET /v2/dashboard — semua agregat dalam satu panggilan. */
export function getDashboard(
  params: { range?: number; company?: string; module?: string },
  signal?: AbortSignal,
): Promise<ApiResponse<DashboardData>> {
  return apiV2.get<DashboardData>("/dashboard", { params, signal });
}
