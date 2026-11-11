"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import {
  deleteReportEndpointConfig,
  getReportEndpointConfigs,
  saveReportEndpointConfig,
  syncReportCatalog,
  updateReportDefinition,
  type ReportEndpointConfig,
} from "@/lib/api/report-center";

const PERMISSIONS = [
  ["", "Semua user login"],
  ["report_asset", "Report Asset"],
  ["report_asset_history", "Report Asset History"],
  ["list_of_asset", "List of Asset"],
  ["report_so", "Report Stock Opname"],
  ["recap_wo", "Recap Work Order"],
  ["template_crystal_report", "Template Crystal Report"],
] as const;

const empty = {
  protocol: "ASYNC_JOB", endpoint_name: "MCS Reporting Async", catalog_url: "",
  base_url: "http://192.168.10.100:5007/reports",
  report_catalog_url: "http://192.168.10.100:5007/report-types",
  system_code: "mcs", report_type: "report-assets", report_title: "Laporan Assets",
  report_description: "Laporan daftar asset dari layanan reporting/Gotenberg.",
  category: "Asset Management", output_format: "PDF", default_params: "{}",
  required_permission: "report_asset", auth_header_name: "", auth_header_value: "",
  timeout_seconds: "30", status: "ACTIVE",
  notes: "Katalog disinkron otomatis; token user MCS diteruskan saat membuat report.",
};

export default function ReportEndpointPage() {
  const toast = useToast();
  const [form, setForm] = useState<Record<string,string>>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["report-endpoint-config"], queryFn: ({ signal }) => getReportEndpointConfigs(signal) });
  const responseRows = query.data?.data;
  const rows = useMemo(() => responseRows ?? [], [responseRows]);
  const endpoints = useMemo(() => [...new Map(rows.map((row) => [row.id,row])).values()], [rows]);
  const definitions = rows.filter((row) => row.report_definition_id);

  const edit = (row?: ReportEndpointConfig) => {
    setForm(row ? {
      id: String(row.id), protocol: row.protocol || "CATALOG", endpoint_name: row.endpoint_name,
      catalog_url: row.catalog_url, base_url: row.base_url || row.catalog_url,
      report_catalog_url: row.report_catalog_url || "", system_code: row.system_code || "mcs",
      report_type: row.report_type || "report-assets", report_title: row.report_title || "Laporan Assets",
      report_description: row.report_description || "", category: row.category || "General",
      output_format: row.output_format || "PDF", default_params: row.default_params || "{}",
      required_permission: row.required_permission || "", auth_header_name: row.auth_header_name || "",
      auth_header_value: "", timeout_seconds: String(row.timeout_seconds), status: row.status,
      notes: row.notes || "",
    } : empty);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if(form.protocol === "ASYNC_JOB")JSON.parse(form.default_params || "{}");
      await saveReportEndpointConfig(form);toast.success("Endpoint report disimpan");setOpen(false);await query.refetch();
    } catch(error) { toast.error("Endpoint gagal disimpan",error instanceof Error?error.message:undefined); }
    finally { setSaving(false); }
  };

  const sync = async (id:number) => {
    setWorking(id);
    try { const result=await syncReportCatalog(id);toast.success("Katalog report tersinkron",`${result.data.created} baru · ${result.data.updated} diperbarui · ${result.data.unavailable} unavailable`);await query.refetch(); }
    catch(error){toast.error("Sinkronisasi gagal",error instanceof Error?error.message:undefined);}
    finally{setWorking(null);}
  };

  const updateDefinition = async (row:ReportEndpointConfig,status:string,permission:string) => {
    if(!row.report_definition_id)return;setWorking(row.report_definition_id);
    try{await updateReportDefinition(row.report_definition_id,{status:status as "ACTIVE"|"INACTIVE",required_permission:permission});toast.success("Akses report diperbarui");await query.refetch();}
    catch(error){toast.error("Akses report gagal diperbarui",error instanceof Error?error.message:undefined);}
    finally{setWorking(null);}
  };

  const remove = async(id:number) => { if(!confirm("Hapus endpoint beserta definisi report-nya?"))return;await deleteReportEndpointConfig(id);await query.refetch(); };

  return <PageContainer title="Katalog & Akses Report" description="Cron mengambil katalog Laravel setiap 10 menit. Report baru harus diaktifkan dan diberi permission sebelum tampil ke user." actions={<Button onClick={() => edit()}><Plus className="h-4 w-4"/> Tambah Endpoint</Button>}>
    <Card className="border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Alur aman:</strong> katalog terdeteksi otomatis → report baru berstatus nonaktif → admin memilih permission → report aktif muncul hanya kepada user yang berhak.</Card>

    <div className="space-y-3">{endpoints.map((endpoint) => <Card key={endpoint.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-semibold">{endpoint.endpoint_name}</p><StatusBadge status={endpoint.status}/></div><p className="mt-1 break-all text-xs text-slate-500">Job: {endpoint.base_url || endpoint.catalog_url}</p>{endpoint.report_catalog_url ? <p className="break-all text-xs text-slate-500">Catalog: {endpoint.report_catalog_url}</p> : null}</div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={working===endpoint.id} onClick={() => sync(endpoint.id)}><RefreshCw className="h-4 w-4"/> Sinkronkan Sekarang</Button><Button variant="ghost" onClick={() => edit(endpoint)}><Pencil className="h-4 w-4"/> Endpoint</Button><Button variant="ghost" className="text-rose-600" onClick={() => remove(endpoint.id)}><Trash2 className="h-4 w-4"/></Button></div>
    </Card>)}</div>

    <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Report terdeteksi</h2><span className="text-sm text-slate-500">{definitions.length} report</span></div>
    <div className="grid gap-3 xl:grid-cols-2">{definitions.map((row) => {
      const active=row.report_status==="ACTIVE";const available=row.catalog_status!=="UNAVAILABLE";
      return <Card key={row.report_definition_id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-slate-900">{row.report_title}</p><p className="truncate text-xs text-slate-500">{row.report_type} · {row.category}</p></div><div className="flex gap-1"><StatusBadge status={row.catalog_status||"AVAILABLE"}/><StatusBadge status={row.report_status||"INACTIVE"}/></div></div>
        <p className="mt-2 text-xs text-slate-400">Parameter: {(() => { try{return (JSON.parse(row.catalog_params||"[]") as string[]).join(", ")||"tanpa filter";}catch{return "-";} })()}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Permission user"><Select disabled={working===row.report_definition_id} value={row.required_permission||""} onChange={(event)=>updateDefinition(row,row.report_status||"INACTIVE",event.target.value)}>{PERMISSIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field></div><Button disabled={!available} loading={working===row.report_definition_id} variant={active?"secondary":"primary"} onClick={()=>updateDefinition(row,active?"INACTIVE":"ACTIVE",row.required_permission||"")}>{active?"Nonaktifkan":"Aktifkan"}</Button></div>
      </Card>;
    })}</div>

    <Modal open={open} onClose={() => setOpen(false)} title="Konfigurasi Endpoint Report" size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button loading={saving} onClick={save}>Simpan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Mode endpoint" required><Select value={form.protocol} onChange={(event)=>setForm((value)=>({...value,protocol:event.target.value}))}><option value="ASYNC_JOB">Async Job</option><option value="CATALOG">Catalog API</option></Select></Field><Field label="Status endpoint"><Select value={form.status} onChange={(event)=>setForm((value)=>({...value,status:event.target.value}))}><option>ACTIVE</option><option>INACTIVE</option></Select></Field><Field label="Nama endpoint" required><Input value={form.endpoint_name} onChange={(event)=>setForm((value)=>({...value,endpoint_name:event.target.value}))}/></Field><Field label="Timeout (detik)"><Input type="number" min="3" max="120" value={form.timeout_seconds} onChange={(event)=>setForm((value)=>({...value,timeout_seconds:event.target.value}))}/></Field>
      {form.protocol==="ASYNC_JOB"?<><div className="sm:col-span-2"><Field label="Base URL job" required><Input value={form.base_url} onChange={(event)=>setForm((value)=>({...value,base_url:event.target.value}))}/></Field></div><div className="sm:col-span-2"><Field label="URL katalog report" required><Input value={form.report_catalog_url} onChange={(event)=>setForm((value)=>({...value,report_catalog_url:event.target.value}))}/></Field></div><Field label="System code" required><Input value={form.system_code} onChange={(event)=>setForm((value)=>({...value,system_code:event.target.value}))}/></Field><Field label="Report seed"><Input value={form.report_type} onChange={(event)=>setForm((value)=>({...value,report_type:event.target.value}))}/></Field><Field label="Judul seed"><Input value={form.report_title} onChange={(event)=>setForm((value)=>({...value,report_title:event.target.value}))}/></Field><Field label="Permission seed"><Select value={form.required_permission} onChange={(event)=>setForm((value)=>({...value,required_permission:event.target.value}))}>{PERMISSIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field></>:<div className="sm:col-span-2"><Field label="Catalog URL" required><Input value={form.catalog_url} onChange={(event)=>setForm((value)=>({...value,catalog_url:event.target.value}))}/></Field></div>}
      <div className="sm:col-span-2"><Field label="Catatan"><Textarea value={form.notes} onChange={(event)=>setForm((value)=>({...value,notes:event.target.value}))}/></Field></div></div>
    </Modal>
  </PageContainer>;
}
