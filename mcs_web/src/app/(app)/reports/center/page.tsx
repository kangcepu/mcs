"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Eye, FileBarChart2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  downloadExternalReport,
  prepareExternalReportPreview,
  getExternalReportCatalog,
  getExternalReportFilters,
  type ExternalReport,
} from "@/lib/api/report-center";

const emptyFilters = { q: "", company: "", location: "", category: "", status: "", date_from: "", date_to: "" };
const PAGE_SIZE = 12;
const REPORT_TONES = [
  { icon: "bg-blue-50 text-blue-600", accent: "bg-blue-500", badge: "bg-blue-50 text-blue-700" },
  { icon: "bg-violet-50 text-violet-600", accent: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  { icon: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  { icon: "bg-amber-50 text-amber-600", accent: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  { icon: "bg-cyan-50 text-cyan-600", accent: "bg-cyan-500", badge: "bg-cyan-50 text-cyan-700" },
  { icon: "bg-rose-50 text-rose-600", accent: "bg-rose-500", badge: "bg-rose-50 text-rose-700" },
];

function reportTone(category: string) {
  const hash = [...category].reduce((total, char) => total + char.charCodeAt(0), 0);
  return REPORT_TONES[hash % REPORT_TONES.length] ?? REPORT_TONES[0]!;
}

function DynamicReportFilters({ report, value, onChange }: {
  report: ExternalReport;
  value: typeof emptyFilters;
  onChange: (next: typeof emptyFilters) => void;
}) {
  const options = useQuery({
    queryKey: ["external-report-filters", report.endpoint_id, report.id, value.company, value.location, value.status],
    queryFn: ({ signal }) => getExternalReportFilters(report, value, signal),
  });
  const data = options.data?.data;
  const params=report.params??[];
  const has=(name:string)=>params.includes(name);

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {has("q")?<div className="sm:col-span-2"><Label>Pencarian</Label><Input value={value.q} onChange={(event)=>onChange({...value,q:event.target.value})} placeholder="Cari nomor, nama, kode, atau deskripsi…" /></div>:null}
      {has("company")?<div><Label>Company</Label><Select value={value.company} onChange={(event) => onChange({ ...value, company: event.target.value, location: "" })}><option value="">Semua company</option>{data?.companies?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>:null}
      {has("location")?<div><Label>Lokasi</Label><Select value={value.location} onChange={(event) => onChange({ ...value, location: event.target.value })}><option value="">Semua lokasi</option>{data?.locations?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>:null}
      {has("category")?<div><Label>Kategori</Label><Select value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })}><option value="">Semua kategori</option>{data?.categories?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>:null}
      {has("status")&&report.report_type==="report-assets"?<div><Label>Status asset</Label><Select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value })}><option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></Select></div>:null}
      {has("status")&&report.report_type!=="report-assets"?<div><Label>Status</Label><Input value={value.status} onChange={(event)=>onChange({...value,status:event.target.value})} placeholder="Contoh: OPEN atau APPROVED" /></div>:null}
      {has("date_from")?<div><Label>Tanggal mulai</Label><Input type="date" value={value.date_from} onChange={(event)=>onChange({...value,date_from:event.target.value})} /></div>:null}
      {has("date_to")?<div><Label>Tanggal selesai</Label><Input type="date" value={value.date_to} onChange={(event)=>onChange({...value,date_to:event.target.value})} /></div>:null}
    </div>
    {report.report_type==="report-assets"?<div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{options.isFetching ? "Menghitung asset sesuai filter…" : `${data?.matched_assets ?? 0} asset akan masuk ke report`}</div>:null}
  </div>;
}

export default function ReportCenterPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<ExternalReport | null>(null);
  const [busy, setBusy] = useState<"preview"|"download"|null>(null);
  const [assetFilters, setAssetFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{url:string;filename:string;title:string}|null>(null);
  const [generationProgress, setGenerationProgress] = useState<{value:number|null;status:string}|null>(null);
  const [generationController, setGenerationController] = useState<AbortController|null>(null);
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
  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const pageReports = reports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [category, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => () => { if(preview)URL.revokeObjectURL(preview.url); }, [preview]);

  const run = async (mode:"preview"|"download") => {
    if (!selected) return;
    const controller=new AbortController();
    setGenerationController(controller);
    setGenerationProgress({value:0,status:"QUEUED"});
    setBusy(mode);
    try {
      const params=Object.fromEntries(Object.entries(assetFilters).filter(([key,value])=>(selected.params??[]).includes(key)&&value));
      const options={signal:controller.signal,onProgress:(value:number|null,status:string)=>setGenerationProgress({value,status})};
      if(mode==="preview"){
        const result=await prepareExternalReportPreview(selected,params,options);
        if(result)setPreview(result);
      }else await downloadExternalReport(selected,params,options);
      toast.success(mode==="preview"?"Report siap dilihat":"Report berhasil diunduh");
      setSelected(null);
    } catch (error) {
      if(error instanceof Error&&error.name==="AbortError")toast.info("Pembuatan report dibatalkan");
      else toast.error("Report gagal dibuat", error instanceof Error ? error.message : undefined);
    } finally { setBusy(null);setGenerationController(null);setGenerationProgress(null); }
  };

  const closeGenerator=()=>{
    generationController?.abort();
    setSelected(null);
  };

  return <PageContainer title="Report Center" description="Pilih report, atur filter, lalu buat dokumen dari layanan reporting." actions={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}>
    {query.isLoading ? <LoadingSkeleton rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, kategori, atau deskripsi report…" className="sm:max-w-xl" />
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="sm:max-w-64"><option value="">Semua kategori</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>{reports.length} report ditemukan</span><span>{categories.length} kategori · {allReports.length} report aktif</span></div>
      {query.data?.data.errors.map((error) => <Card key={error.endpoint_id} className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error.endpoint_name}: {error.message}</Card>)}
      {!reports.length ? <EmptyState title={allReports.length ? "Report tidak ditemukan" : "Belum ada report dari endpoint"} description={allReports.length ? "Ubah kata pencarian atau kategori report." : "Aktifkan report melalui Master Data → Endpoint Report Center."} /> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{pageReports.map((report) => { const tone = reportTone(report.category); return <Card key={`${report.endpoint_id}:${report.id}`} className="group relative flex min-h-52 flex-col overflow-hidden p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <div className={`absolute inset-x-0 top-0 h-1 ${tone.accent}`} />
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-start justify-between gap-3"><div className={`rounded-xl p-2.5 ${tone.icon}`}><FileBarChart2 className="h-5 w-5" /></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide ${tone.badge}`}>{report.format}</span></div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{report.category}</p>
            <h3 className="mt-1 font-semibold leading-snug text-slate-900">{report.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{report.description || "Report eksternal"}</p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3"><span className="min-w-0 truncate text-xs text-slate-400" title={report.endpoint_name}>{report.endpoint_name}</span><Button variant="ghost" className="shrink-0 text-brand-700 hover:bg-brand-50" onClick={() => {setAssetFilters(emptyFilters);setSelected(report);}}>{(report.params??[]).length ? <SlidersHorizontal className="h-4 w-4" /> : <Download className="h-4 w-4" />} Buat</Button></div>
        </Card>; })}</div>
        {totalPages > 1 ? <div className="flex items-center justify-center gap-3 pt-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button><span className="text-sm text-slate-500">Halaman <strong className="text-slate-800">{page}</strong> dari {totalPages}</span><Button variant="secondary" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Berikutnya <ChevronRight className="h-4 w-4" /></Button></div> : null}
      </>}
    </>}

    <Modal open={selected !== null} onClose={closeGenerator} title={selected ? `Buat ${selected.title}` : "Buat Report"} description={selected?.description || "Periksa pilihan sebelum membuat report."} size="lg" closeOnBackdrop={!busy} footer={<><Button variant="secondary" onClick={closeGenerator}>{busy?"Batalkan Proses":"Batal"}</Button><Button variant="secondary" loading={busy==="download"} disabled={Boolean(busy)} onClick={()=>run("download")}><Download className="h-4 w-4" /> Unduh Langsung</Button><Button loading={busy==="preview"} disabled={Boolean(busy)} onClick={()=>run("preview")}><Eye className="h-4 w-4" /> Buka Report</Button></>}>
      {(selected?.params??[]).length ? <DynamicReportFilters report={selected!} value={assetFilters} onChange={setAssetFilters} /> : <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Report ini tidak menyediakan filter tambahan dari layanan reporting.</div>}
      {busy&&generationProgress?<div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3"><div className="flex items-center justify-between text-sm text-blue-800"><span>Reporting sedang membuat dokumen…</span><strong>{generationProgress.value===null?generationProgress.status:`${generationProgress.value}%`}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{width:`${generationProgress.value??10}%`}} /></div><p className="mt-2 text-xs text-blue-700">MCS menunggu maksimal 60 detik. Anda tetap dapat membatalkan proses.</p></div>:null}
    </Modal>
    <Modal open={preview!==null} onClose={()=>setPreview(null)} title={preview?.title||"Preview Report"} description="Periksa report sebelum mencetak atau mengunduh." size="2xl" footer={<><Button variant="secondary" onClick={()=>setPreview(null)}>Tutup</Button><Button onClick={()=>{if(!preview)return;const anchor=document.createElement("a");anchor.href=preview.url;anchor.download=preview.filename;anchor.click();}}><Download className="h-4 w-4" /> Unduh PDF</Button></>}>
      {preview?<iframe src={preview.url} title={preview.title} className="h-[72vh] w-full rounded-lg border border-slate-200 bg-slate-100"/>:null}
    </Modal>
  </PageContainer>;
}
