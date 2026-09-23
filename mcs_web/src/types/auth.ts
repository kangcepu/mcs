/** Slug permission yang dikenal frontend (dari spesifikasi MCS). */
export const PERMISSIONS = {
  dailyControl: "daily_control",
  dailyControlAll: "daily_control_all",
  listOfAsset: "list_of_asset",
  privilageAsset: "privilage_asset",
  materialUsage: "material_usage",
  schedule: "schedule",
  workCalendar: "work_calendar",
  userManagement: "user_management",
  userAliasEdit: "user_alias_edit",
  assetMutation: "asset_mutation",
  reportAssetMutation: "report_asset_mutation",
  approvalAssetMutation: "approval_asset_mutation",
  voidWorkOrder: "wo_void",
  approvalAll: "approval_all",
  mcsMobileUpload: "mcs_mobile_upload",
} as const;

export type PermissionSlug = string;

export interface MeUser {
  id: number | string;
  username: string;
  fullname: string;
  /** Nama ringkas user untuk area UI yang ruangnya terbatas (header/chat). */
  alias?: string | null;
  email?: string | null;
  phone?: string | null;
  division?: string | null;
  company?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  /** Daftar permission ter-normalisasi menjadi array slug. */
  permissions: PermissionSlug[];
  /** Payload mentah dari API untuk kebutuhan lain. */
  raw?: Record<string, unknown>;
}

/**
 * Respons /v2/me bisa berbentuk beragam. Normalisasi ke {@link MeUser}.
 */
export function normalizeMe(data: unknown): MeUser {
  const d = (data ?? {}) as Record<string, unknown>;
  const user = (d.user ?? d.profile ?? d) as Record<string, unknown>;
  // Beberapa implementasi /me menyimpan data dari Employee API di objek
  // terpisah. Tetap baca keduanya agar profil selalu memakai data terbaru.
  const employee =
    (user.employee ?? user.employee_data ?? d.employee ?? d.employee_data ?? {}) as Record<
      string,
      unknown
    >;

  /**
   * Beberapa field bisa berupa objek relasi ({id, code, name}) alih-alih
   * string. Ambil label yang manusiawi dan pastikan selalu string|null.
   */
  const asText = (...vals: unknown[]): string | null => {
    for (const v of vals) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        // Backend juga dipakai mobile app yang butuh bentuk objek
        // { division_name, division_code } / { company_name } apa adanya,
        // jadi field-field itu dicoba di sini alih-alih diratakan di backend.
        const label =
          o.name ?? o.label ?? o.title ?? o.code ?? o.fullname ?? o.full_name ??
          o.division_name ?? o.division_code ?? o.company_name;
        if (typeof label === "string" && label) return label;
      }
    }
    return null;
  };

  const rawPerms =
    d.permissions ??
    user.permissions ??
    d.permission ??
    user.permission ??
    d.abilities ??
    [];

  let permissions: string[] = [];
  if (Array.isArray(rawPerms)) {
    permissions = rawPerms
      .map((p) =>
        typeof p === "string"
          ? p
          : ((p as Record<string, unknown>)?.name as string) ??
            ((p as Record<string, unknown>)?.slug as string) ??
            "",
      )
      .filter(Boolean);
  } else if (rawPerms && typeof rawPerms === "object") {
    permissions = Object.entries(rawPerms as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k);
  }

  return {
    id: asText(user.id, user.user_id, user.id_user) ?? "",
    username: asText(user.username, user.user_name) ?? "",
    fullname:
      asText(
        user.fullname,
        user.full_name,
        user.name,
        user.username,
      ) ?? "Pengguna",
    alias: asText(user.alias, user.user_alias, user.display_name),
    email: asText(user.email, employee.email),
    phone: asText(
      user.phone,
      user.no_hp,
      user.phone_number,
      user.mobile,
      user.mobilephone,
      user.mobile_phone,
      employee.phone,
      employee.no_hp,
      employee.phone_number,
      employee.mobile,
      employee.mobilephone,
      employee.mobile_phone,
    ),
    division: asText(user.division, user.divisi, user.department, employee.division),
    company: asText(user.company, user.company_name, employee.company, employee.company_name),
    role: asText(user.role, user.jabatan, user.position, employee.position),
    avatar_url: asText(user.avatar_url, user.photo, user.avatar),
    is_active: (user.is_active as boolean) ?? true,
    permissions,
    raw: d,
  };
}
