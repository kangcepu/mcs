"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";

interface AreaCoverage {
  key: string;
  label: string;
  required: number;
  scheduled: number;
  missing: number;
  coverage_percent: number;
}

export function PreventiveMissingNotice({
  scope,
  audience,
  missing,
  required,
  scheduled,
  areas = [],
  onReview,
}: {
  scope: "dashboard" | "my-work";
  audience: string | number | null | undefined;
  missing: number;
  required?: number;
  scheduled?: number;
  areas?: AreaCoverage[];
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(
    () => `mcs:preventive-missing:${scope}:${String(audience ?? "anonymous")}:${missing}`,
    [audience, missing, scope],
  );

  useEffect(() => {
    if (missing <= 0) return;
    if (sessionStorage.getItem(storageKey) === "seen") return;
    setOpen(true);
  }, [missing, storageKey]);

  const dismiss = () => {
    sessionStorage.setItem(storageKey, "seen");
    setOpen(false);
  };

  if (missing <= 0) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      centered
      size="md"
      title="Asset Maintenance belum terjadwal"
      description="Perlu ditindaklanjuti agar seluruh asset Maintenance memiliki preventive schedule aktif."
      footer={
        <>
          <Button variant="secondary" onClick={dismiss}>Nanti</Button>
          <Button onClick={() => { dismiss(); onReview(); }}>Lihat Daftar Asset</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
          <CalendarX2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm leading-6">
            Ada <strong>{formatNumber(missing)} asset aktif</strong> di area Maintenance Anda yang belum mempunyai jadwal preventive aktif.
            {required !== undefined && scheduled !== undefined
              ? ` ${formatNumber(scheduled)} dari ${formatNumber(required)} asset sudah terjadwal.`
              : ""}
          </p>
        </div>

        {areas.length ? (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {areas.filter((area) => area.missing > 0).map((area) => (
              <div key={area.key} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                <span className="font-medium text-slate-700">{area.label}</span>
                <span className="tabular-nums text-slate-500">
                  <strong className="text-amber-700">{formatNumber(area.missing)}</strong> belum terjadwal
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
