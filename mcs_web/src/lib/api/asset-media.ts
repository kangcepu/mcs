import { apiV2 } from "@/lib/api-client";
import { API_V2_URL } from "@/lib/env";
import { getToken } from "@/lib/auth";
import { ApiError, type ApiResponse } from "@/types/api";

/* ---------------- Attachment categories ---------------- */

export interface AttachmentCategory {
  id: number | string;
  category_name: string;
  number?: number;
}

export function listAttachmentCategories(
  signal?: AbortSignal,
): Promise<ApiResponse<AttachmentCategory[]>> {
  return apiV2.get<AttachmentCategory[]>("/attachment-categories", { signal });
}

export function createAttachmentCategory(category_name: string) {
  return apiV2.post<AttachmentCategory>("/attachment-categories", { category_name });
}

export function updateAttachmentCategory(id: number | string, category_name: string) {
  return apiV2.patch<AttachmentCategory>(`/attachment-categories/${id}`, {
    category_name,
  });
}

export function deleteAttachmentCategory(id: number | string) {
  return apiV2.delete<unknown>(`/attachment-categories/${id}`);
}

/** Simpan urutan kategori (kolom `number`) mengikuti urutan array id. */
export function reorderAttachmentCategories(order: Array<number | string>) {
  return apiV2.post<AttachmentCategory[]>("/attachment-categories/reorder", {
    order,
  });
}

/* ---------------- Asset attachments ---------------- */

export interface AssetAttachment {
  id: number | string;
  name: string;
  filename: string;
  url: string;
  type: "image" | "document";
  extension: string;
  category_id: number;
  category_name: string;
  created_by?: string;
}

export function listAssetAttachments(
  asset: string,
  signal?: AbortSignal,
): Promise<ApiResponse<AssetAttachment[]>> {
  return apiV2.get<AssetAttachment[]>("/assets/attachments", {
    params: { asset },
    signal,
  });
}

export function uploadAssetAttachment(fd: FormData) {
  return apiV2.post<{ id: number; attachments: AssetAttachment[] }>(
    "/assets/attachments",
    undefined,
    { formData: fd },
  );
}

export function deleteAssetAttachment(id: number | string) {
  return apiV2.delete<{ attachments: AssetAttachment[] }>(`/assets/attachments/${id}`);
}

/** Simpan urutan lampiran (kolom `sort_order`) mengikuti urutan array id. */
export function reorderAssetAttachments(
  asset: string,
  order: Array<number | string>,
) {
  return apiV2.post<{ attachments: AssetAttachment[] }>(
    "/assets/attachments/reorder",
    { asset, order },
  );
}

/* ---------------- Asset custom details ---------------- */

export interface CustomDetailImage {
  id: number | string;
  image_type: string;
  image_name: string;
  /** Path relatif di server (assets/docs/customDetails/xxx.png) — untuk anotasi. */
  image_path?: string;
  url: string;
  image_order?: number;
}

export interface CustomDetailRow {
  id: number | string;
  asset_code: string;
  row_order?: number;
  bagian?: string | null;
  bagian_mesin?: string | null;
  part_mesin?: string | null;
  kondisi?: string | null;
  durasi_pengecekan?: string | null;
  /** PIC — dipakai backend untuk menurunkan kategori Mtc pada Preventive Schedule. */
  pic?: string | null;
  part_diperlukan?: string | null;
  images?: CustomDetailImage[];
}

export interface CustomDetailInput {
  bagian?: string;
  bagian_mesin?: string;
  part_mesin?: string;
  kondisi?: string;
  durasi_pengecekan?: string;
  pic?: string;
  part_diperlukan?: string;
}

export function listCustomDetails(
  asset: string,
  signal?: AbortSignal,
): Promise<ApiResponse<CustomDetailRow[]>> {
  return apiV2.get<CustomDetailRow[]>("/assets/custom-details", {
    params: { asset },
    signal,
  });
}

export function createCustomDetail(body: CustomDetailInput & { asset_code: string }) {
  return apiV2.post<{ id: number; custom_details: CustomDetailRow[] }>(
    "/assets/custom-details",
    body,
  );
}

export function updateCustomDetail(id: number | string, body: CustomDetailInput) {
  return apiV2.patch<{ custom_details: CustomDetailRow[] }>(
    `/assets/custom-details/${id}`,
    body,
  );
}

export function deleteCustomDetail(id: number | string) {
  return apiV2.delete<{ custom_details: CustomDetailRow[] }>(
    `/assets/custom-details/${id}`,
  );
}

export function uploadCustomDetailImage(id: number | string, fd: FormData) {
  return apiV2.post<{ id: number; custom_details: CustomDetailRow[] }>(
    `/assets/custom-details/${id}/images`,
    undefined,
    { formData: fd },
  );
}

export function deleteCustomDetailImage(imageId: number | string) {
  return apiV2.delete<{ custom_details: CustomDetailRow[] }>(
    `/assets/custom-detail-images/${imageId}`,
  );
}

/* ---------------- Custom detail — import Excel ---------------- */

export interface CustomDetailImportRow {
  no: number;
  bagian: string;
  bagian_mesin: string;
  part_mesin: string;
  durasi_pengecekan: string;
  images: number;
}

export interface CustomDetailImportResult {
  summary: {
    rows: number;
    images: number;
    images_failed: number;
    /** Penanda parser gambar dari server; berguna saat audit file Excel. */
    image_engine?: string;
    mode: "replace" | "append";
    created: number;
  };
  rows: CustomDetailImportRow[];
  custom_details: CustomDetailRow[];
}

/**
 * POST /v2/assets/custom-details/import — impor baris Custom Detail (+ gambar
 * yang di-embed di sel) dari file .xlsx. `dryRun` = pratinjau tanpa menyimpan.
 * `mode` "replace" mengganti seluruh Custom Detail aset, "append" menambah.
 */
export function importCustomDetails(
  assetCode: string,
  file: File,
  opts: { mode?: "replace" | "append"; dryRun?: boolean } = {},
): Promise<ApiResponse<CustomDetailImportResult>> {
  const fd = new FormData();
  fd.append("excel_file", file);
  fd.append("asset_code", assetCode);
  fd.append("mode", opts.mode ?? "replace");
  if (opts.dryRun) fd.append("dry_run", "1");
  return apiV2.post<CustomDetailImportResult>(
    "/assets/custom-details/import",
    undefined,
    { formData: fd },
  );
}

/** GET /v2/assets/custom-details/import-template — unduh template .xlsx. */
export async function downloadCustomDetailTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_V2_URL}/assets/custom-details/import-template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(`Gagal mengunduh template (HTTP ${res.status}).`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_custom_detail.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
