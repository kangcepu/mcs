/**
 * Export ke Excel tanpa dependency — menulis sebuah HTML `<table>` dengan
 * ekstensi .xls + MIME `application/vnd.ms-excel`. Excel/LibreOffice membukanya
 * sebagai spreadsheet asli (kolom rapi, teks tetap teks).
 */

import type { ReportCol } from "@/lib/report-columns";

function esc(v: unknown): string {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
  );
}

function cell(col: ReportCol, row: Record<string, unknown>): string {
  if (col.render) return col.render(row) ?? "";
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function exportToExcel(
  filename: string,
  columns: ReportCol[],
  rows: Array<Record<string, unknown>>,
  opts?: { title?: string; meta?: { label: string; value: string }[] },
): void {
  const head = `<tr>${columns
    .map(
      (c) =>
        `<th style="background:#e5edf5;border:1px solid #94a3b8;font-weight:700;padding:4px 6px;text-align:left">${esc(
          c.header,
        )}</th>`,
    )
    .join("")}</tr>`;

  const body = rows
    .map(
      (r) =>
        `<tr>${columns
          .map(
            (c) =>
              `<td style="border:1px solid #cbd5e1;padding:3px 6px;mso-number-format:'\\@'">${esc(
                cell(c, r),
              )}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  const titleRow = opts?.title
    ? `<tr><td colspan="${columns.length}" style="font-size:15px;font-weight:800;padding:4px 0">${esc(
        opts.title,
      )}</td></tr>`
    : "";
  const metaRows = (opts?.meta ?? [])
    .map(
      (m) =>
        `<tr><td style="font-weight:700">${esc(m.label)}</td><td colspan="${
          columns.length - 1
        }">${esc(m.value)}</td></tr>`,
    )
    .join("");
  const spacer = titleRow || metaRows ? `<tr><td colspan="${columns.length}"></td></tr>` : "";

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"></head><body>` +
    `<table border="1">${titleRow}${metaRows}${spacer}${head}${body}</table>` +
    `</body></html>`;

  const blob = new Blob(["﻿" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
