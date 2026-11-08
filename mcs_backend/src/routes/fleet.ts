import { Router } from 'express';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const fleetRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const VEHICLE_TYPES = ['VEHICLE', 'FORKLIFT'] as const;
const METER_TYPES = ['ODOMETER', 'HOUR_METER'] as const;

function actor(req: AuthRequest): string {
  return String(req.user?.fullname || req.user?.username || 'SYSTEM').trim();
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new HttpError(422, `${label} tidak valid.`);
  return normalized as T[number];
}

function text(value: unknown, max = 255): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return normalized;
}

function numberValue(value: unknown, label: string, minimum = 0, required = false): number | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(422, `${label} wajib diisi.`);
    return null;
  }
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < minimum) throw new HttpError(422, `${label} harus berupa angka minimal ${minimum}.`);
  return parsed;
}

function dateTime(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(normalized)) throw new HttpError(422, `${label} tidak valid.`);
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function documentNumber(prefix: string): string {
  const now = new Date();
  const timestamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('');
  return `${prefix}-${timestamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureFleet(): Promise<void> {
  if (!(await tableExists('fleet_vehicle_profile'))) throw new HttpError(503, 'Migration Fleet & Vehicle belum dijalankan.');
}

async function vehicle(id: number, connection?: PoolConnection): Promise<any> {
  const sql = `SELECT v.*, a.AssetCode, a.AssetName, a.LocationAsset, a.CompanyName
    FROM fleet_vehicle_profile v JOIN asset a ON a.AssetID=v.asset_id WHERE v.id=? LIMIT 1`;
  if (connection) {
    const [result] = await connection.query(sql, [id]);
    return (result as any[])[0] ?? null;
  }
  return one(sql, [id]);
}

async function insertMeter(connection: PoolConnection, profile: any, current: number, readingAt: string, sourceType: string, sourceId: number, username: string): Promise<void> {
  const previous = Number(profile.current_meter ?? 0);
  if (current < previous) throw new HttpError(422, `Nilai ${profile.meter_type === 'ODOMETER' ? 'odometer' : 'hour meter'} tidak boleh turun dari ${previous}.`);
  if (current === previous) return;
  await connection.execute(
    `INSERT INTO fleet_meter_reading
      (vehicle_id,reading_at,meter_type,previous_value,current_value,source_type,source_id,status,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,'LOCKED',?,NOW())`,
    [profile.id, readingAt, profile.meter_type, previous, current, sourceType, sourceId, username],
  );
  await connection.execute('UPDATE fleet_vehicle_profile SET current_meter=?,updated_by=?,updated_at=NOW() WHERE id=?', [current, username, profile.id]);
}

async function createAnomaly(connection: PoolConnection, data: { vehicleId: number; sourceType: string; sourceId: number; type: string; severity: string; detectedAt: string; expected?: number | null; actual?: number | null; description: string }): Promise<void> {
  await connection.execute(
    `INSERT INTO fleet_anomaly
      (anomaly_number,vehicle_id,source_type,source_id,anomaly_type,severity,detected_at,expected_value,actual_value,description,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'OPEN',NOW())
     ON DUPLICATE KEY UPDATE severity=VALUES(severity),description=VALUES(description),updated_at=NOW()`,
    [documentNumber('FL-ANM'), data.vehicleId, data.sourceType, data.sourceId, data.type, data.severity, data.detectedAt, data.expected ?? null, data.actual ?? null, data.description],
  );
}

fleetRouter.use('/fleet', authenticate);

fleetRouter.get('/fleet/overview', canRead, asyncHandler(async (req, res) => {
  await ensureFleet();
  const q = text(req.query.q, 100);
  const type = text(req.query.type, 24)?.toUpperCase();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (q) { where.push('(a.AssetCode LIKE ? OR a.AssetName LIKE ? OR v.registration_number LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (type) { where.push('v.vehicle_type=?'); params.push(type); }
  const profiles = await rows<any>(
    `SELECT v.*,a.AssetCode,a.AssetName,a.LocationAsset,a.CompanyName,
       (SELECT MAX(i.inspected_at) FROM fleet_daily_inspection i WHERE i.vehicle_id=v.id AND i.status='APPROVED') last_inspection_at,
       (SELECT MAX(s.completed_at) FROM fleet_service_history s WHERE s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED') last_preventive_at,
       (SELECT s.meter_value FROM fleet_service_history s WHERE s.vehicle_id=v.id AND s.service_type='PREVENTIVE' AND s.status='COMPLETED' ORDER BY s.completed_at DESC LIMIT 1) last_preventive_meter
     FROM fleet_vehicle_profile v JOIN asset a ON a.AssetID=v.asset_id
     WHERE ${where.join(' AND ')} ORDER BY a.AssetName`, params,
  );
  const today = new Date();
  for (const item of profiles) {
    const lastInspection = item.last_inspection_at ? new Date(String(item.last_inspection_at).replace(' ', 'T')) : null;
    item.inspection_due = !lastInspection || (today.getTime() - lastInspection.getTime()) / 86400000 >= (item.inspection_frequency === 'WEEKLY' ? 7 : item.inspection_frequency === 'MONTHLY' ? 30 : 1);
    const lastPreventive = item.last_preventive_at ? new Date(String(item.last_preventive_at).replace(' ', 'T')) : null;
    const dueByDay = Number(item.preventive_interval_days ?? 0) > 0 && (!lastPreventive || (today.getTime() - lastPreventive.getTime()) / 86400000 >= Number(item.preventive_interval_days));
    const dueByMeter = Number(item.preventive_interval_meter ?? 0) > 0 && Number(item.current_meter) >= Number(item.last_preventive_meter ?? 0) + Number(item.preventive_interval_meter);
    item.preventive_due = dueByDay || dueByMeter;
  }
  const [inspections, fuel, services, anomalies, pending, tankExists] = await Promise.all([
    rows<any>(`SELECT i.*,v.vehicle_type,a.AssetCode,a.AssetName FROM fleet_daily_inspection i JOIN fleet_vehicle_profile v ON v.id=i.vehicle_id JOIN asset a ON a.AssetID=v.asset_id ORDER BY i.inspected_at DESC LIMIT 100`),
    rows<any>(`SELECT f.*,v.vehicle_type,v.meter_type,a.AssetCode,a.AssetName FROM fleet_fuel_transaction f JOIN fleet_vehicle_profile v ON v.id=f.vehicle_id JOIN asset a ON a.AssetID=v.asset_id ORDER BY f.fueled_at DESC LIMIT 100`),
    rows<any>(`SELECT s.*,v.meter_type,a.AssetCode,a.AssetName FROM fleet_service_history s JOIN fleet_vehicle_profile v ON v.id=s.vehicle_id JOIN asset a ON a.AssetID=v.asset_id ORDER BY s.started_at DESC LIMIT 100`),
    rows<any>(`SELECT n.*,a.AssetCode,a.AssetName FROM fleet_anomaly n JOIN fleet_vehicle_profile v ON v.id=n.vehicle_id JOIN asset a ON a.AssetID=v.asset_id ORDER BY (n.status='OPEN') DESC,n.detected_at DESC LIMIT 100`),
    one<any>(`SELECT
      (SELECT COUNT(*) FROM fleet_daily_inspection WHERE status='SUBMITTED') inspection_count,
      (SELECT COUNT(*) FROM fleet_fuel_transaction WHERE status='SUBMITTED') fuel_count`),
    tableExists('energy_fuel_tank'),
  ]);
  const tanks = tankExists ? await rows<any>(`SELECT t.id,t.tank_number,t.capacity_liter,a.AssetCode,a.AssetName,
    COALESCE(t.reference_balance_liter,0)
    + COALESCE((SELECT SUM(CASE WHEN m.movement_type IN ('RECEIPT','ADJUSTMENT_IN') THEN m.quantity_liter WHEN m.movement_type IN ('CONSUMPTION','TRANSFER','ADJUSTMENT_OUT') THEN -m.quantity_liter ELSE 0 END) FROM energy_fuel_movement m WHERE m.fuel_tank_id=t.id AND m.status IN ('APPROVED','LOCKED')),0)
    + COALESCE((SELECT SUM(m.quantity_liter) FROM energy_fuel_movement m WHERE m.destination_tank_id=t.id AND m.movement_type='TRANSFER' AND m.status IN ('APPROVED','LOCKED')),0) AS reference_balance_liter
    FROM energy_fuel_tank t JOIN energy_asset_profile p ON p.id=t.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id WHERE t.status='ACTIVE' ORDER BY a.AssetName`) : [];
  ok(res, {
    profiles, inspections, fuel_transactions: fuel, services, anomalies, fuel_tanks: tanks,
    stats: {
      total: profiles.length,
      inspection_due: profiles.filter((p) => p.inspection_due).length,
      preventive_due: profiles.filter((p) => p.preventive_due).length,
      open_anomalies: anomalies.filter((a) => a.status === 'OPEN').length,
      pending_approvals: Number(pending?.inspection_count ?? 0) + Number(pending?.fuel_count ?? 0),
    },
  });
}));

fleetRouter.post('/fleet/profiles', canManage, asyncHandler(async (req: AuthRequest, res) => {
  await ensureFleet();
  const assetId = numberValue(req.body.asset_id, 'Asset', 1, true)!;
  const vehicleType = enumValue(req.body.vehicle_type, VEHICLE_TYPES, 'Jenis kendaraan');
  const meterType = enumValue(req.body.meter_type ?? (vehicleType === 'FORKLIFT' ? 'HOUR_METER' : 'ODOMETER'), METER_TYPES, 'Jenis meter');
  if (!(await one('SELECT AssetID FROM asset WHERE AssetID=?', [assetId]))) throw new HttpError(422, 'Asset tidak ditemukan.');
  try {
    const result = await transaction(async (connection) => {
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fleet_vehicle_profile
          (asset_id,vehicle_type,registration_number,chassis_number,engine_number,make,model,manufacture_year,fuel_type,tank_capacity_liter,meter_type,current_meter,custodian_name,department_name,cost_center_code,inspection_frequency,preventive_interval_days,preventive_interval_meter,fuel_efficiency_target,fuel_efficiency_minimum,status,notes,created_by,updated_by,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,NOW(),NOW())`,
        [assetId, vehicleType, text(req.body.registration_number, 60), text(req.body.chassis_number, 120), text(req.body.engine_number, 120), text(req.body.make, 100), text(req.body.model, 100), numberValue(req.body.manufacture_year, 'Tahun', 1900), text(req.body.fuel_type, 30) ?? 'DIESEL', numberValue(req.body.tank_capacity_liter, 'Kapasitas tank'), meterType, numberValue(req.body.current_meter, 'Meter awal') ?? 0, text(req.body.custodian_name, 120), text(req.body.department_name, 120), text(req.body.cost_center_code, 80), text(req.body.inspection_frequency, 24)?.toUpperCase() ?? 'DAILY', numberValue(req.body.preventive_interval_days, 'Interval hari'), numberValue(req.body.preventive_interval_meter, 'Interval meter'), numberValue(req.body.fuel_efficiency_target, 'Target efisiensi'), numberValue(req.body.fuel_efficiency_minimum, 'Minimum efisiensi'), 'ACTIVE', text(req.body.notes, 5000), actor(req), actor(req)],
      );
      return insert.insertId;
    });
    created(res, { id: result }, 'Profil Fleet berhasil dibuat.');
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Asset atau nomor registrasi sudah terdaftar pada Fleet.');
    throw error;
  }
}));

fleetRouter.post('/fleet/meter-readings', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const vehicleId = numberValue(req.body.vehicle_id, 'Fleet asset', 1, true)!;
  const value = numberValue(req.body.current_value, 'Nilai meter', 0, true)!;
  const readingAt = dateTime(req.body.reading_at, 'Waktu reading');
  await transaction(async (connection) => {
    const profile = await vehicle(vehicleId, connection);
    if (!profile) throw new HttpError(404, 'Fleet asset tidak ditemukan.');
    await insertMeter(connection, profile, value, readingAt, 'MANUAL', 0, actor(req));
  });
  created(res, null, 'Meter berhasil diperbarui.');
}));

fleetRouter.post('/fleet/inspections', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const vehicleId = numberValue(req.body.vehicle_id, 'Fleet asset', 1, true)!;
  const inspectedAt = dateTime(req.body.inspected_at, 'Waktu inspeksi');
  const meterValue = numberValue(req.body.meter_value, 'Nilai meter', 0, true)!;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw new HttpError(422, 'Checklist inspeksi wajib diisi.');
  const failed = items.some((item: any) => String(item.result).toUpperCase() === 'FAIL');
  const id = await transaction(async (connection) => {
    const profile = await vehicle(vehicleId, connection);
    if (!profile) throw new HttpError(404, 'Fleet asset tidak ditemukan.');
    if (meterValue < Number(profile.current_meter)) throw new HttpError(422, 'Nilai meter inspeksi tidak boleh lebih kecil dari meter terakhir.');
    const [header] = await connection.execute<ResultSetHeader>(
      `INSERT INTO fleet_daily_inspection
       (inspection_number,vehicle_id,inspected_at,shift,operator_name,meter_value,overall_condition,unsafe_to_operate,status,notes,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'DRAFT',?,?,?,NOW(),NOW())`,
      [documentNumber('FL-INSP'), vehicleId, inspectedAt, text(req.body.shift, 30), text(req.body.operator_name, 120) ?? actor(req), meterValue, failed ? 'FAIL' : 'PASS', req.body.unsafe_to_operate ? 1 : 0, text(req.body.notes, 5000), actor(req), actor(req)],
    );
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      await connection.execute(`INSERT INTO fleet_daily_inspection_item (inspection_id,item_code,item_name,result,finding,sort_order) VALUES (?,?,?,?,?,?)`, [header.insertId, text(item.item_code, 60) ?? `ITEM_${index + 1}`, text(item.item_name, 180) ?? `Item ${index + 1}`, String(item.result).toUpperCase() === 'FAIL' ? 'FAIL' : 'PASS', text(item.finding, 5000), index]);
    }
    return header.insertId;
  });
  created(res, { id }, 'Inspeksi tersimpan sebagai draft.');
}));

fleetRouter.post('/fleet/inspections/:id/submit', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const result = await one<any>('SELECT status FROM fleet_daily_inspection WHERE id=?', [id]);
  if (!result) throw new HttpError(404, 'Inspeksi tidak ditemukan.');
  if (result.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft yang dapat diajukan.');
  await transaction(async (connection) => connection.execute(`UPDATE fleet_daily_inspection SET status='SUBMITTED',submitted_by=?,submitted_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?`, [actor(req), actor(req), id]).then(() => undefined));
  ok(res, { id, status: 'SUBMITTED' }, 'Inspeksi diajukan.');
}));

fleetRouter.post('/fleet/inspections/:id/review', canApprove, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const action = enumValue(req.body.action, ['APPROVE', 'REJECT'] as const, 'Aksi');
  await transaction(async (connection) => {
    const [result] = await connection.query(`SELECT i.*,v.current_meter,v.meter_type FROM fleet_daily_inspection i JOIN fleet_vehicle_profile v ON v.id=i.vehicle_id WHERE i.id=? FOR UPDATE`, [id]);
    const inspection = (result as any[])[0];
    if (!inspection) throw new HttpError(404, 'Inspeksi tidak ditemukan.');
    if (inspection.status !== 'SUBMITTED') throw new HttpError(409, 'Inspeksi tidak menunggu approval.');
    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await connection.execute(`UPDATE fleet_daily_inspection SET status=?,reviewed_by=?,reviewed_at=NOW(),review_note=?,updated_by=?,updated_at=NOW() WHERE id=?`, [status, actor(req), text(req.body.review_note, 5000), actor(req), id]);
    if (status === 'APPROVED') {
      await insertMeter(connection, inspection, Number(inspection.meter_value), inspection.inspected_at, 'INSPECTION', id, actor(req));
      if (inspection.overall_condition === 'FAIL' || Number(inspection.unsafe_to_operate) === 1) {
        await createAnomaly(connection, { vehicleId: inspection.vehicle_id, sourceType: 'INSPECTION', sourceId: id, type: inspection.unsafe_to_operate ? 'UNSAFE_CONDITION' : 'INSPECTION_FAILURE', severity: inspection.unsafe_to_operate ? 'CRITICAL' : 'HIGH', detectedAt: inspection.inspected_at, description: inspection.unsafe_to_operate ? 'Kendaraan dinyatakan tidak aman untuk dioperasikan.' : 'Ditemukan item gagal pada daily inspection.' });
      }
    }
  });
  ok(res, { id, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' }, 'Review inspeksi tersimpan.');
}));

fleetRouter.post('/fleet/fuel-transactions', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const vehicleId = numberValue(req.body.vehicle_id, 'Fleet asset', 1, true)!;
  const quantity = numberValue(req.body.quantity_liter, 'Jumlah solar', 0.001, true)!;
  const before = numberValue(req.body.meter_before, 'Meter sebelum', 0, true)!;
  const after = numberValue(req.body.meter_after, 'Meter sesudah', 0, true)!;
  if (after < before) throw new HttpError(422, 'Meter sesudah tidak boleh lebih kecil dari meter sebelum.');
  const delta = after - before;
  const efficiency = quantity > 0 ? delta / quantity : null;
  const profile = await vehicle(vehicleId);
  if (!profile) throw new HttpError(404, 'Fleet asset tidak ditemukan.');
  const anomaly = profile.fuel_efficiency_minimum !== null && efficiency !== null && efficiency < Number(profile.fuel_efficiency_minimum);
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO fleet_fuel_transaction
       (transaction_number,vehicle_id,fuel_tank_id,fueled_at,quantity_liter,meter_before,meter_after,distance_or_hours,efficiency_value,full_tank,reference_number,operator_name,status,anomaly_status,notes,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?,?, ?,NOW(),NOW())`,
      [documentNumber('FL-FUEL'), vehicleId, numberValue(req.body.fuel_tank_id, 'Fuel tank', 1), dateTime(req.body.fueled_at, 'Waktu pengisian'), quantity, before, after, delta, efficiency, req.body.full_tank ? 1 : 0, text(req.body.reference_number, 120), text(req.body.operator_name, 120) ?? actor(req), anomaly ? 'ANOMALY' : 'NORMAL', text(req.body.notes, 5000), actor(req), actor(req)],
    );
    return insert.insertId;
  });
  created(res, { id: result, efficiency_value: efficiency, anomaly_status: anomaly ? 'ANOMALY' : 'NORMAL' }, 'Pengisian solar tersimpan sebagai draft.');
}));

fleetRouter.post('/fleet/fuel-transactions/:id/submit', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const result = await one<any>('SELECT status FROM fleet_fuel_transaction WHERE id=?', [id]);
  if (!result) throw new HttpError(404, 'Transaksi solar tidak ditemukan.');
  if (result.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft yang dapat diajukan.');
  await transaction(async (connection) => connection.execute(`UPDATE fleet_fuel_transaction SET status='SUBMITTED',submitted_by=?,submitted_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?`, [actor(req), actor(req), id]).then(() => undefined));
  ok(res, { id, status: 'SUBMITTED' }, 'Transaksi solar diajukan.');
}));

fleetRouter.post('/fleet/fuel-transactions/:id/review', canApprove, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const action = enumValue(req.body.action, ['APPROVE', 'REJECT'] as const, 'Aksi');
  await transaction(async (connection) => {
    const [result] = await connection.query(`SELECT f.*,v.asset_id,v.vehicle_type,v.meter_type,v.current_meter,v.fuel_efficiency_minimum FROM fleet_fuel_transaction f JOIN fleet_vehicle_profile v ON v.id=f.vehicle_id WHERE f.id=? FOR UPDATE`, [id]);
    const fuel = (result as any[])[0];
    if (!fuel) throw new HttpError(404, 'Transaksi solar tidak ditemukan.');
    if (fuel.status !== 'SUBMITTED') throw new HttpError(409, 'Transaksi tidak menunggu approval.');
    if (action === 'REJECT') {
      await connection.execute(`UPDATE fleet_fuel_transaction SET status='REJECTED',reviewed_by=?,reviewed_at=NOW(),review_note=?,updated_by=?,updated_at=NOW() WHERE id=?`, [actor(req), text(req.body.review_note, 5000), actor(req), id]);
      return;
    }
    let movementId: number | null = null;
    if (fuel.fuel_tank_id) {
      const [tankRows] = await connection.query('SELECT * FROM energy_fuel_tank WHERE id=? FOR UPDATE', [fuel.fuel_tank_id]);
      const tank = (tankRows as any[])[0];
      if (!tank) throw new HttpError(422, 'Fuel Tank sumber tidak ditemukan.');
      const [balanceRows] = await connection.query(
        `SELECT COALESCE(t.reference_balance_liter,0)
          + COALESCE((SELECT SUM(CASE WHEN m.movement_type IN ('RECEIPT','ADJUSTMENT_IN') THEN m.quantity_liter WHEN m.movement_type IN ('CONSUMPTION','TRANSFER','ADJUSTMENT_OUT') THEN -m.quantity_liter ELSE 0 END) FROM energy_fuel_movement m WHERE m.fuel_tank_id=t.id AND m.status IN ('APPROVED','LOCKED')),0)
          + COALESCE((SELECT SUM(m.quantity_liter) FROM energy_fuel_movement m WHERE m.destination_tank_id=t.id AND m.movement_type='TRANSFER' AND m.status IN ('APPROVED','LOCKED')),0) AS balance
         FROM energy_fuel_tank t WHERE t.id=?`, [fuel.fuel_tank_id]);
      const balance = Number((balanceRows as any[])[0]?.balance ?? 0);
      if (balance < Number(fuel.quantity_liter)) throw new HttpError(422, `Saldo Fuel Tank tidak mencukupi. Saldo saat ini ${balance.toLocaleString('id-ID')} liter.`);
      const [movement] = await connection.execute<ResultSetHeader>(
        `INSERT INTO energy_fuel_movement
         (fuel_tank_id,movement_type,movement_at,quantity_liter,destination_type,destination_asset_id,reference_number,meter_before,meter_after,status,notes,created_by,approved_by,approved_at,created_at,updated_at)
         VALUES (?,'CONSUMPTION',?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),NOW())`,
        [fuel.fuel_tank_id, fuel.fueled_at, fuel.quantity_liter, fuel.vehicle_type, fuel.asset_id, fuel.transaction_number, fuel.meter_before, fuel.meter_after, 'APPROVED', `Pemakaian Fleet ${fuel.transaction_number}`, actor(req), actor(req)],
      );
      movementId = movement.insertId;
    }
    await connection.execute(`UPDATE fleet_fuel_transaction SET status='APPROVED',fuel_movement_id=?,reviewed_by=?,reviewed_at=NOW(),review_note=?,updated_by=?,updated_at=NOW() WHERE id=?`, [movementId, actor(req), text(req.body.review_note, 5000), actor(req), id]);
    await insertMeter(connection, fuel, Number(fuel.meter_after), fuel.fueled_at, 'FUEL', id, actor(req));
    if (fuel.anomaly_status === 'ANOMALY') await createAnomaly(connection, { vehicleId: fuel.vehicle_id, sourceType: 'FUEL', sourceId: id, type: 'LOW_FUEL_EFFICIENCY', severity: 'MEDIUM', detectedAt: fuel.fueled_at, expected: Number(fuel.fuel_efficiency_minimum), actual: Number(fuel.efficiency_value), description: `Efisiensi bahan bakar ${Number(fuel.efficiency_value).toFixed(3)} di bawah batas minimum ${Number(fuel.fuel_efficiency_minimum).toFixed(3)}.` });
  });
  ok(res, { id, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' }, 'Review transaksi solar tersimpan.');
}));

fleetRouter.post('/fleet/services', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const vehicleId = numberValue(req.body.vehicle_id, 'Fleet asset', 1, true)!;
  if (!(await vehicle(vehicleId))) throw new HttpError(404, 'Fleet asset tidak ditemukan.');
  const status = enumValue(req.body.status ?? 'DRAFT', ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const, 'Status');
  const completedAt = req.body.completed_at ? dateTime(req.body.completed_at, 'Waktu selesai') : null;
  if (status === 'COMPLETED' && !completedAt) throw new HttpError(422, 'Waktu selesai wajib untuk service completed.');
  const id = await transaction(async (connection) => {
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO fleet_service_history
       (service_number,vehicle_id,service_type,started_at,completed_at,meter_value,workshop_name,complaint,work_performed,parts_summary,reference_cost,wo_module,wo_number,status,notes,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [documentNumber('FL-SVC'), vehicleId, enumValue(req.body.service_type, ['PREVENTIVE', 'CORRECTIVE', 'REPAIR', 'INSPECTION'] as const, 'Jenis service'), dateTime(req.body.started_at, 'Waktu mulai'), completedAt, numberValue(req.body.meter_value, 'Nilai meter', 0, true), text(req.body.workshop_name, 180), text(req.body.complaint, 5000), text(req.body.work_performed, 5000), text(req.body.parts_summary, 5000), numberValue(req.body.reference_cost, 'Biaya referensi'), text(req.body.wo_module, 30), text(req.body.wo_number, 120), status, text(req.body.notes, 5000), actor(req), actor(req)],
    );
    if (status === 'COMPLETED') {
      const profile = await vehicle(vehicleId, connection);
      await insertMeter(connection, profile, Number(req.body.meter_value), completedAt!, 'SERVICE', insert.insertId, actor(req));
    }
    return insert.insertId;
  });
  created(res, { id }, 'Riwayat service berhasil disimpan.');
}));

fleetRouter.post('/fleet/anomalies/:id/resolve', canManage, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const note = text(req.body.resolution_note, 5000);
  if (!note) throw new HttpError(422, 'Catatan penyelesaian wajib diisi.');
  const anomaly = await one<any>('SELECT status FROM fleet_anomaly WHERE id=?', [id]);
  if (!anomaly) throw new HttpError(404, 'Anomaly tidak ditemukan.');
  if (anomaly.status !== 'OPEN') throw new HttpError(409, 'Anomaly sudah diselesaikan.');
  await transaction(async (connection) => connection.execute(`UPDATE fleet_anomaly SET status='RESOLVED',resolution_note=?,resolved_by=?,resolved_at=NOW(),updated_at=NOW() WHERE id=?`, [note, actor(req), id]).then(() => undefined));
  ok(res, { id, status: 'RESOLVED' }, 'Anomaly diselesaikan.');
}));
