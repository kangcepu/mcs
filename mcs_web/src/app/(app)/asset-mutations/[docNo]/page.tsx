"use client";

import { use } from "react";
import { Check, RefreshCw } from "lucide-react";
import Image from "next/image";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { DescriptionList, MiniTable, Timeline } from "@/components/ui/detail";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAssetMutationActions, useAssetMutationDetail } from "@/hooks/use-asset-mutation";
import { ApiError } from "@/types/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { dash, pick } from "@/lib/display";

export default function AssetMutationDetailPage({
  params,
}: {
  params: Promise<{ docNo: string }>;
}) {
  const { docNo: raw } = use(params);
  const docNo = decodeURIComponent(raw);
  const toast = useToast();
  const confirm = useConfirm();

  const { data, isLoading, error, refetch, isFetching } = useAssetMutationDetail(docNo);
  const detail = data?.data;
  const header = detail?.header ?? {};
  const details = detail?.details ?? [];
  const approvals = detail?.approvals ?? [];
  const canApprove = detail?.permissions?.can_approve ?? false;
  const status = pick(header, ["status"]).toUpperCase();

  const { approve } = useAssetMutationActions(docNo);

  const onApprove = () => {
    confirm.ask({
      title: "Setujui mutasi aset?",
      description: (
        <>
          Menyetujui dokumen <b>{docNo}</b> akan memindahkan aset ke lokasi/company
          tujuan.
        </>
      ),
      confirmLabel: "Setujui",
      onConfirm: async () => {
        try {
          await approve.mutateAsync(docNo);
          toast.success("Mutasi disetujui");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  return (
    <PageContainer
      breadcrumb={
        <BackLink fallbackHref="/asset-mutations">Kembali ke Mutasi Aset</BackLink>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {docNo}
          {status ? <StatusBadge status={status} /> : null}
        </span>
      }
      headerTitle={docNo}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {canApprove && status === "NEED_APPROVED" ? (
            <Button onClick={onApprove}>
              <Check className="h-4 w-4" />
              Setujui
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
        <ErrorState error={new Error("Dokumen mutasi tidak ditemukan.")} />
      ) : (
        <>
          <div className="card p-5">
            <DescriptionList
              columns={3}
              items={[
                { label: "No. Dokumen", value: dash(pick(header, ["doc_no"])) },
                { label: "Tanggal", value: formatDate(pick(header, ["date"])) },
                { label: "Company Asal", value: dash(pick(header, ["company_before"])) },
                { label: "Lokasi Asal", value: dash(pick(header, ["location_before"])) },
                { label: "Pembuat", value: dash(pick(header, ["creator"])) },
                { label: "Status", value: <StatusBadge status={status} /> },
                { label: "Dibuat", value: formatDateTime(pick(header, ["created_at"])) },
              ]}
            />
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Aset yang Dimutasi ({details.length})
            </h3>
            <MiniTable
              columns={[
                { key: "AssetCode", header: "Kode Aset", render: (r) => dash(pick(r, ["AssetCode", "asset_code"])) },
                { key: "AssetName", header: "Nama Aset", render: (r) => dash(pick(r, ["AssetName", "asset_name"])) },
                { key: "category", header: "Kategori", render: (r) => dash(pick(r, ["category", "CategoryAsset"])) },
                {
                  key: "company_after",
                  header: "Company Tujuan",
                  render: (r) => dash(pick(r, ["company_after"])),
                },
                {
                  key: "location_after",
                  header: "Lokasi Tujuan",
                  render: (r) => dash(pick(r, ["location_after"])),
                },
                {
                  key: "mutation_purpose",
                  header: "Tujuan",
                  render: (r) => dash(pick(r, ["mutation_purpose"])),
                },
                {
                  key: "attachments",
                  header: "Lampiran",
                  render: (r) => {
                    const attachments = Array.isArray(r.attachments)
                      ? (r.attachments as Array<Record<string, unknown>>)
                      : [];
                    const first = attachments[0];
                    const url = first ? pick(first, ["url"]) : "";
                    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(url);
                    if (!first) return <span className="text-slate-400">—</span>;
                    return (
                      <div className="flex items-center gap-2">
                        {isImage ? (
                          <a href={url} target="_blank" rel="noreferrer" className="relative h-10 w-10 overflow-hidden rounded-md border border-slate-200">
                            <Image src={url} alt="Lampiran mutasi aset" fill sizes="40px" className="object-cover" />
                          </a>
                        ) : null}
                        <span className="text-xs text-slate-500">
                          {attachments.length} file{attachments.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    );
                  },
                },
              ]}
              rows={details}
              emptyText="Belum ada baris aset."
            />
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Riwayat Approval</h3>
            <Timeline
              entries={approvals.map((a) => ({
                title: dash(pick(a, ["action", "status", "note"])),
                meta: `${formatDateTime(pick(a, ["approved_at", "created_at"]))}${
                  pick(a, ["division_name"]) ? ` · ${pick(a, ["division_name"])}` : ""
                }`,
                body: dash(pick(a, ["approver", "fullname", "note"])),
              }))}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={approve.isPending}
      />
    </PageContainer>
  );
}
