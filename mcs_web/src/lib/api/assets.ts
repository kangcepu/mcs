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

export function attachChildAsset(parentAsset: string, childAsset: string) {
  return apiV2.post<null>("/assets/children", {
    parent_asset: parentAsset,
    child_asset: childAsset,
  });
}

export function detachChildAsset(childAsset: string) {
  return apiV2.post<null>("/assets/children/detach", { child_asset: childAsset });
}

export function moveChildAsset(childAsset: string, newParentAsset: string) {
  return apiV2.post<null>("/assets/children/move", {
    child_asset: childAsset,
    new_parent_asset: newParentAsset,
  });
}

export function linkPendingChildAsset(pendingId: number, childAsset: string) {
  return apiV2.post<null>("/assets/children/pending/link", {
    pending_id: pendingId,
    child_asset: childAsset,
  });
}

export function deletePendingChildAsset(pendingId: number) {
  return apiV2.post<null>("/assets/children/pending/delete", { pending_id: pendingId });
}

export interface ManualChildAssetItemInput {
  item_name: string;
  frequency?: string;
  pic?: string;
  condition_text?: string;
  photo_1?: File | null;
  photo_2?: File | null;
}

export interface ManualChildAssetResult {
  group_id: number;
  group_name: string;
  items: Array<{ id: number; item_name: string }>;
  photo_upload_failures?: number;
}

export async function createManualChildAssetGroup(
  parentAsset: string,
  groupName: string,
  items: ManualChildAssetItemInput[],
): Promise<ApiResponse<ManualChildAssetResult>> {
  const response = await apiV2.post<ManualChildAssetResult>("/assets/children/manual", {
    parent_asset: parentAsset,
    group_name: groupName,
    items: items.map(({ photo_1: _photo1, photo_2: _photo2, ...item }) => item),
  });
  const createdItems = response.data?.items ?? [];
  let photoUploadFailures = 0;
  for (let index = 0; index < createdItems.length; index += 1) {
    const detail = createdItems[index];
    const input = items[index];
    if (!detail || !input) continue;
    if (input.photo_1) {
      try { await uploadChildAssetPhoto(detail.id, 1, input.photo_1); } catch { photoUploadFailures += 1; }
    }
    if (input.photo_2) {
      try { await uploadChildAssetPhoto(detail.id, 2, input.photo_2); } catch { photoUploadFailures += 1; }
    }
  }
  if (response.data) response.data.photo_upload_failures = photoUploadFailures;
  return response;
}

export function uploadChildAssetPhoto(detailId: number, slot: 1 | 2, photo: File) {
  const formData = new FormData();
  formData.append("slot", String(slot));
  formData.append("photo", photo);
  return apiV2.post<{ detail_id: number; slot: number; url: string }>(
    `/assets/children/pending/${detailId}/photo`,
    undefined,
    { formData },
  );
}

export function deleteChildAssetPhoto(detailId: number, slot: 1 | 2) {
  return apiV2.delete<{ detail_id: number; slot: number }>(`/assets/children/pending/${detailId}/photo/${slot}`);
}

export interface ChildAssetImportRow {
  row: number;
  child_name: string;
  lookup_value: string;
  identifier: string;
  items: Array<{
    row: number;
    item_name: string;
    lookup_value: string;
    identifier: string;
    condition_text: string;
    frequency: string;
    pic: string;
    resolved_code?: string;
    resolved_name?: string;
    previous_parent?: string | null;
    status: "ready" | "pending" | "warning" | "unchanged" | "error";
    message: string;
  }>;
  resolved_code?: string;
  resolved_name?: string;
  previous_parent?: string | null;
  status: "ready" | "pending" | "warning" | "reassigned" | "unchanged" | "error";
  message: string;
}

export interface ChildAssetImportResult {
  summary: {
    sheet: string;
    groups: number;
    items: number;
    valid: number;
    attached: number;
    pending: number;
    pending_imported: number;
    skipped_existing: number;
    unchanged: number;
    reassigned: number;
    warnings: number;
    errors: number;
    dry_run: boolean;
    applied: boolean;
  };
  rows: ChildAssetImportRow[];
}

export function importChildAssets(parentAsset: string, file: File, dryRun: boolean) {
  const formData = new FormData();
  formData.append("parent_asset", parentAsset);
  formData.append("dry_run", dryRun ? "1" : "0");
  formData.append("file", file);
  return apiV2.post<ChildAssetImportResult>("/assets/children/import", undefined, { formData });
}

export async function downloadChildAssetImportTemplate(): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_V2_URL}/assets/children/import-template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(`Gagal mengunduh template (HTTP ${response.status}).`, response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Form Preventive Audit - Siap Import.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
