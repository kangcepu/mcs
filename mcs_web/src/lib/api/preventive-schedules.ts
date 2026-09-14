import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  CalendarDay,
  CreatedPreventiveSchedule,
  PreventiveSchedule,
  PreventiveScheduleFilters,
  PreventiveScheduleListItem,
} from "@/types/preventive";

export function listPreventiveSchedules(
  filters: PreventiveScheduleFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<PreventiveScheduleListItem[]>> {
  return apiV2.get<PreventiveScheduleListItem[]>("/preventive-schedules", {
    params: { ...filters },
    signal,
  });
}

export function getPreventiveSchedule(
  id: string | number,
  signal?: AbortSignal,
): Promise<ApiResponse<PreventiveSchedule>> {
  return apiV2.get<PreventiveSchedule>("/preventive-schedules/detail", {
    params: { id },
    signal,
  });
}

export function createPreventiveSchedule(body: Record<string, unknown>) {
  return apiV2.post<CreatedPreventiveSchedule>("/preventive-schedules", body);
}

export function updatePreventiveSchedule(id: string | number, body: Record<string, unknown>) {
  return apiV2.patch<PreventiveSchedule>("/preventive-schedules/detail", body, {
    params: { id },
  });
}

export function deletePreventiveSchedule(id: string | number) {
  return apiV2.delete<null>("/preventive-schedules/detail", { params: { id } });
}

export function pausePreventiveDetail(body: {
  schedule_id: string | number;
  detail_id: string | number;
  paused: boolean;
}) {
  return apiV2.post<null>("/preventive-schedules/pause", body);
}

export function repairPreventiveSchedule(body: { schedule_id: string | number }) {
  return apiV2.post<null>("/preventive-schedules/repair", body);
}

/** Buat WO awal untuk schedule yang sudah tersimpan tanpa menunggu jadwal due. */
export function generatePreventiveScheduleWorkOrder(scheduleId: string | number) {
  return apiV2.post<{ schedule_id: number; generated_work_orders: Array<Record<string, unknown>> }>(
    "/preventive-schedules/generate",
    { schedule_id: scheduleId },
  );
}

export interface ScheduleCustomDetailRow {
  custom_detail_id: number;
  bagian?: string;
  bagian_mesin?: string;
  part_mesin: string;
  kondisi?: string;
  durasi_pengecekan?: string;
  /** harian | week | bulanan | 3 bulan | 6 bulan | 1 tahun (mentah dari backend). */
  type_schedule?: string;
  pic?: string;
  category_maintenance?: string;
}

/**
 * GET /v2/preventive-schedules/custom-detail-rows?asset_code= — baris detail
 * schedule turunan dari Custom Detail aset, untuk mengisi form otomatis.
 */
export function getScheduleCustomDetailRows(
  assetCode: string,
  signal?: AbortSignal,
): Promise<
  ApiResponse<{
    asset_code: string;
    total: number;
    rows: ScheduleCustomDetailRow[];
  }>
> {
  return apiV2.get<{
    asset_code: string;
    total: number;
    rows: ScheduleCustomDetailRow[];
  }>("/preventive-schedules/custom-detail-rows", {
    params: { asset_code: assetCode },
    signal,
  });
}

export function getPreventiveCalendar(
  year: number,
  signal?: AbortSignal,
): Promise<ApiResponse<CalendarDay[]>> {
  return apiV2.get<CalendarDay[]>("/preventive-schedules/calendar", {
    params: { year },
    signal,
  });
}
