"use client";

import { useEffect, useState } from "react";
import { Boxes, PackageSearch, QrCode } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/primitives";
import { BomQrPrintModal, QrPrintModal } from "@/components/reports/qr-print-modal";
import { useAssets } from "@/hooks/use-assets";
import { useBomQrList } from "@/hooks/use-reports";
import { useQueryParams } from "@/hooks/use-query-params";
import type { AssetListItem } from "@/types/asset";
import type { BomQrListItem } from "@/lib/api/reports";
import { pick } from "@/lib/display";

const PER_PAGE = 15;
const DEFAULTS = { q: "", page: 1, per_page: PER_PAGE };

export default function QrReportPage() {
  const [mode, setMode] = useState<"asset" | "bom">("asset");
  const [initialPartId, setInitialPartId] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partId = Number(params.get("part") ?? 0);
    if (params.get("mode") === "bom" || partId > 0) setMode("bom");
    if (Number.isSafeInteger(partId) && partId > 0) setInitialPartId(partId);
  }, []);
  return (
    <PageContainer title="Cetak QR" description="Cetak QR Asset atau label compact BOM / Part untuk alat kecil.">
      <div className="card flex flex-wrap gap-2 p-2">
        <Button variant={mode === "asset" ? "primary" : "ghost"} onClick={() => setMode("asset")}><Boxes className="h-4 w-4" /> Assets</Button>
        <Button variant={mode === "bom" ? "primary" : "ghost"} onClick={() => setMode("bom")}><PackageSearch className="h-4 w-4" /> BOM / Part</Button>
      </div>
      {mode === "asset" ? <AssetQrSection /> : <BomQrSection initialPartId={initialPartId} />}
    </PageContainer>
  );
}

function AssetQrSection() {
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const { data, isLoading, isFetching, error, refetch } = useAssets({ q: values.q, page: values.page, per_page: PER_PAGE, is_active: "1" });
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const [printCode, setPrintCode] = useState("");
  const columns: Column<AssetListItem>[] = [
    { key: "asset_code", header: "Kode Aset", width: "180px", cell: (r) => <span className="font-medium text-brand-700">{pick(r, ["AssetCode", "asset_code"])}</span> },
    { key: "asset_name", header: "Nama Aset", cell: (r) => <span className="text-slate-800">{pick(r, ["AssetName", "asset_name"]) || "-"}</span> },
    { key: "company", header: "Company", cell: (r) => pick(r, ["CompanyName", "company_name", "company"]) || "-" },
    { key: "location", header: "Lokasi", cell: (r) => pick(r, ["LocationAsset", "location_name", "location"]) || "-" },
    { key: "action", header: "", align: "right", width: "130px", cell: (r) => { const code = String(pick(r, ["AssetCode", "asset_code"])); return <Button variant="secondary" onClick={(event) => { event.stopPropagation(); setPrintCode(code); }}><QrCode className="h-4 w-4" /> Cetak QR</Button>; } },
  ];
  return <div className="space-y-4">
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Label Asset tetap menggunakan desain 60 × 30 mm dengan logo perusahaan dan Asset Code.</div>
    <FilterBar search={values.q} onSearchChange={(q) => setValues({ q }, { resetPage: true })} searchPlaceholder="Cari kode, nama, atau company aset…" onRefresh={() => refetch()} isFetching={isFetching} onReset={reset} hasActiveFilters={hasActiveFilters} />
    <DataTable columns={columns} data={rows} rowKey={(r, i) => String(pick(r, ["AssetCode", "asset_code"]) || i)} isLoading={isLoading} isFetching={isFetching && !isLoading} error={error} onRetry={() => refetch()} onRowClick={(r) => setPrintCode(String(pick(r, ["AssetCode", "asset_code"])))} emptyTitle="Aset tidak ditemukan" emptyDescription="Coba ubah kata kunci pencarian." />
    {rows.length > 0 ? <div className="card"><Pagination meta={meta} page={values.page} perPage={PER_PAGE} onPageChange={(page) => setValues({ page })} /></div> : null}
    {printCode ? <QrPrintModal assetCode={printCode} onClose={() => setPrintCode("")} /> : null}
  </div>;
}

function BomQrSection({ initialPartId = 0 }: { initialPartId?: number }) {
  // Pencarian BOM sengaja lokal. Menulis setiap kata kunci ke URL melalui
  // router.replace memicu navigasi Next.js dan membuat tabel terlihat refresh.
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useBomQrList({ q: search, page, per_page: PER_PAGE });
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const [printPartId, setPrintPartId] = useState(0);
  useEffect(() => {
    if (initialPartId > 0) setPrintPartId(initialPartId);
  }, [initialPartId]);
  const columns: Column<BomQrListItem>[] = [
    { key: "tool_code", header: "Kode QR", width: "150px", cell: (r) => <span className="font-semibold text-brand-700">{r.tool_code}</span> },
    { key: "part_name", header: "BOM / Part", cell: (r) => <div><p className="font-medium text-slate-800">{r.part_name || "-"}</p>{r.header ? <p className="text-xs text-slate-400">{r.header}</p> : null}</div> },
    { key: "asset", header: "Asset Induk", cell: (r) => <div><p>{r.asset_code || "-"}</p><p className="text-xs text-slate-400">{r.asset_name || "-"}</p></div> },
    { key: "stock", header: "Stok", align: "right", width: "110px", cell: (r) => `${r.qty_on_hand ?? 0} ${r.uom ?? ""}`.trim() },
    { key: "status", header: "Status", align: "center", width: "100px", cell: (r) => Number(r.is_active ?? 1) === 1 ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Aktif</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">Nonaktif</span> },
    { key: "action", header: "", align: "right", width: "140px", cell: (r) => <Button variant="secondary" onClick={(event) => { event.stopPropagation(); setPrintPartId(Number(r.part_id)); }}><QrCode className="h-4 w-4" /> Cetak QR</Button> },
  ];
  return <div className="space-y-4">
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Format NIIMBOT B18: label 50 × 12 mm dengan payload QR compact. QR dibuat sebesar mungkin agar tetap mudah dipindai.</div>
    <FilterBar search={search} onSearchChange={(q) => { setSearch(q); setPage(1); }} searchPlaceholder="Cari nama part, Asset Code, atau company…" onRefresh={() => refetch()} isFetching={isFetching} onReset={() => { setSearch(""); setPage(1); }} hasActiveFilters={Boolean(search)} />
    <DataTable columns={columns} data={rows} rowKey={(r) => r.part_id} isLoading={isLoading} error={error} onRetry={() => refetch()} onRowClick={(r) => setPrintPartId(Number(r.part_id))} emptyTitle="BOM / Part tidak ditemukan" emptyDescription="Tambahkan Parts / BOM pada detail Asset atau ubah pencarian." />
    {rows.length > 0 ? <div className="card"><Pagination meta={meta} page={page} perPage={PER_PAGE} onPageChange={setPage} /></div> : null}
    {printPartId > 0 ? <BomQrPrintModal partId={printPartId} onClose={() => setPrintPartId(0)} /> : null}
  </div>;
}
