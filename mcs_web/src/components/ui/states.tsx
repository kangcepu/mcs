"use client";

import { AlertTriangle, Inbox, RefreshCw, Lock } from "lucide-react";
import { ApiError } from "@/types/api";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-11"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-fade-in-fast overflow-hidden rounded-xl border border-slate-200">
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-3 flex-1 !rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-100 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-3.5 flex-1 !rounded"
              style={{ animationDelay: `${(r * cols + c) * 25}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title = "Tidak ada data",
  description = "Belum ada data yang cocok dengan filter saat ini.",
  action,
  icon,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-white p-3 text-slate-400 shadow-sm">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const isForbidden = error instanceof ApiError && error.status === 403;
  const message =
    error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-white p-3 text-rose-500 shadow-sm">
        {isForbidden ? <Lock className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
      </div>
      <p className="text-sm font-semibold text-slate-800">
        {isForbidden ? "Akses Ditolak" : "Gagal memuat data"}
      </p>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && !isForbidden ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}
