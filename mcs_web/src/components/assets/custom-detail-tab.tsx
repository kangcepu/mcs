"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAssetMediaMutations, useCustomDetails } from "@/hooks/use-asset-media";
import { CustomDetailImportModal } from "@/components/assets/custom-detail-import-modal";
import { ImageAnnotator } from "@/components/assets/image-annotator";
import type {
  CustomDetailImage,
  CustomDetailInput,
  CustomDetailRow,
} from "@/lib/api/asset-media";
import { ApiError } from "@/types/api";
import { dash } from "@/lib/display";

const FIELDS: Array<{ key: keyof CustomDetailInput; label: string }> = [
  { key: "bagian", label: "Bagian" },
  { key: "bagian_mesin", label: "Bagian Mesin" },
  { key: "part_mesin", label: "Part Mesin" },
  { key: "kondisi", label: "Kondisi" },
  { key: "durasi_pengecekan", label: "Durasi Pengecekan" },
  { key: "pic", label: "PIC" },
  { key: "part_diperlukan", label: "Part Diperlukan" },
];

const IMAGE_TYPES = [
  { value: "tampak_jauh", label: "Tampak Jauh" },
  { value: "tampak_dekat", label: "Tampak Dekat" },
  { value: "detail_part", label: "Detail Part" },
];

const emptyForm: CustomDetailInput = {
  bagian: "",
  bagian_mesin: "",
  part_mesin: "",
  kondisi: "",
  durasi_pengecekan: "",
  pic: "",
  part_diperlukan: "",
};

export function CustomDetailTab({
  assetCode,
  canWrite,
}: {
  assetCode: string;
  canWrite: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useCustomDetails(assetCode);
  const {
    createDetail,
    updateDetail,
    deleteDetail,
    uploadDetailImage,
    deleteDetailImage,
  } = useAssetMediaMutations(assetCode);

  const rows: CustomDetailRow[] = data?.data ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<CustomDetailRow | null>(null);
  const [form, setForm] = useState<CustomDetailInput>(emptyForm);

  const [imgFor, setImgFor] = useState<CustomDetailRow | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgType, setImgType] = useState("detail_part");
  const imgRef = useRef<HTMLInputElement>(null);

  const [annotate, setAnnotate] = useState<{
    row: CustomDetailRow;
    im: CustomDetailImage;
  } | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (row: CustomDetailRow) => {
    setEditing(row);
    setForm({
      bagian: row.bagian ?? "",
      bagian_mesin: row.bagian_mesin ?? "",
      part_mesin: row.part_mesin ?? "",
      kondisi: row.kondisi ?? "",
      durasi_pengecekan: row.durasi_pengecekan ?? "",
      pic: row.pic ?? "",
      part_diperlukan: row.part_diperlukan ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    try {
      if (editing) {
        await updateDetail.mutateAsync({ id: editing.id, body: form });
        toast.success("Custom Detail diperbarui");
      } else {
        await createDetail.mutateAsync(form);
        toast.success("Custom Detail ditambahkan");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error("Gagal menyimpan", e instanceof ApiError ? e.message : undefined);
    }
  };

  const askDeleteRow = (row: CustomDetailRow) => {
    confirm.ask({
      title: "Hapus baris Custom Detail?",
      description: "Baris beserta seluruh fotonya akan dihapus permanen.",
      tone: "danger",
      confirmLabel: "Hapus",
      onConfirm: async () => {
        try {
          await deleteDetail.mutateAsync(row.id);
          toast.success("Baris dihapus");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const resetImg = () => {
    setImgFile(null);
    setImgType("detail_part");
    if (imgRef.current) imgRef.current.value = "";
  };

  const submitImage = async () => {
    if (!imgFor) return;
    if (!imgFile) {
      toast.error("Pilih gambar terlebih dahulu");
      return;
    }
    const fd = new FormData();
    fd.append("image", imgFile);
    fd.append("image_type", imgType);
    try {
      await uploadDetailImage.mutateAsync({ id: imgFor.id, fd });
      toast.success("Gambar diunggah");
      setImgFor(null);
      resetImg();
    } catch (e) {
      toast.error("Gagal mengunggah", e instanceof ApiError ? e.message : undefined);
    }
  };

  const askDeleteImage = (imageId: number | string) => {
    confirm.ask({
      title: "Hapus gambar?",
      description: "Gambar akan dihapus permanen.",
      tone: "danger",
      confirmLabel: "Hapus",
      onConfirm: async () => {
        try {
          await deleteDetailImage.mutateAsync(imageId);
          toast.success("Gambar dihapus");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  return (
    <div className="card p-4">
      {canWrite ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            Impor Excel
          </Button>
          <Button variant="secondary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Baris
          </Button>
        </div>
      ) : null}

      {importOpen ? (
        <CustomDetailImportModal
          assetCode={assetCode}
          onClose={() => setImportOpen(false)}
        />
      ) : null}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Memuat data…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Belum ada Custom Detail.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => {
            const images = row.images ?? [];
            return (
              <div
                key={row.id ?? i}
                className="flex flex-col rounded-lg border border-slate-200 p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">
                    {dash(row.bagian) || `Baris ${i + 1}`}
                  </p>
                  {canWrite ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Ubah baris"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => askDeleteRow(row)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Hapus baris"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <dl className="space-y-0.5 text-xs text-slate-500">
                  {FIELDS.slice(1).map((f) => (
                    <div key={f.key} className="flex justify-between gap-2">
                      <dt>{f.label}</dt>
                      <dd className="text-right text-slate-700">
                        {dash(row[f.key as keyof CustomDetailRow] as string | null | undefined)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {images.map((im) => (
                    <span key={im.id} className="group/img relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={im.url}
                        alt={im.image_type}
                        title={im.image_type}
                        className="h-14 w-14 rounded object-cover ring-1 ring-slate-200"
                      />
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setAnnotate({ row, im })}
                            className="absolute -left-1.5 -top-1.5 rounded-full bg-white p-0.5 text-brand-600 shadow ring-1 ring-slate-200 opacity-0 transition group-hover/img:opacity-100"
                            aria-label="Anotasi gambar"
                            title="Anotasi (lingkaran / teks / panah)"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => askDeleteImage(im.id)}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-rose-600 shadow ring-1 ring-slate-200 opacity-0 transition group-hover/img:opacity-100"
                            aria-label="Hapus gambar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                    </span>
                  ))}
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => {
                        setImgFor(row);
                        resetImg();
                      }}
                      className="grid h-14 w-14 place-items-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
                      aria-label="Tambah foto"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Ubah Custom Detail" : "Tambah Custom Detail"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={submitForm}
              loading={createDetail.isPending || updateDetail.isPending}
            >
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                value={form[f.key] ?? ""}
                onChange={(e) =>
                  setForm((s) => ({ ...s, [f.key]: e.target.value }))
                }
              />
            </Field>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!imgFor}
        onClose={() => {
          setImgFor(null);
          resetImg();
        }}
        title="Tambah Foto Custom Detail"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setImgFor(null);
                resetImg();
              }}
            >
              Batal
            </Button>
            <Button onClick={submitImage} loading={uploadDetailImage.isPending}>
              Unggah
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Gambar" hint="PNG/JPG/WebP, maksimal 8 MB.">
            <input
              ref={imgRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
              onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </Field>
          <Field label="Jenis Foto">
            <Select value={imgType} onChange={(e) => setImgType(e.target.value)}>
              {IMAGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={
          deleteDetail.isPending || deleteDetailImage.isPending
        }
      />

      {annotate ? (
        <ImageAnnotator
          open
          onClose={() => setAnnotate(null)}
          assetCode={assetCode}
          customDetailId={annotate.row.id}
          columnType={annotate.im.image_type}
          imagePath={imgRelPath(annotate.im)}
          onSaved={() => setAnnotate(null)}
        />
      ) : null}
    </div>
  );
}

/** Ambil path relatif `assets/docs/customDetails/xxx` dari image_path / url / gateway-proxy. */
function imgRelPath(im: CustomDetailImage): string {
  const raw = String(im.image_path || im.url || "");
  const km = raw.match(/[?&]k=([^&]+)/);
  if (km && km[1]) {
    try {
      return decodeURIComponent(km[1]);
    } catch {
      /* fall through */
    }
  }
  const noQuery = raw.split("?")[0] ?? raw;
  const idx = noQuery.indexOf("assets/docs/");
  if (idx >= 0) return noQuery.slice(idx);
  return noQuery.replace(/^\.?\/+/, "");
}
