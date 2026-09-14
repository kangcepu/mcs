"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDailyControlSummary,
  getDailyControlActivity,
  getDailyControlUnread,
  getDailyControlMentionUsers,
  getDailyControlPartMentions,
  listDailyControlActivities,
  listDailyControlComments,
  markDailyControlRead,
  postDailyControlComment,
} from "@/lib/api/daily-control";
import type { DailyControlFilters } from "@/types/daily-control";

export function useDailyControlSummary(filters: DailyControlFilters) {
  return useQuery({
    queryKey: ["daily-control-summary", filters],
    queryFn: ({ signal }) => getDailyControlSummary(filters, signal),
  });
}

export function useDailyControlActivities(filters: DailyControlFilters) {
  return useQuery({
    queryKey: ["daily-control-activities", filters],
    queryFn: ({ signal }) => listDailyControlActivities(filters, signal),
    // Query backend berat (~beberapa detik) — jangan refetch tiap fokus,
    // cache 2 menit supaya pindah halaman & balik terasa instan.
    staleTime: 2 * 60_000,
  });
}

export function useDailyControlComments(activityId: string | number | null) {
  return useQuery({
    queryKey: ["daily-control-comments", String(activityId ?? "")],
    queryFn: ({ signal }) => listDailyControlComments(activityId as string | number, signal),
    enabled: activityId !== null && activityId !== undefined && activityId !== "",
  });
}

export function useDailyControlActivity(activityId: string | number | null) {
  return useQuery({
    queryKey: ["daily-control-activity", String(activityId ?? "")],
    queryFn: ({ signal }) => getDailyControlActivity(activityId as string | number, signal),
    enabled: activityId !== null && activityId !== undefined && activityId !== "",
    staleTime: 2 * 60_000,
  });
}

export function useDailyControlUnread() {
  return useQuery({
    queryKey: ["daily-control-unread"],
    queryFn: ({ signal }) => getDailyControlUnread(signal),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useDailyControlMentionUsers(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["daily-control-mention-users", q],
    queryFn: ({ signal }) => getDailyControlMentionUsers(q, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useDailyControlPartMentions(
  activityId: string | number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["daily-control-part-mentions", String(activityId ?? "")],
    queryFn: ({ signal }) => getDailyControlPartMentions(activityId as string | number, signal),
    enabled: enabled && activityId !== null,
    staleTime: 5 * 60_000,
  });
}

export function useDailyControlMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["daily-control-activities"] });
    qc.invalidateQueries({ queryKey: ["daily-control-unread"] });
    qc.invalidateQueries({ queryKey: ["daily-control-summary"] });
    qc.invalidateQueries({ queryKey: ["daily-control-comments"] });
  };
  return {
    comment: useMutation({
      mutationFn: (body: { activity_id: string | number; body: string }) =>
        postDailyControlComment(body),
      onSuccess: invalidate,
    }),
    markRead: useMutation({
      mutationFn: (body: { activity_id?: string | number; all?: boolean }) =>
        markDailyControlRead(body),
      onSuccess: invalidate,
    }),
  };
}
