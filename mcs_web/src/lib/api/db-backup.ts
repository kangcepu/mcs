import { apiV2 } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_V2_URL } from "@/lib/env";
import { ApiError, type ApiResponse } from "@/types/api";

export type BackupFrequency = "daily" | "weekly" | "monthly";
export type BackupKind = "full" | "schema" | "data";

export interface DbBackupSettings {
  auto_enabled: boolean;
  frequency: BackupFrequency;
  weekday: number;
  monthday: number;
  time: string;
  backup_type: BackupKind;
  retention: number;
  updated_at: string;
  storage_enabled: boolean;
  storage_ready: boolean;
  storage_bucket: string;
  active_backup_id: number | null;
}

export interface DbBackupLog {
  id: number;
  trigger_type: "auto" | "manual";
  trigger_date: string;
  backup_type: BackupKind;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  object_key: string | null;
  size_bytes: number | null;
  message: string | null;
  actor: string | null;
  pruned: number;
}

export function getDbBackupSettings(): Promise<ApiResponse<DbBackupSettings>> {
  return apiV2.get<DbBackupSettings>("/db-backup/settings");
}

export interface DbBackupSettingsInput {
  auto_enabled: boolean;
  frequency: BackupFrequency;
  weekday: number;
  monthday: number;
  time: string;
  backup_type: BackupKind;
  retention: number;
}

export function saveDbBackupSettings(input: DbBackupSettingsInput) {
  return apiV2.put<DbBackupSettings>("/db-backup/settings", input);
}

export function runDbBackupNow() {
  return apiV2.post<{ log_id: number }>("/db-backup/run", {});
}

export interface DbBackupLogPage {
  items: DbBackupLog[];
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

export function listDbBackupLogs(page = 1, perPage = 10): Promise<ApiResponse<DbBackupLogPage>> {
  return apiV2.get<DbBackupLogPage>("/db-backup/logs", {
    params: { page, per_page: perPage },
  });
}

export async function downloadDbBackup(id: number, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_V2_URL}/db-backup/download/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError("File backup tidak dapat diunduh", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
