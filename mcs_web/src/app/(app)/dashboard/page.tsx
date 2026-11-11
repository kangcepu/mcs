"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Building2,
  CarFront,
  CalendarX2,
  CheckCircle2,
  Clock,
  FolderKanban,
  Loader2,
  Landmark,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingSkeleton } from "@/components/ui/states";
import { MiniTable } from "@/components/ui/detail";
import { Button } from "@/components/ui/primitives";
import {
  BarList,
  DailyStatusBars,
  SEMANTIC_COLORS,
  SEVERITY_COLORS,
  Sparkline,
  StackedBar,
  TrendChart,
} from "@/components/ui/mini-charts";
import {
  useApprovalSummaryCard,
  useDashboard,
  useRecentWorkOrders,
} from "@/hooks/use-dashboard";
import { useMe } from "@/hooks/use-auth";
import { WO_MODULE_LABEL } from "@/types/work-order";
import { formatDate, formatNumber } from "@/lib/format";
import { pick } from "@/lib/display";
import { PreventiveMissingNotice } from "@/components/schedules/preventive-missing-notice";
import type { DashboardData } from "@/lib/api/dashboard";

const RANGES = [
  { value: 7, label: "7 hari" },
  { value: 14, label: "14 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
  { value: 180, label: "180 hari" },
];

export default function DashboardPage() {
  const { data: user } = useMe();
  const [range, setRange] = useState(7);
  const [company, setCompany] = useState("");
  const q = useDashboard(range, company);
  const d = q.data?.data;
  const enterprise = d?.enterprise;

  const recent = useRecentWorkOrders(8);
  const approval = useApprovalSummaryCard();
  const approvalCount =
    (approval.data?.data?.wo_approvals ?? 0) +
    (approval.data?.data?.wo_closings ?? 0) +
    (approval.data?.data?.materials ?? 0) +
    (approval.data?.data?.mutations ?? 0);

  // "WO Overdue" = WO terbuka yang umurnya masuk 2 bucket paling parah
  // (8-14 hari & >14 hari) — dipromosikan jadi KPI utama dari data aging
  // yang sebelumnya cuma muncul di kartu bar chart sekunder.
  const overdueCount = d ? (d.aging[2]?.count ?? 0) + (d.aging[3]?.count ?? 0) : 0;

  const activeModules = d?.by_module.filter((m) => m.total > 0) ?? [];
  const zeroModules = d?.by_module.filter((m) => m.total === 0) ?? [];

  return (
    <PageContainer
      title="Dashboard Utama MCS"
      description="Enterprise overview lintas Asset, Maintenance, Fleet, Energy, Governance, dan GA."
      actions={
        <div className="flex items-center gap-2">
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="h-8 max-w-40 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            aria-label="Filter company"
          >
            <option value="">Semua company</option>
            {(enterprise?.scope.available_companies ?? []).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition " +
                  (range === r.value
                    ? "bg-brand-600 text-white"
                    : "text-slate-500 hover:text-slate-800")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => q.refetch()}>
            <RefreshCw
              className={q.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <LoadingSkeleton rows={10} />
      ) : q.isError || !d ? (
        <div className="card p-6 text-center text-sm text-slate-500">
          Tidak dapat memuat data dashboard.
          <div className="mt-3">
            <Button variant="secondary" onClick={() => q.refetch()}>
              Coba lagi
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={
            "animate-fade-in space-y-4 transition-opacity duration-300 ease-out " +
            (q.isFetching ? "opacity-70" : "opacity-100")
          }
        >
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-100/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-72 rounded-full bg-violet-100/60 blur-3xl" />
            <div className="relative border-b border-slate-200 px-5 py-5 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    Enterprise Operations Command Center
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    Selamat datang, {user?.fullname?.split(" ")[0] ?? "Pengguna"}
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                    Kondisi operasional saat ini berdasarkan scope akses, company, dan periode aktif.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Data quality: {enterprise?.data_quality_status === "partial" ? "Parsial tervalidasi" : "Tervalidasi"}
                </div>
              </div>
            </div>
            <div className="relative grid grid-cols-2 divide-x divide-y divide-slate-200 lg:grid-cols-5 lg:divide-y-0">
              <ExecutiveMetric icon={Boxes} label="Asset Aktif" value={metricValue(enterprise?.headline.asset_active)} href={enterprise?.headline.asset_active?.detail_route} />
              <ExecutiveMetric icon={CalendarX2} label="Belum Preventive" value={d.preventive_coverage.missing} href="/my-work?tab=preventive_missing" attention={d.preventive_coverage.missing > 0} />
              <ExecutiveMetric icon={Loader2} label="WO Open" value={d.totals.open + d.totals.in_progress} href="/work-orders" />
              <ExecutiveMetric icon={BadgeCheck} label="Menunggu Approval" value={approval.isLoading ? "…" : approvalCount} href="/approval-center" attention={approvalCount > 0} />
              <ExecutiveMetric icon={TriangleAlert} label="Critical NCR" value={metricValue(enterprise?.headline.critical_ncr)} href={enterprise?.headline.critical_ncr?.detail_route} attention={Number(enterprise?.headline.critical_ncr?.value ?? 0) > 0} />
            </div>
          </section>

          <PreventiveMissingNotice
            scope="dashboard"
            audience={user?.id}
            missing={d.preventive_coverage.missing}
            required={d.preventive_coverage.required}
            scheduled={d.preventive_coverage.scheduled}
            areas={d.preventive_coverage.by_area}
            onReview={() => { window.location.href = "/my-work?tab=preventive_missing"; }}
          />

          {enterprise ? <DomainHealth domains={enterprise.domains} /> : null}

          {/* Strip sekunder — konteks volume + kualitas kerja, gak untuk
              ditindak langsung. Baris kedua, kartu sama padat & sejajar
              dengan baris KPI utama di atas. */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Kpi
              size="sm"
              icon={<TriangleAlert className="h-4 w-4" />}
              label="WO Overdue"
              value={overdueCount}
              sub="Umur WO terbuka > 7 hari"
              trendMeaning="negative"
              href="/work-orders"
              tone="rose"
            />
            <Kpi
              size="sm"
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Ditutup"
              value={d.totals.closed}
              pct={d.delta.closed_pct}
              trendMeaning="positive"
              tone="green"
            />
            <Kpi
              size="sm"
              icon={<Clock className="h-4 w-4" />}
              label={`Total WO (${range}h)`}
              value={d.totals.total}
              pct={d.delta.total_pct}
              trendMeaning="neutral"
              href="/work-orders"
              tone="brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            <Kpi size="sm" icon={<Wrench className="h-4 w-4" />} label="WO Corrective" value={d.by_type.corrective} pct={d.by_type.corrective_pct} trendMeaning="negative" sub="Makin sedikit makin baik" tone="amber" />
            <Kpi size="sm" icon={<FolderKanban className="h-4 w-4" />} label="WO Project" value={d.by_type.project} pct={d.by_type.project_pct} trendMeaning="neutral" tone="violet" />
            <PreventiveRatioKpi ratio={d.by_type.preventive_ratio} deltaPts={d.by_type.preventive_ratio_delta_pts} preventive={d.by_type.preventive} corrective={d.by_type.corrective} trend={d.by_type.ratio_trend} />
          </div>

          {/* Preventive Harian — breakdown status WO Preventive per hari
              (Selesai/Dikerjakan/Belum Dikerjakan) + persentase, beda dari
              Rasio Preventive di atas yang cuma 1 angka buat seluruh periode. */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Preventive Harian</h2>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <LegendDot color={SEMANTIC_COLORS.success} label="Selesai" />
                <LegendDot color={SEMANTIC_COLORS.brand} label="Dikerjakan" />
                <LegendDot color={SEMANTIC_COLORS.warning} label="Belum" />
              </div>
            </div>
            <DailyStatusBars data={d.preventive_daily} />
          </div>

          {/* Tren + Status — grid 12 kolom konsisten dipakai dari sini
              ke bawah, tinggi kartu sebaris disamakan lewat h-full. */}
          <div className="grid grid-cols-12 gap-4">
            <div className="card flex h-full flex-col p-5 lg:col-span-8">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Tren Work Order
                </h2>
                <span className="text-xs text-slate-500">
                  {d.from} – {d.to}
                </span>
              </div>
              <TrendChart data={d.trend} />
            </div>

            <div className="card flex h-full flex-col p-5 lg:col-span-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Komposisi Status
              </h2>
              <StackedBar
                centerValue={formatNumber(d.totals.total)}
                centerLabel="total WO"
                segments={[
                  { label: "Antre", value: d.totals.open, color: SEMANTIC_COLORS.warning },
                  { label: "Dikerjakan", value: d.totals.in_progress, color: SEMANTIC_COLORS.brand },
                  { label: "Ditutup", value: d.totals.closed, color: SEMANTIC_COLORS.success },
                  { label: "Ditolak/Void", value: d.totals.rejected, color: SEMANTIC_COLORS.danger },
                ]}
              />
            </div>
          </div>

          {/* Modul + Aging + Company */}
          <div className="grid grid-cols-12 gap-4">
            <div className="card flex h-full flex-col p-5 lg:col-span-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                WO per Modul
              </h2>
              <BarList
                items={[
                  ...activeModules.map((m) => ({
                    label: m.label,
                    value: m.total,
                    sub: `${m.open + m.in_progress} aktif`,
                    href: `/work-orders?module=${m.module}`,
                  })),
                  ...(zeroModules.length
                    ? [
                        {
                          label: "Lainnya",
                          value: 0,
                          sub: `${zeroModules.length} modul tanpa aktivitas (${zeroModules
                            .map((m) => m.label)
                            .join(", ")})`,
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            <div className="card flex h-full flex-col p-5 lg:col-span-4">
              <div className="mb-3 flex items-center gap-1.5">
                <TriangleAlert className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Umur WO Terbuka
                </h2>
              </div>
              <BarList
                items={d.aging.map((a, i) => ({
                  label: a.bucket,
                  value: a.count,
                  color: SEVERITY_COLORS[i],
                }))}
              />
            </div>

            <div className="card flex h-full flex-col p-5 lg:col-span-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                WO per Company
              </h2>
              <BarList
                items={d.by_company.map((c) => ({
                  label: c.company,
                  value: c.total,
                }))}
              />
            </div>
          </div>

          {/* Top assets + Status detail */}
          <div className="grid grid-cols-12 gap-4">
            <div className="card flex h-full flex-col p-5 lg:col-span-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Aset Paling Sering WO
              </h2>
              <BarList
                items={d.top_assets.map((a) => ({
                  label: a.asset_name || a.asset_code || `#${a.asset_id}`,
                  sub: a.asset_code || undefined,
                  value: a.count,
                  href: a.asset_code
                    ? `/assets/${a.asset_code
                        .split("/")
                        .map(encodeURIComponent)
                        .join("/")}`
                    : undefined,
                }))}
              />
            </div>

            <div className="card flex h-full flex-col p-5 lg:col-span-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Rincian Status
              </h2>
              <BarList
                items={d.by_status.map((s) => ({
                  label: s.label,
                  value: s.count,
                }))}
              />
            </div>
          </div>

          {/* Approval queue + recent WO */}
          <div className="grid grid-cols-12 gap-4">
            <div className="card flex h-full flex-col p-5 lg:col-span-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Antrian Approval
              </h2>
              {approval.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : approval.isError ? (
                <p className="text-sm text-slate-500">
                  Tidak dapat memuat ringkasan approval.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {[
                    ["WO Approval", approval.data?.data?.wo_approvals, "/approval-center"],
                    ["WO Closing", approval.data?.data?.wo_closings, "/approval-center"],
                    ["Material Request", approval.data?.data?.materials, "/approval-center"],
                    ["Asset Mutation", approval.data?.data?.mutations, "/approval-center"],
                  ].map(([label, count, href]) => (
                    <li key={label as string}>
                      <Link
                        href={href as string}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100"
                      >
                        <span className="text-slate-600">{label}</span>
                        <span className="font-semibold text-slate-900">
                          {formatNumber((count as number) ?? 0)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card flex h-full flex-col p-5 lg:col-span-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Work Order Terbaru
                </h2>
                <Link
                  href="/work-orders"
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Semua
                </Link>
              </div>
              {recent.isLoading ? (
                <LoadingSkeleton rows={6} />
              ) : (
                <MiniTable
                  columns={[
                    { key: "wo_number", header: "No. WO" },
                    {
                      key: "title",
                      header: "Deskripsi",
                      render: (r) => pick(r, ["title", "description"]) || "-",
                    },
                    {
                      key: "module",
                      header: "Modul",
                      render: (r) =>
                        WO_MODULE_LABEL[
                          (r.module as string)?.toLowerCase() as keyof typeof WO_MODULE_LABEL
                        ] ?? r.module,
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (r) => <StatusBadge status={r.status as string} />,
                    },
                    {
                      key: "created_at",
                      header: "Tanggal",
                      align: "right",
                      render: (r) => formatDate(pick(r, ["created_at", "date"])),
                    },
                  ]}
                  rows={(recent.data?.data ?? []) as Array<Record<string, unknown>>}
                />
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            Angka mengikuti hak akses dan filter aktif. Diperbarui {formatDate(d.generated_at)} WIB.
          </p>
        </div>
      )}
    </PageContainer>
  );
}

type TrendMeaning = "positive" | "negative" | "neutral";

type EnterpriseMetric = {
  value: number | null;
  data_quality_status: string;
};

function ExecutiveMetric({
  icon: Icon,
  label,
  value,
  href,
  attention = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  href?: string | null;
  attention?: boolean;
}) {
  const content = (
    <div className="group flex min-h-28 items-center gap-3 px-5 py-4 transition hover:bg-slate-50/80">
      <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl border " + (attention ? "border-amber-200 bg-amber-50 text-amber-600" : "border-blue-200 bg-blue-50 text-blue-600")}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{typeof value === "number" ? formatNumber(value) : value}</p>
        <p className="truncate text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function metricValue(metric?: EnterpriseMetric): number | string {
  if (!metric || metric.value === null) return "N/M";
  return metric.value;
}

const DOMAIN_ICON = {
  asset: Boxes,
  maintenance: Wrench,
  sparepart: PackageSearch,
  fleet: CarFront,
  energy: Zap,
  governance: Landmark,
  ga: Building2,
};

function DomainHealth({
  domains,
}: {
  domains: NonNullable<DashboardData["enterprise"]>["domains"];
}) {
  return (
    <section className="card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Snapshot 7 Domain</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Hanya menampilkan angka yang sudah memiliki sumber data. Modul lain ditandai belum aktif, bukan nol.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {domains.map((domain) => {
          const Icon = DOMAIN_ICON[domain.key as keyof typeof DOMAIN_ICON] ?? Boxes;
          const available = domain.status === "available";
          const body = (
            <div className="h-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-brand-200 hover:bg-white">
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className={"grid h-8 w-8 place-items-center rounded-lg " + (available ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={"rounded-full px-2 py-0.5 text-[9px] font-semibold " + (available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {available ? "Aktif" : domain.status === "no_permission" ? "Terbatas" : "Belum aktif"}
                </span>
              </div>
              <p className="min-h-8 text-xs font-semibold leading-tight text-slate-800">{domain.label}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {domain.primary.value === null ? "N/M" : formatNumber(domain.primary.value)}
                {domain.primary.value !== null && domain.primary.unit ? <span className="ml-1 text-[10px] font-medium text-slate-500">{domain.primary.unit}</span> : null}
              </p>
              <p className="text-[10px] text-slate-500">{domain.primary.label}</p>
              {domain.secondary[0] ? (
                <p className="mt-2 truncate border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                  {domain.secondary[0].label}: {domain.secondary[0].value === null ? "N/M" : formatNumber(domain.secondary[0].value)}
                </p>
              ) : domain.note ? (
                <p className="mt-2 line-clamp-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">{domain.note}</p>
              ) : null}
            </div>
          );
          return domain.detail_route ? <Link key={domain.key} href={domain.detail_route}>{body}</Link> : <div key={domain.key}>{body}</div>;
        })}
      </div>
    </section>
  );
}

function deltaToneClass(pct: number, meaning: TrendMeaning): string {
  if (meaning === "neutral") return "text-slate-500";
  const isGood = meaning === "positive" ? pct >= 0 : pct < 0;
  return isGood ? "text-emerald-600" : "text-rose-600";
}

function DeltaLabel({
  pct,
  pctSuffix = "% vs periode sebelumnya",
  trendMeaning,
}: {
  pct: number;
  pctSuffix?: string;
  trendMeaning: TrendMeaning;
}) {
  return (
    <p className={"inline-flex items-center gap-0.5 text-[11px] font-medium " + deltaToneClass(pct, trendMeaning)}>
      {pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}
      {pctSuffix}
    </p>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  pct,
  pctSuffix = "% vs periode sebelumnya",
  trendMeaning = "positive",
  href,
  tone,
  size = "lg",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  pct?: number | null;
  /** Teks setelah angka delta, default "% vs periode sebelumnya". */
  pctSuffix?: string;
  /** Makna arah: "positive" = naik bagus, "negative" = naik buruk,
   * "neutral" = gak ada makna baik/buruk jelas → ditampilkan abu-abu. */
  trendMeaning?: TrendMeaning;
  href?: string;
  tone: "brand" | "amber" | "green" | "violet" | "rose";
  /** "sm" dipakai untuk strip KPI sekunder — lebih padat & gak menonjol. */
  size?: "lg" | "sm";
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
  }[tone];

  const body = (
    <div
      className={
        "card group flex h-full items-start gap-2.5 transition hover:shadow-md " +
        (size === "sm" ? "p-2.5" : "p-3.5")
      }
    >
      <span
        className={
          `grid shrink-0 place-items-center rounded-lg ${toneClass} ` +
          (size === "sm" ? "h-7 w-7" : "h-9 w-9")
        }
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-slate-500">{label}</p>
        <p className={size === "sm" ? "text-sm font-bold text-slate-900" : "text-lg font-bold text-slate-900"}>
          {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        </p>
        {sub ? (
          <p className="truncate text-[10px] text-slate-500">{sub}</p>
        ) : null}
        {pct !== null && pct !== undefined ? (
          <DeltaLabel pct={pct} pctSuffix={pctSuffix} trendMeaning={trendMeaning} />
        ) : null}
      </div>
      {href ? (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-brand-500" />
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Target belum ditampilkan sebelum KPI Engine menyediakan versi efektif. */
function PreventiveRatioKpi({
  ratio,
  deltaPts,
  preventive,
  corrective,
  trend,
}: {
  ratio: number | null;
  deltaPts: number | null;
  preventive: number;
  corrective: number;
  trend: { date: string; ratio: number | null }[];
}) {
  return (
    <div className="card flex h-full items-start gap-2.5 p-2.5 transition hover:shadow-md">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[11px] font-medium text-slate-500">Rasio Preventive</p>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-medium text-slate-500">
            target belum ditetapkan
          </span>
        </div>
        <p className="text-sm font-bold text-slate-900">
          {ratio === null ? "-" : <><AnimatedNumber value={ratio} />%</>}
        </p>
        <p className="truncate text-[10px] text-slate-500">
          {formatNumber(preventive)} PM vs {formatNumber(corrective)} CM
        </p>
        {deltaPts !== null ? (
          <DeltaLabel pct={deltaPts} pctSuffix=" poin" trendMeaning="positive" />
        ) : null}
      </div>
      <Sparkline
        data={trend}
        color={SEMANTIC_COLORS.success}
        width={44}
        height={24}
      />
    </div>
  );
}
