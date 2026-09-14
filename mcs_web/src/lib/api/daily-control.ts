import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  DailyControlActivity,
  DailyControlComment,
  DailyControlFilters,
  DailyControlSummary,
} from "@/types/daily-control";

export interface DailyControlMentionSuggestion {
  id?: string | number;
  label: string;
  insert_text: string;
  fullname?: string;
  division?: string;
  [key: string]: unknown;
}

/** GET /v2/daily-control/summary → { date, pro, cor, prev, total_activities, unread_count } */
export function getDailyControlSummary(
  filters: DailyControlFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<DailyControlSummary>> {
  return apiV2.get<DailyControlSummary>("/daily-control/summary", {
    params: { date: filters.date },
    signal,
  });
}

/**
 * GET /v2/daily-control/activities (native V2 activity feed).
 * Data V2 adalah array aktivitas; bentuk object lama tetap ditangani sementara
 * agar aplikasi tetap kompatibel saat deployment backend belum serempak.
 */
export async function listDailyControlActivities(
  filters: DailyControlFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<DailyControlActivity[]>> {
  const res = await apiV2.get<{ activities?: DailyControlActivity[] } | DailyControlActivity[]>(
    "/daily-control/activities",
    {
      params: {
        date: filters.date,
        area: filters.division,
        page: filters.page,
        per_page: filters.per_page,
      },
      signal,
    },
  );
  const data = res.data as { activities?: DailyControlActivity[] } | DailyControlActivity[];
  const activities = Array.isArray(data) ? data : (data?.activities ?? []);
  return { ...res, data: activities };
}

/** GET /v2/daily-control/unread → { count, activities } */
export function getDailyControlUnread(
  signal?: AbortSignal,
): Promise<ApiResponse<{ count: number; activities?: DailyControlActivity[] }>> {
  return apiV2.get<{ count: number; activities?: DailyControlActivity[] }>(
    "/daily-control/unread",
    { signal },
  );
}

export function getDailyControlActivity(
  id: string | number,
  signal?: AbortSignal,
): Promise<ApiResponse<DailyControlActivity>> {
  return apiV2.get<DailyControlActivity>("/daily-control/activity", {
    params: { id },
    signal,
  });
}

export function getDailyControlMentionUsers(q: string, signal?: AbortSignal) {
  return apiV2.get<DailyControlMentionSuggestion[]>("/daily-control/mention-users", {
    params: { q },
    signal,
  });
}

export function getDailyControlPartMentions(
  activityId: string | number,
  signal?: AbortSignal,
) {
  return apiV2.get<DailyControlMentionSuggestion[]>("/daily-control/part-mentions", {
    params: { activity_id: activityId },
    signal,
  });
}

/** GET /v2/daily-control/comments?activity_id= (bridge) → data: array komentar. */
export async function listDailyControlComments(
  activityId: string | number,
  signal?: AbortSignal,
): Promise<ApiResponse<DailyControlComment[]>> {
  const res = await apiV2.get<
    { items?: DailyControlComment[] } | DailyControlComment[]
  >("/daily-control/comments", { params: { activity_id: activityId }, signal });
  const data = res.data as { items?: DailyControlComment[] } | DailyControlComment[];
  return { ...res, data: Array.isArray(data) ? data : (data?.items ?? []) };
}

/** POST /v2/daily-control/comment (bridge) — body {activity_id, message}. */
export function postDailyControlComment(body: {
  activity_id: string | number;
  body: string;
}) {
  return apiV2.post<DailyControlComment>("/daily-control/comment", {
    activity_id: body.activity_id,
    message: body.body,
  });
}

/** POST /v2/daily-control/read — body {activity_id} atau {all:true} */
export function markDailyControlRead(body: {
  activity_id?: string | number;
  all?: boolean;
}) {
  return apiV2.post<null>("/daily-control/read", body);
}
