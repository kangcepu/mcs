import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { deleteObjectKey, saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyOperationsRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(file.mimetype)) {
      return callback(new HttpError(422, 'Lampiran meter harus berupa JPG, PNG, WEBP, atau BMP.'));
    }
    callback(null, true);
  },
});

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

async function ensureFoundation(): Promise<void> {
  if (!(await tableExists('energy_meter_reading')) || !(await tableExists('energy_genset_operation'))) {
    throw new HttpError(503, 'Fondasi operasional Energy belum tersedia. Jalankan migration Energy foundation.');
  }
}

async function ensureGensetFuelIntegration(): Promise<void> {
  if (!(await tableExists('energy_genset_fuel_usage'))) {
    throw new HttpError(503, 'Integrasi genset dan Fuel Tank belum tersedia. Jalankan migration 20261108_energy_genset_fuel_tank_integration.sql.');
  }
}

function positiveId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, `${field} tidak valid.`);
  return id;
}

function numeric(value: unknown, field: string, required = true): number | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(422, `${field} wajib diisi.`);
    return null;
  }
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(422, `${field} harus berupa angka nol atau lebih.`);
  return parsed;
}

function text(value: unknown, max: number): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return normalized;
}

function dateTime(value: unknown, field: string): string {
  const raw = String(value ?? '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    throw new HttpError(422, `${field} wajib berformat tanggal dan waktu yang valid.`);
  }
  return raw.length === 16 ? `${raw}:00` : raw;
}

function readingPeriod(value: unknown, readAt: string): string {
  const raw = String(value ?? '').trim() || readAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(422, 'Periode reading tidak valid.');
  return raw;
}

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}

type MeterRow = {
  id: number;
  multiplier: number | string;
  rollover_value: number | string | null;
  unit: string;
  AssetCode: string;
  AssetName: string;
};

async function meterForUpdate(connection: PoolConnection, meterId: number): Promise<MeterRow> {
  const meter = await connectionOne<MeterRow>(connection,
    `SELECT m.id, m.multiplier, m.rollover_value, m.unit, a.AssetCode, a.AssetName
     FROM energy_meter m
     JOIN energy_asset_profile p ON p.id=m.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id
     WHERE m.id=? LIMIT 1 FOR UPDATE`, [meterId]);
  if (!meter) throw new HttpError(404, 'Meter Energy tidak ditemukan.');
  return meter;
}

function calculateConsumption(previous: number, current: number, multiplier: number, rollover: number | null): { consumption: number; isRollover: number } {
  if (current >= previous) return { consumption: (current - previous) * multiplier, isRollover: 0 };
  if (rollover === null || rollover <= previous) {
    throw new HttpError(422, 'Angka meter lebih kecil dari sebelumnya. Isi nilai rollover pada profil meter atau koreksi angkanya.');
  }
  return { consumption: ((rollover - previous) + current) * multiplier, isRollover: 1 };
}

async function readingAttachments(readingIds: number[]): Promise<Map<number, Record<string, unknown>[]>> {
  const map = new Map<number, Record<string, unknown>[]>();
  if (!readingIds.length) return map;
  const data = await rows<Record<string, unknown>>(
    `SELECT id, reading_id, attachment_type, file_name, object_key, mime_type, file_size, uploaded_by, created_at
     FROM energy_meter_reading_attachment
     WHERE reading_id IN (${readingIds.map(() => '?').join(',')}) ORDER BY id`, readingIds);
  for (const item of data) {
    const id = Number(item.reading_id);
    const list = map.get(id) ?? [];
    list.push({ ...item, url: `/uploads/${String(item.object_key).replace(/^\/+/, '')}` });
    map.set(id, list);
  }
  return map;
}

energyOperationsRouter.use('/energy', authenticate, featureEnabled);

energyOperationsRouter.get('/energy/meters/:meterId/readings', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const meterId = positiveId(req.params.meterId, 'Meter ID');
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 25)));
  const meter = await one(
    `SELECT m.*, p.asset_id, p.energy_type, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_meter m JOIN energy_asset_profile p ON p.id=m.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id WHERE m.id=? LIMIT 1`, [meterId]);
  if (!meter) throw new HttpError(404, 'Meter Energy tidak ditemukan.');
  const total = Number((await one<{ total: number }>('SELECT COUNT(*) AS total FROM energy_meter_reading WHERE meter_id=?', [meterId]))?.total ?? 0);
  const data = await rows<Record<string, unknown>>(
    `SELECT r.*,
       (SELECT COUNT(*) FROM energy_meter_correction c WHERE c.reading_id=r.id AND c.status='REQUESTED') AS pending_corrections
     FROM energy_meter_reading r WHERE r.meter_id=? ORDER BY r.read_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [meterId, perPage, (page - 1) * perPage]);
  const attachments = await readingAttachments(data.map((item) => Number(item.id)));
  ok(res, { meter, readings: data.map((item) => ({ ...item, attachments: attachments.get(Number(item.id)) ?? [] })) }, 'OK', {
    page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
}));

energyOperationsRouter.post('/energy/meters/:meterId/readings', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const meterId = positiveId(req.params.meterId, 'Meter ID');
  const user = (req as AuthRequest).user!;
  const result = await transaction(async (connection) => {
    const meter = await meterForUpdate(connection, meterId);
    const readAt = dateTime(req.body.read_at, 'Waktu reading');
    if (await connectionOne(connection, 'SELECT id FROM energy_meter_reading WHERE meter_id=? AND read_at=? LIMIT 1', [meterId, readAt])) {
      throw new HttpError(409, 'Reading pada waktu tersebut sudah tersedia.');
    }
    const latest = await connectionOne<{ current_reading: number | string }>(connection,
      `SELECT current_reading FROM energy_meter_reading
       WHERE meter_id=? AND status <> 'CORRECTED' ORDER BY read_at DESC, id DESC LIMIT 1`, [meterId]);
    const previous = numeric(req.body.previous_reading, 'Angka sebelumnya', false) ?? Number(latest?.current_reading ?? 0);
    const current = numeric(req.body.current_reading, 'Angka saat ini')!;
    const multiplier = numeric(req.body.multiplier, 'Multiplier', false) ?? Number(meter.multiplier ?? 1);
    if (multiplier <= 0) throw new HttpError(422, 'Multiplier harus lebih besar dari nol.');
    const calculation = calculateConsumption(previous, current, multiplier, meter.rollover_value === null ? null : Number(meter.rollover_value));
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_meter_reading
       (meter_id, reading_period, read_at, previous_reading, current_reading, multiplier,
        consumption, reading_type, is_rollover, status, notes, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,NOW(),NOW())`,
      [meterId, readingPeriod(req.body.reading_period, readAt), readAt, previous, current, multiplier,
        calculation.consumption, 'MEASURED', calculation.isRollover, text(req.body.notes, 5000), user.fullname, user.fullname] as never);
    return { id: inserted.insertId, consumption: calculation.consumption, unit: meter.unit };
  });
  created(res, result, 'Draft meter reading dibuat.');
}));

energyOperationsRouter.patch('/energy/meter-readings/:readingId', canManage, asyncHandler(async (req, res) => {
  await ensureFoundation();
  const readingId = positiveId(req.params.readingId, 'Reading ID');
  const user = (req as AuthRequest).user!;
  const result = await transaction(async (connection) => {
    const reading = await connectionOne<{ meter_id: number; status: string; previous_reading: number | string; read_at: string }>(connection,
      'SELECT meter_id, status, previous_reading, read_at FROM energy_meter_reading WHERE id=? LIMIT 1 FOR UPDATE', [readingId]);
    if (!reading) throw new HttpError(404, 'Meter reading tidak ditemukan.');
    if (reading.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft reading yang dapat diubah.');
    const meter = await meterForUpdate(connection, reading.meter_id);
    const readAt = req.body.read_at ? dateTime(req.body.read_at, 'Waktu reading') : String(reading.read_at).replace('T', ' ').slice(0, 19);
    const previous = numeric(req.body.previous_reading, 'Angka sebelumnya', false) ?? Number(reading.previous_reading);
    const current = numeric(req.body.current_reading, 'Angka saat ini')!;
    const multiplier = numeric(req.body.multiplier, 'Multiplier', false) ?? Number(meter.multiplier ?? 1);
    const calculation = calculateConsumption(previous, current, multiplier, meter.rollover_value === null ? null : Number(meter.rollover_value));
    await connection.execute(
      `UPDATE energy_meter_reading SET reading_period=?, read_at=?, previous_reading=?, current_reading=?,
       multiplier=?, consumption=?, is_rollover=?, notes=?, updated_by=?, updated_at=NOW() WHERE id=?`,
      [readingPeriod(req.body.reading_period, readAt), readAt, previous, current, multiplier, calculation.consumption,
        calculation.isRollover, text(req.body.notes, 5000), user.fullname, readingId] as never);
    return { id: readingId, consumption: calculation.consumption };
  });
  ok(res, result, 'Draft meter reading diperbarui.');
}));

energyOperationsRouter.post('/energy/meter-readings/:readingId/attachments', canManage, photoUpload.array('files', 5), asyncHandler(async (req, res) => {
  await ensureFoundation();
  const readingId = positiveId(req.params.readingId, 'Reading ID');
  const reading = await one<{ status: string }>('SELECT status FROM energy_meter_reading WHERE id=? LIMIT 1', [readingId]);
  if (!reading) throw new HttpError(404, 'Meter reading tidak ditemukan.');
  if (reading.status !== 'DRAFT') throw new HttpError(409, 'Lampiran hanya dapat ditambahkan saat reading masih draft.');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(422, 'Pilih minimal satu foto meter.');
  const user = (req as AuthRequest).user!;
  const uploaded: Record<string, unknown>[] = [];
  for (const file of files) {
    const key = await saveUploadedFile(file.buffer, `energy/meter-readings/${readingId}`, file.originalname, file.mimetype);
    const result = await transaction(async (connection) => {
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO energy_meter_reading_attachment
         (reading_id, attachment_type, file_name, object_key, mime_type, file_size, uploaded_by, created_at)
         VALUES (?,'METER_PHOTO',?,?,?,?,?,NOW())`,
        [readingId, file.originalname, key, file.mimetype, file.size, user.fullname] as never);
      return inserted.insertId;
    });
    uploaded.push({ id: result, file_name: file.originalname, object_key: key, url: `/uploads/${key}` });
  }
  created(res, uploaded, 'Foto meter diunggah.');
}));

energyOperationsRouter.delete('/energy/meter-reading-attachments/:attachmentId', canManage, asyncHandler(async (req, res) => {
  const attachmentId = positiveId(req.params.attachmentId, 'Attachment ID');
  const item = await one<{ object_key: string; status: string }>(
    `SELECT a.object_key, r.status FROM energy_meter_reading_attachment a
     JOIN energy_meter_reading r ON r.id=a.reading_id WHERE a.id=? LIMIT 1`, [attachmentId]);
  if (!item) throw new HttpError(404, 'Lampiran tidak ditemukan.');
  if (item.status !== 'DRAFT') throw new HttpError(409, 'Lampiran reading yang sudah disubmit tidak dapat dihapus.');
  await transaction(async (connection) => { await connection.execute('DELETE FROM energy_meter_reading_attachment WHERE id=?', [attachmentId]); });
  await deleteObjectKey(item.object_key);
  ok(res, null, 'Lampiran dihapus.');
}));

async function moveReadingStatus(readingId: number, expected: string, next: string, actorField: string, actor: string): Promise<void> {
  await transaction(async (connection) => {
    const row = await connectionOne<{ status: string }>(connection, 'SELECT status FROM energy_meter_reading WHERE id=? LIMIT 1 FOR UPDATE', [readingId]);
    if (!row) throw new HttpError(404, 'Meter reading tidak ditemukan.');
    if (row.status !== expected) throw new HttpError(409, `Status reading harus ${expected}.`);
    if (next === 'SUBMITTED') {
      const attachment = await connectionOne(connection, 'SELECT id FROM energy_meter_reading_attachment WHERE reading_id=? LIMIT 1', [readingId]);
      if (!attachment) throw new HttpError(422, 'Unggah minimal satu foto meter sebelum submit.');
    }
    await connection.execute(
      `UPDATE energy_meter_reading SET status=?, ${actorField}=?, ${actorField.replace('_by', '_at')}=NOW(), updated_by=?, updated_at=NOW() WHERE id=?`,
      [next, actor, actor, readingId] as never);
  });
}

energyOperationsRouter.post('/energy/meter-readings/:readingId/submit', canManage, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.readingId, 'Reading ID');
  await moveReadingStatus(id, 'DRAFT', 'SUBMITTED', 'submitted_by', String((req as AuthRequest).user!.fullname));
  ok(res, { id, status: 'SUBMITTED' }, 'Meter reading disubmit.');
}));

energyOperationsRouter.post('/energy/meter-readings/:readingId/validate', canApprove, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.readingId, 'Reading ID');
  await moveReadingStatus(id, 'SUBMITTED', 'VALIDATED', 'validated_by', String((req as AuthRequest).user!.fullname));
  ok(res, { id, status: 'VALIDATED' }, 'Meter reading divalidasi.');
}));

energyOperationsRouter.post('/energy/meter-readings/:readingId/lock', canApprove, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.readingId, 'Reading ID');
  await moveReadingStatus(id, 'VALIDATED', 'LOCKED', 'locked_by', String((req as AuthRequest).user!.fullname));
  ok(res, { id, status: 'LOCKED' }, 'Meter reading dikunci.');
}));

energyOperationsRouter.get('/energy/meter-readings/:readingId/corrections', canRead, asyncHandler(async (req, res) => {
  const id = positiveId(req.params.readingId, 'Reading ID');
  ok(res, await rows('SELECT * FROM energy_meter_correction WHERE reading_id=? ORDER BY id DESC', [id]));
}));

energyOperationsRouter.post('/energy/meter-readings/:readingId/corrections', canManage, asyncHandler(async (req, res) => {
  const readingId = positiveId(req.params.readingId, 'Reading ID');
  const reason = text(req.body.reason, 5000);
  if (!reason) throw new HttpError(422, 'Alasan koreksi wajib diisi.');
  const previous = numeric(req.body.previous_reading, 'Angka sebelumnya', false);
  const current = numeric(req.body.current_reading, 'Angka saat ini', false);
  const multiplier = numeric(req.body.multiplier, 'Multiplier', false);
  if (previous === null && current === null && multiplier === null) throw new HttpError(422, 'Isi minimal satu nilai koreksi.');
  const user = (req as AuthRequest).user!;
  const result = await transaction(async (connection) => {
    const reading = await connectionOne<{ status: string }>(connection, 'SELECT status FROM energy_meter_reading WHERE id=? LIMIT 1 FOR UPDATE', [readingId]);
    if (!reading) throw new HttpError(404, 'Meter reading tidak ditemukan.');
    if (reading.status !== 'LOCKED') throw new HttpError(409, 'Koreksi hanya dapat diajukan untuk reading yang sudah dikunci.');
    if (await connectionOne(connection, "SELECT id FROM energy_meter_correction WHERE reading_id=? AND status='REQUESTED' LIMIT 1", [readingId])) {
      throw new HttpError(409, 'Masih ada permintaan koreksi yang menunggu review.');
    }
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_meter_correction
       (reading_id, requested_previous_reading, requested_current_reading, requested_multiplier,
        reason, status, requested_by, requested_at) VALUES (?,?,?,?,?,'REQUESTED',?,NOW())`,
      [readingId, previous, current, multiplier, reason, user.fullname] as never);
    return inserted.insertId;
  });
  created(res, { id: result, reading_id: readingId }, 'Permintaan koreksi dibuat.');
}));

energyOperationsRouter.post('/energy/meter-corrections/:correctionId/review', canApprove, asyncHandler(async (req, res) => {
  const correctionId = positiveId(req.params.correctionId, 'Correction ID');
  const action = String(req.body.action ?? '').trim().toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(action)) throw new HttpError(422, 'Action harus APPROVE atau REJECT.');
  const reviewer = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const correction = await connectionOne<{
      reading_id: number; status: string; requested_previous_reading: number | string | null;
      requested_current_reading: number | string | null; requested_multiplier: number | string | null;
    }>(connection, 'SELECT * FROM energy_meter_correction WHERE id=? LIMIT 1 FOR UPDATE', [correctionId]);
    if (!correction) throw new HttpError(404, 'Permintaan koreksi tidak ditemukan.');
    if (correction.status !== 'REQUESTED') throw new HttpError(409, 'Permintaan koreksi sudah direview.');
    if (action === 'REJECT') {
      await connection.execute(
        `UPDATE energy_meter_correction SET status='REJECTED', reviewed_by=?, reviewed_at=NOW(), review_note=? WHERE id=?`,
        [reviewer, text(req.body.review_note, 5000), correctionId] as never);
      return;
    }
    const reading = await connectionOne<{
      id: number; meter_id: number; status: string; previous_reading: number | string;
      current_reading: number | string; multiplier: number | string;
    }>(connection, 'SELECT * FROM energy_meter_reading WHERE id=? LIMIT 1 FOR UPDATE', [correction.reading_id]);
    if (!reading || reading.status !== 'LOCKED') throw new HttpError(409, 'Reading sumber tidak tersedia atau tidak lagi terkunci.');
    const meter = await meterForUpdate(connection, reading.meter_id);
    const previous = Number(correction.requested_previous_reading ?? reading.previous_reading);
    const current = Number(correction.requested_current_reading ?? reading.current_reading);
    const multiplier = Number(correction.requested_multiplier ?? reading.multiplier);
    const calculation = calculateConsumption(previous, current, multiplier, meter.rollover_value === null ? null : Number(meter.rollover_value));
    const auditNote = `Nilai awal: previous=${reading.previous_reading}, current=${reading.current_reading}, multiplier=${reading.multiplier}`;
    const reviewerNote = text(req.body.review_note, 5000);
    await connection.execute(
      `UPDATE energy_meter_reading SET previous_reading=?, current_reading=?, multiplier=?, consumption=?,
       is_rollover=?, updated_by=?, updated_at=NOW() WHERE id=?`,
      [previous, current, multiplier, calculation.consumption, calculation.isRollover, reviewer, reading.id] as never);
    await connection.execute(
      `UPDATE energy_meter_correction SET status='APPROVED', reviewed_by=?, reviewed_at=NOW(),
       review_note=?, replacement_reading_id=? WHERE id=?`,
      [reviewer, [auditNote, reviewerNote].filter(Boolean).join(' | '), reading.id, correctionId] as never);
  });
  ok(res, { id: correctionId, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' }, `Koreksi ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`);
}));

energyOperationsRouter.get('/energy/gensets/:gensetId/operations', canRead, asyncHandler(async (req, res) => {
  await ensureFoundation();
  await ensureGensetFuelIntegration();
  const gensetId = positiveId(req.params.gensetId, 'Genset ID');
  const profile = await one(
    `SELECT g.*, p.asset_id, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_genset_profile g JOIN energy_asset_profile p ON p.id=g.energy_profile_id
     JOIN asset a ON a.AssetID=p.asset_id WHERE g.id=? LIMIT 1`, [gensetId]);
  if (!profile) throw new HttpError(404, 'Profil genset tidak ditemukan.');
  const operations = await rows(
    `SELECT o.*, u.fuel_tank_id, u.fuel_movement_id,
      t.tank_number AS fuel_tank_number, ta.AssetCode AS fuel_tank_asset_code,
      ta.AssetName AS fuel_tank_asset_name, m.status AS fuel_movement_status
     FROM energy_genset_operation o
     LEFT JOIN energy_genset_fuel_usage u ON u.genset_operation_id=o.id
     LEFT JOIN energy_fuel_tank t ON t.id=u.fuel_tank_id
     LEFT JOIN energy_asset_profile tp ON tp.id=t.energy_profile_id
     LEFT JOIN asset ta ON ta.AssetID=tp.asset_id
     LEFT JOIN energy_fuel_movement m ON m.id=u.fuel_movement_id
     WHERE o.genset_profile_id=? ORDER BY o.started_at DESC, o.id DESC`, [gensetId]);
  ok(res, { profile, operations });
}));

function operationHours(startedAt: string, endedAt: string | null, hourStart: number | null, hourEnd: number | null): number | null {
  if (hourStart !== null && hourEnd !== null) {
    if (hourEnd < hourStart) throw new HttpError(422, 'Hour meter akhir tidak boleh lebih kecil dari hour meter awal.');
    return hourEnd - hourStart;
  }
  if (!endedAt) return null;
  const start = new Date(startedAt.replace(' ', 'T')).getTime();
  const end = new Date(endedAt.replace(' ', 'T')).getTime();
  if (end < start) throw new HttpError(422, 'Waktu selesai tidak boleh lebih awal dari waktu mulai.');
  return Math.round(((end - start) / 3_600_000) * 1000) / 1000;
}

async function saveGensetOperation(connection: PoolConnection, gensetId: number, body: Record<string, unknown>, user: string, existingId?: number): Promise<number> {
  const genset = await connectionOne<{ id: number; fuel_type: string }>(connection,
    'SELECT id, fuel_type FROM energy_genset_profile WHERE id=? LIMIT 1 FOR UPDATE', [gensetId]);
  if (!genset) throw new HttpError(404, 'Profil genset tidak ditemukan.');
  const startedAt = dateTime(body.started_at, 'Waktu mulai');
  const endedAt = body.ended_at ? dateTime(body.ended_at, 'Waktu selesai') : null;
  const hourStart = numeric(body.hour_meter_start, 'Hour meter awal', false);
  const hourEnd = numeric(body.hour_meter_end, 'Hour meter akhir', false);
  const hours = operationHours(startedAt, endedAt, hourStart, hourEnd);
  const generated = numeric(body.generated_kwh, 'Energi dihasilkan', false);
  const load = numeric(body.average_load_percent, 'Rata-rata beban', false);
  if (load !== null && load > 100) throw new HttpError(422, 'Rata-rata beban maksimal 100%.');
  const fuel = numeric(body.fuel_consumed_liter, 'Bahan bakar terpakai', false);
  const fuelTankId = body.fuel_tank_id ? positiveId(body.fuel_tank_id, 'Fuel Tank sumber') : null;
  if (fuelTankId) {
    const tank = await connectionOne<{ status: string; fuel_type: string }>(connection,
      'SELECT status, fuel_type FROM energy_fuel_tank WHERE id=? LIMIT 1 FOR UPDATE', [fuelTankId]);
    if (!tank) throw new HttpError(404, 'Fuel Tank sumber tidak ditemukan.');
    if (tank.status !== 'ACTIVE') throw new HttpError(409, 'Fuel Tank sumber tidak aktif.');
    if (tank.fuel_type.trim().toUpperCase() !== genset.fuel_type.trim().toUpperCase()) {
      throw new HttpError(422, `Jenis bahan bakar Fuel Tank (${tank.fuel_type}) tidak sesuai dengan genset (${genset.fuel_type}).`);
    }
  }
  const saveFuelSource = async (operationId: number): Promise<void> => {
    if (!fuelTankId) {
      await connection.execute('DELETE FROM energy_genset_fuel_usage WHERE genset_operation_id=? AND fuel_movement_id IS NULL', [operationId]);
      return;
    }
    await connection.execute(
      `INSERT INTO energy_genset_fuel_usage
       (genset_operation_id, fuel_tank_id, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE fuel_tank_id=VALUES(fuel_tank_id), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [operationId, fuelTankId, user, user] as never);
  };
  if (existingId) {
    await connection.execute(
      `UPDATE energy_genset_operation SET started_at=?, ended_at=?, hour_meter_start=?, hour_meter_end=?,
       operating_hours=?, generated_kwh=?, average_load_percent=?, fuel_consumed_liter=?, notes=?,
       operator_name=?, updated_by=?, updated_at=NOW() WHERE id=?`,
      [startedAt, endedAt, hourStart, hourEnd, hours, generated, load, fuel, text(body.notes, 5000),
        text(body.operator_name, 120) ?? user, user, existingId] as never);
    await saveFuelSource(existingId);
    return existingId;
  }
  const [inserted] = await connection.execute<ResultSetHeader>(
    `INSERT INTO energy_genset_operation
     (genset_profile_id, started_at, ended_at, hour_meter_start, hour_meter_end, operating_hours,
      generated_kwh, average_load_percent, fuel_consumed_liter, status, notes, operator_name,
      created_by, updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,NOW(),NOW())`,
    [gensetId, startedAt, endedAt, hourStart, hourEnd, hours, generated, load, fuel,
      text(body.notes, 5000), text(body.operator_name, 120) ?? user, user, user] as never);
  await saveFuelSource(inserted.insertId);
  return inserted.insertId;
}

energyOperationsRouter.post('/energy/gensets/:gensetId/operations', canManage, asyncHandler(async (req, res) => {
  await ensureGensetFuelIntegration();
  const gensetId = positiveId(req.params.gensetId, 'Genset ID');
  const id = await transaction((connection) => saveGensetOperation(connection, gensetId, req.body, String((req as AuthRequest).user!.fullname)));
  created(res, { id }, 'Draft operasi genset dibuat.');
}));

energyOperationsRouter.patch('/energy/genset-operations/:operationId', canManage, asyncHandler(async (req, res) => {
  await ensureGensetFuelIntegration();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const id = await transaction(async (connection) => {
    const operation = await connectionOne<{ genset_profile_id: number; status: string }>(connection,
      'SELECT genset_profile_id, status FROM energy_genset_operation WHERE id=? LIMIT 1 FOR UPDATE', [operationId]);
    if (!operation) throw new HttpError(404, 'Operasi genset tidak ditemukan.');
    if (operation.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft operasi yang dapat diubah.');
    return saveGensetOperation(connection, operation.genset_profile_id, req.body, String((req as AuthRequest).user!.fullname), operationId);
  });
  ok(res, { id }, 'Draft operasi genset diperbarui.');
}));

energyOperationsRouter.post('/energy/genset-operations/:operationId/submit', canManage, asyncHandler(async (req, res) => {
  await ensureGensetFuelIntegration();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const user = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{ status: string; ended_at: string | null; hour_meter_end: number | null; fuel_consumed_liter: number | string | null; fuel_tank_id: number | null }>(connection,
      `SELECT o.status, o.ended_at, o.hour_meter_end, o.fuel_consumed_liter, u.fuel_tank_id
       FROM energy_genset_operation o
       LEFT JOIN energy_genset_fuel_usage u ON u.genset_operation_id=o.id
       WHERE o.id=? LIMIT 1 FOR UPDATE`, [operationId]);
    if (!item) throw new HttpError(404, 'Operasi genset tidak ditemukan.');
    if (item.status !== 'DRAFT') throw new HttpError(409, 'Operasi genset harus berstatus DRAFT.');
    if (!item.ended_at) throw new HttpError(422, 'Isi waktu selesai sebelum submit operasi genset.');
    if (Number(item.fuel_consumed_liter ?? 0) > 0 && !item.fuel_tank_id) {
      throw new HttpError(422, 'Pilih Fuel Tank sumber untuk konsumsi bahan bakar genset.');
    }
    await connection.execute("UPDATE energy_genset_operation SET status='SUBMITTED', updated_by=?, updated_at=NOW() WHERE id=?", [user, operationId]);
  });
  ok(res, { id: operationId, status: 'SUBMITTED' }, 'Operasi genset disubmit.');
}));

energyOperationsRouter.post('/energy/genset-operations/:operationId/lock', canApprove, asyncHandler(async (req, res) => {
  await ensureGensetFuelIntegration();
  const operationId = positiveId(req.params.operationId, 'Operation ID');
  const user = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{
      status: string; genset_profile_id: number; hour_meter_end: number | string | null;
      fuel_consumed_liter: number | string | null; started_at: string; ended_at: string | null;
      fuel_tank_id: number | null; fuel_movement_id: number | null; genset_asset_id: number; genset_fuel_type: string;
    }>(connection,
      `SELECT o.status, o.genset_profile_id, o.hour_meter_end, o.fuel_consumed_liter,
        o.started_at, o.ended_at, u.fuel_tank_id, u.fuel_movement_id,
        p.asset_id AS genset_asset_id, g.fuel_type AS genset_fuel_type
       FROM energy_genset_operation o
       JOIN energy_genset_profile g ON g.id=o.genset_profile_id
       JOIN energy_asset_profile p ON p.id=g.energy_profile_id
       LEFT JOIN energy_genset_fuel_usage u ON u.genset_operation_id=o.id
       WHERE o.id=? LIMIT 1 FOR UPDATE`, [operationId]);
    if (!item) throw new HttpError(404, 'Operasi genset tidak ditemukan.');
    if (item.status !== 'SUBMITTED') throw new HttpError(409, 'Operasi genset harus berstatus SUBMITTED.');
    const fuel = Number(item.fuel_consumed_liter ?? 0);
    if (fuel > 0) {
      if (!item.fuel_tank_id) throw new HttpError(422, 'Fuel Tank sumber belum dipilih. Kembalikan operasi ke draft dan lengkapi sumber fuel.');
      if (item.fuel_movement_id) throw new HttpError(409, 'Pemakaian fuel operasi genset ini sudah tercatat.');
      const tank = await connectionOne<{
        id: number; status: string; fuel_type: string; reference_balance_liter: number | string | null;
      }>(connection, 'SELECT id, status, fuel_type, reference_balance_liter FROM energy_fuel_tank WHERE id=? LIMIT 1 FOR UPDATE', [item.fuel_tank_id]);
      if (!tank) throw new HttpError(404, 'Fuel Tank sumber tidak ditemukan.');
      if (tank.status !== 'ACTIVE') throw new HttpError(409, 'Fuel Tank sumber tidak aktif.');
      if (tank.fuel_type.trim().toUpperCase() !== item.genset_fuel_type.trim().toUpperCase()) {
        throw new HttpError(422, 'Jenis bahan bakar Fuel Tank tidak sesuai dengan genset.');
      }
      const balanceRow = await connectionOne<{ balance: number | string }>(connection,
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
         FROM energy_fuel_tank t WHERE t.id=? LIMIT 1`, [tank.id]);
      const balance = Number(balanceRow?.balance ?? 0);
      if (balance < fuel) throw new HttpError(409, `Saldo Fuel Tank tidak cukup. Saldo ${balance.toLocaleString('id-ID')} liter, kebutuhan ${fuel.toLocaleString('id-ID')} liter.`);
      const [movement] = await connection.execute<ResultSetHeader>(
        `INSERT INTO energy_fuel_movement
         (fuel_tank_id, movement_type, movement_at, quantity_liter, destination_type,
          destination_asset_id, reference_number, status, notes, created_by, approved_by,
          approved_at, created_at, updated_at)
         VALUES (?,'CONSUMPTION',?,?,'GENSET',?,?,'APPROVED',?,?,?,NOW(),NOW(),NOW())`,
        [tank.id, item.ended_at ?? item.started_at, fuel, item.genset_asset_id,
          `GENSET-OP-${operationId}`, `Otomatis dari log operasi genset #${operationId}`, user, user] as never);
      await connection.execute(
        'UPDATE energy_genset_fuel_usage SET fuel_movement_id=?, updated_by=?, updated_at=NOW() WHERE genset_operation_id=?',
        [movement.insertId, user, operationId]);
    }
    await connection.execute("UPDATE energy_genset_operation SET status='LOCKED', updated_by=?, updated_at=NOW() WHERE id=?", [user, operationId]);
    if (item.hour_meter_end !== null) {
      await connection.execute(
        `UPDATE energy_genset_profile SET current_hour_meter=GREATEST(COALESCE(current_hour_meter,0),?), updated_by=?, updated_at=NOW() WHERE id=?`,
        [item.hour_meter_end, user, item.genset_profile_id] as never);
    }
  });
  ok(res, { id: operationId, status: 'LOCKED' }, 'Operasi genset dikunci dan pemakaian fuel telah masuk ke kartu stok Fuel Tank.');
}));
