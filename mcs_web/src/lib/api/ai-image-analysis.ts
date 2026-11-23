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
