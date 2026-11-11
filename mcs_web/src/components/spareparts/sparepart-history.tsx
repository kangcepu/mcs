"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button, Card, Input } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSparepartWoHistory } from "@/lib/api/spareparts";
import { formatDate, formatNumber } from "@/lib/format";
import type { SparepartWoHistoryItem } from "@/types/sparepart";

export function SparepartHistoryPanel() {
  const [q,setQ]=useState("");
  const [page,setPage]=useState(1);
  const query=useQuery({queryKey:["sparepart-asset-wo-history",q,page],queryFn:({signal})=>getSparepartWoHistory({q,page,per_page:25},signal)});
  const data=query.data?.data;
  const meta=query.data?.meta;
  const columns:Column<SparepartWoHistoryItem>[]=[
    {key:"date",header:"Tanggal",cell:r=><div>{formatDate(r.requested_at)}<p className="text-xs text-slate-400">{r.request_number}</p></div>},
    {key:"asset",header:"Asset",cell:r=><div className="font-medium">{r.AssetName||"Tanpa asset"}<p className="text-xs font-normal text-slate-400">{r.AssetCode||"-"} · {r.CompanyName||"-"}</p></div>},
    {key:"wo",header:"Work Order",cell:r=><div>{r.wo_number}<p className="text-xs text-slate-400">{r.wo_module.toUpperCase()}</p></div>},
    {key:"part",header:"Sparepart",cell:r=><div>{r.part_name}<p className="text-xs text-slate-400">{r.part_code}</p></div>},
    {key:"qty",header:"Pemakaian",align:"right",cell:r=><div><strong>{formatNumber(Number(r.used_qty))} {r.uom}</strong><p className="text-xs text-slate-400">Issue {formatNumber(Number(r.issued_qty))} · Return {formatNumber(Number(r.returned_available_qty)+Number(r.returned_hold_qty))}</p></div>},
    {key:"status",header:"Status",cell:r=><StatusBadge status={r.status}/>},
  ];
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-5">
      <Card className="p-4"><p className="text-2xl font-semibold">{Number(data?.summary.request_count||0)}</p><p className="text-xs text-slate-500">Request</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold">{Number(data?.summary.wo_count||0)}</p><p className="text-xs text-slate-500">Work Order</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold">{Number(data?.summary.asset_count||0)}</p><p className="text-xs text-slate-500">Asset</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold text-blue-700">{formatNumber(Number(data?.summary.used_qty||0))}</p><p className="text-xs text-slate-500">Qty terpakai</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold text-emerald-700">{formatNumber(Number(data?.summary.returned_qty||0))}</p><p className="text-xs text-slate-500">Qty dikembalikan</p></Card>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row"><div className="relative sm:max-w-xl sm:flex-1"><History className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input className="pl-9" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Cari Asset Code/nama, nomor WO, request, atau sparepart…"/></div><Button variant="secondary" onClick={()=>query.refetch()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
    <DataTable columns={columns} data={data?.items} rowKey={r=>r.line_id} isLoading={query.isLoading} error={query.error} onRetry={()=>query.refetch()} emptyTitle="Belum ada riwayat sparepart Asset/WO"/>
    {(meta?.total_pages??1)>1?<div className="flex items-center justify-end gap-2 text-sm"><span>Halaman {meta?.page} dari {meta?.total_pages}</span><Button variant="secondary" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Sebelumnya</Button><Button variant="secondary" disabled={page>=(meta?.total_pages??1)} onClick={()=>setPage(v=>v+1)}>Berikutnya</Button></div>:null}
  </div>;
}
