import ExcelJS from 'exceljs';
import { escapeHtml, htmlToPdf, reportPdfShell } from './pdf.js';

type Row = Record<string, unknown>;

function value(row: Row, key: string): string {
  return String(row[key] ?? '').trim();
}

function dateTime(input: unknown): string {
  if (!input) return '-';
  const parsed = input instanceof Date ? input : new Date(String(input));
  if (Number.isNaN(parsed.getTime())) return String(input);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(parsed);
}

function jsonArray<T = unknown>(input: unknown): T[] {
  if (Array.isArray(input)) return input as T[];
  try { const parsed = JSON.parse(String(input || '[]')); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  row.alignment = { vertical: 'middle' };
}

function styleTable(sheet: ExcelJS.Worksheet): void {
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: 'top', wrapText: true }; }));
}

export async function buildAiImageAnalysisExport(
  detail: Row,
  format: 'xlsx' | 'pdf',
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const fileBase = `AI-Analysis-${value(detail, 'analysis_number').replace(/[^a-z0-9_-]/gi, '-') || detail.id}`;
  const parameters = jsonArray<Row>(detail.values);
  const findings = jsonArray<Row>(detail.findings);
  const recommendations = jsonArray<string>(detail.recommendations);
  const products = jsonArray<Row>(detail.suggested_products);
  const materials = jsonArray<Row>(detail.required_materials);

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MCS AI Analyzer';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Ringkasan');
    summary.columns = [{ width: 24 }, { width: 90 }];
    [
      ['Nomor Analisis', value(detail, 'analysis_number')],
      ['Asset', `${value(detail, 'asset_code')} - ${value(detail, 'asset_name')}`],
      ['Aktivitas', value(detail, 'activity_name')],
      ['Status', value(detail, 'status')],
      ['Dibuat Oleh', value(detail, 'created_by') || '-'],
      ['Dibuat Pada', dateTime(detail.created_at)],
      ['Waktu Foto', dateTime(detail.captured_at)],
      ['Diverifikasi Oleh', value(detail, 'verified_by') || '-'],
      ['Acuan / Batas Normal', value(detail, 'reference_note') || '-'],
      ['Ringkasan Analisis', value(detail, 'analysis_summary') || '-'],
    ].forEach((row) => summary.addRow(row));
    summary.getColumn(1).font = { bold: true, color: { argb: 'FF334155' } };
    summary.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: 'top', wrapText: true }; }));

    const parameterSheet = workbook.addWorksheet('Parameter');
    parameterSheet.columns = [
      { header: 'No.', key: 'no', width: 7 }, { header: 'Bagian', key: 'section', width: 24 },
      { header: 'Parameter', key: 'parameter', width: 34 }, { header: 'Nilai Terbaca', key: 'text', width: 22 },
      { header: 'Nilai Numerik', key: 'numeric', width: 16 }, { header: 'Unit', key: 'unit', width: 12 },
      { header: 'Confidence', key: 'confidence', width: 14 }, { header: 'Penilaian', key: 'assessment', width: 16 },
      { header: 'Catatan', key: 'note', width: 46 },
    ];
    parameters.forEach((row, index) => parameterSheet.addRow({ no: index + 1, section: row.section_name,
      parameter: row.parameter_name, text: row.text_value, numeric: row.numeric_value, unit: row.unit,
      confidence: row.confidence == null ? '' : `${Math.round(Number(row.confidence) * 100)}%`,
      assessment: row.assessment, note: row.assessment_note }));
    styleTable(parameterSheet);

    const findingSheet = workbook.addWorksheet('Temuan & Rekomendasi');
    findingSheet.columns = [{ header: 'Jenis', key: 'type', width: 20 }, { header: 'Prioritas', key: 'severity', width: 14 },
      { header: 'Judul', key: 'title', width: 35 }, { header: 'Keterangan', key: 'description', width: 80 }];
    findings.forEach((row) => findingSheet.addRow({ type: 'Temuan', severity: row.severity, title: row.title, description: row.description }));
    recommendations.forEach((item, index) => findingSheet.addRow({ type: 'Rekomendasi', severity: '-', title: `Rekomendasi ${index + 1}`, description: item }));
    styleTable(findingSheet);

    const addItems = (name: string, rows: Row[]) => {
      const sheet = workbook.addWorksheet(name);
      sheet.columns = [{ header: 'No.', key: 'no', width: 7 }, { header: 'Item', key: 'item', width: 32 },
        { header: 'Spesifikasi', key: 'spec', width: 55 }, { header: 'Perkiraan Qty', key: 'qty', width: 16 },
        { header: 'Unit', key: 'unit', width: 12 }, { header: 'Prioritas', key: 'priority', width: 14 },
        { header: 'Alasan', key: 'reason', width: 70 }];
      rows.forEach((row, index) => sheet.addRow({ no: index + 1, item: row.item_name, spec: row.specification,
        qty: row.estimated_quantity, unit: row.unit, priority: row.priority, reason: row.reason }));
      styleTable(sheet);
    };
    addItems('Rekomendasi Produk', products);
    addItems('Kebutuhan Bahan Baku', materials);

    const ocr = workbook.addWorksheet('Teks OCR');
    ocr.columns = [{ width: 120 }];
    ocr.addRow(['Teks lengkap yang terbaca']); styleHeader(ocr.getRow(1));
    ocr.addRow([value(detail, 'raw_text') || '-']);
    ocr.getCell('A2').alignment = { vertical: 'top', wrapText: true };
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${fileBase}.xlsx` };
  }

  const rowsHtml = (items: Row[], empty: string) => items.length
    ? items.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.item_name)}</td><td>${escapeHtml(row.specification)}</td><td>${escapeHtml(row.estimated_quantity)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.priority)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join('')
    : `<tr><td colspan="6">${escapeHtml(empty)}</td></tr>`;
  const html = reportPdfShell('Hasil Analisis Gambar AI', `
    <h1>Hasil Analisis Gambar AI</h1>
    <div class="subtitle">${escapeHtml(value(detail, 'analysis_number'))} &middot; dibuat ${escapeHtml(dateTime(detail.created_at))}</div>
    <div class="summary"><div><b>Asset</b><br>${escapeHtml(value(detail, 'asset_code'))}<br>${escapeHtml(value(detail, 'asset_name'))}</div><div><b>Aktivitas</b><br>${escapeHtml(value(detail, 'activity_name'))}</div><div><b>Dibuat oleh</b><br>${escapeHtml(value(detail, 'created_by') || '-')}</div><div><b>Status</b><br>${escapeHtml(value(detail, 'status'))}</div></div>
    <h2>Ringkasan</h2><p>${escapeHtml(value(detail, 'analysis_summary') || '-')}</p>
    <h2>Parameter Hasil Pembacaan</h2>
    <table><thead><tr><th>No.</th><th>Bagian</th><th>Parameter</th><th>Nilai</th><th>Confidence</th><th>Penilaian</th><th>Catatan</th></tr></thead><tbody>${parameters.length ? parameters.map((row,index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.section_name)}</td><td>${escapeHtml(row.parameter_name)}</td><td>${escapeHtml(row.text_value)} ${escapeHtml(row.unit)}</td><td>${row.confidence == null ? '-' : `${Math.round(Number(row.confidence) * 100)}%`}</td><td>${escapeHtml(row.assessment)}</td><td>${escapeHtml(row.assessment_note)}</td></tr>`).join('') : '<tr><td colspan="7">Belum ada parameter.</td></tr>'}</tbody></table>
    <h2>Temuan</h2>${findings.length ? findings.map((row) => `<div class="box"><b>${escapeHtml(row.severity)} &middot; ${escapeHtml(row.title)}</b><br>${escapeHtml(row.description)}</div>`).join('') : '<p>Tidak ada temuan terstruktur.</p>'}
    <h2>Rekomendasi Tindakan</h2>${recommendations.length ? `<ol>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>` : '<p>Belum ada rekomendasi tindakan.</p>'}
    <h2>Rekomendasi Produk</h2><table><thead><tr><th>No.</th><th>Item</th><th>Spesifikasi</th><th>Qty</th><th>Prioritas</th><th>Alasan</th></tr></thead><tbody>${rowsHtml(products, 'Belum ada rekomendasi produk.')}</tbody></table>
    <h2>Kebutuhan Bahan Baku</h2><table><thead><tr><th>No.</th><th>Item</th><th>Spesifikasi</th><th>Qty</th><th>Prioritas</th><th>Alasan</th></tr></thead><tbody>${rowsHtml(materials, 'Belum ada kebutuhan bahan baku.')}</tbody></table>
    <h2>Teks OCR</h2><div class="ocr">${escapeHtml(value(detail, 'raw_text') || '-')}</div>
    <style>h2{font-size:13px;margin:16px 0 6px;color:#1e3a8a}.box{border:1px solid #ddd;border-left:3px solid #f59e0b;padding:7px;margin:5px 0;border-radius:3px}.ocr{white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:4px;line-height:1.4}p,li{line-height:1.45}</style>
  `);
  return { buffer: await htmlToPdf(html), contentType: 'application/pdf', fileName: `${fileBase}.pdf` };
}
