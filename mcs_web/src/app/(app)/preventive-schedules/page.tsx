"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/primitives";
import { HolidayCalendar } from "@/components/schedules/holiday-calendar";
import { ScheduleFormModal } from "@/components/schedules/schedule-form";
import { useCan } from "@/components/ui/permission-guard";
import { usePreventiveSchedules } from "@/hooks/use-preventive-schedules";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE } from "@/types/api";
import { PERMISSIONS } from "@/lib/permissions";
import type { PreventiveScheduleListItem } from "@/types/preventive";
import { formatDate } from "@/lib/format";
import { pick } from "@/lib/display";

const DEFAULTS = {
  q: "",
  company: "",
  towo: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

const TOWO_OPTIONS = [
  { value: "meso", label: "MESO" },
  { value: "maintenance", label: "Maintenance" },
  { value: "production", label: "Production" },
  { value: "is", label: "IS" },
  { value: "ga", label: "GA" },
];

export default function PreventiveSchedulesPage() {
  const router = useRouter();
  const canManage = useCan(PERMISSIONS.schedule);
  const [formOpen, setFormOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const { data, isLoading, isFetching, error, refetch } = usePreventiveSchedules(values);
  const rows = data?.data ?? [];

  const columns: Column<PreventiveScheduleListItem>[] = [
    {
      key: "asset",
      header: "Aset",
      cell: (r) => (
        <div>
          <p className="font-medium text-brand-700">
            {pick(r, ["AssetName", "asset_name", "AssetCode", "asset_code"]) || "-"}
          </p>
          <p className="text-xs text-slate-400">
            {pick(r, ["AssetCode", "asset_code"])}
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
      key: "towo",
      header: "Tujuan WO",
      cell: (r) => (
        <span className="capitalize text-slate-600">
          {pick(r, ["towo", "target_wo"]) || "-"}
        </span>
      ),
    },
    {
      key: "detail_count",
      header: "Detail",
      align: "center",
      cell: (r) => <span className="text-slate-600">{r.detail_count ?? "-"}</span>,
    },
    {
      key: "updated_at",
      header: "Diperbarui",
      align: "right",
      cell: (r) => formatDate(pick(r, ["updated_at", "created_at"])),
    },
  ];

  return (
    <PageContainer
      title="Preventive Schedule"
      description="Jadwal pemeliharaan preventive per aset. Schedule baru membuat WO awal; siklus berikutnya mengikuti frekuensi detail."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCalendar((v) => !v)}>
            <CalendarDays className="h-4 w-4" />
            {showCalendar ? "Sembunyikan Kalender" : "Kalender Libur"}
          </Button>
          {canManage ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Buat Schedule
            </Button>
          ) : null}
        </div>
      }
    >
      {showCalendar ? <HolidayCalendar /> : null}

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari aset…"
        onRefresh={() => refetch()}
        isFetching={isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <input
          className="input-base h-9 w-40"
          placeholder="Company"
          defaultValue={values.company}
          onBlur={(e) => setValues({ company: e.target.value }, { resetPage: true })}
        />
        <FilterSelect
          value={values.towo}
          onChange={(v) => setValues({ towo: v }, { resetPage: true })}
          options={TOWO_OPTIONS}
          placeholder="Semua tujuan WO"
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
        onRowClick={(r) => router.push(`/preventive-schedules/${r.id}`)}
        emptyTitle="Belum ada schedule"
        emptyDescription="Buat schedule preventive untuk aset yang belum memilikinya."
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

      <ScheduleFormModal open={formOpen} onClose={() => setFormOpen(false)} mode="create" />
    </PageContainer>
  );
}
