export const SCHEDULE_GROUPS = [
  { key: "daily", label: "Harian" },
  { key: "weekly", label: "Mingguan" },
  { key: "monthly", label: "Bulanan" },
  { key: "quarterly", label: "3 Bulan" },
  { key: "semiannual", label: "6 Bulan" },
  { key: "annual", label: "Tahunan" },
  { key: "unscheduled", label: "Tanpa Jadwal" },
] as const;

export type ScheduleGroupKey = (typeof SCHEDULE_GROUPS)[number]["key"];

/** Normalisasi berbagai penamaan frekuensi dari API ke grup UI. */
export function toScheduleGroup(freq?: string | null): ScheduleGroupKey {
  const f = (freq ?? "").toString().toLowerCase().trim();
  if (!f || ["none", "tanpa jadwal", "unscheduled", "-"].includes(f)) return "unscheduled";
  if (f.startsWith("hari") || f.includes("daily") || f === "1d") return "daily";
  if (f.startsWith("ming") || f.includes("week") || f === "1w") return "weekly";
  if (f.includes("3 bulan") || f.includes("quarter") || f === "3m") return "quarterly";
  if (f.includes("6 bulan") || f.includes("semi") || f === "6m") return "semiannual";
  if (f.includes("tahun") || f.includes("annual") || f.includes("year") || f === "1y")
    return "annual";
  if (f.startsWith("bulan") || f.includes("month") || f === "1m") return "monthly";
  return "unscheduled";
}

export interface PreventiveScheduleListItem {
  id: number | string;
  asset_id?: number | string;
  asset_code?: string;
  asset_name?: string;
  company?: string | null;
  company_name?: string | null;
  towo?: string | null;
  target_wo?: string | null;
  is_active?: boolean;
  status?: string | null;
  detail_count?: number;
  custom_detail_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface PreventiveScheduleDetailItem {
  id: number | string;
  part?: string;
  activity?: string;
  frequency?: string;
  condition?: string | null;
  is_paused?: boolean;
  last_done_at?: string | null;
  next_due_at?: string | null;
  [key: string]: unknown;
}

export interface PreventiveSchedule extends PreventiveScheduleListItem {
  details?: PreventiveScheduleDetailItem[];
  custom_details?: Array<Record<string, unknown>>;
}

/** Respons create V2: detail schedule plus WO awal yang berhasil dibuat. */
export interface CreatedPreventiveSchedule {
  header?: Record<string, unknown>;
  details?: Array<Record<string, unknown>>;
  repair_status?: Record<string, unknown> | null;
  generated_work_orders?: Array<Record<string, unknown>>;
}

export interface PreventiveScheduleFilters {
  q?: string;
  company?: string;
  towo?: string;
  page?: number;
  per_page?: number;
}

export interface CalendarDay {
  date: string;
  is_holiday?: boolean;
  is_working_day?: boolean;
  label?: string | null;
  [key: string]: unknown;
}
