import { apiV2 } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_V2_URL } from "@/lib/env";
import type { ApiResponse } from "@/types/api";

export interface AiImageValue {
  id: number;
  sequence_no: number;
  section_name: string | null;
  parameter_name: string;
  text_value: string | null;
  numeric_value: number | null;
  unit: string | null;
  confidence: number | null;
  assessment: string;
  assessment_note: string | null;
}

export interface AiImageRecommendationItem {
  id?: number;
  item_name: string;
  specification?: string | null;
  estimated_quantity?: number | null;
  unit?: string | null;
  priority?: string | null;
  reason?: string | null;
}

export interface AiImageAnalysisItem {
  id: number;
  analysis_number: string;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  parameter_id?: number | null;
  parameter_code?: string | null;
  parameter_name?: string | null;
  parameter_group?: string | null;
  activity_name: string;
  reference_note?: string | null;
  captured_at?: string | null;
  image_url: string;
  images?: Array<{ id?: number; sequence_no: number; file_name?: string; image_url: string }>;
  image_count?: number;
  raw_text?: string | null;
  analysis_summary?: string | null;
  findings?: string | null;
  recommendations?: string | null;
  llm_model?: string | null;
  status: string;
  error_message?: string | null;
  retry_count?: number;
  max_retry?: number;
  next_retry_at?: string | null;
  last_attempt_at?: string | null;
  processing_started_at?: string | null;
  created_by: string;
  created_at: string;
  verified_by?: string | null;
  verified_at?: string | null;
  values?: AiImageValue[];
  suggested_products?: AiImageRecommendationItem[];
  required_materials?: AiImageRecommendationItem[];
  audits?: Array<Record<string, unknown>>;
}

export interface AiMachineItem extends AiAssetOption {
  alias_name?: string | null;
  brand?: string | null;
  parameter_count: number;
  analysis_count: number;
  unmapped_count: number;
  latest_analysis_at?: string | null;
  latest_status?: string | null;
  attention_count: number;
}

export interface AiMachineParameter {
  id: number;
  asset_id: number;
  parameter_code: string;
  parameter_name: string;
  parameter_group?: string | null;
  description?: string | null;
  reference_type: "NONE" | "RANGE" | "TARGET" | "TEXT";
  minimum_value?: number | null;
  target_value?: number | null;
  maximum_value?: number | null;
  reference_text?: string | null;
  unit?: string | null;
  photo_instruction?: string | null;
  minimum_photo_count: number;
  check_interval_days?: number | null;
  sort_order: number;
  is_required: number;
  status: "ACTIVE" | "INACTIVE";
  analysis_count?: number;
  latest_analysis_at?: string | null;
  latest_status?: string | null;
  latest_analysis_id?: number | null;
}

export interface AiMachineDetail {
  machine: AiMachineItem;
  parameters: AiMachineParameter[];
  unmapped_analyses: AiImageAnalysisItem[];
}

export interface AiAssetOption {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  company_name?: string;
  location_name?: string;
}

export function getAiImageAnalyses(params?: Record<string, string | number | undefined>) {
  return apiV2.get<AiImageAnalysisItem[]>("/ai-image-analysis", { params });
}

export function getAiImageAnalysis(id: number) {
  return apiV2.get<AiImageAnalysisItem>(`/ai-image-analysis/${id}`);
}

export function searchAiImageAssets(q: string) {
  return apiV2.get<AiAssetOption[]>("/ai-image-analysis/assets", { params: { q } });
}

export function getAiImageMachines(params?: Record<string, string | number | undefined>) {
  return apiV2.get<AiMachineItem[]>("/ai-image-analysis/machines", { params });
}

export function getAiImageMachine(assetId: number) {
  return apiV2.get<AiMachineDetail>(`/ai-image-analysis/machines/${assetId}`);
}

export function addAiImageMachine(assetId: number) {
  return apiV2.post<AiMachineItem>("/ai-image-analysis/machines", { asset_id: assetId });
}

export function getAiImageParameterHistory(parameterId: number) {
  return apiV2.get<{ parameter: AiMachineParameter; analyses: AiImageAnalysisItem[] }>(`/ai-image-analysis/parameters/${parameterId}/history`);
}

export function createAiMachineParameter(assetId: number, data: Partial<AiMachineParameter>) {
  return apiV2.post<AiMachineParameter>(`/ai-image-analysis/machines/${assetId}/parameters`, data);
}

export function updateAiMachineParameter(id: number, data: Partial<AiMachineParameter>) {
  return apiV2.patch<AiMachineParameter>(`/ai-image-analysis/parameters/${id}`, data);
}

export function createAiImageAnalysis(formData: FormData): Promise<ApiResponse<AiImageAnalysisItem>> {
  return apiV2.post<AiImageAnalysisItem>("/ai-image-analysis", undefined, { formData });
}

export function verifyAiImageAnalysis(id: number, note: string) {
  return apiV2.patch<AiImageAnalysisItem>(`/ai-image-analysis/${id}/verify`, { note });
}

export function retryAiImageAnalysis(id: number) {
  return apiV2.post<AiImageAnalysisItem>(`/ai-image-analysis/${id}/retry`, {});
}

export async function downloadAiImageAnalysisExport(id: number, format: "pdf" | "xlsx") {
  const response = await fetch(`${API_V2_URL}/ai-image-analysis/${id}/export?format=${format}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || `Export gagal (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `AI-Analysis-${id}.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}
