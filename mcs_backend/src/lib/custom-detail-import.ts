import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';

export interface ExtractedImage { filename: string; filesize: number; mime_type: string }
export type ImageType = 'tampak_jauh' | 'tampak_dekat' | 'detail_part';
export interface RowImages { tampak_jauh: ExtractedImage[]; tampak_dekat: ExtractedImage[]; detail_part: ExtractedImage[] }
export interface ParsedRow {
  bagian: string; bagian_mesin: string; part_mesin: string; kondisi: string;
  durasi_pengecekan: string; pic: string; part_diperlukan: string; images: RowImages;
}
export interface ParsedWorkbook { rows: ParsedRow[]; imageCount: number; imageFailed: number; imageEngine: string }

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

const TEXT_WANTED: Record<string, string> = {
  'bagian mesin': 'bagian_mesin', bagian: 'bagian', 'part mesin': 'part_mesin',
  kondisi: 'kondisi', 'durasi pengecekan': 'durasi_pengecekan', durasi: 'durasi_pengecekan',
  'kategori pengecekan': 'durasi_pengecekan',
  pic: 'pic', 'part yang diperlukan': 'part_diperlukan', 'part yg diperlukan': 'part_diperlukan',
  'part diperlukan': 'part_diperlukan',
};
const IMG_WANTED: Record<string, ImageType> = { 'tampak jauh': 'tampak_jauh', 'tampak dekat': 'tampak_dekat', 'detail part': 'detail_part' };

function norm(v: unknown): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function colLetter(idx: number): string {
  let s = '', n = idx;
  while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cellText(ws: ExcelJS.Worksheet, row: number, col: string): string {
  const cell = ws.getCell(`${col}${row}`);
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const obj = v as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as Array<{ text: string }>).map((t) => t.text).join('');
    if ('result' in obj) return String(obj.result ?? '');
    if ('text' in obj) return String(obj.text ?? '');
    return String(cell.text ?? '');
  }
  return String(v);
}

function imageTypeFromLabel(key: string): ImageType | null {
  if (IMG_WANTED[key]) return IMG_WANTED[key];
  if (key.includes('tampak jauh')) return 'tampak_jauh';
  if (key.includes('tampak dekat')) return 'tampak_dekat';
  if (key.includes('detail part')) return 'detail_part';
  return null;
}

function emptyRowImages(): RowImages {
  return { tampak_jauh: [], tampak_dekat: [], detail_part: [] };
}

function parseRels(xml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const tagRe = /<Relationship\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const tag = m[0];
    const idMatch = /\bId="([^"]+)"/.exec(tag);
    const targetMatch = /\bTarget="([^"]+)"/.exec(tag);
    if (!idMatch || !targetMatch) continue;
    let target = targetMatch[1];
    target = target.startsWith('../') ? `xl/${target.slice(3)}` : `xl/drawings/${target.replace(/^\//, '')}`;
    map[idMatch[1]] = target;
  }
  return map;
}

function extractAnchorBlocks(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<[\w]*:?(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/[\w]*:?\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) blocks.push(m[2]);
  return blocks;
}

function extractFromColRow(block: string): { col: number; row: number } | null {
  const fromMatch = /<[\w]*:?from\b[^>]*>([\s\S]*?)<\/[\w]*:?from>/.exec(block);
  const target = fromMatch ? fromMatch[1] : block;
  const colMatch = /<[\w]*:?col>(\d+)<\/[\w]*:?col>/.exec(target);
  const rowMatch = /<[\w]*:?row>(\d+)<\/[\w]*:?row>/.exec(target);
  if (!colMatch || !rowMatch) return null;
  return { col: Number(colMatch[1]), row: Number(rowMatch[1]) };
}

function extractBlipEmbeds(block: string): string[] {
  const embeds: string[] = [];
  const re = /<[\w]*:?blip\b[^>]*\br:embed="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) embeds.push(m[1]);
  return embeds;
}

function extractImagesFromDrawing(
  zip: AdmZip, drawingPath: string, relsPath: string,
  colTypeMap: Record<number, ImageType>, minRow: number, safeCode: string, destDir: string,
): { byRow: Record<number, RowImages>; count: number; failed: number } {
  const byRow: Record<number, RowImages> = {};
  let count = 0, failed = 0, sequence = 0;
  const drawingEntry = zip.getEntry(drawingPath);
  if (!drawingEntry) return { byRow, count, failed };
  const drawingXml = drawingEntry.getData().toString('utf8');
  const relsEntry = zip.getEntry(relsPath);
  const relMap = relsEntry ? parseRels(relsEntry.getData().toString('utf8')) : {};

  for (const block of extractAnchorBlocks(drawingXml)) {
    const fromColRow = extractFromColRow(block);
    if (!fromColRow) continue;
    const fromRow = fromColRow.row + 1;
    if (fromRow < minRow) continue;
    const type = colTypeMap[fromColRow.col];
    if (!type) continue;
    if (!byRow[fromRow]) byRow[fromRow] = emptyRowImages();
    const list = byRow[fromRow][type];

    for (const embed of extractBlipEmbeds(block)) {
      if (list.length >= 2) break;
      const target = relMap[embed];
      if (!target) { failed++; continue; }
      const mediaEntry = zip.getEntry(target);
      if (!mediaEntry) { failed++; continue; }
      const bin = mediaEntry.getData();
      if (!bin || !bin.length) { failed++; continue; }
      const size = bin.length;
      if (list.some((e) => e.filesize === size)) continue;
      let ext = path.extname(target).slice(1).toLowerCase() || 'jpeg';
      if (ext === 'jpg') ext = 'jpeg';
      if (!IMAGE_EXT.includes(ext)) ext = 'jpeg';
      sequence++;
      const filename = `${safeCode}_${type}_row${fromRow}_${sequence}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(destDir, filename), bin);
      list.push({ filename, filesize: bin.length, mime_type: `image/${ext}` });
      count++;
    }
  }
  return { byRow, count, failed };
}

function mergeByRow(target: Record<number, RowImages>, source: Record<number, RowImages>): void {
  for (const [rowKey, val] of Object.entries(source)) {
    const rowNum = Number(rowKey);
    if (!target[rowNum]) target[rowNum] = val;
    else { target[rowNum].tampak_jauh.push(...val.tampak_jauh); target[rowNum].tampak_dekat.push(...val.tampak_dekat); target[rowNum].detail_part.push(...val.detail_part); }
  }
}

export function discardExtractedImages(rows: ParsedRow[], destDir: string): void {
  for (const r of rows) {
    for (const type of ['tampak_jauh', 'tampak_dekat', 'detail_part'] as const) {
      for (const img of r.images[type]) {
        const p = path.join(destDir, img.filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  }
}

export async function parseCustomDetailWorkbook(filePath: string, assetCode: string, destDir: string): Promise<ParsedWorkbook> {
  fs.mkdirSync(destDir, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error('Sheet tidak ditemukan');

  const maxRow = ws.rowCount || (ws.lastRow?.number ?? 0);
  const maxCol = Math.max(ws.columnCount || 0, 20);
  const scanTo = Math.min(20, maxRow);

  const map: Record<string, string> = {};
  const imgMap: Record<number, ImageType> = {};
  let headerRow = 0;

  for (let ri = 1; ri <= scanTo; ri++) {
    for (let ci = 1; ci <= maxCol; ci++) {
      const key = norm(cellText(ws, ri, colLetter(ci)));
      if (!key) continue;
      const imageType = imageTypeFromLabel(key);
      if (imageType) imgMap[ci - 1] = imageType;
    }

    if (headerRow !== 0) continue;
    let hasPartHeader = false;
    for (let ci = 1; ci <= maxCol; ci++) {
      const key = norm(cellText(ws, ri, colLetter(ci)));
      if (key === 'part mesin' || key.includes('part mesin')) { hasPartHeader = true; break; }
    }
    if (!hasPartHeader) continue;
    headerRow = ri;

    for (const hr of [ri, ri + 1]) {
      for (let ci = 1; ci <= maxCol; ci++) {
        const colL = colLetter(ci);
        const key = norm(cellText(ws, hr, colL));
        if (!key) continue;
        if (TEXT_WANTED[key] && !map[TEXT_WANTED[key]]) map[TEXT_WANTED[key]] = colL;
        if (!map.part_mesin && key.includes('part mesin')) map.part_mesin = colL;
        if (!map.durasi_pengecekan && (key.includes('durasi') || key.includes('frekuensi') || key.includes('kategori pengecekan') || key.includes('tipe jadwal') || key.includes('type schedule'))) {
          map.durasi_pengecekan = colL;
        }
        const imageType = imageTypeFromLabel(key);
        if (imageType) imgMap[ci - 1] = imageType;
      }
    }
  }

  let effectiveHeaderRow = headerRow;
  let effectiveMap = map;
  if (!effectiveMap.part_mesin) {
    effectiveHeaderRow = 9;
    effectiveMap = { bagian: 'B', bagian_mesin: 'D', part_mesin: 'E', kondisi: 'J', durasi_pengecekan: 'K', pic: 'L', part_diperlukan: 'M' };
  }
  const effectiveImgMap: Record<number, ImageType> = Object.keys(imgMap).length ? imgMap : { 6: 'tampak_jauh', 7: 'tampak_dekat', 8: 'detail_part' };

  const pmCol = effectiveMap.part_mesin;
  let dataStart = effectiveHeaderRow + 2;
  const peek = norm(cellText(ws, effectiveHeaderRow + 1, pmCol));
  if (peek !== '' && peek !== 'part mesin') dataStart = effectiveHeaderRow + 1;

  const safeCode = String(assetCode).replace(/[-/\\ ]/g, '');
  const zip = new AdmZip(filePath);

  let extracted = extractImagesFromDrawing(zip, 'xl/drawings/drawing1.xml', 'xl/drawings/_rels/drawing1.xml.rels', { 5: 'tampak_jauh', 6: 'tampak_dekat', 7: 'detail_part' }, 10, safeCode, destDir);
  let imageEngine = 'legacy-drawing1-fgh';
  if (extracted.count === 0) {
    const merged: { byRow: Record<number, RowImages>; count: number; failed: number } = { byRow: {}, count: 0, failed: 0 };
    for (let n = 1; n <= 30; n++) {
      const r = extractImagesFromDrawing(zip, `xl/drawings/drawing${n}.xml`, `xl/drawings/_rels/drawing${n}.xml.rels`, effectiveImgMap, dataStart, safeCode, destDir);
      mergeByRow(merged.byRow, r.byRow);
      merged.count += r.count; merged.failed += r.failed;
    }
    extracted = merged;
    imageEngine = 'v2-dynamic-drawings';
  }

  const parsedRows: ParsedRow[] = [];
  let lastBagian = '', lastBagianMesin = '';
  const get = (ri: number, field: string): string => {
    const col = effectiveMap[field];
    return col ? cellText(ws, ri, col).trim() : '';
  };
  for (let ri = dataStart; ri <= maxRow; ri++) {
    const part = get(ri, 'part_mesin');
    if (!part || part.toLowerCase().startsWith('[isi part')) continue;
    let bagian = get(ri, 'bagian');
    let bagianMesin = get(ri, 'bagian_mesin');
    if (bagian) lastBagian = bagian; else bagian = lastBagian;
    if (bagianMesin) lastBagianMesin = bagianMesin; else bagianMesin = lastBagianMesin;
    parsedRows.push({
      bagian, bagian_mesin: bagianMesin, part_mesin: part,
      kondisi: get(ri, 'kondisi'), durasi_pengecekan: get(ri, 'durasi_pengecekan'),
      pic: get(ri, 'pic'), part_diperlukan: get(ri, 'part_diperlukan'),
      images: extracted.byRow[ri] ?? emptyRowImages(),
    });
  }

  return { rows: parsedRows, imageCount: extracted.count, imageFailed: extracted.failed, imageEngine };
}

export async function buildCustomDetailTemplate(): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Form Checklist');

  sheet.mergeCells('A1:M1');
  sheet.getCell('A1').value = 'FORM CHECKLIST MAINTENANCE - MESIN';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.getCell('B6').value = 'Nomor Mesin';
  sheet.getCell('C6').value = ':';
  sheet.mergeCells('D6:F6');
  sheet.getCell('D6').value = '[Isi Kode / Nomor Aset]';
  sheet.mergeCells('B7:M7');
  sheet.getCell('B7').value = 'Periode : Bulan ______ Tahun ______';

  const headerCells: Record<string, string> = { B8: 'Bagian', D8: 'Bagian Mesin', E8: 'Part Mesin', J8: 'Kondisi', K8: 'Durasi Pengecekan', L8: 'PIC', M8: 'Part Yang Diperlukan', G9: 'Tampak Jauh', H9: 'Tampak Dekat', I9: 'Detail Part' };
  for (const [addr, val] of Object.entries(headerCells)) sheet.getCell(addr).value = val;
  for (const mc of ['B8:B9', 'D8:D9', 'E8:E9', 'J8:J9', 'K8:K9', 'L8:L9', 'M8:M9']) sheet.mergeCells(mc);
  for (const addr of ['B8', 'D8', 'E8', 'J8', 'K8', 'L8', 'M8', 'G9', 'H9', 'I9']) {
    const cell = sheet.getCell(addr);
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  }

  const sample: [string, string, string, string, string, string, string][] = [
    ['Mekanikal', 'Conveyor', 'Bearing', '1. Pastikan terlumasi grease\n2. Pastikan kondisi baik', 'Mingguan', 'Nasib, Ade — General Maintenance', ''],
    ['', '', 'Rantai & Sprocket', '1. Pastikan terpasang baik\n2. Cek sambungan rantai', 'Mingguan', 'Nasib, Ade — General Maintenance', ''],
    ['', '', '[Isi Part Mesin]', '[Isi prosedur pengecekan]', '[Harian/Mingguan/Bulanan/…]', '[PIC]', '[Part diperlukan]'],
  ];
  let r = 10;
  for (const s of sample) {
    sheet.getCell(`B${r}`).value = s[0]; sheet.getCell(`D${r}`).value = s[1]; sheet.getCell(`E${r}`).value = s[2];
    sheet.getCell(`J${r}`).value = s[3]; sheet.getCell(`K${r}`).value = s[4]; sheet.getCell(`L${r}`).value = s[5]; sheet.getCell(`M${r}`).value = s[6];
    sheet.getCell(`G${r}`).value = '[Insert Image]'; sheet.getCell(`H${r}`).value = '[Insert Image]'; sheet.getCell(`I${r}`).value = '[Insert Image]';
    sheet.getRow(r).height = 80;
    r++;
  }
  for (const [col, width] of Object.entries({ B: 15, D: 20, E: 30, G: 20, H: 20, I: 20, J: 40, K: 16, L: 25, M: 25 })) sheet.getColumn(col).width = width;
  for (let rr = 10; rr < r; rr++) {
    for (const col of ['B', 'D', 'E', 'G', 'H', 'I', 'J', 'K', 'L', 'M']) {
      sheet.getCell(`${col}${rr}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };
    }
  }

  const instructions = workbook.addWorksheet('Instruksi');
  instructions.getColumn('A').width = 90;
  const lines = [
    'INSTRUKSI TEMPLATE CUSTOM DETAIL', '',
    '- Baris 8 = judul kolom teks, baris 9 = judul kolom gambar, DATA MULAI BARIS 10.',
    '- Kolom E (Part Mesin) WAJIB diisi tiap baris. Baris tanpa Part Mesin dilewati.',
    '- Bagian & Bagian Mesin boleh dikosongkan bila sama dengan baris di atasnya.',
    '- Kolom G / H / I: Insert > Pictures, taruh gambar DI DALAM sel (anchor ke sel).',
    '  Maksimal 2 gambar per kolom per baris.',
    '- Kolom J Kondisi, K Durasi Pengecekan (Harian/Mingguan/Bulanan/3 Bulan/6 Bulan/Tahunan),',
    '  L PIC, M Part Yang Diperlukan.',
    '- Hapus baris contoh (10-12) sebelum mengisi data asli.',
    '- Mode "replace" (default) mengganti seluruh Custom Detail aset; "append" menambah.',
  ];
  lines.forEach((line, i) => { instructions.getCell(`A${i + 1}`).value = line; });
  instructions.getCell('A1').font = { bold: true, size: 13 };

  return workbook.xlsx.writeBuffer();
}
