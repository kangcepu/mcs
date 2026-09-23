"use client";

import { use, useState } from "react";
import {
  CheckCircle2,
  ClipboardEdit,
  PackagePlus,
  PauseCircle,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { DescriptionList, MiniTable } from "@/components/ui/detail";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { ErpStatusBadge, ErpSyncWarning } from "@/components/material/erp-status";
import { SelectPartsModal } from "@/components/material/select-parts-modal";
import { SetUsageModal } from "@/components/material/set-usage-modal";
import { ConfirmUsageModal } from "@/components/material/confirm-usage-modal";
import { HoldPartModal } from "@/components/material/hold-part-modal";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import {
  useMaterialUsageDetail,
  useMaterialUsageMutations,
} from "@/hooks/use-material-usage";
import { useMe } from "@/hooks/use-auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ApiError } from "@/types/api";
import type { MaterialUsageDetail } from "@/types/material";
import { formatDateTime, formatNumber } from "@/lib/format";
import { dash, pick } from "@/lib/display";

/**
 * Satu request mempunyai dua status backend:
 * - tb_material_part_request: PENDING → SELECTED → SENT_ERP / CANCELLED
 * - tb_material_usage: OPEN → IN_PROGRESS → CLOSED
 *
 * Setelah part dipilih, header request tidak lagi berubah ketika pemakaian
 * disimpan. Karena itu status proses harus memprioritaskan usage header.
 */
function resolveWorkflowStatus(requestStatus: string, usageStatus: string): string {
  if (["PENDING", "CANCELLED"].includes(requestStatus)) return requestStatus;
  if (["IN_PROGRESS", "CLOSED"].includes(usageStatus)) return usageStatus;
  if (requestStatus === "SENT_ERP") return requestStatus;
  return requestStatus || usageStatus || "OPEN";
}

export default function MaterialUsageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = useCan(PERMISSIONS.materialUsage);

  const { data, isLoading, error, refetch, isFetching } = useMaterialUsageDetail(id);
  const detail: MaterialUsageDetail | undefined = data?.data;

  const req = detail?.request ?? {};
  const wo = detail?.wo ?? {};
  const usageHeader = detail?.usage_header ?? {};
  const parts = detail?.parts ?? [];
  const purchase = detail?.purchase ?? [];
  const holdRows: Array<Record<string, unknown>> = Array.isArray(detail?.hold)
    ? detail.hold
    : detail?.hold
      ? [detail.hold as Record<string, unknown>]
      : [];
  const requestCode = detail?.request_code ?? "";
  const woNumber = detail?.wo_number ?? pick(req, ["wo_number"]);
  const jobExecutor = detail?.job_executor ?? pick(req, ["job_executor"]) ?? "-";
  // URL daftar memakai ID header Material Usage. Endpoint aksi request
  // (pilih part / batal / ERP) memakai ID tb_material_part_request.
  const partRequestId = pick(req, ["id"]) || id;
  const requestStatus = pick(req, ["status"]).toUpperCase();
  const usageStatus = pick(usageHeader, ["status"]).toUpperCase();
  const status = resolveWorkflowStatus(requestStatus, usageStatus);
  const erpStatus = pick(req, ["erp_status"]);
  const company =
    pick(wo, ["company"]) || pick(req, ["wo_company", "company"]) || "";

  const { data: currentUser } = useMe();
  const { cancel, voidSelection } = useMaterialUsageMutations(id);
  const [selectOpen, setSelectOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [holdPart, setHoldPart] = useState<Record<string, unknown> | null>(null);

  const canHoldRows = canManage && ["OPEN", "SELECTED", "IN_PROGRESS", "SENT_ERP"].includes(status);
  const isRequester = String(pick(req, ["requested_by"])) === String(currentUser?.id ?? "");
  // Tim Sparepart/management (akses material_usage) juga boleh membatalkan
  // request PENDING orang lain — bukan cuma pemohon aslinya — biar request
  // yang gak jadi diteruskan gak nyangkut selamanya.
  const canCancel = requestStatus === "PENDING" && (isRequester || canManage);
  // Part sudah dipilih tapi ternyata gak jadi diambil — beda dari `canCancel`
  // (PENDING, oleh pemohon) ini dilakukan tim Sparepart/management setelah
  // part terlanjur dipilih, dan cuma aman selama belum ada qty yang diambil.
  const canVoidSelection = canManage && requestStatus === "SELECTED";
  const canSetUsage =
    canManage &&
    status !== "CLOSED" &&
    Boolean(requestCode) &&
    (
      ["SELECTED", "SENT_ERP"].includes(requestStatus) ||
      // Request dari Part Execution lama sudah memiliki baris part langsung,
      // sehingga tidak melewati status tb_material_part_request.
      (!requestStatus && parts.length > 0 && ["OPEN", "IN_PROGRESS"].includes(usageStatus))
    );
  const canConfirm = canManage && status === "IN_PROGRESS" && Boolean(requestCode);
  const onCancel = () => {
    confirm.ask({
      title: "Batalkan permintaan material?",
      description:
        "Permintaan PENDING ini akan dibatalkan dan tidak dapat dikembalikan dari halaman ini.",
      confirmLabel: "Batalkan Permintaan",
      tone: "danger",
      onConfirm: async () => {
        try {
          await cancel.mutateAsync(partRequestId);
          toast.success("Permintaan material dibatalkan");
          confirm.close();
        } catch (e) {
          toast.error("Gagal membatalkan", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };
  const onVoidSelection = () => {
    confirm.ask({
      title: "Batalkan pilihan part?",
      description:
        "Part yang sudah dipilih untuk request ini akan dibatalkan (tidak jadi diambil). Hanya bisa dilakukan selama belum ada qty yang diambil/dipakai.",
      confirmLabel: "Batalkan Pilihan Part",
      tone: "danger",
      onConfirm: async () => {
        try {
          await voidSelection.mutateAsync(partRequestId);
          toast.success("Pilihan part dibatalkan");
          confirm.close();
        } catch (e) {
          toast.error("Gagal membatalkan pilihan part", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const woLabel = woNumber ? `Material — ${woNumber}` : `Material #${id}`;

  return (
    <PageContainer
      breadcrumb={
        <BackLink fallbackHref="/material-usage">Kembali ke Material Usage</BackLink>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {woLabel}
          {status ? <StatusBadge status={status} /> : null}
        </span>
      }
      headerTitle={woLabel}
      description={pick(wo, ["job_title"]) || pick(req, ["wo_job_title"])}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCcw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {detail && canManage && status === "PENDING" ? (
            <Button onClick={() => setSelectOpen(true)}>
              <PackagePlus className="h-4 w-4" />
              Pilih Part
            </Button>
          ) : null}
          {detail && canSetUsage ? (
            <Button variant="secondary" onClick={() => setUsageOpen(true)}>
              <ClipboardEdit className="h-4 w-4" />
              Isi Pemakaian
            </Button>
          ) : null}
          {detail && canConfirm ? (
            <Button onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Konfirmasi
            </Button>
          ) : null}
          {detail && canCancel ? (
            <Button variant="danger" onClick={onCancel}>
              <XCircle className="h-4 w-4" />
              Batalkan
            </Button>
          ) : null}
          {detail && canVoidSelection ? (
            <Button variant="danger" onClick={onVoidSelection} loading={voidSelection.isPending}>
              <XCircle className="h-4 w-4" />
              Batalkan Pilihan Part
            </Button>
          ) : null}
        </div>
      }
    >
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !detail ? (
        <ErrorState error={new Error("Data tidak ditemukan.")} />
      ) : (
        <>
          <ErpSyncWarning status={erpStatus} />

          <div className="card px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="font-medium text-slate-700">Status proses</span>
              <StatusBadge status={status} />
              {requestStatus && requestStatus !== status ? (
                <span className="text-xs text-slate-500">
                  Request: <StatusBadge status={requestStatus} className="ml-1" />
                </span>
              ) : null}
              {usageStatus && usageStatus !== status ? (
                <span className="text-xs text-slate-500">
                  Pemakaian: <StatusBadge status={usageStatus} className="ml-1" />
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {status === "PENDING"
                ? "Menunggu tim Sparepart memilih part dan qty."
                : status === "SELECTED" || status === "SENT_ERP"
                  ? "Part sudah dipilih. Isi pemakaian aktual sebelum melakukan konfirmasi."
                  : status === "IN_PROGRESS"
                    ? "Pemakaian tersimpan dan siap dikonfirmasi untuk menutup proses material."
                    : status === "CLOSED"
                      ? "Proses material telah selesai."
                      : "Status diproses oleh backend."}
            </p>
          </div>

          <div className="card p-5">
            <DescriptionList
              columns={3}
              items={[
                { label: "Work Order", value: dash(woNumber) },
                { label: "Judul WO", value: dash(pick(wo, ["job_title"])) },
                { label: "Company", value: dash(company) },
                {
                  label: "Aset",
                  value: pick(wo, ["asset_name", "asset_code"]) || "-",
                },
                { label: "Executor", value: dash(jobExecutor) },
                {
                  label: "Pemohon",
                  value: dash(pick(req, ["requested_by_name", "requester"])),
                },
                { label: "Kode Request", value: dash(requestCode) },
                {
                  label: "Status Request",
                  value: requestStatus ? <StatusBadge status={requestStatus} /> : "-",
                },
                {
                  label: "Status Pemakaian",
                  value: usageStatus ? <StatusBadge status={usageStatus} /> : "-",
                },
                {
                  label: "Status ERP",
                  value: (
                    <ErpStatusBadge
                      status={erpStatus}
                      syncedAt={pick(req, ["erp_synced_at", "erp_sent_at"])}
                    />
                  ),
                },
                {
                  label: "Waktu Request",
                  value: formatDateTime(pick(req, ["created_at", "requested_at"])),
                },
                { label: "Status", value: <StatusBadge status={status} /> },
                { label: "Catatan", value: dash(pick(req, ["request_note", "note"])) },
              ]}
            />
          </div>

          {/* Parts / BOM: request vs usage */}
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Parts / BOM</h3>
            <MiniTable
              columns={[
                {
                  key: "part",
                  header: "Part",
                  render: (r) => (
                    <span>
                      {dash(pick(r, ["part", "part_name"]))}
                      {pick(r, ["erp_item_code"]) ? (
                        <span className="ml-1 text-xs text-slate-400">
                          {pick(r, ["erp_item_code"])}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "material_request",
                  header: "Request",
                  align: "right",
                  render: (r) =>
                    `${formatNumber(r.material_request as number)} ${pick(r, ["uom_request", "uom"])}`,
                },
                {
                  key: "material_usage",
                  header: "Material Usage",
                  align: "right",
                  render: (r) =>
                    r.material_usage === null || r.material_usage === undefined || r.material_usage === ""
                      ? "-"
                      : `${formatNumber(r.material_usage as number)} ${pick(r, ["uom_usage", "uom_request", "uom"])}`,
                },
                {
                  key: "purchase_request",
                  header: "Purchase Request",
                  align: "right",
                  render: (r) =>
                    r.purchase_request
                      ? `${formatNumber(r.purchase_request as number)} ${pick(r, ["uom_purchase", "uom_request"])}`
                      : "-",
                },
                {
                  key: "hold",
                  header: "Hold",
                  align: "right",
                  render: (r) => {
                    const held = Number(r.hold ?? 0);
                    return (
                      <span className="inline-flex items-center gap-2">
                        {held > 0 ? (
                          <span className="text-amber-600">{formatNumber(held)}</span>
                        ) : null}
                        {canHoldRows ? (
                          <Button
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setHoldPart(r)}
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                            Hold
                          </Button>
                        ) : held > 0 ? null : (
                          "-"
                        )}
                      </span>
                    );
                  },
                },
              ]}
              rows={parts}
              emptyText="Belum ada part. Tim Sparepart klik 'Pilih Part' untuk mengisi."
            />
          </div>

          {/* Purchase Item */}
          {purchase.length > 0 ? (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Purchase Item</h3>
              <MiniTable
                columns={[
                  { key: "part", header: "Part", render: (r) => dash(pick(r, ["part"])) },
                  {
                    key: "purchase_request",
                    header: "Purchase Request",
                    align: "right",
                    render: (r) => formatNumber(r.purchase_request as number),
                  },
                  {
                    key: "material_receive",
                    header: "Material Receive",
                    align: "right",
                    render: (r) => formatNumber(r.material_receive as number),
                  },
                  {
                    key: "material_usage_prc",
                    header: "Material Usage",
                    align: "right",
                    render: (r) => formatNumber(r.material_usage_prc as number),
                  },
                ]}
                rows={purchase}
              />
            </div>
          ) : null}

          {holdRows.length > 0 ? (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Hold Parts</h3>
              <MiniTable
                columns={[
                  { key: "part", header: "Part", render: (r) => dash(pick(r, ["part"])) },
                  {
                    key: "level",
                    header: "Level",
                    render: (r) => dash(pick(r, ["level"])),
                  },
                  {
                    key: "hold_qty",
                    header: "Qty Hold",
                    align: "right",
                    render: (r) =>
                      `${formatNumber(r.hold_qty as number)} ${pick(r, ["hold_uom", "uom"])}`,
                  },
                  {
                    key: "remarks",
                    header: "Keterangan",
                    render: (r) => dash(pick(r, ["remarks", "reason", "note"])),
                  },
                ]}
                rows={holdRows}
              />
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={cancel.isPending}
      />

      <SelectPartsModal
        open={selectOpen}
        onClose={() => setSelectOpen(false)}
        requestId={partRequestId}
        company={company}
        onDone={() => refetch()}
        requesterNote={
          pick(req, ["requested_by_name"])
            ? `${pick(req, ["requested_by_name"])} | ${pick(req, ["request_note"]) || "-"}`
            : undefined
        }
      />

      <SetUsageModal
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        requestId={id}
        woNumber={woNumber}
        jobExecutor={jobExecutor}
        requestCode={requestCode}
        parts={parts}
      />

      <ConfirmUsageModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        requestId={id}
        woNumber={woNumber}
        jobExecutor={jobExecutor}
        requestCode={requestCode}
        purchase={purchase}
      />

      <HoldPartModal
        open={!!holdPart}
        onClose={() => setHoldPart(null)}
        requestId={id}
        part={holdPart}
      />
    </PageContainer>
  );
}
