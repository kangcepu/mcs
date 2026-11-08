"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Zap } from "lucide-react";
import { EnergyProfileForm } from "@/components/energy/energy-profile-form";
import { EnergyMonitoringPanel } from "@/components/energy/energy-monitoring-panel";
import { EnergyEfficiencyKpiPanel } from "@/components/energy/energy-efficiency-kpi";
import { UtilityAllocationPanel } from "@/components/energy/utility-allocation";
import { MeterMasterPanel } from "@/components/energy/meter-master";
import { PageContainer } from "@/components/layout/page-container";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { useCan } from "@/components/ui/permission-guard";
import { Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useEnergyProfileOptions, useEnergyProfiles } from "@/hooks/use-energy";
import { useQueryParams } from "@/hooks/use-query-params";
import { ENERGY_MODULE_ENABLED } from "@/lib/env";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_PER_PAGE } from "@/types/api";
import type { EnergyAssetProfile } from "@/types/energy";

const DEFAULTS = {
  q: "",
  energy_type: "",
  utility_type: "",
  status: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

const TYPE_LABEL: Record<string, string> = {
  ELECTRICITY_METER: "Meter Listrik",
  GENSET: "Genset",
  FUEL_TANK: "Fuel Tank",
  WATER_METER: "Water Meter",
  COMPRESSOR: "Compressor",
  BOILER: "Boiler",
  OTHER: "Lainnya",
};

const UTILITY_LABEL: Record<string, string> = {
  ELECTRICITY: "Listrik",
  FUEL: "Bahan Bakar",
  WATER: "Air",
  COMPRESSED_AIR: "Udara Bertekanan",
  STEAM: "Steam",
  OTHER: "Lainnya",
};

function specificationSummary(row: EnergyAssetProfile): string {
  if (row.energy_type === "ELECTRICITY_METER" || row.energy_type === "WATER_METER") {
    return [row.meter_number, row.meter_unit, row.meter_multiplier ? `× ${row.meter_multiplier}` : ""]
      .filter(Boolean)
      .join(" · ") || "Belum lengkap";
  }
  if (row.energy_type === "GENSET") {
    return [row.serial_number, row.rated_kva ? `${row.rated_kva} kVA` : "", row.rated_kw ? `${row.rated_kw} kW` : ""]
      .filter(Boolean)
      .join(" · ") || "Belum lengkap";
  }
  if (row.energy_type === "FUEL_TANK") {
    return [row.tank_number, row.capacity_liter ? `${row.capacity_liter} liter` : ""]
      .filter(Boolean)
      .join(" · ") || "Belum lengkap";
  }
  try {
    const metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : {};
    return [metadata.capacity_value, metadata.capacity_unit].filter(Boolean).join(" ") || "Belum lengkap";
  } catch {
    return "Belum lengkap";
  }
}

export default function EnergyPage() {
  const canWrite = useCan(PERMISSIONS.privilageAsset);
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const profiles = useEnergyProfiles(values, ENERGY_MODULE_ENABLED);
  const options = useEnergyProfileOptions(ENERGY_MODULE_ENABLED).data?.data;
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<EnergyAssetProfile | null>(null);
  const [tab, setTab] = useState("profiles");

  if (!ENERGY_MODULE_ENABLED) {
    return (
      <PageContainer title="Energy & Utility" description="Fondasi asset untuk meter, genset, tank, dan utility.">
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="Modul Energy belum diaktifkan"
          description="Fondasi sudah tersedia, tetapi feature flag pilot masih nonaktif."
        />
      </PageContainer>
    );
  }

  const columns: Column<EnergyAssetProfile>[] = [
    {
      key: "asset",
      header: "Asset",
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.AssetName}</p>
          <p className="text-xs text-slate-400">{row.AssetCode}</p>
        </div>
      ),
    },
    { key: "type", header: "Tipe", cell: (row) => TYPE_LABEL[row.energy_type] ?? row.energy_type },
    { key: "utility", header: "Utility", cell: (row) => UTILITY_LABEL[row.utility_type] ?? row.utility_type },
    { key: "specification", header: "Spesifikasi", cell: specificationSummary },
    {
      key: "location",
      header: "Company / Lokasi",
      cell: (row) => (
        <div>
          <p>{row.CompanyName || "-"}</p>
          <p className="text-xs text-slate-400">{row.LocationAsset || "-"}</p>
        </div>
      ),
    },
    { key: "code", header: "Kode Profil", cell: (row) => row.profile_code || "-" },
    {
      key: "status",
      header: "Status",
      align: "center",
      cell: (row) => (
        <StatusBadge
          status={row.status.toLowerCase()}
          tone={row.status === "ACTIVE" ? "green" : row.status === "MAINTENANCE" ? "amber" : "slate"}
        />
      ),
    },
    {
      key: "operations",
      header: "Operasional",
      align: "right",
      cell: (row) => {
        const available = ["ELECTRICITY_METER", "WATER_METER", "GENSET", "FUEL_TANK"].includes(row.energy_type);
        if (!available) return <span className="text-slate-400">-</span>;
        const href = `/assets/${row.AssetCode.split("/").map(encodeURIComponent).join("/")}`;
        return (
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            Buka <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        );
      },
    },
  ];

  const rows = profiles.data?.data ?? [];

  return (
    <PageContainer
      title="Energy Asset Profile"
      description="Extension untuk asset meter, genset, fuel tank, water meter, compressor, dan boiler."
      actions={canWrite && tab === "profiles" ? (
        <Button onClick={() => { setSelected(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Tambah Profil
        </Button>
      ) : null}
    >
      <Tabs
        items={[
          { key: "profiles", label: "Asset Profile" },
          { key: "monitoring", label: "Monitoring & Laporan" },
          { key: "kpi", label: "Baseline & KPI" },
          { key: "allocation", label: "Utility Allocation" },
          { key: "meter-master", label: "Meter Master" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "monitoring" ? <EnergyMonitoringPanel /> : tab === "kpi" ? <EnergyEfficiencyKpiPanel canWrite={canWrite} /> : tab === "allocation" ? <UtilityAllocationPanel canWrite={canWrite} /> : tab === "meter-master" ? <MeterMasterPanel canWrite={canWrite} /> : <>
      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari asset, kode, atau lokasi…"
        onRefresh={() => profiles.refetch()}
        isFetching={profiles.isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterSelect
          value={values.energy_type}
          onChange={(energy_type) => setValues({ energy_type }, { resetPage: true })}
          options={options?.energy_types ?? []}
          placeholder="Semua tipe asset"
        />
        <FilterSelect
          value={values.utility_type}
          onChange={(utility_type) => setValues({ utility_type }, { resetPage: true })}
          options={options?.utility_types ?? []}
          placeholder="Semua utility"
        />
        <FilterSelect
          value={values.status}
          onChange={(status) => setValues({ status }, { resetPage: true })}
          options={options?.statuses ?? []}
          placeholder="Semua status"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        isLoading={profiles.isLoading}
        isFetching={profiles.isFetching && !profiles.isLoading}
        error={profiles.error}
        onRetry={() => profiles.refetch()}
        onRowClick={canWrite ? (row) => { setSelected(row); setFormOpen(true); } : undefined}
        emptyTitle="Belum ada Energy asset"
        emptyDescription="Tautkan asset existing sebagai meter, genset, tank, atau utility lainnya."
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={profiles.data?.meta}
            page={values.page}
            perPage={values.per_page}
            onPageChange={(page) => setValues({ page })}
            onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
          />
        </div>
      ) : null}

      {formOpen ? (
        <EnergyProfileForm
          open
          initial={selected}
          onClose={() => { setFormOpen(false); setSelected(null); }}
        />
      ) : null}
      </>}
    </PageContainer>
  );
}
