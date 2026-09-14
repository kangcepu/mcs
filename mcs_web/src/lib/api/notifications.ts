import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface NotificationSummary {
  total_notifications?: number;
  preventive_wo?: Array<Record<string, unknown>>;
  in_progress_wo?: Array<Record<string, unknown>>;
  total_preventive?: number;
  total_in_progress?: number;
  [key: string]: unknown;
}

/** GET /v2/notifications → ringkasan notifikasi WO (preventive + in progress). */
export function getNotificationSummary(
  signal?: AbortSignal,
): Promise<ApiResponse<NotificationSummary>> {
  return apiV2.get<NotificationSummary>("/notifications", { signal });
}
