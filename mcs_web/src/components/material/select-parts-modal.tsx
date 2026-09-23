"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, DecimalInput, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useErpPartSearch, useMaterialUsageMutations } from "@/hooks/use-material-usage";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { parseDecimal } from "@/lib/format";
import type { ErpPartHit, SelectPartItem } from "@/lib/api/material-usage";
import { ApiError } from "@/types/api";

interface Row {
  key: string;
  part_name: string;
  qty: string;
  uom: string;
  pr_number: string;
  erp?: ErpPartHit;
}

const newRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  part_name: "",
  qty: "",
  uom: "PCS",
  pr_number: "",
});

export function SelectPartsModal({
  open,
  onClose,
  requestId,
  company,
  requesterNote,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string | number;
  company: string;
  requesterNote?: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const { select } = useMaterialUsageMutations(requestId);
  const isGsu = company.toUpperCase().includes("GSU") || company.toUpperCase().includes("GANDA SARIBU");

  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [erpQuery, setErpQuery] = useState("");
  const debouncedErp = useDebouncedValue(erpQuery, 300);
  const erp = useErpPartSearch(company, debouncedErp);

  useEffect(() => {
    if (!open) return;
    setRows([newRow()]);
    setActiveKey(null);
    setErpQuery("");
  }, [open]);

  const patch = (key: string, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const pickErp = (key: string, hit: ErpPartHit) => {
    patch(key, {
      part_name: hit.part_name,
      uom: hit.uom || "PCS",
      erp: hit,
    });
    setActiveKey(null);
    setErpQuery("");
  };

  const submit = async () => {
    const items: SelectPartItem[] = [];
    for (const r of rows) {
      const qty = parseDecimal(r.qty);
      if (!r.part_name.trim() || !(qty > 0)) {
        toast.warning("Lengkapi data", "Setiap baris wajib mengisi nama part dan qty > 0.");
        return;
      }
      if (isGsu && (!r.erp || !r.erp.item_id)) {
        toast.warning(
          "Part ERP wajib",
          `Untuk company GSU, part "${r.part_name}" harus dipilih dari daftar ERP.`,
        );
        return;
      }
      items.push({
        part_name: r.part_name.trim(),
        qty,
        uom: r.uom.trim() || "PCS",
        pr_number: r.pr_number.trim() || undefined,
        erp_company: r.erp?.company || (isGsu ? "GSU" : ""),
        erp_item_id: r.erp?.item_id ?? undefined,
        erp_item_code: r.erp?.item_code || undefined,
        erp_uom_level: r.erp?.uom_level ?? undefined,
        erp_warehouse_id: 7,
      });
    }
    try {
      await select.mutateAsync({ id: requestId, items });
      toast.success("Part berhasil dipilih");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="Pilih Part untuk Request"
      description={
        requesterNote
          ? `Pemohon: ${requesterNote}`
          : isGsu
            ? "Company GSU — part wajib dipilih dari master ERP."
            : "Isi nama part, qty request, dan UOM."
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_90px_80px_120px_36px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Part (ERP UC/RU/GSU)</span>
          <span>Qty Request</span>
          <span>UOM</span>
          <span>No. PR</span>
          <span />
        </div>

        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[1fr_90px_80px_120px_36px] items-start gap-2"
          >
            <div className="relative">
              <Input
                value={r.part_name}
                onChange={(e) => {
                  patch(r.key, { part_name: e.target.value, erp: undefined });
                  setErpQuery(e.target.value);
                  setActiveKey(r.key);
                }}
                onFocus={() => {
                  if (r.part_name.trim().length >= 2) {
                    setErpQuery(r.part_name);
                    setActiveKey(r.key);
                  }
                }}
                placeholder="Cari nama part di semua ERP…"
                autoComplete="off"
              />
              {r.erp?.item_code ? (
                <span className="mt-0.5 block text-[10px] text-emerald-600">
                  ERP: {r.erp.item_code}
                </span>
              ) : null}
              {activeKey === r.key && debouncedErp.trim().length >= 2 ? (
                <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {erp.isLoading ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Mencari di ERP…</p>
                  ) : (erp.data?.data ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">
                      {erp.isError
                        ? "ERP tidak dapat dihubungi."
                        : "Tidak ada item ERP cocok."}
                    </p>
                  ) : (
                    (erp.data?.data ?? []).map((hit, i) => (
                      <button
                        key={(hit.item_code || hit.part_name || i) + "-" + i}
                        type="button"
                        onClick={() => pickErp(r.key, hit)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-brand-50/60"
                      >
                        <span className="text-sm font-medium text-slate-800">
                          {hit.part_name || "-"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {hit.company ? `${hit.company} · ` : ""}
                          {hit.item_code ? `${hit.item_code} · ` : ""}
                          {hit.uom || "PCS"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <DecimalInput
              value={r.qty}
              onValueChange={(v) => patch(r.key, { qty: v })}
              placeholder="mis. 0,5"
            />
            <Input
              value={r.uom}
              onChange={(e) => patch(r.key, { uom: e.target.value })}
            />
            <Input
              value={r.pr_number}
              onChange={(e) => patch(r.key, { pr_number: e.target.value })}
              placeholder="opsional"
            />
            <button
              type="button"
              onClick={() =>
                setRows((prev) =>
                  prev.length > 1 ? prev.filter((x) => x.key !== r.key) : prev,
                )
              }
              disabled={rows.length <= 1}
              className="mt-1 grid place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2 text-xs"
          onClick={() => setRows((prev) => [...prev, newRow()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah part
        </Button>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={submit} loading={select.isPending}>
          Simpan Part
        </Button>
      </div>
    </Modal>
  );
}
