"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PageMeta } from "@/types/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function Pagination({
  meta,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
}: {
  meta?: PageMeta;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
}) {
  const totalPages = meta?.total_pages ?? 1;
  const total = meta?.total;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = total !== undefined ? Math.min(page * perPage, total) : page * perPage;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span>
          {total !== undefined ? (
            <>
              Menampilkan <b>{formatNumber(from)}</b>–<b>{formatNumber(to)}</b> dari{" "}
              <b>{formatNumber(total)}</b>
            </>
          ) : (
            <>Halaman {page}</>
          )}
        </span>
        {onPerPageChange ? (
          <select
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / halaman
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn-secondary h-8 px-2"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`gap-${i}`} className="px-2 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                "h-8 min-w-8 rounded-md px-2 text-sm font-medium transition",
                p === page
                  ? "bg-brand-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="btn-secondary h-8 px-2"
          onClick={() => onPageChange(page + 1)}
          disabled={totalPages ? page >= totalPages : false}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function pageWindow(current: number, total: number): (number | "...")[] {
  if (!total || total <= 7) {
    return Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}
