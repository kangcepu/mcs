"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, DecimalInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useMaterialUsageMutations } from "@/hooks/use-material-usage";
import type { ConfirmPurchaseRow } from "@/lib/api/material-usage";
import { ApiError } from "@/types/api";
import { dash, pick } from "@/lib/display";
import { formatQty, parseDecimal } from "@/lib/format";

export function ConfirmUsageModal({
  open,
  onClose,
  requestId,
  woNumber,
  jobExecutor,
  requestCode,
  purchase,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string | number;
  woNumber: string;
  jobExecutor: string;
  requestCode: string;
  purchase: Array<Record<string, unknown>>;
}) {
  const toast = useToast();
  const { confirm } = useMaterialUsageMutations(requestId);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const r: Record<string, string> = {};
    const u: Record<string, string> = {};
    for (const p of purchase) {
      const key = String(pick(p, ["part"]) || "");
      const rv = p.material_receive ?? p.material_receive_prc ?? p.purchase_request ?? "";
      const uv = p.material_usage_prc ?? p.material_usage ?? "";
      r[key] = rv === null || rv === undefined ? "" : String(rv);
      u[key] = uv === null || uv === undefined ? "" : String(uv);
    }
    setRecv(r);
    setUsage(u);
  }, [open, purchase]);

  const submit = async () => {
    const rows: ConfirmPurchaseRow[] = [];
    for (const p of purchase) {
      const part = String(pick(p, ["part"]) || "");
      if (!part) continue;
      const receive = parseDecimal(recv[part] || "0");
      const used = parseDecimal(usage[part] || "0");
      if (Number.isNaN(receive) || receive < 0 || Number.isNaN(used) || used < 0) {
        toast.warning("Nilai tidak valid", `Periksa nilai untuk ${part}.`);
        return;
      }
      rows.push({
        part_prc: part,
        material_receive_prc: receive,
        material_usage_prc: used,
        uom_prc: String(pick(p, ["uom", "uom_purchase", "uom_request"]) || "PCS"),
      });
    }
    try {
      await confirm.mutateAsync({
        wo_number: woNumber,
        job_executor: jobExecutor || "-",
        request_code: requestCode,
        purchase_rows: rows,
      });
      toast.success("Material usage dikonfirmasi & ditutup");
      onClose();
    } catch (e) {
      toast.error("Gagal konfirmasi", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Konfirmasi Material Usage"
      description="Menutup permintaan material (status menjadi CLOSED). Pastikan penerimaan & pemakaian purchase item sudah benar."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={confirm.isPending}>
            Konfirmasi &amp; Tutup
          </Button>
        </>
      }
    >
      {purchase.length === 0 ? (
        <p className="text-sm text-slate-600">
          Tidak ada purchase item. Konfirmasi akan langsung menutup permintaan
          material ini.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Part</th>
                <th className="px-3 py-2 text-right font-semibold">PR</th>
                <th className="px-3 py-2 text-right font-semibold">Receive</th>
                <th className="px-3 py-2 text-right font-semibold">Usage</th>
              </tr>
            </thead>
            <tbody>
              {purchase.map((p, i) => {
                const part = String(pick(p, ["part"]) || `row-${i}`);
                return (
                  <tr key={part} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">
                      {dash(pick(p, ["part"]))}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatQty(p.purchase_request as number)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DecimalInput
                        className="ml-auto h-8 w-24 text-right"
                        value={recv[part] ?? ""}
                        onValueChange={(val) =>
                          setRecv((v) => ({ ...v, [part]: val }))
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DecimalInput
                        className="ml-auto h-8 w-24 text-right"
                        value={usage[part] ?? ""}
                        onValueChange={(val) =>
                          setUsage((v) => ({ ...v, [part]: val }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
