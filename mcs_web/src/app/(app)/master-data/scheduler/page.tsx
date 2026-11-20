"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Pause, Play, Plus, RefreshCw, Timer } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import { useRunPreventiveScheduleCron } from "@/hooks/use-preventive-schedules";
import { canRead, canWrite } from "@/lib/permissions";
import { createStockOpnameSchedule, getStockOpnameScheduleOptions, getStockOpnameSchedules, runStockOpnameScheduleCron, setStockOpnameScheduleStatus, updateStockOpnameSchedule, type StockOpnameSchedule, type StockOpnameScheduleInput } from "@/lib/api/stock-opname-schedules";

type Choice = { value: string; label: string };
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): StockOpnameScheduleInput => ({ schedule_name: "", recurrence_type: "MONTHLY", interval_value: 1, start_date: today(), end_date: "", is_bom: false, company_ids: [], category_ids: [], location_ids: [], assignee_user_ids: [], notes: "" });

function choices(source: unknown, key: "companies" | "categories" | "locations"): Choice[] {
  const object = source && typeof source === "object" ? source as Record<string, unknown> : {};
  const list = Array.isArray(object[key]) ? object[key] as Array<Record<string, unknown>> : [];
  const valueKeys = key === "companies" ? ["companyId", "value", "id"] : key === "categories" ? ["categoryCode", "value", "id"] : ["locationCode", "value", "id"];
  const labelKeys = key === "companies" ? ["companyName", "label", "name"] : key === "categories" ? ["categoryName", "label", "name"] : ["locationName", "label", "name"];
  return list.map((item) => ({ value: String(valueKeys.map((field) => item[field]).find(Boolean) ?? ""), label: String(labelKeys.map((field) => item[field]).find(Boolean) ?? "") })).filter((item) => item.value);
}

function Checks({ label, items, values, onChange }: { label: string; items: Choice[]; values: string[]; onChange: (value: string[]) => void }) {
  return <div><Label>{label}</Label><div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{items.length ? items.map((item) => <label key={item.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={values.includes(item.value)} onChange={() => onChange(values.includes(item.value) ? values.filter((value) => value !== item.value) : [...values, item.value])}/>{item.label || item.value}</label>) : <p className="p-2 text-xs text-slate-400">Belum ada pilihan.</p>}</div></div>;
}

function ScheduleForm({ initial, close, saved }: { initial: StockOpnameSchedule | null; close: () => void; saved: () => Promise<void> }) {
  const toast = useToast();
  const options = useQuery({ queryKey: ["so-schedule-options"], queryFn: ({ signal }) => getStockOpnameScheduleOptions(signal) });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<StockOpnameScheduleInput>(() => initial ? ({ schedule_name: initial.schedule_name, recurrence_type: initial.recurrence_type, interval_value: initial.interval_value, start_date: initial.start_date.slice(0, 10), end_date: initial.end_date?.slice(0, 10) ?? "", is_bom: Number(initial.is_bom) === 1, company_ids: initial.company_ids, category_ids: initial.category_ids, location_ids: initial.location_ids, assignee_user_ids: initial.assignees.map((item) => Number(item.user_id)), notes: initial.notes ?? "" }) : blank());
  const set = <K extends keyof StockOpnameScheduleInput>(key: K, value: StockOpnameScheduleInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { setBusy(true); try { initial ? await updateStockOpnameSchedule(initial.id, form) : await createStockOpnameSchedule(form); toast.success(initial ? "Jadwal SO diperbarui" : "Jadwal SO dibuat"); await saved(); close(); } catch (error) { toast.error("Jadwal SO gagal disimpan", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const masters = options.data?.data.masters;
  const users = options.data?.data.users ?? [];
  return <Modal open onClose={close} title={initial ? "Ubah Jadwal Stock Opname" : "Buat Jadwal Stock Opname"} description="Dokumen SO akan dibuat otomatis untuk petugas terpilih." size="2xl" footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={busy} onClick={save}>Simpan</Button></>}>
    {options.isLoading ? <LoadingSkeleton rows={5}/> : options.error ? <ErrorState error={options.error} onRetry={() => options.refetch()}/> : <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Nama jadwal</Label><Input value={form.schedule_name} onChange={(event) => set("schedule_name", event.target.value)} placeholder="Contoh: SO Asset IT Bulanan"/></div>
      <div><Label>Periode</Label><Select value={form.recurrence_type} onChange={(event) => set("recurrence_type", event.target.value as StockOpnameScheduleInput["recurrence_type"])}><option value="DAILY">Harian</option><option value="WEEKLY">Mingguan</option><option value="MONTHLY">Bulanan</option></Select></div>
      <div><Label>Interval</Label><Input type="number" min={1} max={365} value={form.interval_value} onChange={(event) => set("interval_value", Number(event.target.value) || 1)}/></div>
      <div><Label>Mulai</Label><Input type="date" value={form.start_date} onChange={(event) => set("start_date", event.target.value)}/></div>
      <div><Label>Selesai (opsional)</Label><Input type="date" value={form.end_date} onChange={(event) => set("end_date", event.target.value)}/></div>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 sm:col-span-2"><input type="checkbox" checked={form.is_bom} onChange={(event) => set("is_bom", event.target.checked)}/><span className="text-sm font-medium">Stock Opname BOM / Part</span></label>
      <Checks label="Company" items={choices(masters, "companies")} values={form.company_ids} onChange={(value) => set("company_ids", value)}/>
      <Checks label="Kategori asset" items={choices(masters, "categories")} values={form.category_ids} onChange={(value) => set("category_ids", value)}/>
      <Checks label="Lokasi" items={choices(masters, "locations")} values={form.location_ids} onChange={(value) => set("location_ids", value)}/>
      <Checks label="Petugas SO" items={users.map((item) => ({ value: String(item.value), label: `${item.label}${item.division ? ` · ${item.division}` : ""}` }))} values={form.assignee_user_ids.map(String)} onChange={(value) => set("assignee_user_ids", value.map(Number))}/>
      <div className="sm:col-span-2"><Label>Catatan</Label><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)}/></div>
    </div>}
  </Modal>;
}

export default function SchedulerPage() {
  const { data: user, isLoading } = useMe();
  const toast = useToast();
  const preventive = useRunPreventiveScheduleCron();
  const schedules = useQuery({ queryKey: ["stock-opname-schedules"], queryFn: ({ signal }) => getStockOpnameSchedules(signal), enabled: !isLoading && canRead(user, "scheduler") });
  const [form, setForm] = useState<StockOpnameSchedule | "new" | null>(null);
  const [running, setRunning] = useState(false);
  if (isLoading) return <PageContainer title="Scheduler"><LoadingSkeleton rows={4}/></PageContainer>;
  if (!canRead(user, "scheduler")) return <PageContainer title="Scheduler"><AccessDenied/></PageContainer>;
  const writable = canWrite(user, "scheduler");
  const runPreventive = async () => { try { const result = await preventive.mutateAsync(); toast.info(result.data.generated_count ? `${result.data.generated_count} WO dibuat` : "Tidak ada preventive yang jatuh tempo"); } catch (error) { toast.error("Cron preventive gagal", error instanceof Error ? error.message : undefined); } };
  const runSo = async () => { setRunning(true); try { const result = await runStockOpnameScheduleCron(); toast.success("Scheduler SO selesai", `${result.data.created} dibuat · ${result.data.failed} gagal`); await schedules.refetch(); } catch (error) { toast.error("Scheduler SO gagal", error instanceof Error ? error.message : undefined); } finally { setRunning(false); } };
  const toggle = async (item: StockOpnameSchedule) => { await setStockOpnameScheduleStatus(item.id, item.status === "ACTIVE" ? "PAUSED" : "ACTIVE"); await schedules.refetch(); };
  const rows = schedules.data?.data ?? [];
  return <PageContainer title="Scheduler" description="Kelola proses otomatis Preventive Maintenance dan Stock Opname.">
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><Timer className="h-5 w-5"/></span><div><h2 className="font-semibold">Generate WO Preventive</h2><p className="text-sm text-slate-500">Otomatis setiap hari pukul 00:01 WIB.</p></div></div><Button variant="secondary" disabled={!writable || preventive.isPending} onClick={runPreventive}>Jalankan Preventive</Button></Card>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Jadwal Stock Opname</h2><p className="text-sm text-slate-500">Membuat dokumen SO otomatis pukul 00:05 WIB dan menugaskan petugas.</p></div><div className="flex gap-2"><Button variant="secondary" disabled={!writable || running} onClick={runSo}><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`}/> Proses Jadwal</Button><Button disabled={!writable} onClick={() => setForm("new")}><Plus className="h-4 w-4"/> Buat Jadwal</Button></div></div>
    <div className="mt-4">{schedules.isLoading ? <LoadingSkeleton rows={5}/> : schedules.error ? <ErrorState error={schedules.error} onRetry={() => schedules.refetch()}/> : !rows.length ? <EmptyState title="Belum ada jadwal Stock Opname" description="Buat jadwal dan tentukan petugas SO."/> : <div className="grid gap-3 lg:grid-cols-2">{rows.map((item) => <Card key={item.id} className="p-4"><div className="flex justify-between gap-3"><div className="flex gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><CalendarClock className="h-5 w-5"/></span><div><button className="text-left font-semibold hover:text-brand-600" onClick={() => setForm(item)}>{item.schedule_name}</button><p className="text-xs text-slate-500">{item.schedule_code} · {item.is_bom ? "BOM / Part" : "Asset"}</p></div></div><span className="text-xs font-semibold text-slate-500">{item.status}</span></div><div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><p>Berikutnya: <b>{item.next_run_date}</b> · Setiap {item.interval_value} {item.recurrence_type.toLowerCase()}</p><p className="mt-1">Petugas: <b>{item.assignees.map((assignee) => assignee.fullname).join(", ")}</b></p>{item.last_no_so ? <p className="mt-1">SO terakhir: <b>{item.last_no_so}</b></p> : null}</div><div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => toggle(item)}>{item.status === "ACTIVE" ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}{item.status === "ACTIVE" ? "Jeda" : "Aktifkan"}</Button><Button variant="secondary" onClick={() => setForm(item)}>Ubah</Button></div></Card>)}</div>}</div>
    {form ? <ScheduleForm initial={form === "new" ? null : form} close={() => setForm(null)} saved={async () => { await schedules.refetch(); }}/> : null}
  </PageContainer>;
}
