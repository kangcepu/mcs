/**
 * Environment configuration. Reads NEXT_PUBLIC_API_BASE_URL and derives the
 * V2 base and auth endpoints from it so there is a single source of truth.
 */
const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!rawBase) {
  // Surface a clear error early instead of failing later with a cryptic fetch error.
  // eslint-disable-next-line no-console
  console.warn(
    "[MCS] NEXT_PUBLIC_API_BASE_URL belum diset. Buat file .env.local (lihat .env.example).",
  );
}

export const API_BASE_URL = (rawBase ?? "http://192.168.10.100:8888/mcs/api").replace(/\/+$/, "");

/** Base untuk semua endpoint V2. */
export const API_V2_URL = `${API_BASE_URL}/v2`;

/** Endpoint login (bukan V2). */
export const AUTH_LOGIN_URL = `${API_BASE_URL}/auth/login`;

/** Nama cookie penyimpanan JWT. */
export const TOKEN_COOKIE = "mcs_token";

/**
 * Backend mengembalikan path relatif buat file terunggah (mis. `/uploads/...`).
 * Web app jalan di origin/port terpisah dari backend, jadi path relatif itu
 * harus dijadikan absolut ke origin API, bukan origin halaman saat ini.
 */
export function toAbsoluteUploadUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}/${url.replace(/^\/+/, "")}`;
}
