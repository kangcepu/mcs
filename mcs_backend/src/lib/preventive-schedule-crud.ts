import { execute, one, rows } from '../db.js';

function storageTypeForSave(value: unknown): string {
  let raw = String(value ?? '').toLowerCase().trim();
  raw = raw.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (raw === '' || raw === 'harian' || raw === 'day' || raw.includes('daily') || raw.includes('1 hari')) return 'harian';
  if (raw.includes('3 bulan') || raw.includes('3 month') || raw.includes('quarter')) return '3 bulan';
  if (raw.includes('6 bulan') || raw.includes('6 month') || raw.includes('semi')) return '6 bulan';
  if (raw === 'tahunan' || raw === 'year' || raw.includes('yearly') || raw.includes('annual') || raw.includes('1 tahun') || raw.includes('1 year')) return '1 tahun';
  if (raw === 'bulanan' || raw === 'month' || raw.includes('monthly') || raw.includes('1 bulan') || raw.includes('1 month')) return '1 bulan';
  if (raw === 'mingguan' || raw === 'week' || raw.includes('weekly') || raw.includes('minggu') || raw.includes('week')) return '1 minggu';
  return 'harian';
}

interface Actor { id_division?: string | number; fullname?: string; username?: string }

export interface ScheduleDetailInput {
  id_division?: number | string;
  creator?: string;
  company?: string;
  shift?: string;
  job_title?: string;
  job_requirement?: string;
  running_hours?: string;
  type_schedule?: string;
  choose_day?: string | null;
  type_wo?: string;
  is_pause?: string;
  executor?: string | null;
  start_date?: string;
  part_mesin?: string;
  asset_custom_detail_id?: number;
}

function detailFields(scheduleId: number, d: ScheduleDetailInput): Record<string, unknown> {
  const part = String(d.part_mesin ?? '');
  return {
    tbl_schedules_id: scheduleId,
    id_division: d.id_division,
    creator: d.creator ?? 'api v2',
    company: d.company ?? '',
    shift: d.shift ?? 'regular',
    job_title: String(d.job_title ?? '').trim() !== '' ? d.job_title : `Pengecekan ${part}`,
    job_requirement: d.job_requirement ?? '',
    running_hours: d.running_hours ?? '0',
    type_schedule: storageTypeForSave(d.type_schedule ?? 'harian'),
    choose_day: d.choose_day ?? null,
    type_wo: d.type_wo ?? 'PREV MAINTENANCE',
    is_pause: d.is_pause ?? 'started',
    last_update: new Date().toISOString().slice(0, 19).replace('T', ' '),
    executor: d.executor ?? null,
    start_date: d.start_date ?? new Date().toISOString().slice(0, 10),
    part_mesin: part,
    asset_custom_detail_id: d.asset_custom_detail_id ?? 0,
  };
}

function headerFields(data: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['AssetID', 'AssetCode', 'CompanyName', 'towo', 'is_schedule_check', 'type_schedule', 'choose_day'];
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in data) out[key] = data[key];
  return out;
}

async function detailCount(id: number): Promise<number> {
  const row = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tbl_schedules_detail WHERE tbl_schedules_id=?', [id]);
  return Number(row?.total ?? 0);
}

async function hasActiveSchedule(assetCode: string, excludeId: number): Promise<boolean> {
  const code = assetCode.trim();
  if (!code) return false;
  let sql = `SELECT COUNT(*) AS total FROM tb_schedule_header h WHERE h.AssetCode=? AND EXISTS (SELECT 1 FROM tbl_schedules_detail sd WHERE sd.tbl_schedules_id=h.id AND sd.is_pause='started')`;
  const params: unknown[] = [code];
  if (excludeId > 0) { sql += ' AND h.id != ?'; params.push(excludeId); }
  const row = await one<{ total: number }>(sql, params);
  return Number(row?.total ?? 0) > 0;
}

async function missingCustomDetailParts(assetCode: string, details: ScheduleDetailInput[]): Promise<string[]> {
  const code = assetCode.trim();
  if (!code) return [];
  const custom = await rows<{ part_mesin: string }>(
    "SELECT part_mesin FROM asset_custom_details WHERE asset_code=? AND part_mesin IS NOT NULL AND TRIM(part_mesin) <> '' GROUP BY part_mesin ORDER BY part_mesin ASC",
    [code],
  );
  if (!custom.length) return [];
  const norm = (p: unknown) => String(p ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const scheduled = new Set(details.map((d) => norm(d.part_mesin)).filter(Boolean));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const row of custom) {
    const key = norm(row.part_mesin);
    if (key && !scheduled.has(key) && !seen.has(key)) { missing.push(String(row.part_mesin).trim()); seen.add(key); }
  }
  return missing;
}

function validTrigger(d: ScheduleDetailInput): boolean {
  const type = String(d.type_schedule ?? '').toLowerCase().trim();
  const day = String(d.choose_day ?? '').trim().toLowerCase();
  if (['week', '1 minggu', 'mingguan'].includes(type)) {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(day);
  }
  if (['month', 'monthly', '1 bulan', 'bulanan', '3 bulan', '6 bulan', '1 tahun', 'yearly'].includes(type)) {
    return /^\d{1,2}$/.test(day) && Number(day) >= 1 && Number(day) <= 31;
  }
  return true;
}

async function hasScheduleDivisionUser(divisionId: number): Promise<boolean> {
  const row = await one<{ total: number }>('SELECT COUNT(*) AS total FROM tb_user WHERE id_division=?', [divisionId]);
  return Number(row?.total ?? 0) > 0;
}

async function generationStatus(header: Record<string, unknown>, details: Record<string, unknown>[]): Promise<Record<string, unknown>> {
  const activeIds = details
    .filter((d) => String(d.is_pause ?? 'started').toLowerCase().trim() === 'started')
    .map((d) => Number(d.id ?? 0))
    .filter((id) => id > 0);

  const target = String(header.towo ?? '').toLowerCase().trim();
  const tables: Record<string, string> = { wo_mtc: 'tb_wo_meso_detail', wo_mtc_operational: 'tb_wo_mtc_operational_detail', wo_preventive: 'tb_wo_preventive_detail' };
  const table = tables[target];

  const generatedIds = new Set<number>();
  const woNumbers = new Set<string>();
  if (table && activeIds.length) {
    const detailRows = await rows<{ schedule_detail_id: number; wo_number: string }>(
      `SELECT schedule_detail_id, wo_number FROM ${table} WHERE schedule_detail_id IN (${activeIds.map(() => '?').join(',')})`,
      activeIds,
    ).catch(() => []);
    for (const row of detailRows) {
      if (row.schedule_detail_id > 0) generatedIds.add(row.schedule_detail_id);
      const wo = String(row.wo_number ?? '').trim();
      if (wo) woNumbers.add(wo);
    }
  }

  const activeCount = activeIds.length;
  const generatedCount = generatedIds.size;
  return {
    active_detail_count: activeCount,
    generated_detail_count: generatedCount,
    missing_detail_count: Math.max(0, activeCount - generatedCount),
    has_generated_work_order: generatedCount > 0,
    initial_generation_complete: activeCount > 0 && generatedCount === activeCount,
    work_order_numbers: [...woNumbers],
  };
}

async function getRepairStatus(id: number): Promise<Record<string, unknown> | null> {
  const header = await one<{ AssetCode: string }>('SELECT AssetCode FROM tb_schedule_header WHERE id=?', [id]);
  if (!header) return null;
  const customTotal = await one<{ total: number }>('SELECT COUNT(*) AS total FROM asset_custom_details WHERE asset_code=?', [header.AssetCode]);
  return { custom_detail_total: Number(customTotal?.total ?? 0), schedule_detail_total: await detailCount(id) };
}

export async function getList(filters: { q?: string; company?: string; towo?: string; page?: string | number; per_page?: string | number }): Promise<{ data: Record<string, unknown>[]; meta: Record<string, unknown> }> {
  const page = Math.max(1, Number(filters.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Number(filters.per_page ?? 25)));
  const q = String(filters.q ?? '').trim();

  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.company) { where.push('h.CompanyName = ?'); params.push(filters.company); }
  if (filters.towo) { where.push('h.towo = ?'); params.push(filters.towo); }
  if (q) { where.push('(h.AssetCode LIKE ? OR a.AssetName LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM tb_schedule_header h LEFT JOIN asset a ON a.AssetCode=h.AssetCode ${whereSql}`, params);
  const total = Number(totalRow?.total ?? 0);

  const data = await rows<Record<string, unknown>>(
    `SELECT h.*, a.AssetName FROM tb_schedule_header h LEFT JOIN asset a ON a.AssetCode=h.AssetCode ${whereSql} ORDER BY h.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  for (const row of data) row.detail_count = await detailCount(Number(row.id));

  return { data, meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function getDetail(id: number): Promise<Record<string, unknown> | null> {
  const header = await one<Record<string, unknown>>('SELECT * FROM tb_schedule_header WHERE id=?', [id]);
  if (!header) return null;
  const details = await rows<Record<string, unknown>>('SELECT * FROM tbl_schedules_detail WHERE tbl_schedules_id=? ORDER BY id ASC', [id]);
  return {
    header, details,
    repair_status: await getRepairStatus(id),
    generation_status: await generationStatus(header, details),
  };
}

export async function save(id: number, payload: Record<string, unknown>, actor: Actor): Promise<{ ok: boolean; message?: string; not_found?: boolean; data?: Record<string, unknown> }> {
  const creating = id <= 0;
  const details = Array.isArray(payload.details) ? (payload.details as ScheduleDetailInput[]) : [];
  if (!details.length) return { ok: false, message: 'details is required and cannot be empty' };

  const actorDivisionId = Number(actor.id_division ?? 0);
  for (const detail of details) {
    let divisionId = Number(detail.id_division ?? 0);
    if (divisionId <= 0) divisionId = actorDivisionId;
    if (divisionId <= 0 || !(await hasScheduleDivisionUser(divisionId))) {
      return { ok: false, message: 'Setiap detail schedule harus memiliki divisi yang aktif untuk membuat Work Order.' };
    }
    detail.id_division = divisionId;
  }

  const header = creating ? null : await one<Record<string, unknown>>('SELECT * FROM tb_schedule_header WHERE id=?', [id]);
  if (!creating && !header) return { ok: false, not_found: true, message: 'Schedule not found' };

  const assetCode = String(creating ? (payload.asset_code ?? '') : (header?.AssetCode ?? '')).trim();
  if (creating && (assetCode === '' || !payload.asset_id || !payload.company_name || !payload.towo)) {
    return { ok: false, message: 'asset_code, asset_id, company_name, and towo are required' };
  }

  if (await hasActiveSchedule(assetCode, creating ? 0 : id)) {
    return { ok: false, message: `Asset ${assetCode} sudah punya schedule aktif. 1 asset tidak boleh memiliki 2 schedule aktif.` };
  }

  for (const detail of details) {
    if (String(detail.part_mesin ?? '').trim() === '') return { ok: false, message: 'Every schedule detail requires part_mesin' };
    if (!validTrigger(detail)) return { ok: false, message: 'Schedule trigger is invalid: weekly needs weekday; monthly/3-month/6-month/yearly needs date' };
  }

  const missing = await missingCustomDetailParts(assetCode, details);
  if (missing.length) {
    let preview = missing.slice(0, 10).join(', ');
    if (missing.length > 10) preview += ', ...';
    return { ok: false, message: `Semua part Custom Detail wajib dijadwalkan. Masih ada ${missing.length} part belum dibuat: ${preview}` };
  }

  let finalId = id;
  if (creating) {
    const data = headerFields({
      AssetID: payload.asset_id, AssetCode: assetCode, CompanyName: payload.company_name, towo: payload.towo,
      is_schedule_check: payload.is_schedule_check ?? 0, type_schedule: payload.type_schedule ?? null, choose_day: payload.choose_day ?? null,
    });
    const keys = Object.keys(data);
    const result = await execute(`INSERT INTO tb_schedule_header (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
    finalId = result.insertId;
  } else {
    const data = headerFields({
      CompanyName: payload.company_name ?? header?.CompanyName, towo: payload.towo ?? header?.towo,
      is_schedule_check: payload.is_schedule_check ?? (header?.is_schedule_check ?? 0),
      type_schedule: payload.type_schedule ?? (header?.type_schedule ?? null), choose_day: payload.choose_day ?? (header?.choose_day ?? null),
    });
    const keys = Object.keys(data);
    await execute(`UPDATE tb_schedule_header SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id=?`, [...keys.map((k) => data[k]), finalId]);
    await execute('DELETE FROM tbl_schedules_detail WHERE tbl_schedules_id=?', [finalId]);
  }

  for (const detail of details) {
    const fields = detailFields(finalId, detail);
    const keys = Object.keys(fields);
    await execute(`INSERT INTO tbl_schedules_detail (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => fields[k]));
  }

  return { ok: true, data: (await getDetail(finalId)) ?? {} };
}

export async function setPause(detailId: number, pause: boolean): Promise<{ ok: boolean; not_found?: boolean; message?: string; data?: Record<string, unknown> }> {
  const row = await one('SELECT id FROM tbl_schedules_detail WHERE id=?', [detailId]);
  if (!row) return { ok: false, not_found: true, message: 'Schedule detail not found' };
  const value = pause ? 'paused' : 'started';
  await execute('UPDATE tbl_schedules_detail SET is_pause=?, last_update=NOW() WHERE id=?', [value, detailId]);
  return { ok: true, data: { id: detailId, is_pause: value } };
}

export async function fillMissingDetailDivisions(scheduleId: number, actor: Actor): Promise<{ ok: boolean; message?: string; updated?: number }> {
  const divisionId = Number(actor.id_division ?? 0);
  if (divisionId <= 0 || !(await hasScheduleDivisionUser(divisionId))) {
    return { ok: false, message: 'Divisi akun Anda tidak dapat dipakai untuk membuat Work Order.' };
  }
  const result = await execute(
    "UPDATE tbl_schedules_detail SET id_division=? WHERE tbl_schedules_id=? AND (id_division IS NULL OR id_division=0)",
    [divisionId, scheduleId],
  );
  return { ok: true, updated: result.affectedRows };
}

export async function calendar(year: unknown): Promise<Record<string, unknown>[]> {
  let y = Number(year);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) y = new Date().getFullYear();
  return rows(
    "SELECT * FROM tb_work_calendar WHERE calendar_date >= ? AND calendar_date <= ? AND is_active = 1 ORDER BY calendar_date ASC",
    [`${y}-01-01`, `${y}-12-31`],
  );
}
