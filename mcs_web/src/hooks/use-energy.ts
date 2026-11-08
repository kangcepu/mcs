"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEnergyProfile,
  getEnergyProfileOptions,
  listEnergyProfiles,
  updateEnergyProfile,
} from "@/lib/api/energy";
import type { EnergyProfileFilters, EnergyProfileInput } from "@/types/energy";

export function useEnergyProfiles(filters: EnergyProfileFilters, enabled = true) {
  return useQuery({
    queryKey: ["energy-profiles", filters],
    queryFn: ({ signal }) => listEnergyProfiles(filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEnergyProfileOptions(enabled = true) {
  return useQuery({
    queryKey: ["energy-profile-options"],
    queryFn: ({ signal }) => getEnergyProfileOptions(signal),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useEnergyProfileMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["energy-profiles"] });
  return {
    create: useMutation({
      mutationFn: (body: EnergyProfileInput) => createEnergyProfile(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ assetId, body }: { assetId: number; body: EnergyProfileInput }) =>
        updateEnergyProfile(assetId, body),
      onSuccess: invalidate,
    }),
  };
}
