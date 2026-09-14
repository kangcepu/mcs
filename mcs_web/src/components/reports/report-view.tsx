"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterDate, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import { useReport } from "@/hooks/use-reports";
import { useQueryParams } from "@/hooks/use-query-params";
import { fetchAllReportRows, getStockOpnamePdf } from "@/lib/api/reports";
import { DEFAULT_PER_PAGE, ApiError } from "@/types/api";
import { exportToCsv, inferColumns } from "@/lib/csv";
import { printReportPdf } from "@/lib/print-report";
import { REPORT_COLUMN_PRESETS, type ReportCol } from "@/lib/report-columns";
import { formatNumber } from "@/lib/format";
import { dash } from "@/lib/display";

type ReportKey = "assets" | "stock-opname" | "list-of-assets" | "recap-work-orders";

export interface ReportFilterConfig {
  key: string;
  type: "date" | "text" | "select";
  label: string;
  options?: { value: string; label: string }[];
}

const BASE_DEFAULTS = {
  q: "",
  date_from: "",
  date_to: "",
  company: "",
  location: "",
  category: "",
  status: "",
  module: "",
  type_wo: "",
  priority: "",
  shift: "",
  id_division: "",
  job_executor: "",
  asset: "",
  asset_id: "",
  executor: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

export function ReportView({
  reportKey,
  title,
  description,
  filters: filterConfig,
  summarize,
}: {
  reportKey: ReportKey;
  title: string;
  description?: string;
  filters: ReportFilterConfig[];
  /** Hitung tile ringkasan DARI baris hasil filter aktif (harus konsisten dgn tabel). */
  summarize?: (rows: Array<Record<string, unknown>>) => { label: string; value: string }[];
}) {
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(BASE_DEFAULTS);
  const toast = useToast();
  const { data: me } = useMe();
  const [busy, setBusy] = useState<null | "csv" | "pdf">(null);
  const [selectedSo, setSelectedSo] = useState<Record<string, unknown> | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const soPreviewRequest = useRef(0);

  // Hanya kirim param yang relevan untuk report ini.
  const activeParams = useMemo(() => {
    const p: Record<string, string | number> = {
      page: values.page,
      per_page: values.per_page,
    };
    const vals = values as unknown as Record<string, string>;
    for (const f of filterConfig) {
      const v = vals[f.key];
      if (v) p[f.key] = v;
    }
    if (values.q) p.q = values.q;
    return p;
  }, [values, filterConfig]);

  const { data, isLoading, isFetching, error, refetch } = useReport(
    reportKey,
    activeParams,
  );

  const rows = useMemo(
    () => (data?.data ?? []) as Array<Record<string, unknown>>,
    [data],
  );

  // Param non-paginasi dipakai hanya ketika user benar-benar export/cetak.
  // Jangan mengambil seluruh laporan di background hanya untuk tile ringkasan.
  const filterOnlyParams = useMemo(() => {
    const { page: _p, per_page: _pp, ...rest } = activeParams;
    void _p;
    void _pp;
    return rest;
  }, [activeParams]);

  // Ringkasan halaman aktif tersedia langsung bersama tabel. Full dataset hanya
  // dimuat saat export/cetak agar halaman report tidak membebani API/database.
  const summaryRows = rows;

  const preset = REPORT_COLUMN_PRESETS[reportKey];

  /** Kolom terkurasi (preset) bila ada; kalau tidak, infer dari data (dibatasi). */
  const pdfColumns = useMemo<ReportCol[]>(() => {
    if (preset) return preset.columns;
    return inferColumns(rows).slice(0, 14);
  }, [preset, rows]);

  const closeStockOpnamePreview = useCallback(() => {
    soPreviewRequest.current += 1;
    setSelectedSo(null);
    setIsPreviewLoading(false);
    setPreviewPdfUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  useEffect(() => () => {
    soPreviewRequest.current += 1;
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
  }, [previewPdfUrl]);

  const onPreviewStockOpname = useCallback(async (row: Record<string, unknown>) => {
    const noSo = String(row.no_so ?? "");
    if (!noSo) return;
    const requestId = soPreviewRequest.current + 1;
    soPreviewRequest.current = requestId;
    setSelectedSo(row);
    setIsPreviewLoading(true);
    setPreviewPdfUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    try {
      const pdf = await getStockOpnamePdf(noSo);
      const url = URL.createObjectURL(pdf);
      if (soPreviewRequest.current === requestId) setPreviewPdfUrl(url);
      else URL.revokeObjectURL(url);
    } catch (e) {
      if (soPreviewRequest.current === requestId) {
        toast.error("Gagal memuat preview Stock Opname", e instanceof Error ? e.message : undefined);
      }
    } finally {
      if (soPreviewRequest.current === requestId) setIsPreviewLoading(false);
    }
  }, [toast]);

  const columns = useMemo<Column<Record<string, unknown>>[]>(() => {
    return pdfColumns.map((c) => ({
      key: c.key,
      header: c.header,
      align: c.align === "right" || c.align === "center" ? c.align : undefined,
      cell: (row) => {
        if (c.render) return c.render(row) || "-";
        const v = row[c.key];
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return dash(v);
      },
    }));
  }, [pdfColumns]);

  const tiles = summarize ? summarize(summaryRows) : [];

  /** Ambil seluruh baris (semua halaman) sesuai filter aktif. */
  const collectAll = (): Promise<Array<Record<string, unknown>>> =>
    fetchAllReportRows(reportKey, filterOnlyParams);

  /** Baris meta untuk header PDF: filter aktif + tile ringkasan. */
  const buildMeta = (all: Array<Record<string, unknown>>) => {
    const m: { label: string; value: string }[] = [];
    if (values.q) m.push({ label: "Cari", value: values.q });
    for (const f of filterConfig) {
      const v = (values as unknown as Record<string, string>)[f.key];
      if (v) {
        const opt = f.options?.find((o) => o.value === v);
        m.push({ label: f.label, value: opt?.label ?? v });
      }
    }
    for (const t of summarize?.(all) ?? []) m.push({ label: t.label, value: t.value });
    return m;
  };

  const onExportCsv = async () => {
    setBusy("csv");
    try {
      const all = await collectAll();
      if (all.length === 0) {
        toast.error("Tidak ada data untuk diekspor");
        return;
      }
      exportToCsv(
        `${reportKey}-${new Date().toISOString().slice(0, 10)}`,
        all,
        inferColumns(all),
      );
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
      const cols = preset
        ? preset.columns
        : (inferColumns(all.length ? all : rows).slice(0, 14) as ReportCol[]);
      printReportPdf({
        title,
        subtitle: description,
        meta: buildMeta(all),
        columns: cols,
        rows: all,
        orientation: preset?.orientation ?? "landscape",
        printedBy: me?.fullname,
      });
    } catch (e) {
      toast.error("Gagal menyiapkan PDF", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageContainer
      title={title}
      description={description}
      actions={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onExportCsv}
            loading={busy === "csv"}
            disabled={busy !== null || (rows.length === 0 && !isFetching)}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="secondary"
            onClick={onPrintPdf}
            loading={busy === "pdf"}
            disabled={busy !== null || (rows.length === 0 && !isFetching)}
          >
            <FileText className="h-4 w-4" />
            Cetak / PDF
          </Button>
        </div>
      }
    >
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        {filterConfig.map((f) => {
          const val = (values as unknown as Record<string, string>)[f.key] ?? "";
          if (f.type === "date") {
            return (
              <FilterDate
                key={f.key}
                label={f.label}
                value={val}
                onChange={(v) => setValues({ [f.key]: v } as never, { resetPage: true })}
              />
            );
          }
          if (f.type === "select") {
            return (
              <FilterSelect
                key={f.key}
                value={val}
                onChange={(v) => setValues({ [f.key]: v } as never, { resetPage: true })}
                options={f.options ?? []}
                placeholder={f.label}
              />
            );
          }
          return (
            <input
              key={f.key}
              className="input-base h-9 w-40"
              placeholder={f.label}
              defaultValue={val}
              onBlur={(e) =>
                setValues({ [f.key]: e.target.value } as never, { resetPage: true })
              }
            />
          );
        })}
      </FilterBar>

      {tiles.length > 0 ? (
        <div
          className={
            "grid grid-cols-2 gap-3 sm:grid-cols-4" +
            (tiles.length > 4 ? " lg:grid-cols-6" : "")
          }
        >
          {tiles.map((t) => (
            <div key={t.label} className="card p-3">
              <p className="text-xs text-slate-500">{t.label}</p>
              <p className="text-lg font-bold text-slate-900">
                {isLoading ? "…" : t.value}
              </p>
            </div>
          ))}
          <p className="col-span-full flex items-center gap-1.5 text-xs text-slate-400">
            {isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            Ringkasan dihitung dari halaman hasil yang sedang ditampilkan.
            Gunakan CSV/PDF untuk memproses seluruh hasil filter.
          </p>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(_r, i) => i}
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={reportKey === "stock-opname" ? onPreviewStockOpname : undefined}
        emptyTitle="Tidak ada data laporan"
        emptyDescription="Sesuaikan filter lalu coba lagi."
      />

      <Modal
        open={selectedSo !== null}
        onClose={closeStockOpnamePreview}
        title={selectedSo ? `Preview Stock Opname — ${dash(selectedSo.no_so)}` : "Preview Stock Opname"}
        description="Dokumen asli Stock Opname. Pilih cetak bila dokumen sudah sesuai."
        size="2xl"
        centered
        footer={
          <>
            <Button variant="secondary" onClick={closeStockOpnamePreview} disabled={isPreviewLoading}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (previewPdfUrl) window.open(previewPdfUrl, "_blank");
              }}
              disabled={!previewPdfUrl || isPreviewLoading}
            >
              <Printer className="h-4 w-4" />
              Cetak PDF
            </Button>
          </>
        }
      >
        {isPreviewLoading ? (
          <div className="flex h-[62vh] items-center justify-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Menyiapkan dokumen PDF…
          </div>
        ) : previewPdfUrl ? (
          <iframe
            title={`Preview ${dash(selectedSo?.no_so)}`}
            src={previewPdfUrl}
            className="h-[62vh] w-full rounded-lg border border-slate-200"
          />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">
            Dokumen PDF tidak tersedia.
          </div>
        )}
      </Modal>

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={data?.meta}
            page={values.page}
            perPage={values.per_page}
            onPageChange={(page) => setValues({ page })}
            onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
          />
        </div>
      ) : null}
    </PageContainer>
  );
}

export { formatNumber };
