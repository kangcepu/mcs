"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Pencil, Play, Send, Trash2, Wrench } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { DescriptionList } from "@/components/ui/detail";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { ScheduleFormModal } from "@/components/schedules/schedule-form";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import {
  usePreventiveSchedule,
  usePreventiveMutations,
} from "@/hooks/use-preventive-schedules";
import { PERMISSIONS } from "@/lib/permissions";
import { ApiError } from "@/types/api";
import { SCHEDULE_GROUPS, toScheduleGroup } from "@/types/preventive";
import { formatDate } from "@/lib/format";
import { dash, pick } from "@/lib/display";

type Row = Record<string, unknown>;

function isPaused(d: Row): boolean {
  return d.is_pause === true || String(d.is_pause ?? "").toLowerCase() === "paused";
}

export default function PreventiveScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const canManage = useCan(PERMISSIONS.schedule);
  const [editOpen, setEditOpen] = useState(false);
  const confirm = useConfirm();

  const { data, isLoading, error, refetch } = usePreventiveSchedule(id);
  const detail = data?.data as
    | {
        header?: Row;
        details?: Row[];
        repair_status?: { custom_detail_total?: number; schedule_detail_total?: number };
        generation_status?: {
          active_detail_count?: number;
          generated_detail_count?: number;
          missing_detail_count?: number;
          initial_generation_complete?: boolean;
          work_order_numbers?: string[];
        };
      }
    | undefined;
  const header = detail?.header ?? {};
  const details = useMemo(() => detail?.details ?? [], [detail]);
  const { pause, repair, remove, generate } = usePreventiveMutations(id);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const g of SCHEDULE_GROUPS) map.set(g.key, []);
    for (const d of details) {
      const key = toScheduleGroup(pick(d, ["type_schedule", "frequency"]));
      map.get(key)!.push(d);
    }
    return map;
  }, [details]);

  const detailCount =
    detail?.repair_status?.schedule_detail_total ?? details.length;
  const customCount = detail?.repair_status?.custom_detail_total ?? 0;
  const hasUnscheduled = (grouped.get("unscheduled")?.length ?? 0) > 0;
  const showRepair = canManage && customCount !== detailCount;
  const generation = detail?.generation_status;
  const initialWoComplete = generation?.initial_generation_complete === true;
  const showGenerate = canManage && Boolean(detail) && !initialWoComplete;

  const assetLabel =
    pick(header, ["AssetName", "AssetCode", "asset_code"]) || `Schedule #${id}`;

  const onTogglePause = (d: Row) => {
    const next = !isPaused(d);
    confirm.ask({
      title: next ? "Jeda part schedule ini?" : "Lanjutkan part schedule ini?",
      description: `Part: ${dash(pick(d, ["part_mesin", "part"]))}`,
      confirmLabel: next ? "Jeda" : "Lanjutkan",
      tone: next ? "danger" : "primary",
      onConfirm: async () => {
        try {
          await pause.mutateAsync({
            schedule_id: id,
            detail_id: d.id as string | number,
            paused: next,
          });
          toast.success(next ? "Part dijeda" : "Part dilanjutkan");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const onRepair = () => {
    confirm.ask({
      title: "Jalankan Repair dari Custom Detail?",
      description: (
        <>
          Repair akan menyelaraskan Schedule Detail dengan Custom Detail aset.
          {hasUnscheduled ? (
            <span className="mt-1 block text-amber-600">
              Terdapat item &ldquo;Tanpa Jadwal&rdquo; — repair tetap dapat dijalankan.
            </span>
          ) : null}
        </>
      ),
      confirmLabel: "Jalankan Repair",
      onConfirm: async () => {
        try {
          await repair.mutateAsync(id);
          toast.success("Repair berhasil dijalankan");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const onDelete = () => {
    confirm.ask({
      title: "Hapus schedule ini?",
      description: (
        <>
          Tindakan ini permanen dan menghapus seluruh detail schedule untuk aset{" "}
          <b>{pick(header, ["AssetCode", "AssetName"])}</b>.
        </>
      ),
      tone: "danger",
      confirmLabel: "Hapus Permanen",
      confirmPhrase: "HAPUS",
      onConfirm: async () => {
        try {
          await remove.mutateAsync(id);
          toast.success("Schedule dihapus");
          router.replace("/preventive-schedules");
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const onGenerate = () => {
    confirm.ask({
      title: "Buat WO preventive sekarang?",
      description:
        "WO awal akan dibuat untuk seluruh detail aktif pada schedule ini. Sistem mencegah detail yang sama dibuat dua kali pada hari yang sama.",
      confirmLabel: "Buat WO",
      onConfirm: async () => {
        try {
          const res = await generate.mutateAsync(id);
          const count = res.data.generated_work_orders.length;
          toast.success(
            count ? "WO preventive berhasil dibuat" : "Tidak ada WO baru dibuat",
            count ? `${count} WO siap untuk dieksekusi.` : "Periksa hari kerja, executor, atau WO yang sudah dibuat hari ini.",
          );
          confirm.close();
        } catch (e) {
          toast.error("Gagal membuat WO", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  return (
    <PageContainer
      breadcrumb={
        <BackLink fallbackHref="/preventive-schedules">Kembali ke Preventive Schedule</BackLink>
      }
      title={assetLabel}
      headerTitle={assetLabel}
      description={pick(header, ["AssetCode", "asset_code"])}
      actions={
        canManage && detail ? (
          <div className="flex flex-wrap gap-2">
            {showGenerate ? (
              <Button variant="primary" onClick={onGenerate} loading={generate.isPending}>
                <Send className="h-4 w-4" />
                Buat WO Sekarang
              </Button>
            ) : null}
            {showRepair ? (
              <Button variant="secondary" onClick={onRepair} loading={repair.isPending}>
                <Wrench className="h-4 w-4" />
                Repair
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Ubah
            </Button>
            <Button variant="danger" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Hapus
            </Button>
          </div>
        ) : null
      }
    >
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !detail ? (
        <ErrorState error={new Error("Schedule tidak ditemukan.")} />
      ) : (
        <>
          <div className="card p-5">
            <DescriptionList
              columns={3}
              items={[
                { label: "Kode Aset", value: dash(pick(header, ["AssetCode", "asset_code"])) },
                { label: "Company", value: pick(header, ["CompanyName", "company_name"]) },
                {
                  label: "Tujuan WO",
                  value: (
                    <span className="capitalize">
                      {pick(header, ["towo", "target_wo"]) || "-"}
                    </span>
                  ),
                },
                { label: "Jumlah Schedule Detail", value: String(detailCount) },
                { label: "Jumlah Custom Detail", value: String(customCount) },
                {
                  label: "WO Awal",
                  value: initialWoComplete ? (
                    <span className="text-emerald-600">
                      Sudah dibuat{generation?.work_order_numbers?.[0] ? ` (${generation.work_order_numbers[0]})` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-600">
                      Belum lengkap{generation?.missing_detail_count ? ` (${generation.missing_detail_count} detail)` : ""}
                    </span>
                  ),
                },
                {
                  label: "Selaras?",
                  value:
                    customCount === detailCount ? (
                      <span className="text-emerald-600">Ya</span>
                    ) : (
                      <span className="text-amber-600">Perlu Repair</span>
                    ),
                },
              ]}
            />
          </div>

          {SCHEDULE_GROUPS.map((g) => {
            const items = grouped.get(g.key) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-slate-800">{g.label}</h3>
                  <span className="text-xs text-slate-400">{items.length} part</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((d, idx) => (
                    <div
                      key={(d.id as string) ?? idx}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div className="min-w-[180px] flex-1">
                        <p className="font-medium text-slate-800">
                          {dash(pick(d, ["part_mesin", "part"]))}
                        </p>
                        <p className="text-xs text-slate-400">
                          {dash(pick(d, ["job_requirement", "job_title"]))}
                        </p>
                      </div>
                      <div className="text-xs text-slate-500">
                        Kondisi:{" "}
                        <span className="text-slate-700">
                          {dash(pick(d, ["category_maintenance", "condition"]))}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Mulai:{" "}
                        <span className="text-slate-700">
                          {formatDate(pick(d, ["start_date", "next_due_at"]))}
                        </span>
                      </div>
                      {isPaused(d) ? <StatusBadge status="paused" /> : null}
                      {canManage ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => onTogglePause(d)}
                        >
                          {isPaused(d) ? (
                            <>
                              <Play className="h-3.5 w-3.5" /> Lanjutkan
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5" /> Jeda
                            </>
                          )}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {details.length === 0 ? (
            <div className="card p-6 text-center text-sm text-slate-400">
              Schedule ini belum memiliki detail part.
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={pause.isPending || repair.isPending || remove.isPending || generate.isPending}
      />
      <ScheduleFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initial={detail}
      />
    </PageContainer>
  );
}
