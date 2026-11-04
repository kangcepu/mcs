"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getMyWorkList, getMyWorkSummary, type MyWorkCategoryKey } from "@/lib/api/my-work";

export function useMyWorkSummary() {
  return useQuery({
    queryKey: ["my-work", "summary"],
    queryFn: ({ signal }) => getMyWorkSummary(signal),
    staleTime: 30_000,
    retry: false,
  });
}

export function useMyWorkList(
  category: MyWorkCategoryKey,
  params: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["my-work", "list", category, params],
    queryFn: ({ signal }) => getMyWorkList(category, params, signal),
    placeholderData: keepPreviousData,
    enabled: Boolean(category),
  });
}
