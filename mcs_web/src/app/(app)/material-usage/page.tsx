"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { ErpStatusBadge } from "@/components/material/erp-status";
import { useMaterialUsageList } from "@/hooks/use-material-usage";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE } from "@/types/api";
import { MATERIAL_STATUS, type MaterialUsageListItem } from "@/types/material";
import { formatDate } from "@/lib/format";
import { dash, pick } from "@/lib/display";

// Modal memiliki form dan query WO sendiri; lazy-load agar halaman daftar cepat
// interaktif, terutama di koneksi kantor yang lebih lambat.
const MaterialRequestModal = dynamic(
  () => import("@/components/material/material-request-modal").then((m) => m.MaterialRequestModal),
  { ssr: false },
);

const DEFAULTS = {
  q: "",
  status: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

export default function MaterialUsagePage() {
  const router = useRouter();
  const [requestOpen, setRequestOpen] = useState(false);
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const { data, isLoading, isFetching, error, refetch } = useMaterialUsageList(values);
  const rows = data?.data ?? [];

  const columns: Column<MaterialUsageListItem>[] = [
    {
      key: "wo_number",
      header: "Work Order",
      cell: (r) => (
        <div>
          <p className="font-medium text-brand-700">{dash(pick(r, ["wo_number"]))}</p>
          <p className="max-w-[240px] truncate text-xs text-slate-400">
            {pick(r, ["request_note", "part_name"]) || `Request #${r.id}`}
          </p>
        </div>
      ),
    },
    {
      key: "asset_name",
      header: "Aset",
      cell: (r) => {
        const name = pick(r, ["asset_name"]);
        const code = pick(r, ["asset_code"]);
        return (
          <div className="max-w-[200px]">
            <p className="truncate font-medium text-slate-700">{dash(name)}</p>
            {code ? <p className="truncate text-xs text-slate-400">{code}</p> : null}
          </div>
        );
      },
    },
    {
      key: "job_title",
      header: "Detail Pekerjaan",
      cell: (r) => {
        const jobTitle = pick(r, ["job_title"]);
        return (
          <p className="max-w-[260px] truncate text-slate-700" title={jobTitle || undefined}>
            {dash(jobTitle)}
          </p>
        );
      },
    },
    {
      key: "requester",
      header: "Requester",
      cell: (r) => dash(pick(r, ["requested_by_name", "requester"])),
    },
    {
      key: "executor",
      header: "Executor",
      cell: (r) => dash(pick(r, ["job_executor", "executor"])),
    },
    { key: "pr_number", header: "No. PR", cell: (r) => dash(pick(r, ["pr_number"])) },
    {
      key: "erp_status",
      header: "ERP Sync",
      cell: (r) => (
        <ErpStatusBadge
          status={pick(r, ["erp_status"])}
          syncedAt={pick(r, ["erp_synced_at", "erp_sent_at"])}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={pick(r, ["workflow_status", "status"])} />,
    },
    {
      key: "created_at",
      header: "Diminta",
      align: "right",
      cell: (r) => formatDate(pick(r, ["requested_at", "created_at"])),
    },
  ];

  return (
    <PageContainer
      title="Material Usage"
      description="Permintaan dan pemakaian material terhadap work order."
      actions={
        <Button onClick={() => setRequestOpen(true)}>
          <Plus className="h-4 w-4" />
          Buat Permintaan
        </Button>
      }
    >
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari No. WO, nama part, atau kode request…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterSelect
          value={values.status}
          onChange={(v) => setValues({ status: v }, { resetPage: true })}
          options={MATERIAL_STATUS.map((s) => ({ value: s, label: s.replace("_", " ") }))}
          placeholder="Semua status"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(r) => router.push(`/material-usage/${r.id}`)}
        emptyTitle="Belum ada material usage"
        emptyDescription="Ubah filter untuk menampilkan data lain."
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={data?.meta}
            page={values.page}
            perPage={values.per_page}
            onPageChange={(page) => setValues({ page })}
            onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
          />
        </div>
      ) : null}

      {requestOpen ? (
        <MaterialRequestModal open onClose={() => setRequestOpen(false)} />
      ) : null}
    </PageContainer>
  );
}
