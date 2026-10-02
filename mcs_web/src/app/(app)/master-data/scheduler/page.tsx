"use client";

import { Timer } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import { useRunPreventiveScheduleCron } from "@/hooks/use-preventive-schedules";
import { canRead, canWrite } from "@/lib/permissions";
import { ApiError } from "@/types/api";

export default function SchedulerPage() {
  const { data: user, isLoading: userLoading } = useMe();
  const toast = useToast();
  const runCron = useRunPreventiveScheduleCron();

  if (userLoading) {
    return (
      <PageContainer title="Jadwal Preventive (Cron)">
        <LoadingSkeleton rows={4} />
      </PageContainer>
    );
  }
  if (!canRead(user, "masterScheduler")) {
    return (
      <PageContainer title="Jadwal Preventive (Cron)">
        <AccessDenied />
      </PageContainer>
    );
  }

  const canTrigger = canWrite(user, "masterScheduler");

  const handleRun = async () => {
    try {
      const result = await runCron.mutateAsync();
      const count = result.data?.generated_count ?? 0;
      if (count > 0) {
        toast.success(
          `${count} WO berhasil dibuat`,
          result.data?.generated_work_orders.map((w) => w.wo_number).join(", "),
        );
      } else {
        toast.info("Tidak ada yang jatuh tempo", "Semua jadwal yang due hari ini sudah diproses.");
      }
    } catch (e) {
      toast.error("Gagal menjalankan cron", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <PageContainer
      title="Jadwal Preventive (Cron)"
      description="Proses generate WO preventive otomatis berjalan tiap hari jam 00:01 WIB. Dipakai cuma kalau perlu nyusul sebelum jadwal berikutnya."
    >
      <div className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Timer className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Jalankan Proses Generate WO Sekarang</h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Cuma memproses jadwal yang benar-benar sudah jatuh tempo — aman dijalankan
              berkali-kali, tidak akan membuat WO duplikat untuk jadwal yang sudah
              tergenerate hari ini.
            </p>
          </div>
        </div>
        <Button onClick={handleRun} disabled={!canTrigger || runCron.isPending}>
          {runCron.isPending ? "Menjalankan…" : "Jalankan Sekarang"}
        </Button>
      </div>

      {runCron.data?.data ? (
        <div className="card mt-4 p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Hasil Terakhir</h3>
          {runCron.data.data.generated_count > 0 ? (
            <ul className="space-y-1 text-sm text-slate-600">
              {runCron.data.data.generated_work_orders.map((w) => (
                <li key={w.wo_number} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span>{w.wo_number}</span>
                  <span className="text-xs text-slate-500">{w.asset_code} · {w.total_items} item</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Tidak ada jadwal yang jatuh tempo saat ini.</p>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}
