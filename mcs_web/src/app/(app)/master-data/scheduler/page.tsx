"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Pause, Play, Plus, RefreshCw, Timer, Trash2 } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import { useRunPreventiveScheduleCron } from "@/hooks/use-preventive-schedules";
import { canRead, canWrite } from "@/lib/permissions";
import { createStockOpnameSchedule, getStockOpnameMonitoring, getStockOpnameScheduleOptions, getStockOpnameSchedules, runStockOpnameScheduleCron, setStockOpnameScheduleStatus, updateStockOpnameSchedule, type StockOpnameLocationAssignment, type StockOpnameSchedule, type StockOpnameScheduleInput, type StockOpnameScheduleOptions } from "@/lib/api/stock-opname-schedules";

type Choice = { value: string; label: string };
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): StockOpnameScheduleInput => ({ schedule_name: "", recurrence_type: "MONTHLY", interval_value: 1, start_date: today(), end_date: "", is_bom: false, company_ids: [], category_ids: [], location_assignments: [], notes: "" });

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

function AssignmentRows({ value, options, onChange }: { value: StockOpnameLocationAssignment[]; options?: StockOpnameScheduleOptions; onChange: (value: StockOpnameLocationAssignment[]) => void }) {
  const locations = choices(options?.masters, "locations");
  const users = options?.users ?? [];
  const update = (index: number, patch: Partial<StockOpnameLocationAssignment>) => onChange(value.map((item, row) => row === index ? { ...item, ...patch } : item));
  return <div className="sm:col-span-2"><div className="mb-2 flex items-center justify-between"><Label>Petugas per lokasi</Label><Button type="button" variant="secondary" onClick={() => onChange([...value, { location_id: "", location_name: null, user_id: 0 }])}><Plus className="h-4 w-4"/> Tambah</Button></div>
    <div className="space-y-2">{value.length ? value.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <div><Label>Lokasi</Label><Select value={item.location_id} onChange={(event) => { const selected = locations.find((location) => location.value === event.target.value); update(index, { location_id: String(selected?.value ?? ""), location_name: selected?.label ?? null }); }}><option value="">Pilih lokasi</option>{locations.map((location) => <option key={location.value} value={location.value}>{location.label || location.value}</option>)}</Select></div>
      <div><Label>Petugas MCS</Label><Select value={item.user_id || 0} onChange={(event) => update(index, { user_id: Number(event.target.value) })}><option value={0}>Pilih petugas</option>{users.map((user) => <option key={user.value} value={user.value}>{user.label} · {user.division || user.username}</option>)}</Select></div>
      <Button type="button" variant="ghost" className="self-end text-red-600" onClick={() => onChange(value.filter((_, row) => row !== index))}><Trash2 className="h-4 w-4"/></Button>
    </div>) : <p className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">Tambahkan lokasi dan petugas yang akan mengerjakannya. Maksimal dua lokasi per petugas.</p>}</div>
  </div>;
}

function ScheduleForm({ initial, close, saved }: { initial: StockOpnameSchedule | null; close: () => void; saved: () => Promise<void> }) {
  const toast = useToast();
  const options = useQuery({ queryKey: ["so-schedule-options"], queryFn: ({ signal }) => getStockOpnameScheduleOptions(signal) });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<StockOpnameScheduleInput>(() => initial ? ({ schedule_name: initial.schedule_name, recurrence_type: initial.recurrence_type, interval_value: initial.interval_value, start_date: initial.start_date.slice(0, 10), end_date: initial.end_date?.slice(0, 10) ?? "", is_bom: Number(initial.is_bom) === 1, company_ids: initial.company_ids, category_ids: initial.category_ids, location_assignments: initial.location_assignments, notes: initial.notes ?? "" }) : blank());
  const set = <K extends keyof StockOpnameScheduleInput>(key: K, value: StockOpnameScheduleInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { setBusy(true); try { if (initial) await updateStockOpnameSchedule(initial.id, form); else await createStockOpnameSchedule(form); toast.success(initial ? "Jadwal SO diperbarui" : "Jadwal SO dibuat"); await saved(); close(); } catch (error) { toast.error("Jadwal SO gagal disimpan", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const optionData = options.data?.data;
  const companies = choices(optionData?.masters, "companies");
  const categories = choices(optionData?.masters, "categories");
  return <Modal open onClose={close} title={initial ? "Ubah Jadwal Stock Opname" : "Buat Jadwal Stock Opname"} description="Mengikuti pola PPS: satu NoSO per kategori dan petugas ditugaskan per lokasi." size="2xl" footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={busy} onClick={save}>Simpan</Button></>}>
    {options.isLoading ? <LoadingSkeleton rows={5}/> : options.error ? <ErrorState error={options.error} onRetry={() => options.refetch()}/> : <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Nama jadwal</Label><Input value={form.schedule_name} onChange={(event) => set("schedule_name", event.target.value)} placeholder="Contoh: SO Asset IT Bulanan"/></div>
      <div><Label>Periode</Label><Select value={form.recurrence_type} onChange={(event) => set("recurrence_type", event.target.value as StockOpnameScheduleInput["recurrence_type"])}><option value="DAILY">Harian</option><option value="WEEKLY">Mingguan</option><option value="MONTHLY">Bulanan</option></Select></div>
      <div><Label>Interval</Label><Input type="number" min={1} max={365} value={form.interval_value} onChange={(event) => set("interval_value", Number(event.target.value) || 1)}/></div>
      <div><Label>Mulai</Label><Input type="date" value={form.start_date} onChange={(event) => set("start_date", event.target.value)}/></div>
      <div><Label>Selesai (opsional)</Label><Input type="date" value={form.end_date} onChange={(event) => set("end_date", event.target.value)}/></div>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 sm:col-span-2"><input type="checkbox" checked={form.is_bom} onChange={(event) => set("is_bom", event.target.checked)}/><span className="text-sm font-medium">Stock Opname BOM / Part</span></label>
      <Checks label="Company" items={companies} values={form.company_ids} onChange={(value) => set("company_ids", value)}/>
      <Checks label="Kategori asset" items={categories} values={form.category_ids} onChange={(value) => set("category_ids", value)}/>
      <AssignmentRows value={form.location_assignments} options={optionData} onChange={(value) => set("location_assignments", value)}/>
      <div className="sm:col-span-2"><Label>Catatan</Label><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)}/></div>
    </div>}
  </Modal>;
}

export default function SchedulerPage() {
  const { data: user, isLoading } = useMe();
  const toast = useToast();
  const preventive = useRunPreventiveScheduleCron();
  const schedules = useQuery({ queryKey: ["stock-opname-schedules"], queryFn: ({ signal }) => getStockOpnameSchedules(signal), enabled: !isLoading && canRead(user, "scheduler") });
  const monitoring = useQuery({ queryKey: ["stock-opname-monitoring"], queryFn: ({ signal }) => getStockOpnameMonitoring(signal), enabled: !isLoading && canRead(user, "scheduler") });
  const [form, setForm] = useState<StockOpnameSchedule | "new" | null>(null);
  const [running, setRunning] = useState(false);
  if (isLoading) return <PageContainer title="Scheduler"><LoadingSkeleton rows={4}/></PageContainer>;
  if (!canRead(user, "scheduler")) return <PageContainer title="Scheduler"><AccessDenied/></PageContainer>;
  const writable = canWrite(user, "scheduler");
  const runPreventive = async () => { try { const result = await preventive.mutateAsync(); toast.info(result.data.generated_count ? `${result.data.generated_count} WO dibuat` : "Tidak ada preventive yang jatuh tempo"); } catch (error) { toast.error("Cron preventive gagal", error instanceof Error ? error.message : undefined); } };
  const runSo = async () => { setRunning(true); try { const result = await runStockOpnameScheduleCron(); toast.success("Scheduler SO selesai", `${result.data.created} dibuat · ${result.data.partial} parsial · ${result.data.failed} gagal`); await Promise.all([schedules.refetch(), monitoring.refetch()]); } catch (error) { toast.error("Scheduler SO gagal", error instanceof Error ? error.message : undefined); } finally { setRunning(false); } };
  const toggle = async (item: StockOpnameSchedule) => { await setStockOpnameScheduleStatus(item.id, item.status === "ACTIVE" ? "PAUSED" : "ACTIVE"); await schedules.refetch(); };
  const rows = schedules.data?.data ?? [];
  return <PageContainer title="Scheduler" description="Kelola proses otomatis Preventive Maintenance dan Stock Opname.">
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><Timer className="h-5 w-5"/></span><div><h2 className="font-semibold">Generate WO Preventive</h2><p className="text-sm text-slate-500">Otomatis setiap hari pukul 00:01 WIB.</p></div></div><Button variant="secondary" disabled={!writable || preventive.isPending} onClick={runPreventive}>Jalankan Preventive</Button></Card>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Jadwal Stock Opname</h2><p className="text-sm text-slate-500">Satu NoSO per kategori, dengan penugasan petugas per lokasi otomatis pukul 00:05 WIB.</p></div><div className="flex gap-2"><Button variant="secondary" disabled={!writable || running} onClick={runSo}><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`}/> Proses Jadwal</Button><Button disabled={!writable} onClick={() => setForm("new")}><Plus className="h-4 w-4"/> Buat Jadwal</Button></div></div>
    <div className="mt-4">{schedules.isLoading ? <LoadingSkeleton rows={5}/> : schedules.error ? <ErrorState error={schedules.error} onRetry={() => schedules.refetch()}/> : !rows.length ? <EmptyState title="Belum ada jadwal Stock Opname" description="Buat jadwal dan tentukan petugas per lokasi."/> : <div className="grid gap-3 lg:grid-cols-2">{rows.map((item) => <Card key={item.id} className="p-4"><div className="flex justify-between gap-3"><div className="flex gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><CalendarClock className="h-5 w-5"/></span><div><button className="text-left font-semibold hover:text-brand-600" onClick={() => setForm(item)}>{item.schedule_name}</button><p className="text-xs text-slate-500">{item.schedule_code} · {item.category_ids.length} kategori · {item.is_bom ? "BOM / Part" : "Asset"}</p></div></div><span className="text-xs font-semibold text-slate-500">{item.status}</span></div><div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><p>Berikutnya: <b>{item.next_run_date}</b> · Setiap {item.interval_value} {item.recurrence_type.toLowerCase()}</p><p className="mt-1">Assignment: <b>{item.location_assignments.map((assignment) => `${assignment.location_name || assignment.location_id} → ${assignment.fullname || assignment.username}`).join(", ")}</b></p>{item.last_no_so ? <p className="mt-1">NoSO terakhir: <b>{item.last_no_so}</b></p> : null}</div><div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => toggle(item)}>{item.status === "ACTIVE" ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}{item.status === "ACTIVE" ? "Jeda" : "Aktifkan"}</Button><Button variant="secondary" onClick={() => setForm(item)}>Ubah</Button></div></Card>)}</div>}</div>
    <div className="mt-8 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Monitoring progres SO</h2><p className="text-sm text-slate-500">Realisasi snapshot per petugas dan lokasi.</p></div><Button variant="ghost" onClick={() => monitoring.refetch()}><RefreshCw className={`h-4 w-4 ${monitoring.isFetching ? "animate-spin" : ""}`}/> Refresh</Button></div>
    {monitoring.isLoading ? <div className="mt-4"><LoadingSkeleton rows={4}/></div> : monitoring.error ? <div className="mt-4"><ErrorState error={monitoring.error} onRetry={() => monitoring.refetch()}/></div> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-3 p-4"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><ClipboardList className="h-5 w-5"/></span><div><p className="text-xs text-slate-500">Total snapshot</p><p className="text-xl font-bold">{monitoring.data?.data.summary.total_snapshot ?? 0}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 className="h-5 w-5"/></span><div><p className="text-xs text-slate-500">Sudah dihitung</p><p className="text-xl font-bold">{monitoring.data?.data.summary.checked ?? 0}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><Timer className="h-5 w-5"/></span><div><p className="text-xs text-slate-500">Belum dihitung</p><p className="text-xl font-bold">{monitoring.data?.data.summary.unchecked ?? 0}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><span className="rounded-lg bg-red-50 p-2 text-red-600"><AlertTriangle className="h-5 w-5"/></span><div><p className="text-xs text-slate-500">Selisih</p><p className="text-xl font-bold">{monitoring.data?.data.summary.variance ?? 0}</p></div></Card>
      </div>
      <Card className="mt-4 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">No. SO</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">Petugas</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Dihitung</th><th className="px-4 py-3 text-right">Belum</th><th className="px-4 py-3 text-right">Selisih</th><th className="px-4 py-3">Progres</th></tr></thead><tbody className="divide-y divide-slate-100">{(monitoring.data?.data.rows ?? []).map((item) => <tr key={item.id}><td className="px-4 py-3"><b>{item.no_so}</b><p className="text-xs text-slate-400">{item.type} · {item.category_id}</p></td><td className="px-4 py-3">{item.location_name || item.location_id}</td><td className="px-4 py-3">{item.fullname}<p className="text-xs text-slate-400">Dikerjakan user ini: {item.checked_by_user}</p></td><td className="px-4 py-3 text-right">{item.total_snapshot}</td><td className="px-4 py-3 text-right text-emerald-600">{item.checked}</td><td className="px-4 py-3 text-right text-amber-600">{item.unchecked}</td><td className="px-4 py-3 text-right text-red-600">{item.variance}</td><td className="min-w-36 px-4 py-3"><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${item.progress_percent}%` }}/></div><p className="mt-1 text-xs text-slate-500">{item.progress_percent}%</p></td></tr>)}{!(monitoring.data?.data.rows ?? []).length ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Belum ada sesi SO dari scheduler.</td></tr> : null}</tbody></table></div></Card>
    </>}
    {form ? <ScheduleForm initial={form === "new" ? null : form} close={() => setForm(null)} saved={async () => { await schedules.refetch(); }}/> : null}
  </PageContainer>;
}
