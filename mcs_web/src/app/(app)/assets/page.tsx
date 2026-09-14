"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { useCan } from "@/components/ui/permission-guard";
import { useAssets, useAssetOptions } from "@/hooks/use-assets";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE } from "@/types/api";
import { PERMISSIONS } from "@/lib/permissions";
import type { AssetListItem } from "@/types/asset";
import { pick, isAssetInactive } from "@/lib/display";

// Form asset membawa banyak field/master option; muat saat dibutuhkan saja.
const AssetFormModal = dynamic(
  () => import("@/components/assets/asset-form").then((m) => m.AssetFormModal),
  { ssr: false },
);

const AssetImportModal = dynamic(
  () =>
    import("@/components/assets/asset-import-modal").then(
      (m) => m.AssetImportModal,
    ),
  { ssr: false },
);

const DEFAULTS = {
  q: "",
  company: "",
  location: "",
  category: "",
  is_active: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

export default function AssetsPage() {
  const router = useRouter();
  const canWrite = useCan(PERMISSIONS.privilageAsset);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const { data, isLoading, isFetching, error, refetch } = useAssets(values);
  const options = useAssetOptions();
  const opt = options.data?.data;

  const rows = data?.data ?? [];

  const columns: Column<AssetListItem>[] = [
    {
      key: "asset_code",
      header: "Kode Aset",
      width: "170px",
      cell: (r) => (
        <span className="font-medium text-brand-700">
          {pick(r, ["AssetCode", "asset_code"])}
        </span>
      ),
    },
    {
      key: "asset_name",
      header: "Nama Aset",
      cell: (r) => (
        <div className="max-w-[280px]">
          <p className="truncate font-medium text-slate-800">
            {pick(r, ["AssetName", "asset_name", "name"]) || "-"}
          </p>
          <p className="truncate text-xs text-slate-400">
            {pick(r, ["brand"]) || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      cell: (r) => pick(r, ["CompanyName", "company_name", "company"]) || "-",
    },
    {
      key: "location",
      header: "Lokasi",
      cell: (r) => pick(r, ["LocationAsset", "location_name", "location"]) || "-",
    },
    {
      key: "category",
      header: "Kategori",
      cell: (r) => pick(r, ["CategoryAsset", "category_name", "category"]) || "-",
    },
    {
      key: "active",
      header: "Status",
      align: "center",
      cell: (r) => {
        const inactive = isAssetInactive(r);
        return (
          <StatusBadge
            status={inactive ? "inactive" : "active"}
            tone={inactive ? "slate" : "green"}
          />
        );
      },
    },
  ];

  return (
    <PageContainer
      title="Manajemen Aset"
      description="Daftar aset beserta lokasi, kategori, dan statusnya."
      actions={
        canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              Impor Excel
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Tambah Aset
            </Button>
          </div>
        ) : null
      }
    >
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari kode / nama aset…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterSelect
          value={values.company}
          onChange={(v) => setValues({ company: v }, { resetPage: true })}
          options={(opt?.companies ?? []).map((c) => ({ value: c.value, label: c.label }))}
          placeholder="Semua company"
        />
        <FilterSelect
          value={values.location}
          onChange={(v) => setValues({ location: v }, { resetPage: true })}
          options={(opt?.locations ?? []).map((c) => ({ value: c.value, label: c.label }))}
          placeholder="Semua lokasi"
        />
        <FilterSelect
          value={values.category}
          onChange={(v) => setValues({ category: v }, { resetPage: true })}
          options={(opt?.categories ?? []).map((c) => ({ value: c.value, label: c.label }))}
          placeholder="Semua kategori"
        />
        <FilterSelect
          value={values.is_active}
          onChange={(v) => setValues({ is_active: v }, { resetPage: true })}
          options={[
            { value: "1", label: "Aktif" },
            { value: "0", label: "Nonaktif" },
          ]}
          placeholder="Semua status"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => pick(r, ["AssetCode", "asset_code", "AssetID"]) || i}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(r) => {
          const code = pick(r, ["AssetCode", "asset_code"]);
          if (code) {
            router.push(`/assets/${code.split("/").map(encodeURIComponent).join("/")}`);
          }
        }}
        emptyTitle="Belum ada aset"
        emptyDescription="Ubah kata kunci atau tambah aset baru."
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

      {formOpen ? (
        <AssetFormModal open onClose={() => setFormOpen(false)} mode="create" />
      ) : null}

      {importOpen ? (
        <AssetImportModal onClose={() => setImportOpen(false)} />
      ) : null}
    </PageContainer>
  );
}
