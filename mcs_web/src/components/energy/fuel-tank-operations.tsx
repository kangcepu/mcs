"use client";

import { useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Check, Fuel, Pencil, Plus, Send, SlidersHorizontal, X } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  createFuelMovement,
  listFuelMovements,
  listFuelTanks,
  reviewFuelMovement,
  submitFuelMovement,
  updateFuelMovement,
} from "@/lib/api/energy";
import { formatDateTime, formatQty } from "@/lib/format";
import type { EnergyAssetProfile, FuelMovement, FuelMovementInput, FuelMovementType, FuelTankOption } from "@/types/energy";

const MOVEMENT_LABEL: Record<FuelMovementType, string> = {
  RECEIPT: "Penerimaan",
  CONSUMPTION: "Pemakaian",
  TRANSFER: "Transfer",
  ADJUSTMENT_IN: "Adjustment Masuk",
  ADJUSTMENT_OUT: "Adjustment Keluar",
};

const MOVEMENT_ICON: Record<FuelMovementType, typeof Fuel> = {
  RECEIPT: ArrowDownToLine,
  CONSUMPTION: ArrowUpFromLine,
  TRANSFER: ArrowRightLeft,
  ADJUSTMENT_IN: SlidersHorizontal,
  ADJUSTMENT_OUT: SlidersHorizontal,
};

function localDateTime(value?: string | null): string {
  if (value) return value.replace(" ", "T").slice(0, 16);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (["APPROVED", "LOCKED"].includes(status)) return "green";
  if (status === "SUBMITTED") return "amber";
  if (status === "REJECTED") return "red";
  return "slate";
}

function movementSign(item: FuelMovement): 1 | -1 {
  if (item.tank_role === "INCOMING_TRANSFER") return 1;
  return ["RECEIPT", "ADJUSTMENT_IN"].includes(item.movement_type) ? 1 : -1;
}

export function FuelTankOperations({ profile, canWrite }: { profile: EnergyAssetProfile; canWrite: boolean }) {
  const tankId = Number(profile.fuel_tank_id);
  const toast = useToast();
  const confirm = useConfirm();
  const query = useQuery({ queryKey: ["energy-fuel-movements", tankId], queryFn: ({ signal }) => listFuelMovements(tankId, signal) });
  const tanksQuery = useQuery({ queryKey: ["energy-fuel-tanks"], queryFn: ({ signal }) => listFuelTanks(signal) });
  const [editing, setEditing] = useState<FuelMovement | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const tank = query.data?.data.tank;
  const movements = query.data?.data.movements ?? [];
  const balance = Number(tank?.current_balance_liter ?? 0);
  const capacity = Number(tank?.capacity_liter ?? profile.capacity_liter ?? 0);
  const fill = capacity > 0 ? Math.min(100, Math.max(0, (balance / capacity) * 100)) : 0;
  const minimum = tank?.minimum_level_liter == null ? null : Number(tank.minimum_level_liter);
  const low = minimum !== null && balance <= minimum;

  const refresh = async () => {
    await Promise.all([query.refetch(), tanksQuery.refetch()]);
  };

  const submit = async (item: FuelMovement) => {
    setBusy(`${item.id}-submit`);
    try { const response = await submitFuelMovement(item.id); toast.success(response.message); await refresh(); }
    catch (error) { toast.error("Submit movement gagal", error instanceof Error ? error.message : undefined); }
    finally { setBusy(""); }
  };

  const review = (item: FuelMovement, action: "APPROVE" | "REJECT") => {
    const approving = action === "APPROVE";
    confirm.ask({
      title: approving ? "Setujui fuel movement?" : "Tolak fuel movement?",
      description: approving
        ? "Saldo tank akan diperbarui dan transaksi tidak dapat diubah lagi. Kapasitas serta kecukupan stok diperiksa ulang saat approval."
        : "Transaksi ditandai ditolak dan tidak memengaruhi saldo fuel.",
      confirmLabel: approving ? "Setujui & Perbarui Saldo" : "Tolak Movement",
      tone: approving ? "primary" : "danger",
      onConfirm: async () => {
        confirm.close();
        setBusy(`${item.id}-${action}`);
        try {
          const response = await reviewFuelMovement(item.id, action);
          toast.success(response.message);
          await refresh();
        } catch (error) {
          toast.error("Review movement gagal", error instanceof Error ? error.message : undefined);
        } finally { setBusy(""); }
      },
    });
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Fuel className="h-4 w-4 text-brand-600" /> Fuel Tank Movement</h2>
          <p className="mt-1 text-xs text-slate-500">Penerimaan, pemakaian, transfer, dan adjustment dengan saldo setelah approval.</p>
        </div>
        {canWrite ? <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Catat Movement</Button> : null}
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo saat ini</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${low ? "text-rose-700" : "text-slate-900"}`}>{formatQty(balance)} <span className="text-sm font-medium">liter</span></p>
            <p className="mt-1 text-xs text-slate-500">Kapasitas {formatQty(capacity)} L{minimum !== null ? ` · Minimum ${formatQty(minimum)} L` : ""}</p>
          </div>
          {low ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Stok minimum tercapai</div> : null}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Isi fuel tank" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={balance}>
          <div className={`h-full rounded-full transition-[width] duration-200 ${low ? "bg-rose-500" : fill >= 90 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${fill}%` }} />
        </div>
      </div>

      <div className="p-5">
        {query.isLoading ? <LoadingSkeleton rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : !movements.length ? (
          <EmptyState title="Belum ada fuel movement" description="Saldo awal berasal dari profil tank. Catat transaksi pertama untuk mulai membentuk kartu stok." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Waktu / Referensi</th><th className="px-3 py-2.5">Movement</th><th className="px-3 py-2.5">Jumlah</th><th className="px-3 py-2.5">Tujuan</th><th className="px-3 py-2.5">Dibuat / Disetujui</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Aksi</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((item) => {
                  const Icon = MOVEMENT_ICON[item.movement_type];
                  const sign = movementSign(item);
                  const label = item.tank_role === "INCOMING_TRANSFER" ? "Transfer Masuk" : MOVEMENT_LABEL[item.movement_type];
                  const destination = item.destination_tank_asset_code || item.destination_asset_code || "-";
                  return <tr key={`${item.id}-${item.tank_role}`} className="align-top">
                    <td className="px-3 py-3"><p className="font-medium text-slate-700">{formatDateTime(item.movement_at)}</p><p className="max-w-[200px] truncate text-xs text-slate-400" title={item.reference_number ?? ""}>{item.reference_number || "Tanpa referensi"}</p></td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-slate-400" /> {label}</span></td>
                    <td className={`px-3 py-3 font-semibold tabular-nums ${sign > 0 ? "text-emerald-700" : "text-rose-700"}`}>{sign > 0 ? "+" : "−"}{formatQty(item.quantity_liter)} L</td>
                    <td className="px-3 py-3">{destination}</td>
                    <td className="px-3 py-3"><p>{item.created_by || "-"}</p>{item.approved_by ? <p className="text-xs text-slate-400">Approval: {item.approved_by}</p> : null}</td>
                    <td className="px-3 py-3"><StatusBadge status={item.status} tone={statusTone(item.status)} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1">
                      {canWrite && item.tank_role !== "INCOMING_TRANSFER" && item.status === "DRAFT" ? <><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button><Button className="h-8 px-2" loading={busy === `${item.id}-submit`} onClick={() => submit(item)}><Send className="h-3.5 w-3.5" /> Submit</Button></> : null}
                      {canWrite && item.tank_role !== "INCOMING_TRANSFER" && item.status === "SUBMITTED" ? <><Button variant="danger" className="h-8 px-2" onClick={() => review(item, "REJECT")}><X className="h-3.5 w-3.5" /> Tolak</Button><Button className="h-8 px-2" onClick={() => review(item, "APPROVE")}><Check className="h-3.5 w-3.5" /> Setujui</Button></> : null}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing !== undefined && tank ? <FuelMovementForm tank={tank} tanks={tanksQuery.data?.data ?? []} initial={editing} onClose={() => setEditing(undefined)} onSaved={refresh} /> : null}
      <ConfirmDialog {...(confirm.confirmProps as ComponentProps<typeof ConfirmDialog>)} />
    </section>
  );
}

function FuelMovementForm({ tank, tanks, initial, onClose, onSaved }: { tank: FuelTankOption; tanks: FuelTankOption[]; initial: FuelMovement | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [type, setType] = useState<FuelMovementType>(initial?.movement_type ?? "RECEIPT");
  const [movementAt, setMovementAt] = useState(localDateTime(initial?.movement_at));
  const [quantity, setQuantity] = useState(initial?.quantity_liter == null ? "" : String(initial.quantity_liter));
  const [destinationTankId, setDestinationTankId] = useState(initial?.destination_tank_id ? String(initial.destination_tank_id) : "");
  const [destinationAssetId, setDestinationAssetId] = useState(initial?.destination_asset_id ?? 0);
  const [destinationAssetCode, setDestinationAssetCode] = useState(initial?.destination_asset_code ?? "");
  const [destinationAssetName, setDestinationAssetName] = useState(initial?.destination_asset_name ?? "");
  const [reference, setReference] = useState(initial?.reference_number ?? "");
  const [meterBefore, setMeterBefore] = useState(initial?.meter_before == null ? "" : String(initial.meter_before));
  const [meterAfter, setMeterAfter] = useState(initial?.meter_after == null ? "" : String(initial.meter_after));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const destinations = tanks.filter((item) => item.id !== tank.id && item.fuel_type === tank.fuel_type && item.status === "ACTIVE");

  const save = async () => {
    if (!quantity.trim()) return toast.error("Jumlah liter wajib diisi");
    if (type === "TRANSFER" && !destinationTankId) return toast.error("Pilih tank tujuan transfer");
    const body: FuelMovementInput = {
      movement_type: type,
      movement_at: movementAt,
      quantity_liter: quantity,
      destination_tank_id: type === "TRANSFER" ? Number(destinationTankId) : undefined,
      destination_asset_id: type === "CONSUMPTION" && destinationAssetId ? destinationAssetId : undefined,
      reference_number: reference,
      meter_before: meterBefore,
      meter_after: meterAfter,
      notes,
    };
    setSaving(true);
    try {
      const response = initial ? await updateFuelMovement(initial.id, body) : await createFuelMovement(tank.id, body);
      toast.success(response.message, "Saldo belum berubah sampai transaksi disetujui.");
      await onSaved();
      onClose();
    } catch (error) { toast.error("Gagal menyimpan movement", error instanceof Error ? error.message : undefined); }
    finally { setSaving(false); }
  };

  return <Modal open onClose={onClose} title={initial ? "Ubah Fuel Movement" : "Catat Fuel Movement"} description={`${tank.AssetName} · saldo ${formatQty(tank.current_balance_liter)} liter`} size="xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={save}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Jenis movement" required><Select value={type} onChange={(event) => { setType(event.target.value as FuelMovementType); setDestinationTankId(""); setDestinationAssetId(0); setDestinationAssetCode(""); setDestinationAssetName(""); }}><option value="RECEIPT">Penerimaan</option><option value="CONSUMPTION">Pemakaian</option><option value="TRANSFER">Transfer antar-tank</option><option value="ADJUSTMENT_IN">Adjustment masuk</option><option value="ADJUSTMENT_OUT">Adjustment keluar</option></Select></Field>
      <Field label="Waktu movement" required><Input type="datetime-local" value={movementAt} onChange={(event) => setMovementAt(event.target.value)} /></Field>
      <Field label="Jumlah (liter)" required><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
      <Field label="Nomor referensi" hint="Contoh: surat jalan, bon solar, atau dokumen transfer."><Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} /></Field>
      {type === "TRANSFER" ? <div className="sm:col-span-2"><Field label="Tank tujuan" required><Select value={destinationTankId} onChange={(event) => setDestinationTankId(event.target.value)}><option value="">Pilih tank tujuan</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.AssetName} · {item.tank_number || item.AssetCode} · saldo {formatQty(item.current_balance_liter)} L</option>)}</Select></Field></div> : null}
      {type === "CONSUMPTION" ? <div className="sm:col-span-2"><Field label="Asset tujuan pemakaian" hint="Opsional; pilih genset/asset yang memakai bahan bakar."><AssetPicker selectedCode={destinationAssetCode} selectedName={destinationAssetName} includeInactive onSelect={(code, name, _company, _photo, _photos, id) => { setDestinationAssetCode(code); setDestinationAssetName(name); setDestinationAssetId(Number(id ?? 0)); }} onClear={() => { setDestinationAssetId(0); setDestinationAssetCode(""); setDestinationAssetName(""); }} placeholder="Cari atau scan QR asset tujuan…" /></Field></div> : null}
      <Field label="Meter sebelum"><Input inputMode="decimal" value={meterBefore} onChange={(event) => setMeterBefore(event.target.value)} /></Field>
      <Field label="Meter sesudah"><Input inputMode="decimal" value={meterAfter} onChange={(event) => setMeterAfter(event.target.value)} /></Field>
      <div className="sm:col-span-2"><Field label="Catatan"><Textarea value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} /></Field></div>
    </div>
  </Modal>;
}
