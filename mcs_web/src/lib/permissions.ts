import type { MeUser, PermissionSlug } from "@/types/auth";
import { PERMISSIONS } from "@/types/auth";

export { PERMISSIONS };

/** True jika user punya minimal satu dari slug yang diminta. */
export function hasAnyPermission(
  user: MeUser | null | undefined,
  required: PermissionSlug | PermissionSlug[],
): boolean {
  if (!user) return false;
  const list = Array.isArray(required) ? required : [required];
  if (list.length === 0) return true;
  // Super-admin bypass jika backend menandai demikian.
  if (user.permissions.includes("*") || user.permissions.includes("super_admin")) {
    return true;
  }
  return list.some((slug) => user.permissions.includes(slug));
}

/** True jika user punya SEMUA slug yang diminta. */
export function hasAllPermissions(
  user: MeUser | null | undefined,
  required: PermissionSlug[],
): boolean {
  if (!user) return false;
  if (user.permissions.includes("*")) return true;
  return required.every((slug) => user.permissions.includes(slug));
}

/**
 * Peta kebutuhan permission per area fitur. Dipakai sidebar & guard halaman.
 * `read` = boleh melihat menu/halaman, `write` = boleh aksi ubah data.
 */
export const AREA_PERMISSIONS = {
  dashboard: { read: [] as string[] },
  workOrders: {
    read: [
      "wo_mtc",
      "wo_mtc_all",
      "wo_operational",
      "wo_preventive",
      "wo_it",
      "wo_ga",
      "wo_cross_access",
    ] as string[],
  },
  dailyControl: {
    // Backend Daily_control::hasDailyControlPermission hanya cek `daily_control`.
    // `daily_control_all` hanya memperluas scope divisi, bukan akses dasar.
    read: [PERMISSIONS.dailyControl],
  },
  assets: {
    read: [PERMISSIONS.listOfAsset, PERMISSIONS.privilageAsset],
    write: [PERMISSIONS.privilageAsset],
  },
  materialUsage: { read: [PERMISSIONS.materialUsage] },
  approvalCenter: { read: [] as string[] },
  voidCenter: {
    read: [PERMISSIONS.voidWorkOrder, PERMISSIONS.approvalAll],
    write: [PERMISSIONS.voidWorkOrder, PERMISSIONS.approvalAll],
  },
  preventiveSchedules: {
    read: [PERMISSIONS.schedule, PERMISSIONS.workCalendar],
    write: [PERMISSIONS.schedule],
  },
  masterCompany: {
    read: [PERMISSIONS.userManagement],
    write: [PERMISSIONS.userManagement],
  },
  masterAssetCategory: {
    read: [PERMISSIONS.privilageAsset, PERMISSIONS.listOfAsset],
    write: [PERMISSIONS.privilageAsset],
  },
  masterAssetLocation: {
    read: [PERMISSIONS.privilageAsset, PERMISSIONS.listOfAsset],
    write: [PERMISSIONS.privilageAsset],
  },
  masterAttachmentCategory: {
    read: [PERMISSIONS.privilageAsset, PERMISSIONS.listOfAsset],
    write: [PERMISSIONS.privilageAsset],
  },
  masterPermissionGroup: {
    read: [PERMISSIONS.userManagement],
    write: [PERMISSIONS.userManagement],
  },
  masterUser: {
    read: [PERMISSIONS.userManagement],
    write: [PERMISSIONS.userManagement],
  },
  masterUserAlias: {
    read: [PERMISSIONS.userAliasEdit, PERMISSIONS.userManagement],
    write: [PERMISSIONS.userAliasEdit, PERMISSIONS.userManagement],
  },
  masterBranding: {
    read: [PERMISSIONS.userManagement],
    write: [PERMISSIONS.userManagement],
  },
  reports: {
    read: [PERMISSIONS.listOfAsset, PERMISSIONS.privilageAsset],
  },
  // Recap Work Order tidak butuh permission aset (backend hanya scope per modul WO).
  reportsRecapWo: {
    read: [
      "wo_mtc",
      "wo_mtc_all",
      "wo_operational",
      "wo_preventive",
      "wo_it",
      "wo_ga",
      "wo_cross_access",
      "recap_wo",
    ] as string[],
  },
  assetMutations: {
    read: [
      PERMISSIONS.assetMutation,
      PERMISSIONS.reportAssetMutation,
      PERMISSIONS.approvalAssetMutation,
    ],
    write: [PERMISSIONS.assetMutation],
  },
} as const;

export type AreaKey = keyof typeof AREA_PERMISSIONS;

export function canRead(user: MeUser | null | undefined, area: AreaKey): boolean {
  const req = AREA_PERMISSIONS[area].read;
  return req.length === 0 ? Boolean(user) : hasAnyPermission(user, req as string[]);
}

export function canWrite(user: MeUser | null | undefined, area: AreaKey): boolean {
  const cfg = AREA_PERMISSIONS[area] as { write?: string[] };
  if (!cfg.write) return false;
  return hasAnyPermission(user, cfg.write);
}

/**
 * Modul Work Order yang boleh dibaca user, mengikuti aturan backend
 * `M_Api_V2_Work_Order::canReadModule` (permission per-modul, `*_all`, atau
 * `wo_cross_access`).
 */
export const WO_MODULE_PERMISSIONS: Record<string, string[]> = {
  meso: ["wo_mtc", "wo_mtc_all", "wo_cross_access"],
  maintenance: ["wo_operational", "wo_mtc_all", "wo_cross_access"],
  production: ["wo_preventive", "wo_cross_access"],
  is: ["wo_it", "wo_cross_access"],
  ga: ["wo_ga", "wo_cross_access"],
};

export const ALL_WO_PERMISSIONS = Array.from(
  new Set(Object.values(WO_MODULE_PERMISSIONS).flat()),
);

export function canReadWoModule(
  user: MeUser | null | undefined,
  moduleKey: string,
): boolean {
  const req = WO_MODULE_PERMISSIONS[moduleKey];
  if (!req) return false;
  return hasAnyPermission(user, req);
}

export function readableWoModules(user: MeUser | null | undefined): string[] {
  return Object.keys(WO_MODULE_PERMISSIONS).filter((m) => canReadWoModule(user, m));
}
