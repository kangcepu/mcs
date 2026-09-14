import { API_BASE_URL, API_V2_URL } from "@/lib/env";
import { getToken, forceLogout } from "@/lib/auth";
import { ApiError, type ApiResponse } from "@/types/api";

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  /** Query string params (nilai kosong otomatis dibuang). */
  params?: Query;
  /** Body JSON. */
  body?: unknown;
  /** FormData untuk upload (mengabaikan `body`). */
  formData?: FormData;
  /**
   * Kirim sebagai `application/x-www-form-urlencoded`. Dipakai endpoint yang
   * hanya membaca form-encoded (mis. POST /auth/login). Mengabaikan `body`.
   */
  form?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Kirim request tanpa header Authorization (mis. login). */
  skipAuth?: boolean;
}

function toQueryString(params?: Query): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  method: string,
  url: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (!options.skipAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let bodyInit: BodyInit | undefined;
  if (options.formData) {
    bodyInit = options.formData;
  } else if (options.form) {
    // URLSearchParams -> fetch otomatis set
    // Content-Type: application/x-www-form-urlencoded;charset=UTF-8
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) {
      if (value === undefined || value === null) continue;
      usp.set(key, String(value));
    }
    bodyInit = usp;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url + toQueryString(options.params), {
      method,
      headers,
      body: bodyInit,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(
      "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.",
      0,
    );
  }

  // 401 -> sesi habis / token invalid
  if (res.status === 401) {
    forceLogout();
    throw new ApiError("Sesi Anda telah berakhir. Silakan masuk kembali.", 401);
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (payload as { message?: string } | null)?.message ??
      `Permintaan gagal (HTTP ${res.status}).`;
    throw new ApiError(message, res.status, payload);
  }

  // Envelope MCS memakai `success` (V2) atau `status` (mis. /auth/login).
  if (payload && typeof payload === "object") {
    const env = payload as Record<string, unknown>;
    const flag = "success" in env ? env.success : env.status;
    if (flag === false) {
      const message =
        typeof env.message === "string" ? env.message : "Permintaan gagal.";
      throw new ApiError(message, res.status, payload);
    }
  }
  return payload as ApiResponse<T>;
}

function withBase(path: string, base: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Client untuk endpoint V2: `apiV2.get('/work-orders', { params })`. */
export const apiV2 = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>("GET", withBase(path, API_V2_URL), opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", withBase(path, API_V2_URL), { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", withBase(path, API_V2_URL), { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PUT", withBase(path, API_V2_URL), { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>("DELETE", withBase(path, API_V2_URL), opts),
};

/** Client untuk endpoint non-V2 (mis. `/auth/login`). */
export const apiBase = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>("GET", withBase(path, API_BASE_URL), opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", withBase(path, API_BASE_URL), { ...opts, body }),
};
