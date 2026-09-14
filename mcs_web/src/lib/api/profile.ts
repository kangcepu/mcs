import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface ChangeMyPasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

/** POST /v2/profile/password — ganti password akun sendiri (butuh token). */
export function changeMyPassword(body: ChangeMyPasswordInput) {
  return apiV2.post<null>("/profile/password", body);
}

export interface AvatarResult {
  avatar: string;
  avatar_url: string | null;
}

/** POST /v2/profile/avatar (multipart, field `avatar`). */
export function uploadMyAvatar(fd: FormData): Promise<ApiResponse<AvatarResult>> {
  return apiV2.post<AvatarResult>("/profile/avatar", undefined, { formData: fd });
}

/** DELETE /v2/profile/avatar — hapus foto, kembali ke inisial. */
export function removeMyAvatar(): Promise<ApiResponse<AvatarResult>> {
  return apiV2.delete<AvatarResult>("/profile/avatar");
}
