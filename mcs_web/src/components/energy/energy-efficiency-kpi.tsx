"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, CheckCircle2, Pencil, Plus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { createEnergyEfficiencyKpi, getEnergyEfficiencyKpis, transitionEnergyEfficiencyKpi, updateEnergyEfficiencyKpi } from "@/lib/api/energy";
import { formatQty } from "@/lib/format";
import type { EnergyEfficiencyKpi, EnergyEfficiencyKpiInput, EnergyKpiEvaluation, EnergyKpiMetricCode, EnergyKpiProfileOption } from "@/types/energy";

const METRIC_LABELS: Record<EnergyKpiMetricCode, string> = {
  ELECTRICITY_CONSUMPTION: "Konsumsi listrik",
  WATER_CONSUMPTION: "Konsumsi air",
  GENSET_KWH_PER_LITER: "Efisiensi genset (kWh/liter)",
  GENSET_KWH_PER_HOUR: "Produktivitas genset (kWh/jam)",
  COMPRESSOR_OUTPUT_PER_HOUR: "Output compressor per jam",
  BOILER_OUTPUT_PER_HOUR: "Output boiler per jam",
};

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

function evaluationTone(status: EnergyKpiEvaluation["result_status"]): "green" | "amber" | "red" | "slate" {
  if (status === "ACHIEVED") return "green";
  if (status === "WARNING") return "amber";
  if (status === "BELOW_MINIMUM") return "red";
  return "slate";
}

export function EnergyEfficiencyKpiPanel({ canWrite }: { canWrite: boolean }) {
  const initialDates = useMemo(() => ({ from: monthStart(), to: today() }), []);
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [company, setCompany] = useState("");
  const [editing, setEditing] = useState<EnergyEfficiencyKpi | null | undefined>(undefined);
  const [newVersion, setNewVersion] = useState(false);
  const [busy, setBusy] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const filters = { date_from: dateFrom, date_to: dateTo, company };
  const query = useQuery({ queryKey: ["energy-efficiency-kpis", filters], queryFn: ({ signal }) => getEnergyEfficiencyKpis(filters, signal) });
  const data = query.data?.data;

  const transition = (item: EnergyEfficiencyKpi, action: "activate" | "archive") => confirm.ask({
    title: action === "activate" ? `Aktifkan ${item.kpi_code} v${item.version_no}?` : `Nonaktifkan ${item.kpi_code}?`,
    description: action === "activate" ? "Versi aktif sebelumnya dengan kode yang sama akan dinonaktifkan." : "KPI tidak lagi dihitung pada evaluasi berikutnya.",
    confirmLabel: action === "activate" ? "Aktifkan KPI" : "Nonaktifkan",
    tone: action === "archive" ? "danger" : "primary",
    loading: busy === `${item.id}-${action}`,
    onConfirm: async () => {
      setBusy(`${item.id}-${action}`);
      try { const result = await transitionEnergyEfficiencyKpi(item.id, action); toast.success(result.message); confirm.close(); await query.refetch(); }
      catch (error) { toast.error("Perubahan status KPI gagal", error instanceof Error ? error.message : undefined); }
      finally { setBusy(""); }
    },
  });

  return <div className="space-y-4">
    <div className="card flex flex-wrap items-center gap-2 p-3">
      <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500"><span>Dari</span><input type="date" className="h-9 bg-transparent text-sm text-slate-700 outline-none" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500"><span>Sampai</span><input type="date" className="h-9 bg-transparent text-sm text-slate-700 outline-none" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} /></label>
      <Select className="h-10 w-auto min-w-[170px]" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">Semua company</option>{(data?.options.companies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      <div className="ml-auto flex gap-2"><Button variant="secondary" onClick={() => query.refetch()} aria-label="Muat ulang KPI"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>{canWrite ? <Button onClick={() => { setEditing(null); setNewVersion(false); }}><Plus className="h-4 w-4" /> Tambah KPI</Button> : null}</div>
    </div>

    {query.isLoading ? <LoadingSkeleton rows={8} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : data ? <>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Evaluasi KPI aktif</h2><p className="mt-1 text-xs text-slate-500">Dihitung langsung dari transaksi yang telah dikunci pada periode pilihan.</p></div><div className="text-right"><p className="text-xs text-slate-500">Skor tertimbang</p><p className="text-2xl font-semibold tabular-nums text-slate-900">{data.overall_score == null ? "N/M" : `${formatQty(data.overall_score)}%`}</p></div></div>
        {!data.evaluations.length ? <EmptyState title="Belum ada KPI aktif" description="Buat draft KPI, lengkapi baseline dan target, lalu aktifkan." className="py-10" /> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2.5">KPI / Scope</th><th className="px-4 py-2.5 text-right">Baseline</th><th className="px-4 py-2.5 text-right">Aktual</th><th className="px-4 py-2.5 text-right">Target</th><th className="px-4 py-2.5 text-right">Perbaikan</th><th className="px-4 py-2.5 text-right">Capaian</th><th className="px-4 py-2.5">Hasil</th></tr></thead><tbody className="divide-y divide-slate-100">{data.evaluations.map((item) => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-slate-800">{item.kpi_name}</p><p className="text-xs text-slate-400">{item.kpi_code} · {scopeLabel(item)} · {item.sample_count} sampel</p></td><MetricCell value={Number(item.baseline_value)} unit={item.unit} /><MetricCell value={item.actual_value} unit={item.unit} strong /><MetricCell value={Number(item.target_value)} unit={item.unit} /><MetricCell value={item.improvement_from_baseline_percent} unit="%" signed /><MetricCell value={item.achievement_percent} unit="%" /><td className="px-4 py-3"><StatusBadge status={item.result_status.replaceAll("_", " ")} tone={evaluationTone(item.result_status)} /></td></tr>)}</tbody></table></div>}
      </section>

      <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Definisi dan versi KPI</h2><p className="mt-1 text-xs text-slate-500">Draft dapat diedit. Perubahan KPI aktif dibuat sebagai versi baru agar histori tetap utuh.</p></div>{!data.definitions.length ? <EmptyState title="Belum ada definisi KPI" description="Tambahkan KPI efisiensi pertama untuk mulai membandingkan baseline dan target." className="py-10" /> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2.5">Kode / Versi</th><th className="px-4 py-2.5">Metric</th><th className="px-4 py-2.5">Scope</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5 text-right">Bobot</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.definitions.map((item) => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-slate-800">{item.kpi_code} · v{item.version_no}</p><p className="text-xs text-slate-400">{item.kpi_name}</p></td><td className="px-4 py-3">{METRIC_LABELS[item.metric_code]}</td><td className="px-4 py-3">{scopeLabel(item)}</td><td className="px-4 py-3">{item.owner_name}</td><td className="px-4 py-3 text-right tabular-nums">{formatQty(item.weight_percent)}%</td><td className="px-4 py-3"><StatusBadge status={item.status} tone={item.status === "ACTIVE" ? "green" : item.status === "DRAFT" ? "amber" : "slate"} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canWrite && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => { setEditing(item); setNewVersion(false); }}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" onClick={() => transition(item, "activate")}><CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan</Button></> : null}{canWrite && item.status === "ACTIVE" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => { setEditing(item); setNewVersion(true); }}><Plus className="h-3.5 w-3.5" /> Versi Baru</Button><Button variant="ghost" className="h-8 px-2 text-rose-600" onClick={() => transition(item, "archive")}><Archive className="h-3.5 w-3.5" /> Nonaktifkan</Button></> : null}</div></td></tr>)}</tbody></table></div>}</section>
    </> : null}
    {editing !== undefined && data ? <KpiForm initial={editing} createNewVersion={newVersion} profiles={data.options.profiles} companies={data.options.companies} onClose={() => setEditing(undefined)} onSaved={async () => { await query.refetch(); }} /> : null}
    <ConfirmDialog {...(confirm.confirmProps as ComponentProps<typeof ConfirmDialog>)} />
  </div>;
}

function MetricCell({ value, unit, strong = false, signed = false }: { value: number | null; unit: string; strong?: boolean; signed?: boolean }) {
  return <td className={`px-4 py-3 text-right tabular-nums ${strong ? "font-semibold text-slate-900" : ""}`}>{value == null ? "N/M" : `${signed && value > 0 ? "+" : ""}${formatQty(value)} ${unit}`}</td>;
}

function scopeLabel(item: Pick<EnergyEfficiencyKpi, "scope_type" | "scope_company" | "AssetCode" | "AssetName">): string {
  if (item.scope_type === "COMPANY") return item.scope_company || "Company";
  if (item.scope_type === "ASSET") return item.AssetCode || item.AssetName || "Asset";
  return "Global";
}

function KpiForm({ initial, createNewVersion, profiles, companies, onClose, onSaved }: { initial: EnergyEfficiencyKpi | null; createNewVersion: boolean; profiles: EnergyKpiProfileOption[]; companies: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EnergyEfficiencyKpiInput>({
    kpi_code: initial?.kpi_code ?? "", kpi_name: initial?.kpi_name ?? "", metric_code: initial?.metric_code ?? "ELECTRICITY_CONSUMPTION",
    scope_type: initial?.scope_type ?? "GLOBAL", scope_company: initial?.scope_company ?? "", energy_profile_id: initial?.energy_profile_id ? String(initial.energy_profile_id) : "",
    period_type: initial?.period_type ?? "MONTHLY", unit: initial?.unit ?? "", baseline_value: initial ? String(initial.baseline_value) : "", baseline_start: initial?.baseline_start ?? monthStart(), baseline_end: initial?.baseline_end ?? today(),
    target_value: initial ? String(initial.target_value) : "", minimum_value: initial ? String(initial.minimum_value) : "", weight_percent: initial ? String(initial.weight_percent) : "100",
    owner_name: initial?.owner_name ?? "", effective_from: initial?.effective_from ?? today(), effective_to: initial?.effective_to ?? "", notes: initial?.notes ?? "",
  });
  const set = (key: keyof EnergyEfficiencyKpiInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const metricInfo = form.metric_code.includes("CONSUMPTION") ? { direction: "Lebih rendah lebih baik", icon: TrendingDown } : { direction: "Lebih tinggi lebih baik", icon: TrendingUp };
  const save = async () => {
    setSaving(true);
    try {
      const result = initial && !createNewVersion ? await updateEnergyEfficiencyKpi(initial.id, form) : await createEnergyEfficiencyKpi(form);
      toast.success(result.message); await onSaved(); onClose();
    } catch (error) { toast.error("KPI Energy gagal disimpan", error instanceof Error ? error.message : undefined); }
    finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} title={createNewVersion ? `Versi Baru ${initial?.kpi_code}` : initial ? "Ubah Draft KPI" : "Tambah KPI Efisiensi Energy"} description="Baseline kosong akan dihitung otomatis dari transaksi terkunci pada periode baseline." size="2xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Kode KPI" required><Input value={form.kpi_code} disabled={Boolean(initial)} onChange={(event) => set("kpi_code", event.target.value.toUpperCase())} placeholder="EN-ELECTRICITY-01" /></Field><Field label="Nama KPI" required><Input value={form.kpi_name} onChange={(event) => set("kpi_name", event.target.value)} /></Field><Field label="Metric" required><Select value={form.metric_code} onChange={(event) => { const metric = event.target.value as EnergyKpiMetricCode; setForm((current) => ({ ...current, metric_code: metric, unit: "" })); }}>{Object.entries(METRIC_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><Field label="Arah KPI" hint="Ditentukan oleh metric."><div className="input-base flex items-center gap-2 bg-slate-50 text-slate-600"><metricInfo.icon className="h-4 w-4" /> {metricInfo.direction}</div></Field><Field label="Scope" required><Select value={form.scope_type} onChange={(event) => set("scope_type", event.target.value)}><option value="GLOBAL">Global</option><option value="COMPANY">Company</option><option value="ASSET">Energy Asset</option></Select></Field>{form.scope_type === "COMPANY" ? <Field label="Company" required><Select value={form.scope_company} onChange={(event) => set("scope_company", event.target.value)}><option value="">Pilih company…</option>{companies.map((item) => <option key={item}>{item}</option>)}</Select></Field> : form.scope_type === "ASSET" ? <Field label="Energy Asset" required><Select value={form.energy_profile_id} onChange={(event) => set("energy_profile_id", event.target.value)}><option value="">Pilih asset…</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.AssetCode} · {item.AssetName}</option>)}</Select></Field> : <div />}
      <Field label="Periode evaluasi" required><Select value={form.period_type} onChange={(event) => set("period_type", event.target.value)}><option value="DAILY">Harian</option><option value="WEEKLY">Mingguan</option><option value="MONTHLY">Bulanan</option><option value="QUARTERLY">Kuartalan</option><option value="YEARLY">Tahunan</option></Select></Field><Field label="Satuan" hint="Kosongkan untuk satuan default metric."><Input value={form.unit} onChange={(event) => set("unit", event.target.value)} /></Field>
      <Field label="Awal baseline" required><Input type="date" value={form.baseline_start} max={form.baseline_end} onChange={(event) => set("baseline_start", event.target.value)} /></Field><Field label="Akhir baseline" required><Input type="date" value={form.baseline_end} min={form.baseline_start} onChange={(event) => set("baseline_end", event.target.value)} /></Field><Field label="Nilai baseline" hint="Opsional; kosongkan agar dihitung dari data LOCKED."><Input inputMode="decimal" value={form.baseline_value} onChange={(event) => set("baseline_value", event.target.value)} placeholder="Hitung otomatis" /></Field><Field label="Target" required><Input inputMode="decimal" value={form.target_value} onChange={(event) => set("target_value", event.target.value)} /></Field><Field label="Ambang minimum/batas" required><Input inputMode="decimal" value={form.minimum_value} onChange={(event) => set("minimum_value", event.target.value)} /></Field><Field label="Bobot (%)" required><Input inputMode="decimal" value={form.weight_percent} onChange={(event) => set("weight_percent", event.target.value)} /></Field><Field label="Owner KPI" required><Input value={form.owner_name} onChange={(event) => set("owner_name", event.target.value)} /></Field><Field label="Berlaku mulai" required><Input type="date" value={form.effective_from} onChange={(event) => set("effective_from", event.target.value)} /></Field><Field label="Berlaku sampai"><Input type="date" value={form.effective_to} min={form.effective_from} onChange={(event) => set("effective_to", event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Catatan"><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field></div>
    </div>
  </Modal>;
}
