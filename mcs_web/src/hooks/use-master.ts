"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createMaster,
  deleteMaster,
  getMasterOptions,
  getPermissionCatalog,
  listDeviceMonitoring,
  listMasterActivity,
  listMaster,
  searchEmployees,
  updateMaster,
} from "@/lib/api/master";
import type { MasterResource } from "@/types/master";

export function useMasterList<T = Record<string, unknown>>(
  resource: MasterResource,
  params: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["master", resource, params],
    queryFn: ({ signal }) => listMaster<T>(resource, params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useMasterActivity(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["master-activity", params],
    queryFn: ({ signal }) => listMasterActivity(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useDeviceMonitoring(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["device-monitoring", params],
    queryFn: ({ signal }) => listDeviceMonitoring(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useMasterMutations(resource: MasterResource) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["master", resource] });

  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => createMaster(resource, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string | number; body: Record<string, unknown> }) =>
        updateMaster(resource, vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) => deleteMaster(resource, id),
      onSuccess: invalidate,
    }),
  };
}

export function useMasterOptions(enabled = true) {
  return useQuery({
    queryKey: ["master-options"],
    queryFn: ({ signal }) => getMasterOptions(signal),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: ["permission-catalog"],
    queryFn: ({ signal }) => getPermissionCatalog(signal),
    staleTime: 30 * 60_000,
    enabled,
  });
}

/** Autocomplete pegawai — `q` sudah di-debounce oleh pemanggil. */
export function useEmployeeSearch(q: string, company: string) {
  return useQuery({
    queryKey: ["employee-search", q, company],
    queryFn: ({ signal }) => searchEmployees(q, company, signal),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}
