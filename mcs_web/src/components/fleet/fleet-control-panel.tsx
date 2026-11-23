"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Download, FileImage, Fuel, Gauge, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  createFleetReminderWorkOrder, deleteFleetAttachment, downloadFleetReport, getFleetAttachments,
  getFleetAuditTimeline, getFleetDashboard, getFleetReconciliationPreview, refreshFleetReminders,
  reviewFleetReconciliation, saveFleetReconciliation, uploadFleetAttachments,
} from "@/lib/api/fleet";
import type { FleetOverview } from "@/types/fleet";

const isoDate = (days = 0) => { const value = new Date(Date.now() + days * 86400000); return value.toISOString().slice(0, 10); };
const format = (value: unknown, digits = 2) => Number(value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: digits });

function metric(value: string, label: string, icon: React.ReactNode, tone: string) {
  return <Card className="flex items-center gap-3 p-4"><div className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>{icon}</div><div><p className="text-xl font-semibold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div></Card>;
}

export function FleetControlPanel({ overview, canWrite }: { overview?: FleetOverview; canWrite: boolean }) {
  const toast = useToast();
  const [section, setSection] = useState("dashboard");
  const [filters, setFilters] = useState({ date_from: isoDate(-29), date_to: isoDate() });
  const dashboard = useQuery({ queryKey: ["fleet-dashboard", filters], queryFn: ({ signal }) => getFleetDashboard(filters, signal) });
  const audit = useQuery({ queryKey: ["fleet-audit"], queryFn: () => getFleetAuditTimeline(), enabled: section === "audit" });
  const reconciliation = useQuery({ queryKey: ["fleet-reconciliation-preview", filters], queryFn: () => getFleetReconciliationPreview(filters), enabled: section === "reconciliation" });
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [evidence, setEvidence] = useState<{ type: "INSPECTION" | "SERVICE"; id: number; label: string } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const evidenceQuery = useQuery({ queryKey: ["fleet-evidence", evidence?.type, evidence?.id], queryFn: () => getFleetAttachments(evidence!.type, evidence!.id), enabled: Boolean(evidence) });
  const data = dashboard.data?.data;
  const run = async (work: () => Promise<unknown>, message: string) => { setBusy(true); try { await work(); toast.success(message); await Promise.all([dashboard.refetch(), reconciliation.refetch(), audit.refetch()]); } catch (error) { toast.error("Proses Fleet gagal", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const exportReport = async () => { setBusy(true); try { const result = await downloadFleetReport(filters); const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.fileName; anchor.click(); URL.revokeObjectURL(url); toast.success("Laporan Fleet berhasil diexport"); } catch (error) { toast.error("Export Fleet gagal", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const maxFuel = Math.max(1, ...(data?.trend.map((item) => Number(item.fuel_liter)) ?? [1]));

  return <div className="space-y-4">
    <Card className="p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold text-slate-900">Fleet Operations Control</h2><p className="text-sm text-slate-500">Dashboard, preventive reminder, evidence, rekonsiliasi tank, export, dan audit.</p></div><div className="flex flex-wrap items-end gap-2"><Field label="Dari"><Input type="date" value={filters.date_from} onChange={(event)=>setFilters((current)=>({...current,date_from:event.target.value}))}/></Field><Field label="Sampai"><Input type="date" value={filters.date_to} onChange={(event)=>setFilters((current)=>({...current,date_to:event.target.value}))}/></Field><Button variant="secondary" loading={busy} onClick={exportReport}><Download className="h-4 w-4"/> Export Excel</Button></div></div></Card>
    <Tabs value={section} onChange={setSection} items={[{key:"dashboard",label:"Dashboard Fleet"},{key:"reminder",label:"Reminder Preventive",count:data?.reminders.length},{key:"evidence",label:"Evidence"},{key:"reconciliation",label:"Rekonsiliasi Tank"},{key:"audit",label:"Audit Timeline"}]}/>

    {section === "dashboard" ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metric(format(data?.summary.active_fleet,0),"Armada aktif",<Gauge className="h-5 w-5"/>,"bg-blue-50 text-blue-700")}
        {metric(format(data?.summary.preventive_due,0),"Preventive due",<CalendarClock className="h-5 w-5"/>,"bg-amber-50 text-amber-700")}
        {metric(format(data?.summary.unsafe_count,0),"Unsafe inspection",<AlertTriangle className="h-5 w-5"/>,"bg-rose-50 text-rose-700")}
        {metric(format(data?.summary.open_anomalies,0),"Anomaly terbuka",<ShieldCheck className="h-5 w-5"/>,"bg-violet-50 text-violet-700")}
        {metric(`${format(data?.summary.fuel_liter)} L`,"Pemakaian BBM",<Fuel className="h-5 w-5"/>,"bg-cyan-50 text-cyan-700")}
        {metric(format(data?.summary.avg_efficiency,3),"Rata-rata efisiensi",<Gauge className="h-5 w-5"/>,"bg-emerald-50 text-emerald-700")}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="p-4"><h3 className="font-semibold text-slate-900">Tren pemakaian BBM</h3><p className="text-xs text-slate-500">Liter per hari pada periode terpilih.</p><div className="mt-5 flex h-48 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">{data?.trend.map((item)=><div key={item.period_date} className="group flex min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${item.period_date}: ${format(item.fuel_liter)} L`}><span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">{format(item.fuel_liter,0)}</span><div className="w-full rounded-t bg-blue-500" style={{height:`${Math.max(4,Number(item.fuel_liter)/maxFuel*145)}px`}}/><span className="rotate-[-45deg] whitespace-nowrap text-[9px] text-slate-400">{String(item.period_date).slice(5)}</span></div>)}</div>{!data?.trend.length?<p className="py-16 text-center text-sm text-slate-400">Belum ada transaksi BBM approved pada periode ini.</p>:null}</Card>
        <Card className="overflow-hidden"><div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Efisiensi terendah</h3><p className="text-xs text-slate-500">Prioritas pengecekan konsumsi armada.</p></div><div className="divide-y divide-slate-100">{data?.efficiency.slice(0,7).map((item)=><div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium text-slate-800">{item.AssetName}</p><p className="text-xs text-slate-400">{item.AssetCode} · {format(item.fuel_liter)} L</p></div><div className="text-right"><p className="font-semibold text-slate-900">{format(item.avg_efficiency,3)}</p><p className="text-[10px] text-slate-400">{item.meter_type === "ODOMETER" ? "km/L" : "jam/L"}</p></div></div>)}</div></Card>
      </div>
    </div>:null}

    {section === "reminder" ? <div className="space-y-3"><div className="flex justify-end">{canWrite?<Button loading={busy} onClick={()=>run(()=>refreshFleetReminders(),"Reminder Fleet diperbarui")}><RefreshCw className="h-4 w-4"/> Hitung Ulang Reminder</Button>:null}</div><div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Asset","Dasar","Jatuh tempo","Meter","Status","WO / Aksi"].map((value)=><th key={value} className="px-4 py-3">{value}</th>)}</tr></thead><tbody>{data?.reminders.map((item)=><tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium text-slate-800">{item.AssetName}</p><p className="text-xs text-slate-400">{item.AssetCode}</p></td><td className="px-4 py-3">{item.trigger_type === "DATE"?"Tanggal":"Meter"}</td><td className="px-4 py-3">{item.due_date||"-"}</td><td className="px-4 py-3">{item.due_meter==null?"-":`${format(item.current_meter)} / ${format(item.due_meter)}`}</td><td className="px-4 py-3"><StatusBadge status={item.status}/></td><td className="px-4 py-3">{item.wo_number?<span className="font-medium text-brand-700">{item.wo_number}</span>:canWrite?<Button loading={busy} onClick={()=>run(()=>createFleetReminderWorkOrder(item.id),"WO preventive Fleet dibuat")}>Buat WO</Button>:"-"}</td></tr>)}</tbody></table></div>{!data?.reminders.length?<Card className="p-8 text-center text-sm text-slate-500">Tidak ada preventive Fleet yang jatuh tempo.</Card>:null}</div>:null}

    {section === "evidence" ? <div className="grid gap-4 xl:grid-cols-2"><EvidenceList title="Daily Inspection" type="INSPECTION" items={(overview?.inspections??[]).map((item)=>({id:item.id,label:item.inspection_number,asset:item.AssetName,date:item.inspected_at}))} onOpen={setEvidence}/><EvidenceList title="Service & Corrective" type="SERVICE" items={(overview?.services??[]).map((item)=>({id:item.id,label:item.service_number,asset:item.AssetName,date:item.started_at}))} onOpen={setEvidence}/></div>:null}

    {section === "reconciliation" ? <div className="space-y-3"><div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Fuel Tank","Fleet transaction","Tank movement","Selisih","Unmatched","Orphan","Aksi"].map((value)=><th key={value} className="px-4 py-3">{value}</th>)}</tr></thead><tbody>{reconciliation.data?.data.map((item)=><tr key={item.fuel_tank_id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium text-slate-800">{item.AssetName}</p><p className="text-xs text-slate-400">{item.AssetCode}</p></td><td className="px-4 py-3">{format(item.fleet_transaction_liter)} L</td><td className="px-4 py-3">{format(item.tank_movement_liter)} L</td><td className={`px-4 py-3 font-semibold ${Math.abs(Number(item.variance_liter))>.001?"text-rose-600":"text-emerald-600"}`}>{format(item.variance_liter)} L</td><td className="px-4 py-3">{item.unmatched_transaction_count}</td><td className="px-4 py-3">{item.orphan_movement_count}</td><td className="px-4 py-3">{canWrite?<Button loading={busy} onClick={()=>run(()=>saveFleetReconciliation({fuel_tank_id:item.fuel_tank_id,period_start:filters.date_from,period_end:filters.date_to,notes:notes[item.fuel_tank_id]}),"Rekonsiliasi disimpan")}>Simpan</Button>:null}</td></tr>)}</tbody></table></div><Field label="Catatan rekonsiliasi (opsional)"><Textarea placeholder="Catatan berlaku per tank saat tombol Simpan ditekan." onChange={(event)=>{const value=event.target.value;(reconciliation.data?.data??[]).forEach((item)=>setNotes((current)=>({...current,[item.fuel_tank_id]:value})));}}/></Field><Card className="overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">History Rekonsiliasi</h3></div><div className="divide-y">{data?.reconciliations.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{item.reconciliation_number} · {item.AssetName}</p><p className="text-xs text-slate-400">{item.period_start} s/d {item.period_end} · Selisih {format(item.variance_liter)} L</p></div><div className="flex gap-2"><StatusBadge status={item.status||"DRAFT"}/>{item.status==="DRAFT"&&item.id&&canWrite?<Button variant="secondary" loading={busy} onClick={()=>run(()=>reviewFleetReconciliation(item.id!),"Rekonsiliasi direview")}>Review</Button>:null}</div></div>)}</div></Card></div>:null}

    {section === "audit" ? <Card className="overflow-hidden"><div className="divide-y divide-slate-100">{audit.data?.data.map((item)=><div key={item.id} className="flex gap-3 p-4"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500"/><div><p className="text-sm font-medium text-slate-800">{item.event_summary}</p><p className="text-xs text-slate-400">{item.event_at} · {item.actor_name||"SYSTEM"} · {item.AssetName||item.entity_type}</p></div></div>)}</div>{!audit.data?.data.length?<p className="p-8 text-center text-sm text-slate-500">Audit timeline Fleet belum memiliki event.</p>:null}</Card>:null}

    <Modal open={Boolean(evidence)} onClose={()=>{setEvidence(null);setFiles([]);}} title={`Evidence ${evidence?.label??""}`} description="Foto JPG/PNG/WebP atau PDF, maksimal 10 MB per file." footer={<><Button variant="secondary" onClick={()=>setEvidence(null)}>Tutup</Button>{canWrite?<Button loading={busy} disabled={!files.length} onClick={()=>run(async()=>{if(!evidence)return;await uploadFleetAttachments(evidence.type,evidence.id,files);setFiles([]);await evidenceQuery.refetch();},"Evidence Fleet diunggah")}>Upload</Button>:null}</>}>
      {canWrite?<Field label="Pilih evidence"><Input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event)=>setFiles(Array.from(event.target.files??[]))}/></Field>:null}
      <div className="mt-4 space-y-2">{evidenceQuery.data?.data.map((item)=><div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><a href={item.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"><FileImage className="h-4 w-4 shrink-0"/><span className="truncate">{item.file_name}</span></a>{canWrite?<Button variant="danger" onClick={()=>run(async()=>{await deleteFleetAttachment(item.id);await evidenceQuery.refetch();},"Evidence dihapus")}>Hapus</Button>:null}</div>)}</div>
    </Modal>
  </div>;
}

function EvidenceList({ title, type, items, onOpen }: { title: string; type: "INSPECTION"|"SERVICE"; items: Array<{id:number;label:string;asset:string;date:string}>; onOpen:(value:{type:"INSPECTION"|"SERVICE";id:number;label:string})=>void }) {
  return <Card className="overflow-hidden"><div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-900">{title}</h3></div><div className="divide-y divide-slate-100">{items.slice(0,30).map((item)=><div key={item.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium text-slate-800">{item.label}</p><p className="text-xs text-slate-400">{item.asset} · {item.date}</p></div><Button variant="secondary" onClick={()=>onOpen({type,id:item.id,label:item.label})}><FileImage className="h-4 w-4"/> Evidence</Button></div>)}</div>{!items.length?<p className="p-8 text-center text-sm text-slate-500">Belum ada data.</p>:null}</Card>;
}
