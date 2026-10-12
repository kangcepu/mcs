/**
 * Proxy tipis ke service Stock Opname terpisah (so.padmoasm.com — lihat
 * `soBaseUrl` di mobile `api_constants.dart`). Service itu menerima JWT yang
 * sama persis dengan backend ini (JWT_SECRET sama), jadi token user yang
 * sedang login cukup diteruskan apa adanya — tidak ada login terpisah.
 *
 * Logika filter/agregasi di sini sengaja meniru persis
 * `ReportSoRepository.getList()` di mobile (lib/app/data/repositories/
 * report_so_repository.dart) supaya angka yang tampil di web match dengan
 * yang di mobile, bukan interpretasi baru.
 */
import { config } from '../config.js';

const SO_BASE_URL = config.soBaseUrl;

interface SoFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function soGet(path: string, token: string): Promise<SoFetchResult> {
  try {
    const res = await fetch(`${SO_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    let body: unknown = [];
    if (text) {
      try { body = JSON.parse(text); } catch { body = []; }
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: [] };
  }
}

function extractList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === 'object') {
    const data = (body as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === 'object') return Object.values(data as Record<string, unknown>) as Record<string, unknown>[];
  }
  return [];
}

function readValue(row: Record<string, unknown>, keys: string[]): string {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase());
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s.toLowerCase() !== 'null') return s;
  }
  return '';
}

function readListValue(row: Record<string, unknown>, keys: string[]): string[] {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase());
    if (Array.isArray(v)) return v.map((x) => String(x));
  }
  return [];
}

function toInt(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.trunc(value);
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

function isTruthy(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

const ID_MONTHS: Record<string, string> = {
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
};

/**
 * Service SO balikin tanggal gaya "12 Oktober 2026" (bukan ISO) — mobile
 * pakai `DateTime.tryParse` yang diam-diam GAGAL untuk format ini (jadi
 * filter tanggal di mobile sebenarnya no-op untuk data ini juga), tapi di
 * sini kita parse betulan supaya filter date_from/date_to di web kerja dan
 * `fmtDate()` web (yang pakai `new Date(...)`, juga gak ngerti nama bulan
 * Indonesia) dapat string ISO yang bisa dia baca.
 */
function normalizeDateToIso(value: string): string {
  const raw = value.trim();
  if (!raw || raw === '-' || raw === '0000-00-00' || raw.startsWith('0000')) return '';
  const normalized = raw.split(' ').slice(0, 1)[0]?.replace(/\//g, '-') ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const dmy = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // "12 Oktober 2026"
  const idMatch = raw.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
  if (idMatch) {
    const month = ID_MONTHS[idMatch[2]!.toLowerCase()];
    if (month) return `${idMatch[3]}-${month}-${idMatch[1]!.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function isDateWithinRange(value: string, start: string, end: string): boolean {
  const current = normalizeDateToIso(value);
  if (!current) return !start && !end;
  if (start && current < start) return false;
  if (end && current > end) return false;
  return true;
}

interface SoSummary { asset_total: number; asset_checked: number; bom_total: number; bom_checked: number }

function extractSummaryFromHeader(row: Record<string, unknown>): SoSummary {
  return {
    asset_total: toInt(readValue(row, ['asset_total', 'TotalAsset', 'total_asset', 'totalAsset'])),
    asset_checked: toInt(readValue(row, ['asset_checked', 'AssetChecked', 'assetChecked'])),
    bom_total: toInt(readValue(row, ['bom_total', 'TotalBOM', 'total_bom', 'totalBOM'])),
    bom_checked: toInt(readValue(row, ['bom_checked', 'BOMChecked', 'bomChecked'])),
  };
}

async function fetchSummaryByNoSo(noSo: string, type: string, token: string): Promise<SoSummary> {
  const encoded = encodeURIComponent(noSo);
  if (type === 'BOM') {
    const r = await soGet(`/api/no-stock-opname-current-bom/${encoded}`, token);
    const rows = r.ok ? extractList(r.body) : [];
    let assetChecked = 0;
    let bomTotal = 0;
    let bomChecked = 0;
    for (const row of rows) {
      const partsCount = toInt(readValue(row, ['partsCount', 'parts_count']));
      const qtyFound = toInt(readValue(row, ['qtyFound', 'qty_found']));
      bomTotal += partsCount < 0 ? 0 : partsCount;
      bomChecked += qtyFound < 0 ? 0 : qtyFound;
      if (partsCount > 0 && qtyFound >= partsCount) assetChecked++;
    }
    return { asset_total: rows.length, asset_checked: assetChecked, bom_total: bomTotal, bom_checked: bomChecked };
  }

  const [checkedR, pendingR] = await Promise.all([
    soGet(`/api/no-stock-opname/${encoded}`, token),
    soGet(`/api/no-stock-opname-current/${encoded}`, token),
  ]);
  const checked = checkedR.ok ? extractList(checkedR.body) : [];
  const pending = pendingR.ok ? extractList(pendingR.body) : [];
  return { asset_total: checked.length + pending.length, asset_checked: checked.length, bom_total: 0, bom_checked: 0 };
}

export interface StockOpnameListParams {
  noSo?: string; type?: string; dateFrom?: string; dateTo?: string; company?: string;
  page: number; perPage: number;
}

export interface StockOpnameListResult {
  rows: Record<string, unknown>[];
  total: number;
}

export async function getStockOpnameReport(token: string, params: StockOpnameListParams): Promise<StockOpnameListResult> {
  const listR = await soGet('/api/no-stock-opname', token);
  if (!listR.ok) throw new Error('SO_SERVICE_UNREACHABLE');
  const rawRows = extractList(listR.body);

  const noSoFilter = (params.noSo ?? '').trim().toLowerCase();
  const typeFilter = (params.type ?? '').trim().toUpperCase();
  const companyFilter = (params.company ?? '').trim().toLowerCase();
  const dateFrom = (params.dateFrom ?? '').trim();
  const dateTo = (params.dateTo ?? '').trim();

  const prepared: { no_so: string; type: string; tanggal: string; locked_date: string; header: Record<string, unknown> }[] = [];
  for (const row of rawRows) {
    const noSo = readValue(row, ['NoSO', 'no_so', 'noso']);
    if (!noSo) continue;
    const isBom = isTruthy(readValue(row, ['IsBOM', 'is_bom']));
    const type = isBom ? 'BOM' : 'ASSET';
    if (typeFilter && type !== typeFilter) continue;
    if (noSoFilter && !noSo.toLowerCase().includes(noSoFilter)) continue;

    const rawDate = readValue(row, ['Tanggal', 'tanggal', 'date', 'created_at']);
    if (!isDateWithinRange(rawDate, dateFrom, dateTo)) continue;

    if (companyFilter) {
      const companies = readListValue(row, ['companies', 'Companies', 'company', 'CompanyName']);
      if (!companies.some((c) => c.toLowerCase().includes(companyFilter))) continue;
    }

    prepared.push({
      no_so: noSo,
      type,
      tanggal: normalizeDateToIso(rawDate) || rawDate,
      locked_date: normalizeDateToIso(readValue(row, ['LockedDate', 'locked_date'])),
      header: row,
    });
  }

  // Sama kayak mobile: hindari badai request N+1 ke service SO kalau hasil
  // filternya masih banyak baris dan user belum nyari No. SO spesifik —
  // count-nya tampil 0 dulu, baru lengkap begitu user mempersempit filter.
  const shouldFetchSummary = prepared.length <= 20 || noSoFilter !== '';

  const rows: Record<string, unknown>[] = [];
  for (const p of prepared) {
    let summary = extractSummaryFromHeader(p.header);
    if (shouldFetchSummary && summary.asset_total === 0 && summary.bom_total === 0) {
      summary = await fetchSummaryByNoSo(p.no_so, p.type, token);
    }
    rows.push({
      no_so: p.no_so,
      tanggal: p.tanggal,
      type: p.type,
      locked_date: p.locked_date,
      asset_total: summary.asset_total,
      asset_checked: summary.asset_checked,
      bom_total: summary.bom_total,
      bom_checked: summary.bom_checked,
    });
  }

  rows.sort((a, b) => String(b.tanggal ?? '').localeCompare(String(a.tanggal ?? '')));

  const total = rows.length;
  const start = (params.page - 1) * params.perPage;
  return { rows: rows.slice(start, start + params.perPage), total };
}

export interface StockOpnamePdf { buffer: Buffer; contentType: string; fileName: string }

export async function getStockOpnamePdf(token: string, noSo: string): Promise<StockOpnamePdf> {
  const listR = await soGet('/api/no-stock-opname', token);
  if (!listR.ok) throw new Error('SO_SERVICE_UNREACHABLE');
  const header = extractList(listR.body).find((row) => readValue(row, ['NoSO', 'no_so', 'noso']) === noSo);
  if (!header) throw new Error('SO_NOT_FOUND');
  const isBom = isTruthy(readValue(header, ['IsBOM', 'is_bom']));
  const path = isBom
    ? `/api/report-so-bom/${encodeURIComponent(noSo)}/pdf`
    : `/api/report/${encodeURIComponent(noSo)}/pdf`;

  const res = await fetch(`${SO_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('SO_PDF_FAILED');
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get('content-type') ?? 'application/pdf', fileName: `Laporan_SO_${noSo}.pdf` };
}
