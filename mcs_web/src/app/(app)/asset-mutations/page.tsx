"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { MutationCreateModal } from "@/components/asset-mutation/mutation-create-modal";
import { useAssetMutations } from "@/hooks/use-asset-mutation";
import { useQueryParams } from "@/hooks/use-query-params";
import { AREA_PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { dash, pick } from "@/lib/display";
import { useDebouncedValue } from "@/hooks/use-debounce";

const DEFAULTS = { q: "", status: "", limit: 200 };

const STATUS_OPTIONS = [
  { value: "NEED_APPROVED", label: "Menunggu Approval" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "DRAFT", label: "Draft" },
];

export default function AssetMutationsPage() {
  return (
    <PermissionGuard permission={[...AREA_PERMISSIONS.assetMutations.read]} mode="page">
      <Inner />
    </PermissionGuard>
  );
}

function Inner() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const debouncedQuery = useDebouncedValue(values.q, 350);

  const { data, isLoading, isFetching, error, refetch } = useAssetMutations({
    search: debouncedQuery || undefined,
    status: values.status || undefined,
    limit: values.limit,
  });
  const rows = data?.data?.items ?? [];
  const total = data?.data?.total ?? rows.length;
  const canCreate = data?.data?.permissions?.can_create ?? false;

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "doc_no",
      header: "No. Dokumen",
      cell: (r) => (
        <span className="font-medium text-brand-700">{dash(pick(r, ["doc_no"]))}</span>
      ),
    },
    {
      key: "route",
      header: "Perpindahan",
      cell: (r) => (
        <span className="text-slate-700">
          {dash(pick(r, ["company_before"]))} / {dash(pick(r, ["location_before"]))}
        </span>
      ),
    },
    {
      key: "detail_count",
      header: "Item",
      align: "center",
      cell: (r) => dash(pick(r, ["detail_count"])),
    },
    { key: "creator", header: "Pembuat", cell: (r) => dash(pick(r, ["creator"])) },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={pick(r, ["status"])} />,
    },
    {
      key: "created_at",
      header: "Dibuat",
      align: "right",
      cell: (r) => formatDate(pick(r, ["created_at", "date"])),
    },
  ];

  return (
    <PageContainer
      title="Mutasi Aset"
      description="Pengajuan perpindahan aset antar lokasi / company."
      actions={
        canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Mutasi
          </Button>
        ) : null
      }
    >
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q })}
        searchPlaceholder="Cari no. dokumen / lokasi / pembuat…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterSelect
          value={values.status}
          onChange={(v) => setValues({ status: v })}
          options={STATUS_OPTIONS}
          placeholder="Semua status"
        />
      </FilterBar>

      <div className="flex items-center justify-between px-1 text-sm text-slate-500" aria-live="polite">
        <span>
          {isFetching && !isLoading ? "Memperbarui data…" : `${total} dokumen mutasi`}
        </span>
        {debouncedQuery !== values.q ? <span>Mencari…</span> : null}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => (r.doc_no as string) ?? i}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(r) =>
          router.push(`/asset-mutations/${encodeURIComponent(String(r.doc_no))}`)
        }
        emptyTitle="Belum ada mutasi aset"
        emptyDescription="Buat pengajuan mutasi aset baru."
      />

      <MutationCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(docNo) => {
          setCreateOpen(false);
          router.push(`/asset-mutations/${encodeURIComponent(docNo)}`);
        }}
      />
    </PageContainer>
  );
}
