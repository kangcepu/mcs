"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getAssetHistoryReport,
  getQrReport,
  getRecapWorkOrderFilterOptions,
  getReport,
} from "@/lib/api/reports";
import type { ReportFilters } from "@/types/report";

type ReportKey =
  | "assets"
  | "stock-opname"
  | "list-of-assets"
  | "recap-work-orders";

export function useReport(
  key: ReportKey,
  filters: Record<string, string | number | undefined>,
  enabled = true,
) {
  return useQuery({
    queryKey: ["report", key, filters],
    queryFn: ({ signal }) => getReport(key, filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecapWorkOrderFilterOptions() {
  return useQuery({
    queryKey: ["report", "recap-work-orders-options"],
    queryFn: ({ signal }) => getRecapWorkOrderFilterOptions(signal),
    staleTime: 10 * 60_000,
  });
}

export function useAssetHistoryReport(assetCode: string, filters: ReportFilters) {
  return useQuery({
    queryKey: ["report", "assets-history", assetCode, filters],
    queryFn: ({ signal }) => getAssetHistoryReport(assetCode, filters, signal),
    enabled: Boolean(assetCode),
  });
}

export function useQrReport(assetCode: string) {
  return useQuery({
    queryKey: ["report", "qr", assetCode],
    queryFn: ({ signal }) => getQrReport(assetCode, signal),
    enabled: Boolean(assetCode),
  });
}
