"use client";

import { ReportView } from "@/components/reports/report-view";
import { formatNumber } from "@/lib/format";

export default function ReportAssetsPage() {
  return (
    <ReportView
      reportKey="assets"
      title="Report Assets"
      description="Laporan aset berdasarkan company, lokasi, kategori, dan status."
      filters={[
        { key: "company", type: "text", label: "Company" },
        { key: "location", type: "text", label: "Lokasi" },
        { key: "category", type: "text", label: "Kategori" },
        {
          key: "status",
          type: "select",
          label: "Status",
          options: [
            { value: "active", label: "Aktif" },
            { value: "inactive", label: "Nonaktif" },
          ],
        },
      ]}
      summarize={(rows) => [
        { label: "Total Baris", value: formatNumber(rows.length) },
        {
          label: "Aktif",
          value: formatNumber(
            rows.filter(
              (r) =>
                r.is_active === true ||
                String(r.active ?? r.status ?? "").toLowerCase() === "active",
            ).length,
          ),
        },
      ]}
    />
  );
}
