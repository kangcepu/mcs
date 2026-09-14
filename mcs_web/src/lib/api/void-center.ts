import { apiV2 } from "@/lib/api-client";
import type { ApiResponse, PageMeta, PageParams } from "@/types/api";

export interface VoidCenterItem {
  module: "meso" | "maintenance" | "production" | "is" | "ga";
  module_label?: string | null;
  wo_number: string;
  job_title?: string | null;
  status?: string | null;
  date?: string | null;
  created_at?: string | null;
  company?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
}

export interface VoidCenterFilters extends PageParams {
  module?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
}

export function getVoidCandidates(filters: VoidCenterFilters = {}) {
  return apiV2.get<VoidCenterItem[]>("/void-center", { params: { ...filters } });
}

export function voidWorkOrder(input: { module: string; wo_number: string; comment: string }) {
  return apiV2.post<{ module: string; wo_number: string; action: string }>("/void-center/void", input);
}

export type VoidCenterResponse = ApiResponse<VoidCenterItem[]> & { meta?: PageMeta };
