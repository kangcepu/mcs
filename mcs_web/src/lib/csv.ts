/** Ekspor array objek ke file CSV (client-side) menggunakan data yang diberikan. */
export function exportToCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: { key: string; header: string }[],
): void {
  if (rows.length === 0) return;

  const cols =
    columns ??
    Object.keys(rows[0]!).map((k) => ({ key: k, header: k }));

  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = cols.map((c) => escape(c.header)).join(",");
  const body = rows
    .map((row) => cols.map((c) => escape(row[c.key])).join(","))
    .join("\n");

  const blob = new Blob([`﻿${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Ambil daftar kolom dari kumpulan baris (union semua key). */
export function inferColumns(
  rows: Array<Record<string, unknown>>,
): { key: string; header: string }[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 25)) {
    Object.keys(row).forEach((k) => keys.add(k));
  }
  return Array.from(keys).map((k) => ({
    key: k,
    header: k
      .replace(/([a-z\d])([A-Z])/g, "$1 $2") // camelCase / PascalCase
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}
