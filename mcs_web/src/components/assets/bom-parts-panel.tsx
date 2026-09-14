"use client";

import { useRef, useState } from "react";
import {
  History,
  ImageIcon,
  MinusCircle,
  Plus,
  PlusCircle,
  Power,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { LoadingSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  useBomPartMutations,
  useBomParts,
  useBomPhotos,
  usePartHistory,
} from "@/hooks/use-equipment";
import type { BomPart } from "@/lib/api/equipment";
import { ApiError } from "@/types/api";
import { dash, pick } from "@/lib/display";

type ModalKind = null | "sub" | "use" | "restock" | "history" | "photos";

export function BomPartsPanel({
  assetCode,
  canWrite,
}: {
  assetCode: string;
  canWrite: boolean;
}) {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useBomParts(assetCode);
  const rows = (data?.data ?? []) as BomPart[];
  const m = useBomPartMutations(assetCode);

  const [modal, setModal] = useState<ModalKind>(null);
  const [active, setActive] = useState<BomPart | null>(null);

  const open = (kind: ModalKind, part?: BomPart) => {
    if (part) setActive(part);
    setModal(kind);
  };
  const close = () => setModal(null);

  const err = (e: unknown) =>
    toast.error("Gagal", e instanceof ApiError ? e.message : undefined);

  const toggleActive = async (part: BomPart) => {
    try {
      await m.toggle.mutateAsync(part.id);
      toast.success("Status part diperbarui");
    } catch (e) {
      err(e);
    }
  };

  return (
    <div className="space-y-3">
      {canWrite ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => open("sub")}>
            <Plus className="h-4 w-4" />
            Tambah Sub-Part
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Belum ada part / BOM"
          description="Aset ini belum memiliki daftar part."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2 text-right">Stok</th>
                <th className="px-3 py-2 text-center">Status</th>
                {canWrite ? <th className="px-3 py-2 text-right">Aksi</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const level = Math.max(0, Number(row.level ?? 1) - 1);
                const header = String(row.header ?? "").trim();
                const part = pick(row, ["part", "part_name", "nama_part"]);
                const isHeader = header !== "" && part === "";
                const qty = row.qty_on_hand;
                const uom = String(row.uom ?? "").trim();
                const inactive = Number(row.is_active ?? 1) === 0;

                if (isHeader) {
                  return (
                    <tr key={row.id} className="bg-slate-50/60">
                      <td
                        className="px-3 py-2 font-semibold text-slate-700"
                        colSpan={canWrite ? 4 : 3}
                        style={{ paddingLeft: level * 18 + 12 }}
                      >
                        {header}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={row.id} className={inactive ? "opacity-50" : ""}>
                    <td
                      className="px-3 py-2 text-slate-800"
                      style={{ paddingLeft: level * 18 + 12 }}
                    >
                      {dash(part || header)}
                      {row.company ? (
                        <span className="ml-2 text-xs text-slate-400">
                          {String(row.company)}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                      {qty !== undefined && qty !== null && qty !== ""
                        ? `${qty} ${uom}`.trim()
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={
                          inactive
                            ? "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                            : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                        }
                      >
                        {inactive ? "Nonaktif" : "Aktif"}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconBtn
                            title="Pakai part"
                            onClick={() => open("use", row)}
                          >
                            <MinusCircle className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title="Restock"
                            onClick={() => open("restock", row)}
                          >
                            <PlusCircle className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title="Riwayat pemakaian"
                            onClick={() => open("history", row)}
                          >
                            <History className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn title="Foto part" onClick={() => open("photos", row)}>
                            <ImageIcon className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title={inactive ? "Aktifkan" : "Nonaktifkan"}
                            onClick={() => toggleActive(row)}
                          >
                            <Power className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal === "sub" ? (
        <SubPartModal
          assetCode={assetCode}
          pending={m.addSubPart.isPending}
          onClose={close}
          onSubmit={async (body) => {
            try {
              await m.addSubPart.mutateAsync(body);
              toast.success("Sub-part ditambahkan");
              close();
            } catch (e) {
              err(e);
            }
          }}
        />
      ) : null}

      {modal === "use" && active ? (
        <UsePartModal
          part={active}
          pending={m.use.isPending}
          onClose={close}
          onSubmit={async (body) => {
            try {
              const res = await m.use.mutateAsync({ part_id: active.id, ...body });
              toast.success(
                "Pemakaian dicatat",
                `Sisa stok: ${res.data?.qty_after ?? "-"}`,
              );
              close();
            } catch (e) {
              err(e);
            }
          }}
        />
      ) : null}

      {modal === "restock" && active ? (
        <RestockModal
          part={active}
          pending={m.restock.isPending}
          onClose={close}
          onSubmit={async (body) => {
            try {
              const res = await m.restock.mutateAsync({
                part_id: active.id,
                ...body,
              });
              toast.success(
                "Stok ditambahkan",
                `Stok sekarang: ${res.data?.qty_after ?? "-"}`,
              );
              close();
            } catch (e) {
              err(e);
            }
          }}
        />
      ) : null}

      {modal === "history" && active ? (
        <HistoryModal
          part={active}
          onClose={close}
          onDelete={async (id) => {
            try {
              await m.deleteHistory.mutateAsync({ id, partId: active.id });
              toast.success("Riwayat dihapus & stok dikembalikan");
            } catch (e) {
              err(e);
            }
          }}
          deleting={m.deleteHistory.isPending}
        />
      ) : null}

      {modal === "photos" && active ? (
        <PhotosModal
          assetCode={assetCode}
          part={active}
          onClose={close}
          onUpload={async (file) => {
            try {
              await m.uploadPhoto.mutateAsync({ partId: active.id, file });
              toast.success("Foto diunggah");
            } catch (e) {
              err(e);
            }
          }}
          onDelete={async (id) => {
            try {
              await m.deletePhoto.mutateAsync({ id, partId: active.id });
              toast.success("Foto dihapus");
            } catch (e) {
              err(e);
            }
          }}
          uploading={m.uploadPhoto.isPending}
        />
      ) : null}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}

function partLabel(part: BomPart) {
  return String(pick(part, ["part", "part_name", "nama_part"]) || part.header || "Part");
}

/* ---------------- modals ---------------- */

function SubPartModal({
  assetCode,
  onClose,
  onSubmit,
  pending,
}: {
  assetCode: string;
  onClose: () => void;
  onSubmit: (body: {
    asset_code: string;
    part: string;
    uom?: string;
    company?: string;
    qty_on_hand?: string;
  }) => void;
  pending: boolean;
}) {
  const [part, setPart] = useState("");
  const [uom, setUom] = useState("PCS");
  const [company, setCompany] = useState("");
  const [qty, setQty] = useState("0");

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah Sub-Part"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                asset_code: assetCode,
                part: part.trim(),
                uom: uom.trim() || "PCS",
                company: company.trim() || undefined,
                qty_on_hand: qty,
              })
            }
            loading={pending}
            disabled={!part.trim()}
          >
            Tambah
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nama Part" required>
          <Input value={part} onChange={(e) => setPart(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stok Awal">
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Satuan">
            <Input value={uom} onChange={(e) => setUom(e.target.value)} />
          </Field>
        </div>
        <Field label="Company" hint="Opsional.">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function UsePartModal({
  part,
  onClose,
  onSubmit,
  pending,
}: {
  part: BomPart;
  onClose: () => void;
  onSubmit: (body: {
    qty_used: string;
    used_for: string;
    work_order_no?: string;
    project_name?: string;
    reference_no?: string;
    used_date?: string;
    notes?: string;
  }) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [usedFor, setUsedFor] = useState("");
  const [woNo, setWoNo] = useState("");
  const [project, setProject] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!(Number(qty) > 0)) {
      toast.error("Qty harus lebih dari 0");
      return;
    }
    if (!usedFor.trim()) {
      toast.error("Tujuan pemakaian wajib diisi");
      return;
    }
    onSubmit({
      qty_used: qty,
      used_for: usedFor.trim(),
      work_order_no: woNo.trim() || undefined,
      project_name: project.trim() || undefined,
      reference_no: ref.trim() || undefined,
      used_date: date || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Pakai Part — ${partLabel(part)}`}
      description={`Stok saat ini: ${part.qty_on_hand ?? "-"} ${part.uom ?? ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={pending}>
            Catat Pemakaian
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qty Dipakai" required>
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
          </Field>
          <Field label="Tanggal">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Dipakai Untuk" required hint="mis. Perbaikan / Proyek / WO">
          <Input value={usedFor} onChange={(e) => setUsedFor(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="No. WO" hint="Opsional.">
            <Input value={woNo} onChange={(e) => setWoNo(e.target.value)} />
          </Field>
          <Field label="Nama Proyek" hint="Opsional.">
            <Input value={project} onChange={(e) => setProject(e.target.value)} />
          </Field>
        </div>
        <Field label="No. Referensi" hint="Opsional.">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <Field label="Catatan" hint="Opsional.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RestockModal({
  part,
  onClose,
  onSubmit,
  pending,
}: {
  part: BomPart;
  onClose: () => void;
  onSubmit: (body: {
    qty_added: string;
    notes: string;
    reference_no?: string;
  }) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [ref, setRef] = useState("");

  const submit = () => {
    if (!(Number(qty) > 0)) {
      toast.error("Qty harus lebih dari 0");
      return;
    }
    if (!notes.trim()) {
      toast.error("Catatan wajib diisi");
      return;
    }
    onSubmit({
      qty_added: qty,
      notes: notes.trim(),
      reference_no: ref.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Restock — ${partLabel(part)}`}
      description={`Stok saat ini: ${part.qty_on_hand ?? "-"} ${part.uom ?? ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={pending}>
            Tambah Stok
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Qty Ditambah" required>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            autoFocus
          />
        </Field>
        <Field label="Catatan" required hint="mis. Pembelian PO-123 / Retur">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="No. Referensi" hint="Opsional.">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function HistoryModal({
  part,
  onClose,
  onDelete,
  deleting,
}: {
  part: BomPart;
  onClose: () => void;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const { data, isLoading, error, refetch } = usePartHistory(part.id);
  const rows = data?.data ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Riwayat Pemakaian — ${partLabel(part)}`}
      description="Nilai negatif = restock. Menghapus baris mengembalikan stok."
    >
      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada riwayat" />
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Sisa</th>
                <th className="px-3 py-2">Untuk</th>
                <th className="px-3 py-2">Oleh</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {dash(h.used_date)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(h.qty_used) < 0
                      ? `+${Math.abs(Number(h.qty_used))}`
                      : h.qty_used}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {dash(h.qty_after)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{dash(h.used_for)}</td>
                  <td className="px-3 py-2 text-slate-500">{dash(h.created_by)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(h.id)}
                      disabled={deleting}
                      className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      aria-label="Hapus riwayat"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function PhotosModal({
  assetCode,
  part,
  onClose,
  onUpload,
  onDelete,
  uploading,
}: {
  assetCode: string;
  part: BomPart;
  onClose: () => void;
  onUpload: (file: File) => void;
  onDelete: (id: number) => void;
  uploading: boolean;
}) {
  const { data, isLoading } = useBomPhotos(assetCode, part.id);
  const photos = data?.data ?? [];
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Foto Part — ${partLabel(part)}`}
      footer={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>
            <ImageIcon className="h-4 w-4" />
            Unggah Foto
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : photos.length === 0 ? (
        <EmptyState title="Belum ada foto" description="Unggah foto part di bawah." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-lg border border-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.original_filename ?? p.filename}
                className="h-32 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-rose-600 opacity-0 shadow transition group-hover:opacity-100"
                aria-label="Hapus foto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
