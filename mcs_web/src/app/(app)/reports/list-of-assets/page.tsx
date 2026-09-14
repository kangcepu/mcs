"use client";

import { ReportView } from "@/components/reports/report-view";
import { formatNumber } from "@/lib/format";

export default function ListOfAssetsPage() {
  return (
    <ReportView
      reportKey="list-of-assets"
      title="List Of Asset"
      description="Daftar lengkap aset untuk kebutuhan audit dan rekonsiliasi."
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
        { label: "Total Aset", value: formatNumber(rows.length) },
        {
          label: "Nonaktif",
          value: formatNumber(
            rows.filter(
              (r) => String(r.active ?? r.status ?? "").toLowerCase() === "inactive",
            ).length,
          ),
        },
      ]}
    />
  );
}
