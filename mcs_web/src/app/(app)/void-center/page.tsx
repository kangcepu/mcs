"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar, FilterDate, FilterSelect } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Textarea } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { getVoidCandidates, voidWorkOrder, type VoidCenterItem } from "@/lib/api/void-center";
import { formatDate } from "@/lib/format";
import { DEFAULT_PER_PAGE } from "@/types/api";

const MODULES = [
  { value: "", label: "Semua modul" },
  { value: "meso", label: "MESO" },
  { value: "maintenance", label: "Maintenance" },
  { value: "production", label: "Production" },
  { value: "is", label: "IS" },
  { value: "ga", label: "GA" },
];

const DETAIL_PATH: Record<string, string> = {
  meso: "meso", maintenance: "maintenance", production: "production", is: "is", ga: "ga",
};

export default function VoidCenterPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [module, setModule] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [selected, setSelected] = useState<VoidCenterItem | null>(null);
  const [reason, setReason] = useState("");

  const filters = { module, q, date_from: dateFrom, date_to: dateTo, page, per_page: perPage };
  const candidates = useQuery({ queryKey: ["void-center", filters], queryFn: () => getVoidCandidates(filters) });
  const submitVoid = useMutation({
    mutationFn: voidWorkOrder,
    onSuccess: async () => {
      toast.success("WO berhasil di-void.");
      setSelected(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["void-center"] });
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    },
    onError: (error: Error) => toast.error(error.message || "Gagal melakukan VOID."),
  });

  const reset = () => { setModule(""); setQ(""); setDateFrom(""); setDateTo(""); setPage(1); };
  const openVoid = (item: VoidCenterItem) => { setSelected(item); setReason(""); };
  const saveVoid = () => {
    if (!selected || !reason.trim()) return;
    submitVoid.mutate({ module: selected.module, wo_number: selected.wo_number, comment: reason.trim() });
  };
  const rows = candidates.data?.data ?? [];
  const meta = candidates.data?.meta;
  const hasFilters = Boolean(module || q || dateFrom || dateTo);

  const columns: Column<VoidCenterItem>[] = [
    { key: "wo_number", header: "No. WO", cell: (row) => <span className="font-semibold text-slate-800">{row.wo_number}</span> },
    { key: "module", header: "Modul", cell: (row) => row.module_label || row.module.toUpperCase() },
    { key: "job_title", header: "Pekerjaan", cell: (row) => <div><p className="font-medium text-slate-800">{row.job_title || "-"}</p><p className="text-xs text-slate-500">{[row.asset_code, row.asset_name].filter(Boolean).join(" — ") || "Tanpa aset"}</p></div> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status || "-"} /> },
    { key: "date", header: "Tanggal", cell: (row) => formatDate(row.date || row.created_at) || "-" },
    { key: "actions", header: "Aksi", align: "right", cell: (row) => <div className="flex justify-end gap-2"><Link className="btn-secondary h-8 px-2.5" href={`/work-orders/${DETAIL_PATH[row.module] ?? row.module}/${encodeURIComponent(row.wo_number)}`}><ExternalLink className="h-4 w-4" /> Detail</Link><Button variant="danger" className="h-8 px-2.5" onClick={() => openVoid(row)}><Ban className="h-4 w-4" /> VOID</Button></div> },
  ];

  return <PageContainer title="Void Center" description="Tinjau Work Order yang masih aktif sebelum membatalkannya.">
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Hanya WO yang belum final ditampilkan. VOID bersifat final dan tidak dapat dibatalkan; selalu periksa detail WO terlebih dahulu.</div>
    <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Cari nomor WO, pekerjaan, atau aset…" onRefresh={() => void candidates.refetch()} isFetching={candidates.isFetching} onReset={reset} hasActiveFilters={hasFilters}>
      <FilterSelect value={module} onChange={(value) => { setModule(value); setPage(1); }} options={MODULES} placeholder="Semua modul" />
      <FilterDate label="Dari" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} />
      <FilterDate label="Sampai" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} />
    </FilterBar>
    <DataTable columns={columns} data={rows} rowKey={(row) => `${row.module}-${row.wo_number}`} isLoading={candidates.isLoading} isFetching={candidates.isFetching} error={candidates.error} onRetry={() => void candidates.refetch()} emptyTitle="Tidak ada WO aktif" emptyDescription="Tidak ada Work Order nonfinal dalam scope dan filter Anda." />
    <div className="card"><Pagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div>
    <Modal open={Boolean(selected)} onClose={() => !submitVoid.isPending && setSelected(null)} title={selected ? `VOID — ${selected.wo_number}` : "VOID Work Order"} description="Tindakan ini final. Cantumkan alasan agar tercatat pada riwayat Work Order." centered footer={<><Button variant="secondary" onClick={() => setSelected(null)} disabled={submitVoid.isPending}>Batal</Button><Button variant="danger" onClick={saveVoid} disabled={!reason.trim()} loading={submitVoid.isPending}>{submitVoid.isPending ? "Memproses" : "VOID Work Order"}</Button></>}>
      <Field label="Alasan VOID" required hint="Alasan akan disimpan pada riwayat Work Order."><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: pekerjaan duplikat / permintaan dibatalkan" autoFocus /></Field>
    </Modal>
  </PageContainer>;
}
