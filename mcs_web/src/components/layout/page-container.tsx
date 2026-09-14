"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSetPageHeader } from "@/components/layout/page-header-context";

export function PageContainer({
  title,
  description,
  actions,
  breadcrumb,
  headerTitle,
  headerSubtitle,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** Judul string untuk top bar bila `title` berupa JSX. */
  headerTitle?: string;
  headerSubtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  const barTitle =
    headerTitle ?? (typeof title === "string" ? title : undefined);
  const barSubtitle =
    headerSubtitle ?? (typeof description === "string" ? description : undefined);
  useSetPageHeader(barTitle, barSubtitle);

  /**
   * Judul & sub-judul yang berupa string sudah tampil di top bar, jadi tidak
   * diulang di area konten. Judul berupa JSX (mis. dengan status badge) tetap
   * dirender di konten karena tidak muat di top bar.
   */
  const titleIsNode = title != null && typeof title !== "string";
  const showContentTitle = titleIsNode;
  const showContentDesc = titleIsNode && Boolean(description);
  const showHeadingRow = showContentTitle || showContentDesc || Boolean(actions);

  return (
    <div className={cn("mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6", className)}>
      {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}

      {showHeadingRow ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {showContentTitle ? (
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
            ) : null}
            {showContentDesc ? (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>
          ) : null}
        </div>
      ) : null}

      <div className="animate-fade-in space-y-4">{children}</div>
    </div>
  );
}
