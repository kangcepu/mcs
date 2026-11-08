import ExcelJS from 'exceljs';
import { normalizeAssetLookup } from './asset-lookup.js';

export interface ChildAssetImportRow {
  row: number;
  child_name: string;
  lookup_value: string;
  identifier: string;
  items: Array<{
    row: number;
    item_name: string;
    lookup_value: string;
    identifier: string;
    condition_text: string;
    frequency: string;
    pic: string;
  }>;
}

function norm(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as Array<{ text: string }>).map((item) => item.text).join('').trim();
    if ('result' in obj) return String(obj.result ?? '').trim();
    if ('text' in obj) return String(obj.text ?? '').trim();
    return String(cell.text ?? '').trim();
  }
  return String(value).trim();
}

function isCodeHeader(value: string): boolean {
  return value === 'qr'
    || value.includes('asset code')
    || value.includes('assetcode')
    || value.includes('kode asset')
    || value.includes('kode aset')
    || (value.includes('asset') && value.includes('qr'))
    || (value.includes('aset') && value.includes('qr'));
}

function isNameHeader(value: string): boolean {
  return value === 'bagian'
    || value === 'child asset'
    || value === 'aset terkait'
    || value === 'asset terkait'
    || value === 'nama aset'
    || value === 'nama asset';
}

function isItemHeader(value: string): boolean {
  return value === 'asset' || value === 'aset' || value === 'item asset' || value === 'item aset';
}

export async function parseChildAssetWorkbook(buffer: Buffer): Promise<{ sheet: string; rows: ChildAssetImportRow[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Sheet Excel tidak ditemukan.');

  const scanRows = Math.min(25, worksheet.rowCount);
  const scanColumns = Math.max(worksheet.columnCount, 12);
  let headerRow = 0;
  let codeColumn = 0;
  let nameColumn = 0;
  let fallbackHeaderRow = 0;
  let fallbackNameColumn = 0;
  let itemColumn = 0;
  let conditionColumn = 0;
  let frequencyColumn = 0;
  let picColumn = 0;

  for (let row = 1; row <= scanRows; row++) {
    let rowCodeColumn = 0;
    let rowNameColumn = 0;
    for (let column = 1; column <= scanColumns; column++) {
      const label = norm(cellText(worksheet.getCell(row, column)));
      if (!rowCodeColumn && isCodeHeader(label)) rowCodeColumn = column;
      if (!rowNameColumn && isNameHeader(label)) rowNameColumn = column;
      if (!itemColumn && isItemHeader(label)) itemColumn = column;
      if (!conditionColumn && (label === 'kondisi' || label.includes('condition'))) conditionColumn = column;
      if (!frequencyColumn && (label.includes('durasi pengecekan') || label.includes('frekuensi'))) frequencyColumn = column;
      if (!picColumn && label === 'pic') picColumn = column;
    }
    if (rowNameColumn && !fallbackNameColumn) {
      fallbackHeaderRow = row;
      fallbackNameColumn = rowNameColumn;
    }
    if (rowCodeColumn && rowNameColumn) {
      headerRow = row;
      codeColumn = rowCodeColumn;
      nameColumn = rowNameColumn;
      break;
    }
  }

  // Form Preventive Audit lama memang menyediakan kolom A kosong. Anggap
  // kolom A sebagai Asset Code / QR bila header `Bagian` ditemukan, supaya
  // file yang sudah diisi scan QR tetap terbaca walau judul kolom terhapus.
  if (!codeColumn && fallbackNameColumn) {
    headerRow = fallbackHeaderRow;
    nameColumn = fallbackNameColumn;
    codeColumn = 1;
  }
  if (!codeColumn) throw new Error('Kolom "Asset Code / QR" tidak ditemukan dan format Form Preventive Audit tidak dikenali.');
  if (!nameColumn) throw new Error('Kolom nama child asset tidak ditemukan (contoh: "Bagian" atau "Nama Aset").');
  if (!itemColumn) throw new Error('Kolom detail asset tidak ditemukan (contoh: "Asset").');

  const groups = new Map<string, ChildAssetImportRow>();
  for (let row = headerRow + 1; row <= worksheet.rowCount; row++) {
    const childName = cellText(worksheet.getCell(row, nameColumn)).trim();
    const itemName = cellText(worksheet.getCell(row, itemColumn)).trim();
    const lookupValue = cellText(worksheet.getCell(row, codeColumn)).trim();
    const nameKey = norm(childName);
    if (!childName || isNameHeader(nameKey) || !itemName || isItemHeader(norm(itemName))) continue;

    const groupKey = nameKey;
    const current = groups.get(groupKey);
    if (!current) {
      groups.set(groupKey, {
        row,
        child_name: childName,
        lookup_value: '',
        identifier: '',
        items: [],
      });
    }
    const group = groups.get(groupKey)!;
    if (!group.items.some((item) => item.row === row && norm(item.item_name) === norm(itemName))) {
      group.items.push({
        row,
        item_name: itemName,
        lookup_value: lookupValue,
        identifier: normalizeAssetLookup(lookupValue),
        condition_text: conditionColumn ? cellText(worksheet.getCell(row, conditionColumn)).trim() : '',
        frequency: frequencyColumn ? cellText(worksheet.getCell(row, frequencyColumn)).trim() : '',
        pic: picColumn ? cellText(worksheet.getCell(row, picColumn)).trim() : '',
      });
    }
  }

  if (!groups.size) throw new Error('Tidak ada baris child asset yang dapat dibaca.');
  return { sheet: worksheet.name, rows: [...groups.values()] };
}
