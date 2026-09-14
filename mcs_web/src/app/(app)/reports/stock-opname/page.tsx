"use client";

import { ReportView } from "@/components/reports/report-view";
import { formatNumber } from "@/lib/format";

export default function ReportStockOpnamePage() {
  return (
    <ReportView
      reportKey="stock-opname"
      title="Report Stock Opname"
      description="Rekap stock opname material/part."
      filters={[
        { key: "date_from", type: "date", label: "Dari" },
        { key: "date_to", type: "date", label: "Sampai" },
        { key: "company", type: "text", label: "Company" },
      ]}
      summarize={(rows) => {
        const num = (r: Record<string, unknown>, k: string) => Number(r[k] ?? 0) || 0;
        return [
          { label: "Total No. SO", value: formatNumber(rows.length) },
          {
            label: "Item Aset",
            value: formatNumber(rows.reduce((s, r) => s + num(r, "asset_total"), 0)),
          },
          {
            label: "Item BOM",
            value: formatNumber(rows.reduce((s, r) => s + num(r, "bom_total"), 0)),
          },
        ];
      }}
    />
  );
}
