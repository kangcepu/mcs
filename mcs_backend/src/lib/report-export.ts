import ExcelJS from 'exceljs';
import { HttpError } from '../http.js';
import type { User } from '../types.js';
import { escapeHtml, htmlToPdf, reportPdfShell } from './pdf.js';
import { getAssetReportList, getAssetsHistoryReport } from './reports.js';
import { getWoUnifiedList } from './void-center.js';
import { nowInJakarta } from './daily-control.js';

export type ExportFormat = 'xlsx' | 'pdf';
type Row = Record<string, unknown>;
interface Col { header: string; width: number; value: (row: Row) => string }

const MAX_ROWS = 20000;

const STATUS_LABEL: Record<string, string> = {
  WAIT_KA_DIV: 'Menunggu Ka Div', WAIT_KA_DIV_ITIS: 'Menunggu Ka Div', WAIT_KA_DIV_MTC: 'Menunggu Ka Div',
  WAIT_KA_DIV_HRGA: 'Menunggu Ka Div', WAIT_KA_DEPT_MESO: 'Menunggu Ka Dept', WAIT_EXECUTOR_ADMIN: 'Menunggu Admin',
  IN_PROGRESS_EXECUTOR: 'Dalam Proses', WAITING_PARTS: 'Menunggu Part', PARTS_RECEIVED: 'Part Diterima', COMPLETE_EXECUTOR: 'Selesai Dikerjakan',
  NEED_CLOSED: 'Perlu Ditutup', COMPLETE: 'Selesai', CLOSED: 'Ditutup', VOID: 'Void', REJECT: 'Ditolak', DECLINE: 'Ditolak',
  FROM_MAINTENANCE: 'Dari Maintenance', FORWARD_TO_MESO: 'Diteruskan ke MESO',
};

function pick(row: Row, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && v !== '') return String(v);
  }
  return '';
}

function fmtDate(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  if (!s || s.startsWith('0000')) return '';
  return s.slice(0, 10);
}

function humanizeStatus(value: unknown): string {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  return STATUS_LABEL[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function activeLabel(row: Row): string {
  const s = String(row.active ?? row.is_active ?? '').toLowerCase();
  if (s === 'active' || s === '1' || s === 'aktif') return 'Aktif';
  if (s === 'inactive' || s === '0' || s === 'nonaktif') return 'Nonaktif';
  return s || '-';
}

const ASSET_COLS: Col[] = [
  { header: 'Kode Asset', width: 22, value: (r) => pick(r, ['AssetCode']) },
  { header: 'Nama', width: 34, value: (r) => pick(r, ['AssetName']) },
  { header: 'Alias', width: 22, value: (r) => pick(r, ['AliasName']) },
  { header: 'Brand', width: 16, value: (r) => pick(r, ['brand']) },
  { header: 'Company', width: 14, value: (r) => pick(r, ['CompanyName']) },
  { header: 'Lokasi', width: 22, value: (r) => pick(r, ['LocationAsset']) },
  { header: 'Kategori', width: 22, value: (r) => pick(r, ['CategoryAsset']) },
  { header: 'Status', width: 12, value: activeLabel },
];

const WO_ASSET = (r: Row): string => [pick(r, ['asset_name', 'AssetName']), pick(r, ['asset_code', 'AssetCode'])].filter(Boolean).join(' - ');

const HISTORY_COLS: Col[] = [
  { header: 'No. WO', width: 24, value: (r) => pick(r, ['wo_number']) },
  { header: 'Tanggal', width: 12, value: (r) => fmtDate(r.date) },
  { header: 'Asset', width: 36, value: WO_ASSET },
  { header: 'Pekerjaan', width: 40, value: (r) => pick(r, ['job_title', 'title']) },
  { header: 'Tipe', width: 16, value: (r) => pick(r, ['type_wo']) },
  { header: 'Status', width: 22, value: (r) => humanizeStatus(r.status) },
  { header: 'PIC / Exec', width: 16, value: (r) => pick(r, ['pic', 'job_executor']) },
  { header: 'Company', width: 12, value: (r) => pick(r, ['company']) },
];

const RECAP_COLS: Col[] = [
  { header: 'No. WO', width: 24, value: (r) => pick(r, ['wo_number']) },
  { header: 'Tanggal', width: 12, value: (r) => fmtDate(r.date) },
  { header: 'Modul', width: 12, value: (r) => pick(r, ['module_label', 'module']).toUpperCase() },
  { header: 'Asset', width: 36, value: WO_ASSET },
  { header: 'Pekerjaan', width: 40, value: (r) => pick(r, ['job_title', 'title']) },
  { header: 'Tipe', width: 16, value: (r) => pick(r, ['type_wo']) },
  { header: 'Prioritas', width: 12, value: (r) => pick(r, ['priority']) },
  { header: 'Status', width: 22, value: (r) => humanizeStatus(r.status) },
  { header: 'PIC / Exec', width: 16, value: (r) => pick(r, ['pic', 'job_executor']) },
  { header: 'Company', width: 12, value: (r) => pick(r, ['company']) },
];

interface Source { title: string; cols: Col[]; fetchPage: (page: number) => Promise<{ data: Row[]; meta: Record<string, unknown> }> }

function buildSource(report: string, query: Record<string, string>, user: User): Source {
  const q = (key: string): string => query[key] ?? '';
  if (report === 'assets' || report === 'list-of-assets') {
    return {
      title: report === 'assets' ? 'Report Assets' : 'List Of Asset',
      cols: ASSET_COLS,
      fetchPage: (page) => getAssetReportList({ q: q('q'), company: q('company'), location: q('location'), category: q('category'), active: q('active') || (['active', 'inactive'].includes(q('status')) ? q('status') : ''), page, per_page: 100 }),
    };
  }
  if (report === 'assets-history') {
    return {
      title: 'Asset History',
      cols: HISTORY_COLS,
      fetchPage: (page) => getAssetsHistoryReport({ asset_code: q('asset_code'), date_from: q('date_from'), date_to: q('date_to'), page, per_page: 500 }),
    };
  }
  if (report === 'recap-work-orders') {
    return {
      title: 'Recap Work Order',
      cols: RECAP_COLS,
      fetchPage: (page) => getWoUnifiedList({
        module: q('module'), date_from: q('date_from'), date_to: q('date_to'), status: q('status'), type_wo: q('type_wo'),
        company: q('company'), priority: q('priority'), shift: q('shift'), id_division: q('id_division'),
        job_executor: q('job_executor'), asset_id: q('asset_id'), q: q('q'), legacy_recap: true, page, per_page: 500,
      }, user) as Promise<{ data: Row[]; meta: Record<string, unknown> }>,
    };
  }
  throw new HttpError(404, 'Report export not found', 'REPORT_NOT_FOUND');
}

async function collectRows(source: Source): Promise<Row[]> {
  const all: Row[] = [];
  for (let page = 1; page <= 200; page += 1) {
    const { data, meta } = await source.fetchPage(page);
    all.push(...data);
    const totalPages = Number(meta.total_pages ?? 1);
    if (!data.length || page >= totalPages || all.length >= MAX_ROWS) break;
  }
  return all.slice(0, MAX_ROWS);
}

export async function buildReportExport(
  report: string, query: Record<string, string>, user: User, format: ExportFormat,
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const source = buildSource(report, query, user);
  const data = await collectRows(source);
  const { date, time } = nowInJakarta();
  const stamp = `${date.replace(/-/g, '')}_${time.slice(0, 5).replace(':', '')}`;
  const fileName = `${source.title.replace(/\s+/g, '_')}_${stamp}`;

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(source.title.slice(0, 31));
    sheet.columns = source.cols.map((c) => ({ header: c.header, width: c.width }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of data) sheet.addRow(source.cols.map((c) => c.value(row)));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${fileName}.xlsx` };
  }

  const head = source.cols.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('');
  const body = data.map((row) => `<tr>${source.cols.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join('')}</tr>`).join('');
  const html = reportPdfShell(source.title, `<h1>${escapeHtml(source.title)}</h1><div class="subtitle">Dicetak ${escapeHtml(`${date} ${time}`)} &middot; ${data.length} baris</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  const buffer = await htmlToPdf(html, { landscape: true, paperWidth: 11.7, paperHeight: 8.27 });
  return { buffer, contentType: 'application/pdf', fileName: `${fileName}.pdf` };
}
