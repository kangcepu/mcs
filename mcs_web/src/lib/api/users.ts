import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface UserLookupItem {
  id_user: number;
  username: string;
  fullname: string;
  alias?: string;
  division?: string;
  division_code?: string;
}

/**
 * GET /v2/users/lookup?q= — cari user aktif (nama / username / alias) untuk
 * picker PIC / tenaga kerja / eksekutor. Terbuka untuk semua akun terautentikasi.
 */
export function lookupUsers(
  q: string,
  signal?: AbortSignal,
): Promise<ApiResponse<UserLookupItem[]>> {
  return apiV2.get<UserLookupItem[]>("/users/lookup", {
    params: { q, limit: 20 },
    signal,
  });
}
