import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import { parseScheduleIds, runDueStockOpnameSchedules } from '../lib/stock-opname-schedule.js';
import type { AuthRequest } from '../types.js';

export const stockOpnameScheduleRouter = Router();
const canManage = requirePermission('schedule');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function ensureTables(): Promise<void> {
  if (!(await tableExists('stock_opname_schedule')) || !(await tableExists('stock_opname_schedule_assignee'))) {
    throw new HttpError(503, 'Scheduler Stock Opname belum tersedia. Jalankan migration 20261118_stock_opname_scheduler.sql.');
  }
}

const actor = (req: AuthRequest): string => String(req.user?.fullname || req.user?.username || 'SYSTEM').trim();

function input(body: any) {
  const name = String(body.schedule_name ?? '').trim();
  const recurrence = String(body.recurrence_type ?? 'MONTHLY').toUpperCase();
  const interval = Math.max(1, Math.min(365, Number(body.interval_value) || 1));
  const startDate = String(body.start_date ?? '').slice(0, 10);
  const endDate = String(body.end_date ?? '').slice(0, 10) || null;
  const companies = parseScheduleIds(body.company_ids);
  const categories = parseScheduleIds(body.category_ids);
  const locations = parseScheduleIds(body.location_ids);
  const rawAssignees: unknown[] = Array.isArray(body.assignee_user_ids) ? body.assignee_user_ids : [];
  const assignees: number[] = [...new Set(rawAssignees.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))];
  if (!name) throw new HttpError(422, 'Nama jadwal wajib diisi.');
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(recurrence)) throw new HttpError(422, 'Periode jadwal tidak valid.');
  if (!datePattern.test(startDate) || (endDate && !datePattern.test(endDate))) throw new HttpError(422, 'Tanggal jadwal tidak valid.');
  if (endDate && endDate < startDate) throw new HttpError(422, 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
  if (!companies.length || !categories.length || !locations.length) throw new HttpError(422, 'Company, kategori, dan lokasi SO wajib dipilih.');
  if (!assignees.length) throw new HttpError(422, 'Pilih minimal satu petugas Stock Opname.');
  return { name, recurrence, interval, startDate, endDate, companies, categories, locations, assignees, isBom: body.is_bom ? 1 : 0, notes: String(body.notes ?? '').trim().slice(0, 500) || null };
}

async function scheduleRows(where = '', params: unknown[] = []) {
  const list = await rows<any>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id) run_count,
       (SELECT status FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id ORDER BY r.due_date DESC,r.id DESC LIMIT 1) last_run_status,
       (SELECT no_so FROM stock_opname_schedule_run r WHERE r.schedule_id=s.id ORDER BY r.due_date DESC,r.id DESC LIMIT 1) last_no_so
     FROM stock_opname_schedule s ${where} ORDER BY s.status='ACTIVE' DESC,s.next_run_date,s.id`, params,
  );
  if (!list.length) return [];
  const ids = list.map((item) => Number(item.id));
  const assignees = await rows<any>(
    `SELECT a.schedule_id,a.user_id,u.fullname,u.username,d.division_name
     FROM stock_opname_schedule_assignee a JOIN tb_user u ON u.id_user=a.user_id
     LEFT JOIN tb_division d ON d.id_division=u.id_division
     WHERE a.schedule_id IN (${ids.map(() => '?').join(',')}) ORDER BY u.fullname`, ids,
  );
  return list.map((item) => ({
    ...item,
    company_ids: parseScheduleIds(item.company_ids),
    category_ids: parseScheduleIds(item.category_ids),
    location_ids: parseScheduleIds(item.location_ids),
    assignees: assignees.filter((assignee) => Number(assignee.schedule_id) === Number(item.id)),
  }));
}

stockOpnameScheduleRouter.get('/stock-opname-schedules', authenticate, canManage, asyncHandler(async (_req, res) => {
  await ensureTables();
  ok(res, await scheduleRows());
}));

stockOpnameScheduleRouter.get('/stock-opname-schedules/my', authenticate, asyncHandler(async (req, res) => {
  await ensureTables();
  const user = (req as AuthRequest).user!;
  const data = await scheduleRows(
    `JOIN stock_opname_schedule_assignee mine ON mine.schedule_id=s.id AND mine.user_id=?
     WHERE s.status='ACTIVE' AND (s.end_date IS NULL OR s.end_date>=CURDATE())`, [user.id_user],
  );
  ok(res, data);
}));

stockOpnameScheduleRouter.get('/stock-opname-schedules/options', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables();
  const authorization = String(req.headers.authorization ?? '');
  const [users, upstream] = await Promise.all([
    rows(`SELECT u.id_user value,u.fullname label,u.username,d.division_name division
          FROM tb_user u LEFT JOIN tb_division d ON d.id_division=u.id_division
          WHERE u.active=1 ORDER BY u.fullname`),
    fetch(`${config.soBaseUrl}/api/master-company`, { headers: { Authorization: authorization, Accept: 'application/json' } }),
  ]);
  const masters = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new HttpError(502, String(masters?.message ?? `Master Stock Opname gagal dimuat (HTTP ${upstream.status}).`));
  ok(res, { users, masters: masters?.data ?? masters });
}));

stockOpnameScheduleRouter.post('/stock-opname-schedules', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables();
  const values = input(req.body);
  const user = (req as AuthRequest).user!;
  const validUsers = await rows<{ id_user: number }>(`SELECT id_user FROM tb_user WHERE active=1 AND id_user IN (${values.assignees.map(() => '?').join(',')})`, values.assignees);
  if (validUsers.length !== values.assignees.length) throw new HttpError(422, 'Salah satu petugas SO tidak aktif atau tidak ditemukan.');
  const id = await transaction(async (connection) => {
    const code = `SOS-${Date.now().toString(36).toUpperCase()}`;
    const [inserted] = await connection.execute<any>(
      `INSERT INTO stock_opname_schedule
       (schedule_code,schedule_name,recurrence_type,interval_value,start_date,end_date,next_run_date,is_bom,company_ids,category_ids,location_ids,status,notes,created_by_user_id,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,NOW())`,
      [code, values.name, values.recurrence, values.interval, values.startDate, values.endDate, values.startDate, values.isBom,
        JSON.stringify(values.companies), JSON.stringify(values.categories), JSON.stringify(values.locations), values.notes, user.id_user, actor(req as AuthRequest)],
    );
    for (const userId of values.assignees) await connection.execute(
      'INSERT INTO stock_opname_schedule_assignee (schedule_id,user_id,assigned_by,assigned_at) VALUES (?,?,?,NOW())',
      [inserted.insertId, userId, actor(req as AuthRequest)],
    );
    return Number(inserted.insertId);
  });
  created(res, { id }, 'Jadwal Stock Opname dibuat.');
}));

stockOpnameScheduleRouter.patch('/stock-opname-schedules/:id', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !(await one('SELECT id FROM stock_opname_schedule WHERE id=?', [id]))) throw new HttpError(404, 'Jadwal Stock Opname tidak ditemukan.');
  const values = input(req.body);
  const validUsers = await rows<{ id_user: number }>(`SELECT id_user FROM tb_user WHERE active=1 AND id_user IN (${values.assignees.map(() => '?').join(',')})`, values.assignees);
  if (validUsers.length !== values.assignees.length) throw new HttpError(422, 'Salah satu petugas SO tidak aktif atau tidak ditemukan.');
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE stock_opname_schedule SET schedule_name=?,recurrence_type=?,interval_value=?,start_date=?,end_date=?,
       next_run_date=CASE WHEN last_run_date IS NULL THEN ? ELSE next_run_date END,is_bom=?,company_ids=?,category_ids=?,location_ids=?,notes=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [values.name, values.recurrence, values.interval, values.startDate, values.endDate, values.startDate, values.isBom,
        JSON.stringify(values.companies), JSON.stringify(values.categories), JSON.stringify(values.locations), values.notes, actor(req as AuthRequest), id],
    );
    await connection.execute('DELETE FROM stock_opname_schedule_assignee WHERE schedule_id=?', [id]);
    for (const userId of values.assignees) await connection.execute(
      'INSERT INTO stock_opname_schedule_assignee (schedule_id,user_id,assigned_by,assigned_at) VALUES (?,?,?,NOW())', [id, userId, actor(req as AuthRequest)],
    );
  });
  ok(res, { id }, 'Jadwal Stock Opname diperbarui.');
}));

stockOpnameScheduleRouter.patch('/stock-opname-schedules/:id/status', authenticate, canManage, asyncHandler(async (req, res) => {
  await ensureTables();
  const id = Number(req.params.id);
  const status = String(req.body.status ?? '').toUpperCase();
  if (!['ACTIVE', 'PAUSED'].includes(status)) throw new HttpError(422, 'Status jadwal tidak valid.');
  const result = await execute('UPDATE stock_opname_schedule SET status=?,updated_by=?,updated_at=NOW() WHERE id=?', [status, actor(req as AuthRequest), id]);
  if (!result.affectedRows) throw new HttpError(404, 'Jadwal Stock Opname tidak ditemukan.');
  ok(res, { id, status }, status === 'ACTIVE' ? 'Jadwal diaktifkan.' : 'Jadwal dijeda.');
}));

stockOpnameScheduleRouter.post('/stock-opname-schedules/run-cron', authenticate, canManage, asyncHandler(async (_req, res) => {
  await ensureTables();
  const result = await runDueStockOpnameSchedules();
  ok(res, { processed: result.length, created: result.filter((item) => item.status === 'CREATED').length, failed: result.filter((item) => item.status === 'FAILED').length, runs: result }, result.length ? 'Scheduler Stock Opname selesai diproses.' : 'Tidak ada jadwal Stock Opname yang jatuh tempo.');
}));
