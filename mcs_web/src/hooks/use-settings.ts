"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBranding,
  getCompanyLogos,
  getStorageSettings,
  removeCompanyLogo,
  saveCompanyLogo,
  saveStorageSettings,
  testStorageConnection,
  updateBranding,
  type StorageSettingsInput,
} from "@/lib/api/settings";

export function useBranding() {
  return useQuery({
    queryKey: ["branding"],
    queryFn: ({ signal }) => getBranding(signal),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fd: FormData) => updateBranding(fd),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branding"] }),
  });
}

export function useCompanyLogos() {
  return useQuery({
    queryKey: ["company-logos"],
    queryFn: ({ signal }) => getCompanyLogos(signal),
    staleTime: 10 * 60_000,
  });
}

export function useSaveCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idCompany: string; file: File }) =>
      saveCompanyLogo(vars.idCompany, vars.file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-logos"] }),
  });
}

export function useRemoveCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idCompany: string) => removeCompanyLogo(idCompany),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-logos"] }),
  });
}

export function useStorageSettings() {
  return useQuery({
    queryKey: ["storage-settings"],
    queryFn: ({ signal }) => getStorageSettings(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSaveStorageSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StorageSettingsInput) => saveStorageSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage-settings"] }),
  });
}

export function useTestStorageConnection() {
  return useMutation({
    mutationFn: (body: Partial<StorageSettingsInput>) =>
      testStorageConnection(body),
  });
}
