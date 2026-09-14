"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePreventiveCalendar } from "@/hooks/use-preventive-schedules";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import type { CalendarDay } from "@/types/preventive";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function HolidayCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data, isLoading, error, refetch } = usePreventiveCalendar(year);

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const d of data?.data ?? []) {
      if (d.date) map.set(d.date.slice(0, 10), d);
    }
    return map;
  }, [data]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [year, month]);

  const prev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Kalender Hari Libur / Non-Working Day
        </h3>
        <div className="flex items-center gap-1">
          <button className="btn-secondary h-8 px-2" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium text-slate-700">
            {MONTHS[month]} {year}
          </span>
          <button className="btn-secondary h-8 px-2" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {DOW.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const info = dayMap.get(key);
              const isHoliday =
                info?.is_holiday || info?.is_working_day === false;
              const dow = new Date(year, month, d).getDay();
              const weekend = dow === 0 || dow === 6;
              return (
                <div
                  key={i}
                  title={info?.label ?? undefined}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md border text-sm",
                    isHoliday
                      ? "border-rose-200 bg-rose-50 font-semibold text-rose-600"
                      : weekend
                        ? "border-slate-100 bg-slate-50 text-slate-400"
                        : "border-slate-100 text-slate-700",
                  )}
                >
                  {d}
                  {info?.label ? (
                    <span className="mt-0.5 line-clamp-1 px-1 text-[9px] leading-none text-rose-500">
                      {info.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-rose-200 bg-rose-50" /> Libur / non-working
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-slate-100 bg-slate-50" /> Akhir pekan
            </span>
          </div>
        </>
      )}
    </div>
  );
}
