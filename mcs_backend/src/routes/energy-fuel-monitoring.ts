import { Router, type NextFunction, type Response } from 'express';
import ExcelJS from 'exceljs';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyFuelMonitoringRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const MOVEMENT_TYPES = ['RECEIPT', 'CONSUMPTION', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
const OUTGOING_TYPES = new Set<string>(['CONSUMPTION', 'TRANSFER', 'ADJUSTMENT_OUT']);
const INCOMING_TYPES = new Set<string>(['RECEIPT', 'ADJUSTMENT_IN']);

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('energy_fuel_movement')) || !(await tableExists('energy_meter_reading'))) {
    throw new HttpError(503, 'Fondasi Energy belum tersedia. Jalankan migration Energy foundation.');
  }
}

function positiveId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, `${field} tidak valid.`);
  return id;
}

function decimal(value: unknown, field: string, required = true): number | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(422, `${field} wajib diisi.`);
    return null;
  }
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(422, `${field} harus berupa angka nol atau lebih.`);
  return parsed;
}

function shortText(value: unknown, max: number): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return normalized;
}

function movementDateTime(value: unknown): string {
  const raw = String(value ?? '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw)) throw new HttpError(422, 'Waktu movement tidak valid.');
  return raw.length === 16 ? `${raw}:00` : raw;
}

function dateOnly(value: unknown, fallback: string, field: string): string {
  const raw = String(value ?? '').trim() || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(422, `${field} tidak valid.`);
  return raw;
}

function movementType(value: unknown): (typeof MOVEMENT_TYPES)[number] {
  const type = String(value ?? '').trim().toUpperCase();
  if (!MOVEMENT_TYPES.includes(type as (typeof MOVEMENT_TYPES)[number])) {
    throw new HttpError(422, `Jenis movement tidak valid. Pilihan: ${MOVEMENT_TYPES.join(', ')}.`);
  }
  return type as (typeof MOVEMENT_TYPES)[number];
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

type TankRow = {
  id: number;
  energy_profile_id: number;
  fuel_type: string;
  capacity_liter: number | string;
  minimum_level_liter: number | string | null;
  maximum_level_liter: number | string | null;
  reference_balance_liter: number | string | null;
  status: string;
  tank_number: string | null;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
};

async function tankForUpdate(connection: PoolConnection, tankId: number): Promise<TankRow> {
  const tank = await connectionOne<TankRow>(connection,
    `SELECT t.*, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_fuel_tank t
     JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE t.id=? LIMIT 1 FOR UPDATE`, [tankId]);
  if (!tank) throw new HttpError(404, 'Fuel tank tidak ditemukan.');
  if (tank.status !== 'ACTIVE') throw new HttpError(409, 'Fuel tank tidak aktif.');
  return tank;
}

async function tankBalance(connection: PoolConnection, tankId: number): Promise<number> {
  const result = await connectionOne<{ balance: number | string }>(connection,
    `SELECT COALESCE(t.reference_balance_liter,0)
       + COALESCE((SELECT SUM(CASE
           WHEN m.movement_type IN ('RECEIPT','ADJUSTMENT_IN') THEN m.quantity_liter
           WHEN m.movement_type IN ('CONSUMPTION','TRANSFER','ADJUSTMENT_OUT') THEN -m.quantity_liter
           ELSE 0 END)
         FROM energy_fuel_movement m
         WHERE m.fuel_tank_id=t.id AND m.status IN ('APPROVED','LOCKED')),0)
       + COALESCE((SELECT SUM(m.quantity_liter)
         FROM energy_fuel_movement m
         WHERE m.destination_tank_id=t.id AND m.movement_type='TRANSFER'
           AND m.status IN ('APPROVED','LOCKED')),0) AS balance
     FROM energy_fuel_tank t WHERE t.id=? LIMIT 1`, [tankId]);
  return Number(result?.balance ?? 0);
}

async function tankOptions(): Promise<Record<string, unknown>[]> {
  return rows<Record<string, unknown>>(
    `SELECT t.id, t.tank_number, t.fuel_type, t.capacity_liter, t.minimum_level_liter,
      t.maximum_level_liter, t.reference_balance_liter, t.status,
      p.asset_id, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset,
      COALESCE(t.reference_balance_liter,0)
       + COALESCE((SELECT SUM(CASE
           WHEN m.movement_type IN ('RECEIPT','ADJUSTMENT_IN') THEN m.quantity_liter
           WHEN m.movement_type IN ('CONSUMPTION','TRANSFER','ADJUSTMENT_OUT') THEN -m.quantity_liter
           ELSE 0 END)
         FROM energy_fuel_movement m
         WHERE m.fuel_tank_id=t.id AND m.status IN ('APPROVED','LOCKED')),0)
       + COALESCE((SELECT SUM(m.quantity_liter)
         FROM energy_fuel_movement m
         WHERE m.destination_tank_id=t.id AND m.movement_type='TRANSFER'
           AND m.status IN ('APPROVED','LOCKED')),0) AS current_balance_liter
     FROM energy_fuel_tank t
     JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     ORDER BY a.AssetName, t.tank_number`);
}

async function validateMovementTarget(connection: PoolConnection, source: TankRow, type: string, destinationTankId: number | null, destinationAssetId: number | null): Promise<void> {
  if (type === 'TRANSFER') {
    if (!destinationTankId) throw new HttpError(422, 'Tank tujuan wajib dipilih untuk transfer.');
    if (destinationTankId === source.id) throw new HttpError(422, 'Tank tujuan harus berbeda dari tank sumber.');
    const destination = await tankForUpdate(connection, destinationTankId);
    if (destination.fuel_type !== source.fuel_type) throw new HttpError(422, 'Jenis bahan bakar tank tujuan berbeda dari tank sumber.');
  } else if (destinationTankId) {
    throw new HttpError(422, 'Tank tujuan hanya dapat diisi untuk movement transfer.');
  }
  if (destinationAssetId) {
    const asset = await connectionOne(connection, 'SELECT AssetID FROM asset WHERE AssetID=? LIMIT 1', [destinationAssetId]);
    if (!asset) throw new HttpError(422, 'Asset tujuan tidak ditemukan.');
  }
}

function movementPayload(body: Record<string, unknown>): {
  type: (typeof MOVEMENT_TYPES)[number]; movementAt: string; quantity: number; destinationTankId: number | null;
  destinationAssetId: number | null; destinationType: string | null; reference: string | null;
  meterBefore: number | null; meterAfter: number | null; notes: string | null;
} {
  const type = movementType(body.movement_type);
  const quantity = decimal(body.quantity_liter, 'Jumlah liter')!;
  if (quantity <= 0) throw new HttpError(422, 'Jumlah liter harus lebih besar dari nol.');
  const destinationTankId = body.destination_tank_id ? positiveId(body.destination_tank_id, 'Tank tujuan') : null;
  const destinationAssetId = body.destination_asset_id ? positiveId(body.destination_asset_id, 'Asset tujuan') : null;
  const meterBefore = decimal(body.meter_before, 'Meter sebelum', false);
  const meterAfter = decimal(body.meter_after, 'Meter sesudah', false);
  if (meterBefore !== null && meterAfter !== null && meterAfter < meterBefore) throw new HttpError(422, 'Meter sesudah tidak boleh lebih kecil dari meter sebelum.');
  return {
    type,
    movementAt: movementDateTime(body.movement_at),
    quantity,
    destinationTankId,
    destinationAssetId,
    destinationType: type === 'TRANSFER' ? 'FUEL_TANK' : (destinationAssetId ? 'ASSET' : null),
    reference: shortText(body.reference_number, 120),
    meterBefore,
    meterAfter,
    notes: shortText(body.notes, 5000),
  };
}

energyFuelMonitoringRouter.use('/energy', authenticate, featureEnabled);

energyFuelMonitoringRouter.get('/energy/fuel-tanks/options', canRead, asyncHandler(async (_req, res) => {
  await ensureFoundation();
  ok(res, await tankOptions());
}));

energyFuelMonitoringRouter.get('/energy/fuel-tanks/:tankId/movements', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const tankId = positiveId(req.params.tankId, 'Tank ID');
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 25)));
  const tank = (await tankOptions()).find((item) => Number(item.id) === tankId);
  if (!tank) throw new HttpError(404, 'Fuel tank tidak ditemukan.');
  const total = Number((await one<{ total: number }>('SELECT COUNT(*) AS total FROM energy_fuel_movement WHERE fuel_tank_id=? OR destination_tank_id=?', [tankId, tankId]))?.total ?? 0);
  const movements = await rows(
    `SELECT m.*, source_asset.AssetCode AS source_asset_code, source_asset.AssetName AS source_asset_name,
       destination_asset.AssetCode AS destination_asset_code, destination_asset.AssetName AS destination_asset_name,
       destination_tank.tank_number AS destination_tank_number,
       destination_tank_asset.AssetCode AS destination_tank_asset_code,
       CASE WHEN m.destination_tank_id=? AND m.movement_type='TRANSFER' THEN 'INCOMING_TRANSFER' ELSE 'SOURCE' END AS tank_role
     FROM energy_fuel_movement m
     JOIN energy_fuel_tank source_tank ON source_tank.id=m.fuel_tank_id
     JOIN energy_asset_profile source_profile ON source_profile.id=source_tank.energy_profile_id
     JOIN asset source_asset ON source_asset.AssetID=source_profile.asset_id
     LEFT JOIN asset destination_asset ON destination_asset.AssetID=m.destination_asset_id
     LEFT JOIN energy_fuel_tank destination_tank ON destination_tank.id=m.destination_tank_id
     LEFT JOIN energy_asset_profile destination_profile ON destination_profile.id=destination_tank.energy_profile_id
     LEFT JOIN asset destination_tank_asset ON destination_tank_asset.AssetID=destination_profile.asset_id
     WHERE m.fuel_tank_id=? OR m.destination_tank_id=?
     ORDER BY m.movement_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    [tankId, tankId, tankId, perPage, (page - 1) * perPage]);
  ok(res, { tank, movements }, 'OK', { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
}));

energyFuelMonitoringRouter.post('/energy/fuel-tanks/:tankId/movements', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const tankId = positiveId(req.params.tankId, 'Tank ID');
  const input = movementPayload(req.body);
  const actor = String((req as AuthRequest).user!.fullname);
  const id = await transaction(async (connection) => {
    const source = await tankForUpdate(connection, tankId);
    await validateMovementTarget(connection, source, input.type, input.destinationTankId, input.destinationAssetId);
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_fuel_movement
       (fuel_tank_id, movement_type, movement_at, quantity_liter, destination_type,
        destination_asset_id, destination_tank_id, reference_number, meter_before, meter_after,
        status, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,NOW(),NOW())`,
      [tankId, input.type, input.movementAt, input.quantity, input.destinationType,
        input.destinationAssetId, input.destinationTankId, input.reference, input.meterBefore,
        input.meterAfter, input.notes, actor] as never);
    return inserted.insertId;
  });
  created(res, { id }, 'Draft fuel movement dibuat.');
}));

energyFuelMonitoringRouter.patch('/energy/fuel-movements/:movementId', canManage, asyncHandler(async (req, res) => {
  const movementId = positiveId(req.params.movementId, 'Movement ID');
  const input = movementPayload(req.body);
  await transaction(async (connection) => {
    const movement = await connectionOne<{ fuel_tank_id: number; status: string }>(connection,
      'SELECT fuel_tank_id, status FROM energy_fuel_movement WHERE id=? LIMIT 1 FOR UPDATE', [movementId]);
    if (!movement) throw new HttpError(404, 'Fuel movement tidak ditemukan.');
    if (movement.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft movement yang dapat diubah.');
    const source = await tankForUpdate(connection, movement.fuel_tank_id);
    await validateMovementTarget(connection, source, input.type, input.destinationTankId, input.destinationAssetId);
    await connection.execute(
      `UPDATE energy_fuel_movement SET movement_type=?, movement_at=?, quantity_liter=?, destination_type=?,
       destination_asset_id=?, destination_tank_id=?, reference_number=?, meter_before=?, meter_after=?,
       notes=?, updated_at=NOW() WHERE id=?`,
      [input.type, input.movementAt, input.quantity, input.destinationType, input.destinationAssetId,
        input.destinationTankId, input.reference, input.meterBefore, input.meterAfter, input.notes, movementId] as never);
  });
  ok(res, { id: movementId }, 'Draft fuel movement diperbarui.');
}));

energyFuelMonitoringRouter.post('/energy/fuel-movements/:movementId/submit', canManage, asyncHandler(async (req, res) => {
  const movementId = positiveId(req.params.movementId, 'Movement ID');
  await transaction(async (connection) => {
    const movement = await connectionOne<{ status: string }>(connection, 'SELECT status FROM energy_fuel_movement WHERE id=? LIMIT 1 FOR UPDATE', [movementId]);
    if (!movement) throw new HttpError(404, 'Fuel movement tidak ditemukan.');
    if (movement.status !== 'DRAFT') throw new HttpError(409, 'Fuel movement harus berstatus DRAFT.');
    await connection.execute("UPDATE energy_fuel_movement SET status='SUBMITTED', updated_at=NOW() WHERE id=?", [movementId]);
  });
  ok(res, { id: movementId, status: 'SUBMITTED' }, 'Fuel movement disubmit untuk approval.');
}));

energyFuelMonitoringRouter.post('/energy/fuel-movements/:movementId/review', canApprove, asyncHandler(async (req, res) => {
  const movementId = positiveId(req.params.movementId, 'Movement ID');
  const action = String(req.body.action ?? '').trim().toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(action)) throw new HttpError(422, 'Action harus APPROVE atau REJECT.');
  const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction(async (connection) => {
    const movement = await connectionOne<{
      status: string; fuel_tank_id: number; destination_tank_id: number | null;
      movement_type: string; quantity_liter: number | string;
    }>(connection, 'SELECT * FROM energy_fuel_movement WHERE id=? LIMIT 1 FOR UPDATE', [movementId]);
    if (!movement) throw new HttpError(404, 'Fuel movement tidak ditemukan.');
    if (movement.status !== 'SUBMITTED') throw new HttpError(409, 'Fuel movement harus berstatus SUBMITTED.');
    if (action === 'REJECT') {
      await connection.execute(
        "UPDATE energy_fuel_movement SET status='REJECTED', approved_by=?, approved_at=NOW(), notes=CONCAT_WS(' | ', notes, ?), updated_at=NOW() WHERE id=?",
        [actor, shortText(req.body.review_note, 1000) ?? 'Ditolak tanpa catatan', movementId] as never);
      return { status: 'REJECTED' };
    }

    const lockIds = [movement.fuel_tank_id, movement.destination_tank_id].filter((id): id is number => Boolean(id)).sort((a, b) => a - b);
    for (const id of lockIds) await tankForUpdate(connection, id);
    const source = await tankForUpdate(connection, movement.fuel_tank_id);
    const quantity = Number(movement.quantity_liter);
    const sourceBalance = await tankBalance(connection, source.id);
    if (OUTGOING_TYPES.has(movement.movement_type) && sourceBalance < quantity) {
      throw new HttpError(409, `Saldo tank tidak cukup. Saldo saat ini ${sourceBalance.toLocaleString('id-ID')} liter.`);
    }
    const sourceProjected = sourceBalance + (INCOMING_TYPES.has(movement.movement_type) ? quantity : (OUTGOING_TYPES.has(movement.movement_type) ? -quantity : 0));
    const sourceMaximum = Number(source.maximum_level_liter ?? source.capacity_liter);
    if (sourceProjected > sourceMaximum) throw new HttpError(409, `Movement melebihi batas maksimum tank sumber (${sourceMaximum.toLocaleString('id-ID')} liter).`);

    let destinationBalance: number | null = null;
    if (movement.movement_type === 'TRANSFER' && movement.destination_tank_id) {
      const destination = await tankForUpdate(connection, movement.destination_tank_id);
      destinationBalance = await tankBalance(connection, destination.id);
      const destinationMaximum = Number(destination.maximum_level_liter ?? destination.capacity_liter);
      if (destinationBalance + quantity > destinationMaximum) {
        throw new HttpError(409, `Transfer melebihi batas maksimum tank tujuan (${destinationMaximum.toLocaleString('id-ID')} liter).`);
      }
    }
    await connection.execute(
      "UPDATE energy_fuel_movement SET status='APPROVED', approved_by=?, approved_at=NOW(), notes=CONCAT_WS(' | ', notes, ?), updated_at=NOW() WHERE id=?",
      [actor, shortText(req.body.review_note, 1000), movementId] as never);
    return {
      status: 'APPROVED',
      source_balance_liter: sourceProjected,
      destination_balance_liter: destinationBalance === null ? null : destinationBalance + quantity,
    };
  });
  ok(res, { id: movementId, ...result }, action === 'APPROVE' ? 'Fuel movement disetujui dan saldo diperbarui.' : 'Fuel movement ditolak.');
}));

type MonitoringFilters = { dateFrom: string; dateTo: string; company: string };

function monitoringFilters(query: Record<string, unknown>): MonitoringFilters {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  const dateFrom = dateOnly(query.date_from, fromDate.toISOString().slice(0, 10), 'Tanggal mulai');
  const dateTo = dateOnly(query.date_to, today, 'Tanggal selesai');
  if (dateTo < dateFrom) throw new HttpError(422, 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
  return { dateFrom, dateTo, company: shortText(query.company, 120) ?? '' };
}

async function monitoringData(filters: MonitoringFilters): Promise<Record<string, unknown>> {
  const companySql = filters.company ? ' AND a.CompanyName=?' : '';
  const companyParams = filters.company ? [filters.company] : [];
  const meterRows = await rows<Record<string, unknown>>(
    `SELECT r.id, r.meter_id, DATE(r.read_at) AS activity_date, r.read_at, r.consumption,
       r.is_rollover, m.unit, p.energy_type, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_meter_reading r
     JOIN energy_meter m ON m.id=r.meter_id
     JOIN energy_asset_profile p ON p.id=m.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE r.status='LOCKED' AND DATE(r.read_at) BETWEEN ? AND ?${companySql}
     ORDER BY r.meter_id, r.read_at`, [filters.dateFrom, filters.dateTo, ...companyParams]);
  const gensetRows = await rows<Record<string, unknown>>(
    `SELECT o.id, DATE(o.started_at) AS activity_date, o.started_at, o.operating_hours,
       o.generated_kwh, o.fuel_consumed_liter, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_genset_operation o
     JOIN energy_genset_profile g ON g.id=o.genset_profile_id
     JOIN energy_asset_profile p ON p.id=g.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE o.status='LOCKED' AND DATE(o.started_at) BETWEEN ? AND ?${companySql}
     ORDER BY o.started_at`, [filters.dateFrom, filters.dateTo, ...companyParams]);
  const fuelRows = await rows<Record<string, unknown>>(
    `SELECT m.*, DATE(m.movement_at) AS activity_date,
       a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset,
       destination_asset.AssetCode AS destination_asset_code,
       destination_tank_asset.AssetCode AS destination_tank_asset_code
     FROM energy_fuel_movement m
     JOIN energy_fuel_tank t ON t.id=m.fuel_tank_id
     JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     LEFT JOIN asset destination_asset ON destination_asset.AssetID=m.destination_asset_id
     LEFT JOIN energy_fuel_tank destination_tank ON destination_tank.id=m.destination_tank_id
     LEFT JOIN energy_asset_profile destination_tank_profile ON destination_tank_profile.id=destination_tank.energy_profile_id
     LEFT JOIN asset destination_tank_asset ON destination_tank_asset.AssetID=destination_tank_profile.asset_id
     WHERE m.status IN ('APPROVED','LOCKED') AND DATE(m.movement_at) BETWEEN ? AND ?${companySql}
     ORDER BY m.movement_at`, [filters.dateFrom, filters.dateTo, ...companyParams]);
  const tanks = (await tankOptions()).filter((tank) => !filters.company || String(tank.CompanyName) === filters.company);
  const pendingApprovals = Number((await one<{ total: number }>(
    `SELECT COUNT(*) AS total FROM energy_fuel_movement m
     JOIN energy_fuel_tank t ON t.id=m.fuel_tank_id
     JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE m.status='SUBMITTED'${companySql}`, companyParams))?.total ?? 0);

  const trendMap = new Map<string, Record<string, number>>();
  const trend = (date: string) => {
    const existing = trendMap.get(date);
    if (existing) return existing;
    const value = { electricity: 0, water: 0, genset_kwh: 0, genset_fuel: 0, fuel_in: 0, fuel_out: 0 };
    trendMap.set(date, value);
    return value;
  };
  for (const item of meterRows) {
    const target = trend(String(item.activity_date));
    if (String(item.energy_type) === 'WATER_METER') target.water += Number(item.consumption ?? 0);
    else target.electricity += Number(item.consumption ?? 0);
  }
  for (const item of gensetRows) {
    const target = trend(String(item.activity_date));
    target.genset_kwh += Number(item.generated_kwh ?? 0);
    target.genset_fuel += Number(item.fuel_consumed_liter ?? 0);
  }
  for (const item of fuelRows) {
    const target = trend(String(item.activity_date));
    const quantity = Number(item.quantity_liter ?? 0);
    if (INCOMING_TYPES.has(String(item.movement_type))) target.fuel_in += quantity;
    if (OUTGOING_TYPES.has(String(item.movement_type))) target.fuel_out += quantity;
  }

  const alerts: Record<string, unknown>[] = [];
  const previousByMeter = new Map<number, number>();
  for (const item of meterRows) {
    const consumption = Number(item.consumption ?? 0);
    if (Number(item.is_rollover) === 1) alerts.push({
      kind: 'ROLLOVER', severity: 'warning', occurred_at: item.read_at,
      asset_code: item.AssetCode, asset_name: item.AssetName,
      message: `Meter mengalami rollover. Konsumsi tercatat ${consumption.toLocaleString('id-ID')} ${String(item.unit ?? '')}.`,
    });
    const meterId = Number(item.meter_id);
    const previous = previousByMeter.get(meterId);
    if (previous !== undefined && previous > 0 && consumption > previous * 1.5) {
      const increase = ((consumption - previous) / previous) * 100;
      alerts.push({
        kind: 'ANOMALY', severity: increase >= 100 ? 'critical' : 'warning', occurred_at: item.read_at,
        asset_code: item.AssetCode, asset_name: item.AssetName,
        message: `Konsumsi naik ${increase.toFixed(1)}% dibanding reading sebelumnya.`,
      });
    }
    previousByMeter.set(meterId, consumption);
  }
  for (const tank of tanks) {
    const balance = Number(tank.current_balance_liter ?? 0);
    const minimum = tank.minimum_level_liter === null ? null : Number(tank.minimum_level_liter);
    if (minimum !== null && balance <= minimum) alerts.push({
      kind: 'LOW_STOCK', severity: balance <= minimum * 0.5 ? 'critical' : 'warning', occurred_at: null,
      asset_code: tank.AssetCode, asset_name: tank.AssetName,
      message: `Saldo ${balance.toLocaleString('id-ID')} liter berada di bawah batas minimum ${minimum.toLocaleString('id-ID')} liter.`,
    });
  }

  const sum = (data: Record<string, unknown>[], field: string) => data.reduce((total, item) => total + Number(item[field] ?? 0), 0);
  const summary = {
    electricity_consumption: meterRows.filter((item) => String(item.energy_type) === 'ELECTRICITY_METER').reduce((total, item) => total + Number(item.consumption ?? 0), 0),
    water_consumption: meterRows.filter((item) => String(item.energy_type) === 'WATER_METER').reduce((total, item) => total + Number(item.consumption ?? 0), 0),
    genset_generated_kwh: sum(gensetRows, 'generated_kwh'),
    genset_operating_hours: sum(gensetRows, 'operating_hours'),
    genset_fuel_liter: sum(gensetRows, 'fuel_consumed_liter'),
    total_fuel_stock_liter: tanks.reduce((total, tank) => total + Number(tank.current_balance_liter ?? 0), 0),
    pending_approvals: pendingApprovals,
    alerts: alerts.length,
  };
  const companies = await rows<{ CompanyName: string }>(
    `SELECT DISTINCT a.CompanyName FROM energy_asset_profile p JOIN asset a ON a.AssetID=p.asset_id
     WHERE a.CompanyName IS NOT NULL AND a.CompanyName<>'' ORDER BY a.CompanyName`);
  return {
    filters: { date_from: filters.dateFrom, date_to: filters.dateTo, company: filters.company, companies: companies.map((item) => item.CompanyName) },
    summary,
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
    alerts: alerts.sort((a, b) => String(b.occurred_at ?? '').localeCompare(String(a.occurred_at ?? ''))),
    tanks,
    raw: { meter_readings: meterRows, genset_operations: gensetRows, fuel_movements: fuelRows },
  };
}

energyFuelMonitoringRouter.get('/energy/monitoring', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const data = await monitoringData(monitoringFilters(req.query as Record<string, unknown>));
  const { raw: _raw, ...publicData } = data as Record<string, unknown> & { raw: unknown };
  ok(res, publicData);
}));

function styleSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  header.alignment = { vertical: 'middle' };
  sheet.columns.forEach((column) => { column.width = Math.min(35, Math.max(14, Number(column.width ?? 14))); });
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` };
}

energyFuelMonitoringRouter.get('/energy/reports/export', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const filters = monitoringFilters(req.query as Record<string, unknown>);
  const data = await monitoringData(filters) as Record<string, unknown> & {
    summary: Record<string, number>; trend: Record<string, unknown>[]; alerts: Record<string, unknown>[];
    tanks: Record<string, unknown>[]; raw: { meter_readings: Record<string, unknown>[]; genset_operations: Record<string, unknown>[]; fuel_movements: Record<string, unknown>[] };
  };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MCS Energy';
  workbook.created = new Date();
  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [{ header: 'Indikator', key: 'indicator', width: 34 }, { header: 'Nilai', key: 'value', width: 22 }];
  const summaryLabels: Record<string, string> = {
    electricity_consumption: 'Konsumsi listrik (kWh)', water_consumption: 'Konsumsi air (m3)',
    genset_generated_kwh: 'Produksi genset (kWh)', genset_operating_hours: 'Jam operasi genset',
    genset_fuel_liter: 'Fuel genset (liter)', total_fuel_stock_liter: 'Total stok fuel (liter)',
    pending_approvals: 'Movement menunggu approval', alerts: 'Jumlah peringatan',
  };
  Object.entries(data.summary).forEach(([key, value]) => summary.addRow({ indicator: summaryLabels[key] ?? key, value }));
  styleSheet(summary);

  const addSheet = (name: string, columns: Array<{ header: string; key: string; width?: number }>, values: Record<string, unknown>[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    values.forEach((value) => sheet.addRow(value));
    styleSheet(sheet);
  };
  addSheet('Tren Harian', [
    { header: 'Tanggal', key: 'date' }, { header: 'Listrik (kWh)', key: 'electricity' }, { header: 'Air (m3)', key: 'water' },
    { header: 'Genset (kWh)', key: 'genset_kwh' }, { header: 'Fuel Genset (L)', key: 'genset_fuel' },
    { header: 'Fuel Masuk (L)', key: 'fuel_in' }, { header: 'Fuel Keluar (L)', key: 'fuel_out' },
  ], data.trend);
  addSheet('Peringatan', [
    { header: 'Jenis', key: 'kind' }, { header: 'Severity', key: 'severity' }, { header: 'Waktu', key: 'occurred_at', width: 22 },
    { header: 'Asset Code', key: 'asset_code', width: 24 }, { header: 'Asset', key: 'asset_name', width: 28 }, { header: 'Pesan', key: 'message', width: 55 },
  ], data.alerts);
  addSheet('Saldo Fuel Tank', [
    { header: 'Asset Code', key: 'AssetCode', width: 24 }, { header: 'Asset', key: 'AssetName', width: 28 },
    { header: 'Tank', key: 'tank_number' }, { header: 'Fuel', key: 'fuel_type' }, { header: 'Kapasitas (L)', key: 'capacity_liter' },
    { header: 'Minimum (L)', key: 'minimum_level_liter' }, { header: 'Saldo (L)', key: 'current_balance_liter' },
  ], data.tanks);
  addSheet('Meter Reading', [
    { header: 'Waktu', key: 'read_at', width: 22 }, { header: 'Asset Code', key: 'AssetCode', width: 24 },
    { header: 'Asset', key: 'AssetName', width: 28 }, { header: 'Tipe', key: 'energy_type' },
    { header: 'Konsumsi', key: 'consumption' }, { header: 'Satuan', key: 'unit' }, { header: 'Rollover', key: 'is_rollover' },
  ], data.raw.meter_readings);
  addSheet('Operasi Genset', [
    { header: 'Mulai', key: 'started_at', width: 22 }, { header: 'Asset Code', key: 'AssetCode', width: 24 },
    { header: 'Asset', key: 'AssetName', width: 28 }, { header: 'Jam Operasi', key: 'operating_hours' },
    { header: 'Produksi (kWh)', key: 'generated_kwh' }, { header: 'Fuel (L)', key: 'fuel_consumed_liter' },
  ], data.raw.genset_operations);
  addSheet('Fuel Movement', [
    { header: 'Waktu', key: 'movement_at', width: 22 }, { header: 'Asset Code', key: 'AssetCode', width: 24 },
    { header: 'Jenis', key: 'movement_type' }, { header: 'Jumlah (L)', key: 'quantity_liter' },
    { header: 'Referensi', key: 'reference_number', width: 22 }, { header: 'Tujuan Asset', key: 'destination_asset_code', width: 24 },
    { header: 'Tujuan Tank', key: 'destination_tank_asset_code', width: 24 }, { header: 'Approved By', key: 'approved_by', width: 24 },
  ], data.raw.fuel_movements);

  const buffer = await workbook.xlsx.writeBuffer();
  const companyPart = filters.company ? `-${filters.company.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Energy-Report${companyPart}-${filters.dateFrom}-${filters.dateTo}.xlsx"`);
  res.end(Buffer.from(buffer));
}));
