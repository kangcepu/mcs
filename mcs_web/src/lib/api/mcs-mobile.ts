import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

/** Release aktif yang akan dibaca oleh aplikasi MCS Mobile. */
export interface McsMobileRelease {
  version: string;
  version_code: number;
  download_url: string;
  file_name?: string;
  release_notes: string;
  force_update: boolean;
  uploaded_by?: string;
  uploaded_at?: string;
}

/** GET public: aplikasi mobile dapat memeriksa update sebelum login. */
export function getMcsMobileRelease(
  signal?: AbortSignal,
): Promise<ApiResponse<McsMobileRelease>> {
  return apiV2.get<McsMobileRelease>("/mcs-mobile/release", { signal, skipAuth: true });
}

/** POST multipart: hanya permission `mcs_mobile_upload`. */
export function uploadMcsMobileRelease(
  form: FormData,
): Promise<ApiResponse<McsMobileRelease>> {
  return apiV2.post<McsMobileRelease>("/mcs-mobile/release", undefined, { formData: form });
}

/** Baris device mobile terdaftar. GET hanya untuk permission `mcs_mobile_upload`. */
export interface McsMobileDevice {
  id: number | string;
  id_user: number | string;
  fullname?: string | null;
  username?: string | null;
  platform?: string | null;
  device_name?: string | null;
  app_version?: string | null;
  build_number?: string | null;
  ip_address?: string | null;
  is_active: number | boolean;
  outdated?: boolean;
  is_latest?: boolean;
  online?: boolean;
  online_web?: boolean;
  online_since?: number | null;
  device_count?: number;
  active_device_count?: number;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function listMcsMobileDevices(
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<McsMobileDevice[]>> {
  return apiV2.get<McsMobileDevice[]>("/mcs-mobile/devices", { params, signal });
}
