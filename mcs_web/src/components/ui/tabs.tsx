"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = "underline",
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  variant?: "underline" | "pill";
}) {
  return (
    <div
      className={cn(
        variant === "underline"
          ? "flex gap-1 overflow-x-auto border-b border-slate-200"
          : "inline-flex gap-1 rounded-lg bg-slate-100 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-sm font-medium transition disabled:opacity-40",
              variant === "underline"
                ? active
                  ? "border-b-2 border-brand-600 text-brand-700"
                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
                : active
                  ? "rounded-md bg-white text-slate-900 shadow-sm"
                  : "rounded-md text-slate-500 hover:text-slate-800",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-600",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
