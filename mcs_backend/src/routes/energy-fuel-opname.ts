import crypto from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

export const energyFuelOpnameRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const METHODS = ['DIP_STICK', 'LEVEL_GAUGE', 'FLOW_METER', 'OTHER'] as const;
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(file.mimetype)) {
      return callback(new HttpError(422, 'Evidence opname harus berupa JPG, PNG, WEBP, atau BMP.'));
    }
    callback(null, true);
  },
});

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('energy_fuel_stock_opname')) || !(await tableExists('energy_fuel_stock_opname_attachment'))) {
    throw new HttpError(503, 'Stock opname fuel belum tersedia. Jalankan migration 20261108_energy_fuel_stock_opname.sql.');
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

function dateTime(value: unknown): string {
  const raw = String(value ?? '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw)) throw new HttpError(422, 'Waktu stock opname tidak valid.');
  return raw.length === 16 ? `${raw}:00` : raw;
}

function method(value: unknown): (typeof METHODS)[number] {
  const normalized = String(value ?? 'DIP_STICK').trim().toUpperCase();
  if (!METHODS.includes(normalized as (typeof METHODS)[number])) throw new HttpError(422, 'Metode pengukuran tidak valid.');
  return normalized as (typeof METHODS)[number];
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

type TankRow = {
  id: number;
  capacity_liter: number | string;
  maximum_level_liter: number | string | null;
  reference_balance_liter: number | string | null;
  status: string;
  tank_number: string | null;
  AssetCode: string;
  AssetName: string;
};

async function tankForUpdate(connection: PoolConnection, tankId: number): Promise<TankRow> {
  const tank = await connectionOne<TankRow>(connection,
    `SELECT t.*, a.AssetCode, a.AssetName
     FROM energy_fuel_tank t
     JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE t.id=? LIMIT 1 FOR UPDATE`, [tankId]);
  if (!tank) throw new HttpError(404, 'Fuel tank tidak ditemukan.');
  if (tank.status !== 'ACTIVE') throw new HttpError(409, 'Fuel tank tidak aktif.');
  return tank;
}

async function balanceAt(connection: PoolConnection, tankId: number, at?: string): Promise<number> {
  const timeSql = at ? ' AND m.movement_at <= ?' : '';
  const params = at ? [at, at, tankId] : [tankId];
  const result = await connectionOne<{ balance: number | string }>(connection,
    `SELECT COALESCE(t.reference_balance_liter,0)
       + COALESCE((SELECT SUM(CASE
           WHEN m.movement_type IN ('RECEIPT','ADJUSTMENT_IN') THEN m.quantity_liter
           WHEN m.movement_type IN ('CONSUMPTION','TRANSFER','ADJUSTMENT_OUT') THEN -m.quantity_liter
           ELSE 0 END)
         FROM energy_fuel_movement m
         WHERE m.fuel_tank_id=t.id AND m.status IN ('APPROVED','LOCKED')${timeSql}),0)
       + COALESCE((SELECT SUM(m.quantity_liter)
         FROM energy_fuel_movement m
         WHERE m.destination_tank_id=t.id AND m.movement_type='TRANSFER'
           AND m.status IN ('APPROVED','LOCKED')${timeSql}),0) AS balance
     FROM energy_fuel_tank t WHERE t.id=? LIMIT 1`, params);
  return Number(result?.balance ?? 0);
}

function variance(systemBalance: number, physicalBalance: number): { liters: number; percent: number | null } {
  const liters = Math.round((physicalBalance - systemBalance) * 1000) / 1000;
  const percent = systemBalance === 0 ? null : Math.round((liters / systemBalance) * 100 * 1_000_000) / 1_000_000;
  return { liters, percent };
}

function opnameNumber(tankId: number, opnameAt: string): string {
  const compact = opnameAt.replace(/[-: ]/g, '').slice(0, 12);
  return `OPN-FUEL-${compact}-${tankId}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function attachments(opnameIds: number[]): Promise<Map<number, Record<string, unknown>[]>> {
  const map = new Map<number, Record<string, unknown>[]>();
  if (!opnameIds.length) return map;
  const data = await rows<Record<string, unknown>>(
    `SELECT * FROM energy_fuel_stock_opname_attachment
     WHERE opname_id IN (${opnameIds.map(() => '?').join(',')}) ORDER BY id`, opnameIds);
  for (const item of data) {
    const id = Number(item.opname_id);
    const list = map.get(id) ?? [];
    list.push({ ...item, url: `/uploads/${String(item.object_key).replace(/^\/+/, '')}` });
    map.set(id, list);
  }
  return map;
}

async function saveOpname(connection: PoolConnection, tankId: number, body: Record<string, unknown>, actor: string, opnameId?: number): Promise<Record<string, unknown>> {
  const tank = await tankForUpdate(connection, tankId);
  const at = dateTime(body.opname_at);
  const physical = decimal(body.physical_balance_liter, 'Saldo fisik')!;
  const maximum = Number(tank.maximum_level_liter ?? tank.capacity_liter);
  if (physical > maximum) throw new HttpError(422, `Saldo fisik tidak boleh melebihi batas tank ${maximum.toLocaleString('id-ID')} liter.`);
  const tolerance = decimal(body.tolerance_liter, 'Toleransi', false) ?? 0;
  const system = await balanceAt(connection, tankId, at);
  const delta = variance(system, physical);
  const measuredBy = shortText(body.measured_by, 120) ?? actor;
  const measurementMethod = method(body.measurement_method);
  const notes = shortText(body.notes, 5000);

  if (opnameId) {
    const existing = await connectionOne<{ status: string }>(connection,
      'SELECT status FROM energy_fuel_stock_opname WHERE id=? AND fuel_tank_id=? LIMIT 1 FOR UPDATE', [opnameId, tankId]);
    if (!existing) throw new HttpError(404, 'Stock opname tidak ditemukan.');
    if (existing.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft stock opname yang dapat diubah.');
    await connection.execute(
      `UPDATE energy_fuel_stock_opname SET opname_at=?, system_balance_liter=?, physical_balance_liter=?,
       variance_liter=?, variance_percent=?, tolerance_liter=?, measurement_method=?, measured_by=?,
       notes=?, updated_by=?, updated_at=NOW() WHERE id=?`,
      [at, system, physical, delta.liters, delta.percent, tolerance, measurementMethod, measuredBy, notes, actor, opnameId] as never);
    return { id: opnameId, system_balance_liter: system, physical_balance_liter: physical, variance_liter: delta.liters, variance_percent: delta.percent };
  }

  const [inserted] = await connection.execute<ResultSetHeader>(
    `INSERT INTO energy_fuel_stock_opname
     (fuel_tank_id, opname_number, opname_at, system_balance_liter, physical_balance_liter,
      variance_liter, variance_percent, tolerance_liter, measurement_method, status,
      measured_by, notes, created_by, updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,NOW(),NOW())`,
    [tankId, opnameNumber(tankId, at), at, system, physical, delta.liters, delta.percent,
      tolerance, measurementMethod, measuredBy, notes, actor, actor] as never);
  return { id: inserted.insertId, system_balance_liter: system, physical_balance_liter: physical, variance_liter: delta.liters, variance_percent: delta.percent };
}

energyFuelOpnameRouter.use('/energy', authenticate, featureEnabled);

energyFuelOpnameRouter.get('/energy/fuel-tanks/:tankId/opnames', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const tankId = positiveId(req.params.tankId, 'Tank ID');
  const tank = await one(
    `SELECT t.*, p.asset_id, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_fuel_tank t JOIN energy_asset_profile p ON p.id=t.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id WHERE t.id=? LIMIT 1`, [tankId]);
  if (!tank) throw new HttpError(404, 'Fuel tank tidak ditemukan.');
  const data = await rows<Record<string, unknown>>(
    'SELECT * FROM energy_fuel_stock_opname WHERE fuel_tank_id=? ORDER BY opname_at DESC, id DESC', [tankId]);
  const files = await attachments(data.map((item) => Number(item.id)));
  ok(res, { tank, opnames: data.map((item) => ({ ...item, attachments: files.get(Number(item.id)) ?? [] })) });
}));

energyFuelOpnameRouter.post('/energy/fuel-tanks/:tankId/opnames', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const tankId = positiveId(req.params.tankId, 'Tank ID');
  const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction((connection) => saveOpname(connection, tankId, req.body, actor));
  created(res, result, 'Draft stock opname dibuat.');
}));

energyFuelOpnameRouter.patch('/energy/fuel-opnames/:opnameId', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const opnameId = positiveId(req.params.opnameId, 'Opname ID');
  const item = await one<{ fuel_tank_id: number }>('SELECT fuel_tank_id FROM energy_fuel_stock_opname WHERE id=? LIMIT 1', [opnameId]);
  if (!item) throw new HttpError(404, 'Stock opname tidak ditemukan.');
  const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction((connection) => saveOpname(connection, item.fuel_tank_id, req.body, actor, opnameId));
  ok(res, result, 'Draft stock opname diperbarui.');
}));

energyFuelOpnameRouter.post('/energy/fuel-opnames/:opnameId/attachments', canManage, evidenceUpload.array('files', 5), asyncHandler(async (req, res) => {
  await ensureFoundation();
  const opnameId = positiveId(req.params.opnameId, 'Opname ID');
  const item = await one<{ status: string }>('SELECT status FROM energy_fuel_stock_opname WHERE id=? LIMIT 1', [opnameId]);
  if (!item) throw new HttpError(404, 'Stock opname tidak ditemukan.');
  if (item.status !== 'DRAFT') throw new HttpError(409, 'Evidence hanya dapat ditambahkan saat opname masih draft.');
  const uploadFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!uploadFiles.length) throw new HttpError(422, 'Pilih minimal satu foto evidence.');
  const actor = String((req as AuthRequest).user!.fullname);
  const uploaded: Record<string, unknown>[] = [];
  for (const file of uploadFiles) {
    const key = await saveUploadedFile(file.buffer, `energy/fuel-opnames/${opnameId}`, file.originalname, file.mimetype);
    const id = await transaction(async (connection) => {
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO energy_fuel_stock_opname_attachment
         (opname_id, attachment_type, file_name, object_key, mime_type, file_size, uploaded_by, created_at)
         VALUES (?,'PHYSICAL_EVIDENCE',?,?,?,?,?,NOW())`,
        [opnameId, file.originalname, key, file.mimetype, file.size, actor] as never);
      return inserted.insertId;
    });
    uploaded.push({ id, file_name: file.originalname, url: `/uploads/${key}` });
  }
  created(res, uploaded, 'Evidence stock opname diunggah.');
}));

energyFuelOpnameRouter.delete('/energy/fuel-opname-attachments/:attachmentId', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const attachmentId = positiveId(req.params.attachmentId, 'Attachment ID');
  const item = await one<{ object_key: string; status: string }>(
    `SELECT a.object_key, o.status FROM energy_fuel_stock_opname_attachment a
     JOIN energy_fuel_stock_opname o ON o.id=a.opname_id WHERE a.id=? LIMIT 1`, [attachmentId]);
  if (!item) throw new HttpError(404, 'Evidence tidak ditemukan.');
  if (item.status !== 'DRAFT') throw new HttpError(409, 'Evidence opname yang sudah disubmit tidak dapat dihapus.');
  await transaction(async (connection) => { await connection.execute('DELETE FROM energy_fuel_stock_opname_attachment WHERE id=?', [attachmentId]); });
  await deleteObjectKey(item.object_key);
  ok(res, null, 'Evidence dihapus.');
}));

energyFuelOpnameRouter.post('/energy/fuel-opnames/:opnameId/submit', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const opnameId = positiveId(req.params.opnameId, 'Opname ID');
  const actor = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{ status: string }>(connection,
      'SELECT status FROM energy_fuel_stock_opname WHERE id=? LIMIT 1 FOR UPDATE', [opnameId]);
    if (!item) throw new HttpError(404, 'Stock opname tidak ditemukan.');
    if (item.status !== 'DRAFT') throw new HttpError(409, 'Stock opname harus berstatus DRAFT.');
    const evidence = await connectionOne(connection, 'SELECT id FROM energy_fuel_stock_opname_attachment WHERE opname_id=? LIMIT 1', [opnameId]);
    if (!evidence) throw new HttpError(422, 'Unggah minimal satu foto evidence sebelum submit.');
    await connection.execute(
      "UPDATE energy_fuel_stock_opname SET status='SUBMITTED', submitted_by=?, submitted_at=NOW(), updated_by=?, updated_at=NOW() WHERE id=?",
      [actor, actor, opnameId]);
  });
  ok(res, { id: opnameId, status: 'SUBMITTED' }, 'Stock opname disubmit untuk approval.');
}));

energyFuelOpnameRouter.post('/energy/fuel-opnames/:opnameId/review', canApprove, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const opnameId = positiveId(req.params.opnameId, 'Opname ID');
  const action = String(req.body.action ?? '').trim().toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(action)) throw new HttpError(422, 'Action harus APPROVE atau REJECT.');
  const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction(async (connection) => {
    const item = await connectionOne<{
      id: number; fuel_tank_id: number; opname_number: string; opname_at: string; physical_balance_liter: number | string;
      tolerance_liter: number | string; measurement_method: string; measured_by: string | null; status: string;
    }>(connection, 'SELECT * FROM energy_fuel_stock_opname WHERE id=? LIMIT 1 FOR UPDATE', [opnameId]);
    if (!item) throw new HttpError(404, 'Stock opname tidak ditemukan.');
    if (item.status !== 'SUBMITTED') throw new HttpError(409, 'Stock opname harus berstatus SUBMITTED.');
    const reviewNote = shortText(req.body.review_note, 2000);
    if (action === 'REJECT') {
      await connection.execute(
        "UPDATE energy_fuel_stock_opname SET status='REJECTED', reviewed_by=?, reviewed_at=NOW(), review_note=?, updated_by=?, updated_at=NOW() WHERE id=?",
        [actor, reviewNote, actor, opnameId]);
      return { status: 'REJECTED', adjustment_movement_id: null, reconciled_balance_liter: null };
    }

    const tank = await tankForUpdate(connection, item.fuel_tank_id);
    const systemAt = await balanceAt(connection, tank.id, item.opname_at);
    const currentBalance = await balanceAt(connection, tank.id);
    const physical = Number(item.physical_balance_liter);
    const delta = variance(systemAt, physical);
    const projected = Math.round((currentBalance + delta.liters) * 1000) / 1000;
    const maximum = Number(tank.maximum_level_liter ?? tank.capacity_liter);
    if (projected < 0 || projected > maximum) {
      throw new HttpError(409, `Rekonsiliasi menghasilkan saldo berjalan ${projected.toLocaleString('id-ID')} liter, di luar batas 0–${maximum.toLocaleString('id-ID')} liter. Periksa movement setelah waktu opname.`);
    }

    let adjustmentId: number | null = null;
    if (Math.abs(delta.liters) >= 0.0005) {
      const movementType = delta.liters > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const tolerance = Number(item.tolerance_liter ?? 0);
      const toleranceNote = Math.abs(delta.liters) > tolerance ? 'di luar toleransi' : 'dalam toleransi';
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO energy_fuel_movement
         (fuel_tank_id, movement_type, movement_at, quantity_liter, destination_type,
          reference_number, status, notes, created_by, approved_by, approved_at, created_at, updated_at)
         VALUES (?,?,?,?,NULL,?,'APPROVED',?,?,?,NOW(),NOW(),NOW())`,
        [tank.id, movementType, item.opname_at, Math.abs(delta.liters), item.opname_number,
          `Rekonsiliasi stock opname ${item.opname_number}; selisih ${toleranceNote}.`, actor, actor] as never);
      adjustmentId = inserted.insertId;
    }
    await connection.execute(
      `UPDATE energy_fuel_stock_opname SET system_balance_liter=?, variance_liter=?, variance_percent=?,
       status='APPROVED', reviewed_by=?, reviewed_at=NOW(), review_note=?, adjustment_movement_id=?,
       updated_by=?, updated_at=NOW() WHERE id=?`,
      [systemAt, delta.liters, delta.percent, actor, reviewNote, adjustmentId, actor, opnameId] as never);
    return { status: 'APPROVED', adjustment_movement_id: adjustmentId, reconciled_balance_liter: projected, variance_liter: delta.liters };
  });
  ok(res, { id: opnameId, ...result }, action === 'APPROVE' ? 'Stock opname disetujui dan saldo direkonsiliasi.' : 'Stock opname ditolak.');
}));
