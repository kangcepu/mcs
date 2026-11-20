import { findUserById, signToken } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists, withNamedLock } from '../db.js';

export type StockOpnameScheduleRow = {
  id: number;
  schedule_code: string;
  schedule_name: string;
  recurrence_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval_value: number;
  start_date: string;
  end_date: string | null;
  next_run_date: string;
  is_bom: number;
  company_ids: string;
  category_ids: string;
  location_ids: string;
  status: string;
};

const dateOnly = (value: unknown): string => String(value ?? '').slice(0, 10);
const jakartaToday = (): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function parseScheduleIds(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? [...new Set(parsed.map(String).map((item) => item.trim()).filter(Boolean))] : [];
  } catch { return []; }
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const source = new Date(`${date}T12:00:00Z`);
  const day = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  source.setUTCDate(Math.min(day, lastDay));
  return source.toISOString().slice(0, 10);
}

export function nextStockOpnameRun(current: string, recurrence: string, interval: number): string {
  const step = Math.max(1, Math.min(365, Number(interval) || 1));
  if (recurrence === 'DAILY') return addDays(current, step);
  if (recurrence === 'WEEKLY') return addDays(current, step * 7);
  return addMonths(current, step);
}

function responseNoSo(payload: any): string {
  const candidates = [payload?.NoSO, payload?.noSO, payload?.no_so, payload?.data?.NoSO, payload?.data?.noSO, payload?.data?.no_so];
  return String(candidates.find((item) => String(item ?? '').trim()) ?? '').trim();
}

async function createUpstreamStockOpname(schedule: StockOpnameScheduleRow, userId: number): Promise<string> {
  const user = await findUserById(userId);
  if (!user || Number(user.active) !== 1) throw new Error('Petugas SO tidak aktif atau tidak ditemukan.');
  const previous = await one<{ NoSO: string }>('SELECT NoSO FROM tb_stockopname_h ORDER BY NoSO DESC LIMIT 1');
  const response = await fetch(`${config.soBaseUrl}/api/no-stock-opname/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${signToken(user)}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Tanggal: dateOnly(schedule.next_run_date),
      IdCompanies: parseScheduleIds(schedule.company_ids),
      IdCategories: parseScheduleIds(schedule.category_ids),
      IdLocations: parseScheduleIds(schedule.location_ids),
      IsBOM: Number(schedule.is_bom) === 1,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(payload?.message ?? `Service Stock Opname HTTP ${response.status}`));
  const fromResponse = responseNoSo(payload);
  if (fromResponse) return fromResponse;
  const created = await one<{ NoSO: string }>(
    'SELECT NoSO FROM tb_stockopname_h WHERE NoSO>? ORDER BY NoSO ASC LIMIT 1',
    [previous?.NoSO ?? ''],
  );
  return String(created?.NoSO ?? '');
}

export type StockOpnameRunResult = { schedule_id: number; schedule_name: string; due_date: string; no_so: string; status: 'CREATED' | 'FAILED'; message?: string };

export async function runDueStockOpnameSchedules(): Promise<StockOpnameRunResult[]> {
  if (!(await tableExists('stock_opname_schedule')) || !(await tableExists('stock_opname_schedule_run'))) return [];
  try {
    return await withNamedLock('mcs_stock_opname_scheduler', async () => {
      const today = jakartaToday();
      const output: StockOpnameRunResult[] = [];
      const schedules = await rows<StockOpnameScheduleRow>(
      `SELECT * FROM stock_opname_schedule
       WHERE status='ACTIVE' AND next_run_date<=? AND (end_date IS NULL OR end_date>=next_run_date)
       ORDER BY next_run_date,id`, [today],
      );
      for (const schedule of schedules) {
      const dueDate = dateOnly(schedule.next_run_date);
      const existing = await one<{ id: number; status: string; no_so: string | null }>(
        'SELECT id,status,no_so FROM stock_opname_schedule_run WHERE schedule_id=? AND due_date=? LIMIT 1', [schedule.id, dueDate],
      );
      if (existing?.status === 'CREATED') continue;
      const assignees = await rows<{ user_id: number }>(
        `SELECT a.user_id FROM stock_opname_schedule_assignee a JOIN tb_user u ON u.id_user=a.user_id
         WHERE a.schedule_id=? AND u.active=1 ORDER BY a.assigned_at,a.user_id`, [schedule.id],
      );
      const userId = Number(assignees[0]?.user_id ?? 0);
      let runId = Number(existing?.id ?? 0);
      if (!runId) {
        const inserted = await execute(
          `INSERT INTO stock_opname_schedule_run (schedule_id,due_date,status,executed_by_user_id,started_at)
           VALUES (?,?,'PROCESSING',?,NOW())`, [schedule.id, dueDate, userId || null],
        );
        runId = Number(inserted.insertId);
      } else {
        await execute(`UPDATE stock_opname_schedule_run SET status='PROCESSING',executed_by_user_id=?,error_message=NULL,started_at=NOW(),completed_at=NULL WHERE id=?`, [userId || null, runId]);
      }
      try {
        if (!userId) throw new Error('Jadwal belum memiliki petugas SO aktif.');
        const noSo = await createUpstreamStockOpname(schedule, userId);
        await execute(`UPDATE stock_opname_schedule_run SET no_so=?,status='CREATED',completed_at=NOW() WHERE id=?`, [noSo || null, runId]);
        let next = nextStockOpnameRun(dueDate, schedule.recurrence_type, schedule.interval_value);
        while (next <= today) next = nextStockOpnameRun(next, schedule.recurrence_type, schedule.interval_value);
        await execute(`UPDATE stock_opname_schedule SET last_run_date=?,next_run_date=?,updated_at=NOW() WHERE id=?`, [dueDate, next, schedule.id]);
        output.push({ schedule_id: schedule.id, schedule_name: schedule.schedule_name, due_date: dueDate, no_so: noSo, status: 'CREATED' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gagal membuat Stock Opname.';
        await execute(`UPDATE stock_opname_schedule_run SET status='FAILED',error_message=?,completed_at=NOW() WHERE id=?`, [message.slice(0, 1000), runId]);
        output.push({ schedule_id: schedule.id, schedule_name: schedule.schedule_name, due_date: dueDate, no_so: '', status: 'FAILED', message });
      }
      }
      return output;
    }, 0);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to acquire lock')) return [];
    throw error;
  }
}
