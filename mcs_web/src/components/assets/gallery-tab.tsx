"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, GripVertical, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Select } from "@/components/ui/primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useAssetAttachments,
  useAssetMediaMutations,
  useAttachmentCategories,
} from "@/hooks/use-asset-media";
import type { AssetAttachment } from "@/lib/api/asset-media";
import { ApiError } from "@/types/api";
import { arrayMove } from "@/lib/utils";
import { toAbsoluteUploadUrl } from "@/lib/env";

export function GalleryTab({
  assetCode,
  canWrite,
}: {
  assetCode: string;
  canWrite: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useAssetAttachments(assetCode);
  const { data: catData } = useAttachmentCategories(canWrite);
  const { uploadAttachment, deleteAttachment, reorderAttachment } =
    useAssetMediaMutations(assetCode);

  const [items, setItems] = useState<AssetAttachment[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const dragIndex = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(data?.data ?? []);
  }, [data]);

  const categories = catData?.data ?? [];
  const usedCategories = Array.from(
    new Set(items.map((a) => a.category_name).filter(Boolean)),
  );
  const visible = catFilter
    ? items.filter((a) => a.category_name === catFilter)
    : items;
  const dndEnabled = canWrite && !catFilter && items.length > 1;

  const resetForm = () => {
    setFile(null);
    setCategoryId("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitUpload = async () => {
    if (!file) {
      toast.error("Pilih file terlebih dahulu");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("asset", assetCode);
    if (categoryId) fd.append("category_id", categoryId);
    try {
      await uploadAttachment.mutateAsync(fd);
      toast.success("Lampiran diunggah");
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error("Gagal mengunggah", e instanceof ApiError ? e.message : undefined);
    }
  };

  const askDelete = (a: AssetAttachment) => {
    confirm.ask({
      title: "Hapus lampiran?",
      description: `"${a.name}" akan dihapus permanen.`,
      tone: "danger",
      confirmLabel: "Hapus",
      onConfirm: async () => {
        try {
          await deleteAttachment.mutateAsync(a.id);
          toast.success("Lampiran dihapus");
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const handleDrop = (toIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === toIndex) return;
    const next = arrayMove(items, from, toIndex);
    setItems(next);
    reorderAttachment.mutate(
      next.map((a) => a.id),
      {
        onError: (e) => {
          toast.error(
            "Gagal menyimpan urutan",
            e instanceof ApiError ? e.message : undefined,
          );
          setItems(data?.data ?? []);
        },
      },
    );
  };

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {usedCategories.length > 0 ? (
            <Select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="h-9 w-52"
            >
              <option value="">Semua kategori</option>
              {usedCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          ) : null}
          {dndEnabled ? (
            <span className="text-xs text-slate-400">
              Seret kartu untuk mengubah urutan
            </span>
          ) : catFilter ? (
            <span className="text-xs text-slate-400">
              Hapus filter untuk mengubah urutan
            </span>
          ) : null}
        </div>
        {canWrite ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" />
            Upload Lampiran
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Memuat lampiran…</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {catFilter
            ? "Tidak ada lampiran pada kategori ini."
            : "Belum ada lampiran / foto."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((a, i) => {
            const url = toAbsoluteUploadUrl(a.url as string);
            const name = a.name || a.filename || `Lampiran ${i + 1}`;
            const isImage = a.type === "image";
            return (
              <div
                key={a.id ?? i}
                draggable={dndEnabled}
                onDragStart={() => {
                  dragIndex.current = i;
                }}
                onDragOver={(e) => {
                  if (dndEnabled) e.preventDefault();
                }}
                onDrop={() => dndEnabled && handleDrop(i)}
                className={`group relative overflow-hidden rounded-lg border border-slate-200 ${
                  dndEnabled ? "cursor-move" : ""
                }`}
              >
                {dndEnabled ? (
                  <span className="absolute left-1.5 top-1.5 z-10 rounded bg-white/90 p-1 text-slate-400 shadow-sm">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                ) : null}
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full bg-slate-100 object-cover transition group-hover:opacity-90"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center bg-slate-50 text-slate-400">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                  <p className="truncate px-2 py-1.5 text-xs text-slate-500">
                    {a.category_name ? (
                      <span className="text-slate-400">{a.category_name} · </span>
                    ) : null}
                    {name}
                  </p>
                </a>
                {canWrite && a.id != null ? (
                  <button
                    type="button"
                    onClick={() => askDelete(a)}
                    className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1.5 text-rose-600 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100"
                    aria-label="Hapus lampiran"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="Upload Lampiran Aset"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Batal
            </Button>
            <Button onClick={submitUpload} loading={uploadAttachment.isPending}>
              Unggah
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="File" hint="Gambar atau dokumen, maksimal 8 MB.">
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </Field>
          <Field label="Kategori">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.category_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={deleteAttachment.isPending}
      />
    </div>
  );
}
