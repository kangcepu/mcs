"use client";

import { CheckCircle2, Circle, Lock, LockOpen } from "lucide-react";
import { ReportView } from "@/components/reports/report-view";
import type { Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate } from "@/lib/report-columns";
import { formatNumber } from "@/lib/format";

type SoRow = Record<string, unknown>;

function num(row: SoRow, key: string): number {
  return Number(row[key] ?? 0) || 0;
}

/** Progres "dicek / total" sesuai tipe SO — Asset pakai pasangan asset_*, BOM pakai bom_*. */
function soProgress(row: SoRow): { checked: number; total: number } {
  const isBom = String(row.type ?? "").toUpperCase() === "BOM";
  return isBom
    ? { checked: num(row, "bom_checked"), total: num(row, "bom_total") }
    : { checked: num(row, "asset_checked"), total: num(row, "asset_total") };
}

const columns: Column<SoRow>[] = [
  {
    key: "no_so",
    header: "No. SO",
    cell: (row) => (
      <span className="font-medium text-slate-900">{String(row.no_so ?? "-")}</span>
    ),
  },
  {
    key: "tanggal",
    header: "Tanggal",
    cell: (row) => fmtDate(row.tanggal) || "-",
  },
  {
    key: "type",
    header: "Tipe",
    align: "center",
    cell: (row) => {
      const isBom = String(row.type ?? "").toUpperCase() === "BOM";
      return <StatusBadge status={isBom ? "BOM" : "Aset"} tone={isBom ? "violet" : "blue"} />;
    },
  },
  {
    key: "progress",
    header: "Dicek / Total",
    align: "center",
    cell: (row) => {
      const { checked, total } = soProgress(row);
      if (total === 0) {
        return <span className="text-xs text-slate-400">Belum diproses</span>;
      }
      const done = checked >= total;
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
            done ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
          {formatNumber(checked)} / {formatNumber(total)}
        </span>
      );
    },
  },
  {
    key: "locked_date",
    header: "Status Kunci",
    align: "center",
    cell: (row) => {
      const locked = fmtDate(row.locked_date);
      if (!locked) {
        return (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <LockOpen className="h-3.5 w-3.5" /> Belum dikunci
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
          <Lock className="h-3.5 w-3.5 text-slate-400" /> {locked}
        </span>
      );
    },
  },
];

export default function ReportStockOpnamePage() {
  return (
    <ReportView
      reportKey="stock-opname"
      title="Report Stock Opname"
      description="Rekap stock opname material/part. Klik baris untuk preview dokumen aslinya."
      filters={[
        { key: "date_from", type: "date", label: "Dari" },
        { key: "date_to", type: "date", label: "Sampai" },
        {
          key: "type",
          type: "select",
          label: "Semua tipe",
          options: [
            { value: "ASSET", label: "Asset" },
            { value: "BOM", label: "BOM" },
          ],
        },
        { key: "company", type: "text", label: "Company" },
      ]}
      columns={columns}
      summarize={(rows, meta) => {
        return [
          // Total hasil filter sebenarnya (server-side), bukan cuma halaman aktif.
          { label: "Total No. SO", value: formatNumber(meta?.total ?? rows.length) },
          {
            label: "Item Aset (halaman ini)",
            value: formatNumber(rows.reduce((s, r) => s + num(r, "asset_total"), 0)),
          },
          {
            label: "Item BOM (halaman ini)",
            value: formatNumber(rows.reduce((s, r) => s + num(r, "bom_total"), 0)),
          },
        ];
      }}
    />
  );
}
