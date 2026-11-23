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
  asset_id?: number;
  asset_code?: string;
  location?: string;
  mtc_area_key?: string;
  mtc_area_label?: string;
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
  key: "validation_pending" | "validation_approval" | "validation_returned" | "validation_close_review" | "ncr_due" | "wo_approvals" | "wo_closings" | "materials" | "wo_todo" | "preventive_missing" | "asset_missing_pic" | "stock_opname_schedule" | "stock_opname_unlocked";
  label: string;
  count: number;
  items: MyWorkItem[];
}

export interface MyWorkSummary {
  categories: MyWorkCategory[];
  total: number;
}

export interface ValidationRequestDetail extends MyWorkItem {
  id: number;
  request_number: string;
  state: string;
  evidence?: Array<Record<string, unknown>>;
  decisions?: Array<Record<string, unknown>>;
  exceptions?: Array<Record<string, unknown>>;
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

export function getValidationRequest(id: number, signal?: AbortSignal): Promise<ApiResponse<ValidationRequestDetail>> {
  return apiV2.get<ValidationRequestDetail>(`/validation/requests/${id}`, { signal });
}

export function decideValidationRequest(id: number, input: { action: "APPROVE" | "RETURN" | "REJECT" | "RESUBMIT"; note?: string; reason_code?: string }) {
  return apiV2.post<Record<string, unknown>>(`/validation/requests/${id}/decision`, input);
}

export function uploadValidationEvidence(id: number, files: File[], evidenceType = "SUPPORTING") {
  const formData = new FormData();
  formData.append("evidence_type", evidenceType);
  files.forEach((file) => formData.append("files", file));
  return apiV2.post<Array<Record<string, unknown>>>(`/validation/requests/${id}/evidence`, undefined, { formData });
}
