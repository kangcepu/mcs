import { apiV2 } from "@/lib/api-client";
import { API_V2_URL } from "@/lib/env";
import { getToken } from "@/lib/auth";
import { ApiError, type ApiResponse } from "@/types/api";
import type {
  AssetDetail,
  AssetFilters,
  AssetListItem,
  AssetOptions,
} from "@/types/asset";

export function listAssets(
  filters: AssetFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<AssetListItem[]>> {
  return apiV2.get<AssetListItem[]>("/assets", { params: { ...filters }, signal });
}

/** Lookup ringan untuk form create WO; tidak memerlukan akses Asset Manage. */
export function searchWorkOrderAssets(
  q: string,
  signal?: AbortSignal,
): Promise<ApiResponse<AssetListItem[]>> {
  return apiV2.get<AssetListItem[]>("/work-orders/assets", {
    params: { q, limit: 15 },
    signal,
  });
}

export function getAssetDetail(
  asset: string,
  signal?: AbortSignal,
): Promise<ApiResponse<AssetDetail>> {
  return apiV2.get<AssetDetail>("/assets/detail", { params: { asset }, signal });
}

export function createAsset(body: Record<string, unknown>) {
  return apiV2.post<AssetDetail>("/assets", body);
}

export function updateAsset(asset: string, body: Record<string, unknown>) {
  // Kirim identifier di query DAN body — backend menerima keduanya.
  return apiV2.patch<AssetDetail>(
    "/assets/detail",
    { ...body, asset, asset_code: asset },
    { params: { asset } },
  );
}

export function setAssetStatus(body: { asset: string; is_active: boolean; note?: string }) {
  return apiV2.post<AssetDetail>("/assets/status", body);
}

export function getAssetOptions(signal?: AbortSignal): Promise<ApiResponse<AssetOptions>> {
  return apiV2.get<AssetOptions>("/assets/options", { signal });
}

export function generateAssetCode(body: {
  company: string;
  location: string;
  category: string;
}) {
  return apiV2.post<{ asset_code: string }>("/assets/generate-code", body);
}

export interface AssetImportRowResult {
  row: number;
  asset_code: string;
  status: "created" | "updated" | "skipped" | "error";
  message: string;
}

export interface AssetImportResult {
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  rows: AssetImportRowResult[];
}

/**
 * POST /v2/assets/import — impor massal aset dari file Excel/CSV.
 * `dryRun` → hanya validasi (tidak menulis). `updateExisting` → baris dengan
 * AssetCode yang sudah ada di-update, bukan di-skip.
 */
export function importAssets(
  file: File,
  opts: { dryRun?: boolean; updateExisting?: boolean } = {},
): Promise<ApiResponse<AssetImportResult>> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.dryRun) fd.append("dry_run", "1");
  if (opts.updateExisting) fd.append("update_existing", "1");
  return apiV2.post<AssetImportResult>("/assets/import", undefined, {
    formData: fd,
  });
}

/** GET /v2/assets/import-template — unduh template .xlsx (fetch blob + Bearer). */
export async function downloadAssetImportTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_V2_URL}/assets/import-template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(
      `Gagal mengunduh template (HTTP ${res.status}).`,
      res.status,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_asset.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
