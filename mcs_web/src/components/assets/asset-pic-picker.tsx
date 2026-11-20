"use client";

import { useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useUserLookup } from "@/hooks/use-users";

export function AssetPicPicker({ value, name, onChange }: {
  value?: number | null;
  name?: string;
  onChange: (id: number | null, name: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const q = useDebouncedValue(term.trim(), 300);
  const lookup = useUserLookup(q);
  if (value && name) return (
    <div className="flex min-h-10 items-center justify-between rounded-lg border border-slate-300 bg-white px-3">
      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{name}</p><p className="text-xs text-slate-400">PIC utama aset</p></div>
      <button type="button" onClick={() => onChange(null, "")} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Ganti PIC"><X className="h-4 w-4" /></button>
    </div>
  );
  return <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
    <Input value={term} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setTerm(e.target.value); setOpen(true); }} placeholder="Cari nama atau username PIC…" className="pl-9" autoComplete="off" />
    {lookup.isFetching ? <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" /> : null}
    {open && q.length >= 2 ? <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      {(lookup.data?.data ?? []).length ? (lookup.data?.data ?? []).map((user) => <button type="button" key={user.id_user} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(user.id_user, user.fullname); setTerm(""); setOpen(false); }} className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"><p className="text-sm font-medium text-slate-800">{user.fullname}</p><p className="text-xs text-slate-400">{user.username}{user.division ? ` · ${user.division}` : ""}</p></button>) : <p className="px-3 py-3 text-sm text-slate-400">{lookup.isFetching ? "Mencari…" : "User aktif tidak ditemukan."}</p>}
    </div> : null}
  </div>;
}
