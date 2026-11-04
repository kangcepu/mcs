"use client";

import { useState } from "react";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { useMe } from "@/hooks/use-auth";
import {
  useMasterActivity,
  useMasterDataChanges,
  useWorkOrderEvents,
} from "@/hooks/use-master";
import { canRead } from "@/lib/permissions";
import { LoadingSkeleton } from "@/components/ui/states";
import { dash } from "@/lib/display";
import type { MasterActivityItem, MasterDataChangeItem, WorkOrderEventItem } from "@/lib/api/master";

const SYSTEM_MODULES = ["Authentication", "Work Order", "Daily Control", "Material Usage", "Asset Mutation", "Preventive Schedule", "Asset", "Master Data", "Settings", "MCS Mobile", "System"];
const WO_MODULES = [
  { value: "meso", label: "MESO" },
  { value: "maintenance", label: "Maintenance" },
  { value: "is", label: "IS" },
  { value: "ga", label: "GA" },
  { value: "production", label: "Production" },
];
const MASTER_RESOURCES = [
  { value: "users", label: "User" },
  { value: "company-structure", label: "Company" },
  { value: "divisions", label: "Divisi" },
  { value: "asset-categories", label: "Kategori Aset" },
  { value: "asset-locations", label: "Lokasi Aset" },
  { value: "permission-groups", label: "Permission Group" },
  { value: "user-aliases", label: "User Alias" },
];
const ACTION_TONE: Record<string, "green" | "amber" | "red"> = { create: "green", update: "amber", delete: "red" };
const ACTION_LABEL: Record<string, string> = { create: "Dibuat", update: "Diubah", delete: "Dihapus" };

function fmtTime(v: string): string {
  const d = new Date(v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("id-ID");
}

/** Hanya field yang beda antara before/after (buat action 'update') — field identik gak usah ditampilin. */
function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { field: string; before: unknown; after: unknown }[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({ field: key, before: b, after: a });
  }
  return out;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseJson(v: string | null | undefined): Record<string, unknown> | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function SystemActivityTab() {
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const log = useMasterActivity({ q, module, page, per_page: perPage });

  const columns: Column<MasterActivityItem>[] = [
    { key: "created_at", header: "Waktu", cell: (row) => fmtTime(row.created_at) },
    { key: "action", header: "Aksi", cell: (row) => <span className={row.outcome === "failed" ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>{row.action}</span> },
    { key: "module", header: "Modul", cell: (row) => row.module || "System" },
    { key: "reference", header: "Referensi", cell: (row) => row.reference || "-" },
    { key: "actor_fullname", header: "Oleh", cell: (row) => row.actor_fullname || row.actor_username || "-" },
  ];

  return (
    <>
      <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Cari record atau user…" onRefresh={() => log.refetch()} isFetching={log.isFetching}>
        <FilterSelect value={module} onChange={(value) => { setModule(value); setPage(1); }} placeholder="Semua modul" options={SYSTEM_MODULES.map((value) => ({ value, label: value }))} />
      </FilterBar>
      <DataTable columns={columns} data={log.data?.data} rowKey={(row) => row.id} isLoading={log.isLoading} isFetching={log.isFetching && !log.isLoading} error={log.error} onRetry={() => log.refetch()} emptyTitle="Belum ada aktivitas" emptyDescription="Aktivitas sistem baru akan muncul di sini." />
      {(log.data?.data.length ?? 0) > 0 ? <div className="card"><Pagination meta={log.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div> : null}
    </>
  );
}

function MasterDataChangesTab() {
  const [q, setQ] = useState("");
  const [resource, setResource] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<MasterDataChangeItem | null>(null);
  const log = useMasterDataChanges({ q, resource, page, per_page: perPage });

  const columns: Column<MasterDataChangeItem>[] = [
    { key: "created_at", header: "Waktu", cell: (row) => fmtTime(row.created_at) },
    { key: "action", header: "Aksi", cell: (row) => <StatusBadge status={ACTION_LABEL[row.action] ?? row.action} tone={ACTION_TONE[row.action] ?? "slate"} /> },
    { key: "resource", header: "Resource", cell: (row) => MASTER_RESOURCES.find((r) => r.value === row.resource)?.label ?? row.resource },
    { key: "record_label", header: "Data", cell: (row) => <span className="font-medium text-slate-900">{dash(row.record_label)}</span> },
    { key: "actor_fullname", header: "Oleh", cell: (row) => row.actor_fullname || row.actor_username || "-" },
  ];

  const before = parseJson(selected?.before_data);
  const after = parseJson(selected?.after_data);
  const changes = selected?.action === "update" ? diffFields(before, after) : [];

  return (
    <>
      <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Cari data atau user…" onRefresh={() => log.refetch()} isFetching={log.isFetching}>
        <FilterSelect value={resource} onChange={(value) => { setResource(value); setPage(1); }} placeholder="Semua resource" options={MASTER_RESOURCES} />
      </FilterBar>
      <DataTable
        columns={columns}
        data={log.data?.data}
        rowKey={(row) => row.id}
        isLoading={log.isLoading}
        isFetching={log.isFetching && !log.isLoading}
        error={log.error}
        onRetry={() => log.refetch()}
        onRowClick={(row) => setSelected(row)}
        emptyTitle="Belum ada perubahan master data"
        emptyDescription="Perubahan user, company, kategori aset, dll akan tercatat di sini."
      />
      {(log.data?.data.length ?? 0) > 0 ? <div className="card"><Pagination meta={log.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div> : null}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${ACTION_LABEL[selected.action] ?? selected.action} — ${dash(selected.record_label)}` : undefined}
        description={selected ? `${fmtTime(selected.created_at)} oleh ${selected.actor_fullname || selected.actor_username || "-"}` : undefined}
        size="lg"
      >
        {selected?.action === "update" ? (
          changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-3">Field</th>
                    <th className="py-1.5 pr-3">Sebelum</th>
                    <th className="py-1.5">Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field} className="border-b border-slate-100 align-top">
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{c.field}</td>
                      <td className="py-1.5 pr-3 text-rose-600">{fmtVal(c.before)}</td>
                      <td className="py-1.5 text-emerald-700">{fmtVal(c.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Tidak ada field yang berubah.</p>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries((selected?.action === "delete" ? before : after) ?? {}).map(([k, v]) => (
                  <tr key={k} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{k}</td>
                    <td className="py-1.5 text-slate-600">{fmtVal(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
  );
}

function WorkOrderEventsTab() {
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const log = useWorkOrderEvents({ q, module, page, per_page: perPage });

  const columns: Column<WorkOrderEventItem>[] = [
    { key: "created_at", header: "Waktu", cell: (row) => fmtTime(row.created_at) },
    { key: "wo_number", header: "No. WO", cell: (row) => <span className="font-medium text-slate-900">{dash(row.wo_number)}</span> },
    { key: "module", header: "Modul", cell: (row) => <StatusBadge status={row.module_label} tone="blue" /> },
    { key: "comment", header: "Catatan", cell: (row) => dash(row.comment) },
    { key: "fullname", header: "Oleh", cell: (row) => `${row.fullname || "-"}${row.id_position ? ` (${row.id_position})` : ""}` },
  ];

  return (
    <>
      <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Cari No. WO, catatan, atau user…" onRefresh={() => log.refetch()} isFetching={log.isFetching}>
        <FilterSelect value={module} onChange={(value) => { setModule(value); setPage(1); }} placeholder="Semua modul" options={WO_MODULES} />
      </FilterBar>
      <DataTable columns={columns} data={log.data?.data} rowKey={(row, i) => `${row.module}-${row.wo_number}-${i}`} isLoading={log.isLoading} isFetching={log.isFetching && !log.isLoading} error={log.error} onRetry={() => log.refetch()} emptyTitle="Belum ada perubahan WO" emptyDescription="Approve/reject/close/void dari semua modul WO akan tercatat di sini." />
      {(log.data?.data.length ?? 0) > 0 ? <div className="card"><Pagination meta={log.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div> : null}
    </>
  );
}

export default function LogEventPage() {
  const { data: user, isLoading: userLoading } = useMe();
  const [tab, setTab] = useState("system");

  if (userLoading) return <PageContainer title="Log Event"><LoadingSkeleton rows={6} /></PageContainer>;
  if (!canRead(user, "masterUser")) return <PageContainer title="Log Event"><AccessDenied /></PageContainer>;

  return (
    <PageContainer title="Log Event" description="Riwayat aktivitas penting di seluruh sistem — aktivitas umum, perubahan master data, dan perubahan Work Order.">
      <Tabs
        items={[
          { key: "system", label: "Semua Aktivitas" },
          { key: "master", label: "Perubahan Master Data" },
          { key: "wo", label: "Perubahan Work Order" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "system" ? <SystemActivityTab /> : null}
      {tab === "master" ? <MasterDataChangesTab /> : null}
      {tab === "wo" ? <WorkOrderEventsTab /> : null}
    </PageContainer>
  );
}
