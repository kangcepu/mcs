"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingSkeleton } from "@/components/ui/states";
import { MiniTable } from "@/components/ui/detail";
import { Button } from "@/components/ui/primitives";
import {
  BarList,
  CHART_COLORS,
  Donut,
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

const BUCKET_COLORS = {
  open: CHART_COLORS[2]!,
  in_progress: CHART_COLORS[5]!,
  closed: CHART_COLORS[1]!,
  rejected: CHART_COLORS[3]!,
};

export default function DashboardPage() {
  const { data: user } = useMe();
  const [range, setRange] = useState(30);
  const q = useDashboard(range);
  const d = q.data?.data;

  const recent = useRecentWorkOrders(8);
  const approval = useApprovalSummaryCard();
  const approvalCount =
    (approval.data?.data?.wo_approvals ?? 0) +
    (approval.data?.data?.wo_closings ?? 0) +
    (approval.data?.data?.materials ?? 0) +
    (approval.data?.data?.mutations ?? 0);

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
            "space-y-4 transition-opacity " +
            (q.isFetching ? "opacity-60" : "opacity-100")
          }
        >
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Clock className="h-5 w-5" />}
              label={`Total WO (${range}h)`}
              value={formatNumber(d.totals.total)}
              pct={d.delta.total_pct}
              href="/work-orders"
              tone="brand"
            />
            <Kpi
              icon={<Loader2 className="h-5 w-5" />}
              label="Sedang Berjalan"
              value={formatNumber(d.totals.open + d.totals.in_progress)}
              sub={`${formatNumber(d.totals.open)} antre · ${formatNumber(
                d.totals.in_progress,
              )} dikerjakan`}
              href="/work-orders"
              tone="violet"
            />
            <Kpi
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Ditutup"
              value={formatNumber(d.totals.closed)}
              pct={d.delta.closed_pct}
              tone="green"
            />
            <Kpi
              icon={<BadgeCheck className="h-5 w-5" />}
              label="Menunggu Approval"
              value={approval.isLoading ? "…" : formatNumber(approvalCount)}
              href="/approval-center"
              tone="amber"
            />
          </div>

          {/* Tren + Status */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Tren Work Order
                </h2>
                <span className="text-xs text-slate-400">
                  {d.from} – {d.to}
                </span>
              </div>
              <TrendChart data={d.trend} />
            </div>

            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Komposisi Status
              </h2>
              <Donut
                centerValue={formatNumber(d.totals.total)}
                centerLabel="total"
                segments={[
                  { label: "Antre", value: d.totals.open, color: BUCKET_COLORS.open },
                  {
                    label: "Dikerjakan",
                    value: d.totals.in_progress,
                    color: BUCKET_COLORS.in_progress,
                  },
                  { label: "Ditutup", value: d.totals.closed, color: BUCKET_COLORS.closed },
                  {
                    label: "Ditolak/Void",
                    value: d.totals.rejected,
                    color: BUCKET_COLORS.rejected,
                  },
                ]}
              />
            </div>
          </div>

          {/* Modul + Aging + Company */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                WO per Modul
              </h2>
              <BarList
                color={CHART_COLORS[0]}
                items={d.by_module.map((m) => ({
                  label: m.label,
                  value: m.total,
                  sub: `${m.open + m.in_progress} aktif`,
                  href: `/work-orders?module=${m.module}`,
                }))}
              />
            </div>

            <div className="card p-5">
              <div className="mb-3 flex items-center gap-1.5">
                <TriangleAlert className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Umur WO Terbuka
                </h2>
              </div>
              <BarList
                color={CHART_COLORS[3]}
                items={d.aging.map((a) => ({ label: a.bucket, value: a.count }))}
              />
            </div>

            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                WO per Company
              </h2>
              <BarList
                color={CHART_COLORS[4]}
                items={d.by_company.map((c) => ({
                  label: c.company,
                  value: c.total,
                }))}
              />
            </div>
          </div>

          {/* Top assets + Status detail */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Aset Paling Sering WO
              </h2>
              <BarList
                color={CHART_COLORS[5]}
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

            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Rincian Status
              </h2>
              <BarList
                color={CHART_COLORS[7]}
                items={d.by_status.map((s) => ({
                  label: s.label,
                  value: s.count,
                }))}
              />
            </div>
          </div>

          {/* Approval queue + recent WO */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Antrian Approval
              </h2>
              {approval.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : approval.isError ? (
                <p className="text-sm text-slate-400">
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

            <div className="card p-5 lg:col-span-2">
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

          <p className="text-center text-[11px] text-slate-400">
            Angka mengikuti hak akses modul & divisi Anda. Diperbarui{" "}
            {formatDate(d.generated_at)}.
          </p>
        </div>
      )}
    </PageContainer>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  pct,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  pct?: number | null;
  href?: string;
  tone: "brand" | "amber" | "green" | "violet";
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];

  const body = (
    <div className="card group flex items-start gap-3 p-4 transition hover:shadow-md">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sub ? (
          <p className="truncate text-[11px] text-slate-400">{sub}</p>
        ) : pct !== null && pct !== undefined ? (
          <p
            className={
              "inline-flex items-center gap-0.5 text-[11px] font-medium " +
              (pct >= 0 ? "text-emerald-600" : "text-rose-600")
            }
          >
            {pct >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(pct)}% vs periode sebelumnya
          </p>
        ) : null}
      </div>
      {href ? (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand-500" />
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
