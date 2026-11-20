import ExcelJS from 'exceljs';
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const preventiveNcrRouter = Router();

const canRead = requirePermission('list_of_asset', 'wo_preventive', 'preventive_alarm', 'approval_all', 'privilage_asset');
const canManage = requirePermission('wo_preventive', 'approval_all', 'privilage_asset');
const VALID_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED', 'CANCELLED']);

async function ensureFeature(): Promise<void> {
  if (!(await tableExists('preventive_ncr'))) {
    throw new HttpError(503, 'Preventive NCR belum tersedia. Jalankan migration 20261120_preventive_ncr_foundation.sql.');
  }
}

function filters(query: Record<string, unknown>): { where: string; params: unknown[] } {
  const clauses = ['1=1'];
  const params: unknown[] = [];
  const q = String(query.q ?? '').trim();
  const status = String(query.status ?? '').trim().toUpperCase();
  const type = String(query.type ?? '').trim().toUpperCase();
  const moduleCode = String(query.module ?? '').trim().toUpperCase();
  const company = String(query.company ?? '').trim();
  const dateFrom = String(query.date_from ?? '').trim();
  const dateTo = String(query.date_to ?? '').trim();
  if (q) {
    clauses.push('(n.ncr_number LIKE ? OR n.wo_number LIKE ? OR n.trigger_wo_number LIKE ? OR n.asset_code LIKE ? OR n.title LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  if (status) { clauses.push('n.status=?'); params.push(status); }
  if (type) { clauses.push('n.ncr_type=?'); params.push(type); }
  if (moduleCode) { clauses.push('n.module_code=?'); params.push(moduleCode); }
  if (company) { clauses.push('a.CompanyName=?'); params.push(company); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) { clauses.push('n.planned_date>=?'); params.push(dateFrom); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) { clauses.push('n.planned_date<=?'); params.push(dateTo); }
  return { where: clauses.join(' AND '), params };
}

const SELECT_SQL = `SELECT n.*,a.AssetName,a.CompanyName,
  (SELECT COUNT(*) FROM preventive_ncr_action x WHERE x.ncr_id=n.id) AS action_count
  FROM preventive_ncr n LEFT JOIN asset a ON a.AssetID=n.asset_id`;

preventiveNcrRouter.get('/preventive-ncr', authenticate, canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? 25)));
  const { where, params } = filters(req.query as Record<string, unknown>);
  const total = Number((await one<{ total: number }>(`SELECT COUNT(*) total FROM preventive_ncr n LEFT JOIN asset a ON a.AssetID=n.asset_id WHERE ${where}`, params))?.total ?? 0);
  const items = await rows<Record<string, unknown>>(
    `${SELECT_SQL} WHERE ${where} ORDER BY FIELD(n.status,'OPEN','IN_PROGRESS','PENDING_VERIFICATION','CLOSED','CANCELLED'),n.detected_at DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  const summary = await one<Record<string, number>>(
    `SELECT COUNT(*) total,
      SUM(status='OPEN') open_count,SUM(status='IN_PROGRESS') in_progress_count,
      SUM(status='PENDING_VERIFICATION') pending_verification_count,SUM(status='CLOSED') closed_count,
      SUM(ncr_type='MISSED_SCHEDULE') missed_count,SUM(ncr_type='LATE_COMPLETION') late_count
     FROM preventive_ncr`,
  );
  ok(res, { items, summary }, 'Preventive NCR retrieved', {
    page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
}));

preventiveNcrRouter.get('/preventive-ncr/options', authenticate, canRead, asyncHandler(async (_req, res) => {
  await ensureFeature();
  const companies = await rows<{ value: string }>(
    `SELECT DISTINCT a.CompanyName value FROM preventive_ncr n JOIN asset a ON a.AssetID=n.asset_id
     WHERE a.CompanyName IS NOT NULL AND a.CompanyName<>'' ORDER BY a.CompanyName`,
  );
  ok(res, { companies: companies.map((item) => item.value) });
}));

preventiveNcrRouter.get('/preventive-ncr/:id', authenticate, canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = Number(req.params.id);
  const item = await one<Record<string, unknown>>(`${SELECT_SQL} WHERE n.id=?`, [id]);
  if (!item) throw new HttpError(404, 'NCR preventive tidak ditemukan.');
  const actions = await rows<Record<string, unknown>>('SELECT * FROM preventive_ncr_action WHERE ncr_id=? ORDER BY acted_at DESC,id DESC', [id]);
  const evidence = await rows<Record<string, unknown>>('SELECT * FROM preventive_ncr_evidence WHERE ncr_id=? ORDER BY created_at DESC,id DESC', [id]);
  ok(res, { ...item, actions, evidence });
}));

preventiveNcrRouter.patch('/preventive-ncr/:id', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureFeature();
  const user = (req as AuthRequest).user!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, 'ID NCR tidak valid.');
  const requestedStatus = String(req.body.status ?? '').trim().toUpperCase();
  if (requestedStatus && !VALID_STATUSES.has(requestedStatus)) throw new HttpError(422, 'Status NCR tidak valid.');
  const text = (value: unknown, max = 10000): string | null => {
    const result = String(value ?? '').trim();
    if (result.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
    return result || null;
  };
  const updated = await transaction(async (connection) => {
    const [locked] = await connection.query<RowDataPacket[]>('SELECT * FROM preventive_ncr WHERE id=? FOR UPDATE', [id]);
    const current = locked[0];
    if (!current) throw new HttpError(404, 'NCR preventive tidak ditemukan.');
    const nextStatus = requestedStatus || String(current.status);
    const assignedTo = req.body.assigned_to === undefined ? current.assigned_to : text(req.body.assigned_to, 120);
    const rootCause = req.body.root_cause === undefined ? current.root_cause : text(req.body.root_cause);
    const correctiveAction = req.body.corrective_action === undefined ? current.corrective_action : text(req.body.corrective_action);
    const preventiveAction = req.body.preventive_action === undefined ? current.preventive_action : text(req.body.preventive_action);
    const resolutionNote = req.body.resolution_note === undefined ? current.resolution_note : text(req.body.resolution_note);
    await connection.execute(
      `UPDATE preventive_ncr SET status=?,assigned_to=?,root_cause=?,corrective_action=?,preventive_action=?,resolution_note=?,
       verified_by=IF(?='PENDING_VERIFICATION',NULL,verified_by),verified_at=IF(?='PENDING_VERIFICATION',NULL,verified_at),
       closed_by=IF(?='CLOSED',?,NULL),closed_at=IF(?='CLOSED',NOW(),NULL),updated_by=?,updated_at=NOW() WHERE id=?`,
      [nextStatus, assignedTo, rootCause, correctiveAction, preventiveAction, resolutionNote,
        nextStatus, nextStatus, nextStatus, user.fullname, nextStatus, user.fullname, id] as never,
    );
    await connection.execute(
      `INSERT INTO preventive_ncr_action (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at)
       VALUES (?,?,?,?,?,?,NOW())`,
      [id, 'WORKFLOW_UPDATE', current.status, nextStatus, text(req.body.action_note, 2000) ?? 'NCR diperbarui', user.fullname] as never,
    );
    return { id, status: nextStatus };
  });
  ok(res, updated, 'Preventive NCR updated');
}));

preventiveNcrRouter.get('/preventive-ncr-report/export', authenticate, canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const { where, params } = filters(req.query as Record<string, unknown>);
  const items = await rows<Record<string, unknown>>(`${SELECT_SQL} WHERE ${where} ORDER BY n.detected_at DESC`, params);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MCS';
  const sheet = workbook.addWorksheet('Preventive NCR');
  sheet.columns = [
    { header: 'NCR Number', key: 'ncr_number', width: 24 }, { header: 'Type', key: 'ncr_type', width: 22 },
    { header: 'Severity', key: 'severity', width: 12 }, { header: 'Module', key: 'module_code', width: 16 },
    { header: 'WO Number', key: 'wo_number', width: 28 }, { header: 'Trigger WO', key: 'trigger_wo_number', width: 28 },
    { header: 'Asset Code', key: 'asset_code', width: 22 }, { header: 'Asset Name', key: 'AssetName', width: 30 },
    { header: 'Company', key: 'CompanyName', width: 18 }, { header: 'Planned Date', key: 'planned_date', width: 15 },
    { header: 'Actual Completion', key: 'actual_completion_date', width: 21 }, { header: 'Variance Days', key: 'variance_days', width: 14 },
    { header: 'Status', key: 'status', width: 22 }, { header: 'Assigned To', key: 'assigned_to', width: 24 },
    { header: 'Title', key: 'title', width: 42 }, { header: 'Root Cause', key: 'root_cause', width: 40 },
    { header: 'Corrective Action', key: 'corrective_action', width: 40 }, { header: 'Preventive Action', key: 'preventive_action', width: 40 },
    { header: 'Detected At', key: 'detected_at', width: 21 }, { header: 'Closed At', key: 'closed_at', width: 21 },
  ];
  items.forEach((item) => sheet.addRow(item));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'T1' };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Preventive-NCR-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));
