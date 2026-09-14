"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/primitives";
import { QrPrintModal } from "@/components/reports/qr-print-modal";
import { useAssets } from "@/hooks/use-assets";
import { useQueryParams } from "@/hooks/use-query-params";
import type { AssetListItem } from "@/types/asset";
import { pick } from "@/lib/display";

const PER_PAGE = 15;
const DEFAULTS = { q: "", page: 1, per_page: PER_PAGE };

export default function QrReportPage() {
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const { data, isLoading, isFetching, error, refetch } = useAssets({
    q: values.q,
    page: values.page,
    per_page: PER_PAGE,
    is_active: "1",
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;

  const [printCode, setPrintCode] = useState("");

  const columns: Column<AssetListItem>[] = [
    {
      key: "asset_code",
      header: "Kode Aset",
      width: "180px",
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
        <span className="text-slate-800">
          {pick(r, ["AssetName", "asset_name"]) || "-"}
        </span>
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
      key: "action",
      header: "",
      align: "right",
      width: "130px",
      cell: (r) => {
        const code = String(pick(r, ["AssetCode", "asset_code"]));
        return (
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setPrintCode(code);
            }}
          >
            <QrCode className="h-4 w-4" />
            Cetak QR
          </Button>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="Cetak QR"
      description="Cari aset lalu cetak label QR-nya. 15 aset per halaman."
    >
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari kode, nama, atau company aset…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      />

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => String(pick(r, ["AssetCode", "asset_code"]) || i)}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={(r) =>
          setPrintCode(String(pick(r, ["AssetCode", "asset_code"])))
        }
        emptyTitle="Aset tidak ditemukan"
        emptyDescription="Coba ubah kata kunci pencarian."
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={meta}
            page={values.page}
            perPage={PER_PAGE}
            onPageChange={(page) => setValues({ page })}
          />
        </div>
      ) : null}

      {printCode ? (
        <QrPrintModal assetCode={printCode} onClose={() => setPrintCode("")} />
      ) : null}
    </PageContainer>
  );
}
