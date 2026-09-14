import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dash } from "@/lib/display";

export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm text-slate-800">
            {item.value === undefined || item.value === null || item.value === ""
              ? "-"
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabel sederhana dari array objek dengan mapping kolom. */
export function MiniTable({
  columns,
  rows,
  emptyText = "Tidak ada data.",
}: {
  columns: { key: string; header: string; render?: (row: Record<string, unknown>) => ReactNode; align?: "left" | "right" }[];
  rows: Array<Record<string, unknown>> | undefined;
  emptyText?: string;
}) {
  if (!rows || rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 font-semibold",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2 text-slate-700",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.render ? c.render(row) : dash(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({
  entries,
}: {
  entries: Array<{
    title: ReactNode;
    meta?: ReactNode;
    body?: ReactNode;
  }>;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        Belum ada riwayat.
      </p>
    );
  }
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-5">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">{e.title}</p>
            {e.meta ? <span className="text-xs text-slate-400">{e.meta}</span> : null}
          </div>
          {e.body ? <div className="mt-1 text-sm text-slate-600">{e.body}</div> : null}
        </li>
      ))}
    </ol>
  );
}
