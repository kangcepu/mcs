"use client";

import { useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileImage, Pencil, Plus, Scale, Send, X } from "lucide-react";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  createFuelStockOpname,
  listFuelStockOpnames,
  reviewFuelStockOpname,
  submitFuelStockOpname,
  updateFuelStockOpname,
  uploadFuelStockOpnameEvidence,
} from "@/lib/api/energy";
import { formatDateTime, formatQty } from "@/lib/format";
import type { EnergyAssetProfile, FuelMeasurementMethod, FuelStockOpname, FuelStockOpnameInput, FuelTankOption } from "@/types/energy";

const METHOD_LABEL: Record<FuelMeasurementMethod, string> = {
  DIP_STICK: "Dip stick",
  LEVEL_GAUGE: "Level gauge",
  FLOW_METER: "Flow meter",
  OTHER: "Metode lain",
};

function localDateTime(value?: string | null): string {
  if (value) return value.replace(" ", "T").slice(0, 16);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function varianceClass(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-600";
}

export function FuelStockOpnamePanel({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  const tankId = Number(profile.fuel_tank_id);
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["energy-fuel-opnames", tankId], queryFn: ({ signal }) => listFuelStockOpnames(tankId, signal) });
  const [editing, setEditing] = useState<FuelStockOpname | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const tank = query.data?.data.tank;
  const opnames = query.data?.data.opnames ?? [];
  const latestApproved = opnames.find((item) => item.status === "APPROVED");

  const refreshAll = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["energy-fuel-movements", tankId] }),
      queryClient.invalidateQueries({ queryKey: ["energy-fuel-tanks"] }),
      queryClient.invalidateQueries({ queryKey: ["energy-monitoring"] }),
    ]);
  };

  const submit = async (item: FuelStockOpname) => {
    setBusy(`${item.id}-submit`);
    try {
      const response = await submitFuelStockOpname(item.id);
      toast.success(response.message);
      await query.refetch();
    } catch (error) {
      toast.error("Submit stock opname gagal", error instanceof Error ? error.message : undefined);
    } finally { setBusy(""); }
  };

  const review = (item: FuelStockOpname, action: "APPROVE" | "REJECT") => {
    const approving = action === "APPROVE";
    confirm.ask({
      title: approving ? "Setujui rekonsiliasi fisik?" : "Tolak stock opname?",
      description: approving
        ? `Saldo sistem akan direkonsiliasi ke ${formatQty(item.physical_balance_liter)} liter. Selisih ${formatQty(item.variance_liter)} liter dibuat sebagai adjustment otomatis.`
        : "Stock opname ditandai ditolak dan tidak memengaruhi saldo fuel.",
      confirmLabel: approving ? "Setujui & Rekonsiliasi" : "Tolak Opname",
      tone: approving ? "primary" : "danger",
      onConfirm: async () => {
        confirm.close();
        setBusy(`${item.id}-${action}`);
        try {
          const response = await reviewFuelStockOpname(item.id, action);
          toast.success(response.message, approving && response.data.adjustment_movement_id ? "Adjustment otomatis tercatat pada kartu stok." : undefined);
          await refreshAll();
        } catch (error) {
          toast.error("Review stock opname gagal", error instanceof Error ? error.message : undefined);
        } finally { setBusy(""); }
      },
    });
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Scale className="h-4 w-4 text-brand-600" /> Stock Opname & Rekonsiliasi</h2>
          <p className="mt-1 text-xs text-slate-500">Bandingkan saldo sistem dengan pengukuran fisik dan buat adjustment melalui approval.</p>
        </div>
        {canWrite && tank ? <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Stock Opname</Button> : null}
      </div>

      {latestApproved ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm">
          <div><span className="text-slate-500">Rekonsiliasi terakhir</span><span className="ml-2 font-medium text-slate-800">{formatDateTime(latestApproved.opname_at)}</span></div>
          <div className={`font-semibold tabular-nums ${varianceClass(Number(latestApproved.variance_liter))}`}>Selisih {Number(latestApproved.variance_liter) > 0 ? "+" : ""}{formatQty(latestApproved.variance_liter)} L</div>
        </div>
      ) : null}

      <div className="p-5">
        {query.isLoading ? <LoadingSkeleton rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : !opnames.length ? (
          <EmptyState title="Belum ada stock opname" description="Lakukan pengukuran fisik pertama dan unggah foto evidence sebelum mengajukan rekonsiliasi." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Waktu / Nomor</th><th className="px-3 py-2.5">Saldo Sistem</th><th className="px-3 py-2.5">Saldo Fisik</th><th className="px-3 py-2.5">Variance</th><th className="px-3 py-2.5">Pengukuran</th><th className="px-3 py-2.5">Evidence</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Aksi</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {opnames.map((item) => {
                  const variance = Number(item.variance_liter);
                  const outsideTolerance = Math.abs(variance) > Number(item.tolerance_liter ?? 0);
                  return <tr key={item.id} className="align-top">
                    <td className="px-3 py-3"><p className="font-medium text-slate-800">{formatDateTime(item.opname_at)}</p><p className="max-w-[220px] truncate text-xs text-slate-400" title={item.opname_number}>{item.opname_number}</p></td>
                    <td className="px-3 py-3 font-medium tabular-nums">{formatQty(item.system_balance_liter)} L</td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-brand-700">{formatQty(item.physical_balance_liter)} L</td>
                    <td className={`px-3 py-3 font-semibold tabular-nums ${varianceClass(variance)}`}><p>{variance > 0 ? "+" : ""}{formatQty(variance)} L</p><p className={`text-xs font-normal ${outsideTolerance ? "text-rose-600" : "text-slate-400"}`}>{outsideTolerance ? "Di luar toleransi" : "Dalam toleransi"}{item.variance_percent == null ? "" : ` · ${formatQty(item.variance_percent)}%`}</p></td>
                    <td className="px-3 py-3"><p>{METHOD_LABEL[item.measurement_method]}</p><p className="text-xs text-slate-400">{item.measured_by || "-"}</p></td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{item.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" title={file.file_name} className="rounded bg-slate-100 p-1.5 text-slate-500 hover:text-brand-600"><FileImage className="h-4 w-4" /></a>)}{!item.attachments.length ? <span className="text-slate-400">-</span> : null}</div></td>
                    <td className="px-3 py-3"><StatusBadge status={item.status} tone={item.status === "APPROVED" ? "green" : item.status === "SUBMITTED" ? "amber" : item.status === "REJECTED" ? "red" : "slate"} />{item.adjustment_movement_id ? <p className="mt-1 text-xs text-emerald-700">Adjustment #{item.adjustment_movement_id}</p> : null}</td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1">{canWrite && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" loading={busy === `${item.id}-submit`} onClick={() => submit(item)}><Send className="h-3.5 w-3.5" /> Submit</Button></> : null}{canWrite && item.status === "SUBMITTED" ? <><Button variant="danger" className="h-8 px-2" loading={busy === `${item.id}-REJECT`} onClick={() => review(item, "REJECT")}><X className="h-3.5 w-3.5" /> Tolak</Button><Button className="h-8 px-2" loading={busy === `${item.id}-APPROVE`} onClick={() => review(item, "APPROVE")}><Check className="h-3.5 w-3.5" /> Setujui</Button></> : null}</div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing !== undefined && tank ? <FuelStockOpnameForm tank={tank} initial={editing} onClose={() => setEditing(undefined)} onSaved={() => query.refetch()} /> : null}
      <ConfirmDialog {...(confirm.confirmProps as ComponentProps<typeof ConfirmDialog>)} />
    </section>
  );
}

function FuelStockOpnameForm({ tank, initial, onClose, onSaved }: { tank: FuelTankOption; initial: FuelStockOpname | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [opnameAt, setOpnameAt] = useState(localDateTime(initial?.opname_at));
  const [physical, setPhysical] = useState(initial?.physical_balance_liter == null ? "" : String(initial.physical_balance_liter));
  const [tolerance, setTolerance] = useState(initial?.tolerance_liter == null ? "0" : String(initial.tolerance_liter));
  const [method, setMethod] = useState<FuelMeasurementMethod>(initial?.measurement_method ?? "DIP_STICK");
  const [measuredBy, setMeasuredBy] = useState(initial?.measured_by ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const estimatedVariance = physical.trim() ? Number(physical.replace(",", ".")) - Number(tank.current_balance_liter ?? 0) : null;

  const save = async () => {
    if (!physical.trim()) return toast.error("Saldo fisik wajib diisi");
    const body: FuelStockOpnameInput = { opname_at: opnameAt, physical_balance_liter: physical, tolerance_liter: tolerance, measurement_method: method, measured_by: measuredBy, notes };
    setSaving(true);
    try {
      const response = initial ? await updateFuelStockOpname(initial.id, body) : await createFuelStockOpname(tank.id, body);
      const opnameId = initial?.id ?? response.data.id;
      if (files.length) await uploadFuelStockOpnameEvidence(opnameId, files);
      toast.success(initial ? "Draft stock opname diperbarui" : "Draft stock opname dibuat", `${files.length} foto evidence ditambahkan. Saldo belum berubah sebelum approval.`);
      await onSaved();
      onClose();
    } catch (error) {
      toast.error("Gagal menyimpan stock opname", error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  return <Modal open onClose={onClose} title={initial ? "Ubah Draft Stock Opname" : "Stock Opname Fuel Tank"} description={`${tank.AssetName} · saldo sistem saat ini ${formatQty(tank.current_balance_liter)} liter`} size="xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Waktu pengukuran" required><Input type="datetime-local" value={opnameAt} onChange={(event) => setOpnameAt(event.target.value)} /></Field>
      <Field label="Metode pengukuran" required><Select value={method} onChange={(event) => setMethod(event.target.value as FuelMeasurementMethod)}>{Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Saldo fisik (liter)" required hint={`Maksimum tank ${formatQty(tank.maximum_level_liter ?? tank.capacity_liter)} liter.`}><Input inputMode="decimal" value={physical} onChange={(event) => setPhysical(event.target.value)} /></Field>
      <Field label="Toleransi variance (liter)" hint="Digunakan untuk menandai variance, bukan menghilangkan adjustment."><Input inputMode="decimal" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></Field>
      <Field label="Petugas pengukuran"><Input value={measuredBy} onChange={(event) => setMeasuredBy(event.target.value)} maxLength={120} /></Field>
      <Field label="Foto evidence" required={!initial?.attachments.length} hint="JPG/PNG/WEBP/BMP, maksimal 5 file dan 10 MB per file."><Input type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></Field>
      {estimatedVariance !== null && Number.isFinite(estimatedVariance) ? <div className="sm:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-600">Perkiraan variance terhadap saldo saat ini</span><span className={`font-semibold tabular-nums ${varianceClass(estimatedVariance)}`}>{estimatedVariance > 0 ? "+" : ""}{formatQty(estimatedVariance)} liter</span></div><p className="mt-1 text-xs text-slate-500">Nilai final dihitung server berdasarkan seluruh movement sampai waktu pengukuran.</p></div> : null}
      <div className="sm:col-span-2"><Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Kondisi tangki, cara ukur, atau penjelasan variance." /></Field></div>
    </div>
  </Modal>;
}
