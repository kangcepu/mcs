import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { rows, one } from '../db.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import { escapeHtml, htmlToPdf, reportPdfShell } from '../lib/pdf.js';

export const reportEquipmentRouter = Router();

const canAccess = requirePermission('report_asset_history');

const WO_SOURCES: { table: string; label: string }[] = [
  { table: 'tb_wo_mtc', label: 'MTC' },
  { table: 'tb_wo_it', label: 'IT' },
  { table: 'tb_wo_mtc_operational', label: 'OPERATIONAL' },
  { table: 'tb_wo_preventive', label: 'PREVENTIVE' },
];

const STATUS_LABELS: Record<string, string> = {
  WAIT_KA_DIV: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_MTC: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_ITIS: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_HRGA: 'Menunggu Ka. Divisi',
  WAIT_KA_DEPT_MESO: 'Menunggu Ka. Dept. MESO',
  WAIT_EXECUTOR_ADMIN: 'Menunggu Admin Executor',
  IN_PROGRESS_EXECUTOR: 'Dikerjakan Executor',
  WAITING_PARTS: 'Menunggu Part',
  PARTS_RECEIVED: 'Part Diterima',
  NEED_CLOSED: 'Perlu Ditutup',
  COMPLETE_EXECUTOR: 'Selesai (Executor)',
  COMPLETE: 'Selesai',
  CLOSED: 'Ditutup',
  DECLINE: 'Ditolak',
  REJECT: 'Ditolak',
  VOID: 'Dibatalkan',
  CHECKING_KA_DEPT_MESO: 'Pemeriksaan Ka. Dept. MESO',
  FORWARD_TO_MESO: 'Dilimpahkan ke MESO',
};

function mapStatus(status: string | null | undefined): string {
  const s = String(status ?? '').toUpperCase();
  return STATUS_LABELS[s] ?? s;
}

function parseHours(value: unknown): number {
  const match = String(value ?? '').match(/[\d.,]+/);
  if (!match) return 0;
  return Number(match[0].replace(',', '.')) || 0;
}

async function resolveAsset(assetId: number): Promise<Record<string, unknown>> {
  const asset = await one<Record<string, unknown>>('SELECT AssetID, AssetCode, AssetName, Keterangan FROM asset WHERE AssetID = ?', [assetId]);
  if (!asset) throw new HttpError(404, 'Asset not found');
  return asset;
}

async function buildHistory(assetId: number): Promise<Record<string, unknown>[]> {
  const perTable = await Promise.all(
    WO_SOURCES.map(({ table, label }) =>
      rows<Record<string, unknown>>(
        `SELECT wo_number, type_wo, job_title, job_requirement, status, created_at, updated_at, finished_actual, closedDate, company
         FROM ${table} WHERE type_wo = 'CORRECTIVE MAINTENANCE' AND id_equipment = ? ORDER BY created_at DESC`,
        [assetId],
      ).then((list) => list.map((r): Record<string, unknown> => ({ ...r, wo_source: label }))),
    ),
  );

  const merged = perTable.flat().sort((a, b) => {
    const ta = new Date(String(a.created_at ?? 0)).getTime();
    const tb = new Date(String(b.created_at ?? 0)).getTime();
    return tb - ta;
  });

  if (!merged.length) return [];
  const woNumbers = merged.map((m) => String(m.wo_number));
  const placeholders = woNumbers.map(() => '?').join(',');

  const [explanations, labor, material] = await Promise.all([
    rows<{ wo_number: string; job_explanation: string }>(
      `SELECT wo_number, job_explanation FROM tb_job_executor WHERE wo_number IN (${placeholders}) AND job_explanation <> '' ORDER BY created_at ASC`,
      woNumbers,
    ),
    rows<{ wo_number: string; trade: string; men: string; hours: string; for: string }>(
      `SELECT wo_number, trade, men, hours, \`for\` FROM tb_detail_labor WHERE wo_number IN (${placeholders})`,
      woNumbers,
    ),
    rows<{ wo_number: string; part: string; material_request: string; uom_request: string; material_usage: string; uom_usage: string }>(
      `SELECT wo_number, part, material_request, uom_request, material_usage, uom_usage FROM tb_material_request WHERE wo_number IN (${placeholders})`,
      woNumbers,
    ),
  ]);

  const explanationsByWo = new Map<string, string[]>();
  for (const e of explanations) {
    const list = explanationsByWo.get(e.wo_number) ?? [];
    list.push(e.job_explanation);
    explanationsByWo.set(e.wo_number, list);
  }
  const laborByWo = new Map<string, typeof labor>();
  for (const l of labor) {
    const list = laborByWo.get(l.wo_number) ?? [];
    list.push(l);
    laborByWo.set(l.wo_number, list);
  }
  const materialByWo = new Map<string, typeof material>();
  for (const m of material) {
    const list = materialByWo.get(m.wo_number) ?? [];
    list.push(m);
    materialByWo.set(m.wo_number, list);
  }

  return merged.map((wo) => {
    const woNumber = String(wo.wo_number);
    const laborRows = laborByWo.get(woNumber) ?? [];
    const totalHours = laborRows.reduce((sum, l) => sum + parseHours(l.hours), 0);
    const status = String(wo.status ?? '').toUpperCase();
    const closedAt = status === 'CLOSED' ? (wo.closedDate ?? wo.finished_actual ?? null) : (wo.finished_actual ?? null);

    return {
      wo_number: woNumber,
      type_wo: wo.type_wo,
      wo_source: wo.wo_source,
      job_title: wo.job_title ?? '',
      job_requirement: wo.job_requirement ?? '',
      job_explanation: (explanationsByWo.get(woNumber) ?? []).join(' | '),
      status,
      status_label: mapStatus(status),
      created_at: wo.created_at,
      closed_at: closedAt,
      company: wo.company ?? null,
      labor: laborRows,
      material: materialByWo.get(woNumber) ?? [],
      total_labor_hours: totalHours,
    };
  });
}

reportEquipmentRouter.get('/report-equipment/assets', authenticate, canAccess, asyncHandler(async (_req, res) => {
  const items = await rows('SELECT AssetID, AssetCode, AssetName, CompanyName, LocationAsset FROM asset ORDER BY AssetCode ASC');
  ok(res, { items, total: items.length }, 'Assets retrieved successfully');
}));

reportEquipmentRouter.get('/report-equipment/history', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetId = Number(req.query.asset_id ?? 0);
  if (!assetId) throw new HttpError(400, 'asset_id is required');

  const asset = await resolveAsset(assetId);
  const history = await buildHistory(assetId);
  ok(res, { asset, total_records: history.length, history }, 'Equipment history retrieved successfully');
}));

reportEquipmentRouter.get('/report-equipment/history/pdf', authenticate, canAccess, asyncHandler(async (req, res) => {
  const assetId = Number(req.query.asset_id ?? 0);
  if (!assetId) throw new HttpError(400, 'asset_id is required');

  const asset = await resolveAsset(assetId);
  const history = await buildHistory(assetId);

  const rowsHtml = history.length
    ? history.map((h, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(h.wo_number)}</td>
        <td><span class="badge">${escapeHtml(h.wo_source)}</span></td>
        <td>${escapeHtml(h.job_title)}</td>
        <td>${escapeHtml(h.job_explanation)}</td>
        <td>${h.created_at ? new Date(String(h.created_at)).toLocaleDateString('id-ID') : '-'}</td>
        <td>${h.closed_at ? new Date(String(h.closed_at)).toLocaleDateString('id-ID') : '-'}</td>
        <td>${escapeHtml(h.status_label)}</td>
        <td>${h.total_labor_hours}</td>
      </tr>`).join('')
    : '<tr><td colspan="9" style="text-align:center">Tidak ada data</td></tr>';

  const body = `
    <h1>Kartu Historikal Mesin</h1>
    <div class="subtitle">${escapeHtml(asset.AssetCode)} &mdash; ${escapeHtml(asset.AssetName)}</div>
    <table>
      <thead><tr><th>No</th><th>WO No</th><th>Sumber</th><th>Job Title</th><th>Job Explanation</th><th>Tanggal Dibuat</th><th>Tanggal Selesai</th><th>Status</th><th>Total Jam</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const pdf = await htmlToPdf(reportPdfShell(`Report Equipment - ${asset.AssetName}`, body), { landscape: true });
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Report Equipment - ${asset.AssetName} - ${new Date().toISOString().slice(0, 10)}.pdf"`,
  }).send(pdf);
}));
