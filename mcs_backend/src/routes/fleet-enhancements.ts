import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import type { ResultSetHeader } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import { createFleetCorrectiveWo } from '../lib/fleet-work-order.js';
import type { AuthRequest } from '../types.js';

export const fleetEnhancementsRouter = Router();
const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const evidenceUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: Math.min(config.maxUploadBytes, 10 * 1024 * 1024), files: 8 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(file.mimetype)),
});

function actor(req: AuthRequest): string { return String(req.user?.fullname || req.user?.username || 'SYSTEM').trim(); }
function id(value: unknown, label = 'ID'): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(422, `${label} tidak valid.`); return parsed; }
function text(value: unknown, max = 500): string | null { const result = String(value ?? '').trim(); if (!result) return null; if (result.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`); return result; }
function date(value: unknown, fallback: string): string { const result = String(value ?? fallback); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new HttpError(422, 'Tanggal tidak valid.'); return result; }
function number(prefix: string): string { const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); return `${prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`; }
async function ensureFeature(): Promise<void> { if (!(await tableExists('fleet_preventive_reminder'))) throw new HttpError(503, 'Migration Fleet Enhancement belum dijalankan.'); }
async function audit(vehicleId: number | null, entityType: string, entityId: number, eventType: string, summary: string, user: string, data?: unknown): Promise<void> {
  await transaction(async (connection) => { await connection.execute(
    `INSERT INTO fleet_audit_timeline (vehicle_id,entity_type,entity_id,event_type,event_summary,event_data,actor_name,event_at)
     VALUES (?,?,?,?,?,?,?,NOW())`, [vehicleId, entityType, entityId, eventType, summary, data ? JSON.stringify(data) : null, user]); });
}

fleetEnhancementsRouter.use('/fleet', authenticate);

async function dashboardData(from: string, to: string) {
  const [summary, trend, efficiency, reminders, unsafe, reconciliations] = await Promise.all([
    one<any>(`SELECT
      (SELECT COUNT(*) FROM fleet_vehicle_profile WHERE status='ACTIVE') active_fleet,
      (SELECT COUNT(*) FROM fleet_preventive_reminder WHERE status IN ('OPEN','ACKNOWLEDGED')) preventive_due,
      (SELECT COUNT(*) FROM fleet_daily_inspection WHERE unsafe_to_operate=1 AND status='APPROVED' AND DATE(inspected_at) BETWEEN ? AND ?) unsafe_count,
      (SELECT COUNT(*) FROM fleet_anomaly WHERE status='OPEN') open_anomalies,
      (SELECT COALESCE(SUM(quantity_liter),0) FROM fleet_fuel_transaction WHERE status='APPROVED' AND DATE(fueled_at) BETWEEN ? AND ?) fuel_liter,
      (SELECT COALESCE(AVG(efficiency_value),0) FROM fleet_fuel_transaction WHERE status='APPROVED' AND efficiency_value IS NOT NULL AND DATE(fueled_at) BETWEEN ? AND ?) avg_efficiency`, [from, to, from, to, from, to]),
    rows<any>(`SELECT DATE(fueled_at) period_date,COUNT(*) transaction_count,SUM(quantity_liter) fuel_liter,
      AVG(efficiency_value) avg_efficiency,SUM(distance_or_hours) distance_or_hours
      FROM fleet_fuel_transaction WHERE status='APPROVED' AND DATE(fueled_at) BETWEEN ? AND ?
      GROUP BY DATE(fueled_at) ORDER BY period_date`, [from, to]),
    rows<any>(`SELECT v.id,a.AssetCode,a.AssetName,v.vehicle_type,v.meter_type,v.fuel_efficiency_target,v.fuel_efficiency_minimum,
      COUNT(f.id) transaction_count,COALESCE(SUM(f.quantity_liter),0) fuel_liter,
      COALESCE(SUM(f.distance_or_hours),0) distance_or_hours,COALESCE(AVG(f.efficiency_value),0) avg_efficiency
      FROM fleet_vehicle_profile v JOIN asset a ON a.AssetID=v.asset_id
      LEFT JOIN fleet_fuel_transaction f ON f.vehicle_id=v.id AND f.status='APPROVED' AND DATE(f.fueled_at) BETWEEN ? AND ?
      GROUP BY v.id,a.AssetCode,a.AssetName,v.vehicle_type,v.meter_type,v.fuel_efficiency_target,v.fuel_efficiency_minimum
      ORDER BY avg_efficiency ASC`, [from, to]),
    rows<any>(`SELECT r.*,a.AssetCode,a.AssetName,v.meter_type,l.wo_number,l.wo_module
      FROM fleet_preventive_reminder r JOIN fleet_vehicle_profile v ON v.id=r.vehicle_id JOIN asset a ON a.AssetID=v.asset_id
      LEFT JOIN fleet_work_order_link l ON l.source_type='REMINDER' AND l.source_id=r.id
      WHERE r.status IN ('OPEN','ACKNOWLEDGED') ORDER BY COALESCE(r.due_date,'9999-12-31'),r.created_at`),
    rows<any>(`SELECT i.id,i.inspection_number,i.inspected_at,a.AssetCode,a.AssetName,l.wo_number
      FROM fleet_daily_inspection i JOIN fleet_vehicle_profile v ON v.id=i.vehicle_id JOIN asset a ON a.AssetID=v.asset_id
      LEFT JOIN fleet_work_order_link l ON l.source_type='INSPECTION' AND l.source_id=i.id
      WHERE i.unsafe_to_operate=1 AND i.status='APPROVED' AND DATE(i.inspected_at) BETWEEN ? AND ? ORDER BY i.inspected_at DESC`, [from, to]),
    rows<any>(`SELECT r.*,a.AssetCode,a.AssetName,t.tank_number FROM fleet_fuel_reconciliation r
      JOIN energy_fuel_tank t ON t.id=r.fuel_tank_id JOIN energy_asset_profile p ON p.id=t.energy_profile_id
      JOIN asset a ON a.AssetID=p.asset_id ORDER BY r.created_at DESC LIMIT 20`),
  ]);
  return { filters: { date_from: from, date_to: to }, summary, trend, efficiency, reminders, unsafe, reconciliations };
}

fleetEnhancementsRouter.get('/fleet/dashboard', canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  ok(res, await dashboardData(date(req.query.date_from, monthAgo), date(req.query.date_to, today)));
}));

fleetEnhancementsRouter.post('/fleet/preventive-reminders/refresh', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature();
  const user = actor(req);
  const result = await transaction(async (connection) => {
    await connection.execute(`UPDATE fleet_preventive_reminder r
      SET r.status='RESOLVED',r.resolved_by=?,r.resolved_at=NOW(),r.updated_at=NOW()
      WHERE r.status IN ('OPEN','ACKNOWLEDGED') AND EXISTS (
        SELECT 1 FROM fleet_service_history s WHERE s.vehicle_id=r.vehicle_id AND s.service_type='PREVENTIVE'
        AND s.status='COMPLETED' AND s.completed_at>r.created_at)`, [user]);
    const [dueRows] = await connection.query(`SELECT v.id vehicle_id,v.current_meter,v.preventive_interval_days,v.preventive_interval_meter,
      MAX(s.id) last_service_id,MAX(s.completed_at) last_preventive_at,
      (SELECT s2.meter_value FROM fleet_service_history s2 WHERE s2.vehicle_id=v.id AND s2.service_type='PREVENTIVE' AND s2.status='COMPLETED' ORDER BY s2.completed_at DESC LIMIT 1) last_meter
      FROM fleet_vehicle_profile v LEFT JOIN fleet_service_history s ON s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED'
      WHERE v.status='ACTIVE' GROUP BY v.id,v.current_meter,v.preventive_interval_days,v.preventive_interval_meter`);
    let inserted = 0;
    for (const item of dueRows as any[]) {
      const serviceKey = item.last_service_id ?? 'INITIAL';
      const dueByDay = Number(item.preventive_interval_days ?? 0) > 0 && (!item.last_preventive_at || new Date().getTime() >= new Date(item.last_preventive_at).getTime() + Number(item.preventive_interval_days) * 86400000);
      const dueMeter = Number(item.last_meter ?? 0) + Number(item.preventive_interval_meter ?? 0);
      const dueByMeter = Number(item.preventive_interval_meter ?? 0) > 0 && Number(item.current_meter) >= dueMeter;
      for (const trigger of [dueByDay ? 'DATE' : null, dueByMeter ? 'METER' : null].filter(Boolean) as string[]) {
        const reminderKey = `${item.vehicle_id}:${trigger}:${serviceKey}`;
        const [save] = await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO fleet_preventive_reminder
          (vehicle_id,reminder_key,trigger_type,due_date,due_meter,current_meter,status,note,created_at)
          VALUES (?,?,?,${trigger === 'DATE' ? "DATE_ADD(COALESCE(?,CURDATE()),INTERVAL ? DAY)" : 'NULL'},?,?, 'OPEN',?,NOW())`,
          trigger === 'DATE'
            ? [item.vehicle_id, reminderKey, trigger, item.last_preventive_at, item.preventive_interval_days, null, item.current_meter, 'Preventive jatuh tempo berdasarkan tanggal.']
            : [item.vehicle_id, reminderKey, trigger, dueMeter, item.current_meter, 'Preventive jatuh tempo berdasarkan odometer/hour meter.']);
        inserted += save.affectedRows;
      }
    }
    return inserted;
  });
  await audit(null, 'REMINDER_BATCH', 0, 'REMINDER_REFRESH', `${result} reminder preventive baru dibuat`, user);
  ok(res, { created: result }, 'Reminder preventive berhasil diperbarui.');
}));

fleetEnhancementsRouter.post('/fleet/preventive-reminders/:id/work-order', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const reminderId = id(req.params.id, 'Reminder');
  const wo = await transaction(async (connection) => {
    const [found] = await connection.query(`SELECT r.*,v.asset_id,a.AssetName,a.CompanyName FROM fleet_preventive_reminder r
      JOIN fleet_vehicle_profile v ON v.id=r.vehicle_id JOIN asset a ON a.AssetID=v.asset_id WHERE r.id=? FOR UPDATE`, [reminderId]);
    const reminder = (found as any[])[0]; if (!reminder) throw new HttpError(404, 'Reminder tidak ditemukan.');
    const result = await createFleetCorrectiveWo(connection, { vehicleId: reminder.vehicle_id, assetId: reminder.asset_id,
      company: reminder.CompanyName, sourceType: 'REMINDER', sourceId: reminderId, priority: 'High', user: req.user!,
      title: `Preventive Fleet due - ${reminder.AssetName}`,
      requirement: `Preventive Fleet jatuh tempo berdasarkan ${reminder.trigger_type === 'METER' ? 'odometer/hour meter' : 'tanggal'}.`, });
    await connection.execute(`UPDATE fleet_preventive_reminder SET status='ACKNOWLEDGED',acknowledged_by=?,acknowledged_at=NOW(),updated_at=NOW() WHERE id=?`, [actor(req), reminderId]);
    return result;
  });
  created(res, { wo_number: wo }, 'WO Fleet berhasil dibuat dan ditautkan.');
}));

fleetEnhancementsRouter.post('/fleet/work-orders/link', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const sourceType = String(req.body.source_type ?? '').toUpperCase();
  if (!['INSPECTION','REMINDER','ANOMALY','SERVICE'].includes(sourceType)) throw new HttpError(422, 'Sumber WO tidak valid.');
  const sourceId = id(req.body.source_id, 'Source ID'); const vehicleId = id(req.body.vehicle_id, 'Fleet asset');
  const woNumber = text(req.body.wo_number, 120); if (!woNumber) throw new HttpError(422, 'Nomor WO wajib diisi.');
  const exists = await one('SELECT wo_number FROM tb_wo_mtc WHERE wo_number=? UNION SELECT wo_number FROM tb_wo_preventive WHERE wo_number=? LIMIT 1', [woNumber, woNumber]);
  if (!exists) throw new HttpError(422, 'Nomor WO tidak ditemukan.');
  const saved = await transaction(async (connection) => { const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO fleet_work_order_link (vehicle_id,source_type,source_id,wo_module,wo_number,link_type,link_note,created_by,created_at)
     VALUES (?,?,?,'MESO',?,'MANUAL_LINK',?,?,NOW())`, [vehicleId, sourceType, sourceId, woNumber, text(req.body.note), actor(req)]); return result.insertId; });
  await audit(vehicleId, sourceType, sourceId, 'WO_LINKED', `WO ${woNumber} ditautkan`, actor(req));
  created(res, { id: saved }, 'WO berhasil ditautkan.');
}));

fleetEnhancementsRouter.get('/fleet/attachments', canRead, asyncHandler(async (req, res) => {
  await ensureFeature(); const entityType = String(req.query.entity_type ?? '').toUpperCase(); const entityId = id(req.query.entity_id, 'Entity ID');
  const result = await rows<any>('SELECT * FROM fleet_attachment WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC', [entityType, entityId]);
  ok(res, result.map((item) => ({ ...item, url: `/uploads/${String(item.object_key).replace(/^\/+/, '')}` })));
}));

fleetEnhancementsRouter.post('/fleet/attachments', canManage, evidenceUpload.array('files', 8), asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const entityType = String(req.body.entity_type ?? '').toUpperCase();
  if (!['INSPECTION','SERVICE'].includes(entityType)) throw new HttpError(422, 'Evidence hanya untuk inspection atau service.');
  const entityId = id(req.body.entity_id, 'Entity ID'); const table = entityType === 'INSPECTION' ? 'fleet_daily_inspection' : 'fleet_service_history';
  const entity = await one<any>(`SELECT vehicle_id FROM ${table} WHERE id=?`, [entityId]); if (!entity) throw new HttpError(404, 'Data Fleet tidak ditemukan.');
  const files = (req.files as Express.Multer.File[] | undefined) ?? []; if (!files.length) throw new HttpError(422, 'Pilih minimal satu foto/evidence.');
  const saved: any[] = [];
  for (const file of files) {
    const key = await saveUploadedFile(file.buffer, `fleet/${entityType.toLowerCase()}/${entityId}`, file.originalname, file.mimetype);
    const rowId = await transaction(async (connection) => { const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO fleet_attachment (entity_type,entity_id,attachment_type,file_name,object_key,mime_type,file_size,uploaded_by,created_at)
       VALUES (?,?, 'EVIDENCE',?,?,?,?,?,NOW())`, [entityType, entityId, file.originalname, key, file.mimetype, file.size, actor(req)]); return result.insertId; });
    saved.push({ id: rowId, file_name: file.originalname, url: `/uploads/${key}` });
  }
  await audit(entity.vehicle_id, entityType, entityId, 'EVIDENCE_UPLOADED', `${saved.length} evidence diunggah`, actor(req), { files: saved.map((item) => item.file_name) });
  created(res, saved, 'Evidence Fleet berhasil diunggah.');
}));

fleetEnhancementsRouter.delete('/fleet/attachments/:id', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const attachmentId = id(req.params.id, 'Attachment');
  const item = await one<any>('SELECT * FROM fleet_attachment WHERE id=?', [attachmentId]); if (!item) throw new HttpError(404, 'Evidence tidak ditemukan.');
  await transaction(async (connection) => { await connection.execute('DELETE FROM fleet_attachment WHERE id=?', [attachmentId]); });
  await deleteObjectKey(item.object_key); await audit(null, item.entity_type, item.entity_id, 'EVIDENCE_DELETED', `Evidence ${item.file_name} dihapus`, actor(req));
  ok(res, { id: attachmentId }, 'Evidence dihapus.');
}));

async function reconciliationPreview(from: string, to: string, tankId?: number) {
  const params: unknown[] = [from, to, from, to]; let filter = '';
  if (tankId) { filter = ' AND t.id=?'; params.push(tankId); }
  return rows<any>(`SELECT t.id fuel_tank_id,t.tank_number,a.AssetCode,a.AssetName,
    COALESCE((SELECT SUM(f.quantity_liter) FROM fleet_fuel_transaction f WHERE f.fuel_tank_id=t.id AND f.status='APPROVED' AND DATE(f.fueled_at) BETWEEN ? AND ?),0) fleet_transaction_liter,
    COALESCE((SELECT SUM(m.quantity_liter) FROM energy_fuel_movement m WHERE m.fuel_tank_id=t.id AND m.movement_type='CONSUMPTION' AND m.status IN ('APPROVED','LOCKED') AND DATE(m.movement_at) BETWEEN ? AND ? AND (m.reference_number LIKE 'FL-FUEL-%' OR m.destination_type IN ('VEHICLE','FORKLIFT'))),0) tank_movement_liter,
    (SELECT COUNT(*) FROM fleet_fuel_transaction f WHERE f.fuel_tank_id=t.id AND f.status='APPROVED' AND DATE(f.fueled_at) BETWEEN '${from}' AND '${to}' AND f.fuel_movement_id IS NULL) unmatched_transaction_count,
    (SELECT COUNT(*) FROM energy_fuel_movement m LEFT JOIN fleet_fuel_transaction f ON f.fuel_movement_id=m.id WHERE m.fuel_tank_id=t.id AND m.movement_type='CONSUMPTION' AND DATE(m.movement_at) BETWEEN '${from}' AND '${to}' AND (m.reference_number LIKE 'FL-FUEL-%' OR m.destination_type IN ('VEHICLE','FORKLIFT')) AND f.id IS NULL) orphan_movement_count
    FROM energy_fuel_tank t JOIN energy_asset_profile p ON p.id=t.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
    WHERE t.status='ACTIVE'${filter} ORDER BY a.AssetName`, params).then((items) => items.map((item) => ({ ...item, variance_liter: Number(item.tank_movement_liter) - Number(item.fleet_transaction_liter) })));
}

fleetEnhancementsRouter.get('/fleet/fuel-reconciliation/preview', canRead, asyncHandler(async (req, res) => {
  await ensureFeature(); const today = new Date().toISOString().slice(0, 10); const start = `${today.slice(0, 8)}01`;
  ok(res, await reconciliationPreview(date(req.query.date_from, start), date(req.query.date_to, today), req.query.fuel_tank_id ? id(req.query.fuel_tank_id, 'Fuel Tank') : undefined));
}));

fleetEnhancementsRouter.post('/fleet/fuel-reconciliations', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const tankId = id(req.body.fuel_tank_id, 'Fuel Tank'); const from = date(req.body.period_start, ''); const to = date(req.body.period_end, '');
  const preview = (await reconciliationPreview(from, to, tankId))[0]; if (!preview) throw new HttpError(404, 'Fuel Tank tidak ditemukan.');
  try {
    const saved = await transaction(async (connection) => { const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO fleet_fuel_reconciliation
       (reconciliation_number,fuel_tank_id,period_start,period_end,fleet_transaction_liter,tank_movement_liter,variance_liter,unmatched_transaction_count,orphan_movement_count,status,notes,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,NOW())`, [number('FL-REC'), tankId, from, to, preview.fleet_transaction_liter, preview.tank_movement_liter, preview.variance_liter, preview.unmatched_transaction_count, preview.orphan_movement_count, text(req.body.notes, 5000), actor(req)]); return result.insertId; });
    await audit(null, 'FUEL_RECONCILIATION', saved, 'RECONCILIATION_CREATED', `Rekonsiliasi Fuel Tank ${preview.AssetName} dibuat`, actor(req), preview);
    created(res, { id: saved }, 'Rekonsiliasi Fleet berhasil disimpan.');
  } catch (error: any) { if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Rekonsiliasi tank dan periode tersebut sudah ada.'); throw error; }
}));

fleetEnhancementsRouter.post('/fleet/fuel-reconciliations/:id/review', canApprove, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFeature(); const reconciliationId = id(req.params.id, 'Rekonsiliasi');
  const result = await transaction(async (connection) => { const [updated] = await connection.execute<ResultSetHeader>(
    `UPDATE fleet_fuel_reconciliation SET status='REVIEWED',reviewed_by=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=? AND status='DRAFT'`, [actor(req), reconciliationId]); return updated; });
  if (!result.affectedRows) throw new HttpError(409, 'Rekonsiliasi tidak ditemukan atau sudah direview.');
  await audit(null, 'FUEL_RECONCILIATION', reconciliationId, 'RECONCILIATION_REVIEWED', 'Rekonsiliasi Fleet direview', actor(req));
  ok(res, { id: reconciliationId, status: 'REVIEWED' }, 'Rekonsiliasi disetujui.');
}));

fleetEnhancementsRouter.get('/fleet/audit-timeline', canRead, asyncHandler(async (req, res) => {
  await ensureFeature(); const vehicleId = req.query.vehicle_id ? id(req.query.vehicle_id, 'Fleet asset') : null;
  const result = await rows<any>(`SELECT t.*,a.AssetCode,a.AssetName FROM fleet_audit_timeline t
    LEFT JOIN fleet_vehicle_profile v ON v.id=t.vehicle_id LEFT JOIN asset a ON a.AssetID=v.asset_id
    WHERE (? IS NULL OR t.vehicle_id=?) ORDER BY t.event_at DESC LIMIT 300`, [vehicleId, vehicleId]);
  ok(res, result);
}));

function style(sheet: ExcelJS.Worksheet): void { sheet.views = [{ state: 'frozen', ySplit: 1 }]; const row = sheet.getRow(1); row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }; sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` }; }
fleetEnhancementsRouter.get('/fleet/reports/export', canRead, asyncHandler(async (req, res) => {
  await ensureFeature(); const today = new Date().toISOString().slice(0, 10); const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = date(req.query.date_from, monthAgo); const to = date(req.query.date_to, today); const data = await dashboardData(from, to);
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'MCS Fleet';
  const add = (name: string, columns: any[], values: any[]) => { const sheet = workbook.addWorksheet(name); sheet.columns = columns; values.forEach((value) => sheet.addRow(value)); style(sheet); };
  add('Ringkasan', [{ header: 'Indikator', key: 'label', width: 32 }, { header: 'Nilai', key: 'value', width: 22 }], Object.entries(data.summary ?? {}).map(([label, value]) => ({ label, value })));
  add('Tren BBM', [{ header: 'Tanggal', key: 'period_date' }, { header: 'Transaksi', key: 'transaction_count' }, { header: 'Liter', key: 'fuel_liter' }, { header: 'Efisiensi', key: 'avg_efficiency' }, { header: 'Jarak/Jam', key: 'distance_or_hours' }], data.trend);
  add('Efisiensi Armada', [{ header: 'Asset Code', key: 'AssetCode', width: 24 }, { header: 'Asset', key: 'AssetName', width: 28 }, { header: 'Tipe', key: 'vehicle_type' }, { header: 'Liter', key: 'fuel_liter' }, { header: 'Jarak/Jam', key: 'distance_or_hours' }, { header: 'Rata-rata Efisiensi', key: 'avg_efficiency' }, { header: 'Target', key: 'fuel_efficiency_target' }, { header: 'Minimum', key: 'fuel_efficiency_minimum' }], data.efficiency);
  add('Reminder Preventive', [{ header: 'Asset Code', key: 'AssetCode', width: 24 }, { header: 'Asset', key: 'AssetName', width: 28 }, { header: 'Trigger', key: 'trigger_type' }, { header: 'Due Date', key: 'due_date' }, { header: 'Due Meter', key: 'due_meter' }, { header: 'Current Meter', key: 'current_meter' }, { header: 'Status', key: 'status' }, { header: 'WO', key: 'wo_number', width: 24 }], data.reminders);
  add('Rekonsiliasi Tank', [{ header: 'Nomor', key: 'reconciliation_number', width: 24 }, { header: 'Tank', key: 'AssetName', width: 28 }, { header: 'Periode Mulai', key: 'period_start' }, { header: 'Periode Akhir', key: 'period_end' }, { header: 'Fleet (L)', key: 'fleet_transaction_liter' }, { header: 'Movement (L)', key: 'tank_movement_liter' }, { header: 'Selisih (L)', key: 'variance_liter' }, { header: 'Status', key: 'status' }], data.reconciliations);
  const buffer = await workbook.xlsx.writeBuffer(); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Fleet-Report-${from}-${to}.xlsx"`); res.end(Buffer.from(buffer));
}));
