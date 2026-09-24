"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileArchive, MonitorSmartphone, ShieldAlert, Smartphone, Upload, Wifi } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import { Tabs } from "@/components/ui/tabs";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMcsMobileRelease, useUploadMcsMobileRelease, useMcsMobileDevices } from "@/hooks/use-mcs-mobile";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime, formatBytes, formatNumber } from "@/lib/format";
import { toAbsoluteUploadUrl } from "@/lib/env";
import { ApiError } from "@/types/api";
import type { McsMobileDevice } from "@/lib/api/mcs-mobile";

const MAX_RELEASE_BYTES = 300 * 1024 * 1024;

const platforms = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
];

const statuses = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

export default function McsMobilePage() {
  const toast = useToast();
  const canUpload = useCan(PERMISSIONS.mcsMobileUpload);
  const [tab, setTab] = useState<"release" | "devices">("release");
  const { data, isLoading, error, refetch } = useMcsMobileRelease();
  const upload = useUploadMcsMobileRelease();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const release = data?.data;

  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const devices = useMcsMobileDevices({ q, platform, status, page, per_page: perPage }, canUpload && tab === "devices");
  const summary = devices.data?.meta?.summary;

  const selectFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const ext = next.name.split(".").pop()?.toLowerCase();
    if (ext !== "apk" && ext !== "aab") {
      toast.warning("Format tidak didukung", "Pilih file APK atau AAB.");
      return;
    }
    if (next.size > MAX_RELEASE_BYTES) {
      toast.warning("File terlalu besar", "Ukuran maksimal release adalah 300 MB.");
      return;
    }
    setFile(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !version.trim() || !/^\d+$/.test(versionCode) || Number(versionCode) < 1) {
      toast.warning("Data belum lengkap", "Version, Version Code, dan file APK/AAB wajib diisi.");
      return;
    }
    const form = new FormData();
    form.append("version", version.trim());
    form.append("version_code", versionCode);
    form.append("release_notes", releaseNotes.trim());
    form.append("force_update", forceUpdate ? "1" : "0");
    form.append("apk_file", file);
    try {
      const result = await upload.mutateAsync(form);
      toast.success("Release dipublikasikan", `MCS Mobile v${result.data?.version ?? version.trim()} sekarang aktif.`);
      setVersion("");
      setVersionCode("");
      setReleaseNotes("");
      setForceUpdate(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      toast.error("Gagal mengunggah release", error instanceof ApiError ? error.message : "Terjadi kesalahan saat menyimpan release.");
    }
  };

  const columns: Column<McsMobileDevice>[] = [
    { key: "fullname", header: "User", cell: (row) => <div><div className="font-medium text-slate-900">{row.fullname || "-"}</div><div className="text-xs text-slate-500">{row.username || "-"}</div></div> },
    { key: "device_name", header: "Device", cell: (row) => row.device_name || "-" },
    { key: "platform", header: "Platform", cell: (row) => <span className="capitalize">{row.platform || "-"}</span> },
    { key: "app_version", header: "App Version", cell: (row) => row.app_version ? `${row.app_version}${row.build_number ? ` (${row.build_number})` : ""}` : "-" },
    { key: "ip_address", header: "IP Address", cell: (row) => row.ip_address || "-" },
    { key: "last_seen_at", header: "Terakhir Aktif", cell: (row) => row.last_seen_at ? new Date(row.last_seen_at.replace(" ", "T")).toLocaleString("id-ID") : "-" },
    { key: "is_active", header: "Status", cell: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  return (
    <PageContainer
      title="MCS Mobile"
      description="Release aktif untuk aplikasi MCS Mobile dan pemantauan perangkat yang terdaftar."
    >
      {canUpload ? (
        <Tabs
          value={tab}
          onChange={(key) => setTab(key as "release" | "devices")}
          items={[
            { key: "release", label: "Release" },
            { key: "devices", label: "Device Monitoring", count: summary?.active_devices },
          ]}
        />
      ) : null}

      {tab === "release" ? (
        <>
          {isLoading ? <LoadingSkeleton rows={6} /> : null}
          {error ? (
            <div className="card flex items-center justify-between gap-4 p-5 text-sm text-rose-700">
              <span>Release MCS Mobile tidak dapat dimuat.</span>
              <Button variant="secondary" onClick={() => refetch()}>Coba lagi</Button>
            </div>
          ) : null}
          {release ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
              <section className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white"><Smartphone className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Release aktif</p>
                      <p className="text-xs text-slate-500">Versi yang tersedia untuk pengguna mobile.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">v{release.version}</span>
                    <a href={toAbsoluteUploadUrl(release.download_url)} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
                      <Download className="h-4 w-4" /> {release.file_name?.toUpperCase().endsWith(".AAB") ? "AAB" : "APK"}
                    </a>
                  </div>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Version Code" value={String(release.version_code)} />
                  <Info label="Pembaruan" value={release.force_update ? "Wajib diperbarui" : "Opsional"} strong={release.force_update} />
                  <Info label="Diunggah oleh" value={release.uploaded_by || "-"} />
                  <Info label="Diunggah pada" value={formatDateTime(release.uploaded_at)} />
                </div>
                <div className="border-t border-slate-100 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Release Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{release.release_notes || "-"}</p>
                </div>
              </section>

              {canUpload ? (
                <section className="card p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Upload className="h-4 w-4" /></span>
                    <div><h2 className="text-sm font-semibold text-slate-900">Upload release baru</h2><p className="text-xs text-slate-500">Release baru langsung menjadi versi aktif.</p></div>
                  </div>
                  <form className="space-y-3" onSubmit={submit}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Version" required><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Contoh: 1.2.0" /></Field>
                      <Field label="Version Code" required hint="Nomor build Android, minimal 1."><Input type="number" min="1" value={versionCode} onChange={(e) => setVersionCode(e.target.value)} placeholder="Contoh: 12" /></Field>
                    </div>
                    <Field label="Release Notes" hint="Jelaskan perubahan penting pada release ini."><Textarea rows={3} value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} placeholder={"- Bug fixes\n- Improve performance"} /></Field>
                    <Field label="APK / AAB" required hint="Format APK atau AAB, maksimal 300 MB.">
                      <input ref={fileRef} type="file" accept=".apk,.aab,application/vnd.android.package-archive" className="hidden" onChange={(e) => selectFile(e.target.files?.[0] ?? null)} />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}><FileArchive className="h-4 w-4" /> Pilih file</Button>
                        <span className="text-sm text-slate-500">{file ? `${file.name} (${formatBytes(file.size)})` : "Belum ada file dipilih"}</span>
                      </div>
                    </Field>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                      <input type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                      <span><span className="block text-sm font-medium text-slate-800">Wajib update</span><span className="block text-xs text-slate-500">Pengguna harus memperbarui aplikasi sebelum melanjutkan.</span></span>
                    </label>
                    <Button className="w-full" type="submit" loading={upload.isPending}><Upload className="h-4 w-4" /> Publikasikan release</Button>
                  </form>
                </section>
              ) : (
                <section className="card flex items-start gap-3 p-4">
                  <ShieldAlert className="h-6 w-6 shrink-0 text-amber-500" />
                  <div>
                    <h2 className="font-semibold text-slate-900">Download-only access</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Anda dapat mengunduh release aktif. Untuk menerbitkan pembaruan, minta permission MCS Mobile Upload kepada administrator.</p>
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={<MonitorSmartphone className="h-5 w-5" />} label="Total Device" value={formatNumber(summary?.total_devices)} />
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
        </>
      )}
    </PageContainer>
  );
}

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

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className={strong ? "mt-1 text-sm font-semibold text-amber-700" : "mt-1 text-sm font-medium text-slate-700"}>{value}</p></div>;
}
