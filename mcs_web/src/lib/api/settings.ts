import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface Branding {
  app_name: string;
  app_subtitle: string;
  /** data: URI atau URL gambar; null = pakai ikon default. */
  logo_url: string | null;
  favicon_url: string | null;
  updated_at?: string;
}

/** GET /v2/settings/branding — publik (dipakai login page + favicon). */
export function getBranding(signal?: AbortSignal): Promise<ApiResponse<Branding>> {
  return apiV2.get<Branding>("/settings/branding", { signal, skipAuth: true });
}

/** POST /v2/settings/branding (multipart) — butuh permission user_management. */
export function updateBranding(fd: FormData): Promise<ApiResponse<Branding>> {
  return apiV2.post<Branding>("/settings/branding", undefined, { formData: fd });
}

/* ---------------- Logo QR per Company ---------------- */

export interface CompanyLogo {
  id_company: string;
  company_name: string;
  /** data: URI logo custom, atau "" jika belum ada (pakai logo bawaan). */
  logo_url: string;
  has_custom: boolean;
}

export interface CompanyLogosResponse {
  companies: CompanyLogo[];
  updated_at?: string;
}

/** GET /v2/settings/company-logos — daftar company + logo QR-nya. */
export function getCompanyLogos(
  signal?: AbortSignal,
): Promise<ApiResponse<CompanyLogosResponse>> {
  return apiV2.get<CompanyLogosResponse>("/settings/company-logos", { signal });
}

/** POST /v2/settings/company-logos (multipart) — set logo satu company. */
export function saveCompanyLogo(
  idCompany: string,
  file: File,
): Promise<ApiResponse<CompanyLogosResponse>> {
  const fd = new FormData();
  fd.append("id_company", idCompany);
  fd.append("logo", file);
  return apiV2.post<CompanyLogosResponse>("/settings/company-logos", undefined, {
    formData: fd,
  });
}

/** POST /v2/settings/company-logos dengan remove=1 — hapus logo custom. */
export function removeCompanyLogo(
  idCompany: string,
): Promise<ApiResponse<CompanyLogosResponse>> {
  const fd = new FormData();
  fd.append("id_company", idCompany);
  fd.append("remove", "1");
  return apiV2.post<CompanyLogosResponse>("/settings/company-logos", undefined, {
    formData: fd,
  });
}

/* ---------------- External file storage (MinIO / S3) ---------------- */

export interface StorageSettings {
  enabled: boolean;
  /** true = endpoint media dari API V2 menunjuk ke MinIO. */
  serve: boolean;
  /** true = media dialirkan lewat proxy aplikasi (api/v2/media); MinIO tak perlu publik. */
  gateway: boolean;
  /** true = bucket public-read (URL langsung); false = presigned URL. */
  public: boolean;
  /** true = cek keberadaan objek dulu, fallback ke lokal bila belum tersinkron. */
  verify: boolean;
  /** Base URL publik untuk link gambar di browser (mis. hostname cloudflared). Kosong = pakai `endpoint`. */
  public_endpoint: string;
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  path_style: boolean;
  /** true = secret key sudah tersimpan (nilai aslinya tidak pernah dikirim balik). */
  secret_key_set: boolean;
  updated_at?: string;
}

export interface StorageSettingsInput {
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  /** Kosongkan untuk mempertahankan secret yang tersimpan. */
  secret_key?: string;
  path_style: boolean;
  enabled: boolean;
  serve: boolean;
  gateway: boolean;
  public: boolean;
  verify: boolean;
  public_endpoint: string;
}

/** GET /v2/settings/storage — butuh permission user_management. */
export function getStorageSettings(
  signal?: AbortSignal,
): Promise<ApiResponse<StorageSettings>> {
  return apiV2.get<StorageSettings>("/settings/storage", { signal });
}

/** POST /v2/settings/storage — simpan konfigurasi. */
export function saveStorageSettings(
  body: StorageSettingsInput,
): Promise<ApiResponse<StorageSettings>> {
  return apiV2.post<StorageSettings>("/settings/storage", body);
}

/** POST /v2/settings/storage/test — uji koneksi tanpa menyimpan. */
export function testStorageConnection(
  body: Partial<StorageSettingsInput>,
): Promise<ApiResponse<{ ok: boolean; message: string }>> {
  return apiV2.post<{ ok: boolean; message: string }>(
    "/settings/storage/test",
    body,
  );
}

/* ---------------- Bulk sync (copy lokal → MinIO) ---------------- */

export type StorageSyncStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "stopped";

export interface StorageSyncState {
  status: StorageSyncStatus;
  root?: string;
  total_files?: number;
  total_bytes?: number;
  done_files?: number;
  uploaded?: number;
  skipped?: number;
  failed?: number;
  uploaded_bytes?: number;
  cursor?: string;
  last_error?: string;
  recent?: string[];
  percent?: number;
  started_at?: string;
  updated_at?: string;
}

export function getStorageSyncState(
  signal?: AbortSignal,
): Promise<ApiResponse<StorageSyncState>> {
  return apiV2.get<StorageSyncState>("/settings/storage/sync", { signal });
}

export function controlStorageSync(
  action: "status" | "start" | "step" | "stop",
  opts?: { root?: string; force?: boolean },
): Promise<ApiResponse<StorageSyncState>> {
  return apiV2.post<StorageSyncState>("/settings/storage/sync", {
    action,
    ...(opts?.root ? { root: opts.root } : {}),
    ...(opts?.force ? { force: true } : {}),
  });
}

export interface StorageCheckResult {
  local: number;
  ok: number;
  missing: number;
  mismatch: number;
  remote_total: number;
  local_bytes: number;
  missing_bytes: number;
  sample: string[];
}

/** Bandingkan folder lokal dengan isi bucket — tanpa meng-upload. */
export function checkStorageSync(
  root?: string,
): Promise<ApiResponse<StorageCheckResult>> {
  return apiV2.post<StorageCheckResult>("/settings/storage/sync", {
    action: "check",
    ...(root ? { root } : {}),
  });
}
