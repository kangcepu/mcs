"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, DecimalInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useMaterialUsageMutations } from "@/hooks/use-material-usage";
import type { UsageRow } from "@/lib/api/material-usage";
import { ApiError } from "@/types/api";
import { dash, pick } from "@/lib/display";
import { formatQty, parseDecimal } from "@/lib/format";

export function SetUsageModal({
  open,
  onClose,
  requestId,
  woNumber,
  jobExecutor,
  requestCode,
  parts,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string | number;
  woNumber: string;
  jobExecutor: string;
  requestCode: string;
  parts: Array<Record<string, unknown>>;
}) {
  const toast = useToast();
  const { setUsage } = useMaterialUsageMutations(requestId);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const p of parts) {
      const id = String(p.id ?? "");
      const cur = p.material_usage ?? p.material_request ?? "";
      init[id] = cur === null || cur === undefined ? "" : String(cur);
    }
    setValues(init);
  }, [open, parts]);

  const submit = async () => {
    const rows: UsageRow[] = [];
    for (const p of parts) {
      const id = p.id as number | string;
      const usage = parseDecimal(values[String(id)]);
      const req = Number(p.material_request ?? 0);
      if (Number.isNaN(usage) || usage < 0) {
        toast.warning("Nilai tidak valid", `Pemakaian untuk ${pick(p, ["part"])} tidak valid.`);
        return;
      }
      if (req > 0 && usage > req) {
        toast.warning(
          "Melebihi request",
          `Pemakaian ${pick(p, ["part"])} (${usage}) melebihi qty request (${req}).`,
        );
        return;
      }
      rows.push({
        id,
        material_usage: usage,
        uom: String(pick(p, ["uom_request", "uom"]) || "PCS"),
      });
    }
    try {
      await setUsage.mutateAsync({
        wo_number: woNumber,
        job_executor: jobExecutor || "-",
        request_code: requestCode,
        rows,
      });
      toast.success("Pemakaian material disimpan");
      onClose();
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Isi Pemakaian Material"
      description="Masukkan qty yang benar-benar dipakai. Boleh lebih kecil dari qty request."
    >
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Part</th>
              <th className="px-3 py-2 text-right font-semibold">Qty Request</th>
              <th className="px-3 py-2 text-right font-semibold">Qty Pemakaian</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  Belum ada part. Pilih part dulu.
                </td>
              </tr>
            ) : (
              parts.map((p, i) => {
                const id = String(p.id ?? i);
                return (
                  <tr key={id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">
                      {dash(pick(p, ["part", "part_name"]))}
                      {pick(p, ["erp_item_code"]) ? (
                        <span className="ml-1 text-xs text-slate-400">
                          ({pick(p, ["erp_item_code"])})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatQty(p.material_request as number)}{" "}
                      {pick(p, ["uom_request", "uom"])}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DecimalInput
                        className="ml-auto h-8 w-24 text-right"
                        value={values[id] ?? ""}
                        onValueChange={(val) =>
                          setValues((v) => ({ ...v, [id]: val }))
                        }
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={submit} loading={setUsage.isPending} disabled={parts.length === 0}>
          Simpan Pemakaian
        </Button>
      </div>
    </Modal>
  );
}
