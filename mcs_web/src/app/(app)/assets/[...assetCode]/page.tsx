"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Power, RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { DescriptionList, Timeline } from "@/components/ui/detail";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useCan } from "@/components/ui/permission-guard";
import { useAssetDetail, useAssetMutations } from "@/hooks/use-assets";
import { useToast } from "@/components/ui/toast";
import { PERMISSIONS } from "@/lib/permissions";
import { ApiError } from "@/types/api";
import { formatDate } from "@/lib/format";
import { dash, isAssetInactive, pick } from "@/lib/display";

// Semua tab berikut memiliki query/media sendiri. Pecah dari bundle detail awal
// sehingga tab General yang paling sering dibuka bisa tampil lebih cepat.
const BomPartsPanel = dynamic(() => import("@/components/assets/bom-parts-panel").then((m) => m.BomPartsPanel), { ssr: false });
const CustomDetailTab = dynamic(() => import("@/components/assets/custom-detail-tab").then((m) => m.CustomDetailTab), { ssr: false });
const GalleryTab = dynamic(() => import("@/components/assets/gallery-tab").then((m) => m.GalleryTab), { ssr: false });
const AssetFormModal = dynamic(() => import("@/components/assets/asset-form").then((m) => m.AssetFormModal), { ssr: false });

const TABS = [
  { key: "general", label: "General" },
  { key: "bom", label: "Parts / BOM" },
  { key: "custom", label: "Custom Detail" },
  { key: "gallery", label: "Attachment / Gallery" },
  { key: "history", label: "History" },
];

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetCode: string[] }>;
}) {
  const { assetCode } = use(params);
  const code = assetCode.map(decodeURIComponent).join("/");

  const toast = useToast();
  const canWrite = useCan(PERMISSIONS.privilageAsset);
  const [tab, setTab] = useState("general");
  const [editOpen, setEditOpen] = useState(false);
  const confirm = useConfirm();

  const { data, isLoading, error, refetch, isFetching } = useAssetDetail(code);
  // Backend GET /assets/detail nge-spread field aset langsung di `data`
  // (bukan dibungkus `data.asset`) — sebelumnya selalu dianggap "aset gak
  // ketemu" walau request-nya sukses.
  const detail = data?.data as
    | (Record<string, unknown> & {
        history?: Array<Record<string, unknown>>;
      })
    | undefined;
  const asset = detail;
  const { setStatus } = useAssetMutations(code);

  // Backend belum ngirim riwayat WO per-aset — tab History kosong buat
  // sementara sampai endpoint-nya ada, bukan kesalahan tampilan.
  const history = detail?.history ?? [];

  const inactive = isAssetInactive(asset);
  const assetName = pick(asset ?? {}, ["AssetName", "asset_name", "name"]) || code;

  const askToggleStatus = () => {
    if (!asset) return;
    const nextActive = inactive; // saat ini nonaktif -> aksinya "aktifkan"
    confirm.ask({
      title: nextActive ? "Aktifkan aset?" : "Nonaktifkan aset?",
      description: nextActive
        ? "Aset akan kembali muncul sebagai aset aktif."
        : "Aset tidak akan bisa dipilih pada work order baru. Aset tidak dihapus permanen.",
      tone: nextActive ? "primary" : "danger",
      confirmLabel: nextActive ? "Aktifkan" : "Nonaktifkan",
      onConfirm: async () => {
        try {
          await setStatus.mutateAsync({ asset: code, is_active: nextActive });
          toast.success("Status diperbarui");
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
        <BackLink fallbackHref="/assets">Kembali ke Aset</BackLink>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {assetName}
          {asset ? (
            <StatusBadge
              status={inactive ? "inactive" : "active"}
              tone={inactive ? "slate" : "green"}
            />
          ) : null}
        </span>
      }
      headerTitle={assetName}
      description={code}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {canWrite && asset ? (
            <>
              <Button variant="secondary" onClick={askToggleStatus}>
                <Power className="h-4 w-4" />
                {inactive ? "Aktifkan" : "Nonaktifkan"}
              </Button>
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Ubah
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !asset ? (
        <ErrorState error={new Error("Aset tidak ditemukan.")} />
      ) : (
        <>
          <Tabs items={TABS} value={tab} onChange={setTab} />

          {tab === "general" && (
            <div className="card p-5">
              <DescriptionList
                columns={3}
                items={[
                  { label: "Kode Aset", value: pick(asset, ["AssetCode", "asset_code"]) },
                  { label: "Nama Aset", value: assetName },
                  { label: "Alias", value: dash(pick(asset, ["AliasName", "alias_name"])) },
                  { label: "Company", value: pick(asset, ["CompanyName", "company_name"]) },
                  { label: "Lokasi", value: pick(asset, ["LocationAsset", "location_name"]) },
                  { label: "Kategori", value: pick(asset, ["CategoryAsset", "category_name"]) },
                  { label: "Merek", value: dash(asset.brand) },
                  {
                    label: "No. Seri / Remarks",
                    value: dash(pick(asset, ["Remarks", "serial_number"])),
                  },
                  { label: "Status", value: inactive ? "Nonaktif" : "Aktif" },
                ]}
              />
              {pick(asset, ["Keterangan", "description"]) ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Keterangan
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">
                    {pick(asset, ["Keterangan", "description"])}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {tab === "bom" && (
            <div className="card p-5">
              <BomPartsPanel assetCode={code} canWrite={canWrite} />
            </div>
          )}

          {tab === "custom" && (
            <CustomDetailTab assetCode={code} canWrite={canWrite} />
          )}

          {tab === "gallery" && (
            <GalleryTab assetCode={code} canWrite={canWrite} />
          )}

          {tab === "history" && (
            <div className="card p-5">
              <Timeline
                entries={history.map((h) => ({
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      {dash(pick(h, ["action", "job_title"]))}
                      {h.status ? <StatusBadge status={h.status as string} /> : null}
                    </span>
                  ),
                  meta: `${formatDate(h.at as string)}${
                    h.module ? ` · ${h.module}` : ""
                  }`,
                  body: h.wo_number ? (
                    <span className="text-xs text-slate-500">WO {String(h.wo_number)}</span>
                  ) : null,
                }))}
              />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={setStatus.isPending}
      />
      {editOpen ? (
        <AssetFormModal
          open
          onClose={() => setEditOpen(false)}
          mode="edit"
          assetCode={code}
          initial={asset}
        />
      ) : null}
    </PageContainer>
  );
}
