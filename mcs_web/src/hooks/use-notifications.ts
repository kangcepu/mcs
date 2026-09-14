"use client";

import { useQuery } from "@tanstack/react-query";
import { getNotificationSummary } from "@/lib/api/notifications";
import { getToken } from "@/lib/auth";

export function useNotificationSummary() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => getNotificationSummary(signal),
    enabled: typeof window !== "undefined" && Boolean(getToken()),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
}
