"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Droplets, Fuel, Gauge, RefreshCw, Timer, Zap } from "lucide-react";
import { Button, Select } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadEnergyReport, getEnergyMonitoring } from "@/lib/api/energy";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import type { EnergyMonitoringFilters, EnergyTrendPoint } from "@/types/energy";

function initialDates(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

const METRICS = {
  electricity: { label: "Konsumsi listrik", unit: "kWh", color: "#2563eb" },
  water: { label: "Konsumsi air", unit: "m³", color: "#0891b2" },
  genset_kwh: { label: "Produksi genset", unit: "kWh", color: "#7c3aed" },
  genset_fuel: { label: "Fuel genset", unit: "liter", color: "#d97706" },
  fuel_in: { label: "Fuel masuk", unit: "liter", color: "#059669" },
  fuel_out: { label: "Fuel keluar", unit: "liter", color: "#e11d48" },
} as const;

type MetricKey = keyof typeof METRICS;

function TrendChart({ data, metric }: { data: EnergyTrendPoint[]; metric: MetricKey }) {
  const config = METRICS[metric];
  const width = 820;
  const height = 270;
  const left = 58;
  const right = 20;
  const top = 20;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = data.map((item) => Number(item[metric] ?? 0));
  const maximum = Math.max(1, ...values);
  const points = data.map((item, index) => {
    const x = left + (data.length <= 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = top + plotHeight - (Number(item[metric] ?? 0) / maximum) * plotHeight;
    return { x, y, value: Number(item[metric] ?? 0), date: item.date };
  });
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  if (!data.length) return <EmptyState title="Belum ada tren" description="Belum ada transaksi terkunci pada periode yang dipilih." className="py-10" />;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px]" role="img" aria-labelledby="energy-chart-title energy-chart-description">
        <title id="energy-chart-title">{config.label}</title>
        <desc id="energy-chart-description">Tren harian {config.label.toLowerCase()} dalam {config.unit}.</desc>
        {[0, 1, 2, 3, 4].map((step) => {
          const y = top + (step / 4) * plotHeight;
          const value = maximum - (step / 4) * maximum;
          return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" /><text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{formatQty(value)}</text></g>;
        })}
        <line x1={left} x2={left} y1={top} y2={top + plotHeight} stroke="#94a3b8" />
        <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke="#94a3b8" />
        {points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={config.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {points.map((point, index) => <g key={`${point.date}-${index}`}><circle cx={point.x} cy={point.y} r="4" fill="white" stroke={config.color} strokeWidth="2"><title>{formatDate(point.date)}: {formatQty(point.value)} {config.unit}</title></circle>{(index % labelEvery === 0 || index === points.length - 1) ? <text x={point.x} y={height - 18} textAnchor="middle" fontSize="11" fill="#64748b">{new Date(point.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</text> : null}</g>)}
        <text x={width - right} y={13} textAnchor="end" fontSize="11" fill="#64748b">{config.unit}</text>
      </svg>
    </div>
  );
}

export function EnergyMonitoringPanel() {
  const dates = useMemo(initialDates, []);
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState(dates.from);
  const [dateTo, setDateTo] = useState(dates.to);
  const [company, setCompany] = useState("");
  const [metric, setMetric] = useState<MetricKey>("electricity");
  const [exporting, setExporting] = useState(false);
  const filters: EnergyMonitoringFilters = { date_from: dateFrom, date_to: dateTo, company };
  const query = useQuery({ queryKey: ["energy-monitoring", filters], queryFn: ({ signal }) => getEnergyMonitoring(filters, signal) });
  const data = query.data?.data;

  const exportReport = async () => {
    setExporting(true);
    try {
      const result = await downloadEnergyReport(filters);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Laporan Energy berhasil diexport", result.fileName);
    } catch (error) { toast.error("Export laporan gagal", error instanceof Error ? error.message : undefined); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500"><span>Dari</span><input type="date" className="h-9 bg-transparent text-sm text-slate-700 outline-none" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500"><span>Sampai</span><input type="date" className="h-9 bg-transparent text-sm text-slate-700 outline-none" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} /></label>
        <Select className="h-10 w-auto min-w-[170px]" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">Semua company</option>{(data?.filters.companies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
        <div className="ml-auto flex gap-2"><Button variant="secondary" onClick={() => query.refetch()} aria-label="Muat ulang monitoring"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button><Button loading={exporting} onClick={exportReport}><Download className="h-4 w-4" /> Export Excel</Button></div>
      </div>

      {query.isLoading ? <LoadingSkeleton rows={8} /> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : data ? <>
        <section className="card overflow-hidden" aria-label="Ringkasan Energy">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
            <SummaryItem icon={Zap} label="Listrik" value={data.summary.electricity_consumption} unit="kWh" />
            <SummaryItem icon={Droplets} label="Air" value={data.summary.water_consumption} unit="m³" />
            <SummaryItem icon={Gauge} label="Produksi genset" value={data.summary.genset_generated_kwh} unit="kWh" />
            <SummaryItem icon={Timer} label="Operasi genset" value={data.summary.genset_operating_hours} unit="jam" />
          </div>
          <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
            <SummaryItem icon={Fuel} label="Fuel genset" value={data.summary.genset_fuel_liter} unit="L" />
            <SummaryItem icon={Fuel} label="Stok fuel" value={data.summary.total_fuel_stock_liter} unit="L" />
            <SummaryItem icon={CheckCircle2} label="Menunggu approval" value={data.summary.pending_approvals} unit="transaksi" warning={data.summary.pending_approvals > 0} />
            <SummaryItem icon={AlertTriangle} label="Peringatan" value={data.summary.alerts} unit="item" warning={data.summary.alerts > 0} />
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Tren penggunaan</h2><p className="mt-1 text-xs text-slate-500">Data harian dari transaksi yang telah dikunci atau disetujui.</p></div><Select className="w-auto min-w-[190px]" value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>{Object.entries(METRICS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</Select></div>
          <div className="p-4"><TrendChart data={data.trend} metric={metric} /></div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(480px,1.25fr)]">
          <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Peringatan operasional</h2><p className="mt-1 text-xs text-slate-500">Rollover, kenaikan konsumsi di atas 50%, dan stok minimum.</p></div><div className="max-h-[430px] overflow-y-auto p-4">{!data.alerts.length ? <EmptyState title="Tidak ada peringatan" description="Tidak ditemukan rollover, anomali, atau stok minimum pada data saat ini." className="py-9" /> : <div className="space-y-2">{data.alerts.map((alert, index) => <div key={`${alert.kind}-${alert.asset_code}-${index}`} className={`rounded-lg border p-3 ${alert.severity === "critical" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`text-sm font-semibold ${alert.severity === "critical" ? "text-rose-900" : "text-amber-900"}`}>{alert.asset_name}</p><p className={`text-xs ${alert.severity === "critical" ? "text-rose-700" : "text-amber-700"}`}>{alert.asset_code} · {alert.kind.replace("_", " ")}</p></div><span className={`shrink-0 text-xs ${alert.severity === "critical" ? "text-rose-700" : "text-amber-700"}`}>{alert.occurred_at ? formatDateTime(alert.occurred_at) : "Saat ini"}</span></div><p className={`mt-2 text-sm ${alert.severity === "critical" ? "text-rose-800" : "text-amber-800"}`}>{alert.message}</p></div>)}</div>}</div></section>
          <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Saldo Fuel Tank</h2><p className="mt-1 text-xs text-slate-500">Saldo berjalan dari transaksi yang telah disetujui.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2.5">Tank</th><th className="px-4 py-2.5">Company / Lokasi</th><th className="px-4 py-2.5 text-right">Saldo</th><th className="px-4 py-2.5 text-right">Kapasitas</th><th className="px-4 py-2.5">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{data.tanks.map((tank) => { const balance = Number(tank.current_balance_liter); const minimum = tank.minimum_level_liter == null ? null : Number(tank.minimum_level_liter); const low = minimum !== null && balance <= minimum; return <tr key={tank.id}><td className="px-4 py-3"><p className="font-medium text-slate-800">{tank.AssetName}</p><p className="text-xs text-slate-400">{tank.tank_number || tank.AssetCode}</p></td><td className="px-4 py-3"><p>{tank.CompanyName || "-"}</p><p className="text-xs text-slate-400">{tank.LocationAsset || "-"}</p></td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${low ? "text-rose-700" : "text-slate-800"}`}>{formatQty(balance)} L</td><td className="px-4 py-3 text-right tabular-nums">{formatQty(tank.capacity_liter)} L</td><td className="px-4 py-3">{low ? <span className="font-medium text-rose-700">Minimum</span> : <span className="text-emerald-700">Normal</span>}</td></tr>; })}</tbody></table>{!data.tanks.length ? <div className="p-4"><EmptyState title="Belum ada fuel tank" description="Tambahkan profil Fuel Tank untuk menampilkan saldo." className="py-8" /></div> : null}</div></section>
        </div>
      </> : null}
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value, unit, warning = false }: { icon: typeof Zap; label: string; value: number; unit: string; warning?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3 px-4 py-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${warning ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500">{label}</p><p className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${warning ? "text-amber-800" : "text-slate-900"}`}>{formatQty(value)} <span className="text-xs font-medium text-slate-500">{unit}</span></p></div></div>;
}
