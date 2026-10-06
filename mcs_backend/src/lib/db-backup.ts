import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { execute, one, rows, withNamedLock } from '../db.js';
import { getSetting, putSetting } from './app-settings.js';
import { nowInJakarta } from './daily-control.js';
import { deleteObjectKey, getStorageConfig, isStorageWritable, uploadLocalFile } from './storage.js';

const BACKUP_PREFIX = 'backups/database';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export const BACKUP_TYPES = ['full', 'schema', 'data'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type BackupType = (typeof BACKUP_TYPES)[number];
const DEFAULT_RETENTION = 7;

let logTableReady = false;
async function ensureBackupLogTable(): Promise<void> {
  if (logTableReady) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_db_backup_log (
    id INT NOT NULL AUTO_INCREMENT,
    trigger_type VARCHAR(10) NOT NULL,
    trigger_date VARCHAR(10) NOT NULL,
    status VARCHAR(12) NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    object_key VARCHAR(255) NULL,
    size_bytes BIGINT NULL,
    message TEXT NULL,
    actor VARCHAR(100) NULL,
    pruned TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_backup_trigger_date (trigger_type, trigger_date, status),
    KEY idx_backup_status (status, pruned, started_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await execute("ALTER TABLE tb_db_backup_log ADD COLUMN IF NOT EXISTS backup_type VARCHAR(10) NOT NULL DEFAULT 'full'");
  logTableReady = true;
}

export interface BackupSettings {
  auto_enabled: boolean;
  frequency: Frequency;
  weekday: number;
  monthday: number;
  time: string;
  backup_type: BackupType;
  retention: number;
  updated_at: string;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const [enabled, frequency, weekday, monthday, time, type, retention, updatedAt] = await Promise.all([
    getSetting('db_backup_auto', '0'),
    getSetting('db_backup_frequency', 'daily'),
    getSetting('db_backup_weekday', '0'),
    getSetting('db_backup_monthday', '1'),
    getSetting('db_backup_time', '01:00'),
    getSetting('db_backup_type', 'full'),
    getSetting('db_backup_retention', String(DEFAULT_RETENTION)),
    getSetting('db_backup_updated_at', ''),
  ]);
  return {
    auto_enabled: enabled === '1',
    frequency: (FREQUENCIES as readonly string[]).includes(frequency) ? (frequency as Frequency) : 'daily',
    weekday: clampInt(weekday, 0, 6, 0),
    monthday: clampInt(monthday, 1, 28, 1),
    time: TIME_PATTERN.test(time) ? time : '01:00',
    backup_type: (BACKUP_TYPES as readonly string[]).includes(type) ? (type as BackupType) : 'full',
    retention: clampInt(retention, 1, 365, DEFAULT_RETENTION),
    updated_at: updatedAt,
  };
}

export async function putBackupSettings(input: {
  auto_enabled: boolean; frequency: string; weekday: number; monthday: number; time: string; backup_type: string; retention: number;
}): Promise<BackupSettings> {
  if (!TIME_PATTERN.test(input.time)) throw new Error('Format jam harus HH:mm');
  if (!(FREQUENCIES as readonly string[]).includes(input.frequency)) throw new Error('Perulangan tidak valid');
  if (!(BACKUP_TYPES as readonly string[]).includes(input.backup_type)) throw new Error('Jenis backup tidak valid');
  const weekday = clampInt(input.weekday, 0, 6, -1);
  const monthday = clampInt(input.monthday, 1, 28, -1);
  const retention = clampInt(input.retention, 1, 365, -1);
  if (weekday < 0 || monthday < 0 || retention < 0) throw new Error('Nilai hari atau jumlah backup tidak valid');

  await Promise.all([
    putSetting('db_backup_auto', input.auto_enabled ? '1' : '0'),
    putSetting('db_backup_frequency', input.frequency),
    putSetting('db_backup_weekday', String(weekday)),
    putSetting('db_backup_monthday', String(monthday)),
    putSetting('db_backup_time', input.time),
    putSetting('db_backup_type', input.backup_type),
    putSetting('db_backup_retention', String(retention)),
    putSetting('db_backup_updated_at', new Date().toISOString()),
  ]);
  return getBackupSettings();
}

function backupTimestamp(): string {
  const now = nowInJakarta();
  return `${now.date.replace(/-/g, '')}_${now.time.replace(/:/g, '')}`;
}

async function markRunningAsStale(): Promise<void> {
  await execute(
    "UPDATE tb_db_backup_log SET status='failed', finished_at=NOW(), message='Dihentikan: proses tidak selesai (timeout/restart)' WHERE status='running' AND started_at < NOW() - INTERVAL 2 HOUR",
  );
}

export async function getActiveBackup(): Promise<Record<string, unknown> | null> {
  await ensureBackupLogTable();
  await markRunningAsStale();
  return one<Record<string, unknown>>("SELECT * FROM tb_db_backup_log WHERE status='running' ORDER BY id DESC LIMIT 1");
}

function dumpArgs(type: BackupType): string[] {
  const common = [
    '--host', config.db.host,
    '--port', String(config.db.port),
    '--user', config.db.user,
    '--single-transaction',
    '--quick',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
  ];
  if (type === 'full') return [...common, '--routines', '--triggers', '--events', config.db.database];
  if (type === 'schema') return [...common, '--no-data', '--routines', '--triggers', '--events', config.db.database];
  return [...common, '--no-create-info', config.db.database];
}

async function dumpToGzip(outputPath: string, type: BackupType): Promise<void> {
  const child = spawn(process.env.DB_BACKUP_MYSQLDUMP_BIN || 'mysqldump', dumpArgs(type), {
    env: { ...process.env, MYSQL_PWD: config.db.password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });

  const exit = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysqldump exit code ${code}: ${stderr.trim() || 'tanpa pesan'}`));
    });
  });

  const write = pipeline(child.stdout, zlib.createGzip({ level: 6 }), fs.createWriteStream(outputPath));
  await Promise.all([exit, write]);
}

async function pruneOldBackups(retention: number): Promise<number> {
  const stale = await rows<{ id: number; object_key: string }>(
    "SELECT id, object_key FROM tb_db_backup_log WHERE status='success' AND pruned=0 AND object_key IS NOT NULL ORDER BY started_at DESC, id DESC LIMIT 100000",
  );
  const toRemove = stale.slice(retention);
  for (const row of toRemove) {
    await deleteObjectKey(row.object_key);
    await execute('UPDATE tb_db_backup_log SET pruned=1 WHERE id=?', [row.id]);
  }
  return toRemove.length;
}

async function executeBackup(logId: number, objectKey: string, type: BackupType): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `mcs-backup-${logId}.sql.gz`);
  try {
    if (!(await isStorageWritable())) throw new Error('Storage MinIO belum aktif atau belum terkonfigurasi');
    await dumpToGzip(tmpFile, type);
    const size = fs.statSync(tmpFile).size;
    const uploaded = await uploadLocalFile(objectKey, tmpFile);
    if (!uploaded) throw new Error('Upload ke MinIO gagal');

    await execute(
      "UPDATE tb_db_backup_log SET status='success', finished_at=NOW(), object_key=?, size_bytes=?, message='Backup berhasil' WHERE id=?",
      [objectKey, size, logId],
    );
    const settings = await getBackupSettings();
    const pruned = await pruneOldBackups(settings.retention);
    if (pruned > 0) {
      await execute('UPDATE tb_db_backup_log SET message=CONCAT(message, ?) WHERE id=?', [` · ${pruned} backup lama dirotasi`, logId]);
    }
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    await execute("UPDATE tb_db_backup_log SET status='failed', finished_at=NOW(), message=? WHERE id=?", [message, logId]);
    console.error('Database backup failed:', message);
  } finally {
    fs.rm(tmpFile, { force: true }, () => {});
  }
}

/**
 * Mulai satu backup. Untuk trigger 'auto', kalau hari ini sudah ada backup
 * auto yang berhasil, kembalikan null (tidak dobel). Dicek di dalam named lock
 * supaya dua instance backend yang jalan bersamaan tetap aman.
 */
export async function startBackup(trigger: 'auto' | 'manual', actor: string, typeOverride?: BackupType): Promise<number | null> {
  await ensureBackupLogTable();
  return withNamedLock('mcs_db_backup', async () => {
    await markRunningAsStale();
    const today = nowInJakarta().date;
    const running = await one<{ id: number }>("SELECT id FROM tb_db_backup_log WHERE status='running' LIMIT 1");
    if (running) throw new Error('Backup lain sedang berjalan');
    if (trigger === 'auto') {
      const doneToday = await one<{ id: number }>(
        "SELECT id FROM tb_db_backup_log WHERE trigger_type='auto' AND trigger_date=? AND status='success' LIMIT 1",
        [today],
      );
      if (doneToday) return null;
    }

    const cfg = await getStorageConfig();
    if (!cfg.enabled) throw new Error('Storage MinIO belum diaktifkan di pengaturan storage');

    const settings = await getBackupSettings();
    const type = typeOverride ?? settings.backup_type;
    const objectKey = `${BACKUP_PREFIX}/${config.db.database}_${type}_${backupTimestamp()}.sql.gz`;
    const result = await execute(
      "INSERT INTO tb_db_backup_log (trigger_type, trigger_date, status, started_at, object_key, actor, backup_type) VALUES (?,?,'running',NOW(),?,?,?)",
      [trigger, today, objectKey, actor, type],
    );
    const logId = result.insertId;
    void executeBackup(logId, objectKey, type);
    return logId;
  }, 5);
}

export async function listBackupLogs(page: number, perPage: number): Promise<{ items: Record<string, unknown>[]; total: number }> {
  await ensureBackupLogTable();
  await markRunningAsStale();
  const offset = (page - 1) * perPage;
  const [items, count] = await Promise.all([
    rows<Record<string, unknown>>(
      'SELECT id, trigger_type, trigger_date, backup_type, status, started_at, finished_at, object_key, size_bytes, message, actor, pruned FROM tb_db_backup_log ORDER BY id DESC LIMIT ? OFFSET ?',
      [perPage, offset],
    ),
    one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_db_backup_log'),
  ]);
  return { items, total: Number(count?.total ?? 0) };
}

export async function getBackupLog(id: number): Promise<Record<string, unknown> | null> {
  await ensureBackupLogTable();
  return one<Record<string, unknown>>('SELECT * FROM tb_db_backup_log WHERE id=?', [id]);
}

/**
 * Dipanggil tiap menit dari cron. Jalan kalau auto-backup aktif, jam sekarang
 * (WIB) sama dengan jam yang di-set, dan jadwal perulangan (harian / hari
 * tertentu di minggu / tanggal tertentu di bulan) cocok dengan hari ini.
 */
export async function runDueAutoBackup(): Promise<void> {
  const settings = await getBackupSettings();
  if (!settings.auto_enabled) return;
  const now = nowInJakarta();
  if (now.time.slice(0, 5) !== settings.time) return;
  if (!isDueToday(settings, now.date)) return;

  try {
    await startBackup('auto', 'system (auto)');
  } catch (error) {
    await ensureBackupLogTable();
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    await execute(
      "INSERT INTO tb_db_backup_log (trigger_type, trigger_date, status, started_at, finished_at, message, actor, backup_type) VALUES ('auto',?,'failed',NOW(),NOW(),?,'system (auto)',?)",
      [now.date, message, settings.backup_type],
    );
    console.error('Auto database backup not started:', message);
  }
}

function isDueToday(settings: BackupSettings, dateStr: string): boolean {
  if (settings.frequency === 'daily') return true;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (settings.frequency === 'monthly') return d === settings.monthday;
  const weekdayMon0 = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Senin=0 ... Minggu=6
  return weekdayMon0 === settings.weekday;
}
