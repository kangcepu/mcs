"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBranding,
  getCompanyLogos,
  getFirebaseCredentials,
  getOpenCodeLlmSettings,
  getStorageSettings,
  removeCompanyLogo,
  removeFirebaseCredentials,
  removeOpenCodeApiKey,
  saveCompanyLogo,
  saveFirebaseCredentials,
  saveOpenCodeLlmSettings,
  saveStorageSettings,
  testStorageConnection,
  syncOpenCodeModels,
  testOpenCodeConnection,
  updateBranding,
  type StorageSettingsInput,
  type OpenCodeLlmSettingsInput,
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

export function useFirebaseCredentials() {
  return useQuery({
    queryKey: ["firebase-credentials"],
    queryFn: ({ signal }) => getFirebaseCredentials(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSaveFirebaseCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => saveFirebaseCredentials(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firebase-credentials"] }),
  });
}

export function useRemoveFirebaseCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeFirebaseCredentials(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firebase-credentials"] }),
  });
}

export function useOpenCodeLlmSettings() {
  return useQuery({
    queryKey: ["llm-settings", "opencode-go"],
    queryFn: ({ signal }) => getOpenCodeLlmSettings(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSaveOpenCodeLlmSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenCodeLlmSettingsInput) => saveOpenCodeLlmSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-settings", "opencode-go"] }),
  });
}

export function useSyncOpenCodeModels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { base_url?: string; api_key?: string }) => syncOpenCodeModels(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-settings", "opencode-go"] }),
  });
}

export function useTestOpenCodeConnection() {
  return useMutation({
    mutationFn: (body: { base_url?: string; api_key?: string }) => testOpenCodeConnection(body),
  });
}

export function useRemoveOpenCodeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeOpenCodeApiKey(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-settings", "opencode-go"] }),
  });
}
