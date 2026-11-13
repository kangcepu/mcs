"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, PackageSearch, Printer } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { BomQrPrintModal } from "@/components/reports/qr-print-modal";
import { Button } from "@/components/ui/primitives";
import { ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useBomQrReport } from "@/hooks/use-reports";

export default function BomQrDetailPage() {
  const params = useParams<{ partId: string }>();
  const partId = Number(params.partId ?? 0);
  const { data, isLoading, error, refetch } = useBomQrReport(partId);
  const item = data?.data;
  const [printOpen, setPrintOpen] = useState(false);

  return (
    <PageContainer title="Detail BOM / Part" description="Informasi item dari hasil pemindaian QR.">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/reports/qr?mode=bom" className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar BOM / Part
        </Link>
        {item ? <Button onClick={() => setPrintOpen(true)}><Printer className="h-4 w-4" /> Cetak QR</Button> : null}
      </div>

      {isLoading ? <LoadingSkeleton rows={5} /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !item ? (
        <ErrorState error={new Error("BOM / Part tidak ditemukan.")} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-start gap-4 border-b border-slate-100 p-5">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><PackageSearch className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.tool_code}</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{item.part_name || item.header || "BOM / Part"}</h2>
              {item.header ? <p className="mt-1 text-sm text-slate-500">{item.header}</p> : null}
            </div>
          </div>
          <dl className="grid gap-px bg-slate-100 sm:grid-cols-2">
            <Detail label="Asset induk" value={item.asset_code || "Belum tertaut ke Asset"} />
            <Detail label="Nama asset" value={item.asset_name || "-"} />
            <Detail label="Company" value={item.company || "-"} />
            <Detail label="Stok" value={`${item.qty_on_hand ?? 0} ${item.uom ?? ""}`.trim()} />
            <Detail label="Status" value={Number(item.is_active ?? 1) === 1 ? "Aktif" : "Nonaktif"} />
            <Detail label="Kode QR" value={item.tool_code || `BOM-${String(partId).padStart(6, "0")}`} />
          </dl>
        </div>
      )}

      {printOpen ? <BomQrPrintModal partId={partId} onClose={() => setPrintOpen(false)} /> : null}
    </PageContainer>
  );
}

function Detail({ label, value }: { label: string; value: unknown }) {
  return <div className="bg-white px-5 py-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{String(value)}</dd></div>;
}
