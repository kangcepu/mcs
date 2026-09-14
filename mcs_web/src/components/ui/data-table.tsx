"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/ui/states";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Render sel. Jika tidak diisi, tampilkan `row[key]`. */
  cell?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  rowKey: (row: T, index: number) => string | number;
  isLoading?: boolean;
  /** Refetch di latar belakang (data lama masih tampil) — beri isyarat halus. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Konten tambahan di atas tabel (mis. bulk actions). */
  toolbar?: ReactNode;
  stickyHeader?: boolean;
  className?: string;
}

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  isFetching,
  error,
  onRetry,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbar,
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="card p-4">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return <TableSkeleton cols={columns.length} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="card p-4">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className={cn("card animate-fade-in-fast overflow-hidden", className)}>
      {toolbar ? (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">{toolbar}</div>
      ) : null}
      <div
        className={cn(
          "overflow-x-auto transition-opacity duration-200",
          isFetching && "pointer-events-none opacity-60",
        )}
      >
        <table className="w-full border-collapse text-sm">
          <thead
            className={cn(
              "bg-slate-50 text-xs uppercase tracking-wide text-slate-500",
              stickyHeader && "sticky top-0 z-10",
            )}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold",
                    ALIGN[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-slate-100 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-brand-50/40",
                )}
              >
                {columns.map((col) => {
                  const content = col.cell
                    ? col.cell(row, i)
                    : ((row as Record<string, unknown>)[col.key] as ReactNode) ?? "-";
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 align-middle text-slate-700",
                        ALIGN[col.align ?? "left"],
                        col.className,
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
