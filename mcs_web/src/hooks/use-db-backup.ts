"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDbBackupSettings,
  listDbBackupLogs,
  runDbBackupNow,
  saveDbBackupSettings,
  type DbBackupLog,
  type DbBackupSettingsInput,
} from "@/lib/api/db-backup";

export const dbBackupKeys = {
  settings: ["db-backup", "settings"] as const,
  logs: ["db-backup", "logs"] as const,
};

export function useDbBackupSettings(enabled = true) {
  return useQuery({
    queryKey: dbBackupKeys.settings,
    queryFn: async () => (await getDbBackupSettings()).data,
    enabled,
  });
}

export function useDbBackupLogs(page: number, perPage: number, enabled = true) {
  return useQuery({
    queryKey: [...dbBackupKeys.logs, page, perPage],
    queryFn: async () => (await listDbBackupLogs(page, perPage)).data,
    enabled,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const items = (query.state.data?.items ?? []) as DbBackupLog[];
      return items.some((item) => item.status === "running") ? 3000 : false;
    },
  });
}

export function useSaveDbBackupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DbBackupSettingsInput) =>
      saveDbBackupSettings(input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: dbBackupKeys.settings }),
  });
}

export function useRunDbBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runDbBackupNow().then((r) => r.data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dbBackupKeys.logs });
      qc.invalidateQueries({ queryKey: dbBackupKeys.settings });
    },
  });
}
