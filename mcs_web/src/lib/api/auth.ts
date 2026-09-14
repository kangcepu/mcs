import { apiBase, apiV2 } from "@/lib/api-client";
import { normalizeMe, type MeUser } from "@/types/auth";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResult {
  token?: string;
  /** Backend menandai akun harus membuat password baru (password kosong / default). */
  requiresPasswordChange?: boolean;
  username?: string;
  fullname?: string;
  raw: unknown;
}

/**
 * POST {API_BASE_URL}/auth/login
 *
 * Backend membaca body `application/x-www-form-urlencoded`. Bila akun perlu
 * membuat password baru, respons memakai `data.requires_password_change = true`
 * (tanpa token) — dikembalikan sebagai `requiresPasswordChange`.
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const res = await apiBase.post<Record<string, unknown>>("/auth/login", undefined, {
    skipAuth: true,
    form: { username: payload.username, password: payload.password },
  });
  const data = (res.data ?? res) as Record<string, unknown>;
  const nested = (data.data ?? data) as Record<string, unknown>;

  if (
    data.requires_password_change === true ||
    nested?.requires_password_change === true
  ) {
    const u = (nested.user ?? data.user ?? {}) as Record<string, unknown>;
    return {
      requiresPasswordChange: true,
      username: String(u.username ?? payload.username),
      fullname: String(u.fullname ?? ""),
      raw: res,
    };
  }

  const token =
    (data.token as string) ??
    (data.access_token as string) ??
    (data.jwt as string) ??
    (nested?.token as string) ??
    "";
  if (!token) {
    throw new Error("Token tidak ditemukan pada respons login.");
  }
  return { token, raw: res };
}

export interface ChangePasswordPayload {
  username: string;
  current_password?: string;
  password: string;
  confirm_password: string;
}

/** POST {API_BASE_URL}/auth/change_password (form-encoded, tanpa token). */
export function changePassword(payload: ChangePasswordPayload) {
  return apiBase.post<Record<string, unknown>>("/auth/change_password", undefined, {
    skipAuth: true,
    form: {
      username: payload.username,
      current_password: payload.current_password ?? "",
      password: payload.password,
      confirm_password: payload.confirm_password,
    },
  });
}

/** POST /auth/logout — JWT tetap stateless; endpoint ini mencatat audit logout. */
export function logout() {
  return apiBase.post<Record<string, unknown>>("/auth/logout");
}

/** GET {API_V2_URL}/me */
export async function getMe(signal?: AbortSignal): Promise<MeUser> {
  const res = await apiV2.get<unknown>("/me", { signal });
  return normalizeMe(res.data);
}
