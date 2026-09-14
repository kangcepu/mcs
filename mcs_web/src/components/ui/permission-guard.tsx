"use client";

import type { ReactNode } from "react";
import { useMe } from "@/hooks/use-auth";
import { hasAnyPermission } from "@/lib/permissions";
import type { PermissionSlug } from "@/types/auth";
import { AccessDenied } from "@/components/layout/access-denied";

/**
 * Menyembunyikan children jika user tidak punya permission.
 * - `mode="hide"` (default): render `fallback` (atau null).
 * - `mode="page"`: render halaman "Akses Ditolak".
 */
export function PermissionGuard({
  permission,
  children,
  fallback = null,
  mode = "hide",
}: {
  permission: PermissionSlug | PermissionSlug[];
  children: ReactNode;
  fallback?: ReactNode;
  mode?: "hide" | "page";
}) {
  const { data: user, isLoading } = useMe();

  if (isLoading) return null;

  const allowed =
    (Array.isArray(permission) && permission.length === 0) ||
    hasAnyPermission(user, permission);

  if (allowed) return <>{children}</>;
  if (mode === "page") return <AccessDenied />;
  return <>{fallback}</>;
}

/** Versi hook untuk logika kondisional (mis. tampilkan tombol). */
export function useCan(permission: PermissionSlug | PermissionSlug[]): boolean {
  const { data: user } = useMe();
  if (Array.isArray(permission) && permission.length === 0) return true;
  return hasAnyPermission(user, permission);
}
