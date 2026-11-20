"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, UserRoundX, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { useAssetPicSummary } from "@/hooks/use-assets";
import type { AssetPicSummaryRow } from "@/types/asset";

export default function AssetPicSummaryPage() {
  const router = useRouter();
  const query = useAssetPicSummary();
  const rows = query.data?.data.rows ?? [];
  const missing = query.data?.data.missing_pic ?? 0;
  const columns: Column<AssetPicSummaryRow>[] = [
    { key: "pic", header: "PIC Utama", cell: (r) => <div><p className="font-medium text-slate-800">{r.pic_name}</p><p className="text-xs text-slate-400">{r.username}{r.division ? ` · ${r.division}` : ""}</p></div> },
    { key: "total", header: "Total Aset", align: "right", cell: (r) => Number(r.total_assets).toLocaleString("id-ID") },
    { key: "active", header: "Aktif", align: "right", cell: (r) => Number(r.active_assets).toLocaleString("id-ID") },
    { key: "inventory", header: "Inventory IT", align: "right", cell: (r) => Number(r.inventory_it_assets).toLocaleString("id-ID") },
    { key: "disabled", header: "Disabled", align: "right", cell: (r) => Number(r.disabled_assets).toLocaleString("id-ID") },
  ];

  return <PageContainer title="Aset per PIC" description="Ringkasan kepemilikan dan tanggung jawab aset per user."
    actions={<Button variant="secondary" onClick={() => router.push("/assets")}><ArrowLeft className="h-4 w-4" />Kembali ke Aset</Button>}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-brand-600" /><div><p className="text-xs text-slate-500">PIC terdaftar</p><p className="text-xl font-semibold text-slate-900">{rows.length.toLocaleString("id-ID")}</p></div></Card>
      <button type="button" onClick={() => router.push("/assets?scope=missing_pic")} className="text-left"><Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4"><UserRoundX className="h-5 w-5 text-amber-700" /><div><p className="text-xs text-amber-700">Aset aktif belum punya PIC</p><p className="text-xl font-semibold text-amber-900">{Number(missing).toLocaleString("id-ID")}</p></div></Card></button>
    </div>
    {query.isLoading ? <LoadingSkeleton rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : rows.length ? <DataTable columns={columns} data={rows} rowKey={(row) => row.pic_user_id} onRowClick={(row) => router.push(`/assets?pic_user_id=${row.pic_user_id}`)} /> : <EmptyState title="Belum ada PIC aset" description="Tetapkan PIC utama pada aset untuk membentuk ringkasan." />}
  </PageContainer>;
}
