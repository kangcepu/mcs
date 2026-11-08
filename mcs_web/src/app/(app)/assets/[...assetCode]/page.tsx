"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRightLeft, Pencil, Power, RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BackLink } from "@/components/ui/back-link";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, Card } from "@/components/ui/primitives";
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
import { ENERGY_MODULE_ENABLED } from "@/lib/env";
import type { EnergyAssetProfile } from "@/types/energy";
import type { FleetProfile } from "@/types/fleet";

// Semua tab berikut memiliki query/media sendiri. Pecah dari bundle detail awal
// sehingga tab General yang paling sering dibuka bisa tampil lebih cepat.
const BomPartsPanel = dynamic(() => import("@/components/assets/bom-parts-panel").then((m) => m.BomPartsPanel), { ssr: false });
const CustomDetailTab = dynamic(() => import("@/components/assets/custom-detail-tab").then((m) => m.CustomDetailTab), { ssr: false });
const GalleryTab = dynamic(() => import("@/components/assets/gallery-tab").then((m) => m.GalleryTab), { ssr: false });
const ChildAssetsPanel = dynamic(() => import("@/components/assets/child-assets-panel").then((m) => m.ChildAssetsPanel), { ssr: false });
const MoveChildAssetModal = dynamic(() => import("@/components/assets/move-child-asset-modal").then((m) => m.MoveChildAssetModal), { ssr: false });
const AssetFormModal = dynamic(() => import("@/components/assets/asset-form").then((m) => m.AssetFormModal), { ssr: false });
const EnergyProfilePanel = dynamic(() => import("@/components/energy/energy-profile-panel").then((m) => m.EnergyProfilePanel), { ssr: false });

const BASE_TABS = [
  { key: "general", label: "General" },
  { key: "bom", label: "Parts / BOM" },
  { key: "related", label: "Aset Terkait" },
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
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const returnHref = from ? `/assets?${decodeURIComponent(from)}` : undefined;

  const toast = useToast();
  const canWrite = useCan(PERMISSIONS.privilageAsset);
  const [tab, setTab] = useState("general");
  const [editOpen, setEditOpen] = useState(false);
  const [moveParentOpen, setMoveParentOpen] = useState(false);
  const confirm = useConfirm();

  const { data, isLoading, error, refetch, isFetching } = useAssetDetail(code);
  // Backend GET /assets/detail nge-spread field aset langsung di `data`
  // (bukan dibungkus `data.asset`) — sebelumnya selalu dianggap "aset gak
  // ketemu" walau request-nya sukses.
  const detail = data?.data as
    | (Record<string, unknown> & {
        history?: Array<Record<string, unknown>>;
        location_history?: Array<Record<string, unknown>>;
      })
    | undefined;
  const asset = detail;
  const { setStatus } = useAssetMutations(code);

  const history = detail?.history ?? [];
  const locationHistory = detail?.location_history ?? [];
  const energyProfile = ENERGY_MODULE_ENABLED
    ? (detail?.energy_profile as EnergyAssetProfile | null | undefined)
    : null;
  const fleetProfile = detail?.fleet_profile as FleetProfile | null | undefined;
  const extensionTabs = [
    ...(energyProfile ? [{ key: "energy", label: "Profil Energy" }] : []),
    ...(fleetProfile ? [{ key: "fleet", label: "Profil Fleet" }] : []),
  ];
  const tabs = extensionTabs.length ? [BASE_TABS[0]!, ...extensionTabs, ...BASE_TABS.slice(1)] : BASE_TABS;

  const inactive = isAssetInactive(asset);
  const assetName = pick(asset ?? {}, ["AssetName", "asset_name", "name"]) || code;
  const parentCode = String(asset?.parent_asset_code ?? "");
  const parentHref = parentCode
    ? `/assets/${parentCode.split("/").map(encodeURIComponent).join("/")}`
    : "";

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
        <BackLink fallbackHref="/assets" returnHref={returnHref}>Kembali ke Aset</BackLink>
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
          <Tabs items={tabs} value={tab} onChange={setTab} />

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
              {parentCode ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  <span>
                    Berada di dalam:{" "}
                    <Link href={parentHref} className="font-semibold hover:underline">
                      {String(asset.parent_asset_name || parentCode)}
                    </Link>
                    <span className="ml-1 text-xs text-brand-600">({parentCode})</span>
                  </span>
                  {canWrite ? (
                    <Button variant="ghost" className="h-8 bg-white/70" onClick={() => setMoveParentOpen(true)}>
                      <ArrowRightLeft className="h-4 w-4" /> Mutasi / Pindah
                    </Button>
                  ) : null}
                </div>
              ) : null}
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

          {tab === "energy" && energyProfile ? (
            <EnergyProfilePanel
              profile={energyProfile}
              canWrite={canWrite}
              onChanged={() => void refetch()}
            />
          ) : null}

          {tab === "fleet" && fleetProfile ? (
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <DescriptionList columns={3} items={[
                  { label: "Jenis", value: fleetProfile.vehicle_type === "FORKLIFT" ? "Forklift" : "Kendaraan" },
                  { label: "Nomor registrasi", value: fleetProfile.registration_number || "-" },
                  { label: "Odometer / Hour meter", value: `${Number(fleetProfile.current_meter).toLocaleString("id-ID")} ${fleetProfile.meter_type === "ODOMETER" ? "km" : "jam"}` },
                  { label: "Merek / model", value: [fleetProfile.make, fleetProfile.model].filter(Boolean).join(" ") || "-" },
                  { label: "Status inspeksi", value: fleetProfile.inspection_due ? "Jatuh tempo" : "Terjadwal" },
                  { label: "Status preventive", value: fleetProfile.preventive_due ? "Jatuh tempo" : "Terjadwal" },
                ]}/>
                <Link href="/fleet" className="btn-secondary shrink-0">Buka Fleet & Vehicle</Link>
              </div>
            </Card>
          ) : null}

          {tab === "bom" && (
            <div className="card p-5">
              <BomPartsPanel assetCode={code} canWrite={canWrite} />
            </div>
          )}

          {tab === "related" && (
            <div className="card p-5">
              <ChildAssetsPanel
                assetCode={code}
                assetChildren={(asset.children as NonNullable<import("@/types/asset").AssetDetail["children"]> | undefined) ?? []}
                relatedGroups={(asset.related_groups as NonNullable<import("@/types/asset").AssetDetail["related_groups"]> | undefined) ?? []}
                canWrite={canWrite}
              />
            </div>
          )}

          {tab === "custom" && (
            <CustomDetailTab assetCode={code} canWrite={canWrite} />
          )}

          {tab === "gallery" && (
            <GalleryTab assetCode={code} canWrite={canWrite} />
          )}

          {tab === "history" && (
            <div className="space-y-4">
              <section className="card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-slate-800">Riwayat Lokasi</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Jejak ruangan/lokasi yang pernah ditempati aset ini.
                  </p>
                </div>
                <Timeline
                  entries={locationHistory.map((h) => {
                    const from = dash(pick(h, ["location_from"]));
                    const to = dash(pick(h, ["location_to"]));
                    const initial = String(h.event_type ?? "").toUpperCase() === "INITIAL";
                    const companies = [
                      pick(h, ["company_from"]),
                      pick(h, ["company_to"]),
                    ].filter(Boolean);
                    return {
                      title: initial ? `Lokasi awal: ${to}` : `${from} → ${to}`,
                      meta: `${formatDate(h.moved_at as string)}${
                        h.changed_by ? ` · ${String(h.changed_by)}` : ""
                      }`,
                      body: (
                        <span className="text-xs text-slate-500">
                          {companies.length ? `Company: ${companies.join(" → ")}` : ""}
                          {h.reference_no ? `${companies.length ? " · " : ""}Ref: ${String(h.reference_no)}` : ""}
                          {h.note ? `${companies.length || h.reference_no ? " · " : ""}${String(h.note)}` : ""}
                        </span>
                      ),
                    };
                  })}
                />
              </section>

              <section className="card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-slate-800">Riwayat Pekerjaan</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Seluruh work order yang pernah terkait dengan aset ini.
                  </p>
                </div>
                <Timeline
                  entries={history.map((h) => ({
                    title: (
                      <span className="flex flex-wrap items-center gap-2">
                        {dash(pick(h, ["job_title"]))}
                        {h.status ? <StatusBadge status={h.status as string} /> : null}
                      </span>
                    ),
                    meta: `${formatDate(h.created_at as string)}${
                      h.wo_source ? ` · ${h.wo_source}` : ""
                    }`,
                    body: h.wo_number ? (
                      <span className="text-xs text-slate-500">WO {String(h.wo_number)}</span>
                    ) : null,
                  }))}
                />
              </section>
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
      {moveParentOpen && parentCode ? (
        <MoveChildAssetModal
          childCode={code}
          childName={assetName}
          currentParentCode={parentCode}
          onClose={() => setMoveParentOpen(false)}
        />
      ) : null}
    </PageContainer>
  );
}
