import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

type Row = Record<string, unknown>;

function value(row: Row, key: string): string {
  return String(row[key] ?? '').trim();
}

function pdfText(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '?')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

export function cleanAiOcrText(input: unknown): string {
  const source = String(input ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...');
  const cleaned = source.split('\n').map((line) => line.split(/\s+/).map((token) => {
    const unusualOriginal = (token.match(/[^\x20-\x7E\u00B0\u00B1\u00B5]/g) ?? []).length;
    if (unusualOriginal >= 1) return '[bagian tidak terbaca]';
    const suspicious = (token.match(/[^A-Za-z0-9.,:;/%+\-=()\[\]#°µ]/g) ?? []).length;
    return suspicious >= 3 || /[?¡¿¤¦¨´¸`~]/.test(token) || /^\^+$/.test(token)
      ? '[bagian tidak terbaca]' : token;
  }).join(' ')).join('\n').replace(/(?:\[bagian tidak terbaca\]\s*){2,}/g, '[bagian tidak terbaca] ').trim();
  return pdfText(cleaned);
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

function buildNativePdf(detail: Row, parameters: Row[], findings: Row[], recommendations: string[],
  products: Row[], materials: Row[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true,
      info: { Title: 'Hasil Analisis Gambar AI', Author: 'MCS' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 80;
    const ensure = (height: number) => { if (doc.y + height > doc.page.height - 45) doc.addPage(); };
    const heading = (title: string) => {
      ensure(34);
      doc.x = 40;
      doc.moveDown(0.7);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1D4ED8').text(title, 40, doc.y, { width });
      doc.moveDown(0.35).strokeColor('#BFDBFE').lineWidth(1).moveTo(40, doc.y).lineTo(40 + width, doc.y).stroke();
      doc.moveDown(0.45).fillColor('#1F2937');
    };
    const paragraph = (text: unknown, options: PDFKit.Mixins.TextOptions = {}) => {
      const content = pdfText(text) || '-';
      ensure(doc.heightOfString(content, { width, ...options }) + 8);
      doc.font('Helvetica').fontSize(9.5).fillColor('#334155')
        .text(content, 40, doc.y, { width, lineGap: 2, ...options });
    };
    const itemCards = (items: Row[], empty: string) => {
      if (!items.length) { paragraph(empty); return; }
      items.forEach((item, index) => {
        const title = `${index + 1}. ${value(item, 'item_name') || '-'}`;
        const spec = value(item, 'specification') || '-';
        const qty = `${value(item, 'estimated_quantity') || '-'} ${value(item, 'unit')}`.trim();
        const priority = value(item, 'priority') || 'MEDIUM';
        const reason = value(item, 'reason') || '-';
        const height = Math.max(55, doc.heightOfString(`${spec}\n${reason}`, { width: width - 24 }) + 42);
        ensure(height + 6);
        const top = doc.y;
        doc.roundedRect(40, top, width, height, 4).fillAndStroke('#F8FAFC', '#CBD5E1');
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(pdfText(title), 50, top + 9, { width: width - 160 });
        doc.fillColor('#1D4ED8').fontSize(8).text(pdfText(`${priority}  |  Qty: ${qty}`), 40 + width - 150, top + 10, { width: 140, align: 'right' });
        doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(pdfText(`Spesifikasi: ${spec}`), 50, top + 25, { width: width - 20 });
        doc.text(pdfText(`Alasan: ${reason}`), 50, top + 39, { width: width - 20 });
        doc.y = top + height + 6;
      });
    };

    doc.roundedRect(40, 40, width, 72, 6).fill('#1D4ED8');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('MAINTENANCE CONTROL SYSTEM', 54, 52);
    doc.fontSize(18).text('Laporan Analisis Gambar AI', 54, 67);
    doc.font('Helvetica').fontSize(9).fillColor('#DBEAFE')
      .text(pdfText(`${value(detail, 'analysis_number')}  |  ${dateTime(detail.created_at)}`), 54, 93);
    doc.y = 128;

    const meta = [
      ['Asset', `${value(detail, 'asset_code')} - ${value(detail, 'asset_name')}`],
      ['Dibuat oleh', value(detail, 'created_by') || '-'],
      ['Status', value(detail, 'status') || '-'],
      ['Jumlah foto', String(detail.image_count ?? 1)],
    ];
    meta.forEach(([label, content], index) => {
      const x = 40 + (index % 2) * (width / 2 + 6);
      const y = 128 + Math.floor(index / 2) * 38;
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text(pdfText(content), x, y + 12, { width: width / 2 - 12 });
    });
    doc.y = 210;

    heading('Ringkasan Analisis');
    paragraph(value(detail, 'analysis_summary') || '-');

    heading(`Parameter Hasil Pembacaan (${parameters.length})`);
    if (!parameters.length) paragraph('Belum ada parameter yang terbaca.');
    const columns = [30, 85, 135, 85, 65, 115];
    const tableHeader = () => {
      ensure(26);
      const top = doc.y;
      doc.rect(40, top, width, 23).fill('#E2E8F0');
      let x = 40;
      ['No', 'Bagian', 'Parameter', 'Nilai', 'Confidence', 'Penilaian'].forEach((label, index) => {
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5).text(label, x + 4, top + 7, { width: columns[index] - 8 });
        x += columns[index];
      });
      doc.y = top + 23;
    };
    if (parameters.length) tableHeader();
    parameters.forEach((row, index) => {
      const confidence = row.confidence == null ? '-' : `${Math.round(Number(row.confidence) * 100)}%`;
      const cells = [String(index + 1), value(row, 'section_name') || '-', value(row, 'parameter_name') || '-',
        `${value(row, 'text_value') || '-'} ${value(row, 'unit')}`.trim(), confidence,
        `${value(row, 'assessment') || 'UNASSESSED'}${value(row, 'assessment_note') ? `\n${value(row, 'assessment_note')}` : ''}`]
        .map(pdfText);
      const rowHeight = Math.max(28, ...cells.map((cell, cellIndex) => doc.heightOfString(cell, { width: columns[cellIndex] - 8 }) + 12));
      if (doc.y + rowHeight > doc.page.height - 55) { doc.addPage(); tableHeader(); }
      const top = doc.y;
      doc.rect(40, top, width, rowHeight).fillAndStroke(index % 2 ? '#F8FAFC' : '#FFFFFF', '#CBD5E1');
      let x = 40;
      cells.forEach((cell, cellIndex) => {
        doc.fillColor(cellIndex === 5 && cell.startsWith('CRITICAL') ? '#BE123C' : '#334155')
          .font(cellIndex === 2 || cellIndex === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          .text(cell, x + 4, top + 6, { width: columns[cellIndex] - 8, lineGap: 1 });
        x += columns[cellIndex];
      });
      doc.y = top + rowHeight;
    });

    heading(`Temuan (${findings.length})`);
    if (!findings.length) paragraph('Tidak ada temuan terstruktur.');
    findings.forEach((row, index) => {
      const severity = value(row, 'severity') || 'INFO';
      const content = pdfText(`${index + 1}. [${severity}] ${value(row, 'title')}\n${value(row, 'description')}`);
      const height = doc.heightOfString(content, { width: width - 24 }) + 18;
      ensure(height + 5);
      const top = doc.y;
      const color = severity === 'CRITICAL' ? '#BE123C' : severity === 'WARNING' ? '#D97706' : '#2563EB';
      doc.roundedRect(40, top, width, height, 4).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.rect(40, top, 4, height).fill(color);
      doc.fillColor('#334155').font('Helvetica').fontSize(9).text(content, 52, top + 8, { width: width - 24, lineGap: 2 });
      doc.y = top + height + 5;
    });

    heading('Rekomendasi Tindakan');
    if (!recommendations.length) paragraph('Belum ada rekomendasi tindakan.');
    recommendations.forEach((item, index) => paragraph(`${index + 1}. ${item}`));

    heading('Rekomendasi Produk');
    itemCards(products, 'Belum ada rekomendasi produk.');
    heading('Kebutuhan Bahan Baku / Consumable');
    itemCards(materials, 'Belum ada kebutuhan bahan baku atau consumable.');

    heading('Lampiran: Teks Terbaca');
    paragraph(cleanAiOcrText(value(detail, 'raw_text') || '-'));
    heading('Catatan');
    paragraph('Hasil OCR dan rekomendasi AI merupakan bantuan analisis. Nilai kritis, spesifikasi produk, dan kebutuhan material harus diverifikasi oleh personel berwenang sebelum digunakan sebagai dasar tindakan atau pembelian.');

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
        .text(`MCS AI Analyzer  |  ${value(detail, 'analysis_number')}`, 40, doc.page.height - 50,
          { width: width - 50, lineBreak: false });
      doc.text(`Halaman ${index + 1}`, doc.page.width - 90, doc.page.height - 50,
        { width: 50, align: 'right', lineBreak: false });
    }
    doc.end();
  });
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
    ocr.addRow([cleanAiOcrText(value(detail, 'raw_text') || '-')]);
    ocr.getCell('A2').alignment = { vertical: 'top', wrapText: true };
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${fileBase}.xlsx` };
  }

  return { buffer: await buildNativePdf(detail, parameters, findings, recommendations, products, materials),
    contentType: 'application/pdf', fileName: `${fileBase}.pdf` };
}
