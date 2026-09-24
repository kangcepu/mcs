"use client";

import { useState } from "react";
import { Smartphone, Wifi, CheckCircle2 } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageContainer } from "@/components/layout/page-container";
import { useMe } from "@/hooks/use-auth";
import { useDeviceMonitoring } from "@/hooks/use-master";
import { canRead } from "@/lib/permissions";
import { LoadingSkeleton } from "@/components/ui/states";
import { formatNumber } from "@/lib/format";
import type { DeviceMonitoringItem } from "@/lib/api/master";

const platforms = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
];

const statuses = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</div>
      <div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export default function DeviceMonitoringPage() {
  const { data: user, isLoading: userLoading } = useMe();
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const devices = useDeviceMonitoring({ q, platform, status, page, per_page: perPage });

  if (userLoading) return <PageContainer title="Device Monitoring"><LoadingSkeleton rows={6} /></PageContainer>;
  if (!canRead(user, "masterUser")) return <PageContainer title="Device Monitoring"><AccessDenied /></PageContainer>;

  const summary = devices.data?.meta?.summary;

  const columns: Column<DeviceMonitoringItem>[] = [
    { key: "fullname", header: "User", cell: (row) => <div><div className="font-medium text-slate-900">{row.fullname || "-"}</div><div className="text-xs text-slate-500">{row.username || "-"}</div></div> },
    { key: "device_name", header: "Device", cell: (row) => row.device_name || "-" },
    { key: "platform", header: "Platform", cell: (row) => <span className="capitalize">{row.platform || "-"}</span> },
    { key: "app_version", header: "App Version", cell: (row) => row.app_version ? `${row.app_version}${row.build_number ? ` (${row.build_number})` : ""}` : "-" },
    { key: "ip_address", header: "IP Address", cell: (row) => row.ip_address || "-" },
    { key: "last_seen_at", header: "Terakhir Aktif", cell: (row) => row.last_seen_at ? new Date(row.last_seen_at.replace(" ", "T")).toLocaleString("id-ID") : "-" },
    { key: "is_active", header: "Status", cell: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  return (
    <PageContainer title="Device Monitoring" description="Pantau perangkat mobile yang terdaftar — jumlah, jenis device, versi aplikasi, dan IP address terakhir.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<Smartphone className="h-5 w-5" />} label="Total Device" value={formatNumber(summary?.total_devices)} />
        <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Device Aktif" value={formatNumber(summary?.active_devices)} />
        <StatTile icon={<Smartphone className="h-5 w-5" />} label="Android" value={formatNumber(summary?.android)} />
        <StatTile icon={<Wifi className="h-5 w-5" />} label="iOS" value={formatNumber(summary?.ios)} />
      </div>
      <FilterBar search={q} onSearchChange={(value) => { setQ(value); setPage(1); }} searchPlaceholder="Cari user, device, atau IP…" onRefresh={() => devices.refetch()} isFetching={devices.isFetching}>
        <FilterSelect value={platform} onChange={(value) => { setPlatform(value); setPage(1); }} placeholder="Semua platform" options={platforms} />
        <FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} placeholder="Semua status" options={statuses} />
      </FilterBar>
      <DataTable columns={columns} data={devices.data?.data} rowKey={(row) => row.id} isLoading={devices.isLoading} isFetching={devices.isFetching && !devices.isLoading} error={devices.error} onRetry={() => devices.refetch()} emptyTitle="Belum ada device terdaftar" emptyDescription="Device yang login lewat MCS Mobile akan muncul di sini." />
      {(devices.data?.data.length ?? 0) > 0 ? <div className="card"><Pagination meta={devices.data?.meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} /></div> : null}
    </PageContainer>
  );
}
