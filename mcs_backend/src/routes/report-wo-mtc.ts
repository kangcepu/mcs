import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { rows } from '../db.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import { escapeHtml, htmlToPdf, reportPdfShell } from '../lib/pdf.js';
import { DOMAINS, fetchSummary, fetchWoRows, formatPercentage, type ReportFilters, type WoDomain } from '../lib/report-wo-mtc.js';

export const reportWoMtcRouter = Router();

const canAccess = requirePermission('recap_wo');

function parseDomain(raw: unknown): WoDomain {
  const value = String(raw);
  if (value === 'meso' || value === 'is' || value === 'operational' || value === 'preventive' || value === 'ga') return value;
  throw new HttpError(400, `Unknown report domain "${value}". Use one of: meso, is, operational, preventive, ga.`);
}

function parseFilters(req: import('express').Request): ReportFilters {
  return {
    company: req.query.company ? String(req.query.company) : undefined,
    idDivision: req.query.id_division ? Number(req.query.id_division) : undefined,
    typeWo: req.query.type_wo ? String(req.query.type_wo) : undefined,
    jobExecutor: req.query.job_executor ? String(req.query.job_executor) : undefined,
    startDate: req.query.start_date ? String(req.query.start_date) : undefined,
    endDate: req.query.end_date ? String(req.query.end_date) : undefined,
  };
}

reportWoMtcRouter.get('/report-wo-mtc/filters', authenticate, canAccess, asyncHandler(async (_req, res) => {
  const [companies, divisions] = await Promise.all([
    rows('SELECT id_company, company_name FROM tb_company ORDER BY company_name ASC'),
    rows('SELECT id_division, division_code, division_name FROM tb_division ORDER BY division_name ASC'),
  ]);
  ok(res, { companies, divisions, domains: Object.entries(DOMAINS).map(([key, cfg]) => ({ key, label: cfg.label })) }, 'Filter options retrieved successfully');
}));

reportWoMtcRouter.get('/report-wo-mtc/:domain', authenticate, canAccess, asyncHandler(async (req, res) => {
  const domain = parseDomain(req.params.domain);
  const filters = parseFilters(req);
  const [items, summary] = await Promise.all([fetchWoRows(domain, filters), fetchSummary(domain, filters)]);
  ok(res, {
    items, total: items.length,
    summary: { ...summary, waiting_pct: formatPercentage(summary.waiting, summary.total), in_progress_pct: formatPercentage(summary.in_progress, summary.total), complete_pct: formatPercentage(summary.complete, summary.total) },
  }, 'Work order report retrieved successfully');
}));

reportWoMtcRouter.get('/report-wo-mtc/:domain/excel', authenticate, canAccess, asyncHandler(async (req, res) => {
  const domain = parseDomain(req.params.domain);
  const cfg = DOMAINS[domain];
  const filters = parseFilters(req);
  const [items, summary] = await Promise.all([fetchWoRows(domain, filters), fetchSummary(domain, filters)]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`REPORT ${cfg.label} ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`);
  sheet.addRow([`WORK ORDER REPORT ${cfg.label}`]).font = { bold: true, size: 14 };
  sheet.addRow(['Total Wo :', summary.total]);
  sheet.addRow(['Waiting :', summary.waiting, formatPercentage(summary.waiting, summary.total)]);
  sheet.addRow(['In Progress :', summary.in_progress, formatPercentage(summary.in_progress, summary.total)]);
  sheet.addRow(['Complete :', summary.complete, formatPercentage(summary.complete, summary.total)]);
  sheet.addRow([]);

  const header = ['No.', 'Wo No.', 'Date', 'Equipment/Asset', 'Job Title', 'Executor', 'Execute Date', 'Closed Date', 'Status', 'Execute Days', 'Closed Days'];
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  items.forEach((item, i) => {
    const row = sheet.addRow([
      i + 1, item.wo_number, item.date, item.asset_name ?? '-', item.job_title, item.executor ?? '-',
      item.execute_at ?? 'Na.', item.closed_at ?? 'Na.', item.status, item.execute_days ?? 'Na.', item.closed_days ?? 'Na.',
    ]);
    row.alignment = { horizontal: 'center' };
  });
  sheet.columns.forEach((col) => { col.width = 18; });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `REPORT ${cfg.label}${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, '-')}.xlsx`;
  res.status(200).set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  }).send(Buffer.from(buffer));
}));

reportWoMtcRouter.get('/report-wo-mtc/:domain/pdf', authenticate, canAccess, asyncHandler(async (req, res) => {
  const domain = parseDomain(req.params.domain);
  const cfg = DOMAINS[domain];
  const filters = parseFilters(req);
  const [items, summary] = await Promise.all([fetchWoRows(domain, filters), fetchSummary(domain, filters)]);

  const rowsHtml = items.length
    ? items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.wo_number)}</td>
        <td>${item.date ? new Date(String(item.date)).toLocaleDateString('id-ID') : '-'}</td>
        <td>${escapeHtml(item.asset_name ?? '-')}</td>
        <td>${escapeHtml(item.job_title)}</td>
        <td>${escapeHtml(item.executor ?? '-')}</td>
        <td>${item.execute_at ? new Date(String(item.execute_at)).toLocaleDateString('id-ID') : 'Na.'}</td>
        <td>${item.closed_at ? new Date(String(item.closed_at)).toLocaleDateString('id-ID') : 'Na.'}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${item.execute_days ?? 'Na.'}</td>
        <td>${item.closed_days ?? 'Na.'}</td>
      </tr>`).join('')
    : '<tr><td colspan="11" style="text-align:center">Tidak ada data</td></tr>';

  const body = `
    <h1>Work Order Report ${escapeHtml(cfg.label)}</h1>
    <div class="summary">
      <div>Total Wo: <strong>${summary.total}</strong></div>
      <div>Waiting: <strong>${summary.waiting}</strong> (${formatPercentage(summary.waiting, summary.total)})</div>
      <div>In Progress: <strong>${summary.in_progress}</strong> (${formatPercentage(summary.in_progress, summary.total)})</div>
      <div>Complete: <strong>${summary.complete}</strong> (${formatPercentage(summary.complete, summary.total)})</div>
    </div>
    <table>
      <thead><tr><th>No</th><th>Wo No</th><th>Date</th><th>Equipment/Asset</th><th>Job Title</th><th>Executor</th><th>Execute Date</th><th>Closed Date</th><th>Status</th><th>Execute Days</th><th>Closed Days</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const pdf = await htmlToPdf(reportPdfShell(`Work Order Report ${cfg.label}`, body), { landscape: true });
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="REPORT ${cfg.label} ${new Date().toISOString().slice(0, 10)}.pdf"`,
  }).send(pdf);
}));
