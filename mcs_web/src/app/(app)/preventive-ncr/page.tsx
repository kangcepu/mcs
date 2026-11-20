"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterDate, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { downloadPreventiveNcrReport, getPreventiveNcr, getPreventiveNcrOptions, getPreventiveNcrs, updatePreventiveNcr, type PreventiveNcr } from "@/lib/api/preventive-ncr";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION", "CLOSED", "CANCELLED"].map((value) => ({ value, label: value.replaceAll("_", " ") }));
const TYPE_OPTIONS = [{ value: "MISSED_SCHEDULE", label: "Preventive terlewat" }, { value: "LATE_COMPLETION", label: "Penyelesaian terlambat" }];
const MODULE_OPTIONS = ["MESO", "MAINTENANCE", "PRODUCTION", "IS", "GA"].map((value) => ({ value, label: value }));

export default function PreventiveNcrPage() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: "", status: "", type: "", module: "", company: "", date_from: "", date_to: "", page: 1, per_page: 25 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["preventive-ncr", filters], queryFn: ({ signal }) => getPreventiveNcrs(filters, signal) });
  const options = useQuery({ queryKey: ["preventive-ncr-options"], queryFn: ({ signal }) => getPreventiveNcrOptions(signal) });
  const detail = useQuery({ queryKey: ["preventive-ncr-detail", selectedId], queryFn: ({ signal }) => getPreventiveNcr(selectedId!, signal), enabled: Boolean(selectedId) });
  const data = query.data?.data;
  const set = (value: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...value }));
  const reset = () => setFilters({ q: "", status: "", type: "", module: "", company: "", date_from: "", date_to: "", page: 1, per_page: 25 });
  const active = Boolean(filters.q || filters.status || filters.type || filters.module || filters.company || filters.date_from || filters.date_to);
  const exportReport = async () => { try { const result = await downloadPreventiveNcrReport(filters); const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.fileName; anchor.click(); URL.revokeObjectURL(url); } catch (error) { toast.error("Export gagal", error instanceof Error ? error.message : undefined); } };
  const columns: Column<PreventiveNcr>[] = [
    { key: "ncr", header: "NCR", cell: (row) => <div><p className="font-medium text-brand-700">{row.ncr_number}</p><p className="text-xs text-slate-500">{row.ncr_type === "MISSED_SCHEDULE" ? "Preventive terlewat" : "Penyelesaian terlambat"}</p></div> },
    { key: "asset", header: "Aset / WO", cell: (row) => <div><p className="font-medium">{row.asset_code || "-"}</p><p className="text-xs text-slate-500">{row.wo_number}</p></div> },
    { key: "module", header: "Modul", cell: (row) => row.module_code },
    { key: "planned", header: "Rencana / Aktual", cell: (row) => <div><p>{formatDate(row.planned_date)}</p><p className="text-xs text-slate-500">{row.actual_completion_date ? formatDate(row.actual_completion_date) : row.trigger_wo_number ? `Ditutup oleh ${row.trigger_wo_number}` : "-"}</p></div> },
    { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity} /> },
    { key: "assigned", header: "PIC", cell: (row) => row.assigned_to || "Belum ditentukan" },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  ];
  const summary = data?.summary;
  return <PageContainer title="Preventive NCR" description="Monitoring preventive terlewat, auto closed, keterlambatan, dan tindak lanjut NCR." actions={<Button variant="secondary" onClick={exportReport}><Download className="h-4 w-4" />Export Excel</Button>}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Summary label="Total NCR" value={summary?.total} /><Summary label="Open" value={summary?.open_count} /><Summary label="In Progress" value={summary?.in_progress_count} /><Summary label="Verifikasi" value={summary?.pending_verification_count} /><Summary label="Terlewat" value={summary?.missed_count} /><Summary label="Terlambat" value={summary?.late_count} />
    </div>
    <FilterBar search={filters.q} onSearchChange={(q) => set({ q, page: 1 })} searchPlaceholder="Cari NCR, WO, atau aset…" onRefresh={() => query.refetch()} isFetching={query.isFetching} onReset={reset} hasActiveFilters={active}>
      <FilterSelect value={filters.status} onChange={(status) => set({ status, page: 1 })} options={STATUS_OPTIONS} placeholder="Semua status" />
      <FilterSelect value={filters.type} onChange={(type) => set({ type, page: 1 })} options={TYPE_OPTIONS} placeholder="Semua jenis" />
      <FilterSelect value={filters.module} onChange={(module) => set({ module, page: 1 })} options={MODULE_OPTIONS} placeholder="Semua modul" />
      <FilterSelect value={filters.company} onChange={(company) => set({ company, page: 1 })} options={(options.data?.data.companies ?? []).map((value) => ({ value, label: value }))} placeholder="Semua company" />
      <FilterDate value={filters.date_from} onChange={(date_from) => set({ date_from, page: 1 })} label="Dari" />
      <FilterDate value={filters.date_to} onChange={(date_to) => set({ date_to, page: 1 })} label="Sampai" />
    </FilterBar>
    <DataTable columns={columns} data={data?.items} rowKey={(row) => row.id} isLoading={query.isLoading} isFetching={query.isFetching} error={query.error} onRetry={() => query.refetch()} onRowClick={(row) => setSelectedId(row.id)} emptyTitle="Belum ada NCR preventive" emptyDescription="NCR akan terbentuk otomatis saat preventive terbaru selesai dan ditemukan jadwal lama yang terlewat atau terlambat." />
    {query.data?.meta ? <Pagination meta={query.data.meta} page={filters.page} perPage={filters.per_page} onPageChange={(page) => set({ page })} onPerPageChange={(per_page) => set({ per_page, page: 1 })} /> : null}
    <NcrModal item={detail.data?.data} loading={detail.isLoading} open={Boolean(selectedId)} onClose={() => setSelectedId(null)} onSaved={async () => { await Promise.all([query.refetch(), detail.refetch()]); }} />
  </PageContainer>;
}

function Summary({ label, value }: { label: string; value?: number }) { return <Card className="p-4"><p className="text-2xl font-semibold text-slate-900">{Number(value ?? 0).toLocaleString("id-ID")}</p><p className="mt-1 text-xs text-slate-500">{label}</p></Card>; }

function NcrModal({ item, loading, open, onClose, onSaved }: { item?: PreventiveNcr; loading: boolean; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ status: "OPEN", assigned_to: "", root_cause: "", corrective_action: "", preventive_action: "", resolution_note: "", action_note: "" });
  useEffect(() => { if (item) setForm({ status: item.status, assigned_to: item.assigned_to ?? "", root_cause: item.root_cause ?? "", corrective_action: item.corrective_action ?? "", preventive_action: item.preventive_action ?? "", resolution_note: item.resolution_note ?? "", action_note: "" }); }, [item]);
  const mutation = useMutation({ mutationFn: () => updatePreventiveNcr(item!.id, form), onSuccess: async () => { toast.success("NCR berhasil diperbarui"); await onSaved(); }, onError: (error) => toast.error("NCR gagal diperbarui", error instanceof Error ? error.message : undefined) });
  return <Modal open={open} onClose={onClose} size="2xl" title={item?.ncr_number ?? "Detail Preventive NCR"} description={item?.title} footer={<><Button variant="secondary" onClick={onClose}>Tutup</Button><Button loading={mutation.isPending} disabled={!item} onClick={() => mutation.mutate()}>Simpan tindak lanjut</Button></>}>
    {loading || !item ? <p className="py-8 text-center text-sm text-slate-500">Memuat detail NCR…</p> : <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><div className="mb-1 flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" />{item.description}</div><p className="text-xs">{item.module_code} · {item.wo_number} · {item.asset_code || "Tanpa aset"}</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><Select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field><Field label="PIC tindak lanjut"><Input value={form.assigned_to} onChange={(event) => setForm((value) => ({ ...value, assigned_to: event.target.value }))} /></Field></div>
      <Field label="Root cause"><Textarea value={form.root_cause} onChange={(event) => setForm((value) => ({ ...value, root_cause: event.target.value }))} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Corrective action"><Textarea value={form.corrective_action} onChange={(event) => setForm((value) => ({ ...value, corrective_action: event.target.value }))} /></Field><Field label="Preventive action"><Textarea value={form.preventive_action} onChange={(event) => setForm((value) => ({ ...value, preventive_action: event.target.value }))} /></Field></div>
      <Field label="Catatan resolusi"><Textarea value={form.resolution_note} onChange={(event) => setForm((value) => ({ ...value, resolution_note: event.target.value }))} /></Field><Field label="Catatan aksi"><Input value={form.action_note} onChange={(event) => setForm((value) => ({ ...value, action_note: event.target.value }))} placeholder="Contoh: investigasi dimulai / bukti sudah diverifikasi" /></Field>
      {item.actions?.length ? <div><p className="mb-2 text-sm font-semibold">Timeline</p><div className="max-h-48 space-y-2 overflow-auto">{item.actions.map((action) => <div key={action.id} className="rounded-lg border border-slate-200 p-3 text-xs"><p className="font-medium">{action.from_status || "-"} → {action.to_status}</p><p className="mt-1 text-slate-600">{action.action_note || action.action_type}</p><p className="mt-1 text-slate-400">{action.acted_by || "SYSTEM"} · {formatDate(action.acted_at)}</p></div>)}</div></div> : null}
    </div>}
  </Modal>;
}
