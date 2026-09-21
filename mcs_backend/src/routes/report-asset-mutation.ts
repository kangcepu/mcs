import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { rows } from '../db.js';
import { asyncHandler, ok } from '../http.js';
import { escapeHtml, htmlToPdf, reportPdfShell } from '../lib/pdf.js';

export const reportAssetMutationRouter = Router();

const canAccess = requirePermission('report_asset_mutation');

async function fetchRecords(assetCode: string, status: string): Promise<Record<string, unknown>[]> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (assetCode) { where += ' AND d.AssetCode = ?'; params.push(assetCode); }
  if (status) { where += ' AND h.status = ?'; params.push(status.toUpperCase()); }

  return rows(
    `SELECT d.id AS detail_id, d.AssetCode, d.AssetName, d.AliasName, d.category,
            h.doc_no, h.date, h.status, h.creator,
            h.company_before, h.location_before, d.company_after, d.location_after, d.mutation_purpose
     FROM asset_mutation_detail d
     JOIN asset_mutation_header h ON h.doc_no = d.doc_no
     ${where}
     ORDER BY h.created_at DESC, d.id DESC`,
    params,
  );
}

reportAssetMutationRouter.get('/report-asset-mutation/assets', authenticate, canAccess, asyncHandler(async (_req, res) => {
  const items = await rows(
    `SELECT DISTINCT d.AssetCode, d.AssetName FROM asset_mutation_detail d ORDER BY d.AssetCode ASC`,
  );
  ok(res, { items, total: items.length }, 'Assets retrieved successfully');
}));

reportAssetMutationRouter.get('/report-asset-mutation/list', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const items = await fetchRecords(assetCode, status);
  ok(res, { items, total: items.length }, 'Asset mutation report retrieved successfully');
}));

reportAssetMutationRouter.get('/report-asset-mutation/pdf', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const items = await fetchRecords(assetCode, status);

  const rowsHtml = items.length
    ? items.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.AssetName)}</td>
        <td>${escapeHtml(r.AssetCode)}</td>
        <td>${escapeHtml(r.company_before)}</td>
        <td>${escapeHtml(r.company_after)}</td>
        <td>${escapeHtml(r.location_before)}</td>
        <td>${escapeHtml(r.location_after)}</td>
        <td>${escapeHtml(r.mutation_purpose)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center">Not Found Data.</td></tr>';

  const body = `
    <h1>Form Mutasi Asset</h1>
    <table>
      <thead><tr><th>No</th><th>Asset Name</th><th>Asset Code</th><th>Company Before</th><th>Company After</th><th>Location Before</th><th>Location After</th><th>Mutation Purpose</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const pdf = await htmlToPdf(reportPdfShell('Form Mutasi Asset', body), { landscape: true });
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="Form Mutasi Asset.pdf"',
  }).send(pdf);
}));
