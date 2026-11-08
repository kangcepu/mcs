import { Router, type NextFunction, type Response } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');

const ENERGY_TYPES = [
  'ELECTRICITY_METER',
  'GENSET',
  'FUEL_TANK',
  'WATER_METER',
  'COMPRESSOR',
  'BOILER',
  'OTHER',
] as const;

const UTILITY_TYPES = [
  'ELECTRICITY',
  'FUEL',
  'WATER',
  'COMPRESSED_AIR',
  'STEAM',
  'OTHER',
] as const;

const PROFILE_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'] as const;
const METER_TYPES = ['MAIN', 'SUB', 'INCOMING', 'OUTGOING'] as const;
const READING_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND'] as const;

const LABELS: Record<string, string> = {
  ELECTRICITY_METER: 'Meter Listrik',
  GENSET: 'Genset',
  FUEL_TANK: 'Fuel Tank',
  WATER_METER: 'Water Meter',
  COMPRESSOR: 'Compressor',
  BOILER: 'Boiler',
  OTHER: 'Lainnya',
  ELECTRICITY: 'Listrik',
  FUEL: 'Bahan Bakar',
  WATER: 'Air',
  COMPRESSED_AIR: 'Udara Bertekanan',
  STEAM: 'Steam',
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
  MAINTENANCE: 'Maintenance',
  RETIRED: 'Retired',
};

const DEFAULT_UTILITY: Record<(typeof ENERGY_TYPES)[number], (typeof UTILITY_TYPES)[number]> = {
  ELECTRICITY_METER: 'ELECTRICITY',
  GENSET: 'FUEL',
  FUEL_TANK: 'FUEL',
  WATER_METER: 'WATER',
  COMPRESSOR: 'COMPRESSED_AIR',
  BOILER: 'STEAM',
  OTHER: 'OTHER',
};

function normalizedEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new HttpError(422, `${field} tidak valid. Pilihan: ${allowed.join(', ')}.`);
  }
  return normalized as T[number];
}

function nullableText(value: unknown, maxLength: number): string | null {
  const valueText = String(value ?? '').trim();
  if (!valueText) return null;
  if (valueText.length > maxLength) throw new HttpError(422, `Nilai terlalu panjang (maksimal ${maxLength} karakter).`);
  return valueText;
}

function nullableDate(value: unknown): string | null {
  const date = String(value ?? '').trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(422, 'Format tanggal harus YYYY-MM-DD.');
  return date;
}

function nullableNumber(value: unknown, field: string, minimum = 0): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < minimum) throw new HttpError(422, `${field} harus berupa angka minimal ${minimum}.`);
  return number;
}

function requiredNumber(value: unknown, field: string, minimum = 0): number {
  const number = nullableNumber(value, field, minimum);
  if (number === null) throw new HttpError(422, `${field} wajib diisi.`);
  return number;
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  const number = nullableNumber(value, field, 1);
  if (number === null) return null;
  if (!Number.isSafeInteger(number)) throw new HttpError(422, `${field} harus berupa bilangan bulat.`);
  return number;
}

const isMeterType = (type: string): boolean => type === 'ELECTRICITY_METER' || type === 'WATER_METER';
const isUtilityMachine = (type: string): boolean => type === 'COMPRESSOR' || type === 'BOILER';

function optionalFlag(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase()) ? 1 : 0;
}

function ensureRange(minimum: number | null, maximum: number | null, field: string): void {
  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new HttpError(422, `Batas minimum ${field} tidak boleh melebihi batas maksimum.`);
  }
}

function genericMetadata(type: string, body: Record<string, unknown>): string | null {
  if (!['COMPRESSOR', 'BOILER', 'OTHER'].includes(type)) return null;
  const metadata = {
    capacity_value: nullableNumber(body.capacity_value, 'Kapasitas', 0),
    capacity_unit: nullableText(body.capacity_unit, 32),
    operating_pressure_bar: nullableNumber(body.operating_pressure_bar, 'Tekanan operasi', 0),
    rated_power_kw: nullableNumber(body.rated_power_kw, 'Daya terpasang', 0),
    technical_specification: nullableText(body.technical_specification, 5000),
  };
  return JSON.stringify(metadata);
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

async function upsertTechnicalProfile(
  connection: PoolConnection,
  profileId: number,
  energyType: string,
  body: Record<string, unknown>,
  username: string,
): Promise<void> {
  const technicalStatus = normalizedEnum(body.status ?? 'ACTIVE', PROFILE_STATUSES, 'Status');
  if (isMeterType(energyType)) {
    const unitDefault = energyType === 'WATER_METER' ? 'm3' : 'kWh';
    const unit = nullableText(body.meter_unit ?? body.unit ?? unitDefault, 24) ?? unitDefault;
    const meterType = normalizedEnum(body.meter_type ?? 'MAIN', METER_TYPES, 'Tipe meter');
    const frequency = body.reading_frequency
      ? normalizedEnum(body.reading_frequency, READING_FREQUENCIES, 'Frekuensi reading')
      : null;
    const multiplier = requiredNumber(body.meter_multiplier ?? body.multiplier ?? 1, 'Multiplier meter', 0.000001);
    const effectiveFrom = nullableDate(body.meter_effective_from ?? body.effective_from);
    const effectiveTo = nullableDate(body.meter_effective_to ?? body.effective_to);
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new HttpError(422, 'Tanggal berlaku sampai tidak boleh lebih awal dari tanggal berlaku mulai.');
    }
    const parentMeterId = nullablePositiveInteger(body.parent_meter_id, 'Parent meter');
    if (parentMeterId) {
      const parent = await connectionOne<{ id: number }>(connection, 'SELECT id FROM energy_meter WHERE id=? LIMIT 1', [parentMeterId]);
      if (!parent) throw new HttpError(422, 'Parent meter tidak ditemukan.');
    }
    await connection.execute(
      `INSERT INTO energy_meter
         (energy_profile_id, parent_meter_id, meter_number, meter_type, unit, multiplier,
          digit_count, rollover_value, reading_frequency, effective_from, effective_to,
          status, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE
         parent_meter_id=VALUES(parent_meter_id), meter_number=VALUES(meter_number),
         meter_type=VALUES(meter_type), unit=VALUES(unit), multiplier=VALUES(multiplier),
         digit_count=VALUES(digit_count), rollover_value=VALUES(rollover_value),
         reading_frequency=VALUES(reading_frequency), effective_from=VALUES(effective_from),
         effective_to=VALUES(effective_to), status=VALUES(status),
         updated_by=VALUES(updated_by), updated_at=NOW()`,
      [
        profileId,
        parentMeterId,
        nullableText(body.meter_number, 120),
        meterType,
        unit,
        multiplier,
        nullablePositiveInteger(body.digit_count, 'Jumlah digit'),
        nullableNumber(body.rollover_value, 'Nilai rollover', 0),
        frequency,
        effectiveFrom,
        effectiveTo,
        technicalStatus,
        username,
        username,
      ] as never,
    );
    return;
  }

  if (energyType === 'GENSET') {
    const initialHour = nullableNumber(body.initial_hour_meter, 'Initial hour meter', 0);
    const currentHour = nullableNumber(body.current_hour_meter, 'Current hour meter', 0);
    if (initialHour !== null && currentHour !== null && currentHour < initialHour) {
      throw new HttpError(422, 'Current hour meter tidak boleh lebih kecil dari initial hour meter.');
    }
    await connection.execute(
      `INSERT INTO energy_genset_profile
         (energy_profile_id, serial_number, rated_kva, rated_kw, fuel_type,
          tank_capacity_liter, initial_hour_meter, current_hour_meter,
          status, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE
         serial_number=VALUES(serial_number), rated_kva=VALUES(rated_kva),
         rated_kw=VALUES(rated_kw), fuel_type=VALUES(fuel_type),
         tank_capacity_liter=VALUES(tank_capacity_liter),
         initial_hour_meter=VALUES(initial_hour_meter), current_hour_meter=VALUES(current_hour_meter),
         status=VALUES(status),
         updated_by=VALUES(updated_by), updated_at=NOW()`,
      [
        profileId,
        nullableText(body.serial_number, 120),
        nullableNumber(body.rated_kva, 'Rated kVA', 0),
        nullableNumber(body.rated_kw, 'Rated kW', 0),
        nullableText(body.fuel_type ?? 'DIESEL', 40) ?? 'DIESEL',
        nullableNumber(body.tank_capacity_liter, 'Kapasitas tangki genset', 0),
        initialHour,
        currentHour,
        technicalStatus,
        username,
        username,
      ] as never,
    );
    return;
  }

  if (energyType === 'FUEL_TANK') {
    const capacity = requiredNumber(body.capacity_liter, 'Kapasitas tank', 0.001);
    const minimum = nullableNumber(body.minimum_level_liter, 'Batas minimum', 0);
    const maximum = nullableNumber(body.maximum_level_liter, 'Batas maksimum', 0);
    const reference = nullableNumber(body.reference_balance_liter, 'Saldo referensi', 0);
    if (minimum !== null && minimum > capacity) throw new HttpError(422, 'Batas minimum tidak boleh melebihi kapasitas tank.');
    if (maximum !== null && maximum > capacity) throw new HttpError(422, 'Batas maksimum tidak boleh melebihi kapasitas tank.');
    if (minimum !== null && maximum !== null && minimum > maximum) throw new HttpError(422, 'Batas minimum tidak boleh melebihi batas maksimum.');
    if (reference !== null && reference > capacity) throw new HttpError(422, 'Saldo referensi tidak boleh melebihi kapasitas tank.');
    await connection.execute(
      `INSERT INTO energy_fuel_tank
         (energy_profile_id, tank_number, fuel_type, capacity_liter,
          minimum_level_liter, maximum_level_liter, reference_balance_liter,
          status, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE
         tank_number=VALUES(tank_number), fuel_type=VALUES(fuel_type),
         capacity_liter=VALUES(capacity_liter), minimum_level_liter=VALUES(minimum_level_liter),
         maximum_level_liter=VALUES(maximum_level_liter),
         reference_balance_liter=VALUES(reference_balance_liter), status=VALUES(status),
         updated_by=VALUES(updated_by), updated_at=NOW()`,
      [
        profileId,
        nullableText(body.tank_number, 120),
        nullableText(body.fuel_type ?? 'DIESEL', 40) ?? 'DIESEL',
        capacity,
        minimum,
        maximum,
        reference,
        technicalStatus,
        username,
        username,
      ] as never,
    );
    return;
  }

  if (isUtilityMachine(energyType)) {
    const initialHour = nullableNumber(body.utility_initial_hour_meter, 'Initial hour meter utility', 0);
    const currentHour = nullableNumber(body.utility_current_hour_meter, 'Current hour meter utility', 0);
    if (initialHour !== null && currentHour !== null && currentHour < initialHour) {
      throw new HttpError(422, 'Current hour meter utility tidak boleh lebih kecil dari initial hour meter.');
    }
    const pressureMin = nullableNumber(body.pressure_min_bar, 'Batas minimum tekanan', 0);
    const pressureMax = nullableNumber(body.pressure_max_bar, 'Batas maksimum tekanan', 0);
    const temperatureMin = nullableNumber(body.temperature_min_c, 'Batas minimum temperatur', -273.15);
    const temperatureMax = nullableNumber(body.temperature_max_c, 'Batas maksimum temperatur', -273.15);
    const flowMin = nullableNumber(body.flow_min, 'Batas minimum flow', 0);
    const flowMax = nullableNumber(body.flow_max, 'Batas maksimum flow', 0);
    const outputMin = nullableNumber(body.output_min, 'Batas minimum output', 0);
    const outputMax = nullableNumber(body.output_max, 'Batas maksimum output', 0);
    ensureRange(pressureMin, pressureMax, 'tekanan');
    ensureRange(temperatureMin, temperatureMax, 'temperatur');
    ensureRange(flowMin, flowMax, 'flow');
    ensureRange(outputMin, outputMax, 'output');
    const inspectionFrequency = normalizedEnum(
      body.utility_inspection_frequency ?? 'DAILY',
      READING_FREQUENCIES,
      'Frekuensi inspeksi',
    );
    await connection.execute(
      `INSERT INTO energy_utility_profile
         (energy_profile_id, utility_kind, capacity_value, capacity_unit, rated_power_kw,
          initial_hour_meter, current_hour_meter, pressure_min_bar, pressure_max_bar,
          temperature_min_c, temperature_max_c, flow_min, flow_max, flow_unit,
          output_min, output_max, output_unit, inspection_frequency,
          preventive_interval_hours, last_preventive_hour_meter,
          auto_corrective_wo, auto_preventive_wo, status,
          created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE
         utility_kind=VALUES(utility_kind), capacity_value=VALUES(capacity_value),
         capacity_unit=VALUES(capacity_unit), rated_power_kw=VALUES(rated_power_kw),
         initial_hour_meter=VALUES(initial_hour_meter), current_hour_meter=VALUES(current_hour_meter),
         pressure_min_bar=VALUES(pressure_min_bar), pressure_max_bar=VALUES(pressure_max_bar),
         temperature_min_c=VALUES(temperature_min_c), temperature_max_c=VALUES(temperature_max_c),
         flow_min=VALUES(flow_min), flow_max=VALUES(flow_max), flow_unit=VALUES(flow_unit),
         output_min=VALUES(output_min), output_max=VALUES(output_max), output_unit=VALUES(output_unit),
         inspection_frequency=VALUES(inspection_frequency),
         preventive_interval_hours=VALUES(preventive_interval_hours),
         last_preventive_hour_meter=VALUES(last_preventive_hour_meter),
         auto_corrective_wo=VALUES(auto_corrective_wo), auto_preventive_wo=VALUES(auto_preventive_wo),
         status=VALUES(status), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [
        profileId,
        energyType,
        nullableNumber(body.capacity_value, 'Kapasitas', 0),
        nullableText(body.capacity_unit, 32),
        nullableNumber(body.rated_power_kw, 'Daya terpasang', 0),
        initialHour,
        currentHour,
        pressureMin,
        pressureMax,
        temperatureMin,
        temperatureMax,
        flowMin,
        flowMax,
        nullableText(body.flow_unit, 24),
        outputMin,
        outputMax,
        nullableText(body.output_unit, 24),
        inspectionFrequency,
        nullableNumber(body.preventive_interval_hours, 'Interval preventive', 0.001),
        nullableNumber(body.last_preventive_hour_meter, 'Hour meter preventive terakhir', 0),
        optionalFlag(body.auto_corrective_wo, 1),
        optionalFlag(body.auto_preventive_wo, 1),
        technicalStatus,
        username,
        username,
      ] as never,
    );
  }
}

async function removeOldTechnicalProfile(connection: PoolConnection, profileId: number, oldType: string): Promise<void> {
  if (isMeterType(oldType)) {
    const meter = await connectionOne<{ id: number }>(connection, 'SELECT id FROM energy_meter WHERE energy_profile_id=? LIMIT 1', [profileId]);
    if (!meter) return;
    const usage = await connectionOne<{ total: number }>(
      connection,
      `SELECT
         (SELECT COUNT(*) FROM energy_meter_reading WHERE meter_id=?) +
         (SELECT COUNT(*) FROM energy_meter WHERE parent_meter_id=?) AS total`,
      [meter.id, meter.id],
    );
    if (Number(usage?.total ?? 0) > 0) throw new HttpError(409, 'Jenis asset tidak dapat diubah karena meter sudah memiliki reading atau submeter.');
    await connection.execute('DELETE FROM energy_meter WHERE id=?', [meter.id]);
  } else if (oldType === 'GENSET') {
    const genset = await connectionOne<{ id: number }>(connection, 'SELECT id FROM energy_genset_profile WHERE energy_profile_id=? LIMIT 1', [profileId]);
    if (!genset) return;
    const usage = await connectionOne<{ total: number }>(connection, 'SELECT COUNT(*) AS total FROM energy_genset_operation WHERE genset_profile_id=?', [genset.id]);
    if (Number(usage?.total ?? 0) > 0) throw new HttpError(409, 'Jenis asset tidak dapat diubah karena genset sudah memiliki operation log.');
    await connection.execute('DELETE FROM energy_genset_profile WHERE id=?', [genset.id]);
  } else if (oldType === 'FUEL_TANK') {
    const tank = await connectionOne<{ id: number }>(connection, 'SELECT id FROM energy_fuel_tank WHERE energy_profile_id=? LIMIT 1', [profileId]);
    if (!tank) return;
    const usage = await connectionOne<{ total: number }>(connection, 'SELECT COUNT(*) AS total FROM energy_fuel_movement WHERE fuel_tank_id=? OR destination_tank_id=?', [tank.id, tank.id]);
    if (Number(usage?.total ?? 0) > 0) throw new HttpError(409, 'Jenis asset tidak dapat diubah karena fuel tank sudah memiliki movement.');
    await connection.execute('DELETE FROM energy_fuel_tank WHERE id=?', [tank.id]);
  } else if (isUtilityMachine(oldType)) {
    const utility = await connectionOne<{ id: number }>(connection, 'SELECT id FROM energy_utility_profile WHERE energy_profile_id=? LIMIT 1', [profileId]);
    if (!utility) return;
    const usage = await connectionOne<{ total: number }>(connection, 'SELECT COUNT(*) AS total FROM energy_utility_operation WHERE utility_profile_id=?', [utility.id]);
    if (Number(usage?.total ?? 0) > 0) throw new HttpError(409, 'Jenis asset tidak dapat diubah karena utility sudah memiliki riwayat inspeksi.');
    await connection.execute('DELETE FROM energy_utility_profile WHERE id=?', [utility.id]);
  }
}

const PROFILE_FROM_SQL = `FROM energy_asset_profile p
  INNER JOIN asset a ON a.AssetID = p.asset_id
  LEFT JOIN energy_meter m ON m.energy_profile_id = p.id
  LEFT JOIN energy_genset_profile g ON g.energy_profile_id = p.id
  LEFT JOIN energy_fuel_tank t ON t.energy_profile_id = p.id
  LEFT JOIN energy_utility_profile u ON u.energy_profile_id = p.id`;

const PROFILE_SELECT_SQL = `SELECT p.*, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset,
  a.CategoryAsset, a.active AS asset_status,
  m.id AS meter_id, m.parent_meter_id, m.meter_number, m.meter_type,
  m.unit AS meter_unit, m.multiplier AS meter_multiplier, m.digit_count,
  m.rollover_value, m.reading_frequency, m.effective_from AS meter_effective_from,
  m.effective_to AS meter_effective_to,
  g.id AS genset_profile_id, g.serial_number, g.rated_kva, g.rated_kw,
  g.fuel_type AS genset_fuel_type, g.tank_capacity_liter,
  g.initial_hour_meter, g.current_hour_meter,
  t.id AS fuel_tank_id, t.tank_number, t.fuel_type AS tank_fuel_type,
  t.capacity_liter, t.minimum_level_liter, t.maximum_level_liter,
  t.reference_balance_liter,
  u.id AS utility_profile_id, u.utility_kind,
  u.capacity_value AS utility_capacity_value, u.capacity_unit AS utility_capacity_unit,
  u.rated_power_kw AS utility_rated_power_kw,
  u.initial_hour_meter AS utility_initial_hour_meter,
  u.current_hour_meter AS utility_current_hour_meter,
  u.pressure_min_bar, u.pressure_max_bar,
  u.temperature_min_c, u.temperature_max_c,
  u.flow_min, u.flow_max, u.flow_unit,
  u.output_min, u.output_max, u.output_unit,
  u.inspection_frequency AS utility_inspection_frequency,
  u.preventive_interval_hours, u.last_preventive_hour_meter,
  u.auto_corrective_wo, u.auto_preventive_wo`;

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('energy_asset_profile'))) {
    throw new HttpError(
      503,
      'Fondasi Energy belum tersedia. Jalankan migration 20261107_energy_asset_foundation.sql terlebih dahulu.',
      'ENERGY_MIGRATION_REQUIRED',
    );
  }
}

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) {
    return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  }
  next();
}

energyRouter.use('/energy', authenticate, featureEnabled);

energyRouter.get('/energy/asset-profiles/options', canRead, asyncHandler(async (_req, res) => {
  await ensureFoundation();
  ok(res, {
    energy_types: ENERGY_TYPES.map((value) => ({ value, label: LABELS[value] })),
    utility_types: UTILITY_TYPES.map((value) => ({ value, label: LABELS[value] })),
    statuses: PROFILE_STATUSES.map((value) => ({ value, label: LABELS[value] })),
    default_utility: DEFAULT_UTILITY,
  });
}));

energyRouter.get('/energy/asset-profiles', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page ?? 25)));
  const where: string[] = [];
  const params: unknown[] = [];

  const q = String(req.query.q ?? '').trim();
  if (q) {
    where.push(`(a.AssetCode LIKE ? OR a.AssetName LIKE ? OR p.profile_code LIKE ? OR
      a.LocationAsset LIKE ? OR m.meter_number LIKE ? OR g.serial_number LIKE ? OR t.tank_number LIKE ?)`);
    params.push(...Array(7).fill(`%${q}%`));
  }
  const company = String(req.query.company ?? '').trim();
  if (company) { where.push('a.CompanyName = ?'); params.push(company); }
  const energyType = String(req.query.energy_type ?? '').trim().toUpperCase();
  if (energyType) { where.push('p.energy_type = ?'); params.push(energyType); }
  const utilityType = String(req.query.utility_type ?? '').trim().toUpperCase();
  if (utilityType) { where.push('p.utility_type = ?'); params.push(utilityType); }
  const status = String(req.query.status ?? '').trim().toUpperCase();
  if (status) { where.push('p.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await one<{ total: number }>(`SELECT COUNT(*) AS total ${PROFILE_FROM_SQL} ${whereSql}`, params);
  const totalCount = Number(total?.total ?? 0);
  const data = await rows(
    `${PROFILE_SELECT_SQL}
     ${PROFILE_FROM_SQL} ${whereSql}
     ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  ok(res, data, 'OK', {
    page,
    per_page: perPage,
    total: totalCount,
    total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
  });
}));

energyRouter.get('/energy/asset-profiles/:assetId', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const assetId = Number(req.params.assetId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new HttpError(422, 'AssetID tidak valid.');
  const profile = await one(
    `${PROFILE_SELECT_SQL}
     ${PROFILE_FROM_SQL}
     WHERE p.asset_id = ? LIMIT 1`,
    [assetId],
  );
  if (!profile) throw new HttpError(404, 'Profil Energy asset tidak ditemukan.');
  ok(res, profile);
}));

energyRouter.post('/energy/asset-profiles', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const assetId = Number(req.body.asset_id ?? req.body.AssetID ?? 0);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new HttpError(422, 'Asset wajib dipilih.');
  const energyType = normalizedEnum(req.body.energy_type, ENERGY_TYPES, 'Jenis Energy asset');
  const utilityType = req.body.utility_type
    ? normalizedEnum(req.body.utility_type, UTILITY_TYPES, 'Jenis utility')
    : DEFAULT_UTILITY[energyType];
  const status = req.body.status
    ? normalizedEnum(req.body.status, PROFILE_STATUSES, 'Status')
    : 'ACTIVE';
  const user = (req as AuthRequest).user!;
  const result = await transaction(async (connection) => {
    const asset = await connectionOne<{ AssetID: number; AssetCode: string }>(
      connection,
      'SELECT AssetID, AssetCode FROM asset WHERE AssetID = ? LIMIT 1 FOR UPDATE',
      [assetId],
    );
    if (!asset) throw new HttpError(404, 'Asset tidak ditemukan.');
    if (await connectionOne(connection, 'SELECT id FROM energy_asset_profile WHERE asset_id = ? LIMIT 1', [assetId])) {
      throw new HttpError(409, 'Asset tersebut sudah memiliki profil Energy.');
    }
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_asset_profile
         (asset_id, energy_type, utility_type, profile_code, description,
          commissioning_date, ownership, status, metadata_json,
          created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        assetId,
        energyType,
        utilityType,
        nullableText(req.body.profile_code, 100),
        nullableText(req.body.description, 5000),
        nullableDate(req.body.commissioning_date),
        nullableText(req.body.ownership, 80),
        status,
        genericMetadata(energyType, req.body),
        user.fullname,
        user.fullname,
      ] as never,
    );
    await upsertTechnicalProfile(connection, insertResult.insertId, energyType, req.body, String(user.fullname));
    return { id: insertResult.insertId, asset_code: asset.AssetCode };
  });
  created(res, { id: result.id, asset_id: assetId, asset_code: result.asset_code }, 'Profil Energy asset dibuat.');
}));

energyRouter.patch('/energy/asset-profiles/:assetId', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const assetId = Number(req.params.assetId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw new HttpError(422, 'AssetID tidak valid.');
  const user = (req as AuthRequest).user!;
  await transaction(async (connection) => {
    const existing = await connectionOne<{ id: number; energy_type: string; utility_type: string }>(
      connection,
      'SELECT id, energy_type, utility_type FROM energy_asset_profile WHERE asset_id=? LIMIT 1 FOR UPDATE',
      [assetId],
    );
    if (!existing) throw new HttpError(404, 'Profil Energy asset tidak ditemukan.');

    const energyType = req.body.energy_type !== undefined
      ? normalizedEnum(req.body.energy_type, ENERGY_TYPES, 'Jenis Energy asset')
      : existing.energy_type;
    const utilityType = req.body.utility_type !== undefined
      ? normalizedEnum(req.body.utility_type, UTILITY_TYPES, 'Jenis utility')
      : existing.utility_type;
    const status = req.body.status !== undefined
      ? normalizedEnum(req.body.status, PROFILE_STATUSES, 'Status')
      : 'ACTIVE';

    if (energyType !== existing.energy_type && !(isMeterType(energyType) && isMeterType(existing.energy_type))) {
      await removeOldTechnicalProfile(connection, existing.id, existing.energy_type);
    }

    await connection.execute(
      `UPDATE energy_asset_profile SET
         energy_type=?, utility_type=?, profile_code=?, description=?,
         commissioning_date=?, ownership=?, status=?, metadata_json=?,
         updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [
        energyType,
        utilityType,
        nullableText(req.body.profile_code, 100),
        nullableText(req.body.description, 5000),
        nullableDate(req.body.commissioning_date),
        nullableText(req.body.ownership, 80),
        status,
        genericMetadata(energyType, req.body),
        user.fullname,
        existing.id,
      ] as never,
    );
    await upsertTechnicalProfile(connection, existing.id, energyType, req.body, String(user.fullname));
  });
  ok(res, { asset_id: assetId }, 'Profil Energy asset diperbarui.');
}));
