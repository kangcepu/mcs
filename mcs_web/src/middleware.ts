import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_COOKIE } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/change-password"];

/**
 * Proteksi route sisi server: tanpa cookie token -> redirect ke /login.
 * Validasi token sesungguhnya tetap dilakukan API (401 -> forceLogout).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (pathname === "/") {
    return NextResponse.redirect(new URL(token ? "/dashboard" : "/login", request.url));
  }

  if (!token && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (token && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
