import { apiV2 } from "@/lib/api-client";
import { API_V2_URL } from "@/lib/env";
import { forceLogout, getToken } from "@/lib/auth";
import { ApiError } from "@/types/api";

export type PreventiveNcr = {
  id: number; ncr_number: string; source_key: string; ncr_type: "MISSED_SCHEDULE" | "LATE_COMPLETION";
  severity: string; module_code: string; wo_number: string; trigger_wo_number: string | null;
  asset_id: number | null; asset_code: string | null; AssetName: string | null; CompanyName: string | null;
  planned_date: string | null; actual_completion_date: string | null; variance_days: number | null;
  title: string; description: string; detected_at: string; due_date: string | null; assigned_to: string | null;
  status: string; root_cause: string | null; corrective_action: string | null; preventive_action: string | null;
  resolution_note: string | null; action_count: number;
  actions?: Array<{ id: number; action_type: string; from_status: string | null; to_status: string; action_note: string | null; acted_by: string | null; acted_at: string }>;
};

export type PreventiveNcrList = {
  items: PreventiveNcr[];
  summary: { total: number; open_count: number; in_progress_count: number; pending_verification_count: number; closed_count: number; missed_count: number; late_count: number };
};

export type PreventiveNcrFilters = { q?: string; status?: string; type?: string; module?: string; company?: string; date_from?: string; date_to?: string; page?: number; per_page?: number };

export const getPreventiveNcrs = (params: PreventiveNcrFilters, signal?: AbortSignal) =>
  apiV2.get<PreventiveNcrList>("/preventive-ncr", { params, signal });
export const getPreventiveNcr = (id: number, signal?: AbortSignal) =>
  apiV2.get<PreventiveNcr>(`/preventive-ncr/${id}`, { signal });
export const getPreventiveNcrOptions = (signal?: AbortSignal) =>
  apiV2.get<{ companies: string[] }>("/preventive-ncr/options", { signal });
export const updatePreventiveNcr = (id: number, body: Record<string, unknown>) =>
  apiV2.patch<{ id: number; status: string }>(`/preventive-ncr/${id}`, body);

export async function downloadPreventiveNcrReport(params: PreventiveNcrFilters): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  const token = getToken();
  const response = await fetch(`${API_V2_URL}/preventive-ncr-report/export?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 401) { forceLogout(); throw new ApiError("Sesi Anda telah berakhir.", 401); }
  if (!response.ok) { let message = `Export gagal (HTTP ${response.status}).`; try { message = ((await response.json()) as { message?: string }).message ?? message; } catch {} throw new ApiError(message, response.status); }
  const disposition = response.headers.get("content-disposition") ?? "";
  return { blob: await response.blob(), fileName: disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "Preventive-NCR.xlsx" };
}
