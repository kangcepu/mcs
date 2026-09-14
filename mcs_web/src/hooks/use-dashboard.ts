"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listWorkOrders } from "@/lib/api/work-orders";
import { getApprovalSummary } from "@/lib/api/approval-center";
import { getDashboard } from "@/lib/api/dashboard";
import { toDateInput } from "@/lib/format";

/** Satu panggilan agregat untuk seluruh dashboard. */
export function useDashboard(range: number, company?: string) {
  return useQuery({
    queryKey: ["dashboard", "v2", range, company ?? ""],
    queryFn: ({ signal }) =>
      getDashboard({ range, company: company || undefined }, signal),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useRecentWorkOrders(limit = 8) {
  return useQuery({
    queryKey: ["dashboard", "recent-wo", limit],
    queryFn: ({ signal }) =>
      listWorkOrders({ page: 1, per_page: limit }, signal),
    staleTime: 60_000,
  });
}

export function useApprovalSummaryCard() {
  return useQuery({
    queryKey: ["dashboard", "approval-summary"],
    queryFn: ({ signal }) => getApprovalSummary(signal),
    staleTime: 60_000,
    retry: false,
  });
}

export function todayRange() {
  const today = toDateInput(new Date());
  return { today };
}
