"use client";

import { useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations } from "@/hooks/use-assets";
import { ApiError } from "@/types/api";

interface ManualRow {
  key: number;
  item_name: string;
  frequency: string;
  pic: string;
  photo_1: File | null;
  photo_2: File | null;
}

const emptyRow = (key: number): ManualRow => ({
  key,
  item_name: "",
  frequency: "",
  pic: "",
  photo_1: null,
  photo_2: null,
});

export function ManualChildAssetsModal({ assetCode, onClose }: { assetCode: string; onClose: () => void }) {
  const toast = useToast();
  const mutations = useAssetMutations(assetCode);
  const [groupName, setGroupName] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [items, setItems] = useState<ManualRow[]>([emptyRow(1)]);

  const update = <K extends keyof ManualRow>(key: number, field: K, value: ManualRow[K]) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item));
  };

  const addRow = () => {
    setItems((current) => [...current, emptyRow(nextKey)]);
    setNextKey((value) => value + 1);
  };

  const removeRow = (key: number) => {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item.key !== key));
  };

  const valid = groupName.trim() !== "" && items.every((item) => item.item_name.trim() !== "");
  const save = async () => {
    if (!valid) return;
    try {
      const response = await mutations.addManualChildGroup.mutateAsync({
        groupName: groupName.trim(),
        items: items.map(({ key: _key, ...item }) => ({ ...item, item_name: item.item_name.trim() })),
      });
      const failedPhotos = Number(response.data?.photo_upload_failures ?? 0);
      if (failedPhotos > 0) {
        toast.warning("Komponen tersimpan", `${failedPhotos} foto gagal diunggah dan dapat ditambahkan kembali dari tabel.`);
      } else {
        toast.success("Aset terkait ditambahkan", `${groupName.trim()} dan ${items.length} komponen berhasil disimpan.`);
      }
      onClose();
    } catch (error) {
      toast.error("Gagal menambahkan aset terkait", error instanceof ApiError ? error.message : error instanceof Error ? error.message : undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah Aset Terkait Manual"
      description="Buat kelompok dan komponennya tanpa import Excel. Asset Code / QR dapat ditautkan kemudian."
      size="2xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button disabled={!valid} loading={mutations.addManualChildGroup.isPending} onClick={save}>Simpan</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="Nama kelompok / kategori" required hint="Contoh: Personal Computer, CCTV, Printer.">
          <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Personal Computer" maxLength={255} />
        </Field>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Komponen *</th>
                <th className="px-3 py-2">Frekuensi</th>
                <th className="px-3 py-2">PIC</th>
                <th className="px-3 py-2">Foto 1</th>
                <th className="px-3 py-2">Foto 2</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.key} className="align-top">
                  <td className="p-3"><Input value={item.item_name} onChange={(event) => update(item.key, "item_name", event.target.value)} placeholder="CPU" maxLength={255} /></td>
                  <td className="p-3"><Input value={item.frequency} onChange={(event) => update(item.key, "frequency", event.target.value)} placeholder="3 Bulan" maxLength={80} /></td>
                  <td className="p-3"><Input value={item.pic} onChange={(event) => update(item.key, "pic", event.target.value)} placeholder="IT" maxLength={120} /></td>
                  <td className="p-3"><PhotoInput file={item.photo_1} onChange={(file) => update(item.key, "photo_1", file)} /></td>
                  <td className="p-3"><PhotoInput file={item.photo_2} onChange={(file) => update(item.key, "photo_2", file)} /></td>
                  <td className="p-3"><Button type="button" variant="ghost" className="text-rose-600" disabled={items.length === 1} onClick={() => removeRow(item.key)} aria-label="Hapus komponen"><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button type="button" variant="secondary" onClick={addRow}><Plus className="h-4 w-4" /> Tambah Komponen</Button>
        <p className="text-xs text-slate-500">Foto bersifat opsional. Format JPG, PNG, WEBP, GIF, atau BMP; maksimal 8 MB per foto.</p>
      </div>
    </Modal>
  );
}

function PhotoInput({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600">
      <ImagePlus className="h-4 w-4 shrink-0" />
      <span className="max-w-28 truncate">{file?.name ?? "Pilih foto"}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        className="hidden"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
