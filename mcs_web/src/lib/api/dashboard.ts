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
  trend: { date: string; created: number; closed: number }[];
  aging: { bucket: string; count: number }[];
}

/** GET /v2/dashboard — semua agregat dalam satu panggilan. */
export function getDashboard(
  params: { range?: number; company?: string; module?: string },
  signal?: AbortSignal,
): Promise<ApiResponse<DashboardData>> {
  return apiV2.get<DashboardData>("/dashboard", { params, signal });
}
