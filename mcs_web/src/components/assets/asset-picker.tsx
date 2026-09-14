"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { useAssetSearch } from "@/hooks/use-assets";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { pick } from "@/lib/display";

/**
 * Autocomplete aset — cari berdasarkan nama, kode, atau nama company.
 * Menyimpan `asset_code`, menampilkan nama + kode + company.
 */
export function AssetPicker({
  selectedName,
  selectedCode,
  onSelect,
  onClear,
  placeholder = "Cari nama / kode / company aset…",
  autoFocus,
  includeInactive = false,
  forWorkOrder = false,
}: {
  selectedName: string;
  selectedCode: string;
  onSelect: (code: string, name: string, company: string) => void;
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
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
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
              return (
                <button
                  type="button"
                  key={code || i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(code, name, company);
                    setOpen(false);
                    setTerm("");
                  }}
                  className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                >
                  <p className="truncate text-sm font-medium text-slate-800">
                    {name || code}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {code}
                    {company ? ` · ${company}` : ""}
                    {loc ? ` · ${loc}` : ""}
                  </p>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
