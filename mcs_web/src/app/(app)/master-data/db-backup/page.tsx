"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Save } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import {
  useDbBackupLogs,
  useDbBackupSettings,
  useRunDbBackup,
  useSaveDbBackupSettings,
} from "@/hooks/use-db-backup";
import {
  downloadDbBackup,
  type BackupFrequency,
  type BackupKind,
  type DbBackupLog,
  type DbBackupSettingsInput,
} from "@/lib/api/db-backup";
import { canRead, canWrite } from "@/lib/permissions";
import { ApiError } from "@/types/api";

const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const KIND_LABEL: Record<BackupKind, string> = {
  full: "Lengkap",
  schema: "Struktur saja",
  data: "Data saja",
};
const FREQUENCY_HINT: Record<BackupFrequency, string> = {
  daily: "Setiap hari.",
  weekly: "Setiap minggu pada hari yang dipilih.",
  monthly: "Setiap bulan pada tanggal yang dipilih.",
};
const PER_PAGE = 10;

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]} ${m[4]}:${m[5]}`;
}

function statusBadge(log: DbBackupLog) {
  if (log.status === "success") {
    return { text: log.pruned ? "Berhasil (dirotasi)" : "Berhasil", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" };
  }
  if (log.status === "failed") return { text: "Gagal", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" };
  return { text: "Berjalan", cls: "bg-brand-50 text-brand-700 ring-brand-600/20" };
}

export default function DbBackupPage() {
  const { data: user, isLoading: userLoading } = useMe();
  const toast = useToast();
  const canAccess = canRead(user, "masterBackup");
  const canManage = canWrite(user, "masterBackup");

  const [page, setPage] = useState(1);
  const settingsQuery = useDbBackupSettings(canAccess);
  const logsQuery = useDbBackupLogs(page, PER_PAGE, canAccess);
  const save = useSaveDbBackupSettings();
  const run = useRunDbBackup();

  const [form, setForm] = useState<DbBackupSettingsInput>({
    auto_enabled: false,
    frequency: "daily",
    weekday: 0,
    monthday: 1,
    time: "01:00",
    backup_type: "full",
    retention: 7,
  });

  useEffect(() => {
    const s = settingsQuery.data;
    if (s) {
      setForm({
        auto_enabled: s.auto_enabled,
        frequency: s.frequency,
        weekday: s.weekday,
        monthday: s.monthday,
        time: s.time,
        backup_type: s.backup_type,
        retention: s.retention,
      });
    }
  }, [settingsQuery.data]);

  if (userLoading) {
    return (
      <PageContainer title="Backup Database">
        <LoadingSkeleton rows={4} />
      </PageContainer>
    );
  }
  if (!canAccess) {
    return (
      <PageContainer title="Backup Database">
        <AccessDenied />
      </PageContainer>
    );
  }

  const settings = settingsQuery.data;
  const logPage = logsQuery.data;
  const logs = logPage?.items ?? [];
  const hasRunning = logs.some((l) => l.status === "running");
  const storageOk = Boolean(settings?.storage_enabled && settings?.storage_ready);
  const lastPage = logPage?.last_page ?? 1;

  const handleSave = async () => {
    if (form.retention < 1 || form.retention > 365) {
      toast.error("Jumlah backup harus 1–365");
      return;
    }
    try {
      await save.mutateAsync(form);
      toast.success("Pengaturan backup disimpan");
    } catch (e) {
      toast.error("Gagal menyimpan pengaturan", e instanceof ApiError ? e.message : undefined);
    }
  };

  const handleRun = async () => {
    try {
      await run.mutateAsync();
      toast.info("Backup dimulai", "Status akan diperbarui di riwayat.");
      setPage(1);
    } catch (e) {
      toast.error("Gagal memulai backup", e instanceof ApiError ? e.message : undefined);
    }
  };

  const handleDownload = async (log: DbBackupLog) => {
    try {
      const filename = (log.object_key ?? "backup.sql.gz").split("/").pop() ?? "backup.sql.gz";
      await downloadDbBackup(log.id, filename);
    } catch (e) {
      toast.error("Gagal mengunduh", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <PageContainer
      title="Backup Database"
      description="Backup disimpan ke MinIO. Backup lama melewati batas jumlah yang disimpan akan dihapus otomatis."
    >
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Jadwal backup</h2>
          <Button
            variant="secondary"
            onClick={handleRun}
            disabled={!canManage || !storageOk || run.isPending || hasRunning}
          >
            {run.isPending || hasRunning ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Berjalan…
              </span>
            ) : (
              "Jalankan sekarang"
            )}
          </Button>
        </div>

        {!storageOk ? (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Storage MinIO belum aktif — backup tidak bisa disimpan sebelum storage diaktifkan.
          </p>
        ) : null}

        <label className="mb-5 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={form.auto_enabled}
            disabled={!canManage}
            onChange={(e) => setForm({ ...form, auto_enabled: e.target.checked })}
          />
          Aktifkan backup otomatis
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Perulangan" hint={FREQUENCY_HINT[form.frequency]}>
            <select
              className="input"
              value={form.frequency}
              disabled={!canManage || !form.auto_enabled}
              onChange={(e) => setForm({ ...form, frequency: e.target.value as BackupFrequency })}
            >
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
          </Field>

          {form.frequency === "weekly" ? (
            <Field label="Hari">
              <select
                className="input"
                value={form.weekday}
                disabled={!canManage || !form.auto_enabled}
                onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
            </Field>
          ) : form.frequency === "monthly" ? (
            <Field label="Tanggal" hint="Maksimal tanggal 28 agar berlaku di semua bulan.">
              <select
                className="input"
                value={form.monthday}
                disabled={!canManage || !form.auto_enabled}
                onChange={(e) => setForm({ ...form, monthday: Number(e.target.value) })}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Jam mulai (WIB)" htmlFor="backup-time">
              <Input
                id="backup-time"
                type="time"
                value={form.time}
                disabled={!canManage || !form.auto_enabled}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </Field>
          )}

          {form.frequency !== "daily" ? (
            <Field label="Jam mulai (WIB)" htmlFor="backup-time-2">
              <Input
                id="backup-time-2"
                type="time"
                value={form.time}
                disabled={!canManage || !form.auto_enabled}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </Field>
          ) : null}

          <Field label="Jenis backup">
            <select
              className="input"
              value={form.backup_type}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, backup_type: e.target.value as BackupKind })}
            >
              <option value="full">Lengkap (struktur + data)</option>
              <option value="schema">Struktur saja</option>
              <option value="data">Data saja</option>
            </select>
          </Field>

          <Field label="Jumlah backup yang disimpan" hint="Backup lama melewati batas ini dihapus dari MinIO, riwayatnya tetap tercatat.">
            <Input
              type="number"
              min={1}
              max={365}
              value={form.retention}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, retention: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={!canManage || save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
        </div>
      </div>

      <div className="card mt-4 p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Riwayat backup</h2>

        {logsQuery.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada backup yang tercatat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mulai</th>
                  <th className="px-3 py-2 font-semibold">Jenis</th>
                  <th className="px-3 py-2 font-semibold">Pemicu</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Ukuran</th>
                  <th className="px-3 py-2 font-semibold">Keterangan</th>
                  <th className="px-3 py-2 font-semibold">Unduh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const badge = statusBadge(log);
                  const downloadable = log.status === "success" && !log.pruned;
                  return (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">{formatDateTime(log.started_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{KIND_LABEL[log.backup_type] ?? "Lengkap"}</td>
                      <td className="px-3 py-3 text-slate-600">{log.trigger_type === "auto" ? "Terjadwal" : "Manual"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{formatSize(log.size_bytes)}</td>
                      <td className="max-w-xs px-3 py-3 text-xs text-slate-500">
                        {log.message ?? "-"}
                        {log.status === "failed" && log.actor ? <span className="block text-slate-400">oleh {log.actor}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        {downloadable ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(log)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Unduh
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {logPage && logPage.total > PER_PAGE ? (
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Sebelumnya
            </Button>
            <span className="text-sm tabular-nums text-slate-500">
              {page} / {lastPage}
            </span>
            <Button variant="secondary" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Berikutnya
            </Button>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
