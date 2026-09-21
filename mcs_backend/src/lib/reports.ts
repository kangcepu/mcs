import { one, rows } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../http.js';
import { getSetting } from './app-settings.js';
import { qrPngDataUrl } from './qr.js';

export async function recapWorkOrderOptions(): Promise<Record<string, unknown>> {
  const [companies, divisions] = await Promise.all([
    rows<{ id_company: string; company_name: string }>('SELECT id_company, company_name FROM tb_company ORDER BY company_name ASC'),
    rows<{ id_division: number; division_name: string; division_code: string }>('SELECT id_division, division_name, division_code FROM tb_division ORDER BY division_name ASC'),
  ]);
  return {
    companies: companies.map((c) => ({ value: String(c.id_company ?? ''), label: c.company_name || String(c.id_company ?? '') })),
    divisions: divisions.map((d) => ({ value: String(d.id_division ?? ''), label: d.division_name || String(d.id_division ?? '') })),
  };
}

export interface AssetReportFilters {
  q?: string; company?: string; location?: string; category?: string; active?: string; status?: string;
  page?: number; per_page?: number;
}

export async function getAssetReportList(filters: AssetReportFilters): Promise<{ data: Record<string, unknown>[]; meta: Record<string, unknown> }> {
  const page = Math.max(1, Number(filters.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(filters.per_page ?? 25)));

  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];
  const eqMap: Array<[string, string | undefined]> = [
    ['CompanyName', filters.company], ['LocationAsset', filters.location], ['CategoryAsset', filters.category],
    ['active', filters.active], ['status', filters.status],
  ];
  for (const [column, value] of eqMap) {
    const v = String(value ?? '').trim();
    if (v !== '') { clauses.push(`${column} = ?`); params.push(v); }
  }
  const q = String(filters.q ?? '').trim();
  if (q !== '') {
    const like = `%${q}%`;
    clauses.push(`(CAST(AssetID AS CHAR) LIKE ? OR AssetCode LIKE ? OR AssetName LIKE ? OR AliasName LIKE ? OR brand LIKE ? OR Keterangan LIKE ? OR CompanyName LIKE ? OR LocationAsset LIKE ? OR CategoryAsset LIKE ?)`);
    params.push(like, like, like, like, like, like, like, like, like);
  }
  const where = clauses.join(' AND ');

  const totalRow = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM asset WHERE ${where}`, params);
  const total = Number(totalRow?.total ?? 0);
  const data = await rows<Record<string, unknown>>(
    `SELECT AssetID, AssetCode, AssetName, AliasName, brand, CompanyName, LocationAsset, CategoryAsset, Keterangan, status, active, mtc_area_key, updated_at
     FROM asset WHERE ${where} ORDER BY AssetID DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  return { data, meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

const HISTORY_TABLES = ['tb_wo_mtc', 'tb_wo_mtc_operational', 'tb_wo_preventive', 'tb_wo_it', 'tb_wo_ga'];

export interface AssetsHistoryFilters { asset_code?: string; date_from?: string; date_to?: string; page?: number; per_page?: number }

export async function getAssetsHistoryReport(filters: AssetsHistoryFilters): Promise<{ data: Record<string, unknown>[]; meta: Record<string, unknown> }> {
  const page = Math.max(1, Number(filters.page ?? 1));
  const perPage = Math.min(500, Math.max(10, Number(filters.per_page ?? 50)));
  const query = String(filters.asset_code ?? '').trim();
  if (query === '') throw new HttpError(422, 'asset_code is required', 'ASSET_CODE_REQUIRED');

  const like = `%${query}%`;
  const assets = await rows<{ AssetID: number; AssetCode: string; AssetName: string }>(
    'SELECT AssetID, AssetCode, AssetName FROM asset WHERE (AssetCode LIKE ? OR AssetName LIKE ?) ORDER BY AssetName ASC',
    [like, like],
  );
  if (!assets.length) return { data: [], meta: { page, per_page: perPage, total: 0, total_pages: 1, asset_query: query } };

  const assetMap = new Map<string, { asset_code: string; asset_name: string }>();
  const assetIds: string[] = [];
  for (const a of assets) {
    const id = String(a.AssetID ?? '');
    if (!id) continue;
    assetIds.push(id);
    assetMap.set(id, { asset_code: a.AssetCode, asset_name: a.AssetName });
  }
  if (!assetIds.length) return { data: [], meta: { page, per_page: perPage, total: 0, total_pages: 1, asset_query: query } };

  const dateFrom = String(filters.date_from ?? '').trim();
  const dateTo = String(filters.date_to ?? '').trim();
  const placeholders = assetIds.map(() => '?').join(',');
  let combined: Record<string, unknown>[] = [];
  for (const table of HISTORY_TABLES) {
    const clauses = [`id_equipment IN (${placeholders})`];
    const params: unknown[] = [...assetIds];
    if (dateFrom) { clauses.push('date >= ?'); params.push(dateFrom); }
    if (dateTo) { clauses.push('date <= ?'); params.push(dateTo); }
    const tableRows = await rows<Record<string, unknown>>(`SELECT * FROM \`${table}\` WHERE ${clauses.join(' AND ')}`, params).catch(() => []);
    for (const row of tableRows) {
      const assetId = String(row.id_equipment ?? '');
      const asset = assetMap.get(assetId);
      combined.push(asset ? { ...row, ...asset } : row);
    }
  }
  combined = combined.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const total = combined.length;
  const offset = (page - 1) * perPage;
  return { data: combined.slice(offset, offset + perPage), meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)), asset_query: query } };
}

function hexEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex');
}

async function companyIdByName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (trimmed === '') return '';
  const row = await one<{ id_company: string }>('SELECT id_company FROM tb_company WHERE company_name=? LIMIT 1', [trimmed]);
  return String(row?.id_company ?? '').toUpperCase().trim();
}

async function companyNameById(id: string): Promise<string> {
  const trimmed = id.toUpperCase().trim();
  if (trimmed === '') return '';
  const row = await one<{ company_name: string }>('SELECT company_name FROM tb_company WHERE id_company=? LIMIT 1', [trimmed]);
  return String(row?.company_name ?? '').trim();
}

const LEGACY_LOGO_BY_NAME: Record<string, string> = {
  'Ganda Saribu Utama': 'Panen_bl.png', 'Ratimdo Utama': 'Ratimdo_bl.png', 'Utama Corporation': 'Utama_bl1.png',
};

async function qrCompanyLogo(assetCode: string, companyNameInput: string): Promise<string> {
  const prefix = (assetCode.split('/')[0] ?? '').toUpperCase().trim();
  let canonical = companyNameInput.trim();
  if (canonical === '') canonical = await companyNameById(prefix);
  if (canonical === '') canonical = companyNameInput;

  const candidates: string[] = [];
  if (prefix !== '') candidates.push(prefix);
  const cid = await companyIdByName(canonical);
  if (cid !== '' && !candidates.includes(cid)) candidates.push(cid);
  for (const c of candidates) {
    const value = await getSetting(`company_logo_${c}`, '');
    if (value !== '') return value;
  }

  let file = LEGACY_LOGO_BY_NAME[canonical] ?? LEGACY_LOGO_BY_NAME[companyNameInput] ?? '';
  if (file === '') {
    const hay = `${canonical} ${companyNameInput}`.toLowerCase();
    if (prefix === 'GSU' || hay.includes('ganda saribu') || hay.includes('panen')) file = 'Panen_bl.png';
    else if (prefix === 'RU' || prefix === 'RTU' || hay.includes('ratimdo')) file = 'Ratimdo_bl.png';
    else if (prefix === 'UC' || hay.includes('utama')) file = 'Utama_bl1.png';
  }
  return file !== '' ? `${config.legacyBaseUrl}/assets/img/${file}` : '';
}

export async function getQrReport(identifier: string): Promise<Record<string, unknown> | null> {
  const trimmed = identifier.trim();
  if (trimmed === '') return null;
  const asset = /^\d+$/.test(trimmed)
    ? await one<Record<string, unknown>>('SELECT AssetID, AssetCode, AssetName, CompanyName FROM asset WHERE AssetID=? OR AssetCode=? LIMIT 1', [trimmed, trimmed])
    : await one<Record<string, unknown>>('SELECT AssetID, AssetCode, AssetName, CompanyName FROM asset WHERE AssetCode=? LIMIT 1', [trimmed]);
  if (!asset) return null;

  const assetId = String(asset.AssetID ?? '');
  const assetCode = String(asset.AssetCode ?? '');
  const companyName = String(asset.CompanyName ?? '');
  const encodedId = hexEncode(assetId);
  const qrContent = `${config.legacyBaseUrl}/Detail_asset/?id=${encodedId}`;
  const printUrl = `${config.legacyBaseUrl}/equipment/qrcode_mcs/${encodedId}`;
  const [logoUrl, qrImage] = await Promise.all([qrCompanyLogo(assetCode, companyName), qrPngDataUrl(qrContent)]);

  return {
    asset, asset_code: assetCode, asset_name: String(asset.AssetName ?? ''), company_name: companyName,
    logo_url: logoUrl, qr_content: qrContent, qr_payload: qrContent, qr_image: qrImage, qr_url: printUrl, print_url: printUrl,
  };
}
