"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Gauge, LockKeyhole, Pencil, Plus, Send } from "lucide-react";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { createUtilityOperation, listUtilityOperations, moveUtilityOperation, updateUtilityOperation } from "@/lib/api/energy";
import { formatDateTime, formatQty } from "@/lib/format";
import type { EnergyAssetProfile, UtilityConditionStatus, UtilityOperation, UtilityOperationInput } from "@/types/energy";

function localDateTime(value?: string | null): string {
  if (value) return value.replace(" ", "T").slice(0, 16);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function workOrderHref(woNumber: string): string {
  return `/work-orders/meso/${woNumber.split("/").map(encodeURIComponent).join("/")}`;
}

function conditionTone(status: UtilityConditionStatus): "green" | "amber" | "red" {
  if (status === "CRITICAL") return "red";
  if (status === "ATTENTION") return "amber";
  return "green";
}

export function UtilityOperations({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  const utilityId = Number(profile.utility_profile_id);
  const toast = useToast();
  const confirm = useConfirm();
  const query = useQuery({
    queryKey: ["energy-utility-operations", utilityId],
    queryFn: ({ signal }) => listUtilityOperations(utilityId, signal),
  });
  const [editing, setEditing] = useState<UtilityOperation | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const operations = query.data?.data.operations ?? [];
  const latest = operations[0];
  const interval = Number(profile.preventive_interval_hours ?? 0);
  const baseline = Number(profile.last_preventive_hour_meter ?? profile.utility_initial_hour_meter ?? 0);
  const nextPreventive = interval > 0 ? baseline + interval : null;

  const submit = async (item: UtilityOperation) => {
    setBusy(`${item.id}-submit`);
    try {
      const response = await moveUtilityOperation(item.id, "submit");
      toast.success(response.message);
      await query.refetch();
    } catch (error) {
      toast.error("Submit inspeksi gagal", error instanceof Error ? error.message : undefined);
    } finally { setBusy(""); }
  };

  const lock = (item: UtilityOperation) => {
    confirm.ask({
      title: "Verifikasi dan kunci inspeksi?",
      description: item.condition_status === "NORMAL"
        ? "Data akan dikunci. Jika hour meter mencapai interval preventive, sistem dapat membuat WO MESO otomatis."
        : "Data abnormal akan dikunci dan sistem dapat membuat WO corrective MESO otomatis. Data yang dikunci tidak dapat diubah.",
      confirmLabel: "Verifikasi & Kunci",
      tone: item.condition_status === "CRITICAL" ? "danger" : "primary",
      onConfirm: async () => {
        confirm.close();
        setBusy(`${item.id}-lock`);
        try {
          const response = await moveUtilityOperation(item.id, "lock");
          const created = response.data.work_orders ?? [];
          toast.success(response.message, created.length ? created.map((wo) => `${wo.type}: ${wo.wo_number}`).join(" · ") : undefined);
          await query.refetch();
        } catch (error) {
          toast.error("Verifikasi inspeksi gagal", error instanceof Error ? error.message : undefined);
        } finally { setBusy(""); }
      },
    });
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ClipboardCheck className="h-4 w-4 text-brand-600" /> Log Operasi & Inspeksi</h2>
          <p className="mt-1 text-xs text-slate-500">Jam operasi, parameter proses, kondisi abnormal, dan WO otomatis.</p>
        </div>
        {canWrite ? <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Catat Inspeksi</Button> : null}
      </div>

      <div className="grid border-b border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
        <Summary label="Hour meter saat ini" value={`${formatQty(profile.utility_current_hour_meter ?? profile.utility_initial_hour_meter)} jam`} />
        <Summary label="Kondisi terakhir" value={latest ? latest.condition_status : "Belum ada inspeksi"} alert={latest?.condition_status !== "NORMAL" && Boolean(latest)} />
        <Summary label="Preventive berikutnya" value={nextPreventive === null ? "Interval belum diatur" : `${formatQty(nextPreventive)} jam`} />
      </div>

      <div className="p-5">
        {query.isLoading ? <LoadingSkeleton rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : !operations.length ? (
          <EmptyState title="Belum ada History inspeksi" description="Catat kondisi pertama untuk membentuk baseline operasi Compressor atau Boiler." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2.5">Inspeksi</th><th className="px-3 py-2.5">Jam Operasi</th><th className="px-3 py-2.5">Tekanan / Suhu</th><th className="px-3 py-2.5">Flow / Output</th><th className="px-3 py-2.5">Kondisi</th><th className="px-3 py-2.5">Work Order</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operations.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3"><p className="font-medium text-slate-800">{formatDateTime(item.inspected_at)}</p><p className="text-xs text-slate-400">{item.operator_name || item.created_by || "-"}</p></td>
                    <td className="px-3 py-3"><p>{formatQty(item.hour_meter_start)} → {formatQty(item.hour_meter_end)}</p><p className="text-xs text-slate-400">{formatQty(item.operating_hours)} jam</p></td>
                    <td className="px-3 py-3"><p>{formatQty(item.pressure_bar)} bar</p><p className="text-xs text-slate-400">{formatQty(item.temperature_c)} °C</p></td>
                    <td className="px-3 py-3"><p>{formatQty(item.flow_value)} {profile.flow_unit ?? ""}</p><p className="text-xs text-slate-400">{formatQty(item.output_value)} {profile.output_unit ?? ""}</p></td>
                    <td className="max-w-[250px] px-3 py-3"><StatusBadge status={item.condition_status} tone={conditionTone(item.condition_status)} />{item.abnormal_reasons ? <p className="mt-1.5 text-xs leading-relaxed text-rose-700">{item.abnormal_reasons}</p> : null}</td>
                    <td className="px-3 py-3"><div className="space-y-1.5">{item.work_orders.length ? item.work_orders.map((wo) => <Link key={wo.id} href={workOrderHref(wo.wo_number)} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {wo.wo_number}<span className="text-slate-400">· {wo.wo_status || wo.trigger_type}</span></Link>) : <span className="text-slate-400">-</span>}</div></td>
                    <td className="px-3 py-3"><StatusBadge status={item.status} tone={item.status === "LOCKED" ? "green" : item.status === "SUBMITTED" ? "amber" : "slate"} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1">{canWrite && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" loading={busy === `${item.id}-submit`} onClick={() => submit(item)}><Send className="h-3.5 w-3.5" /> Submit</Button></> : null}{canWrite && item.status === "SUBMITTED" ? <Button className="h-8 px-2" loading={busy === `${item.id}-lock`} onClick={() => lock(item)}><LockKeyhole className="h-3.5 w-3.5" /> Verifikasi</Button> : null}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing !== undefined ? <UtilityOperationForm profile={profile} initial={editing} onClose={() => setEditing(undefined)} onSaved={() => query.refetch()} /> : null}
      <ConfirmDialog {...(confirm.confirmProps as ComponentProps<typeof ConfirmDialog>)} />
    </section>
  );
}

function Summary({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  const Icon = alert ? AlertTriangle : CheckCircle2;
  return <div className="flex items-center gap-3 px-5 py-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${alert ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}><Icon className="h-4 w-4" /></span><div><p className="text-xs text-slate-500">{label}</p><p className={`mt-0.5 text-sm font-semibold ${alert ? "text-amber-800" : "text-slate-900"}`}>{value}</p></div></div>;
}

function UtilityOperationForm({ profile, initial, onClose, onSaved }: { profile: EnergyAssetProfile; initial: UtilityOperation | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [form, setForm] = useState<UtilityOperationInput>({
    inspected_at: localDateTime(initial?.inspected_at),
    started_at: initial?.started_at ? localDateTime(initial.started_at) : "",
    ended_at: initial?.ended_at ? localDateTime(initial.ended_at) : "",
    hour_meter_start: initial?.hour_meter_start == null ? String(profile.utility_current_hour_meter ?? profile.utility_initial_hour_meter ?? "") : String(initial.hour_meter_start),
    hour_meter_end: initial?.hour_meter_end == null ? "" : String(initial.hour_meter_end),
    pressure_bar: initial?.pressure_bar == null ? "" : String(initial.pressure_bar),
    temperature_c: initial?.temperature_c == null ? "" : String(initial.temperature_c),
    flow_value: initial?.flow_value == null ? "" : String(initial.flow_value),
    output_value: initial?.output_value == null ? "" : String(initial.output_value),
    observed_condition: initial?.condition_status ?? "NORMAL",
    abnormal_note: initial?.abnormal_reasons ?? "",
    operator_name: initial?.operator_name ?? "",
    inspection_notes: initial?.inspection_notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof UtilityOperationInput, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const response = initial
        ? await updateUtilityOperation(initial.id, form)
        : await createUtilityOperation(Number(profile.utility_profile_id), form);
      toast.success(response.message, response.data.abnormal_reasons ?? undefined);
      await onSaved();
      onClose();
    } catch (error) {
      toast.error("Gagal menyimpan inspeksi", error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  return <Modal open onClose={onClose} title={initial ? "Ubah Draft Inspeksi" : `Inspeksi ${profile.energy_type === "BOILER" ? "Boiler" : "Compressor"}`} description="Evaluasi batas normal dilakukan kembali oleh server saat data disimpan." size="2xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Waktu inspeksi" required><Input type="datetime-local" value={form.inspected_at} onChange={(e) => set("inspected_at", e.target.value)} /></Field>
      <Field label="Operator"><Input value={form.operator_name} onChange={(e) => set("operator_name", e.target.value)} maxLength={120} /></Field>
      <Field label="Waktu mulai operasi"><Input type="datetime-local" value={form.started_at} onChange={(e) => set("started_at", e.target.value)} /></Field>
      <Field label="Waktu selesai operasi"><Input type="datetime-local" value={form.ended_at} onChange={(e) => set("ended_at", e.target.value)} /></Field>
      <Field label="Hour meter awal"><Input inputMode="decimal" value={form.hour_meter_start} onChange={(e) => set("hour_meter_start", e.target.value)} /></Field>
      <Field label="Hour meter akhir"><Input inputMode="decimal" value={form.hour_meter_end} onChange={(e) => set("hour_meter_end", e.target.value)} /></Field>
      <div className="sm:col-span-2 mt-1 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold text-slate-900">Parameter Operasional</h3><p className="mt-0.5 text-xs text-slate-500">Kosongkan parameter yang memang tidak tersedia pada asset ini.</p></div>
      <Field label="Tekanan (bar)" hint={`Normal ${formatQty(profile.pressure_min_bar)}–${formatQty(profile.pressure_max_bar)} bar`}><Input inputMode="decimal" value={form.pressure_bar} onChange={(e) => set("pressure_bar", e.target.value)} /></Field>
      <Field label="Temperatur (°C)" hint={`Normal ${formatQty(profile.temperature_min_c)}–${formatQty(profile.temperature_max_c)} °C`}><Input inputMode="decimal" value={form.temperature_c} onChange={(e) => set("temperature_c", e.target.value)} /></Field>
      <Field label={`Flow (${profile.flow_unit || "unit"})`} hint={`Normal ${formatQty(profile.flow_min)}–${formatQty(profile.flow_max)}`}><Input inputMode="decimal" value={form.flow_value} onChange={(e) => set("flow_value", e.target.value)} /></Field>
      <Field label={`Output (${profile.output_unit || "unit"})`} hint={`Normal ${formatQty(profile.output_min)}–${formatQty(profile.output_max)}`}><Input inputMode="decimal" value={form.output_value} onChange={(e) => set("output_value", e.target.value)} /></Field>
      <Field label="Hasil pemeriksaan visual" required><Select value={form.observed_condition} onChange={(e) => set("observed_condition", e.target.value)}><option value="NORMAL">Normal</option><option value="ATTENTION">Perlu Perhatian</option><option value="CRITICAL">Kritis / Tidak Aman</option></Select></Field>
      <div />
      {form.observed_condition !== "NORMAL" ? <div className="sm:col-span-2"><Field label="Temuan abnormal" required><Textarea value={form.abnormal_note} onChange={(e) => set("abnormal_note", e.target.value)} placeholder="Jelaskan suara, getaran, kebocoran, safety issue, atau temuan lainnya." maxLength={2000} /></Field></div> : null}
      <div className="sm:col-span-2"><Field label="Catatan inspeksi"><Textarea value={form.inspection_notes} onChange={(e) => set("inspection_notes", e.target.value)} maxLength={5000} /></Field></div>
      <div className="sm:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5 font-medium text-slate-800"><Gauge className="h-3.5 w-3.5" /> WO otomatis dibuat setelah verifikasi</span><p className="mt-1">Draft dan submit belum membuat WO. Corrective dibuat dari kondisi abnormal; preventive dibuat ketika hour meter mencapai interval.</p></div>
    </div>
  </Modal>;
}
