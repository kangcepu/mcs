/** Ambil nilai pertama yang tidak kosong dari beberapa kandidat key. */
export function pick(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

/** Tampilkan nama yang manusiawi, jangan ID mentah bila ada label. */
export function displayName(
  obj: Record<string, unknown> | null | undefined,
  nameKeys: string[],
  fallbackKeys: string[] = [],
): string {
  return pick(obj, nameKeys) || pick(obj, fallbackKeys) || "-";
}

export function dash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

/**
 * MCS `asset` mengembalikan kolom `active` bertipe string ("active"/"inactive").
 * Beberapa endpoint lama memakai boolean `is_active`.
 */
export function isAssetInactive(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  if (row.is_active === false || row.is_active === 0 || row.is_active === "0") return true;
  const active = row.active ?? row.status;
  if (active === undefined || active === null || active === "") return false;
  return String(active).toLowerCase() === "inactive";
}
