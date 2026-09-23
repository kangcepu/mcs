import { hasColumn, one, pool, rows, transaction } from '../db.js';
import { resolveCompanyCode } from './employee-api.js';
import { nowInJakarta } from './daily-control.js';
import type { PoolConnection } from 'mysql2/promise';

type LogicalType = 'harian' | 'mingguan' | 'bulanan' | '3 bulanan' | '6 bulanan' | 'tahunan' | '';

export function normalizeCustomDetailScheduleType(value: unknown): LogicalType {
  let raw = String(value ?? '').toLowerCase().trim();
  raw = raw.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (raw.includes('harian') || raw.includes('daily') || raw === 'day') return 'harian';
  if (raw === 'mingguan' || raw === 'week' || /weekly|1 minggu|2 minggu|3 minggu|1 week|2 week|3 week/.test(raw)) return 'mingguan';
  if (raw.includes('3 bulanan') || raw.includes('3 bulan') || raw.includes('3 month')) return '3 bulanan';
  if (raw.includes('6 bulanan') || raw.includes('6 bulan') || raw.includes('6 month')) return '6 bulanan';
  if (raw === 'tahunan' || raw === 'year' || /1 tahun|yearly|annual|1 year/.test(raw)) return 'tahunan';
  if (raw === 'bulanan' || raw === 'month' || /1 bulan|monthly|1 month/.test(raw)) return 'bulanan';
  return '';
}

export function scheduleTypeToStorageValue(value: unknown): string {
  switch (normalizeCustomDetailScheduleType(value)) {
    case 'harian': return 'harian';
    case 'mingguan': return '1 minggu';
    case 'bulanan': return '1 bulan';
    case '3 bulanan': return '3 bulan';
    case '6 bulanan': return '6 bulan';
    case 'tahunan': return '1 tahun';
    default: return '';
  }
}

const WEEKDAYS_NO_SUNDAY = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ENGLISH_DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function dayNameOf(date: Date): string {
  return ENGLISH_DAY_NAMES[date.getDay()];
}

export function normalizeScheduleDetailChooseDayForType(type: unknown, chooseDay: unknown, startDate = ''): string {
  const t = normalizeCustomDetailScheduleType(type);
  if (t === '' || t === 'harian') return '';
  const cd = String(chooseDay ?? '').toLowerCase().trim();

  if (t === 'mingguan') {
    if (WEEKDAYS_NO_SUNDAY.includes(cd)) return cd;
    const start = startDate ? new Date(startDate) : null;
    if (start && !isNaN(start.getTime())) {
      const derived = dayNameOf(start);
      if (WEEKDAYS_NO_SUNDAY.includes(derived)) return derived;
    }
    return 'saturday';
  }

  if (/^\d{1,2}$/.test(cd) && Number(cd) >= 1 && Number(cd) <= 31) return cd;
  const start = startDate ? new Date(startDate) : null;
  if (start && !isNaN(start.getTime())) return String(start.getDate());
  return '1';
}

export function normalizeMaintenanceCategory(value: unknown): string | null {
  const v = String(value ?? '').toLowerCase().trim();
  if (v.includes('general')) return 'general';
  if (v.includes('elektr') || v.includes('electr')) return 'electrical';
  if (v.includes('mekanik') || v.includes('mechanic')) return 'mechanical';
  if (v.includes('sipil') || v.includes('civil')) return 'civil';
  if (v.includes('otomotif') || v.includes('automotive')) return 'automotive';
  if (v.includes('mould') || v.includes('mold')) return 'mould';
  return null;
}

export function extractMaintenanceCategoriesFromText(text: unknown): string[] {
  const v = String(text ?? '').toLowerCase();
  const out: string[] = [];
  if (v.includes('general')) out.push('general');
  if (v.includes('elektr') || v.includes('electr')) out.push('electrical');
  if (v.includes('mekanik') || v.includes('mechanic')) out.push('mechanical');
  if (v.includes('sipil') || v.includes('civil')) out.push('civil');
  if (v.includes('otomotif') || v.includes('automotive')) out.push('automotive');
  if (v.includes('mould') || v.includes('mold')) out.push('mould');
  return out;
}

function categoryDivisionCode(category: string | null): string {
  switch (category) {
    case 'electrical': return 'ELC';
    case 'mechanical': return 'MKL';
    case 'civil': return 'SPL';
    case 'automotive': return 'OTO';
    default: return 'MTC';
  }
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Server aplikasi jalan di jam UTC, DB di WIB (beda 7 jam) — `new
 * Date().toISOString()` masih mikir "hari ini" itu kemarin selama jam
 * 00:00-07:00 WIB, bikin WO auto-generate ke-stamp tanggal yang salah
 * (dan otomatis "belum ada WO hari ini" jadi generate ulang / dobel).
 * Sama akar penyebabnya kayak bug activity_time di daily-control.ts.
 */
function todayDateOnly(): string {
  return nowInJakarta().date;
}

function getScheduleTargetMonth(lastUpdate: string, monthsToAdd: number): string {
  const base = new Date(lastUpdate);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  start.setMonth(start.getMonth() + monthsToAdd);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function daysInMonth(year: number, month1based: number): number {
  return new Date(year, month1based, 0).getDate();
}

export function isScheduleDue(scheduleType: unknown, chooseDay: unknown, lastUpdate: unknown): boolean {
  const normalizedType = normalizeCustomDetailScheduleType(scheduleType);
  const today = todayDateOnly();

  if (normalizedType === 'harian') {
    const last = toDateOnly(lastUpdate);
    return !last || last < today;
  }

  const effectiveLastUpdate = lastUpdate ? String(lastUpdate) : '2000-01-01 00:00:00';
  const monthsByType: Record<string, number> = { bulanan: 1, '3 bulanan': 3, '6 bulanan': 6, tahunan: 12 };

  let targetDate: string | null = null;
  if (normalizedType === 'mingguan') {
    const d = new Date(effectiveLastUpdate);
    d.setDate(d.getDate() + 7);
    targetDate = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } else if (normalizedType in monthsByType) {
    targetDate = getScheduleTargetMonth(effectiveLastUpdate, monthsByType[normalizedType]);
  }

  const cd = String(chooseDay ?? '').trim();
  if (!targetDate || !cd) return false;

  if (normalizedType === 'mingguan') {
    const todayName = dayNameOf(new Date());
    return cd.toLowerCase() === todayName && today >= targetDate;
  }

  const chosenDate = /^\d{1,2}$/.test(cd) ? Number(cd) : 1;
  if (chosenDate < 1 || chosenDate > 31) return false;
  const [ty, tm] = targetDate.split('-').map(Number);
  const effectiveChosenDate = Math.min(chosenDate, daysInMonth(ty, tm));
  const scheduledTargetDate = `${ty}-${String(tm).padStart(2, '0')}-${String(effectiveChosenDate).padStart(2, '0')}`;
  const todayDayOfMonth = new Date().getDate();
  return today >= scheduledTargetDate && todayDayOfMonth >= effectiveChosenDate;
}

export async function isNonWorkingDate(dateStr: string, company: string): Promise<boolean> {
  const d = new Date(dateStr);
  if (d.getDay() === 0) return true;
  const row = await one(
    "SELECT 1 FROM tb_work_calendar WHERE calendar_date=? AND is_active=1 AND (company='ALL' OR company=?) LIMIT 1",
    [dateStr, company || 'ALL'],
  );
  return Boolean(row);
}

interface ScheduleHeader {
  id: number;
  AssetID: number;
  AssetCode: string;
  CompanyName: string;
  towo: string;
  is_schedule_check: number;
  type_schedule: string | null;
  choose_day: string | null;
}

interface ScheduleDetail {
  id: number;
  tbl_schedules_id: number;
  asset_custom_detail_id: number | null;
  id_division: number;
  creator: string;
  company: string;
  shift: string;
  job_title: string;
  part_mesin: string | null;
  job_requirement: string | null;
  running_hours: string;
  type_schedule: string;
  choose_day: string | null;
  type_wo: string;
  is_pause: string;
  last_update: string | null;
  executor: string | null;
  start_date: string | null;
}

async function fetchActiveDetailsFor(headerId: number): Promise<ScheduleDetail[]> {
  const details = await rows<ScheduleDetail>('SELECT * FROM tbl_schedules_detail WHERE tbl_schedules_id=? AND is_pause=?', [headerId, 'started']);
  for (const d of details) {
    const normalizedType = normalizeCustomDetailScheduleType(d.type_schedule);
    if (normalizedType !== '') {
      d.choose_day = normalizeScheduleDetailChooseDayForType(normalizedType, d.choose_day, d.start_date ?? '');
      d.type_schedule = normalizedType;
    }
  }
  return details;
}

export interface ScheduleWithDetails { schedule: ScheduleHeader; schedule_detail: ScheduleDetail[] }

export async function getAllSchedule(): Promise<ScheduleWithDetails[]> {
  const headers = await rows<ScheduleHeader>('SELECT * FROM tb_schedule_header');
  const out: ScheduleWithDetails[] = [];
  for (const header of headers) {
    out.push({ schedule: header, schedule_detail: await fetchActiveDetailsFor(header.id) });
  }
  return out;
}

async function getFirstAdmin(idDivision: number): Promise<Record<string, unknown> | null> {
  return one(
    `SELECT tb_user.*, tb_division.division_code, tb_division.division_name
     FROM tb_user LEFT JOIN tb_division ON tb_division.id_division = tb_user.id_division
     WHERE tb_user.id_division = ? ORDER BY tb_user.id_user ASC LIMIT 1`,
    [idDivision],
  );
}

async function generateWoNumberByDivisionCode(prefix: string, table: string, divisionCode: string): Promise<string> {
  if (!divisionCode) return '-';
  const now = new Date();
  const prefixStr = `${prefix}-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
  const maxRow = await one<{ num: number | null }>(`SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS num FROM ${table} WHERE wo_number LIKE ?`, [`${prefixStr}%`]);
  const next = String(Number(maxRow?.num ?? 0) + 1).padStart(4, '0');
  return `${prefixStr}/${next}`;
}

async function generateWoNumber(prefix: string, table: string, idDivision: number): Promise<string> {
  const user = await getFirstAdmin(idDivision);
  const divisionCode = String(user?.division_code ?? '').trim();
  return generateWoNumberByDivisionCode(prefix, table, divisionCode);
}

function parseExecutorCodes(items: ScheduleDetail[]): { codes: string[]; category: string | null } {
  const codes = new Set<string>();
  let category: string | null = null;
  for (const item of items) {
    const raw = String(item.executor ?? '').split(',');
    for (const piece of raw) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      let code = trimmed;
      if (trimmed.includes('|')) {
        const parts = trimmed.split('|');
        code = parts[0].trim();
        if (!category) category = normalizeMaintenanceCategory(parts[parts.length - 1]);
      }
      if (code) codes.add(code.toUpperCase());
    }
  }
  if (!codes.size) codes.add('MTC');
  return { codes: [...codes], category };
}

async function findExistingWoForToday(table: string, assetId: number): Promise<string | null> {
  const hasAutoGenerate = await hasColumn(table, 'auto_generate');
  const clause = hasAutoGenerate ? "(auto_generate='yes' OR job_requirement LIKE 'AUTO FROM SCHEDULE:%')" : "job_requirement LIKE 'AUTO FROM SCHEDULE:%'";
  const row = await one<{ wo_number: string }>(
    `SELECT wo_number FROM ${table} WHERE date=CURDATE() AND id_equipment=? AND ${clause} ORDER BY created_at DESC LIMIT 1`,
    [assetId],
  );
  return row?.wo_number ?? null;
}

interface GeneratedWo { wo_number: string; asset_code: string; total_items: number }

async function insertJobExecutorAndQueueEmail(connection: PoolConnection, woNumber: string, executorCode: string, status: string): Promise<void> {
  await connection.execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [executorCode, woNumber, '', status]);
  const division = await one<{ id_division: number }>('SELECT id_division FROM tb_division WHERE division_code=?', [executorCode]);
  if (!division) return;
  const admin = await one<{ email: string | null }>(
    "SELECT email FROM tb_user WHERE id_division=? AND id_position='EXECUTOR_ADMIN' ORDER BY id_user DESC LIMIT 1",
    [division.id_division],
  );
  if (admin?.email) {
    await connection.execute('INSERT INTO tb_queue_email (email, wo_number, created_at) VALUES (?,?,NOW())', [admin.email, woNumber]).catch(() => undefined);
  }
}

function buildTitle(assetCode: string, totalItems: number, prefix: string, genericLabel: string): string {
  return assetCode === '' ? `${genericLabel} (${totalItems} ITEM)` : `${prefix} ${assetCode} (${totalItems} ITEM)`;
}

async function createWoMesoGrouped(dataAsset: ScheduleWithDetails, forceDue: boolean): Promise<GeneratedWo[]> {
  const header = dataAsset.schedule;
  const existingDetailIds = new Set(
    (await rows<{ schedule_detail_id: number }>(
      "SELECT schedule_detail_id FROM tb_wo_meso_detail WHERE generated_date=CURDATE() AND schedule_detail_id IS NOT NULL",
    )).map((r) => r.schedule_detail_id),
  );

  const dueItems = dataAsset.schedule_detail.filter((d) =>
    d.is_pause === 'started' && !existingDetailIds.has(d.id) && (forceDue || isScheduleDue(d.type_schedule, d.choose_day, d.last_update)));
  if (!dueItems.length) return [];

  const { codes: executorCodes, category: mesoCategory } = parseExecutorCodes(dueItems);
  const first = dueItems[0];
  const user = await getFirstAdmin(first.id_division);
  if (!user || !user.fullname) return [];

  const assetId = header.AssetID;
  const assetCode = header.AssetCode ?? '';
  let woNumber = await findExistingWoForToday('tb_wo_mtc', assetId);
  const creatingNew = !woNumber;
  if (creatingNew) {
    woNumber = await generateWoNumberByDivisionCode('WO', 'tb_wo_mtc', categoryDivisionCode(mesoCategory));
    if (!woNumber || woNumber === '-') return [];
  }
  const finalWoNumber = woNumber as string;

  try {
    return await transaction(async (connection) => {
      if (creatingNew) {
        const hasCategoryCol = await hasColumn('tb_wo_mtc', 'category_maintenance');
        const hasAutoGenerateCol = await hasColumn('tb_wo_mtc', 'auto_generate');
        const cols = ['wo_number', 'date', 'company', 'shift', 'type_wo', 'id_division', 'id_equipment', 'job_title', 'running_hours', 'job_requirement', 'priority', 'attachment', 'creator', 'created_at', 'status', 'job_executor', 'pic'];
        const vals: unknown[] = [finalWoNumber, todayDateOnly(), resolveCompanyCode(header.CompanyName ?? ''), first.shift, first.type_wo || 'PREVENTIVE', first.id_division, assetId,
          buildTitle(assetCode, dueItems.length, 'PREVENTIVE', 'PREVENTIVE MESO'), null, `AUTO FROM SCHEDULE: ${dueItems.length} ITEM`, 'NORMAL', '#', user.fullname, null,
          'WAIT_EXECUTOR_ADMIN', executorCodes.join(','), executorCodes.join(',')];
        let sql = `INSERT INTO tb_wo_mtc (${cols.join(',')}) VALUES (${cols.map((c) => c === 'created_at' ? 'NOW()' : '?').join(',')})`;
        const bound = vals.filter((_v, i) => cols[i] !== 'created_at');
        if (hasCategoryCol && mesoCategory) { sql = sql.replace(') VALUES', ',category_maintenance) VALUES').replace(/\)$/, ',?)'); bound.push(mesoCategory); }
        if (hasAutoGenerateCol) { sql = sql.replace(') VALUES', ",auto_generate) VALUES").replace(/\)$/, ",'yes')"); }
        await connection.execute(sql, bound as never);
        for (const code of executorCodes) await insertJobExecutorAndQueueEmail(connection, finalWoNumber, code, 'WAITING');
      }

      let inserted = 0;
      for (const item of dueItems) {
        await connection.execute(
          `INSERT INTO tb_wo_meso_detail (wo_number, schedule_detail_id, generated_date, asset_id, asset_code, id_division, shift, type_wo, job_title, part_mesin, job_requirement, running_hours, type_schedule, choose_day, executor, start_date, created_at)
           VALUES (?,?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
          [finalWoNumber, item.id || null, assetId, assetCode, item.id_division, item.shift, item.type_wo,
            item.job_title?.trim() || '(NO TITLE)', item.part_mesin, item.job_requirement, item.running_hours,
            item.type_schedule, item.choose_day, item.executor, item.start_date ? toDateOnly(item.start_date) : null] as never,
        );
        inserted++;
        if (item.id > 0) await connection.execute('UPDATE tbl_schedules_detail SET last_update=NOW() WHERE id=?', [item.id]);
      }
      if (inserted === 0) throw new Error('NO_ROWS_INSERTED');

      const totalRow = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_wo_meso_detail WHERE wo_number=?', [finalWoNumber]);
      const total = Number(totalRow?.total ?? inserted);
      await connection.execute('UPDATE tb_wo_mtc SET job_title=?, job_requirement=? WHERE wo_number=?', [buildTitle(assetCode, total, 'PREVENTIVE', 'PREVENTIVE MESO'), `AUTO FROM SCHEDULE: ${total} ITEM`, finalWoNumber]);

      return [{ wo_number: finalWoNumber, asset_code: assetCode, total_items: inserted }];
    });
  } catch {
    return [];
  }
}

async function createWoOperationalGrouped(dataAsset: ScheduleWithDetails, forceDue: boolean): Promise<GeneratedWo[]> {
  const header = dataAsset.schedule;
  const existingIdsRows = await rows<{ schedule_detail_id: number }>(
    `SELECT d.schedule_detail_id FROM tb_wo_mtc_operational_detail d
     INNER JOIN tb_wo_mtc_operational h ON h.wo_number = d.wo_number
     WHERE h.date = CURDATE() AND d.schedule_detail_id IS NOT NULL`,
  );
  const existingDetailIds = new Set(existingIdsRows.map((r) => r.schedule_detail_id));

  const items = dataAsset.schedule_detail.filter((d) =>
    d.is_pause === 'started' && !existingDetailIds.has(d.id) && (forceDue || isScheduleDue(d.type_schedule, d.choose_day, d.last_update)));
  if (!items.length) return [];

  const first = items[0];
  const { category } = parseExecutorCodes([first]);
  const executorBase = (String(first.executor ?? '').split(',')[0].split('|')[0].trim() || 'MTC').toUpperCase();
  const user = await getFirstAdmin(first.id_division);
  if (!user || !user.fullname) return [];

  const assetId = header.AssetID;
  const assetCode = header.AssetCode ?? '';
  let woNumber = await findExistingWoForToday('tb_wo_mtc_operational', assetId);
  const creatingNew = !woNumber;
  if (creatingNew) {
    woNumber = await generateWoNumberByDivisionCode('WOPR', 'tb_wo_mtc_operational', categoryDivisionCode(category));
    if (!woNumber || woNumber === '-') return [];
  }
  const finalWoNumber = woNumber as string;

  try {
    return await transaction(async (connection) => {
      if (creatingNew) {
        const hasPartMesinCol = await hasColumn('tb_wo_mtc_operational', 'part_mesin');
        const hasCategoryCol = await hasColumn('tb_wo_mtc_operational', 'category_maintenance');
        const hasAutoGenerateCol = await hasColumn('tb_wo_mtc_operational', 'auto_generate');
        const cols = ['wo_number', 'date', 'company', 'shift', 'type_wo', 'id_division', 'id_equipment', 'job_title', 'running_hours', 'job_requirement', 'priority', 'attachment', 'creator', 'status', 'job_executor', 'pic'];
        const vals: unknown[] = [finalWoNumber, todayDateOnly(), resolveCompanyCode(header.CompanyName ?? ''), first.shift, first.type_wo, first.id_division, assetId,
          buildTitle(assetCode, items.length, 'MAINTENANCE', 'MAINTENANCE SCHEDULE'), null, `AUTO FROM SCHEDULE: ${items.length} ITEM`, 'NORMAL', '#', user.fullname,
          'IN_PROGRESS_EXECUTOR', executorBase, executorBase];
        let sql = `INSERT INTO tb_wo_mtc_operational (${cols.join(',')},created_at) VALUES (${cols.map(() => '?').join(',')},NOW())`;
        const bound = [...vals];
        if (hasAutoGenerateCol) { sql = sql.replace(') VALUES', ",auto_generate) VALUES").replace(/\)$/, ",'yes')"); }
        if (hasPartMesinCol) { sql = sql.replace(') VALUES', ',part_mesin) VALUES').replace(/\)$/, ',?)'); bound.push(first.part_mesin); }
        if (hasCategoryCol && category) { sql = sql.replace(') VALUES', ',category_maintenance) VALUES').replace(/\)$/, ',?)'); bound.push(category); }
        await connection.execute(sql, bound as never);
        await connection.execute("INSERT INTO tb_job_executor (job_executor, wo_number, status, created_at) VALUES (?,?,'IN_PROGRESS',NOW())", [executorBase, finalWoNumber]);
      }

      const hasCategoryDetailCol = await hasColumn('tb_wo_mtc_operational_detail', 'category_maintenance');
      let inserted = 0;
      for (const item of items) {
        const cols = ['wo_number', 'schedule_detail_id', 'asset_id', 'asset_code', 'id_division', 'shift', 'type_wo', 'job_title', 'part_mesin', 'job_requirement', 'running_hours', 'type_schedule', 'choose_day', 'executor', 'start_date'];
        const vals: unknown[] = [finalWoNumber, item.id || null, assetId, assetCode, item.id_division, item.shift, item.type_wo,
          item.job_title?.trim() || '(NO TITLE)', item.part_mesin, item.job_requirement, item.running_hours, item.type_schedule,
          item.choose_day, item.executor, item.start_date ? toDateOnly(item.start_date) : null];
        let sql = `INSERT INTO tb_wo_mtc_operational_detail (${cols.join(',')},created_at) VALUES (${cols.map(() => '?').join(',')},NOW())`;
        if (hasCategoryDetailCol) { sql = sql.replace(',created_at)', ',category_maintenance,created_at)').replace(',NOW())', ',?,NOW())'); vals.push(category); }
        await connection.execute(sql, vals as never);
        inserted++;
        if (item.id > 0) await connection.execute('UPDATE tbl_schedules_detail SET last_update=NOW() WHERE id=?', [item.id]);
      }
      if (inserted === 0) throw new Error('NO_ROWS_INSERTED');

      if (!creatingNew) {
        const totalRow = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_wo_mtc_operational_detail WHERE wo_number=?', [finalWoNumber]);
        const total = Number(totalRow?.total ?? inserted);
        await connection.execute('UPDATE tb_wo_mtc_operational SET job_title=?, job_requirement=? WHERE wo_number=?', [buildTitle(assetCode, total, 'MAINTENANCE', 'MAINTENANCE SCHEDULE'), `AUTO FROM SCHEDULE: ${total} ITEM`, finalWoNumber]);
      }

      return [{ wo_number: finalWoNumber, asset_code: assetCode, total_items: items.length }];
    });
  } catch {
    return [];
  }
}

async function createWoPreventiveGrouped(dataAsset: ScheduleWithDetails, forceDue: boolean): Promise<GeneratedWo[]> {
  const header = dataAsset.schedule;
  const existingIdsRows = await rows<{ schedule_detail_id: number }>(
    'SELECT schedule_detail_id FROM tb_wo_preventive_detail WHERE generated_date=CURDATE() AND schedule_detail_id IS NOT NULL',
  );
  const existingDetailIds = new Set(existingIdsRows.map((r) => r.schedule_detail_id));

  const items = dataAsset.schedule_detail.filter((d) =>
    d.is_pause === 'started' && (forceDue || isScheduleDue(d.type_schedule, d.choose_day, d.last_update)));
  if (!items.length) return [];

  const first = items[0];
  const { category } = parseExecutorCodes([first]);
  const user = await getFirstAdmin(first.id_division);
  if (!user || !user.division_code) return [];

  const assetId = header.AssetID;
  const assetCode = header.AssetCode ?? '';
  let woNumber = await findExistingWoForToday('tb_wo_preventive', assetId);
  const creatingNew = !woNumber;
  if (creatingNew) {
    woNumber = await generateWoNumber('PREV', 'tb_wo_preventive', first.id_division);
    if (!woNumber || woNumber === '-') return [];
  }
  const finalWoNumber = woNumber as string;

  const hasAutoGenerateCol = await hasColumn('tb_wo_preventive', 'auto_generate');
  let headerFields: Record<string, unknown> = {
    wo_number: finalWoNumber, date: todayDateOnly(), company: resolveCompanyCode(header.CompanyName ?? ''), shift: first.shift, type_wo: first.type_wo,
    id_division: first.id_division, id_equipment: assetId, job_title: buildTitle(assetCode, items.length, 'PREVENTIVE', 'PREVENTIVE MAINTENANCE'),
    running_hours: null, job_requirement: `AUTO FROM SCHEDULE: ${items.length} ITEM`, priority: 'NORMAL', attachment: '#',
    creator: user.fullname, created_at: todayDateOnly(), status: 'WAIT_EXECUTOR_ADMIN', job_executor: user.division_code, pic: user.division_code,
  };
  if (hasAutoGenerateCol) headerFields.auto_generate = 'yes';

  if (!creatingNew) {
    const existing = await one<Record<string, unknown>>('SELECT * FROM tb_wo_preventive WHERE wo_number=? LIMIT 1', [finalWoNumber]);
    if (existing) headerFields = { ...headerFields, ...existing };
  }

  try {
    const result = await transaction(async (connection) => {
      if (creatingNew) {
        const keys = Object.keys(headerFields);
        const sql = `INSERT INTO tb_wo_preventive (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map((k) => k === 'created_at' ? 'NOW()' : '?').join(',')})`;
        const bound = keys.filter((k) => k !== 'created_at').map((k) => headerFields[k]);
        await connection.execute(sql, bound as never);
        await connection.execute("INSERT INTO tb_job_executor (job_executor, wo_number, status, created_at) VALUES (?,?,'WAITING',NOW())", [user.division_code, finalWoNumber] as never);
      }

      const hasCategoryDetailCol = await hasColumn('tb_wo_preventive_detail', 'category_maintenance');
      let inserted = 0;
      for (const item of items) {
        if (existingDetailIds.has(item.id)) continue;
        const cols = ['wo_number', 'schedule_detail_id', 'generated_date', 'asset_id', 'asset_code', 'id_division', 'shift', 'type_wo', 'job_title', 'part_mesin', 'job_requirement', 'running_hours', 'type_schedule', 'choose_day', 'executor', 'start_date'];
        const vals: unknown[] = [finalWoNumber, item.id || null, todayDateOnly(), assetId, assetCode, item.id_division, item.shift, item.type_wo,
          item.job_title?.trim() || '(NO TITLE)', item.part_mesin, item.job_requirement, item.running_hours, item.type_schedule,
          item.choose_day, item.executor, item.start_date ? toDateOnly(item.start_date) : null];
        let sql = `INSERT INTO tb_wo_preventive_detail (${cols.join(',')},created_at) VALUES (${cols.map(() => '?').join(',')},NOW())`;
        if (hasCategoryDetailCol) { sql = sql.replace(',created_at)', ',category_maintenance,created_at)').replace(',NOW())', ',?,NOW())'); vals.push(category); }
        await connection.execute(sql, vals as never);
        inserted++;
        existingDetailIds.add(item.id);
        if (item.id > 0) await connection.execute('UPDATE tbl_schedules_detail SET last_update=NOW() WHERE id=?', [item.id]);
      }

      if (inserted > 0) {
        const totalRow = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_wo_preventive_detail WHERE wo_number=?', [finalWoNumber]);
        const total = Number(totalRow?.total ?? inserted);
        const title = buildTitle(assetCode, total, 'PREVENTIVE', 'PREVENTIVE MAINTENANCE');
        const requirement = `AUTO FROM SCHEDULE: ${total} ITEM`;
        await connection.execute('UPDATE tb_wo_preventive SET job_title=?, job_requirement=? WHERE wo_number=?', [title, requirement, finalWoNumber]);
        headerFields.job_title = title; headerFields.job_requirement = requirement;
      }

      if (inserted === 0 && creatingNew) throw new Error('NO_ROWS_INSERTED');

      if (creatingNew && inserted > 0) {
        const divHead = await one<{ email: string | null }>("SELECT email FROM tb_user WHERE id_division=? AND id_position='DIVHEAD' LIMIT 1", [first.id_division]);
        if (divHead?.email) await connection.execute('INSERT INTO tb_queue_email (email, wo_number, created_at) VALUES (?,?,NOW())', [divHead.email, finalWoNumber]).catch(() => undefined);
      }

      return inserted > 0 || !creatingNew ? [{ wo_number: finalWoNumber, asset_code: assetCode, total_items: inserted }] : [];
    });
    return result;
  } catch {
    return [];
  }
}

async function createWoNew(dataAsset: ScheduleWithDetails, forceDue = false): Promise<GeneratedWo[]> {
  const company = dataAsset.schedule.CompanyName || 'ALL';
  if (await isNonWorkingDate(todayDateOnly(), company)) return [];

  const towo = String(dataAsset.schedule.towo ?? '').trim();
  if (towo === 'wo_mtc') return createWoMesoGrouped(dataAsset, forceDue);
  if (towo === 'wo_preventive') return createWoPreventiveGrouped(dataAsset, forceDue);
  if (towo === 'wo_mtc_operational') return createWoOperationalGrouped(dataAsset, forceDue);
  return [];
}

export async function generateScheduleNow(scheduleId: number): Promise<GeneratedWo[]> {
  if (scheduleId <= 0) return [];
  for (const item of await getAllSchedule()) {
    if (item.schedule.id === scheduleId) return createWoNew(item, true);
  }
  return [];
}

export async function runScheduledGeneration(): Promise<GeneratedWo[]> {
  const connection = await pool.getConnection();
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('mcs_schedule_create_wo', 0) AS acquired");
    const acquired = Number((lockRows as { acquired: number }[])[0]?.acquired ?? 0) === 1;
    if (!acquired) return [];
    try {
      const results: GeneratedWo[] = [];
      for (const item of await getAllSchedule()) {
        const generated = await createWoNew(item, false);
        results.push(...generated);
      }
      return results;
    } finally {
      await connection.query("SELECT RELEASE_LOCK('mcs_schedule_create_wo')");
    }
  } finally {
    connection.release();
  }
}

export async function removeSchedule(id: number): Promise<boolean> {
  try {
    await transaction(async (connection) => {
      await connection.execute('DELETE FROM tb_schedule_header WHERE id=?', [id]);
      await connection.execute('DELETE FROM tbl_schedules_detail WHERE tbl_schedules_id=?', [id]);
    });
    return true;
  } catch {
    return false;
  }
}

export async function getAssetCustomDetailScheduleRows(assetCode: string): Promise<Record<string, unknown>[]> {
  if (!assetCode) return [];
  if (!(await hasColumn('asset_custom_details', 'part_mesin'))) return [];
  const hasRowOrder = await hasColumn('asset_custom_details', 'row_order');
  const items = await rows<Record<string, unknown>>(
    `SELECT id, bagian, bagian_mesin, part_mesin, kondisi, durasi_pengecekan, pic
     FROM asset_custom_details
     WHERE asset_code = ? AND part_mesin IS NOT NULL AND TRIM(part_mesin) <> ''
     ORDER BY ${hasRowOrder ? 'row_order' : 'id'} ASC`,
    [assetCode],
  );
  const out: Record<string, unknown>[] = [];
  for (const row of items) {
    const partMesin = String(row.part_mesin ?? '').trim();
    if (!partMesin) continue;
    const categories = extractMaintenanceCategoriesFromText(row.pic);
    out.push({
      custom_detail_id: Number(row.id),
      bagian: row.bagian ?? '',
      bagian_mesin: row.bagian_mesin ?? '',
      part_mesin: partMesin,
      kondisi: row.kondisi ?? '',
      durasi_pengecekan: String(row.durasi_pengecekan ?? '').trim(),
      type_schedule: normalizeCustomDetailScheduleType(row.durasi_pengecekan),
      pic: String(row.pic ?? '').trim(),
      category_maintenance: categories[0] ?? '',
    });
  }
  return out;
}

export async function rebuildScheduleDetailsFromCustomDetails(scheduleId: number, actor: string): Promise<{ success: boolean; message: string; schedule_id?: number; asset_code?: string; backup_rows?: number; inserted_rows?: number; unscheduled_rows?: number }> {
  if (scheduleId <= 0) return { success: false, message: 'Schedule tidak ditemukan.' };
  const header = await one<ScheduleHeader>('SELECT * FROM tb_schedule_header WHERE id=?', [scheduleId]);
  if (!header || !header.AssetCode) return { success: false, message: 'Schedule tidak ditemukan.' };

  const customRows = await getAssetCustomDetailScheduleRows(header.AssetCode);
  if (!customRows.length) return { success: false, message: 'Custom Detail asset tidak ditemukan.' };

  try {
    return await transaction(async (connection) => {
      const existing = await rows<ScheduleDetail>('SELECT * FROM tbl_schedules_detail WHERE tbl_schedules_id=? ORDER BY id ASC', [scheduleId]);
      const first = existing[0];
      const defaults = {
        startDate: first?.start_date ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
        lastUpdate: first?.last_update ?? null,
        division: Number(first?.id_division ?? 0),
        company: first?.company ?? header.CompanyName ?? '',
        executor: first?.executor ?? 'MTC',
        pause: first?.is_pause ?? 'started',
        shift: first?.shift ?? 'regular',
        typeWo: first?.type_wo ?? 'PREV MAINTENANCE',
      };

      await connection.execute(
        "INSERT INTO tbl_schedules_detail_repair_backup (schedule_id, asset_code, created_at, created_by, detail_snapshot) VALUES (?,?,NOW(),?,?)",
        [scheduleId, header.AssetCode, String(actor || 'system repair').slice(0, 100), JSON.stringify(existing)],
      );

      await connection.execute('DELETE FROM tbl_schedules_detail WHERE tbl_schedules_id=?', [scheduleId]);

      let inserted = 0;
      let unscheduled = 0;
      for (const customRow of customRows) {
        const part = String(customRow.part_mesin ?? '').trim();
        if (!part) throw new Error('Ada Custom Detail tanpa nama part; repair dibatalkan.');
        const type = scheduleTypeToStorageValue(customRow.type_schedule);
        const isUnscheduled = type === '';
        const logicalType = normalizeCustomDetailScheduleType(type);
        const chooseDay = logicalType === 'mingguan' ? 'saturday' : null;

        await connection.execute(
          `INSERT INTO tbl_schedules_detail (tbl_schedules_id, asset_custom_detail_id, id_division, creator, company, shift, job_title, part_mesin, job_requirement, running_hours, type_schedule, choose_day, type_wo, is_pause, last_update, executor, start_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [scheduleId, Number(customRow.custom_detail_id ?? 0), defaults.division, String(actor || 'system repair').slice(0, 255), defaults.company,
            defaults.shift, `Pengecekan ${part}`, part, String(customRow.kondisi ?? '').trim() || `Pengecekan kondisi ${part}`, '0',
            type, chooseDay, defaults.typeWo, defaults.pause, defaults.lastUpdate, defaults.executor, defaults.startDate] as never,
        );
        inserted++;
        if (isUnscheduled) unscheduled++;
      }

      return {
        success: true,
        message: `Detail schedule berhasil dibangun ulang.${unscheduled > 0 ? ` ${unscheduled} part tetap Tanpa Jadwal.` : ''}`,
        schedule_id: scheduleId, asset_code: header.AssetCode, backup_rows: existing.length, inserted_rows: inserted, unscheduled_rows: unscheduled,
      };
    });
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Transaksi repair gagal.' };
  }
}
