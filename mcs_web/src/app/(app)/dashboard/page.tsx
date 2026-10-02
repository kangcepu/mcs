"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  FolderKanban,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
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

const RANGES = [
  { value: 7, label: "7 hari" },
  { value: 14, label: "14 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
];

/** Target rasio preventive — placeholder, belum bisa diatur per-perusahaan. */
const PREVENTIVE_RATIO_TARGET = 90;

export default function DashboardPage() {
  const { data: user } = useMe();
  const [range, setRange] = useState(7);
  const q = useDashboard(range);
  const d = q.data?.data;

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
      title={`Selamat datang, ${user?.fullname?.split(" ")[0] ?? "Pengguna"}`}
      description="Ringkasan aktivitas Work Order sesuai hak akses Anda."
      actions={
        <div className="flex items-center gap-2">
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
          {/* KPI utama — metrik actionable yang perlu perhatian/tindakan
              sekarang, bukan sekadar angka historis. Dibuat padat (size sm)
              biar 2 baris x 4 kartu gak makan banyak ruang. */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Kpi
              size="sm"
              icon={<BadgeCheck className="h-4 w-4" />}
              label="Menunggu Approval"
              value={approval.isLoading ? "…" : approvalCount}
              href="/approval-center"
              tone="amber"
            />
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
              icon={<Loader2 className="h-4 w-4" />}
              label="Sedang Berjalan"
              value={d.totals.open + d.totals.in_progress}
              sub={`${formatNumber(d.totals.open)} antre · ${formatNumber(
                d.totals.in_progress,
              )} dikerjakan`}
              href="/work-orders"
              tone="violet"
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
          </div>

          {/* Strip sekunder — konteks volume + kualitas kerja, gak untuk
              ditindak langsung. Baris kedua, kartu sama padat & sejajar
              dengan baris KPI utama di atas. */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
            <Kpi
              size="sm"
              icon={<Wrench className="h-4 w-4" />}
              label="WO Corrective"
              value={d.by_type.corrective}
              pct={d.by_type.corrective_pct}
              trendMeaning="negative"
              sub="Makin sedikit makin baik"
              tone="amber"
            />
            <Kpi
              size="sm"
              icon={<FolderKanban className="h-4 w-4" />}
              label="WO Project"
              value={d.by_type.project}
              pct={d.by_type.project_pct}
              trendMeaning="neutral"
              tone="violet"
            />
            <PreventiveRatioKpi
              ratio={d.by_type.preventive_ratio}
              deltaPts={d.by_type.preventive_ratio_delta_pts}
              preventive={d.by_type.preventive}
              corrective={d.by_type.corrective}
              trend={d.by_type.ratio_trend}
            />
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
            Angka mengikuti hak akses modul & divisi Anda. Diperbarui{" "}
            {formatDate(d.generated_at)}.
          </p>
        </div>
      )}
    </PageContainer>
  );
}

type TrendMeaning = "positive" | "negative" | "neutral";

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

/** Kartu Rasio Preventive versi padat — dipaksa muat di grid 4 kolom yang
 * sama dengan KPI lain (bukan strip memanjang), termasuk sparkline mini
 * & badge target. */
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
            target {PREVENTIVE_RATIO_TARGET}%
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
        target={PREVENTIVE_RATIO_TARGET}
        color={SEMANTIC_COLORS.success}
        width={44}
        height={24}
      />
    </div>
  );
}
