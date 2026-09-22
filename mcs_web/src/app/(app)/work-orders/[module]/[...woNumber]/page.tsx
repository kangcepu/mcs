"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Check, RefreshCw, X } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, Textarea } from "@/components/ui/primitives";
import { DescriptionList, MiniTable, Timeline } from "@/components/ui/detail";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import { useMe } from "@/hooks/use-auth";
import {
  useWorkOrderAction,
  useWorkOrderDetail,
  useWorkOrderMaterials,
} from "@/hooks/use-work-orders";
import { WoExecutionPanel } from "@/components/work-orders/wo-execution-panel";
import { PreventiveChecklist } from "@/components/work-orders/preventive-checklist";
import { canReadWoModule } from "@/lib/permissions";
import { API_BASE_URL } from "@/lib/env";
import { AccessDenied } from "@/components/layout/access-denied";
import { WO_MODULE_LABEL } from "@/types/work-order";
import { ApiError } from "@/types/api";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { dash, pick } from "@/lib/display";

type WoActionKey = "approve" | "reject" | "close" | "void";
const ACTION_META: Record<
  WoActionKey,
  { label: string; tone: "primary" | "danger"; needReason: boolean; icon: React.ReactNode }
> = {
  approve: { label: "Setujui", tone: "primary", needReason: false, icon: <Check className="h-4 w-4" /> },
  reject: { label: "Tolak", tone: "danger", needReason: true, icon: <X className="h-4 w-4" /> },
  close: { label: "Tutup WO", tone: "primary", needReason: false, icon: <Check className="h-4 w-4" /> },
  void: { label: "Void", tone: "danger", needReason: true, icon: <Ban className="h-4 w-4" /> },
};

const BASE_TABS = [
  { key: "summary", label: "Ringkasan" },
  { key: "executor", label: "Executor" },
  { key: "labor", label: "Labor" },
  { key: "material", label: "Material" },
  { key: "approval", label: "Approval" },
  { key: "evidence", label: "Evidence" },
  { key: "history", label: "Riwayat" },
] as const;

/** Fallback sementara untuk respons detail lama yang masih mengirim file_path. */
function evidenceUrl(evidence: Record<string, unknown>): string {
  const raw = String(pick(evidence, ["url", "file_path", "path"]) || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}/${raw.replace(/^[/\\]+/, "").replace(/\\/g, "/")}`;
}

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm)(\?|$)/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_RE.test(url);
}

/** Fallback untuk approval cache lama sebelum respons V2 dinormalisasi. */
function approvalStatus(row: Record<string, unknown>): string {
  const status = pick(row, ["status", "approval_status"]);
  if (status) return status;
  const note = pick(row, ["note", "comment", "remarks"]).toUpperCase();
  if (/REJECT|DECLIN|DITOLAK/.test(note)) return "REJECTED";
  if (/APPROV|SETUJU|FORWARD|SUBMIT/.test(note)) return "APPROVED";
  if (/REQUEST|UPDATE|PROGRESS|MATERIAL/.test(note)) return "IN_PROGRESS";
  return "RECORDED";
}

/**
 * Satu part Material Usage juga dapat tercatat di `tb_detail_material`.
 * Badge tab tidak boleh menjumlahkan kedua jejak tersebut karena satu part
 * fisik akan tampak dua kali. Prioritas sumbernya adalah line Material Usage;
 * material yang dicatat langsung hanya dihitung jika belum ada pada line itu.
 */
function materialPartIdentity(row: Record<string, unknown>): string {
  return String(
    pick(row, ["erp_item_code", "part_code", "item_code", "part", "part_name", "material"]),
  )
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export default function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ module: string; woNumber: string[] }>;
}) {
  const { module, woNumber } = use(params);
  const woNo = woNumber.map(decodeURIComponent).join("/");
  const mod = decodeURIComponent(module);

  const toast = useToast();
  const { data: me, isLoading: meLoading } = useMe();
  const moduleAllowed = canReadWoModule(me, mod);
  const [tab, setTab] = useState<string>("summary");
  const { data, isLoading, error, refetch, isFetching } = useWorkOrderDetail(woNo, mod);
  const wo = data?.data;

  // Material dipakai juga untuk badge tab. Muat sejak detail WO dibuka agar
  // jumlahnya tidak baru muncul setelah user mengklik tab Material.
  const materialReq = useWorkOrderMaterials(woNo, Boolean(woNo));
  const mat = materialReq.data?.data;
  const materialRequests = mat?.requests ?? [];
  const materialLineItems = mat?.line_items ?? [];
  const materialRecorded =
    (mat?.recorded ?? []).length > 0
      ? mat?.recorded ?? []
      : ((wo?.materials ?? []) as Array<Record<string, unknown>>);
  const materialCount = useMemo(() => {
    // `line_items` adalah sumber utama part nyata yang diminta/diambil/dipakai.
    // Satu row = satu part, termasuk bila request memilih lebih dari satu part.
    const canonical = materialLineItems.filter((row) => materialPartIdentity(row) !== "");
    const knownParts = new Set(canonical.map(materialPartIdentity));

    // `recorded` hanya merupakan tambahan bila part tidak sudah ada pada alur
    // Material Usage. Ini mencegah request yang sama tampil sebagai angka 2.
    const directOnly = materialRecorded.filter((row) => {
      const key = materialPartIdentity(row);
      if (!key || knownParts.has(key)) return false;
      knownParts.add(key);
      return true;
    });

    if (canonical.length > 0 || directOnly.length > 0) {
      return canonical.length + directOnly.length;
    }

    // Request PENDING belum memiliki part fisik sehingga tidak diberi badge.
    // Jika instalasi lama menyimpan part langsung pada request, hitung hanya
    // row yang sudah berisi nama part (bukan header request kosong).
    return materialRequests.filter((row) => materialPartIdentity(row) !== "").length;
  }, [materialLineItems, materialRecorded, materialRequests]);

  const scheduleItems = wo?.schedule_items ?? [];
  const isPreventive =
    (mod === "maintenance" || mod === "meso") &&
    /prev/i.test(String((wo as Record<string, unknown>)?.type_wo ?? ""));
  const TABS = isPreventive
    ? [
        ...BASE_TABS.slice(0, 4),
        { key: "preventive", label: "Part Preventive" } as const,
        ...BASE_TABS.slice(4),
      ]
    : BASE_TABS;

  const canAct = useCan([
    "wo_mtc",
    "wo_it",
    "wo_operational",
    "wo_ga",
    "wo_preventive",
    "wo_mtc_all",
    "wo_cross_access",
    "approval_all",
  ]);
  const canVoid = useCan(["wo_void", "approval_all"]);
  const action = useWorkOrderAction(woNo, mod);
  const [dialog, setDialog] = useState<WoActionKey | null>(null);
  const [reason, setReason] = useState("");

  const runAction = async () => {
    if (!dialog) return;
    try {
      await action.mutateAsync({ action: dialog, comment: reason.trim() || undefined });
      toast.success(`${ACTION_META[dialog].label} berhasil`);
      setDialog(null);
      setReason("");
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  if (!meLoading && !moduleAllowed) {
    return (
      <PageContainer title="Work Order">
        <AccessDenied message={`Anda tidak memiliki permission untuk modul ${WO_MODULE_LABEL[mod as keyof typeof WO_MODULE_LABEL] ?? mod}.`} />
      </PageContainer>
    );
  }

  const woStatus = String(wo?.status ?? "").toUpperCase();
  const isCloseable = ["NEED_CLOSED", "COMPLETE", "COMPLETE_EXECUTOR"].includes(woStatus);
  const isFinal = ["CLOSED", "VOID", "REJECT", "DECLINE"].includes(woStatus);
  // Gunakan action flag dari API: status WAIT juga dipakai untuk executor dan
  // part, sehingga bukan berarti user aktif masih boleh menyetujui WO ini.
  const showApprove = canAct && Boolean(wo?.actions?.can_approve);
  const showClose = canAct && (wo?.actions?.can_close ?? isCloseable);
  // VOID punya permission tersendiri. Jangan tampilkan aksi yang pasti ditolak
  // server hanya karena user dapat melihat/mengubah WO biasa.
  const showVoid = canVoid && !isFinal;

  return (
    <PageContainer
      breadcrumb={
        <BackLink fallbackHref="/work-orders">Kembali ke Work Order</BackLink>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {woNo}
          {wo?.status ? <StatusBadge status={wo.status} /> : null}
        </span>
      }
      headerTitle={woNo}
      description={`Modul ${WO_MODULE_LABEL[mod as keyof typeof WO_MODULE_LABEL] ?? mod}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {wo ? (
            <WoExecutionPanel
              module={mod}
              woNumber={woNo}
              woStatus={woStatus}
              wo={wo as Record<string, unknown>}
              canManage={canAct}
            />
          ) : null}
          {wo && showApprove ? (
            <>
              <Button onClick={() => setDialog("approve")}>
                <Check className="h-4 w-4" /> Setujui
              </Button>
              <Button variant="danger" onClick={() => setDialog("reject")}>
                <X className="h-4 w-4" /> Tolak
              </Button>
            </>
          ) : null}
          {wo && showClose ? (
            <Button variant="secondary" onClick={() => setDialog("close")}>
              Tutup WO
            </Button>
          ) : null}
          {wo && showVoid ? (
            <Button variant="ghost" onClick={() => setDialog("void")}>
              <Ban className="h-4 w-4" /> Void
            </Button>
          ) : null}
        </div>
      }
    >
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !wo ? (
        <ErrorState error={new Error("Data work order tidak ditemukan.")} />
      ) : (
        <>
          <Tabs
            items={TABS.map((t) => ({
              ...t,
              count:
                t.key === "material"
                  ? materialCount || undefined
                  : t.key === "labor"
                    ? wo.labors?.length
                    : t.key === "approval"
                      ? wo.approvals?.length
                      : t.key === "evidence"
                        ? wo.evidences?.length
                        : undefined,
            }))}
            value={tab}
            onChange={setTab}
          />

          {tab === "summary" && (
            <div className="space-y-4">
              <div className="card p-5">
                <DescriptionList
                  columns={3}
                  items={[
                    { label: "No. WO", value: wo.wo_number },
                    { label: "Judul", value: pick(wo, ["title", "subject"]) },
                    { label: "Tipe WO", value: dash(wo.type_wo) },
                    { label: "Prioritas", value: dash(wo.priority) },
                    { label: "Company", value: pick(wo, ["company_name", "company"]) },
                    {
                      label: "Aset",
                      value: pick(wo, ["asset_name", "asset_code"]) || "-",
                    },
                    { label: "Kode Aset", value: dash(wo.asset_code) },
                    { label: "Diminta oleh", value: dash(wo.requested_by) },
                    { label: "Executor", value: dash(wo.executor) },
                    { label: "Dibuat", value: formatDateTime(wo.created_at) },
                    { label: "Dijadwalkan", value: formatDate(wo.scheduled_at) },
                    { label: "Ditutup", value: formatDateTime(wo.closed_at) },
                  ]}
                />
                {wo.description ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Deskripsi
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {String(wo.description)}
                    </p>
                  </div>
                ) : null}
              </div>

              {scheduleItems.length > 0 ? (
                <div className="card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    Item Jadwal Preventive
                    {wo.schedule_id ? (
                      <Link
                        href={`/preventive-schedules/${wo.schedule_id}`}
                        className="ml-2 text-xs font-normal text-brand-600 hover:underline"
                      >
                        Lihat schedule
                      </Link>
                    ) : null}
                  </h3>
                  <MiniTable
                    columns={[
                      {
                        key: "part",
                        header: "Part",
                        render: (r) =>
                          pick(r, ["part_mesin", "part", "part_name"]) || "-",
                      },
                      {
                        key: "activity",
                        header: "Aktivitas",
                        render: (r) =>
                          pick(r, [
                            "job_requirement",
                            "activity",
                            "job_title",
                          ]) || "-",
                      },
                      {
                        key: "frequency",
                        header: "Frekuensi",
                        render: (r) => {
                          const f = pick(r, [
                            "type_schedule",
                            "frequency",
                            "durasi_pengecekan",
                          ]);
                          const d = pick(r, ["choose_day", "day"]);
                          return [f, d].filter(Boolean).join(" · ") || "-";
                        },
                      },
                      {
                        key: "executor",
                        header: "Executor / Kategori",
                        render: (r) =>
                          pick(r, [
                            "executor",
                            "category_maintenance",
                            "condition",
                            "kondisi",
                          ]) || "-",
                      },
                    ]}
                    rows={scheduleItems as Array<Record<string, unknown>>}
                  />
                </div>
              ) : null}
            </div>
          )}

          {tab === "executor" && (
            <div className="card p-5">
              <MiniTable
                columns={[
                  {
                    key: "name",
                    header: "Nama",
                    render: (row) => pick(row, ["name", "trade", "labor_name"]) || "-",
                  },
                  {
                    key: "role",
                    header: "Peran",
                    render: (row) => pick(row, ["role", "job_executor", "for"]) || "-",
                  },
                  { key: "status", header: "Status" },
                  { key: "assigned_at", header: "Ditugaskan" },
                ]}
                rows={(wo.executors ?? []) as Array<Record<string, unknown>>}
                emptyText="Belum ada executor pada WO ini."
              />
            </div>
          )}

          {tab === "labor" && (
            <div className="card p-5">
              <MiniTable
                columns={[
                  {
                    key: "name",
                    header: "Nama",
                    render: (row) => pick(row, ["name", "trade", "labor_name"]) || "-",
                  },
                  {
                    key: "role",
                    header: "Peran",
                    render: (row) => pick(row, ["role", "job_executor", "for"]) || "-",
                  },
                  { key: "hours", header: "Jam", align: "right" },
                  { key: "cost", header: "Biaya", align: "right" },
                ]}
                rows={(wo.labors ?? []) as Array<Record<string, unknown>>}
                emptyText="Belum ada pencatatan labor."
              />
            </div>
          )}

          {tab === "preventive" && (
            <PreventiveChecklist woNumber={woNo} module={mod} canWrite={canAct} />
          )}

          {tab === "material" && (
            <div className="space-y-4">
              {materialReq.error ? (
                <div className="card p-5">
                  <ErrorState
                    error={materialReq.error}
                    onRetry={() => materialReq.refetch()}
                  />
                </div>
              ) : null}

              {/* 1. Part yang benar-benar diminta / diambil / dipakai
                    (tb_material_request — alur Material Usage klasik, dipakai
                    MESO & WO lama). Ini yang sebelumnya tidak muncul. */}
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Material Diminta &amp; Diambil
                  </h3>
                  <span className="text-xs text-slate-400">
                    {materialReq.isFetching
                      ? "Memuat…"
                      : `${materialLineItems.length} part`}
                  </span>
                </div>
                <MiniTable
                  columns={[
                    {
                      key: "part",
                      header: "Part",
                      render: (r) => pick(r, ["part", "part_name"]) || "-",
                    },
                    {
                      key: "qty_request",
                      header: "Diminta",
                      align: "right",
                      render: (r) => formatQty(r.qty_request as number),
                    },
                    {
                      key: "qty_receive",
                      header: "Diambil",
                      align: "right",
                      render: (r) => formatQty(r.qty_receive as number),
                    },
                    {
                      key: "qty_usage",
                      header: "Dipakai",
                      align: "right",
                      render: (r) => formatQty(r.qty_usage as number),
                    },
                    {
                      key: "uom",
                      header: "UOM",
                      render: (r) => pick(r, ["uom", "uom_request"]) || "-",
                    },
                    {
                      key: "job_executor",
                      header: "Executor",
                      render: (r) => pick(r, ["job_executor"]) || "-",
                    },
                    {
                      key: "request_code",
                      header: "Ref",
                      render: (r) => pick(r, ["request_code"]) || "-",
                    },
                    {
                      key: "pr_number",
                      header: "PR",
                      render: (r) => pick(r, ["pr_number"]) || "-",
                    },
                  ]}
                  rows={materialLineItems}
                  emptyText="Belum ada part yang diminta lewat Material Usage."
                />
              </div>

              {/* 2. Permohonan "Ajukan Part" dari eksekutor
                    (tb_material_part_request — alur baru). */}
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Permintaan Part / Material
                  </h3>
                  <span className="text-xs text-slate-400">
                    {materialRequests.length} permintaan
                  </span>
                </div>
                <MiniTable
                  columns={[
                    {
                      key: "part_name",
                      header: "Part",
                      render: (r) =>
                        pick(r, ["part_name"]) || (
                          <span className="text-slate-400">
                            Belum dipilih tim Sparepart
                          </span>
                        ),
                    },
                    {
                      key: "qty",
                      header: "Qty",
                      align: "right",
                      render: (r) => {
                        const qty = pick(r, ["qty"]);
                        if (!qty) return "-";
                        return `${formatQty(qty)} ${pick(r, ["uom"])}`.trim();
                      },
                    },
                    {
                      key: "requested_by_name",
                      header: "Diminta oleh",
                      render: (r) =>
                        pick(r, ["requested_by_name", "job_executor"]) || "-",
                    },
                    {
                      key: "selected_by_name",
                      header: "Part dipilih oleh",
                      render: (r) => {
                        const by = pick(r, ["selected_by_name"]);
                        if (!by) return <span className="text-slate-400">-</span>;
                        const at = pick(r, ["selected_at"]);
                        return (
                          <span title={at ? formatDateTime(at) : undefined}>
                            {by}
                          </span>
                        );
                      },
                    },
                    {
                      key: "request_note",
                      header: "Catatan",
                      render: (r) => pick(r, ["request_note"]) || "-",
                    },
                    {
                      key: "pr_number",
                      header: "PR",
                      render: (r) => pick(r, ["pr_number"]) || "-",
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (r) => (
                        <StatusBadge
                          status={pick(r, ["status", "erp_status"]) || "PENDING"}
                        />
                      ),
                    },
                    {
                      key: "created_at",
                      header: "Diajukan",
                      render: (r) =>
                        formatDateTime(pick(r, ["created_at", "updated_at"])),
                    },
                    {
                      key: "detail",
                      header: "",
                      align: "right",
                      render: (r) => (
                        <Link
                          href={`/material-usage/${r.id}`}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Detail
                        </Link>
                      ),
                    },
                  ]}
                  rows={materialRequests}
                  emptyText="Belum ada permintaan part untuk WO ini."
                />
              </div>

              {/* 3. Material dicatat langsung di WO (tb_detail_material). */}
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Material Tercatat di WO
                </h3>
                <MiniTable
                  columns={[
                    {
                      key: "part_code",
                      header: "Kode Part",
                      render: (r) => pick(r, ["part_code", "erp_item_code"]) || "-",
                    },
                    {
                      key: "part_name",
                      header: "Nama Part",
                      render: (r) => pick(r, ["part_name", "part", "material"]) || "-",
                    },
                    {
                      key: "qty",
                      header: "Qty",
                      align: "right",
                      render: (r) => formatQty(pick(r, ["qty", "material_request"])),
                    },
                    {
                      key: "uom",
                      header: "UOM",
                      render: (r) => pick(r, ["uom", "unit", "uom_request"]) || "-",
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (r) =>
                        pick(r, ["status"]) ? (
                          <StatusBadge status={pick(r, ["status"])} />
                        ) : (
                          "-"
                        ),
                    },
                  ]}
                  rows={materialRecorded}
                  emptyText="Belum ada material tercatat pada WO ini."
                />
              </div>
            </div>
          )}

          {tab === "approval" && (
            <div className="card p-5">
              <MiniTable
                columns={[
                  {
                    key: "level",
                    header: "Level",
                    render: (r) => pick(r, ["level", "approval_level", "id_approval"]) || "-",
                  },
                  {
                    key: "role",
                    header: "Peran",
                    render: (r) => pick(r, ["role", "id_position", "position"]) || "-",
                  },
                  {
                    key: "approver",
                    header: "Approver",
                    render: (r) => pick(r, ["approver", "fullname", "approved_by", "created_by"]) || "-",
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (r) => <StatusBadge status={approvalStatus(r)} />,
                  },
                  {
                    key: "note",
                    header: "Catatan",
                    render: (r) => pick(r, ["note", "comment", "remarks"]) || "-",
                  },
                  {
                    key: "acted_at",
                    header: "Waktu",
                    render: (r) => formatDateTime(pick(r, ["acted_at", "approved_at", "updated_at", "created_at", "date"])),
                  },
                ]}
                rows={(wo.approvals ?? []) as Array<Record<string, unknown>>}
                emptyText="Tidak ada alur approval."
              />
            </div>
          )}

          {tab === "evidence" && (
            <div className="card p-5">
              {(wo.evidences ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Belum ada evidence / lampiran.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {(wo.evidences ?? []).map((ev, i) => {
                    const url = evidenceUrl(ev as Record<string, unknown>);
                    if (!url) return null;
                    const caption = ev.caption ?? ev.stage ?? `Evidence ${i + 1}`;
                    if (isVideoUrl(url)) {
                      return (
                        <div
                          key={String(ev.id ?? i)}
                          className="overflow-hidden rounded-lg border border-slate-200"
                        >
                          <video
                            src={url}
                            controls
                            preload="metadata"
                            className="aspect-square w-full bg-black object-contain"
                          />
                          <p className="truncate px-2 py-1.5 text-xs text-slate-500">
                            {caption}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <a
                        key={String(ev.id ?? i)}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-lg border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={caption}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full bg-slate-100 object-cover transition group-hover:opacity-90"
                        />
                        <p className="truncate px-2 py-1.5 text-xs text-slate-500">
                          {caption}
                        </p>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="card p-5">
              <Timeline
                entries={(wo.histories ?? []).map((h) => ({
                  title: `${h.action ?? "Perubahan"}${
                    h.to_status ? ` → ${h.to_status}` : ""
                  }`,
                  meta: formatDateTime(h.at),
                  body: (
                    <>
                      {h.actor ? (
                        <span className="text-slate-500">oleh {h.actor}</span>
                      ) : null}
                      {h.note ? <p className="mt-0.5">{h.note}</p> : null}
                    </>
                  ),
                }))}
              />
            </div>
          )}
        </>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => {
          setDialog(null);
          setReason("");
        }}
        size="md"
        title={dialog ? `${ACTION_META[dialog].label} — ${woNo}` : ""}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {dialog === "approve" && "Setujui / teruskan work order ini ke tahap berikutnya?"}
            {dialog === "reject" && "Tolak work order ini? Berikan alasan penolakan."}
            {dialog === "close" && "Tutup work order ini sebagai selesai?"}
            {dialog === "void" && "Void (batalkan) dokumen work order ini? Berikan alasan."}
          </p>
          {dialog && ACTION_META[dialog].needReason ? (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alasan…"
              autoFocus
            />
          ) : (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Catatan (opsional)…"
            />
          )}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setDialog(null);
              setReason("");
            }}
          >
            Batal
          </Button>
          <Button
            variant={dialog && ACTION_META[dialog].tone === "danger" ? "danger" : "primary"}
            loading={action.isPending}
            disabled={Boolean(dialog && ACTION_META[dialog].needReason && !reason.trim())}
            onClick={runAction}
          >
            {dialog ? ACTION_META[dialog].label : ""}
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
