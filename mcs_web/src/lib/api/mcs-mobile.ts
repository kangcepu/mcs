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
