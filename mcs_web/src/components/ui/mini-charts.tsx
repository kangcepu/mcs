"use client";

/**
 * Chart mini tanpa dependency — semua SVG/CSS murni, ringan.
 * Dipakai di Dashboard.
 */

import { useId } from "react";

export const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

/* ------------------------------------------------------------------ */
/*  TrendChart — area/line dua seri (dibuat vs ditutup)               */
/* ------------------------------------------------------------------ */

export function TrendChart({
  data,
  height = 160,
}: {
  data: { date: string; created: number; closed: number }[];
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

  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const path = (key: "created" | "closed") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = (key: "created" | "closed") =>
    `${path(key)} L${x(n - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.ceil(n / 6);

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity="0.20" />
            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity="0" />
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
            <text x={0} y={y(t) + 3} className="fill-slate-400 text-[9px]">
              {t}
            </text>
          </g>
        ))}
        <path d={area("created")} fill={`url(#g-${gid})`} />
        <path d={path("created")} fill="none" stroke={CHART_COLORS[0]} strokeWidth={2} />
        <path
          d={path("closed")}
          fill="none"
          stroke={CHART_COLORS[1]}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={h - 4}
              textAnchor="middle"
              className="fill-slate-400 text-[9px]"
            >
              {d.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-xs text-slate-500">
        <Legend color={CHART_COLORS[0]!} label="Dibuat" />
        <Legend color={CHART_COLORS[1]!} label="Ditutup" dashed />
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
/*  Donut — proporsi (status / modul)                                 */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 132,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color?: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="#f1f5f9" strokeWidth={12} />
          {total > 0 &&
            segments.map((seg, i) => {
              const frac = seg.value / total;
              const dash = frac * c;
              const el = (
                <circle
                  key={seg.label}
                  r={r}
                  fill="none"
                  stroke={seg.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={12}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += dash;
              return el;
            })}
        </g>
        {(centerValue !== undefined || centerLabel) && (
          <text textAnchor="middle" x={size / 2} y={size / 2 - 2} className="fill-slate-900 text-lg font-bold">
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text textAnchor="middle" x={size / 2} y={size / 2 + 13} className="fill-slate-400 text-[10px]">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {segments.map((seg, i) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: seg.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-600">{seg.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BarList — bar horizontal (CSS)                                    */
/* ------------------------------------------------------------------ */

export function BarList({
  items,
  color = CHART_COLORS[0],
  formatValue,
}: {
  items: { label: string; value: number; href?: string; sub?: string }[];
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">Tidak ada data.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const inner = (
          <>
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-600">
                {it.label}
                {it.sub ? <span className="ml-1 text-slate-400">{it.sub}</span> : null}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                {formatValue ? formatValue(it.value) : it.value}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${(it.value / max) * 100}%`, background: color }}
              />
            </div>
          </>
        );
        return (
          <li key={`${it.label}-${i}`}>
            {it.href ? (
              <a href={it.href} className="block rounded p-1 -m-1 hover:bg-slate-50">
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
