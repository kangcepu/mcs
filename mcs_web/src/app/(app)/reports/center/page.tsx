"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  downloadExternalReport,
  getExternalReportCatalog,
  getExternalReportFilters,
  type ExternalReport,
} from "@/lib/api/report-center";

const emptyFilters = { company: "", location: "", status: "" };

function AssetReportFilters({ report, value, onChange }: {
  report: ExternalReport;
  value: typeof emptyFilters;
  onChange: (next: typeof emptyFilters) => void;
}) {
  const options = useQuery({
    queryKey: ["external-report-filters", report.endpoint_id, report.id, value.company, value.location, value.status],
    queryFn: ({ signal }) => getExternalReportFilters(report, value, signal),
  });
  const data = options.data?.data;

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label>Company</Label><Select value={value.company} onChange={(event) => onChange({ ...value, company: event.target.value, location: "" })}><option value="">Semua company</option>{data?.companies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>
      <div><Label>Lokasi asset</Label><Select value={value.location} onChange={(event) => onChange({ ...value, location: event.target.value })}><option value="">Semua lokasi</option>{data?.locations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>
      <div><Label>Status asset</Label><Select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value })}><option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></Select></div>
    </div>
    <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{options.isFetching ? "Menghitung asset sesuai filter…" : `${data?.matched_assets ?? 0} asset akan masuk ke report`}</div>
  </div>;
}

export default function ReportCenterPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<ExternalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [assetFilters, setAssetFilters] = useState(emptyFilters);
  const query = useQuery({ queryKey: ["external-report-center"], queryFn: ({ signal }) => getExternalReportCatalog(signal) });
  const responseReports = query.data?.data.reports;
  const allReports = useMemo(() => responseReports ?? [], [responseReports]);
  const categories = useMemo(() => [...new Set(allReports.map((item) => item.category))].sort(), [allReports]);
  const reports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReports.filter((item) => {
      const text = `${item.title} ${item.description ?? ""} ${item.category} ${item.endpoint_name}`.toLowerCase();
      return (!category || item.category === category) && (!term || text.includes(term));
    });
  }, [allReports, category, search]);

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await downloadExternalReport(selected, selected.report_type === "report-assets" ? assetFilters : {});
      toast.success("Report berhasil dibuat");
      setSelected(null);
    } catch (error) {
      toast.error("Report gagal dibuat", error instanceof Error ? error.message : undefined);
    } finally { setBusy(false); }
  };

  return <PageContainer title="Report Center" description="Pilih report, atur filter, lalu buat dokumen dari layanan reporting." actions={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}>
    {query.isLoading ? <LoadingSkeleton rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, kategori, atau deskripsi report…" className="sm:max-w-xl" />
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="sm:max-w-64"><option value="">Semua kategori</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      </div>
      <div className="text-xs text-slate-500">Menampilkan {reports.length} dari {allReports.length} report aktif</div>
      {query.data?.data.errors.map((error) => <Card key={error.endpoint_id} className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error.endpoint_name}: {error.message}</Card>)}
      {!reports.length ? <EmptyState title={allReports.length ? "Report tidak ditemukan" : "Belum ada report dari endpoint"} description={allReports.length ? "Ubah kata pencarian atau kategori report." : "Aktifkan report melalui Master Data → Endpoint Report Center."} /> : <Card className="overflow-hidden"><div className="divide-y divide-slate-100">{reports.map((report) => <div key={`${report.endpoint_id}:${report.id}`} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3"><div className="mt-0.5 rounded-lg bg-brand-50 p-2 text-brand-600"><FileBarChart2 className="h-5 w-5" /></div><div className="min-w-0"><p className="font-semibold text-slate-900">{report.title}</p><p className="truncate text-sm text-slate-500">{report.description || "Report eksternal"}</p><p className="mt-1 text-xs text-slate-400">{report.category} · {report.format} · {report.endpoint_name}</p></div></div>
        <Button variant="secondary" className="shrink-0 sm:min-w-36" onClick={() => setSelected(report)}>{report.report_type === "report-assets" ? <SlidersHorizontal className="h-4 w-4" /> : <Download className="h-4 w-4" />} Buat Report</Button>
      </div>)}</div></Card>}
    </>}

    <Modal open={selected !== null} onClose={() => !busy && setSelected(null)} title={selected ? `Buat ${selected.title}` : "Buat Report"} description={selected?.description || "Periksa pilihan sebelum membuat report."} size="lg" closeOnBackdrop={!busy} footer={<><Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Batal</Button><Button loading={busy} onClick={run}><Download className="h-4 w-4" /> Buat & Unduh</Button></>}>
      {selected?.report_type === "report-assets" ? <AssetReportFilters report={selected} value={assetFilters} onChange={setAssetFilters} /> : <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Report ini tidak memerlukan filter tambahan.</div>}
    </Modal>
  </PageContainer>;
}
