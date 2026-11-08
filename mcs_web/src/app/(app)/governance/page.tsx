"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, FileCheck2, History, Plus, RefreshCw, ShieldAlert, Upload } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useCan } from "@/components/ui/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { actionEnergyNcr, createEnergyNcr, getEnergyGovernance, getEnergyNcr, uploadEnergyNcrEvidence, verifyEnergyNcr } from "@/lib/api/energy";
import type { EnergyGovernanceApproval, EnergyGovernanceAudit, EnergyGovernanceNcr } from "@/types/energy";

const SOURCE_LABEL: Record<string,string> = {
  METER_READING:"Meter Reading", METER_CORRECTION:"Koreksi Reading", GENSET_OPERATION:"Operasi Genset",
  FUEL_MOVEMENT:"Fuel Movement", FUEL_STOCK_OPNAME:"Fuel Stock Opname", UTILITY_OPERATION:"Inspeksi Utility",
  UTILITY_ALLOCATION:"Utility Allocation", METER_CALIBRATION:"Kalibrasi Meter",
};
const assetHref=(code:string)=>`/assets/${code.split("/").map(encodeURIComponent).join("/")}`;
const severityTone=(value:string):"red"|"amber"|"blue"|"slate"=>value==="CRITICAL"?"red":value==="HIGH"?"amber":value==="MEDIUM"?"blue":"slate";

export default function GovernancePage() {
  const canWrite=useCan(PERMISSIONS.privilageAsset);
  const [tab,setTab]=useState("approval");
  const [status,setStatus]=useState(""); const [severity,setSeverity]=useState(""); const [q,setQ]=useState("");
  const [selected,setSelected]=useState<EnergyGovernanceNcr|null>(null); const [createOpen,setCreateOpen]=useState(false);
  const query=useQuery({queryKey:["energy-governance",status,severity,q],queryFn:({signal})=>getEnergyGovernance({status,severity,q},signal)});
  const data=query.data?.data;
  return <PageContainer title="Energy Governance" description="Approval, NCR, evidence SOP/ISO, dan jejak audit Energy dalam satu ruang kerja."
    actions={canWrite?<Button onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/>Buat NCR</Button>:null}>
    {query.isLoading?<LoadingSkeleton rows={8}/>:query.error?<ErrorState error={query.error} onRetry={()=>query.refetch()}/>:data?<>
      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-5">
        <Metric icon={ClipboardCheck} label="Menunggu approval" value={data.summary.approvals} tone="amber"/>
        <Metric icon={ShieldAlert} label="NCR aktif" value={data.summary.open} tone="blue"/>
        <Metric icon={AlertTriangle} label="High / Critical" value={data.summary.high} tone="red"/>
        <Metric icon={History} label="Melewati due date" value={data.summary.overdue} tone="amber"/>
        <Metric icon={CheckCircle2} label="Total NCR" value={data.summary.total} tone="slate"/>
      </section>
      <Tabs value={tab} onChange={setTab} items={[{key:"approval",label:"Approval Queue",count:data.summary.approvals},{key:"ncr",label:"NCR & Corrective Action",count:data.summary.open},{key:"audit",label:"Audit Timeline"}]}/>
      {tab==="approval"?<ApprovalQueue rows={data.approvals} onRefresh={()=>query.refetch()}/>:tab==="ncr"?<NcrList rows={data.ncrs} status={status} severity={severity} q={q} onStatus={setStatus} onSeverity={setSeverity} onQ={setQ} onSelect={setSelected}/>:<AuditTimeline rows={data.audit}/>} 
    </>:null}
    {selected?<NcrDetailModal item={selected} canWrite={canWrite} onClose={()=>setSelected(null)} onChanged={async()=>{await query.refetch();}}/>:null}
    {createOpen?<CreateNcrModal onClose={()=>setCreateOpen(false)} onSaved={async()=>{setCreateOpen(false);setTab("ncr");await query.refetch();}}/>:null}
  </PageContainer>;
}

function Metric({icon:Icon,label,value,tone}:{icon:typeof ClipboardCheck;label:string;value:number;tone:"amber"|"blue"|"red"|"slate"}) {
  let color="bg-slate-100 text-slate-700";
  if(tone==="amber") color="bg-amber-50 text-amber-800";
  if(tone==="blue") color="bg-brand-50 text-brand-700";
  if(tone==="red") color="bg-rose-50 text-rose-700";
  return <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className={`rounded-lg p-2 ${color}`}><Icon className="h-4 w-4"/></span><div><p className="text-xl font-semibold tabular-nums text-slate-900">{formatNumber(value)}</p><p className="text-xs text-slate-500">{label}</p></div></div>;
}

function ApprovalQueue({rows,onRefresh}:{rows:EnergyGovernanceApproval[];onRefresh:()=>void}) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Transaksi menunggu keputusan</h2><p className="mt-1 text-xs text-slate-500">Keputusan dilakukan pada transaksi sumber agar validasi stok, locking, dan WO tetap dijalankan.</p></div><Button variant="ghost" onClick={onRefresh}><RefreshCw className="h-4 w-4"/>Refresh</Button></header>
    {!rows.length?<EmptyState title="Approval Energy bersih" description="Tidak ada transaksi Energy yang menunggu validasi atau persetujuan." className="m-4 py-10"/>:<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2.5">Jenis / Referensi</th><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Detail</th><th className="px-4 py-2.5">Diajukan</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(item=><tr key={`${item.source_type}-${item.source_id}`}><td className="px-4 py-3"><p className="font-medium text-slate-800">{SOURCE_LABEL[item.source_type]??item.source_type}</p><p className="text-xs text-slate-500">{item.reference_label}</p></td><td className="px-4 py-3"><p>{item.asset_name}</p><p className="text-xs text-slate-400">{item.asset_code}</p></td><td className="px-4 py-3 text-slate-600">{item.detail||"-"}</td><td className="px-4 py-3 text-slate-600">{formatDateTime(item.submitted_at)}</td><td className="px-4 py-3"><StatusBadge status={item.status}/></td><td className="px-4 py-3 text-right"><Link href={assetHref(item.asset_code)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Buka transaksi<ExternalLink className="h-3.5 w-3.5"/></Link></td></tr>)}</tbody></table></div>}
  </section>;
}

function NcrList({rows,status,severity,q,onStatus,onSeverity,onQ,onSelect}:{rows:EnergyGovernanceNcr[];status:string;severity:string;q:string;onStatus:(v:string)=>void;onSeverity:(v:string)=>void;onQ:(v:string)=>void;onSelect:(v:EnergyGovernanceNcr)=>void}) {
  return <div className="space-y-3"><div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row"><Input value={q} onChange={e=>onQ(e.target.value)} placeholder="Cari nomor NCR, judul, atau asset…" className="sm:max-w-sm"/><Select value={status} onChange={e=>onStatus(e.target.value)} className="sm:w-52"><option value="">Semua status</option><option value="OPEN">Open</option><option value="IN_PROGRESS">Dalam proses</option><option value="PENDING_VERIFICATION">Menunggu verifikasi</option><option value="CLOSED">Ditutup</option><option value="CANCELLED">Dibatalkan</option></Select><Select value={severity} onChange={e=>onSeverity(e.target.value)} className="sm:w-44"><option value="">Semua severity</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></Select></div>
    {!rows.length?<EmptyState title="Tidak ada NCR" description="Tidak ada NCR yang cocok dengan filter saat ini."/>:<section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2.5">NCR / Ketidaksesuaian</th><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Severity</th><th className="px-4 py-2.5">PIC / Due</th><th className="px-4 py-2.5">Evidence</th><th className="px-4 py-2.5">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(item=><tr key={item.id} onClick={()=>onSelect(item)} className="cursor-pointer hover:bg-slate-50"><td className="px-4 py-3"><p className="font-medium text-slate-900">{item.title}</p><p className="text-xs text-slate-500">{item.ncr_number} · {item.category.replaceAll("_"," ")}</p></td><td className="px-4 py-3"><p>{item.AssetName||"Tanpa asset"}</p><p className="text-xs text-slate-400">{item.AssetCode||SOURCE_LABEL[item.source_type]||item.source_type}</p></td><td className="px-4 py-3"><StatusBadge status={item.severity} tone={severityTone(item.severity)}/></td><td className="px-4 py-3"><p>{item.assigned_to||"Belum ditugaskan"}</p><p className="text-xs text-slate-400">Due {formatDate(item.due_date)}</p></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-slate-600"><FileCheck2 className="h-4 w-4"/>{formatNumber(item.evidence_count)}</span></td><td className="px-4 py-3"><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div></section>}
  </div>;
}

function AuditTimeline({rows}:{rows:EnergyGovernanceAudit[]}) {
  if(!rows.length)return <EmptyState title="Audit timeline masih kosong" description="Aktivitas Energy akan tercatat otomatis ketika transaksi atau NCR diproses."/>;
  return <section className="rounded-xl border border-slate-200 bg-white px-5 py-2"><ol className="divide-y divide-slate-100">{rows.map((item,index)=><li key={`${item.entity_type}-${item.id}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[170px_1fr_180px]"><time className="text-xs tabular-nums text-slate-500">{formatDateTime(item.event_at)}</time><div><p className="text-sm font-medium text-slate-800">{item.event_summary}</p><p className="text-xs text-slate-400">{item.ncr_number||item.event_type}</p></div><p className="text-xs text-slate-500 sm:text-right">{item.actor_name||"SYSTEM"}</p></li>)}</ol></section>;
}

function NcrDetailModal({item,canWrite,onClose,onChanged}:{item:EnergyGovernanceNcr;canWrite:boolean;onClose:()=>void;onChanged:()=>Promise<void>}) {
  const toast=useToast(); const [busy,setBusy]=useState(false); const [action,setAction]=useState("START"); const [note,setNote]=useState(""); const [assigned,setAssigned]=useState(item.assigned_to??""); const [due,setDue]=useState(item.due_date?.slice(0,10)??""); const [root,setRoot]=useState(item.root_cause??""); const [corrective,setCorrective]=useState(item.corrective_action??""); const [preventive,setPreventive]=useState(item.preventive_action??"");
  const [files,setFiles]=useState<File[]>([]);const [docType,setDocType]=useState("SOP");const [standard,setStandard]=useState("");
  const detail=useQuery({queryKey:["energy-ncr",item.id],queryFn:({signal})=>getEnergyNcr(item.id,signal)}); const ncr=detail.data?.data;
  useEffect(()=>{if(ncr){setAssigned(ncr.assigned_to??"");setDue(ncr.due_date?.slice(0,10)??"");setRoot(ncr.root_cause??"");setCorrective(ncr.corrective_action??"");setPreventive(ncr.preventive_action??"");}},[ncr]);
  const available=useMemo(()=>ncr?.status==="OPEN"?["START","ASSIGN","CANCEL"]:ncr?.status==="IN_PROGRESS"?["ASSIGN","SUBMIT_VERIFICATION","CANCEL"]:ncr?.status==="PENDING_VERIFICATION"?["CLOSE","REJECT"]:ncr?.status==="CLOSED"?["REOPEN"]:[],[ncr?.status]);
  useEffect(()=>{const first=available[0];if(first&&!available.includes(action))setAction(first);},[available,action]);
  const run=async()=>{if(!ncr)return;setBusy(true);try{if(action==="CLOSE"||action==="REJECT")await verifyEnergyNcr(ncr.id,action,note);else await actionEnergyNcr(ncr.id,{action,action_note:note,assigned_to:assigned,due_date:due,root_cause:root,corrective_action:corrective,preventive_action:preventive});toast.success("NCR diperbarui");await detail.refetch();await onChanged();setNote("");}catch(error){toast.error("NCR gagal diproses",error instanceof Error?error.message:undefined);}finally{setBusy(false);}};
  const upload=async()=>{if(!files.length)return;setBusy(true);try{await uploadEnergyNcrEvidence(item.id,files,{document_type:docType,standard_reference:standard});toast.success("Evidence diunggah");setFiles([]);await detail.refetch();await onChanged();}catch(error){toast.error("Upload evidence gagal",error instanceof Error?error.message:undefined);}finally{setBusy(false);}};
  return <Modal open onClose={onClose} title={item.ncr_number} description={item.title} size="2xl" footer={<Button variant="secondary" onClick={onClose}>Tutup</Button>}>
    {detail.isLoading?<LoadingSkeleton rows={6}/>:detail.error?<ErrorState error={detail.error} onRetry={()=>detail.refetch()}/>:ncr?<div className="space-y-5">
      <div className="flex flex-wrap gap-2"><StatusBadge status={ncr.status}/><StatusBadge status={ncr.severity} tone={severityTone(ncr.severity)}/><span className="text-xs text-slate-500">{ncr.AssetCode||"Tanpa asset"} · terdeteksi {formatDateTime(ncr.detected_at)}</span></div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{ncr.description}</p>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="PIC"><Input value={assigned} onChange={e=>setAssigned(e.target.value)} disabled={!canWrite}/></Field><Field label="Due date"><Input type="date" value={due} onChange={e=>setDue(e.target.value)} disabled={!canWrite}/></Field><Field label="Sumber"><Input value={SOURCE_LABEL[ncr.source_type]??ncr.source_type} disabled/></Field></div>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Root cause"><Textarea value={root} onChange={e=>setRoot(e.target.value)} disabled={!canWrite}/></Field><Field label="Corrective action"><Textarea value={corrective} onChange={e=>setCorrective(e.target.value)} disabled={!canWrite}/></Field><Field label="Preventive action"><Textarea value={preventive} onChange={e=>setPreventive(e.target.value)} disabled={!canWrite}/></Field></div>
      {canWrite&&available.length?<div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">Proses NCR</h3><div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr_auto]"><Select value={action} onChange={e=>setAction(e.target.value)}>{available.map(value=><option key={value}>{value}</option>)}</Select><Input value={note} onChange={e=>setNote(e.target.value)} placeholder={action==="CLOSE"||action==="REJECT"?"Catatan verifikasi wajib diisi":"Catatan tindakan"}/><Button loading={busy} onClick={run}>Proses</Button></div></div>:null}
      <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">SOP / ISO Evidence</h3>{canWrite?<div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto]"><Select value={docType} onChange={e=>setDocType(e.target.value)}><option>SOP</option><option>ISO</option><option>PHOTO</option><option>CERTIFICATE</option><option>REPORT</option><option>OTHER</option></Select><Input value={standard} onChange={e=>setStandard(e.target.value)} placeholder="Referensi standar / klausul"/><Input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={e=>setFiles(Array.from(e.target.files??[]))}/><Button loading={busy} disabled={!files.length} onClick={upload}><Upload className="h-4 w-4"/>Unggah</Button></div>:null}<div className="mt-3 divide-y divide-slate-100">{ncr.evidence.length?ncr.evidence.map(file=><a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center justify-between py-2 text-sm text-brand-700 hover:underline"><span>{file.document_type} · {file.file_name}</span><span className="text-xs text-slate-400">{file.standard_reference||formatDateTime(file.created_at)}</span></a>):<p className="py-3 text-sm text-slate-500">Belum ada evidence.</p>}</div></div>
      <div><h3 className="text-sm font-semibold text-slate-900">Riwayat tindakan</h3><ol className="mt-2 divide-y divide-slate-100">{ncr.actions.map(entry=><li key={entry.id} className="py-2 text-sm"><div className="flex justify-between gap-3"><span className="font-medium text-slate-700">{entry.action_type.replaceAll("_"," ")} · {entry.to_status.replaceAll("_"," ")}</span><span className="text-xs text-slate-400">{formatDateTime(entry.acted_at)}</span></div><p className="text-xs text-slate-500">{entry.acted_by||"SYSTEM"}{entry.action_note?` · ${entry.action_note}`:""}</p></li>)}</ol></div>
    </div>:null}
  </Modal>;
}

function CreateNcrModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}) {
  const toast=useToast();const [saving,setSaving]=useState(false);const [form,setForm]=useState({title:"",category:"OPERATIONAL",severity:"MEDIUM",description:"",assigned_to:"",due_date:""});const set=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
  const save=async()=>{setSaving(true);try{await createEnergyNcr(form);toast.success("NCR Energy dibuat");await onSaved();}catch(error){toast.error("NCR gagal dibuat",error instanceof Error?error.message:undefined);}finally{setSaving(false);}};
  return <Modal open onClose={onClose} title="Buat NCR Energy" description="Catat ketidaksesuaian manual yang tidak berasal dari alarm sistem." size="xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan NCR</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Judul" required><Input value={form.title} onChange={e=>set("title",e.target.value)}/></Field><Field label="Kategori" required><Select value={form.category} onChange={e=>set("category",e.target.value)}><option>OPERATIONAL</option><option>MEASUREMENT</option><option>CALIBRATION</option><option>STOCK_VARIANCE</option><option>COMPLIANCE</option><option>OTHER</option></Select></Field><Field label="Severity" required><Select value={form.severity} onChange={e=>set("severity",e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></Select></Field><Field label="PIC"><Input value={form.assigned_to} onChange={e=>set("assigned_to",e.target.value)}/></Field><Field label="Due date"><Input type="date" value={form.due_date} onChange={e=>set("due_date",e.target.value)}/></Field><div/><div className="sm:col-span-2"><Field label="Deskripsi ketidaksesuaian" required><Textarea value={form.description} onChange={e=>set("description",e.target.value)} className="min-h-28"/></Field></div></div></Modal>;
}
