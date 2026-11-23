"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Database, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button, Card, Input, Select } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { getSparepartErpCatalog, syncSparepartErpItems } from "@/lib/api/spareparts";
import type { SparepartErpCatalogItem } from "@/types/sparepart";

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function SparepartErpCatalogPanel({ onSynced }: { onSynced?: () => void }) {
  const toast = useToast();
  const [company, setCompany] = useState("GSU");
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const query = useQuery({
    queryKey: ["sparepart-erp-catalog", company, q, page, perPage, activeOnly],
    queryFn: ({ signal }) => getSparepartErpCatalog({ company, q, page, per_page: perPage, active_only: activeOnly }, signal),
  });
  const data = query.data?.data;
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  useEffect(() => setSelected(new Set()), [company, q, page, perPage, activeOnly]);

  const pageIds = useMemo(() => items.map((item) => item.item_id), [items]);
  const allSelected = pageIds.length > 0 && pageIds.every((itemId) => selected.has(itemId));
  const toggle = (itemId: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    return next;
  });
  const togglePage = () => setSelected((current) => {
    const next = new Set(current);
    if (allSelected) pageIds.forEach((itemId) => next.delete(itemId));
    else pageIds.forEach((itemId) => next.add(itemId));
    return next;
  });
  const search = () => { setPage(1); setQ(draftQ.trim()); };
  const sync = async (ids = [...selected]) => {
    if (!ids.length) return;
    setSyncing(true);
    try {
      const response = await syncSparepartErpItems(company, ids);
      const result = response.data;
      if (result.failed_count) toast.error("Sinkronisasi selesai sebagian", `${result.created_count} dibuat, ${result.updated_count} diperbarui, ${result.failed_count} gagal.`);
      else toast.success("Sinkronisasi ERP selesai", `${result.created_count} master dibuat dan ${result.updated_count} diperbarui.`);
      setSelected(new Set());
      await query.refetch();
      onSynced?.();
    } catch (error) {
      toast.error("Sinkronisasi ERP gagal", error instanceof Error ? error.message : undefined);
    } finally { setSyncing(false); }
  };

  const columns: Column<SparepartErpCatalogItem>[] = [
    { key: "select", header: <input aria-label="Pilih seluruh item halaman" type="checkbox" checked={allSelected} onChange={togglePage} />, cell: (row) => <input aria-label={`Pilih ${row.item_name}`} type="checkbox" checked={selected.has(row.item_id)} onChange={() => toggle(row.item_id)} /> },
    { key: "item", header: "Item ERP", cell: (row) => <div><p className="font-medium text-slate-900">{row.item_name}</p><p className="text-xs text-slate-500">{row.item_code} · ID {row.item_id}</p></div> },
    { key: "category", header: "Kategori / Brand", cell: (row) => <div>{row.category_name || "-"}<p className="text-xs text-slate-400">{row.brand_name || "-"}</p></div> },
    { key: "uom", header: "UOM" },
    { key: "balance", header: "Saldo ERP", align: "right", cell: (row) => <div><p className="font-semibold text-slate-900">{number.format(row.balance_qty)}</p><p className="text-xs text-slate-400">{row.uom}</p></div> },
    { key: "control", header: "Kontrol", cell: (row) => <div className="flex flex-wrap gap-1 text-xs">{row.is_serialized ? <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Serial</span> : null}{row.has_expiry ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Expiry</span> : null}{!row.is_serialized&&!row.has_expiry ? "-" : null}</div> },
    { key: "mapping", header: "Status MCS", cell: (row) => row.mapping ? <div><span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4"/> Tersinkron</span><p className="text-xs text-slate-400">{row.mapping.part_code}</p></div> : <span className="text-sm text-slate-400">Belum tersinkron</span> },
    { key: "action", header: "Aksi", align: "right", cell: (row) => <Button variant="ghost" disabled={syncing} onClick={() => sync([row.item_id])}><RefreshCw className="h-4 w-4"/> {row.mapping ? "Refresh" : "Sync"}</Button> },
  ];

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><div className="flex items-center gap-3"><Database className="h-8 w-8 text-brand-600"/><div><p className="text-2xl font-semibold">{number.format(query.data?.meta?.total ?? 0)}</p><p className="text-xs text-slate-500">Item aktif ERP {company}</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-600"/><div><p className="text-2xl font-semibold">{number.format(data?.synced_count ?? 0)}</p><p className="text-xs text-slate-500">Sudah tersinkron ke MCS</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-blue-600"/><div><p className="font-semibold text-emerald-700">Read-only</p><p className="text-xs text-slate-500">Tidak melakukan posting ke ERP</p></div></div></Card>
    </div>
    <Card className="border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      Saldo ERP berasal dari <strong>{data?.balance_source ?? "IC_ItemBalanceCache"}</strong> dan ditampilkan sebagai referensi. Saldo operasional MCS tetap dihitung dari receiving, issue, transfer, dan stock opname MCS.
    </Card>
    <div className="flex flex-col gap-2 lg:flex-row">
      <Select value={company} onChange={(event)=>{setCompany(event.target.value);setPage(1);}} className="lg:max-w-36"><option value="UC">UC</option><option value="GSU">GSU</option><option value="RU">RU</option></Select>
      <div className="flex flex-1 gap-2"><Input value={draftQ} onChange={(event)=>setDraftQ(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")search();}} placeholder="Cari kode, nama, atau kategori item ERP…"/><Button variant="secondary" onClick={search}><Search className="h-4 w-4"/> Cari</Button></div>
      <label className="flex items-center gap-2 rounded-md border bg-white px-3 text-sm text-slate-600"><input type="checkbox" checked={activeOnly} onChange={(event)=>{setActiveOnly(event.target.checked);setPage(1);}}/> Hanya item aktif</label>
      <Button disabled={!selected.size} loading={syncing} onClick={()=>sync()}><RefreshCw className="h-4 w-4"/> Sync {selected.size ? `${selected.size} item` : "terpilih"}</Button>
    </div>
    <DataTable columns={columns} data={items} rowKey={(row)=>row.item_id} isLoading={query.isLoading} isFetching={query.isFetching} error={query.error} onRetry={()=>query.refetch()} emptyTitle="Item ERP tidak ditemukan" />
    <Card className="overflow-hidden"><Pagination meta={query.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value)=>{setPerPage(value);setPage(1);}}/></Card>
    {data?.history.length ? <Card className="overflow-hidden"><div className="border-b bg-slate-50 px-4 py-3"><p className="font-semibold text-slate-900">History Sinkronisasi Terakhir</p></div><div className="divide-y">{data.history.map((item)=><div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><div className="min-w-48"><p className="font-medium">{item.sync_number}</p><p className="text-xs text-slate-400">{item.synced_at} · {item.synced_by || "SYSTEM"}</p></div><StatusBadge status={item.status}/><p className="ml-auto text-xs text-slate-500">{item.created_count} dibuat · {item.updated_count} diperbarui · {item.failed_count} gagal</p></div>)}</div></Card> : null}
  </div>;
}
