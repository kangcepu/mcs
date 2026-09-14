"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createPreventiveSchedule,
  deletePreventiveSchedule,
  generatePreventiveScheduleWorkOrder,
  getPreventiveCalendar,
  getPreventiveSchedule,
  getScheduleCustomDetailRows,
  listPreventiveSchedules,
  pausePreventiveDetail,
  repairPreventiveSchedule,
  updatePreventiveSchedule,
} from "@/lib/api/preventive-schedules";
import type { PreventiveScheduleFilters } from "@/types/preventive";

export function usePreventiveSchedules(filters: PreventiveScheduleFilters) {
  return useQuery({
    queryKey: ["preventive-schedules", filters],
    queryFn: ({ signal }) => listPreventiveSchedules(filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function usePreventiveSchedule(id: string | number) {
  return useQuery({
    queryKey: ["preventive-schedule", String(id)],
    queryFn: ({ signal }) => getPreventiveSchedule(id, signal),
    enabled: Boolean(id),
  });
}

/** Baris Custom Detail aset untuk mengisi form schedule otomatis. */
export function useScheduleCustomDetailRows(assetCode: string, enabled = true) {
  return useQuery({
    queryKey: ["schedule-custom-detail-rows", assetCode],
    queryFn: ({ signal }) => getScheduleCustomDetailRows(assetCode, signal),
    enabled: enabled && assetCode.trim().length > 0,
    staleTime: 5 * 60_000,
  });
}

export function usePreventiveCalendar(year: number) {
  return useQuery({
    queryKey: ["preventive-calendar", year],
    queryFn: ({ signal }) => getPreventiveCalendar(year, signal),
    staleTime: 30 * 60_000,
  });
}

export function usePreventiveMutations(id?: string | number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["preventive-schedules"] });
    if (id) qc.invalidateQueries({ queryKey: ["preventive-schedule", String(id)] });
  };

  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => createPreventiveSchedule(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string | number; body: Record<string, unknown> }) =>
        updatePreventiveSchedule(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (removeId: string | number) => deletePreventiveSchedule(removeId),
      onSuccess: invalidate,
    }),
    pause: useMutation({
      mutationFn: (body: {
        schedule_id: string | number;
        detail_id: string | number;
        paused: boolean;
      }) => pausePreventiveDetail(body),
      onSuccess: invalidate,
    }),
    repair: useMutation({
      mutationFn: (scheduleId: string | number) =>
        repairPreventiveSchedule({ schedule_id: scheduleId }),
      onSuccess: invalidate,
    }),
    generate: useMutation({
      mutationFn: (scheduleId: string | number) =>
        generatePreventiveScheduleWorkOrder(scheduleId),
      onSuccess: invalidate,
    }),
  };
}
