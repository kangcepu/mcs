"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { useAssetSearch } from "@/hooks/use-assets";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { pick } from "@/lib/display";
import { toAbsoluteUploadUrl } from "@/lib/env";

/**
 * Autocomplete aset — cari berdasarkan nama, kode, atau nama company.
 * Menyimpan `asset_code`, menampilkan nama + kode + company.
 */
export function AssetPicker({
  selectedName,
  selectedCode,
  selectedPhotoUrl,
  selectedPhotoUrls,
  onSelect,
  onClear,
  placeholder = "Cari nama / kode / company aset…",
  autoFocus,
  includeInactive = false,
  forWorkOrder = false,
}: {
  selectedName: string;
  selectedCode: string;
  /** Foto aset yang lagi dipilih, kalau ada. */
  selectedPhotoUrl?: string | null;
  /** Semua foto aset yang lagi dipilih (gallery), kalau ada. */
  selectedPhotoUrls?: string[];
  onSelect: (code: string, name: string, company: string, photoUrl?: string | null, photoUrls?: string[]) => void;
  onClear: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Dipakai report agar aset nonaktif yang punya riwayat tetap dapat dipilih. */
  includeInactive?: boolean;
  /** Lookup aset untuk create WO tanpa mensyaratkan akses Asset Manage. */
  forWorkOrder?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const q = useDebouncedValue(term.trim(), 300);
  const { data, isFetching } = useAssetSearch(q, includeInactive, forWorkOrder);
  const rows = (data?.data ?? []) as Array<Record<string, unknown>>;

  if (selectedCode) {
    const gallery = selectedPhotoUrls ?? (selectedPhotoUrl ? [selectedPhotoUrl] : []);
    return (
      <div className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
        <div className="flex items-center gap-2">
          {selectedPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedPhotoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] text-slate-400 ring-1 ring-slate-200">
              No foto
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-800">
              {selectedName || selectedCode}
            </p>
            <p className="truncate text-xs text-slate-400">{selectedCode}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear();
              setTerm("");
              setOpen(true);
            }}
            className="shrink-0 rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"
          >
            Ganti
          </button>
        </div>
        {gallery.length > 1 ? (
          <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2 sm:grid-cols-6">
            {gallery.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url + i}
                src={url}
                alt=""
                className="aspect-square w-full rounded-md object-cover ring-1 ring-slate-200"
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {isFetching ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-300" />
        ) : null}
      </div>

      {open && q.length >= 2 ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {rows.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">
              {isFetching ? "Mencari…" : "Aset tidak ditemukan."}
            </p>
          ) : (
            rows.map((r, i) => {
              const code = String(pick(r, ["asset_code", "AssetCode", "AssetID"]));
              const name = pick(r, ["asset_name", "name", "AssetName"]);
              const company = pick(r, ["company", "company_name", "CompanyName"]);
              const loc = pick(r, ["location", "location_name", "LocationAsset"]);
              const photoUrl = toAbsoluteUploadUrl(pick(r, ["photo_url"]));
              const photoUrls = (
                Array.isArray(r.photo_urls)
                  ? (r.photo_urls as unknown[]).filter((u): u is string => typeof u === "string")
                  : []
              ).map(toAbsoluteUploadUrl);
              return (
                <button
                  type="button"
                  key={code || i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(code, name, company, photoUrl || null, photoUrls);
                    setOpen(false);
                    setTerm("");
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-[8px] text-slate-400 ring-1 ring-slate-200">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {name || code}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {code}
                      {company ? ` · ${company}` : ""}
                      {loc ? ` · ${loc}` : ""}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
