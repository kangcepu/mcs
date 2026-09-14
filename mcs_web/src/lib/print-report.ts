/**
 * Cetak / ekspor PDF laporan tabular — tanpa dependency.
 *
 * Paginasi berbasis PENGUKURAN: semua baris dirender tersembunyi dulu, tinggi
 * tiap baris diukur, lalu dipak ke halaman sampai penuh baru pindah halaman —
 * jadi tiap halaman A4 terisi penuh (tidak ada area kosong besar), dan jumlah
 * halaman diketahui sehingga bisa ada nomor halaman + footer per halaman.
 * `@page{margin:0}` menyembunyikan header/footer bawaan browser.
 */

import type { ReportCol } from "@/lib/report-columns";

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  columns: ReportCol[];
  rows: Array<Record<string, unknown>>;
  orientation?: "portrait" | "landscape";
  /** Nama pencetak → footer kiri-bawah. */
  printedBy?: string;
}

function esc(v: unknown): string {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}
function cellText(col: ReportCol, row: Record<string, unknown>): string {
  if (col.render) return col.render(row) ?? "";
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
/** String literal JS aman (termasuk untuk di dalam <script>). */
function jsStr(v: string): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

export function printReportPdf(opts: PrintReportOptions): void {
  const {
    title,
    subtitle,
    meta = [],
    columns,
    rows,
    orientation = "portrait",
    printedBy,
  } = opts;

  const landscape = orientation === "landscape";
  const pageWmm = landscape ? 297 : 210;
  const now = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const footerRight = `Dicetak ${now} · ${rows.length} baris`;

  const colgroupHTML = `<colgroup><col style="width:9mm">${columns
    .map((c) => `<col${c.width ? ` style="width:${c.width}"` : ""}>`)
    .join("")}</colgroup>`;
  const theadHTML = `<tr><th class="n">#</th>${columns
    .map((c) => `<th${c.align ? ` class="a-${c.align}"` : ""}>${esc(c.header)}</th>`)
    .join("")}</tr>`;

  const allRowsHTML =
    rows.length === 0
      ? `<tr><td class="empty" colspan="${columns.length + 1}">Tidak ada data.</td></tr>`
      : rows
          .map(
            (r, i) =>
              `<tr><td class="n">${i + 1}</td>${columns
                .map(
                  (c) =>
                    `<td${c.align ? ` class="a-${c.align}"` : ""}>${esc(
                      cellText(c, r),
                    ).replace(/\n/g, "<br>")}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("");

  const metaHTML = meta.length
    ? `<div class="meta">${meta
        .map((m) => `<span><b>${esc(m.label)}</b>${esc(m.value)}</span>`)
        .join("")}</div>`
    : "";
  const headHTML =
    `<h1 class="doc-title">${esc(title)}</h1>` +
    (subtitle ? `<div class="doc-sub">${esc(subtitle)}</div>` : "") +
    metaHTML;

  const script = `
(function () {
  var MM = 96 / 25.4;
  var PAGE_H_MM = ${landscape ? 210 : 297};
  var PAD_MM = 11 + 9;                 // padding atas + bawah .page
  var PRINTED_BY = ${jsStr(printedBy || "-")};
  var FOOTER_R = ${jsStr(footerRight)};
  var COLGROUP = ${jsStr(colgroupHTML)};
  var THEAD = ${jsStr("<tr>" + theadHTML.replace(/^<tr>|<\/tr>$/g, "") + "</tr>")};
  var NCOL = ${columns.length + 1};

  var src = document.getElementById("src");
  var head = src.querySelector(".pg-head");
  var probe = src.querySelector("table.probe");
  var thead = probe.querySelector("thead");
  var rows = [].slice.call(probe.querySelectorAll("tbody > tr"));

  var headH = head ? head.getBoundingClientRect().height : 0;
  var theadH = thead.getBoundingClientRect().height;
  var footerH = 9 * MM;               // perkiraan tinggi footer + garis
  var contentH = PAGE_H_MM * MM - PAD_MM * MM;
  var availFirst = contentH - headH - theadH - footerH - 8;
  var availRest = contentH - theadH - footerH - 8;

  var pages = [];
  var cur = [], acc = 0, avail = availFirst;
  for (var i = 0; i < rows.length; i++) {
    var h = rows[i].getBoundingClientRect().height;
    if (cur.length && acc + h > avail) {
      pages.push(cur); cur = []; acc = 0; avail = availRest;
    }
    cur.push(i); acc += h;
  }
  if (cur.length || rows.length === 0) pages.push(cur);
  var total = pages.length || 1;

  var root = document.getElementById("root");
  for (var p = 0; p < pages.length; p++) {
    var sec = document.createElement("section");
    sec.className = "page";
    var html = "";
    if (p === 0 && head) html += '<div class="pg-head">' + head.innerHTML + "</div>";
    html += "<table>" + COLGROUP + "<thead>" + THEAD + "</thead><tbody></tbody></table>";
    html +=
      '<div class="page-footer"><span class="f-l">Dicetak oleh: ' + PRINTED_BY +
      '</span><span class="f-c">Halaman ' + (p + 1) + " / " + total +
      '</span><span class="f-r">' + FOOTER_R + "</span></div>";
    sec.innerHTML = html;
    var tb = sec.querySelector("tbody");
    if (!pages[p].length) {
      tb.innerHTML = '<tr><td class="empty" colspan="' + NCOL + '">Tidak ada data.</td></tr>';
    } else {
      for (var k = 0; k < pages[p].length; k++) tb.appendChild(rows[pages[p][k]].cloneNode(true));
    }
    root.appendChild(sec);
  }
  src.parentNode.removeChild(src);
  setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 300);
})();
`;

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 8.4px/1.35 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact;
    background: #e2e8f0;
  }
  .page {
    background: #fff; margin: 0 auto 8px;
    padding: 11mm 10mm 9mm;
    width: ${pageWmm}mm;
    overflow: hidden;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; margin-bottom: 0; }

  .pg-head { margin-bottom: 5px; }
  .doc-title { font-size: 15px; font-weight: 800; margin: 0; text-align: center; letter-spacing: -0.01em; }
  .doc-sub { text-align: center; color: #64748b; font-size: 9px; margin: 1px 0 6px; }
  .meta {
    display: flex; flex-wrap: wrap; gap: 3px 10px; justify-content: center;
    border: 0.5px solid #cbd5e1; border-radius: 3px;
    padding: 4px 8px; margin: 5px 0 0; font-size: 8px; color: #334155;
  }
  .meta span { white-space: nowrap; }
  .meta b { color: #0f172a; margin-right: 3px; font-weight: 700; }
  .meta b::after { content: ":"; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th, td {
    border: 0.4px solid #cbd5e1; padding: 2.5px 4px;
    text-align: left; vertical-align: top;
    overflow-wrap: anywhere; word-break: normal; hyphens: auto;
  }
  thead th {
    background: #eef2f7; font-weight: 700; font-size: 7.6px;
    text-transform: uppercase; letter-spacing: 0.02em; color: #1e293b;
  }
  tbody tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.n, th.n { text-align: right; color: #94a3b8; }
  td.empty { text-align: center; color: #94a3b8; padding: 24px; }
  .a-right { text-align: right; }
  .a-center { text-align: center; }

  .page-footer {
    display: flex; align-items: baseline;
    margin-top: 7px; padding-top: 3px;
    border-top: 0.5px solid #e2e8f0;
    font-size: 7px; color: #94a3b8;
  }
  .page-footer .f-l { flex: 1; text-align: left; }
  .page-footer .f-c { flex: 1; text-align: center; }
  .page-footer .f-r { flex: 1; text-align: right; }

  #src { position: absolute; left: -99999px; top: 0; visibility: hidden; width: ${pageWmm}mm; }
  #src .page-mock { padding: 11mm 10mm 0; }

  .toolbar { position: sticky; top: 0; z-index: 2; background: #e2e8f0; padding: 8px 10mm; }
  .toolbar button {
    font: inherit; padding: 5px 14px; border: 1px solid #2563eb;
    background: #2563eb; color: #fff; border-radius: 5px; cursor: pointer;
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { margin: 0; }
  }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
<div id="root"></div>
<div id="src"><div class="page-mock">
  <div class="pg-head">${headHTML}</div>
  <table class="probe">${colgroupHTML}<thead>${theadHTML}</thead><tbody>${allRowsHTML}</tbody></table>
</div></div>
<script>${script}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    // eslint-disable-next-line no-alert
    alert("Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
