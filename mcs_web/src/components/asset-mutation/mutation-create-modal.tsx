"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  useAssetMutationActions,
  useAssetMutationMeta,
} from "@/hooks/use-asset-mutation";
import { searchMutationAssets } from "@/lib/api/asset-mutation";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { toDateInput } from "@/lib/format";
import { pick } from "@/lib/display";
import { ApiError } from "@/types/api";

interface LineDraft {
  key: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  alias_name: string;
  category: string;
  company_after: string;
  location_after: string;
  mutation_purpose: string;
}

export function MutationCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (docNo: string) => void;
}) {
  const toast = useToast();
  const meta = useAssetMutationMeta({}, open);
  const { addLine, submit } = useAssetMutationActions();

  const [date, setDate] = useState(toDateInput(new Date()));
  const [companyBefore, setCompanyBefore] = useState("");
  const [locationBefore, setLocationBefore] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<Array<Record<string, unknown>>>([]);
  const [searching, setSearching] = useState(false);
  const debouncedSearch = useDebouncedValue(assetSearch, 300);

  const docNo = String(meta.data?.data?.document_no ?? "");
  const companies = meta.data?.data?.companies ?? [];
  const locations = meta.data?.data?.locations ?? [];

  useEffect(() => {
    if (!open) return;
    setDate(toDateInput(new Date()));
    setCompanyBefore("");
    setLocationBefore("");
    setLines([]);
    setAssetSearch("");
    setAssetResults([]);
  }, [open]);

  useEffect(() => {
    if (!open || debouncedSearch.trim().length < 2) {
      setAssetResults([]);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    searchMutationAssets({
      company_before: companyBefore || undefined,
      location_before: locationBefore || undefined,
      search: debouncedSearch.trim(),
      limit: 30,
    }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setAssetResults(res.data?.items ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAssetResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => {
      controller.abort();
    };
  }, [debouncedSearch, companyBefore, locationBefore, open]);

  const addAssetLine = (asset: Record<string, unknown>) => {
    const code = pick(asset, ["AssetCode", "asset_code"]);
    if (lines.some((l) => l.asset_code === code)) {
      toast.warning("Sudah ditambahkan", code);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: code + "-" + Date.now(),
        asset_id: pick(asset, ["AssetID", "asset_id"]),
        asset_code: code,
        asset_name: pick(asset, ["AssetName", "asset_name"]),
        alias_name: pick(asset, ["AliasName", "alias_name"]),
        category: pick(asset, ["CategoryAsset", "category"]),
        company_after: companyBefore,
        location_after: locationBefore,
        mutation_purpose: "",
      },
    ]);
    setAssetSearch("");
    setAssetResults([]);
  };

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const valid = useMemo(() => {
    if (!docNo || !date || !companyBefore || !locationBefore || lines.length === 0)
      return false;
    return lines.every(
      (l) => l.company_after && l.location_after && l.mutation_purpose.trim(),
    );
  }, [docNo, date, companyBefore, locationBefore, lines]);

  const saving = addLine.isPending || submit.isPending;

  const onSubmit = async () => {
    if (!valid) {
      toast.warning("Lengkapi data", "Isi header dan semua kolom setiap baris aset.");
      return;
    }
    try {
      for (const l of lines) {
        await addLine.mutateAsync({
          doc_no: docNo,
          asset_code: l.asset_code,
          asset_name: l.asset_name,
          alias_name: l.alias_name,
          category: l.category,
          company_after: l.company_after,
          location_after: l.location_after,
          mutation_purpose: l.mutation_purpose.trim(),
          asset_id: l.asset_id || undefined,
        });
      }
      await submit.mutateAsync({
        doc_no: docNo,
        date,
        location_before: locationBefore,
        company_before: companyBefore,
      });
      toast.success("Mutasi aset diajukan", docNo);
      onCreated(docNo);
    } catch (e) {
      toast.error(
        "Gagal mengajukan",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="Buat Mutasi Aset"
      description={docNo ? `No. Dokumen: ${docNo}` : "Menyiapkan nomor dokumen…"}
    >
      {meta.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tanggal" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Company Asal" required>
              <Select
                value={companyBefore}
                onChange={(e) => setCompanyBefore(e.target.value)}
              >
                <option value="">— Pilih —</option>
                {companies.map((c) => (
                  <option key={c.id_company} value={c.company_name}>
                    {c.company_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lokasi Asal" required>
              <Select
                value={locationBefore}
                onChange={(e) => setLocationBefore(e.target.value)}
              >
                <option value="">— Pilih —</option>
                {locations.map((l) => (
                  <option key={l.id_location_asset} value={l.location_name}>
                    {l.location_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Asset picker */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tambah Aset
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Cari kode / nama aset…"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
              />
              {debouncedSearch.trim().length >= 2 ? (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Mencari…</p>
                  ) : assetResults.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Tidak ada aset cocok.</p>
                  ) : (
                    assetResults.map((a, i) => (
                      <button
                        key={pick(a, ["AssetCode"]) || i}
                        type="button"
                        onClick={() => addAssetLine(a)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50/60"
                      >
                        <Plus className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-800">
                          {pick(a, ["AssetCode"])}
                        </span>
                        <span className="truncate text-slate-500">
                          {pick(a, ["AssetName"])}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Lines */}
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              Belum ada aset. Cari dan tambahkan minimal satu aset.
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{l.asset_code}</p>
                      <p className="text-xs text-slate-400">{l.asset_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) => prev.filter((x) => x.key !== l.key))
                      }
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select
                      value={l.company_after}
                      onChange={(e) => patchLine(l.key, { company_after: e.target.value })}
                    >
                      <option value="">Company Tujuan…</option>
                      {companies.map((c) => (
                        <option key={c.id_company} value={c.company_name}>
                          {c.company_name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={l.location_after}
                      onChange={(e) => patchLine(l.key, { location_after: e.target.value })}
                    >
                      <option value="">Lokasi Tujuan…</option>
                      {locations.map((loc) => (
                        <option key={loc.id_location_asset} value={loc.location_name}>
                          {loc.location_name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      placeholder="Tujuan mutasi"
                      value={l.mutation_purpose}
                      onChange={(e) =>
                        patchLine(l.key, { mutation_purpose: e.target.value })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={onSubmit} loading={saving} disabled={!valid}>
              Ajukan Mutasi
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
