"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Tabs } from "@/components/ui/tabs";
import { FilterBar, FilterDate, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge, statusLabel } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { useWorkOrders, useWorkOrderOptions } from "@/hooks/use-work-orders";
import { useMe } from "@/hooks/use-auth";
import { useQueryParams } from "@/hooks/use-query-params";
import { readableWoModules } from "@/lib/permissions";
import { AccessDenied } from "@/components/layout/access-denied";
import { DEFAULT_PER_PAGE } from "@/types/api";
import { WO_MODULE_LABEL, type WorkOrderListItem } from "@/types/work-order";
import { formatDate } from "@/lib/format";
import { pick } from "@/lib/display";

// Form WO memuat opsi dan validasi cukup banyak. Jangan masukkan ke bundle
// halaman list sebelum user benar-benar memilih "Buat WO".
const WoCreateModal = dynamic(
  () => import("@/components/work-orders/wo-create-modal").then((m) => m.WoCreateModal),
  { ssr: false },
);

const DEFAULTS = {
  module: "",
  q: "",
  status: "",
  type_wo: "",
  company: "",
  asset_id: "",
  date_from: "",
  date_to: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

export default function WorkOrdersPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useMe();
  const allowedModules = readableWoModules(user);

  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const [createOpen, setCreateOpen] = useState(false);

  // Modul yang diminta di luar hak akses -> paksa "Semua" (backend tetap
  // menyaring, ini hanya agar tab tidak menampilkan modul terlarang).
  const activeModule =
    values.module && allowedModules.includes(values.module) ? values.module : "";

  const { data, isLoading, isFetching, error, refetch } = useWorkOrders({
    ...values,
    module: activeModule,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;

  const woOptions = useWorkOrderOptions();
  const STATUS_OPTIONS = (woOptions.data?.data?.statuses ?? []).map((s) => ({
    value: s.code,
    label: statusLabel(s.code),
  }));
  const TYPE_WO_OPTIONS = (woOptions.data?.data?.types ?? []).map((t) => ({
    value: t.code,
    label: t.label,
  }));

  const tabItems = [
    { key: "", label: "Semua" },
    ...allowedModules.map((m) => ({
      key: m,
      label: WO_MODULE_LABEL[m as keyof typeof WO_MODULE_LABEL] ?? m,
    })),
  ];

  const columns: Column<WorkOrderListItem>[] = [
    {
      key: "wo_number",
      header: "No. WO",
      width: "180px",
      cell: (r) => (
        <span className="font-medium text-brand-700">{r.wo_number}</span>
      ),
    },
    {
      key: "title",
      header: "Deskripsi",
      cell: (r) => (
        <div className="max-w-[320px]">
          <p className="truncate font-medium text-slate-800">
            {pick(r, ["job_title", "title", "description", "subject"]) || "-"}
          </p>
          <p className="truncate text-xs text-slate-400">
            {pick(r, ["asset_name", "asset_code", "AssetName"]) || "Tanpa aset"}
          </p>
        </div>
      ),
    },
    {
      key: "module",
      header: "Modul",
      cell: (r) => {
        const m = (r.module ?? "").toString().toLowerCase();
        return (
          <span className="text-xs font-medium text-slate-600">
            {WO_MODULE_LABEL[m as keyof typeof WO_MODULE_LABEL] ?? r.module ?? "-"}
          </span>
        );
      },
    },
    {
      key: "type_wo",
      header: "Tipe",
      cell: (r) => (
        <span className="capitalize text-slate-600">{r.type_wo ?? "-"}</span>
      ),
    },
    {
      key: "company",
      header: "Company",
      cell: (r) => pick(r, ["company_name", "company"]) || "-",
    },
    {
      key: "priority",
      header: "Prioritas",
      cell: (r) => <span className="capitalize text-slate-600">{r.priority ?? "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "created_at",
      header: "Dibuat",
      align: "right",
      cell: (r) => (
        <span className="whitespace-nowrap text-slate-500">
          {formatDate(pick(r, ["created_at", "scheduled_at", "date"]))}
        </span>
      ),
    },
  ];

  const goToDetail = (r: WorkOrderListItem) => {
    const mod = (r.module ?? values.module ?? "maintenance").toString().toLowerCase();
    router.push(
      `/work-orders/${encodeURIComponent(mod)}/${r.wo_number
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
  };

  if (!userLoading && allowedModules.length === 0) {
    return (
      <PageContainer title="Work Order">
        <AccessDenied message="Anda tidak memiliki permission untuk melihat Work Order modul manapun (wo_mtc, wo_operational, wo_preventive, wo_it, wo_ga, atau wo_cross_access)." />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Work Order"
      description="Daftar work order sesuai modul yang boleh Anda akses."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Muat ulang
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat WO
          </Button>
        </div>
      }
    >
      <Tabs
        items={tabItems}
        value={activeModule}
        onChange={(key) => setValues({ module: key }, { resetPage: true })}
      />

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari no. WO, deskripsi, aset…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterDate
          label="Dari"
          value={values.date_from}
          onChange={(v) => setValues({ date_from: v }, { resetPage: true })}
        />
        <FilterDate
          label="Sampai"
          value={values.date_to}
          onChange={(v) => setValues({ date_to: v }, { resetPage: true })}
        />
        <FilterSelect
          value={values.status}
          onChange={(v) => setValues({ status: v }, { resetPage: true })}
          options={STATUS_OPTIONS}
          placeholder="Semua status"
        />
        <FilterSelect
          value={values.type_wo}
          onChange={(v) => setValues({ type_wo: v }, { resetPage: true })}
          options={TYPE_WO_OPTIONS}
          placeholder="Semua tipe"
        />
        <input
          className="input-base h-9 w-36"
          placeholder="Company"
          defaultValue={values.company}
          onBlur={(e) => setValues({ company: e.target.value }, { resetPage: true })}
        />
        <input
          className="input-base h-9 w-32"
          placeholder="Asset ID"
          defaultValue={values.asset_id}
          onBlur={(e) => setValues({ asset_id: e.target.value }, { resetPage: true })}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => r.wo_number ?? i}
        isLoading={isLoading}
        isFetching={isFetching && !isLoading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={goToDetail}
        emptyTitle="Belum ada work order"
        emptyDescription="Coba ubah filter tanggal atau kata kunci pencarian."
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={meta}
            page={values.page}
            perPage={values.per_page}
            onPageChange={(page) => setValues({ page })}
            onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
          />
        </div>
      ) : null}

      {createOpen ? (
        <WoCreateModal
          open
          onClose={() => setCreateOpen(false)}
          // Jika WO dibuat dari tab modul tertentu, modul tersebut adalah
          // konteks kerja user. Jangan biarkan form kembali ke MESO.
          initialModule={activeModule || undefined}
        />
      ) : null}
    </PageContainer>
  );
}
