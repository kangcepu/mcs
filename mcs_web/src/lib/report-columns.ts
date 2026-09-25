/**
 * Preset kolom terkurasi per jenis report — supaya tabel di layar & PDF ringkas
 * dan terbaca (bukan dump semua field mentah).
 */

import { statusLabel } from "@/components/ui/status-badge";

export interface ReportCol {
  key: string;
  header: string;
  /** Lebar kolom untuk PDF (table-layout: fixed). Kosong = auto/flex. */
  width?: string;
  /** Perataan sel. */
  align?: "left" | "right" | "center";
  /** Nilai teks final (override raw). */
  render?: (row: Record<string, unknown>) => string;
}

/* ---------------- helpers ---------------- */

function pickStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return "";
}

export function fmtDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s === "0000-00-00" || s.startsWith("0000")) return "";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s.startsWith("0000")) return "";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return (
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  );
}

export function humanizeStatus(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return statusLabel(s);
}

function activeLabel(row: Record<string, unknown>): string {
  const v = row.active ?? row.is_active ?? row.status;
  if (v === true || v === 1 || v === "1") return "Aktif";
  const s = String(v ?? "").toLowerCase();
  if (s === "active" || s === "aktif") return "Aktif";
  if (s === "inactive" || s === "nonaktif" || s === "0" || v === false) return "Nonaktif";
  return s ? s : "-";
}

/* ---------------- presets ---------------- */

/** Versi lengkap (10 kolom) — cocok untuk A4 landscape bila diperlukan. */
export const WO_COLS_LANDSCAPE: ReportCol[] = [
  { key: "wo_number", header: "No. WO", width: "26mm" },
  { key: "date", header: "Tanggal", width: "18mm", render: (r) => fmtDate(r.date) },
  {
    key: "module",
    header: "Modul",
    width: "20mm",
    render: (r) => pickStr(r, ["module_label", "module"]).toUpperCase(),
  },
  {
    key: "asset",
    header: "Aset",
    width: "42mm",
    render: (r) => {
      const name = pickStr(r, ["asset_name", "AssetName"]);
      const code = pickStr(r, ["asset_code", "AssetCode"]);
      return [name, code].filter(Boolean).join("\n");
    },
  },
  { key: "job_title", header: "Pekerjaan", render: (r) => pickStr(r, ["job_title", "title"]) },
  { key: "type_wo", header: "Tipe", width: "24mm" },
  { key: "priority", header: "Prioritas", width: "16mm" },
  { key: "status", header: "Status", width: "30mm", render: (r) => humanizeStatus(r.status) },
  { key: "pic", header: "PIC / Exec", width: "20mm", render: (r) => pickStr(r, ["pic", "job_executor"]) },
  { key: "company", header: "Company", width: "18mm" },
];

/** Versi ringkas untuk A4 portrait (lebar guna ~190mm). */
const WO_COLS_PORTRAIT: ReportCol[] = [
  { key: "wo_number", header: "No. WO", width: "27mm" },
  { key: "date", header: "Tgl", width: "17mm", render: (r) => fmtDate(r.date) },
  {
    key: "asset",
    header: "Aset",
    width: "36mm",
    render: (r) => {
      const name = pickStr(r, ["asset_name", "AssetName"]);
      const code = pickStr(r, ["asset_code", "AssetCode"]);
      return [name, code].filter(Boolean).join("\n");
    },
  },
  { key: "job_title", header: "Pekerjaan", render: (r) => pickStr(r, ["job_title", "title"]) },
  { key: "type_wo", header: "Tipe", width: "20mm" },
  { key: "status", header: "Status", width: "28mm", render: (r) => humanizeStatus(r.status) },
  { key: "pic", header: "PIC", width: "16mm", render: (r) => pickStr(r, ["pic", "job_executor"]) },
];

const ASSET_COLS: ReportCol[] = [
  { key: "AssetCode", header: "Kode Aset", width: "34mm", render: (r) => pickStr(r, ["AssetCode", "asset_code"]) },
  { key: "AssetName", header: "Nama Aset", render: (r) => pickStr(r, ["AssetName", "asset_name"]) },
  { key: "AliasName", header: "Alias", width: "28mm", render: (r) => pickStr(r, ["AliasName", "alias_name"]) },
  { key: "brand", header: "Merk", width: "24mm", render: (r) => pickStr(r, ["brand", "Brand"]) },
  { key: "CompanyName", header: "Company", width: "26mm", render: (r) => pickStr(r, ["CompanyName", "company"]) },
  { key: "LocationAsset", header: "Lokasi", width: "30mm", render: (r) => pickStr(r, ["LocationAsset", "location"]) },
  { key: "CategoryAsset", header: "Kategori", width: "30mm", render: (r) => pickStr(r, ["CategoryAsset", "category"]) },
  { key: "active", header: "Status", width: "18mm", align: "center", render: activeLabel },
];

const SO_COLS: ReportCol[] = [
  { key: "no_so", header: "No. SO", width: "40mm" },
  { key: "tanggal", header: "Tanggal", width: "24mm", render: (r) => fmtDate(r.tanggal) },
  { key: "type", header: "Tipe", width: "20mm" },
  {
    key: "asset",
    header: "Aset (cek / total)",
    width: "30mm",
    align: "center",
    render: (r) => `${Number(r.asset_checked ?? 0)} / ${Number(r.asset_total ?? 0)}`,
  },
  {
    key: "bom",
    header: "BOM (cek / total)",
    width: "30mm",
    align: "center",
    render: (r) => `${Number(r.bom_checked ?? 0)} / ${Number(r.bom_total ?? 0)}`,
  },
  { key: "locked_date", header: "Tgl Kunci", width: "24mm", render: (r) => fmtDate(r.locked_date) },
];

const ASSET_HISTORY_COLS: ReportCol[] = [
  { key: "wo_number", header: "No. WO", width: "30mm" },
  { key: "date", header: "Tanggal", width: "20mm", render: (r) => fmtDate(r.date) },
  {
    key: "asset",
    header: "Aset",
    width: "34mm",
    render: (r) => {
      const name = pickStr(r, ["asset_name", "AssetName"]);
      const code = pickStr(r, ["asset_code", "AssetCode"]);
      return [name, code].filter(Boolean).join("\n");
    },
  },
  { key: "job_title", header: "Pekerjaan" },
  { key: "type_wo", header: "Tipe", width: "26mm" },
  { key: "status", header: "Status", width: "30mm", render: (r) => humanizeStatus(r.status) },
  { key: "pic", header: "PIC", width: "22mm", render: (r) => pickStr(r, ["pic", "job_executor"]) },
  { key: "company", header: "Company", width: "22mm" },
];

export const REPORT_COLUMN_PRESETS: Record<
  string,
  { columns: ReportCol[]; orientation: "portrait" | "landscape" }
> = {
  "recap-work-orders": { columns: WO_COLS_PORTRAIT, orientation: "portrait" },
  assets: { columns: ASSET_COLS, orientation: "landscape" },
  "list-of-assets": { columns: ASSET_COLS, orientation: "landscape" },
  "stock-opname": { columns: SO_COLS, orientation: "portrait" },
  "assets-history": { columns: ASSET_HISTORY_COLS, orientation: "landscape" },
};
