"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileImage, Gauge, LockKeyhole, Pencil, Plus, Send, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { FuelTankOperations } from "@/components/energy/fuel-tank-operations";
import { FuelStockOpnamePanel } from "@/components/energy/fuel-stock-opname";
import { UtilityOperations } from "@/components/energy/utility-operations";
import {
  createGensetOperation,
  createMeterReading,
  listGensetOperations,
  listFuelTanks,
  listMeterCorrections,
  listMeterReadings,
  moveGensetOperation,
  moveMeterReading,
  requestMeterCorrection,
  reviewMeterCorrection,
  updateGensetOperation,
  updateMeterReading,
  uploadMeterReadingPhotos,
} from "@/lib/api/energy";
import { formatDateTime, formatQty } from "@/lib/format";
import type {
  EnergyAssetProfile,
  GensetOperation,
  GensetOperationInput,
  FuelTankOption,
  MeterCorrection,
  MeterReading,
  MeterReadingInput,
} from "@/types/energy";

function inputDateTime(value?: string | null): string {
  if (!value) {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
    return now.toISOString().slice(0, 16);
  }
  return value.replace(" ", "T").slice(0, 16);
}

function tone(status: string): "green" | "amber" | "slate" | "red" | "blue" {
  if (["LOCKED", "APPROVED"].includes(status)) return "green";
  if (["SUBMITTED", "VALIDATED", "REQUESTED"].includes(status)) return "amber";
  if (status === "REJECTED") return "red";
  return "slate";
}

export function EnergyOperationsPanel({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  if ((profile.energy_type === "ELECTRICITY_METER" || profile.energy_type === "WATER_METER") && profile.meter_id) {
    return <MeterOperations profile={profile} canWrite={canWrite} />;
  }
  if (profile.energy_type === "GENSET" && profile.genset_profile_id) {
    return <GensetOperations profile={profile} canWrite={canWrite} />;
  }
  if (profile.energy_type === "FUEL_TANK" && profile.fuel_tank_id) {
    return <div className="space-y-4"><FuelTankOperations profile={profile} canWrite={canWrite} /><FuelStockOpnamePanel profile={profile} canWrite={canWrite} /></div>;
  }
  if ((profile.energy_type === "COMPRESSOR" || profile.energy_type === "BOILER") && profile.utility_profile_id) {
    return <UtilityOperations profile={profile} canWrite={canWrite} />;
  }
  return null;
}

function MeterOperations({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  const meterId = Number(profile.meter_id);
  const query = useQuery({
    queryKey: ["energy-meter-readings", meterId],
    queryFn: ({ signal }) => listMeterReadings(meterId, signal),
  });
  const toast = useToast();
  const [editing, setEditing] = useState<MeterReading | null | undefined>(undefined);
  const [correction, setCorrection] = useState<MeterReading | null>(null);
  const [busy, setBusy] = useState("");
  const readings = query.data?.data.readings ?? [];

  const transition = async (item: MeterReading, action: "submit" | "validate" | "lock") => {
    setBusy(`${item.id}-${action}`);
    try {
      const result = await moveMeterReading(item.id, action);
      toast.success(result.message);
      await query.refetch();
    } catch (error) {
      toast.error("Proses reading gagal", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Gauge className="h-4 w-4 text-brand-600" /> Meter Reading</h2>
          <p className="mt-1 text-xs text-slate-500">Konsumsi dihitung otomatis menggunakan multiplier dan rollover meter.</p>
        </div>
        {canWrite ? <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Input Reading</Button> : null}
      </div>
      <div className="p-5">
        {query.isLoading ? <LoadingSkeleton rows={4} /> : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : readings.length === 0 ? (
          <EmptyState title="Belum ada meter reading" description="Input angka meter pertama untuk mulai menghitung konsumsi." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2.5">Waktu</th><th className="px-3 py-2.5">Sebelumnya</th><th className="px-3 py-2.5">Saat ini</th><th className="px-3 py-2.5">Multiplier</th><th className="px-3 py-2.5">Konsumsi</th><th className="px-3 py-2.5">Foto</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3"><p className="font-medium text-slate-700">{formatDateTime(item.read_at)}</p><p className="text-xs text-slate-400">{item.created_by || "-"}</p></td>
                    <td className="px-3 py-3">{formatQty(item.previous_reading)}</td>
                    <td className="px-3 py-3 font-medium">{formatQty(item.current_reading)}</td>
                    <td className="px-3 py-3">× {formatQty(item.multiplier)}</td>
                    <td className="px-3 py-3 font-semibold text-brand-700">{formatQty(item.consumption)} {profile.meter_unit}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="rounded bg-slate-100 p-1.5 text-slate-500 hover:text-brand-600" title={file.file_name}><FileImage className="h-4 w-4" /></a>)}
                        {!item.attachments.length ? "-" : null}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={item.status} tone={tone(item.status)} />{Number(item.pending_corrections) > 0 ? <p className="mt-1 text-xs text-amber-600">Koreksi menunggu</p> : null}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {canWrite && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" loading={busy === `${item.id}-submit`} onClick={() => transition(item, "submit")}><Send className="h-3.5 w-3.5" /> Submit</Button></> : null}
                        {canWrite && item.status === "SUBMITTED" ? <Button className="h-8 px-2" loading={busy === `${item.id}-validate`} onClick={() => transition(item, "validate")}><Check className="h-3.5 w-3.5" /> Validasi</Button> : null}
                        {canWrite && item.status === "VALIDATED" ? <Button className="h-8 px-2" loading={busy === `${item.id}-lock`} onClick={() => transition(item, "lock")}><LockKeyhole className="h-3.5 w-3.5" /> Kunci</Button> : null}
                        {canWrite && (item.status === "LOCKED" || Number(item.pending_corrections) > 0) ? <Button variant="secondary" className="h-8 px-2" onClick={() => setCorrection(item)}><Wrench className="h-3.5 w-3.5" /> Koreksi</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing !== undefined ? <MeterReadingForm meterId={meterId} initial={editing} multiplier={String(profile.meter_multiplier ?? 1)} onClose={() => setEditing(undefined)} onSaved={() => query.refetch()} /> : null}
      {correction ? <MeterCorrectionModal reading={correction} onClose={() => setCorrection(null)} onChanged={() => query.refetch()} /> : null}
    </section>
  );
}

function MeterReadingForm({ meterId, initial, multiplier, onClose, onSaved }: { meterId: number; initial: MeterReading | null; multiplier: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [readAt, setReadAt] = useState(inputDateTime(initial?.read_at));
  const [previous, setPrevious] = useState(initial?.previous_reading == null ? "" : String(initial.previous_reading));
  const [current, setCurrent] = useState(initial?.current_reading == null ? "" : String(initial.current_reading));
  const [factor, setFactor] = useState(initial?.multiplier == null ? multiplier : String(initial.multiplier));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!current.trim()) return toast.error("Angka meter saat ini wajib diisi");
    setSaving(true);
    const body: MeterReadingInput = { read_at: readAt, previous_reading: previous, current_reading: current, multiplier: factor, notes };
    try {
      const result = initial ? await updateMeterReading(initial.id, body) : await createMeterReading(meterId, body);
      const readingId = initial?.id ?? result.data.id;
      if (files.length) await uploadMeterReadingPhotos(readingId, files);
      toast.success(initial ? "Draft reading diperbarui" : "Draft reading dibuat", files.length ? `${files.length} foto tersimpan.` : "Tambahkan foto sebelum submit.");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error("Gagal menyimpan reading", error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  return <Modal open onClose={onClose} title={initial ? "Ubah Meter Reading" : "Input Meter Reading"} description="Nilai konsumsi dihitung oleh server agar konsisten." size="lg" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Waktu reading" required><Input type="datetime-local" value={readAt} onChange={(e) => setReadAt(e.target.value)} /></Field>
      <Field label="Multiplier" required><Input inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} /></Field>
      <Field label="Angka sebelumnya" hint="Kosongkan agar otomatis memakai reading terakhir."><Input inputMode="decimal" value={previous} onChange={(e) => setPrevious(e.target.value)} /></Field>
      <Field label="Angka saat ini" required><Input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <div className="sm:col-span-2"><Field label="Foto meter" hint="JPG/PNG/WEBP/BMP, maksimal 5 file dan 10 MB per file."><Input type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></Field></div>
      <div className="sm:col-span-2"><Field label="Catatan"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
    </div>
  </Modal>;
}

function MeterCorrectionModal({ reading, onClose, onChanged }: { reading: MeterReading; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const corrections = useQuery({ queryKey: ["energy-meter-corrections", reading.id], queryFn: ({ signal }) => listMeterCorrections(reading.id, signal) });
  const [previous, setPrevious] = useState(String(reading.previous_reading ?? ""));
  const [current, setCurrent] = useState(String(reading.current_reading ?? ""));
  const [multiplier, setMultiplier] = useState(String(reading.multiplier ?? ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const pending = (corrections.data?.data ?? []).filter((item) => item.status === "REQUESTED");

  const request = async () => {
    setBusy("request");
    try {
      const result = await requestMeterCorrection(reading.id, { previous_reading: previous, current_reading: current, multiplier, reason });
      toast.success(result.message); setReason(""); await corrections.refetch(); await onChanged();
    } catch (error) { toast.error("Gagal mengajukan koreksi", error instanceof Error ? error.message : undefined); }
    finally { setBusy(""); }
  };
  const review = async (item: MeterCorrection, action: "APPROVE" | "REJECT") => {
    setBusy(`${item.id}-${action}`);
    try {
      const result = await reviewMeterCorrection(item.id, action, "Direview dari Asset Passport");
      toast.success(result.message); await corrections.refetch(); await onChanged();
    } catch (error) { toast.error("Review koreksi gagal", error instanceof Error ? error.message : undefined); }
    finally { setBusy(""); }
  };

  return <Modal open onClose={onClose} title="Koreksi Meter Reading" description={`Reading ${formatDateTime(reading.read_at)}`} size="xl" footer={<Button variant="secondary" onClick={onClose}>Tutup</Button>}>
    <div className="space-y-5">
      {pending.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-semibold text-amber-900">Menunggu review</h3>{pending.map((item) => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3 text-sm"><div><p>{item.requested_previous_reading ?? "-"} → {item.requested_current_reading ?? "-"} (× {item.requested_multiplier ?? "-"})</p><p className="text-xs text-amber-700">{item.reason} · {item.requested_by}</p></div><div className="flex gap-2"><Button variant="danger" loading={busy === `${item.id}-REJECT`} onClick={() => review(item, "REJECT")}>Tolak</Button><Button loading={busy === `${item.id}-APPROVE`} onClick={() => review(item, "APPROVE")}>Setujui</Button></div></div>)}</div> : null}
      {!pending.length ? <div className="grid gap-4 sm:grid-cols-3"><Field label="Angka sebelumnya"><Input inputMode="decimal" value={previous} onChange={(e) => setPrevious(e.target.value)} /></Field><Field label="Angka saat ini"><Input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field><Field label="Multiplier"><Input inputMode="decimal" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} /></Field><div className="sm:col-span-3"><Field label="Alasan koreksi" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div><div className="sm:col-span-3 flex justify-end"><Button loading={busy === "request"} onClick={request}>Ajukan Koreksi</Button></div></div> : null}
      {(corrections.data?.data ?? []).filter((item) => item.status !== "REQUESTED").length ? <div><h3 className="mb-2 text-sm font-semibold text-slate-700">History Koreksi</h3><div className="space-y-2">{(corrections.data?.data ?? []).filter((item) => item.status !== "REQUESTED").map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><div><p>{item.reason}</p><p className="text-xs text-slate-400">{item.requested_by} · {formatDateTime(item.requested_at)}</p></div><StatusBadge status={item.status} tone={tone(item.status)} /></div>)}</div></div> : null}
    </div>
  </Modal>;
}

function GensetOperations({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  const gensetId = Number(profile.genset_profile_id);
  const query = useQuery({ queryKey: ["energy-genset-operations", gensetId], queryFn: ({ signal }) => listGensetOperations(gensetId, signal) });
  const tanksQuery = useQuery({ queryKey: ["energy-fuel-tanks"], queryFn: ({ signal }) => listFuelTanks(signal) });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<GensetOperation | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const operations = query.data?.data.operations ?? [];
  const transition = async (item: GensetOperation, action: "submit" | "lock") => {
    setBusy(`${item.id}-${action}`);
    try {
      const result = await moveGensetOperation(item.id, action);
      toast.success(result.message);
      await query.refetch();
      if (action === "lock") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["energy-fuel-tanks"] }),
          queryClient.invalidateQueries({ queryKey: ["energy-fuel-movements"] }),
          queryClient.invalidateQueries({ queryKey: ["energy-monitoring"] }),
        ]);
      }
    }
    catch (error) { toast.error("Proses operasi genset gagal", error instanceof Error ? error.message : undefined); }
    finally { setBusy(""); }
  };
  return <section className="card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Gauge className="h-4 w-4 text-brand-600" /> Operasi Genset</h2><p className="mt-1 text-xs text-slate-500">Jam operasi, energi yang dihasilkan, beban, dan konsumsi bahan bakar.</p></div>{canWrite ? <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Catat Operasi</Button> : null}</div>
    <div className="p-5">{query.isLoading ? <LoadingSkeleton rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : !operations.length ? <EmptyState title="Belum ada log operasi" description="Catat aktivitas genset saat mulai dan selesai beroperasi." /> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[960px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Mulai–Selesai</th><th className="px-3 py-2.5">Hour Meter</th><th className="px-3 py-2.5">Durasi</th><th className="px-3 py-2.5">Produksi</th><th className="px-3 py-2.5">Beban</th><th className="px-3 py-2.5">Fuel & Sumber</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{operations.map((item) => <tr key={item.id}><td className="px-3 py-3"><p>{formatDateTime(item.started_at)}</p><p className="text-xs text-slate-400">{formatDateTime(item.ended_at)}</p></td><td className="px-3 py-3">{formatQty(item.hour_meter_start)} → {formatQty(item.hour_meter_end)}</td><td className="px-3 py-3">{formatQty(item.operating_hours)} jam</td><td className="px-3 py-3">{formatQty(item.generated_kwh)} kWh</td><td className="px-3 py-3">{formatQty(item.average_load_percent)}%</td><td className="px-3 py-3"><p>{formatQty(item.fuel_consumed_liter)} L</p><p className="mt-0.5 text-xs text-slate-500">{item.fuel_tank_asset_code ? `${item.fuel_tank_asset_code} · ${item.fuel_tank_number || item.fuel_tank_asset_name || "Fuel Tank"}` : Number(item.fuel_consumed_liter ?? 0) > 0 ? "Sumber belum dipilih" : "Tanpa pemakaian"}</p></td><td className="px-3 py-3"><StatusBadge status={item.status} tone={tone(item.status)} /></td><td className="px-3 py-3"><div className="flex justify-end gap-1">{canWrite && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" loading={busy === `${item.id}-submit`} onClick={() => transition(item, "submit")}><Send className="h-3.5 w-3.5" /> Submit</Button></> : null}{canWrite && item.status === "SUBMITTED" ? <Button className="h-8 px-2" loading={busy === `${item.id}-lock`} onClick={() => transition(item, "lock")}><LockKeyhole className="h-3.5 w-3.5" /> Kunci</Button> : null}</div></td></tr>)}</tbody></table></div>}</div>
    {editing !== undefined ? <GensetOperationForm gensetId={gensetId} initial={editing} defaultHour={String(profile.current_hour_meter ?? profile.initial_hour_meter ?? "")} fuelType={profile.genset_fuel_type ?? "DIESEL"} tanks={tanksQuery.data?.data ?? []} onClose={() => setEditing(undefined)} onSaved={() => query.refetch()} /> : null}
  </section>;
}

function GensetOperationForm({ gensetId, initial, defaultHour, fuelType, tanks, onClose, onSaved }: { gensetId: number; initial: GensetOperation | null; defaultHour: string; fuelType: string; tanks: FuelTankOption[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<GensetOperationInput>({ started_at: inputDateTime(initial?.started_at), ended_at: initial?.ended_at ? inputDateTime(initial.ended_at) : "", hour_meter_start: initial?.hour_meter_start == null ? defaultHour : String(initial.hour_meter_start), hour_meter_end: initial?.hour_meter_end == null ? "" : String(initial.hour_meter_end), generated_kwh: initial?.generated_kwh == null ? "" : String(initial.generated_kwh), average_load_percent: initial?.average_load_percent == null ? "" : String(initial.average_load_percent), fuel_consumed_liter: initial?.fuel_consumed_liter == null ? "" : String(initial.fuel_consumed_liter), fuel_tank_id: initial?.fuel_tank_id == null ? "" : String(initial.fuel_tank_id), operator_name: initial?.operator_name ?? "", notes: initial?.notes ?? "" });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof GensetOperationInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const compatibleTanks = tanks.filter((tank) => tank.status === "ACTIVE" && tank.fuel_type.toUpperCase() === fuelType.toUpperCase());
  const selectedTank = compatibleTanks.find((tank) => String(tank.id) === form.fuel_tank_id);
  const fuelRequired = Number(form.fuel_consumed_liter || 0) > 0;
  const save = async () => { setSaving(true); try { const result = initial ? await updateGensetOperation(initial.id, form) : await createGensetOperation(gensetId, form); toast.success(result.message); await onSaved(); onClose(); } catch (error) { toast.error("Gagal menyimpan operasi", error instanceof Error ? error.message : undefined); } finally { setSaving(false); } };
  return <Modal open onClose={onClose} title={initial ? "Ubah Operasi Genset" : "Catat Operasi Genset"} size="xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Waktu mulai" required><Input type="datetime-local" value={form.started_at} onChange={(e) => set("started_at", e.target.value)} /></Field><Field label="Waktu selesai"><Input type="datetime-local" value={form.ended_at} onChange={(e) => set("ended_at", e.target.value)} /></Field><Field label="Hour meter awal"><Input inputMode="decimal" value={form.hour_meter_start} onChange={(e) => set("hour_meter_start", e.target.value)} /></Field><Field label="Hour meter akhir"><Input inputMode="decimal" value={form.hour_meter_end} onChange={(e) => set("hour_meter_end", e.target.value)} /></Field><Field label="Energi dihasilkan (kWh)"><Input inputMode="decimal" value={form.generated_kwh} onChange={(e) => set("generated_kwh", e.target.value)} /></Field><Field label="Rata-rata beban (%)"><Input inputMode="decimal" value={form.average_load_percent} onChange={(e) => set("average_load_percent", e.target.value)} /></Field><Field label="Bahan bakar terpakai (liter)"><Input inputMode="decimal" value={form.fuel_consumed_liter} onChange={(e) => set("fuel_consumed_liter", e.target.value)} /></Field><Field label="Fuel Tank sumber" required={fuelRequired} hint={`Jenis fuel genset: ${fuelType}. Saldo dipotong saat operasi dikunci.`}><Select value={form.fuel_tank_id} onChange={(e) => set("fuel_tank_id", e.target.value)}><option value="">{compatibleTanks.length ? "Pilih Fuel Tank…" : `Tidak ada tank ${fuelType} aktif`}</option>{compatibleTanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.AssetCode} · {tank.tank_number || tank.AssetName} · {formatQty(tank.current_balance_liter)} L</option>)}</Select></Field>{selectedTank ? <div className="sm:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700"><p className="font-medium">{selectedTank.AssetName} · {selectedTank.AssetCode}</p><p className="mt-1 text-xs text-slate-500">Saldo tersedia {formatQty(selectedTank.current_balance_liter)} L · Lokasi {selectedTank.LocationAsset || "-"}</p></div> : null}<Field label="Operator"><Input value={form.operator_name} onChange={(e) => set("operator_name", e.target.value)} /></Field><div className="sm:col-span-2"><Field label="Catatan"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div></div></Modal>;
}
