"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ArrowRightLeft, FileUp, ImagePlus, Link2, Plus, Trash2, Unlink, X } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations } from "@/hooks/use-assets";
import type { AssetDetail } from "@/types/asset";
import { ApiError } from "@/types/api";
import { ChildAssetsImportModal } from "@/components/assets/child-assets-import-modal";
import { MoveChildAssetModal } from "@/components/assets/move-child-asset-modal";
import { LinkPendingChildModal } from "@/components/assets/link-pending-child-modal";
import { ManualChildAssetsModal } from "@/components/assets/manual-child-assets-modal";

function assetHref(code: string): string {
  return `/assets/${code.split("/").map(encodeURIComponent).join("/")}`;
}

export function ChildAssetsPanel({
  assetCode,
  assetChildren,
  relatedGroups = [],
  canWrite,
}: {
  assetCode: string;
  assetChildren: NonNullable<AssetDetail["children"]>;
  relatedGroups?: NonNullable<AssetDetail["related_groups"]>;
  canWrite: boolean;
}) {
  const toast = useToast();
  const mutations = useAssetMutations(assetCode);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [moving, setMoving] = useState<{ code: string; name: string } | null>(null);
  const [linkingPending, setLinkingPending] = useState<{ id: number; name: string } | null>(null);
  const [selected, setSelected] = useState({ code: "", name: "" });
  const groupedAssetIds = useMemo(
    () => new Set(relatedGroups.flatMap((group) => group.items.map((item) => Number(item.linked_asset_id))).filter(Boolean)),
    [relatedGroups],
  );
  const standaloneChildren = assetChildren.filter((child) => !groupedAssetIds.has(Number(child.AssetID)));

  const attach = async () => {
    if (!selected.code) return;
    try {
      await mutations.attachChild.mutateAsync(selected.code);
      toast.success("Aset anak ditautkan", `${selected.name || selected.code} sekarang berada di dalam ${assetCode}.`);
      setSelected({ code: "", name: "" });
      setAdding(false);
    } catch (error) {
      toast.error("Gagal menautkan aset", error instanceof ApiError ? error.message : undefined);
    }
  };

  const detach = async (code: string, name: string) => {
    try {
      await mutations.detachChild.mutateAsync(code);
      toast.success("Tautan dilepas", `${name || code} tetap tersedia sebagai aset mandiri.`);
    } catch (error) {
      toast.error("Gagal melepas aset", error instanceof ApiError ? error.message : undefined);
    }
  };

  const deletePending = async (id: number, name: string) => {
    if (!window.confirm(`Hapus ${name} dari daftar aset terkait?`)) return;
    try {
      await mutations.deletePendingChild.mutateAsync(id);
      toast.success("Aset terkait dihapus", `${name} dihapus dari daftar belum tertaut.`);
    } catch (error) {
      toast.error("Gagal menghapus aset terkait", error instanceof ApiError ? error.message : undefined);
    }
  };

  const uploadPhoto = async (detailId: number, slot: 1 | 2, photo: File) => {
    try {
      await mutations.uploadChildPhoto.mutateAsync({ detailId, slot, photo });
      toast.success(`Foto ${slot} disimpan`);
    } catch (error) {
      toast.error(`Gagal menyimpan Foto ${slot}`, error instanceof ApiError ? error.message : undefined);
    }
  };

  const deletePhoto = async (detailId: number, slot: 1 | 2) => {
    if (!window.confirm(`Hapus Foto ${slot} komponen ini?`)) return;
    try {
      await mutations.deleteChildPhoto.mutateAsync({ detailId, slot });
      toast.success(`Foto ${slot} dihapus`);
    } catch (error) {
      toast.error(`Gagal menghapus Foto ${slot}`, error instanceof ApiError ? error.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Aset di dalam {assetCode}</h3>
          <p className="text-xs text-slate-500">Asset Code boleh diisi saat import atau ditautkan kemudian dari daftar ini.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <FileUp className="h-4 w-4" /> Import Excel
            </Button>
            <Button variant="secondary" onClick={() => setAddingManual(true)}>
              <Plus className="h-4 w-4" /> Tambah Manual
            </Button>
            <Button variant="secondary" onClick={() => setAdding((value) => !value)}>
              <Link2 className="h-4 w-4" /> Tautkan Aset Existing
            </Button>
          </div>
        ) : null}
      </div>

      {adding ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <AssetPicker
              selectedCode={selected.code}
              selectedName={selected.name}
              onSelect={(code, name) => setSelected({ code, name })}
              onClear={() => setSelected({ code: "", name: "" })}
              placeholder="Cari aset yang akan dimasukkan…"
              excludeLinked
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setAdding(false); setSelected({ code: "", name: "" }); }}>Batal</Button>
              <Button disabled={!selected.code || selected.code === assetCode} loading={mutations.attachChild.isPending} onClick={attach}>Tautkan</Button>
            </div>
          </div>
          {selected.code === assetCode ? <p className="mt-2 text-xs text-rose-600">Aset tidak dapat menjadi anak dari dirinya sendiri.</p> : null}
        </div>
      ) : null}

      {standaloneChildren.length === 0 && relatedGroups.length === 0 ? (
        <EmptyState icon={<Link2 className="h-6 w-6" />} title="Belum ada aset anak" description="Tautkan PC, perangkat, atau aset lain yang secara fisik berada di dalam aset ini." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Aset / Komponen</th><th className="px-3 py-2">Kategori / Frekuensi</th><th className="px-3 py-2">Lokasi / PIC</th><th className="px-3 py-2">Foto 1</th><th className="px-3 py-2">Foto 2</th><th className="px-3 py-2">Status</th>{canWrite ? <th className="px-3 py-2 text-right">Aksi</th> : null}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {relatedGroups.map((group) => {
                return (
                  <Fragment key={`group-${group.id}`}>
                    <tr className="bg-slate-100/80">
                      <td className="px-3 py-2.5 font-semibold text-slate-800" colSpan={canWrite ? 7 : 6}>{group.child_name}</td>
                    </tr>
                    {group.items.map((item) => {
                      const linked = Boolean(item.linked_asset_id && item.AssetCode);
                      const displayName = `${group.child_name} / ${item.item_name}`;
                      return (
                        <tr key={`detail-${item.id}`} className={linked ? "bg-white" : "bg-amber-50/30"}>
                          <td className="py-2.5 pl-8 pr-3">
                            <span className="mr-2 text-slate-300">└</span>
                            {linked ? <Link href={assetHref(String(item.AssetCode))} className="font-medium text-brand-700 hover:underline">{item.item_name}</Link> : <span className="font-medium text-slate-700">{item.item_name}</span>}
                            <span className={`block pl-5 text-xs ${linked ? "text-slate-400" : "text-amber-600"}`}>{linked ? item.AssetCode : "Asset Code / QR belum diisi"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{item.CategoryAsset || item.frequency || "-"}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.LocationAsset || item.pic || "-"}</td>
                          <td className="px-3 py-2.5"><ChildPhotoCell detailId={item.id} slot={1} url={item.photo_1_url} name={item.photo_1_name} canWrite={canWrite} onUpload={uploadPhoto} onDelete={deletePhoto} /></td>
                          <td className="px-3 py-2.5"><ChildPhotoCell detailId={item.id} slot={2} url={item.photo_2_url} name={item.photo_2_name} canWrite={canWrite} onUpload={uploadPhoto} onDelete={deletePhoto} /></td>
                          <td className={`px-3 py-2.5 ${linked ? "text-emerald-700" : "text-amber-700"}`}>{linked ? (item.active === "active" ? "Aktif" : "Nonaktif") : "Belum tertaut"}</td>
                          {canWrite ? (
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                {linked ? (
                                  <>
                                    <Button variant="ghost" onClick={() => setMoving({ code: String(item.AssetCode), name: displayName })}><ArrowRightLeft className="h-4 w-4" /> Pindah</Button>
                                    <Button variant="ghost" className="text-rose-600" loading={mutations.detachChild.isPending} onClick={() => detach(String(item.AssetCode), displayName)}><Unlink className="h-4 w-4" /> Lepas</Button>
                                  </>
                                ) : (
                                  <>
                                    <Button variant="ghost" onClick={() => setLinkingPending({ id: item.id, name: displayName })}><Link2 className="h-4 w-4" /> Isi Code / QR</Button>
                                    <Button variant="ghost" className="text-rose-600" loading={mutations.deletePendingChild.isPending} onClick={() => deletePending(item.id, displayName)}><Trash2 className="h-4 w-4" /> Hapus</Button>
                                  </>
                                )}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {standaloneChildren.map((child) => (
                <tr key={child.AssetID}>
                  <td className="px-3 py-3"><Link href={assetHref(child.AssetCode)} className="font-medium text-brand-700 hover:underline">{child.AssetName || child.AssetCode}</Link><span className="block text-xs text-slate-400">{child.AssetCode}</span></td>
                  <td className="px-3 py-3 text-slate-600">{child.CategoryAsset || "-"}</td>
                  <td className="px-3 py-3 text-slate-600">{child.LocationAsset || "-"}</td>
                  <td className="px-3 py-3 text-slate-400">-</td>
                  <td className="px-3 py-3 text-slate-400">-</td>
                  <td className="px-3 py-3 text-slate-600">{child.active === "active" ? "Aktif" : "Nonaktif"}</td>
                  {canWrite ? (
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setMoving({ code: child.AssetCode, name: child.AssetName })}>
                          <ArrowRightLeft className="h-4 w-4" /> Pindah
                        </Button>
                        <Button variant="ghost" className="text-rose-600" loading={mutations.detachChild.isPending} onClick={() => detach(child.AssetCode, child.AssetName)}>
                          <Unlink className="h-4 w-4" /> Lepas
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importing ? <ChildAssetsImportModal assetCode={assetCode} onClose={() => setImporting(false)} /> : null}
      {addingManual ? <ManualChildAssetsModal assetCode={assetCode} onClose={() => setAddingManual(false)} /> : null}
      {moving ? (
        <MoveChildAssetModal
          childCode={moving.code}
          childName={moving.name}
          currentParentCode={assetCode}
          onClose={() => setMoving(null)}
        />
      ) : null}
      {linkingPending ? (
        <LinkPendingChildModal
          parentAssetCode={assetCode}
          pendingId={linkingPending.id}
          childName={linkingPending.name}
          onClose={() => setLinkingPending(null)}
        />
      ) : null}
    </div>
  );
}

function ChildPhotoCell({
  detailId,
  slot,
  url,
  name,
  canWrite,
  onUpload,
  onDelete,
}: {
  detailId: number;
  slot: 1 | 2;
  url?: string | null;
  name?: string | null;
  canWrite: boolean;
  onUpload: (detailId: number, slot: 1 | 2, photo: File) => Promise<void>;
  onDelete: (detailId: number, slot: 1 | 2) => Promise<void>;
}) {
  if (url) {
    return (
      <div className="flex items-center gap-1.5">
        <a href={url} target="_blank" rel="noreferrer" title={name || `Foto ${slot}`}>
          <img src={url} alt={name || `Foto ${slot}`} className="h-10 w-12 rounded-md border border-slate-200 object-cover" />
        </a>
        {canWrite ? (
          <div className="flex flex-col gap-0.5">
            <label className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={`Ganti Foto ${slot}`}>
              <ImagePlus className="h-3.5 w-3.5" />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(detailId, slot, file); event.currentTarget.value = ""; }} />
            </label>
            <button type="button" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title={`Hapus Foto ${slot}`} onClick={() => void onDelete(detailId, slot)}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : null}
      </div>
    );
  }

  return canWrite ? (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600">
      <ImagePlus className="h-3.5 w-3.5" /> Tambah
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(detailId, slot, file); event.currentTarget.value = ""; }} />
    </label>
  ) : <span className="text-slate-400">-</span>;
}
