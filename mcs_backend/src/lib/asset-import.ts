import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { execute, one, rows } from '../db.js';
import type { User } from '../types.js';

export interface ImportRowResult { row: number; asset_code: string; status: 'created' | 'updated' | 'skipped' | 'error'; message: string }
export interface ImportSummary { total: number; created: number; updated: number; skipped: number; errors: number }
export interface ImportResult { summary: ImportSummary; rows: ImportRowResult[] }

function textOf(cell: ExcelJS.Cell): string {
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

export async function readWorkbookRows(buffer: Buffer, ext: string): Promise<Array<Record<string, string>>> {
  const workbook = new ExcelJS.Workbook();
  if (ext === 'csv') {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const width = Math.max(sheet.columnCount, sheet.actualColumnCount);

  let headerRowNum = -1;
  let headerCells: string[] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: string[] = [];
    let hasValue = false;
    for (let c = 1; c <= width; c++) {
      const text = textOf(row.getCell(c));
      values[c - 1] = text;
      if (text.trim() !== '') hasValue = true;
    }
    if (hasValue) { headerRowNum = r; headerCells = values; break; }
  }
  if (headerRowNum === -1) return [];

  const out: Array<Record<string, string>> = [];
  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const assoc: Record<string, string> = { __row: String(r) };
    let hasValue = false;
    for (let c = 1; c <= width; c++) {
      const header = (headerCells[c - 1] ?? '').trim();
      const text = textOf(row.getCell(c));
      if (header) assoc[header] = text;
      if (text.trim() !== '') hasValue = true;
    }
    if (hasValue) out.push(assoc);
  }
  return out;
}

const HEADER_MAP: Record<string, string> = {
  'asset code': 'asset_code', assetcode: 'asset_code', 'kode aset': 'asset_code', kode: 'asset_code',
  'asset name': 'asset_name', assetname: 'asset_name', 'nama aset': 'asset_name', nama: 'asset_name',
  alias: 'alias_name', 'alias name': 'alias_name', aliasname: 'alias_name', 'nama alias': 'alias_name',
  brand: 'brand', merk: 'brand', merek: 'brand',
  company: 'company', 'company name': 'company', companyname: 'company', perusahaan: 'company',
  location: 'location', 'location asset': 'location', locationasset: 'location', lokasi: 'location',
  category: 'category', 'category asset': 'category', categoryasset: 'category', kategori: 'category',
  keterangan: 'keterangan', description: 'keterangan', deskripsi: 'keterangan',
  remarks: 'remarks', 'serial number': 'remarks', serial: 'remarks', 'nomor seri': 'remarks',
  'mtc area': 'mtc_area', 'maintenance area': 'mtc_area', mtc_area_key: 'mtc_area', 'mtc area key': 'mtc_area', area: 'mtc_area',
  status: 'status',
  active: 'is_active', aktif: 'is_active', 'is active': 'is_active', is_active: 'is_active',
};

function normalizeRow(raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase().replace(/\s+/g, ' ');
    const mapped = HEADER_MAP[key];
    if (!mapped) continue;
    out[mapped] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

async function nameSet(table: string, column: string): Promise<Map<string, string>> {
  const result = await rows<Record<string, unknown>>(`SELECT ${column} AS name FROM ${table}`);
  const map = new Map<string, string>();
  for (const r of result) {
    const name = String(r.name ?? '').trim();
    if (name) map.set(name.toLowerCase(), name);
  }
  return map;
}

async function findAssetByCode(code: string): Promise<{ AssetCode: string } | null> {
  return one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetCode=? LIMIT 1', [code]);
}

async function generateAssetCode(companyName: string, locationName: string, categoryName: string): Promise<string | null> {
  const [company, location, category] = await Promise.all([
    one<{ id_company: string }>('SELECT id_company FROM tb_company WHERE company_name=?', [companyName]),
    one<{ location_code: string }>('SELECT location_code FROM tb_location_asset WHERE location_name=?', [locationName]),
    one<{ category_code: string }>('SELECT category_code FROM tb_category_asset WHERE category_name=?', [categoryName]),
  ]);
  if (!company || !location || !category) return null;
  const prefix = `${company.id_company}/${category.category_code}-${location.location_code}/`;
  const row = await one<{ max_number: number | null }>(
    'SELECT MAX(CAST(RIGHT(AssetCode, 4) AS UNSIGNED)) AS max_number FROM asset WHERE AssetCode LIKE ?',
    [`${prefix}%`],
  );
  const next = Number(row?.max_number ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

const ASSET_FIELD_ALIASES: Record<string, string> = {
  asset_code: 'AssetCode', asset_name: 'AssetName', alias_name: 'AliasName',
  company: 'CompanyName', location: 'LocationAsset', category: 'CategoryAsset',
  keterangan: 'Keterangan', remarks: 'Remarks', mtc_area: 'mtc_area_key',
};
const ASSET_ALLOWED = ['AssetCode', 'AssetName', 'AliasName', 'brand', 'CompanyName', 'LocationAsset', 'CategoryAsset', 'Keterangan', 'Remarks', 'status', 'active', 'mtc_area_key'];

function buildAssetFields(payload: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = { ...payload };
  for (const [from, to] of Object.entries(ASSET_FIELD_ALIASES)) {
    if (!(to in p) && from in p && p[from] !== '' && p[from] != null) p[to] = p[from];
  }
  if ('is_active' in p && !('active' in p)) {
    const v = p.is_active;
    const truthy = v === true || v === 1 || v === '1' || ['true', 'active', 'yes'].includes(String(v).toLowerCase());
    p.active = truthy ? 'active' : 'inactive';
  }
  const out: Record<string, unknown> = {};
  for (const field of ASSET_ALLOWED) {
    if (field in p && p[field] !== undefined) out[field] = typeof p[field] === 'string' ? (p[field] as string).trim() : p[field];
  }
  return out;
}

async function createAssetRow(fields: Record<string, unknown>, actorName: string): Promise<{ ok: boolean; message?: string }> {
  const data = { ...fields, active: fields.active ?? 'active' };
  const keys = Object.keys(data);
  try {
    await execute(
      `INSERT INTO asset (${keys.map((k) => `\`${k}\``).join(', ')}, created_at, created_by, updated_by) VALUES (${keys.map(() => '?').join(', ')}, NOW(), ?, ?)`,
      [...Object.values(data), actorName, actorName],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed to create asset' };
  }
}

async function updateAssetRow(assetCode: string, fields: Record<string, unknown>, actorName: string): Promise<{ ok: boolean; message?: string }> {
  const data = { ...fields };
  delete data.AssetCode;
  const keys = Object.keys(data);
  if (!keys.length) return { ok: true };
  try {
    await execute(
      `UPDATE asset SET ${keys.map((k) => `\`${k}\`=?`).join(', ')}, updated_at=NOW(), updated_by=? WHERE AssetCode=?`,
      [...Object.values(data), actorName, assetCode],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed to update asset' };
  }
}

export async function importAssetRows(parsedRows: Array<Record<string, string>>, actor: User, opts: { updateExisting: boolean; dryRun: boolean }): Promise<ImportResult> {
  const [companies, locations, categories] = await Promise.all([
    nameSet('tb_company', 'company_name'),
    nameSet('tb_location_asset', 'location_name'),
    nameSet('tb_category_asset', 'category_name'),
  ]);

  const summary: ImportSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
  const out: ImportRowResult[] = [];
  const actorName = String(actor.fullname ?? actor.username ?? 'system');

  for (const [i, raw] of parsedRows.entries()) {
    const rowNo = Number(raw.__row ?? i + 2);
    const { __row: _ignored, ...rest } = raw;
    const hasValue = Object.values(rest).some((v) => String(v ?? '').trim() !== '');
    if (!hasValue) continue;
    summary.total++;

    const payload = normalizeRow(rest);
    let code = String(payload.asset_code ?? '').trim();
    const name = String(payload.asset_name ?? '').trim();
    const company = String(payload.company ?? '').trim();
    const location = String(payload.location ?? '').trim();
    const category = String(payload.category ?? '').trim();

    const errs: string[] = [];
    if (!name) errs.push('AssetName wajib diisi');
    if (company && !companies.has(company.toLowerCase())) errs.push(`Company "${company}" tidak ada di master`);
    if (location && !locations.has(location.toLowerCase())) errs.push(`Location "${location}" tidak ada di master`);
    if (category && !categories.has(category.toLowerCase())) errs.push(`Category "${category}" tidak ada di master`);

    const existing = code ? await findAssetByCode(code) : null;

    if (!code && !errs.length && company && location && category) {
      const gen = await generateAssetCode(companies.get(company.toLowerCase())!, locations.get(location.toLowerCase())!, categories.get(category.toLowerCase())!);
      if (!gen) errs.push('Gagal generate AssetCode');
      else { code = gen; payload.asset_code = gen; }
    }
    if (!code && !errs.length) errs.push('AssetCode kosong & tidak bisa di-generate (butuh Company + Location + Category)');

    if (errs.length) {
      summary.errors++;
      out.push({ row: rowNo, asset_code: code, status: 'error', message: errs.join('; ') });
      continue;
    }

    const fields = buildAssetFields(payload);

    if (existing) {
      if (!opts.updateExisting) {
        summary.skipped++;
        out.push({ row: rowNo, asset_code: code, status: 'skipped', message: 'AssetCode sudah ada (opsi update mati)' });
        continue;
      }
      if (opts.dryRun) {
        summary.updated++;
        out.push({ row: rowNo, asset_code: code, status: 'updated', message: '(pratinjau) akan di-update' });
        continue;
      }
      const res = await updateAssetRow(code, fields, actorName);
      if (res.ok) { summary.updated++; out.push({ row: rowNo, asset_code: code, status: 'updated', message: '' }); }
      else { summary.errors++; out.push({ row: rowNo, asset_code: code, status: 'error', message: res.message ?? 'Gagal update' }); }
      continue;
    }

    if (opts.dryRun) {
      summary.created++;
      out.push({ row: rowNo, asset_code: code, status: 'created', message: '(pratinjau) akan dibuat' });
      continue;
    }
    const res = await createAssetRow(fields, actorName);
    if (res.ok) { summary.created++; out.push({ row: rowNo, asset_code: code, status: 'created', message: '' }); }
    else { summary.errors++; out.push({ row: rowNo, asset_code: code, status: 'error', message: res.message ?? 'Gagal buat aset' }); }
  }

  return { summary, rows: out };
}

export async function buildAssetImportTemplate(): Promise<Buffer> {
  const [companies, locations, categories] = await Promise.all([
    rows<{ company_name: string }>('SELECT company_name FROM tb_company ORDER BY company_name'),
    rows<{ location_name: string }>('SELECT location_name FROM tb_location_asset ORDER BY location_name'),
    rows<{ category_name: string }>('SELECT category_name FROM tb_category_asset ORDER BY category_name'),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Aset');
  const headers = ['AssetCode', 'AssetName', 'AliasName', 'Brand', 'Company', 'Location', 'Category', 'MtcArea', 'Keterangan', 'Active'];
  sheet.addRow(headers);
  sheet.addRow(['', 'Contoh Mesin Injeksi 01', 'INJ-01', 'Haitian', '', '', '', '', 'Contoh baris — hapus sebelum impor', 'active']);
  sheet.getRow(1).font = { bold: true };
  headers.forEach((_h, i) => { sheet.getColumn(i + 1).width = 22; });

  const master = workbook.addWorksheet('Master');
  master.addRow(['Company', 'Location', 'Category']);
  master.getRow(1).font = { bold: true };
  const maxLen = Math.max(companies.length, locations.length, categories.length);
  for (let i = 0; i < maxLen; i++) {
    master.addRow([companies[i]?.company_name ?? '', locations[i]?.location_name ?? '', categories[i]?.category_name ?? '']);
  }
  master.columns.forEach((c) => { c.width = 22; });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
