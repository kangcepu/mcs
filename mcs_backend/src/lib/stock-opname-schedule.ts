import { findUserById, signToken } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, tableExists, transaction, withNamedLock } from '../db.js';

export type StockOpnameScheduleRow = {
  id: number; schedule_name: string; recurrence_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval_value: number; end_date: string | null; next_run_date: string;
  is_bom: number; company_ids: string; category_ids: string; location_ids: string;
  created_by_user_id: number | null;
};

type LocationAssignment = { location_id: string; location_name: string | null; user_id: number };
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
  const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function addMonths(date: string, months: number): string {
  const source = new Date(`${date}T12:00:00Z`); const day = source.getUTCDate();
  source.setUTCDate(1); source.setUTCMonth(source.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  source.setUTCDate(Math.min(day, lastDay)); return source.toISOString().slice(0, 10);
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

async function createMcsStockOpname(schedule: StockOpnameScheduleRow, categoryId: string, userId: number) {
  const user = await findUserById(userId);
  if (!user || Number(user.active) !== 1) throw new Error('User pelaksana SO tidak aktif atau tidak ditemukan.');
  const previous = await one<{ NoSO: string }>('SELECT NoSO FROM tb_stockopname_h ORDER BY NoSO DESC LIMIT 1');
  const response = await fetch(`${config.soBaseUrl}/api/no-stock-opname/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${signToken(user)}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Tanggal: dateOnly(schedule.next_run_date),
      IdCompanies: parseScheduleIds(schedule.company_ids),
      IdCategories: [categoryId],
      IdLocations: parseScheduleIds(schedule.location_ids),
      IsBOM: Number(schedule.is_bom) === 1,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(payload?.message ?? `Service Stock Opname HTTP ${response.status}`));
  let noSo = responseNoSo(payload);
  if (!noSo) {
    const created = await one<{ NoSO: string }>('SELECT NoSO FROM tb_stockopname_h WHERE NoSO>? ORDER BY NoSO ASC LIMIT 1', [previous?.NoSO ?? '']);
    noSo = String(created?.NoSO ?? '');
  }
  if (!noSo) throw new Error('Service Stock Opname tidak mengembalikan NoSO.');
  return { noSo, payload };
}

async function snapshotAssignments(runId: number, noSo: string, assignments: LocationAssignment[]) {
  await transaction(async (connection) => {
    for (const item of assignments) await connection.execute(
      `INSERT INTO stock_opname_schedule_run_assignment
       (run_id,no_so,location_id,location_name,user_id,status,assigned_at)
       VALUES (?,?,?,?,?,'ASSIGNED',NOW())
       ON DUPLICATE KEY UPDATE location_name=VALUES(location_name),status='ASSIGNED'`,
      [runId, noSo, item.location_id, item.location_name, item.user_id],
    );
  });
}

export type StockOpnameRunResult = { schedule_id: number; schedule_name: string; due_date: string; category_id: string; no_so: string; status: 'CREATED' | 'PARTIAL' | 'FAILED'; message?: string };

export async function runDueStockOpnameSchedules(): Promise<StockOpnameRunResult[]> {
  if (!(await tableExists('stock_opname_schedule')) || !(await tableExists('stock_opname_schedule_run'))
    || !(await tableExists('stock_opname_schedule_location_assignment'))
    || !(await tableExists('stock_opname_schedule_run_assignment'))) return [];
  try {
    return await withNamedLock('mcs_stock_opname_scheduler', async () => {
      const today = jakartaToday(); const output: StockOpnameRunResult[] = [];
      const schedules = await rows<StockOpnameScheduleRow>(
        `SELECT * FROM stock_opname_schedule WHERE status='ACTIVE' AND next_run_date<=?
         AND (end_date IS NULL OR end_date>=next_run_date) ORDER BY next_run_date,id`, [today]);
      for (const schedule of schedules) {
        const dueDate = dateOnly(schedule.next_run_date);
        const categoryIds = parseScheduleIds(schedule.category_ids);
        const assignments = await rows<LocationAssignment>(
          `SELECT location_id,location_name,user_id FROM stock_opname_schedule_location_assignment
           WHERE schedule_id=? ORDER BY id`, [schedule.id]);
        const executionUserId = Number(schedule.created_by_user_id || assignments[0]?.user_id || 0);
        let allCreated = categoryIds.length > 0;
        for (const categoryId of categoryIds) {
          const existing = await one<any>(`SELECT id,status,no_so FROM stock_opname_schedule_run
            WHERE schedule_id=? AND due_date=? AND category_id=? LIMIT 1`, [schedule.id, dueDate, categoryId]);
          if (existing?.status === 'CREATED') continue;
          let runId = Number(existing?.id ?? 0);
          if (!runId) {
            const inserted = await execute(`INSERT INTO stock_opname_schedule_run
              (schedule_id,due_date,category_id,status,executed_by_user_id,started_at)
              VALUES (?,?,?,'PROCESSING',?,NOW())`, [schedule.id, dueDate, categoryId, executionUserId || null]);
            runId = Number(inserted.insertId);
          } else await execute(`UPDATE stock_opname_schedule_run SET status='PROCESSING',error_message=NULL,started_at=NOW(),completed_at=NULL WHERE id=?`, [runId]);
          let noSo = String(existing?.no_so ?? '');
          try {
            if (!assignments.length) throw new Error('Jadwal belum memiliki assignment petugas per lokasi.');
            if (!executionUserId) throw new Error('Jadwal belum memiliki user pelaksana aktif.');
            if (!noSo) {
              const created = await createMcsStockOpname(schedule, categoryId, executionUserId);
              noSo = created.noSo;
              await execute('UPDATE stock_opname_schedule_run SET no_so=?,upstream_response=? WHERE id=?', [noSo, JSON.stringify(created.payload), runId]);
            }
            await snapshotAssignments(runId, noSo, assignments);
            await execute(`UPDATE stock_opname_schedule_run SET status='CREATED',assignment_count=?,completed_at=NOW() WHERE id=?`, [assignments.length, runId]);
            output.push({ schedule_id: schedule.id, schedule_name: schedule.schedule_name, due_date: dueDate, category_id: categoryId, no_so: noSo, status: 'CREATED' });
          } catch (error) {
            allCreated = false; const message = error instanceof Error ? error.message : 'Gagal membuat Stock Opname.';
            const status = noSo ? 'PARTIAL' : 'FAILED';
            await execute(`UPDATE stock_opname_schedule_run SET no_so=?,status=?,error_message=?,completed_at=NOW() WHERE id=?`, [noSo || null, status, message.slice(0, 1000), runId]);
            output.push({ schedule_id: schedule.id, schedule_name: schedule.schedule_name, due_date: dueDate, category_id: categoryId, no_so: noSo, status, message });
          }
        }
        if (allCreated) {
          let next = nextStockOpnameRun(dueDate, schedule.recurrence_type, schedule.interval_value);
          while (next <= today) next = nextStockOpnameRun(next, schedule.recurrence_type, schedule.interval_value);
          await execute('UPDATE stock_opname_schedule SET last_run_date=?,next_run_date=?,updated_at=NOW() WHERE id=?', [dueDate, next, schedule.id]);
        }
      }
      return output;
    }, 0);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to acquire lock')) return [];
    throw error;
  }
}
