"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field } from "@/components/ui/primitives";
import { AssetPicker } from "@/components/assets/asset-picker";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import { useAssetHistoryReport } from "@/hooks/use-reports";
import { fetchAllAssetHistoryRows } from "@/lib/api/reports";
import { exportToCsv, inferColumns } from "@/lib/csv";
import { printReportPdf } from "@/lib/print-report";
import { REPORT_COLUMN_PRESETS } from "@/lib/report-columns";
import { ApiError } from "@/types/api";
import { dash } from "@/lib/display";

const HISTORY_COLS = REPORT_COLUMN_PRESETS["assets-history"]!;

export default function AssetHistoryReportPage() {
  const toast = useToast();
  const { data: me } = useMe();
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [busy, setBusy] = useState<null | "csv" | "pdf">(null);

  const { data, isLoading, error, refetch, isFetching } = useAssetHistoryReport(
    assetCode,
    {},
  );
  const rows = (data?.data ?? []) as Array<Record<string, unknown>>;

  const columns: Column<Record<string, unknown>>[] = HISTORY_COLS.columns.map(
    (c) => ({
      key: c.key,
      header: c.header,
      cell: (row) => (c.render ? c.render(row) || "-" : dash(row[c.key])),
    }),
  );

  const collectAll = () => fetchAllAssetHistoryRows(assetCode, {});

  const onExportCsv = async () => {
    setBusy("csv");
    try {
      const all = await collectAll();
      if (all.length === 0) {
        toast.error("Tidak ada data untuk diekspor");
        return;
      }
      exportToCsv(`asset-history-${assetCode}`, all, inferColumns(all));
    } catch (e) {
      toast.error("Gagal ekspor", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const onPrintPdf = async () => {
    setBusy("pdf");
    try {
      const all = await collectAll();
      printReportPdf({
        title: "Asset History",
        subtitle: `Riwayat aktivitas aset ${assetName || assetCode}`,
        meta: [
          { label: "Aset", value: [assetName, assetCode].filter(Boolean).join(" · ") },
          { label: "Total baris", value: String(all.length) },
        ],
        columns: HISTORY_COLS.columns,
        rows: all,
        orientation: HISTORY_COLS.orientation,
        printedBy: me?.fullname,
      });
    } catch (e) {
      toast.error(
        "Gagal menyiapkan PDF",
        e instanceof ApiError ? e.message : undefined,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageContainer
      title="Asset History"
      description="Cari berdasarkan kode atau nama aset untuk menampilkan riwayat pekerjaan."
      actions={
        rows.length > 0 ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onExportCsv}
              loading={busy === "csv"}
              disabled={busy !== null}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="secondary"
              onClick={onPrintPdf}
              loading={busy === "pdf"}
              disabled={busy !== null}
            >
              <FileText className="h-4 w-4" />
              Cetak / PDF
            </Button>
          </div>
        ) : null
      }
    >
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[280px] flex-1">
          <Field
            label="Pilih Aset"
            required
            hint={assetCode ? "Riwayat dimuat untuk aset yang dipilih." : "Ketik nama atau kode, lalu pilih aset dari daftar."}
          >
            <AssetPicker
              selectedName={assetName}
              selectedCode={assetCode}
              placeholder="Ketik nama atau kode aset…"
              autoFocus
              includeInactive
              onSelect={(code, name) => {
                setAssetCode(code);
                setAssetName(name);
              }}
              onClear={() => {
                setAssetCode("");
                setAssetName("");
              }}
            />
          </Field>
        </div>
        {assetCode ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            loading={isFetching}
          >
            Muat ulang
          </Button>
        ) : null}
      </div>

      {!assetCode ? (
        <EmptyState
          title="Belum ada aset dipilih"
          description="Ketik nama atau kode aset, lalu pilih salah satu dari daftar."
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(_r, i) => i}
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          emptyTitle="Tidak ada riwayat"
          emptyDescription={`Tidak ditemukan riwayat untuk aset ${assetName || assetCode}.`}
        />
      )}
    </PageContainer>
  );
}
