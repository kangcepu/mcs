"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { useUserLookup } from "@/hooks/use-users";
import { useDebouncedValue } from "@/hooks/use-debounce";

/**
 * Multi-select pencarian user untuk PIC / tenaga kerja / eksekutor WO.
 *
 * - Ketik nama → cari di direktori user (`/v2/users/lookup`), pilih dari daftar.
 * - Menyimpan `fullname` (string) agar tetap kompatibel dengan payload
 *   `trade[]` / `job_executor[]` yang lama.
 * - Nama di luar direktori tetap bisa dimasukkan lewat tombol Enter.
 */
export function PicPicker({
  value,
  onChange,
  max = 20,
  autoFocus,
  placeholder = "Cari nama user…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const q = useDebouncedValue(term.trim(), 300);
  const { data, isFetching } = useUserLookup(q);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = useMemo(
    () => new Set(value.map((v) => v.toLowerCase())),
    [value],
  );

  const rows = (data?.data ?? []).filter(
    (r) => !selectedLower.has((r.fullname || r.username).toLowerCase()),
  );

  const atMax = value.length >= max;

  const add = (name: string) => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || selectedLower.has(clean.toLowerCase()) || value.length >= max) {
      return;
    }
    onChange([...value, clean]);
    setTerm("");
    inputRef.current?.focus();
  };

  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  return (
    <div>
      {value.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-700"
            >
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="rounded-full p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-700"
                aria-label={`Hapus ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && term.trim()) {
                e.preventDefault();
                add(term);
              } else if (e.key === "Backspace" && !term && value.length > 0) {
                remove(value[value.length - 1]!);
              }
            }}
            placeholder={atMax ? `Maksimal ${max} user tercapai` : placeholder}
            className="pl-8"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={atMax}
          />
          {isFetching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-300" />
          ) : null}
        </div>

        {open && !atMax && q.length >= 2 ? (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {rows.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400">
                {isFetching
                  ? "Mencari…"
                  : "User tidak ditemukan. Tekan Enter untuk memakai teks ini."}
              </p>
            ) : (
              rows.map((r) => {
                const name = r.fullname || r.username;
                return (
                  <button
                    type="button"
                    key={r.id_user || name}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(name)}
                    className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                  >
                    <p className="truncate text-sm font-medium text-slate-800">
                      {name}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {r.username}
                      {r.division ? ` · ${r.division}` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
