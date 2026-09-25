"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMcsMobileRelease, listMcsMobileDevices, uploadMcsMobileRelease } from "@/lib/api/mcs-mobile";

const releaseKey = ["mcs-mobile-release"] as const;

export function useMcsMobileRelease() {
  return useQuery({
    queryKey: releaseKey,
    queryFn: ({ signal }) => getMcsMobileRelease(signal),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useUploadMcsMobileRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => uploadMcsMobileRelease(form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: releaseKey }),
  });
}

export function useMcsMobileDevices(params: Record<string, string | number | undefined>, enabled = true) {
  return useQuery({
    queryKey: ["mcs-mobile-devices", params],
    queryFn: ({ signal }) => listMcsMobileDevices(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    enabled,
  });
}
