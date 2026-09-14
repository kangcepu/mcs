"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounce";

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Cari…",
  onRefresh,
  isFetching,
  onReset,
  hasActiveFilters,
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  isFetching?: boolean;
  onReset?: () => void;
  hasActiveFilters?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [localSearch, setLocalSearch] = useState(search ?? "");
  const debounced = useDebouncedValue(localSearch, 350);

  useEffect(() => {
    setLocalSearch(search ?? "");
  }, [search]);

  useEffect(() => {
    if (!onSearchChange) return;
    if (debounced !== (search ?? "")) onSearchChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div
      className={cn(
        "card flex flex-wrap items-center gap-2 p-3",
        className,
      )}
    >
      {onSearchChange ? (
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input-base pl-9 pr-8"
            placeholder={searchPlaceholder}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
          {localSearch ? (
            <button
              type="button"
              onClick={() => setLocalSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Bersihkan pencarian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {children}

      <div className="ml-auto flex items-center gap-2">
        {onReset && hasActiveFilters ? (
          <Button variant="ghost" onClick={onReset} className="h-9 px-2 text-slate-500">
            <X className="h-4 w-4" />
            Reset
          </Button>
        ) : null}
        {onRefresh ? (
          <Button
            variant="secondary"
            onClick={onRefresh}
            className="h-9 px-2.5"
            aria-label="Muat ulang"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Select ringkas untuk dipakai di dalam FilterBar. */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
}) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        !value && "text-slate-400",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-slate-700">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterDate({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500">
      <span className="whitespace-nowrap">{label}</span>
      <input
        type="date"
        className="h-9 bg-transparent text-sm text-slate-700 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
