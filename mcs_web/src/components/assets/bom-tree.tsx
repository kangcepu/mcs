"use client";

import { Package } from "lucide-react";
import { dash, pick } from "@/lib/display";

type BomRow = Record<string, unknown>;

/**
 * Menampilkan Parts / BOM dari `tb_parts_bom` (baris flat dengan kolom
 * `level`, `parent`, `part`, `header`, `qty_on_hand`, `uom`). Baris dengan
 * `header` tidak kosong ditampilkan sebagai grup, sisanya sebagai part,
 * di-indent sesuai `level`.
 */
export function BomTree({ items }: { items: BomRow[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        Belum ada data Parts / BOM.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map((row, i) => {
        const level = Math.max(0, Number(row.level ?? row.lvl ?? 1) - 1);
        const header = pick(row, ["header", "group", "kategori"]);
        const part = pick(row, ["part", "part_name", "part_code", "nama_part"]);
        const qty = row.qty_on_hand ?? row.qty ?? row.quantity;
        const uom = pick(row, ["uom", "satuan"]);
        const isHeader = header !== "" && part === "";

        return (
          <li
            key={(row.id_nested as string) ?? (row.id as string) ?? i}
            className={
              isHeader
                ? "flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-700"
                : "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
            }
            style={{ paddingLeft: level * 18 + 8 }}
          >
            {isHeader ? (
              <span className="text-slate-400">{header}</span>
            ) : (
              <>
                <Package className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="font-medium text-slate-800">
                  {dash(part || header)}
                </span>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-500">
                  {qty !== undefined && qty !== null && qty !== ""
                    ? `${qty} ${uom}`.trim()
                    : ""}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
