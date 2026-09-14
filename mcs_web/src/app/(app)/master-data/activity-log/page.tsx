"use client";

import { useState } from "react";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { useMe } from "@/hooks/use-auth";
import { useMasterActivity } from "@/hooks/use-master";
import { canRead } from "@/lib/permissions";
import { LoadingSkeleton } from "@/components/ui/states";
import type { MasterActivityItem } from "@/lib/api/master";

const modules = ["Authentication", "Work Order", "Daily Control", "Material Usage", "Asset Mutation", "Preventive Schedule", "Asset", "Master Data", "Settings", "MCS Mobile", "System"];

export default function MasterActivityLogPage() {
  const { data: user, isLoading: userLoading } = useMe();
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const log = useMasterActivity({ q, module, page, per_page: perPage });

  if (userLoading) return <PageContainer title="Activity Log"><LoadingSkeleton rows={6} /></PageContainer>;
  if (!canRead(user, "masterUser")) return <PageContainer title="Activity Log"><AccessDenied /></PageContainer>;

  const columns: Column<MasterActivityItem>[] = [
    { key: "created_at", header: "Time", cell: (row) => new Date(row.created_at.replace(" ", "T")).toLocaleString("id-ID") },
    { key: "action", header: "Action", cell: (row) => <span className={row.outcome === "failed" ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>{row.action}</span> },
    { key: "module", header: "Module", cell: (row) => row.module || "System" },
    { key: "reference", header: "Reference", cell: (row) => row.reference || "-" },
    { key: "actor_fullname", header: "By", cell: (row) => row.actor_fullname || row.actor_username || "-" },
  ];

  return (
    <PageContainer title="System Activity Log" description="History of important activities across the system.">
      <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Search record or user…" onRefresh={() => log.refetch()} isFetching={log.isFetching}>
        <FilterSelect value={module} onChange={(value) => { setModule(value); setPage(1); }} placeholder="All modules" options={modules.map((value) => ({ value, label: value }))} />
      </FilterBar>
      <DataTable columns={columns} data={log.data?.data} rowKey={(row) => row.id} isLoading={log.isLoading} isFetching={log.isFetching && !log.isLoading} error={log.error} onRetry={() => log.refetch()} emptyTitle="No activity recorded yet" emptyDescription="New system activity will be listed here." />
      {(log.data?.data.length ?? 0) > 0 ? <div className="card"><Pagination meta={log.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div> : null}
    </PageContainer>
  );
}
