"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Camera, Eye, FileSpreadsheet, FileText, ImagePlus, RefreshCw, Search, ShieldCheck, Upload, UserRound } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { EmptyState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  createAiImageAnalysis, downloadAiImageAnalysisExport, getAiImageAnalyses, getAiImageAnalysis, searchAiImageAssets,
  retryAiImageAnalysis, verifyAiImageAnalysis, type AiAssetOption, type AiImageAnalysisItem,
} from "@/lib/api/ai-image-analysis";
import { toAbsoluteUploadUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { ApiError } from "@/types/api";
import { PermissionGuard, useCan } from "@/components/ui/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";

const badge = (status: string) => status === "VERIFIED" ? "bg-emerald-50 text-emerald-700" : status === "ANALYZED" ? "bg-blue-50 text-blue-700" : status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
const assessment = (value: string) => value === "CRITICAL" ? "bg-rose-50 text-rose-700" : value === "WARNING" ? "bg-amber-50 text-amber-700" : value === "NORMAL" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";

function UploadDialog({ close, saved }: { close: () => void; saved: (item: AiImageAnalysisItem) => void }) {
  const toast = useToast();
  const [assetQuery, setAssetQuery] = useState("");
  const [asset, setAsset] = useState<AiAssetOption | null>(null);
  const [options, setOptions] = useState<AiAssetOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [searching, setSearching] = useState(false);
  const mutation = useMutation({ mutationFn: createAiImageAnalysis });
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);
  useEffect(() => () => { previews.forEach(url => URL.revokeObjectURL(url)); }, [previews]);

  const searchAsset = async () => {
    if (assetQuery.trim().length < 2) return;
    setSearching(true);
    try { setOptions((await searchAiImageAssets(assetQuery.trim())).data ?? []); }
    catch (error) { toast.error("Pencarian asset gagal", error instanceof Error ? error.message : undefined); }
    finally { setSearching(false); }
  };
  const submit = async () => {
    if (!asset || !files.length) return toast.warning("Data belum lengkap", "Pilih asset dan minimal satu foto.");
    const fd = new FormData();
    fd.append("asset_id", String(asset.asset_id));
    fd.append("asset_code", asset.asset_code);
    files.forEach(file => fd.append("images", file));
    try {
      const result = await mutation.mutateAsync(fd);
      toast.success("Foto masuk antrean", "Analisis berjalan di background; halaman akan memperbarui hasil otomatis.");
      saved(result.data);
    } catch (error) {
      toast.error("Upload gagal", error instanceof ApiError ? error.message : "Tidak dapat menyimpan foto.");
    }
  };
  return <Modal open onClose={close} title="Analisis Foto Asset" description="Pilih asset dan unggah hingga 8 foto. Analisis tetap berjalan setelah dialog ditutup." size="2xl" closeOnBackdrop={!mutation.isPending} footer={<><Button variant="secondary" onClick={close} disabled={mutation.isPending}>Batal</Button><Button onClick={submit} loading={mutation.isPending}><BrainCircuit className="h-4 w-4"/> Analisis di Background</Button></>}>
    <div className="space-y-5">
      <Field label="Asset / Mesin" required>
        {asset ? <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm"><span><b>{asset.asset_code}</b><br/><span className="text-slate-600">{asset.asset_name}</span></span><button className="text-blue-700" onClick={() => setAsset(null)}>Ganti</button></div> : <><div className="flex gap-2"><Input value={assetQuery} onChange={e=>setAssetQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void searchAsset();}} placeholder="Cari kode atau nama asset..."/><Button type="button" variant="secondary" loading={searching} onClick={searchAsset}><Search className="h-4 w-4"/></Button></div>{options.length ? <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200">{options.map(item=><button key={item.asset_id} type="button" onClick={()=>{setAsset(item);setOptions([]);}} className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"><b>{item.asset_code}</b> · {item.asset_name}<span className="block text-xs text-slate-400">{item.company_name} · {item.location_name}</span></button>)}</div>:null}</>}
      </Field>
      <Field label={`Foto Asset (${files.length}/8)`} required>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {previews.map((preview,index)=><div key={preview} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={preview} alt={`Foto ${index+1}`} className="h-full w-full object-cover"/><button type="button" onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))} className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/70 px-2 py-1 text-xs text-white">Hapus</button></div>)}
          {files.length<8?<label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400"><ImagePlus className="h-8 w-8 text-slate-400"/><span className="mt-2 text-center text-xs font-medium text-slate-600">Tambah foto</span><input className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{const selected=Array.from(e.target.files??[]);setFiles(current=>[...current,...selected].slice(0,8));e.target.value="";}}/></label>:null}
        </div>
        <p className="mt-2 text-xs text-slate-400">Gunakan beberapa sudut atau layar dari asset yang sama. Maksimal 8 foto, masing-masing 12 MB.</p>
      </Field>
    </div>
  </Modal>;
}

function DetailDialog({ id, close, verified, allowRetry, allowVerify }: { id: number; close: () => void; verified: () => void; allowRetry: boolean; allowVerify: boolean }) {
  const toast = useToast();
  const query = useQuery({ queryKey: ["ai-image-analysis", id], queryFn: () => getAiImageAnalysis(id), refetchInterval: 5000 });
  const item = query.data?.data;
  const verify = useMutation({ mutationFn: () => verifyAiImageAnalysis(id, "Hasil OCR dan parameter telah diperiksa."), onSuccess: () => { toast.success("Hasil diverifikasi"); void query.refetch(); verified(); } });
  const retry = useMutation({ mutationFn: () => retryAiImageAnalysis(id), onSuccess: () => { toast.success("Analisis ulang masuk antrean"); void query.refetch(); verified(); }, onError: (error) => toast.error("Gagal mengantrekan ulang", error instanceof Error ? error.message : undefined) });
  const [exporting, setExporting] = useState<"pdf"|"xlsx"|null>(null);
  const exportFile = async (format: "pdf"|"xlsx") => { setExporting(format); try { await downloadAiImageAnalysisExport(id, format); toast.success(`File ${format.toUpperCase()} berhasil dibuat`); } catch (error) { toast.error("Export gagal", error instanceof Error ? error.message : undefined); } finally { setExporting(null); } };
  const findings = (() => { try { return JSON.parse(item?.findings || "[]") as Array<{severity:string;title:string;description:string}>; } catch { return []; } })();
  const recommendations = (() => { try { return JSON.parse(item?.recommendations || "[]") as string[]; } catch { return []; } })();
  const pending = item && ["QUEUED","PROCESSING","RETRY_WAIT"].includes(item.status);
  const canRetry = allowRetry && item && item.status !== "VERIFIED" && item.status !== "ANALYZED" && item.status !== "PROCESSING";
  return <Modal open onClose={close} title={item?.analysis_number ?? "Detail Pembacaan"} description={item ? `${item.asset_code} · ${item.activity_name}` : undefined} size="2xl" footer={<><Button variant="secondary" onClick={close}>Tutup</Button>{item&&["ANALYZED","VERIFIED"].includes(item.status)?<><Button variant="secondary" loading={exporting==="xlsx"} onClick={()=>void exportFile("xlsx")}><FileSpreadsheet className="h-4 w-4"/> Excel</Button><Button variant="secondary" loading={exporting==="pdf"} onClick={()=>void exportFile("pdf")}><FileText className="h-4 w-4"/> PDF</Button></>:null}{canRetry?<Button variant="secondary" loading={retry.isPending} onClick={()=>retry.mutate()}><RefreshCw className="h-4 w-4"/> Analisa Ulang</Button>:null}{allowVerify&&item?.status==="ANALYZED"?<Button loading={verify.isPending} onClick={()=>verify.mutate()}><ShieldCheck className="h-4 w-4"/> Verifikasi Hasil</Button>:null}</>}>
    {query.isLoading ? <LoadingSkeleton rows={8}/> : !item ? <EmptyState title="Data tidak ditemukan"/> : <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]"><div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">{(item.images?.length?item.images:[{sequence_no:1,image_url:item.image_url}]).map((image,index)=><img key={image.id??index} src={toAbsoluteUploadUrl(image.image_url)} alt={`Evidence ${index+1}`} className="aspect-square w-full rounded-xl border border-slate-200 bg-slate-50 object-cover"/>)}</div><div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge(item.status)}`}>{item.status}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{item.image_count??1} foto</span><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"><UserRound className="h-3.5 w-3.5"/> Dibuat oleh {item.created_by || "-"}</span></div>{pending?<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"><div className="flex items-center gap-2 font-semibold"><RefreshCw className="h-4 w-4 animate-spin"/> Analisis berjalan di background</div><p className="mt-1 text-xs">Percobaan: {item.retry_count ?? 0}{item.next_retry_at ? ` · retry berikutnya ${formatDateTime(item.next_retry_at)}` : " · menunggu worker"}. Modal ini memperbarui otomatis.</p></div>:null}{item.error_message?<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><b>Kesalahan terakhir:</b> {item.error_message}</div>:null}<div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-400">Ringkasan Analisis</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.analysis_summary || "-"}</p></div><details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold uppercase text-slate-500">Teks OCR lengkap</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap bg-slate-50 p-3 text-xs text-slate-700">{item.raw_text || "-"}</pre></details></div></div>
      <div><h3 className="mb-2 text-sm font-semibold text-slate-900">Parameter hasil pembacaan</h3><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Bagian</th><th className="px-3 py-2">Parameter</th><th className="px-3 py-2">Nilai</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Penilaian</th></tr></thead><tbody>{item.values?.map(row=><tr key={row.id} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-500">{row.section_name||"-"}</td><td className="px-3 py-2 font-medium">{row.parameter_name}</td><td className="px-3 py-2">{row.text_value} {row.unit}</td><td className="px-3 py-2">{row.confidence==null?"-":`${Math.round(Number(row.confidence)*100)}%`}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs ${assessment(row.assessment)}`}>{row.assessment}</span>{row.assessment_note?<p className="mt-1 text-xs text-slate-400">{row.assessment_note}</p>:null}</td></tr>)}</tbody></table></div></div>
      {findings.length?<div><h3 className="mb-2 text-sm font-semibold">Temuan</h3><div className="space-y-2">{findings.map((f,index)=><div key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><b>{f.severity} · {f.title}</b><p className="mt-1 text-slate-600">{f.description}</p></div>)}</div></div>:null}
      {recommendations.length?<div><h3 className="mb-2 text-sm font-semibold">Rekomendasi</h3><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{recommendations.map((value,index)=><li key={index}>{value}</li>)}</ul></div>:null}
      <div className="grid gap-4 lg:grid-cols-2">{([['Rekomendasi Produk',item.suggested_products],['Bahan Baku / Consumable',item.required_materials]] as const).map(([title,items])=><div key={title} className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">{title}</h3>{items?.length?<div className="mt-3 space-y-2">{items.map((row,index)=><div key={row.id??index} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex items-start justify-between gap-2"><b>{row.item_name}</b><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{row.priority||'MEDIUM'}</span></div><p className="mt-1 text-xs text-slate-600">{row.specification||'Spesifikasi perlu dikonfirmasi'}</p><p className="mt-1 text-xs font-medium text-blue-700">Perkiraan: {row.estimated_quantity??'-'} {row.unit||''}</p>{row.reason?<p className="mt-1 text-xs text-slate-500">{row.reason}</p>:null}</div>)}</div>:<p className="mt-3 text-xs text-slate-400">Belum ada rekomendasi terstruktur. Jalankan analisa ulang untuk mengisinya.</p>}</div>)}</div>
    </div>}
  </Modal>;
}

function AiImageAnalysisContent() {
  const qc = useQueryClient();
  const allowCreate = useCan(PERMISSIONS.aiImageAnalysisCreate);
  const allowRetry = useCan(PERMISSIONS.aiImageAnalysisRetry);
  const allowVerify = useCan(PERMISSIONS.aiImageAnalysisVerify);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<number|null>(null);
  const query = useQuery({ queryKey:["ai-image-analysis-list",q,status], queryFn:()=>getAiImageAnalyses({q,status,per_page:50}), refetchInterval: 10000 });
  const rows = query.data?.data ?? [];
  return <PageContainer title="Pembacaan Gambar AI" description="Ubah foto panel/HMI mesin menjadi teks, parameter, temuan, dan rekomendasi teknis terstruktur." actions={allowCreate?<Button onClick={()=>setUpload(true)}><Camera className="h-4 w-4"/> Baca Foto</Button>:undefined}>
    <div className="card flex flex-col gap-3 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input value={q} onChange={e=>setQ(e.target.value)} className="pl-9" placeholder="Cari nomor, mesin, aktivitas, atau teks hasil OCR..."/></div><Select value={status} onChange={e=>setStatus(e.target.value)} className="sm:w-52"><option value="">Semua status</option><option>QUEUED</option><option>PROCESSING</option><option>RETRY_WAIT</option><option>ANALYZED</option><option>VERIFIED</option><option>FAILED</option></Select></div>
    {query.isLoading?<LoadingSkeleton rows={8}/>:rows.length===0?<EmptyState icon={<Upload className="h-8 w-8"/>} title="Belum ada pembacaan gambar" description="Upload foto panel mesin untuk mengubahnya menjadi data terstruktur." action={allowCreate?<Button onClick={()=>setUpload(true)}>Baca Foto Pertama</Button>:undefined}/>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(item=><button key={item.id} onClick={()=>setSelected(item.id)} className="card overflow-hidden text-left transition hover:border-blue-300 hover:shadow-sm"><div className="flex gap-3 p-3"><img src={toAbsoluteUploadUrl(item.image_url)} alt="" className="h-24 w-28 rounded-lg bg-slate-100 object-cover"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-900">{item.activity_name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge(item.status)}`}>{item.status}</span></div><p className="mt-1 truncate text-xs font-medium text-blue-700">{item.asset_code}</p><p className="truncate text-xs text-slate-500">{item.asset_name}</p><p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.analysis_summary||item.error_message||"Sedang diproses..."}</p></div></div><div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-400"><span className="flex min-w-0 items-center gap-1"><UserRound className="h-3.5 w-3.5"/><span className="truncate">{item.created_by||'-'}</span></span><span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5"/> Detail</span></div></button>)}</div>}
    {allowCreate&&upload?<UploadDialog close={()=>setUpload(false)} saved={item=>{setUpload(false);setSelected(item.id);void qc.invalidateQueries({queryKey:["ai-image-analysis-list"]});}}/>:null}
    {selected?<DetailDialog id={selected} close={()=>setSelected(null)} verified={()=>void qc.invalidateQueries({queryKey:["ai-image-analysis-list"]})} allowRetry={allowRetry} allowVerify={allowVerify}/>:null}
  </PageContainer>;
}

export default function AiImageAnalysisPage() {
  return <PermissionGuard permission={[
    PERMISSIONS.aiImageAnalysisView,
    PERMISSIONS.aiImageAnalysisCreate,
    PERMISSIONS.aiImageAnalysisRetry,
    PERMISSIONS.aiImageAnalysisVerify,
  ]} mode="page"><AiImageAnalysisContent/></PermissionGuard>;
}
