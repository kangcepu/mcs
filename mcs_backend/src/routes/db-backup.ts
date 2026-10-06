import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { asyncHandler, HttpError, legacyOk } from '../http.js';
import { getBackupLog, getBackupSettings, getActiveBackup, listBackupLogs, putBackupSettings, startBackup } from '../lib/db-backup.js';
import { getObjectStream, getStorageConfig, isStorageWritable } from '../lib/storage.js';
import type { AuthRequest } from '../types.js';

export const dbBackupRouter = Router();

const canManage = requirePermission('user_management');
dbBackupRouter.use('/db-backup', authenticate, canManage);

dbBackupRouter.get('/db-backup/settings', asyncHandler(async (_req, res) => {
  const [settings, storage, storageReady, active] = await Promise.all([
    getBackupSettings(),
    getStorageConfig(),
    isStorageWritable(),
    getActiveBackup(),
  ]);
  legacyOk(res, {
    ...settings,
    storage_enabled: storage.enabled,
    storage_ready: storageReady,
    storage_bucket: storage.bucket,
    active_backup_id: active ? Number(active.id) : null,
  }, 'Pengaturan backup database');
}));

dbBackupRouter.put('/db-backup/settings', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const time = String(b.time ?? '').trim();
  if (!time) throw new HttpError(422, 'Jam backup wajib diisi');
  try {
    legacyOk(res, await putBackupSettings({
      auto_enabled: Boolean(b.auto_enabled),
      frequency: String(b.frequency ?? 'daily'),
      weekday: Number(b.weekday ?? 0),
      monthday: Number(b.monthday ?? 1),
      time,
      backup_type: String(b.backup_type ?? 'full'),
      retention: Number(b.retention ?? 7),
    }), 'Pengaturan backup disimpan');
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : 'Pengaturan tidak valid');
  }
}));

dbBackupRouter.post('/db-backup/run', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const actor = String(user.fullname ?? user.username ?? 'unknown');
  try {
    const logId = await startBackup('manual', actor);
    res.status(202).json({ status: true, message: 'Backup dimulai', data: { log_id: logId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memulai backup';
    throw new HttpError(message.includes('sedang berjalan') ? 409 : 422, message);
  }
}));

dbBackupRouter.get('/db-backup/logs', asyncHandler(async (req, res) => {
  const perPage = Math.min(Math.max(Number(req.query.per_page ?? 10) || 10, 1), 100);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const { items, total } = await listBackupLogs(page, perPage);
  legacyOk(res, { items, total, page, per_page: perPage, last_page: Math.max(1, Math.ceil(total / perPage)) }, 'Log backup database');
}));

dbBackupRouter.get('/db-backup/download/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, 'ID backup tidak valid');
  const log = await getBackupLog(id);
  if (!log || log.status !== 'success' || !log.object_key || Number(log.pruned) === 1) {
    throw new HttpError(404, 'File backup tidak tersedia');
  }
  const object = await getObjectStream(String(log.object_key));
  if (!object) throw new HttpError(502, 'Gagal mengambil file dari MinIO');

  const filename = String(log.object_key).split('/').pop() ?? 'backup.sql.gz';
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (object.contentLength !== undefined) res.setHeader('Content-Length', String(object.contentLength));
  object.stream.on('error', () => res.destroy());
  object.stream.pipe(res);
}));
