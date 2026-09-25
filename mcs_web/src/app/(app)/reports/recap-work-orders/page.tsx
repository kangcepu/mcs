"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { AccessDenied } from "@/components/layout/access-denied";
import { useMe } from "@/hooks/use-auth";
import { useWorkOrderOptions } from "@/hooks/use-work-orders";
import { useRecapWorkOrderFilterOptions, useReport } from "@/hooks/use-reports";
import { useQueryParams } from "@/hooks/use-query-params";
import { fetchAllReportRows } from "@/lib/api/reports";
import { printReportPdf } from "@/lib/print-report";
import { exportToExcel } from "@/lib/export-excel";
import { REPORT_COLUMN_PRESETS } from "@/lib/report-columns";
import { readableWoModules } from "@/lib/permissions";
import { WO_MODULE_LABEL } from "@/types/work-order";
import { DEFAULT_PER_PAGE, ApiError } from "@/types/api";
import { formatNumber } from "@/lib/format";
import { statusLabel } from "@/components/ui/status-badge";
import { dash } from "@/lib/display";

const PRESET = REPORT_COLUMN_PRESETS["recap-work-orders"]!;

const CLOSED = new Set(["CLOSED"]);
const REJECTED = new Set(["REJECT", "DECLINE", "VOID"]);
const pct = (n: number, t: number) => (t > 0 ? ` (${((n / t) * 100).toFixed(1)}%)` : "");

const DEFAULTS = {
  module: "",
  company: "",
  id_division: "",
  type_wo: "",
  job_executor: "",
  priority: "",
  status: "",
  date_from: "",
  date_to: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

export default function RecapWorkOrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: me, isLoading: meLoading } = useMe();
  const allowed = useMemo(() => readableWoModules(me), [me]);

  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const [busy, setBusy] = useState<null | "pdf" | "xls">(null);

  const recapFilters = useRecapWorkOrderFilterOptions();
  const wo = useWorkOrderOptions();
  const divisions = recapFilters.data?.data?.divisions ?? [];
  const companies = recapFilters.data?.data?.companies ?? [];
  const types = wo.data?.data?.types ?? [];
  const priorities = wo.data?.data?.priorities ?? [];
  const statuses = wo.data?.data?.statuses ?? [];

  // Modul aktif (tab). Default = tab pertama yang diizinkan.
  const activeModule =
    values.module && allowed.includes(values.module)
      ? values.module
      : (allowed[0] ?? "");

  const params = useMemo(
    () => ({
      module: activeModule || undefined,
      company: values.company || undefined,
      id_division: values.id_division || undefined,
      type_wo: values.type_wo || undefined,
      job_executor: values.job_executor || undefined,
      priority: values.priority || undefined,
      status: values.status || undefined,
      date_from: values.date_from || undefined,
      date_to: values.date_to || undefined,
      page: values.page,
      per_page: values.per_page,
    }),
    [activeModule, values],
  );
  const filterOnly = useMemo(() => {
    const { page: _p, per_page: _pp, ...rest } = params;
    void _p;
    void _pp;
    return rest;
  }, [params]);

  const { data, isLoading, isFetching, error, refetch } = useReport(
    "recap-work-orders",
    params,
  );
  const rows = (data?.data ?? []) as Array<Record<string, unknown>>;
  const meta = data?.meta;

  const columns: Column<Record<string, unknown>>[] = PRESET.columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align === "center" || c.align === "right" ? c.align : undefined,
    cell: (r) => (c.render ? c.render(r) || "-" : dash(r[c.key])),
  }));

  const buildSummary = (all: Array<Record<string, unknown>>) => {
    const total = all.length;
    let waiting = 0;
    let progress = 0;
    let closed = 0;
    let rejected = 0;
    let emergency = 0;
    for (const r of all) {
      const s = String(r.status ?? "").toUpperCase();
      if (s.startsWith("WAIT")) waiting++;
      else if (CLOSED.has(s)) closed++;
      else if (REJECTED.has(s)) rejected++;
      else progress++;
      if (String(r.priority ?? "").toUpperCase() === "EMERGENCY") emergency++;
    }
    return { total, waiting, progress, closed, rejected, emergency };
  };

  const buildMeta = (all: Array<Record<string, unknown>>) => {
    const s = buildSummary(all);
    const m: { label: string; value: string }[] = [
      { label: "Modul", value: WO_MODULE_LABEL[activeModule as keyof typeof WO_MODULE_LABEL] ?? activeModule ?? "Semua" },
    ];
    const co = companies.find((c) => c.value === values.company);
    const dv = divisions.find((d) => d.value === values.id_division);
    const ty = types.find((t) => t.code === values.type_wo);
    if (co) m.push({ label: "Company", value: co.label });
    if (dv) m.push({ label: "Divisi", value: dv.label });
    if (ty) m.push({ label: "Tipe WO", value: ty.label });
    if (values.job_executor) m.push({ label: "PIC / Executor", value: values.job_executor });
    if (values.date_from || values.date_to)
      m.push({ label: "Periode", value: `${values.date_from || "…"} s/d ${values.date_to || "…"}` });
    m.push({ label: "Total WO", value: String(s.total) });
    m.push({ label: "Waiting", value: `${s.waiting}${pct(s.waiting, s.total)}` });
    m.push({ label: "In Progress", value: `${s.progress}${pct(s.progress, s.total)}` });
    m.push({ label: "Closed", value: `${s.closed}${pct(s.closed, s.total)}` });
    m.push({ label: "Ditolak/Void", value: `${s.rejected}${pct(s.rejected, s.total)}` });
    m.push({ label: "Emergency", value: String(s.emergency) });
    return m;
  };

  // Ringkasan + export dari SELURUH hasil filter (bukan halaman aktif). Cache 2 mnt.
  const summaryQ = useQuery({
    queryKey: ["recap-wo-all", filterOnly],
    queryFn: () => fetchAllReportRows("recap-work-orders", filterOnly),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const doExport = async (kind: "pdf" | "xls") => {
    setBusy(kind);
    try {
      const all =
        summaryQ.data ??
        (await fetchAllReportRows("recap-work-orders", filterOnly));
      if (all.length === 0) {
        toast.error("Tidak ada data untuk diexport");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const modLabel =
        WO_MODULE_LABEL[activeModule as keyof typeof WO_MODULE_LABEL] ?? activeModule ?? "all";
      if (kind === "pdf") {
        printReportPdf({
          title: `Recap Work Order — ${modLabel}`,
          meta: buildMeta(all),
          columns: PRESET.columns,
          rows: all,
          orientation: PRESET.orientation,
          printedBy: me?.fullname,
        });
      } else {
        exportToExcel(`recap-wo-${modLabel}-${stamp}`, PRESET.columns, all, {
          title: `Recap Work Order — ${modLabel}`,
          meta: buildMeta(all).filter((x) =>
            ["Modul", "Company", "Divisi", "Tipe WO", "PIC / Executor", "Periode"].includes(
              x.label,
            ),
          ),
        });
      }
    } catch (e) {
      toast.error("Gagal export", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const s = buildSummary(summaryQ.data ?? rows);

  if (!meLoading && allowed.length === 0) {
    return (
      <PageContainer title="Recap Work Order">
        <AccessDenied message="Anda tidak punya akses ke modul Work Order manapun." />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Recap Work Order"
      description="Rekapitulasi work order per modul. Ringkasan & export dihitung dari seluruh hasil filter."
      actions={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => doExport("pdf")}
            loading={busy === "pdf"}
            disabled={busy !== null}
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </Button>
          <Button
            variant="secondary"
            onClick={() => doExport("xls")}
            loading={busy === "xls"}
            disabled={busy !== null}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      }
    >
      <Tabs
        items={allowed.map((m) => ({
          key: m,
          label: `Work Order ${WO_MODULE_LABEL[m as keyof typeof WO_MODULE_LABEL] ?? m}`,
        }))}
        value={activeModule}
        onChange={(key) => setValues({ module: key }, { resetPage: true })}
      />

      <div className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company">
            <Select
              value={values.company}
              onChange={(e) => setValues({ company: e.target.value }, { resetPage: true })}
            >
              <option value="">Semua company</option>
              {companies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Divisi Executor">
            <Select
              value={values.id_division}
              onChange={(e) =>
                setValues({ id_division: e.target.value }, { resetPage: true })
              }
            >
              <option value="">Semua divisi</option>
              {divisions.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type WO">
            <Select
              value={values.type_wo}
              onChange={(e) => setValues({ type_wo: e.target.value }, { resetPage: true })}
            >
              <option value="">WO All</option>
              {types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PIC / Executor">
            <Input
              value={values.job_executor}
              onChange={(e) =>
                setValues({ job_executor: e.target.value }, { resetPage: true })
              }
              placeholder="Nama / kode executor"
            />
          </Field>
          <Field label="Prioritas">
            <Select
              value={values.priority}
              onChange={(e) => setValues({ priority: e.target.value }, { resetPage: true })}
            >
              <option value="">Semua prioritas</option>
              {priorities.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={values.status}
              onChange={(e) => setValues({ status: e.target.value }, { resetPage: true })}
            >
              <option value="">Semua status</option>
              {statuses.map((st) => (
                <option key={st.code} value={st.code}>
                  {statusLabel(st.code)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start Date">
            <Input
              type="date"
              value={values.date_from}
              onChange={(e) => setValues({ date_from: e.target.value }, { resetPage: true })}
            />
          </Field>
          <Field label="End Date">
            <Input
              type="date"
              value={values.date_to}
              onChange={(e) => setValues({ date_to: e.target.value }, { resetPage: true })}
            />
          </Field>
        </div>
        {hasActiveFilters ? (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="h-8 px-2 text-slate-500"
              onClick={reset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filter
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total WO", value: formatNumber(s.total) },
          { label: "Waiting", value: `${formatNumber(s.waiting)}${pct(s.waiting, s.total)}` },
          { label: "In Progress", value: `${formatNumber(s.progress)}${pct(s.progress, s.total)}` },
          { label: "Closed", value: `${formatNumber(s.closed)}${pct(s.closed, s.total)}` },
          { label: "Ditolak/Void", value: `${formatNumber(s.rejected)}${pct(s.rejected, s.total)}` },
          { label: "Emergency", value: formatNumber(s.emergency) },
        ].map((t) => (
          <div key={t.label} className="card p-3">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="text-lg font-bold text-slate-900">{t.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        {summaryQ.isFetching
          ? "Menghitung ringkasan dari seluruh hasil filter…"
          : `Ringkasan & export dari seluruh ${formatNumber(
              (summaryQ.data ?? rows).length,
            )} baris hasil filter.`}
      </p>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(_r, i) => i}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(r) => {
          const woNo = String(r.wo_number ?? "");
          if (!woNo) return;
          router.push(
            `/work-orders/${encodeURIComponent(activeModule)}/${woNo
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`,
          );
        }}
        emptyTitle="Tidak ada work order"
        emptyDescription="Sesuaikan filter lalu coba lagi."
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={meta}
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
