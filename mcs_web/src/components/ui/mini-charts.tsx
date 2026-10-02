"use client";

/**
 * Chart mini tanpa dependency — semua SVG/CSS murni, ringan.
 * Dipakai di Dashboard.
 */

import { useId } from "react";
import { ChevronRight } from "lucide-react";

/** Warna semantik — dipakai konsisten untuk makna (bukan dekorasi). */
export const SEMANTIC_COLORS = {
  brand: "#1b54e0",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#e11d48",
  neutral: "#94a3b8",
};

/** Satu hue (brand blue) dengan gradasi tone — dipakai untuk data kategori
 * (modul, company, asset) supaya palet gak jadi pelangi tanpa makna. */
const BRAND_SHADES = ["#1642b8", "#1b54e0", "#2f72f7", "#5998ff", "#8ebdff", "#bcd7ff"];

/** Gradasi severity hijau→kuning→merah — dipakai untuk bucket umur WO. */
export const SEVERITY_COLORS = ["#16a34a", "#eab308", "#f97316", "#ef4444"];

export function shadeForRank(i: number, n: number): string {
  if (n <= 1) return BRAND_SHADES[1]!;
  const idx = Math.round((i / Math.max(1, n - 1)) * (BRAND_SHADES.length - 1));
  return BRAND_SHADES[idx]!;
}

/* ------------------------------------------------------------------ */
/*  TrendChart — area/line dua seri (dibuat vs ditutup)               */
/* ------------------------------------------------------------------ */

export function TrendChart({
  data,
  height = 160,
}: {
  data: { date: string; created: number; closed: number; closed_corrective: number }[];
  height?: number;
}) {
  const gid = useId().replace(/[:]/g, "");
  const w = 640;
  const h = height;
  const pad = { t: 8, r: 8, b: 18, l: 26 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const n = Math.max(data.length, 1);
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.closed)));
  // CM Selesai dapat skala sendiri (nilainya jauh lebih kecil dari
  // dibuat/ditutup) — kalau dipaksa satu skala, garisnya kegencet rata di
  // bawah dan gak kebaca bentuk trennya. Sama seperti versi mobile.
  const maxCorrective = Math.max(1, ...data.map((d) => d.closed_corrective));

  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const yC = (v: number) => pad.t + ih - (v / maxCorrective) * ih;

  const path = (key: "created" | "closed") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = (key: "created" | "closed") =>
    `${path(key)} L${x(n - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  const correctivePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yC(d.closed_corrective).toFixed(1)}`)
    .join(" ");

  const ticks = [0, Math.round(max / 2), max];
  // Semua titik dapat label selama masih kebaca (<=10 titik, mis. default 7
  // hari) — baru di-thin kalau datanya padat (30/90 hari) biar gak numpuk.
  const labelEvery = n <= 10 ? 1 : Math.ceil(n / 8);

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEMANTIC_COLORS.brand} stopOpacity="0.20" />
            <stop offset="100%" stopColor={SEMANTIC_COLORS.brand} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              className="text-slate-100"
              strokeWidth={1}
            />
            <text x={0} y={y(t) + 3} className="fill-slate-500 text-[9px]">
              {t}
            </text>
          </g>
        ))}
        {/* `key` dibikin dari data biar grup ini remount tiap data berubah
            (range filter ganti / realtime push) — path SVG gak bisa di-tween
            CSS langsung, jadi animasinya lewat fade+slide masuk tiap re-render. */}
        <g
          key={data.map((d) => `${d.date}:${d.created}:${d.closed}:${d.closed_corrective}`).join("|")}
          className="animate-fade-in"
        >
          <path d={area("created")} fill={`url(#g-${gid})`} />
          <path d={path("created")} fill="none" stroke={SEMANTIC_COLORS.brand} strokeWidth={2} />
          <path
            d={path("closed")}
            fill="none"
            stroke={SEMANTIC_COLORS.success}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <path d={correctivePath} fill="none" stroke={SEMANTIC_COLORS.warning} strokeWidth={1.75} />
        </g>
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          // Label ujung kiri/kanan dianchor ke dalam (bukan "middle") supaya
          // gak kepotong tepi viewBox — ini sumber "label terpotong" lama.
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          return (
            <text key={d.date} x={x(i)} y={h - 4} textAnchor={anchor} className="fill-slate-500 text-[9px]">
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <Legend color={SEMANTIC_COLORS.brand} label="Dibuat" />
        <Legend color={SEMANTIC_COLORS.success} label="Ditutup" dashed />
        <Legend color={SEMANTIC_COLORS.warning} label="CM Selesai" />
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  StackedBar — satu bar horizontal proporsional (komposisi status)   */
/*  Ganti Donut untuk kasus status: kategori kecil (Antre, Ditolak)    */
/*  tetap kebaca lewat legenda, gak ilang jadi irisan donut tipis.     */
/* ------------------------------------------------------------------ */

export function StackedBar({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-3">
      {(centerValue !== undefined || centerLabel) && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-slate-900">{centerValue}</span>
          {centerLabel ? <span className="text-xs text-slate-500">{centerLabel}</span> : null}
        </div>
      )}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className="h-full transition-[flex-basis] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
                  style={{ flex: `0 0 ${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value}`}
                />
              ))
          : null}
      </div>
      <ul className="space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">{s.value}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "-"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline — garis kecil tanpa sumbu, untuk tren ringkas di KPI     */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  color = SEMANTIC_COLORS.success,
  target,
  height = 28,
  width = 96,
}: {
  data: { ratio: number | null }[];
  color?: string;
  /** Garis target putus-putus, misal 90 untuk "target 90%". */
  target?: number;
  height?: number;
  width?: number;
}) {
  const points = data.filter((d): d is { ratio: number } => d.ratio !== null);
  if (points.length < 2) return null;

  const pad = 2;
  const iw = width - pad * 2;
  const ih = height - pad * 2;
  const min = Math.min(...points.map((p) => p.ratio), target ?? 100);
  const max = Math.max(...points.map((p) => p.ratio), target ?? 0);
  const range = Math.max(1, max - min);

  const x = (i: number) => pad + (i / (points.length - 1)) * iw;
  const y = (v: number) => pad + ih - ((v - min) / range) * ih;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      {target !== undefined ? (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(target)}
          y2={y(target)}
          stroke="currentColor"
          className="text-slate-300"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ) : null}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.ratio)} r={2} fill={color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  BarList — bar horizontal (CSS)                                    */
/* ------------------------------------------------------------------ */

export function BarList({
  items,
  color,
  formatValue,
}: {
  items: { label: string; value: number; href?: string; sub?: string; color?: string }[];
  /** Warna tunggal untuk semua bar. Kalau dikosongkan, tiap bar dapat tone
   * gradasi brand otomatis berdasarkan rank (satu hue, beda tone) — dipakai
   * untuk data kategori (modul/company/asset) biar palet gak jadi pelangi. */
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-500">Tidak ada data.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const barColor = it.color ?? color ?? shadeForRank(i, items.length);
        const inner = (
          <>
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-600">
                {it.label}
                {it.sub ? <span className="ml-1 text-slate-500">{it.sub}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums text-slate-800">
                {formatValue ? formatValue(it.value) : it.value}
                {it.href ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${(it.value / max) * 100}%`, background: barColor }}
              />
            </div>
          </>
        );
        return (
          <li key={`${it.label}-${i}`}>
            {it.href ? (
              <a href={it.href} className="group block rounded p-1 -m-1 hover:bg-slate-50">
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  DailyStatusBars — mini kartu per hari (Selesai/Dikerjakan/Belum)   */
/*  Dibikin jadi kotak kecil berbatas + angka % tegas biar tetap enak  */
/*  dibaca sekilas, bukan cuma garis tipis yang kelewat halus.         */
/* ------------------------------------------------------------------ */

export function DailyStatusBars({
  data,
}: {
  data: {
    date: string;
    closed_pct: number;
    in_progress_pct: number;
    open_pct: number;
    total: number;
  }[];
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {data.map((d) => (
        <div
          key={d.date}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center"
          title={
            d.total > 0
              ? `${d.date} — Selesai ${d.closed_pct}% · Dikerjakan ${d.in_progress_pct}% · Belum ${d.open_pct}%`
              : `${d.date} — tidak ada WO preventive`
          }
        >
          <p className="text-sm font-bold tabular-nums text-slate-800">
            {d.total > 0 ? `${Math.round(d.closed_pct)}%` : "-"}
          </p>
          <div className="my-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
            {d.total > 0 ? (
              <>
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{ width: `${d.closed_pct}%`, background: SEMANTIC_COLORS.success }}
                />
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{ width: `${d.in_progress_pct}%`, background: SEMANTIC_COLORS.brand }}
                />
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{ width: `${d.open_pct}%`, background: SEMANTIC_COLORS.warning }}
                />
              </>
            ) : null}
          </div>
          <p className="text-[10px] text-slate-500">{d.date.slice(5)}</p>
        </div>
      ))}
    </div>
  );
}
