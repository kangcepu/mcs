import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface MyWorkItem {
  // WO approval/closing/todo
  module_key?: string;
  module?: string;
  module_label?: string;
  wo_number?: string;
  job_title?: string;
  status?: string;
  date?: string | null;
  asset_name?: string;
  company?: string;
  // Material request
  request_code?: string;
  requested_by_name?: string;
  // Stock opname
  no_so?: string;
  type?: string;
  tanggal?: string;
  [key: string]: unknown;
}

export interface MyWorkCategory {
  key: "wo_approvals" | "wo_closings" | "materials" | "wo_todo" | "stock_opname_unlocked";
  label: string;
  count: number;
  items: MyWorkItem[];
}

export interface MyWorkSummary {
  categories: MyWorkCategory[];
  total: number;
}

/** GET /v2/my-work/summary — ringkasan + preview tiap kategori, buat tile KPI. */
export function getMyWorkSummary(signal?: AbortSignal): Promise<ApiResponse<MyWorkSummary>> {
  return apiV2.get<MyWorkSummary>("/my-work/summary", { signal });
}

export type MyWorkCategoryKey = MyWorkCategory["key"];

/** GET /v2/my-work/list — daftar lengkap 1 kategori, berpaginasi + bisa dicari. */
export function getMyWorkList(
  category: MyWorkCategoryKey,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<MyWorkItem[]>> {
  return apiV2.get<MyWorkItem[]>("/my-work/list", { params: { ...params, category }, signal });
}
