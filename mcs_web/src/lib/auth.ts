import { TOKEN_COOKIE } from "@/lib/env";

/**
 * Penyimpanan JWT.
 *
 * Token disimpan pada cookie non-HttpOnly (dibutuhkan agar bisa dilampirkan
 * sebagai header Authorization dari sisi client) dengan atribut `Secure` +
 * `SameSite=Lax`. Middleware Next.js membaca cookie yang sama untuk proteksi
 * route di sisi server. Password / hash TIDAK PERNAH disimpan di frontend.
 */

const MAX_AGE_DAYS = 7;

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_COOKIE}=`));
  if (!match) return null;
  const value = match.slice(TOKEN_COOKIE.length + 1);
  return value ? decodeURIComponent(value) : null;
}

export function setToken(token: string): void {
  if (typeof document === "undefined") return;
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Dipanggil ketika API mengembalikan 401. Membersihkan sesi lalu mengarahkan
 * ke /login sambil menyimpan tujuan awal supaya bisa dikembalikan setelah login.
 */
export function forceLogout(): void {
  clearToken();
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  const next = encodeURIComponent(pathname + search);
  window.location.href = `/login?next=${next}`;
}
