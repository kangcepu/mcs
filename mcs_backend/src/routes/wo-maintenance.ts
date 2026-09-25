import { buildCustomDetailMap } from '../lib/preventive-parts.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../auth.js';
import { config } from '../config.js';
import { execute, one, rows, transaction } from '../db.js';
import { asyncHandler, HttpError, legacyOk } from '../http.js';
import { syncDailyControlForWoUpdate } from '../lib/daily-control.js';
import { saveUploadedFile } from '../lib/storage.js';
import type { AuthRequest, User } from '../types.js';

export const maintenanceRouter = Router();

const DOCS_DIR = path.join(config.uploadDir, 'wo_operational');
const PART_EXECUTION_DOCS_DIR = path.join(config.uploadDir, 'wo_operational_part_execution');
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.mkdirSync(PART_EXECUTION_DOCS_DIR, { recursive: true });

function extensionFilter(allowed: string[]) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, allowed.includes(ext));
  };
}

const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'pdf']) });
const partExecutionMediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi', 'mkv', 'webm']) });
const servicePhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 10 }, fileFilter: extensionFilter(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'mp4', 'mov', 'avi', 'mkv', 'webm']) });

function randomCode(length = 10): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function personPayload(user: User) {
  return {
    fullname: String(user.fullname ?? ''),
    avatar: String(user.avatar ?? 'avatar.png'),
    id_division: user.id_division,
    id_position: String(user.id_position ?? ''),
    division_code: String(user.division_code ?? ''),
  };
}

async function insertApprovalOperational(woNumber: string, person: ReturnType<typeof personPayload>, comment: string): Promise<void> {
  await execute(
    'INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment],
  );
}

let mtcDivisionIdCache: string | null = null;
async function getMtcDivisionId(): Promise<string> {
  if (mtcDivisionIdCache) return mtcDivisionIdCache;
  const row = await one<{ id_division: string }>("SELECT id_division FROM tb_division WHERE division_code='MTC' LIMIT 1", []);
  mtcDivisionIdCache = String(row?.id_division ?? '15');
  return mtcDivisionIdCache;
}

function visibilityScope(user: User, tableAlias: string, mtcDivisionId: string): { sql: string; params: unknown[] } {
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const position = String(user.id_position ?? '').toUpperCase();
  if (crossAccess || !position) return { sql: '', params: [] };
  if (position === 'EXECUTOR_ADMIN' || position === 'EXECUTOR_HEAD') {
    return { sql: `${tableAlias}.job_executor LIKE ?`, params: [`%${user.division_code ?? ''}%`] };
  }
  if (position === 'ADMIN_DIVISI' || position === 'DIVHEAD') {
    if (String(user.id_division ?? '') === mtcDivisionId) return { sql: '', params: [] };
    return { sql: `${tableAlias}.id_division = ?`, params: [user.id_division] };
  }
  return { sql: '', params: [] };
}

const AREA_FLAG_MAP: Record<string, string> = {
  mtc_area_gsu_wnb: 'GSU_WNB',
  mtc_area_gsu_inject: 'GSU_INJECT',
  mtc_area_ru_sawmill: 'RU_SAWMILL',
  mtc_area_ru_production: 'RU_PRODUCTION',
};

function getAllowedAssetAreas(user: User): string[] {
  if (Number(user.wo_cross_access ?? 0) === 1) return [];
  const areas: string[] = [];
  for (const [field, area] of Object.entries(AREA_FLAG_MAP)) if (Number(user[field] ?? 0) === 1) areas.push(area);
  return areas;
}

function assetAreaScopeSql(areas: string[], assetAlias: string): { sql: string; params: unknown[] } {
  if (!areas.length) return { sql: '', params: [] };
  return { sql: `${assetAlias}.mtc_area_key IN (${areas.map(() => '?').join(',')})`, params: areas };
}

async function validateAssetAreaAccess(idEquipment: string | null, areas: string[]): Promise<boolean> {
  if (!areas.length) return true;
  if (!idEquipment) return false;
  const asset = await one<{ mtc_area_key: string | null }>('SELECT mtc_area_key FROM asset WHERE AssetID=? OR AssetCode=?', [idEquipment, idEquipment]);
  if (!asset) return false;
  return areas.includes(String(asset.mtc_area_key ?? ''));
}

const CATEGORY_FLAG_MAP: Record<string, string> = {
  wo_category_general: 'general',
  wo_category_electrical: 'electrical',
  wo_category_mould: 'mould',
};

function getUserCategories(user: User): string[] {
  const categories: string[] = [];
  for (const [field, category] of Object.entries(CATEGORY_FLAG_MAP)) if (Number(user[field] ?? 0) === 1) categories.push(category);
  return categories;
}

async function generateWoNumber(divisionCode: string): Promise<string> {
  const now = new Date();
  const base = `WOPR-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
  const row = await one<{ seq: number | null }>(
    'SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM tb_wo_mtc_operational WHERE wo_number LIKE ?',
    [`${base}/%`],
  );
  const next = Number(row?.seq ?? 0) + 1;
  return `${base}/${String(next).padStart(4, '0')}`;
}

async function getHeader(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>('SELECT * FROM tb_wo_mtc_operational WHERE wo_number=?', [woNumber]);
}

const FINAL_STATUSES = new Set(['CLOSED', 'VOID', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'DECLINE', 'REJECT']);
function isFinalWoStatus(status: unknown): boolean {
  return FINAL_STATUSES.has(String(status ?? '').toUpperCase().trim());
}

async function rejectIfFinal(woNumber: string): Promise<Record<string, unknown>> {
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (isFinalWoStatus(header.status)) throw new HttpError(409, 'Work Order sudah final dan tidak dapat diubah');
  return header;
}

const PREVENTIVE_TYPES = new Set(['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM']);
function isPreventiveType(typeWo: unknown): boolean {
  return PREVENTIVE_TYPES.has(String(typeWo ?? '').toUpperCase());
}

function normalizeTypeWo(value: unknown): string {
  const upper = String(value ?? '').toUpperCase();
  if (PREVENTIVE_TYPES.has(upper)) return 'preventive';
  if (['CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'].includes(upper)) return 'corrective';
  if (['BREAKDOWN', 'BM'].includes(upper)) return 'breakdown';
  if (upper === 'PROJECT') return 'project';
  return String(value ?? '').toLowerCase();
}

function normalizeTypeWoForWrite(value: unknown): string {
  const upper = String(value ?? '').toUpperCase().trim();
  if (upper === 'PM' || upper === 'PREVENTIVE') return 'preventive';
  if (upper === 'CM' || upper === 'CORRECTIVE') return 'corrective';
  if (upper === 'BM' || upper === 'BREAKDOWN') return 'breakdown';
  return String(value ?? '').trim();
}

function getTypeWoAliases(value: string): string[] {
  const normalized = normalizeTypeWo(value);
  switch (normalized) {
    case 'preventive': return ['preventive', 'PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM'];
    case 'corrective': return ['corrective', 'CORRECTIVE', 'CORRECTIVE MAINTENANCE', 'CM'];
    case 'project': return ['project', 'PROJECT'];
    case 'breakdown': return ['breakdown', 'BREAKDOWN', 'BM'];
    default: { const raw = String(value ?? '').trim(); return raw ? [raw] : []; }
  }
}

async function getServicePhotos(woNumber: string): Promise<Record<string, unknown>[]> {
  const evidenceRows = await rows<Record<string, unknown>>(
    'SELECT file_name, file_path, created_at FROM tb_wo_service_evidence WHERE wo_number=? ORDER BY created_at DESC',
    [woNumber],
  );
  return evidenceRows.map((r) => ({ name: r.file_name, path: r.file_path, url: `/uploads/${String(r.file_path)}`, created_at: r.created_at }));
}

async function getExecutors(woNumber: string): Promise<Record<string, unknown>[]> {
  return rows<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE wo_number=? ORDER BY id ASC', [woNumber]);
}

async function getExecutorByDivision(woNumber: string, divisionCode: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE wo_number=? AND job_executor=? ORDER BY id ASC LIMIT 1', [woNumber, divisionCode]);
}

async function getFallbackExecutorForUpdate(woNumber: string): Promise<Record<string, unknown> | null> {
  return one<Record<string, unknown>>(
    "SELECT * FROM tb_job_executor WHERE wo_number=? AND (status='WAITING' OR status='IN_PROGRESS') ORDER BY id DESC LIMIT 1",
    [woNumber],
  );
}

async function getAllowedLaborUsernames(idDivision: unknown): Promise<string[]> {
  const list = await rows<{ fullname: string }>('SELECT fullname FROM tb_user WHERE id_division=? AND active=1', [idDivision]);
  return list.map((r) => r.fullname);
}

async function saveLaborFromJobUpdate(woNumber: string, jobExecutor: string, body: Record<string, unknown>, allowedUsernames: string[]): Promise<number> {
  const raw = body.labor;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const allowed = new Set(allowedUsernames);
  const pics = [...new Set(list.map((v) => String(v).trim()).filter((v) => v && (!allowed.size || allowed.has(v))))].slice(0, 20);
  if (!pics.length) return 0;
  const men = String(Math.max(1, Number(body.labor_men ?? 1)));
  const hours = String(Math.max(0, Number(body.labor_hours ?? 1)));
  await transaction(async (connection) => {
    for (const pic of pics) {
      await connection.execute('INSERT INTO tb_detail_labor (job_executor, wo_number, trade, men, hours, `for`) VALUES (?,?,?,?,?,?)', [jobExecutor, woNumber, pic, men, hours, 'MTC']);
    }
  });
  return pics.length;
}

async function decodeBase64Attachments(input: unknown, prefix: string): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const saved: string[] = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const base64 = String(record.base64 ?? '');
    const filename = String(record.filename ?? `file-${index}`);
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    const raw = match ? match[2] : base64;
    if (!raw) continue;
    const ext = path.extname(filename) || '.bin';
    const safeName = `${prefix}-${index}${ext}`;
    const contentType = match ? match[1] : undefined;
    saved.push(await saveUploadedFile(Buffer.from(raw, 'base64'), 'wo_operational', safeName, contentType));
  }
  return saved;
}

function partKey(customDetailId: number, partMesin: string): string {
  return customDetailId > 0 ? `id:${customDetailId}` : `part:${partMesin.toLowerCase().trim()}`;
}

interface PreventivePartDefinition { custom_detail_id: number; part_mesin: string; bagian_mesin: string | null }

function scheduleFamily(value: unknown): string {
  const v = String(value ?? '').toLowerCase().trim();
  if (!v) return '';
  if (['day', 'daily', 'harian'].includes(v)) return 'daily';
  if (v.includes('minggu') || v.includes('week')) return 'weekly';
  if (v.includes('bulan') || v.includes('month')) return 'monthly';
  if (v.includes('tahun') || v.includes('year') || v.includes('annual')) return 'yearly';
  return '';
}

function normalizePartKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function getPreventivePartDefinitions(woNumber: string, assetCode: string): Promise<PreventivePartDefinition[]> {
  const scheduleRows = await rows<Record<string, unknown>>('SELECT id, job_title, part_mesin, type_schedule FROM tb_wo_mtc_operational_detail WHERE wo_number=? ORDER BY id ASC', [woNumber]);
  if (scheduleRows.length) {
    const anyPart = scheduleRows.some((r) => String(r.part_mesin ?? '').trim() !== '');
    if (!anyPart && assetCode) {
      const header = await getHeader(woNumber);
      let effective = scheduleFamily(header?.option_schedule);
      if (!effective) {
        const counts = new Map<string, number>();
        for (const r of scheduleRows) {
          const family = scheduleFamily(r.type_schedule);
          if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
        }
        effective = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      }
      if (effective) {
        const customRows = await rows<Record<string, unknown>>(
          "SELECT id, part_mesin, bagian_mesin, durasi_pengecekan FROM asset_custom_details WHERE asset_code=? AND part_mesin IS NOT NULL AND TRIM(part_mesin)<>'' ORDER BY row_order ASC, id ASC",
          [assetCode],
        );
        const synthetic = customRows
          .filter((r) => scheduleFamily(r.durasi_pengecekan) === effective)
          .map((r) => ({ custom_detail_id: Number(r.id), part_mesin: String(r.part_mesin).trim(), bagian_mesin: r.bagian_mesin ? String(r.bagian_mesin) : null }));
        if (synthetic.length) return synthetic;
      }
    }

    const seen = new Set<string>();
    const result: PreventivePartDefinition[] = [];
    for (const r of scheduleRows) {
      let part = String(r.part_mesin ?? '').trim();
      if (part) {
        const key = normalizePartKey(part);
        if (seen.has(key)) continue;
        seen.add(key);
      } else {
        part = String(r.job_title ?? '').replace(/^\s*pengecekan\s+/i, '').trim();
      }
      result.push({ custom_detail_id: Number(r.id), part_mesin: part, bagian_mesin: null });
    }
    return result;
  }
  if (!assetCode) return [];
  const customRows = await rows<Record<string, unknown>>(
    'SELECT id, part_mesin, bagian_mesin FROM asset_custom_details WHERE asset_code=? ORDER BY row_order ASC, id ASC',
    [assetCode],
  );
  return customRows.map((r) => ({ custom_detail_id: Number(r.id), part_mesin: String(r.part_mesin ?? ''), bagian_mesin: r.bagian_mesin ? String(r.bagian_mesin) : null }));
}

async function getPartExecution(woNumber: string, assetCode: string) {
  const definitions = await getPreventivePartDefinitions(woNumber, assetCode);
  const saved = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_operational_part_execution WHERE wo_number=?', [woNumber]);
  const savedByKey = new Map<string, Record<string, unknown>>();
  for (const row of saved) savedByKey.set(partKey(Number(row.custom_detail_id ?? 0), String(row.part_mesin ?? '')), row);

  const media = await rows<Record<string, unknown>>('SELECT * FROM tb_wo_operational_part_execution_media WHERE wo_number=? ORDER BY id DESC', [woNumber]);
  const mediaByKey = new Map<string, Record<string, unknown>[]>();
  for (const row of media) {
    const key = partKey(Number(row.custom_detail_id ?? 0), String(row.part_mesin ?? ''));
    const list = mediaByKey.get(key) ?? [];
    list.push({ id: row.id, custom_detail_id: row.custom_detail_id, part_mesin: row.part_mesin, media_type: row.media_type, name: row.media_name, path: row.media_path, url: `/uploads/${String(row.media_path)}`, created_by: row.created_by, created_at: row.created_at });
    mediaByKey.set(key, list);
  }

  const hasActivity = saved.some((r) => String(r.maintenance_status) === 'DONE' || Number(r.request_qty ?? 0) > 0 || String(r.keterangan ?? '').trim() !== '') || media.length > 0;

  const customDetails = await buildCustomDetailMap(assetCode);

  const result = definitions.map((def) => {
    const key = partKey(def.custom_detail_id, def.part_mesin);
    const savedRow = savedByKey.get(key);
    const reference = customDetails.get(def.part_mesin.toLowerCase().trim());
    return {
      custom_detail_id: def.custom_detail_id,
      part_mesin: def.part_mesin,
      bagian_mesin: def.bagian_mesin ?? (reference?.bagian_mesin || null),
      tampak_jauh: reference?.tampak_jauh ?? [],
      tampak_dekat: reference?.tampak_dekat ?? [],
      detail_part: reference?.detail_part ?? [],
      maintenance_status: savedRow?.maintenance_status ?? 'PENDING',
      request_qty: Number(savedRow?.request_qty ?? 0),
      request_part: savedRow?.request_part ?? def.part_mesin,
      request_uom: savedRow?.request_uom ?? 'PCS',
      keterangan: savedRow?.keterangan ?? '',
      execution_media: mediaByKey.get(key) ?? [],
    };
  });

  return { rows: result, hasActivity };
}

async function syncStatusFromPartExecution(woNumber: string, assetCode: string): Promise<void> {
  const header = await getHeader(woNumber);
  if (!header || String(header.status) !== 'WAIT_KA_DIV_MTC') return;
  const { hasActivity } = await getPartExecution(woNumber, assetCode);
  if (!hasActivity) return;
  await transaction(async (connection) => {
    await connection.execute("UPDATE tb_wo_mtc_operational SET status='IN_PROGRESS_EXECUTOR', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=? AND status='WAITING'", [woNumber]);
  });
}

interface PartExecutionUpsert {
  custom_detail_id: number;
  part_mesin: string;
  bagian_mesin: string | null;
  maintenance_status: string;
  request_qty: number;
  request_part: string;
  request_uom: string;
  keterangan: string;
}

async function upsertPartExecution(woNumber: string, row: PartExecutionUpsert, updatedBy: string): Promise<void> {
  const existing = row.custom_detail_id > 0
    ? await one<{ id: number }>('SELECT id FROM tb_wo_operational_part_execution WHERE wo_number=? AND custom_detail_id=?', [woNumber, row.custom_detail_id])
    : await one<{ id: number }>('SELECT id FROM tb_wo_operational_part_execution WHERE wo_number=? AND part_mesin=? AND custom_detail_id IS NULL', [woNumber, row.part_mesin]);

  if (existing) {
    await execute(
      'UPDATE tb_wo_operational_part_execution SET bagian_mesin=?, maintenance_status=?, request_qty=?, request_part=?, request_uom=?, keterangan=?, updated_by=?, updated_at=NOW() WHERE id=?',
      [row.bagian_mesin, row.maintenance_status, row.request_qty, row.request_part, row.request_uom, row.keterangan, updatedBy, existing.id],
    );
  } else {
    await execute(
      'INSERT INTO tb_wo_operational_part_execution (wo_number, custom_detail_id, part_mesin, bagian_mesin, maintenance_status, request_qty, request_part, request_uom, keterangan, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
      [woNumber, row.custom_detail_id || null, row.part_mesin, row.bagian_mesin, row.maintenance_status, row.request_qty, row.request_part, row.request_uom, row.keterangan, updatedBy],
    );
  }
}

async function validatePreventiveCompletion(woNumber: string, assetCode: string): Promise<{ ok: boolean; message?: string }> {
  const { rows: parts } = await getPartExecution(woNumber, assetCode);
  if (!parts.length) return { ok: false, message: 'Part preventive belum tersedia.' };
  const pending = parts.filter((p) => String(p.maintenance_status) !== 'DONE');
  if (pending.length) {
    const names = pending.slice(0, 5).map((p) => p.part_mesin).join(', ');
    const remaining = pending.length > 5 ? ` dan ${pending.length - 5} lainnya` : '';
    return { ok: false, message: `Masih ada part preventive yang belum selesai: ${names}${remaining}.` };
  }
  return { ok: true };
}

async function syncMaterialRequestFromMobile(woNumber: string, material: string, qty: number, unitInput: string | null, jobExecutor: string, user: User): Promise<void> {
  if (!woNumber || !material || qty <= 0) return;
  const unit = unitInput?.trim() || 'PCS';
  const executor = jobExecutor || '-';
  const existingUsage = await one<{ id: number; request_code: string }>(
    "SELECT id, request_code FROM tb_material_usage WHERE wo_number=? AND job_executor=? AND status='OPEN' ORDER BY id DESC LIMIT 1",
    [woNumber, executor],
  );
  let requestCode = existingUsage?.request_code ?? '';

  if (!requestCode) {
    const header = await getHeader(woNumber);
    if (!header) return;
    requestCode = randomCode(10);
    const person = personPayload(user);
    await transaction(async (connection) => {
      await connection.execute(
        'INSERT INTO tb_material_usage (wo_number, date, id_equipment, company, job_title, type_wo, id_division, job_executor, status, request_code, created_at) VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,NOW())',
        [woNumber, header.id_equipment, header.company, header.job_title, header.type_wo, header.id_division, executor, 'OPEN', requestCode] as never,
      );
      await connection.execute("UPDATE tb_wo_mtc_operational SET status='WAITING_PARTS', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
      await connection.execute("UPDATE tb_job_executor SET status='IN_PROGRESS' WHERE wo_number=?", [woNumber]);
      await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
        [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, 'Executor Request Material.']);
    });
  }

  const existingRequest = await one<{ id: number; material_request: string }>(
    'SELECT id, material_request FROM tb_material_request WHERE wo_number=? AND request_code=? AND job_executor=? AND part=? ORDER BY id DESC LIMIT 1',
    [woNumber, requestCode, executor, material],
  );
  if (existingRequest) {
    const newQty = Number(existingRequest.material_request ?? 0) + qty;
    await execute('UPDATE tb_material_request SET material_request=?, uom_request=? WHERE id=?', [String(newQty), unit, existingRequest.id]);
    return;
  }
  await execute(
    'INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date) VALUES (?,?,?,?,?,?,?,?)',
    [woNumber, 'mobile_request', material, String(qty), unit, executor, requestCode, new Date().toISOString().slice(0, 19).replace('T', ' ')],
  );
}

interface VoidSourceConfig { table: string; approvalTable: string; approvalColumns: 'operational' | 'standard' }

const VOID_SOURCE_TABLES: VoidSourceConfig[] = [
  { table: 'tb_wo_mtc_operational', approvalTable: 'tb_approval_operational', approvalColumns: 'operational' },
  { table: 'tb_wo_mtc', approvalTable: 'tb_approval', approvalColumns: 'standard' },
  { table: 'tb_wo_it', approvalTable: 'tb_approval', approvalColumns: 'standard' },
  { table: 'tb_wo_ga', approvalTable: 'tb_approval', approvalColumns: 'standard' },
  { table: 'tb_wo_preventive', approvalTable: 'tb_approval', approvalColumns: 'standard' },
];

const VOID_TERMINAL_STATUSES = ['VOID', 'CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'DECLINE'];

async function getVoidEligibleFromTable(config: VoidSourceConfig, woNumber?: string): Promise<Record<string, unknown>[]> {
  let sql = `SELECT wo.wo_number, wo.job_title, wo.finished_planner, wo.created_at, wo.status, wo.job_executor,
      asset.AssetName AS asset_name, division.division_name, '${config.table}' AS source_table
    FROM \`${config.table}\` wo
    LEFT JOIN asset ON asset.AssetID = wo.id_equipment
    LEFT JOIN tb_division division ON division.id_division = wo.id_division
    WHERE UPPER(TRIM(wo.type_wo)) IN ('PREVENTIVE','PREVENTIVE MAINTENANCE','PREV MAINTENANCE','PM')
    AND (wo.finished_planner IS NULL OR TRIM(wo.finished_planner) = '' OR DATE(wo.finished_planner) <= DATE_ADD(CURDATE(), INTERVAL 1 DAY))
    AND UPPER(TRIM(wo.status)) NOT IN (${VOID_TERMINAL_STATUSES.map(() => '?').join(',')})
    AND TRIM(IFNULL(wo.started_actual, '')) = ''
    AND TRIM(IFNULL(wo.finished_actual, '')) = ''
    AND TRIM(IFNULL(wo.job_explanation, '')) = ''
    AND NOT EXISTS (SELECT 1 FROM tb_detail_labor l WHERE l.wo_number=wo.wo_number)
    AND NOT EXISTS (SELECT 1 FROM tb_detail_material m WHERE m.wo_number=wo.wo_number)`;
  const params: unknown[] = [...VOID_TERMINAL_STATUSES];
  if (config.table === 'tb_wo_mtc_operational') {
    sql += ` AND NOT EXISTS (SELECT 1 FROM tb_wo_operational_part_execution pe WHERE pe.wo_number=wo.wo_number AND (pe.maintenance_status='DONE' OR IFNULL(pe.request_qty,0)>0 OR TRIM(IFNULL(pe.request_part,''))<>'' OR TRIM(IFNULL(pe.keterangan,''))<>''))
      AND NOT EXISTS (SELECT 1 FROM tb_wo_operational_part_execution_media pm WHERE pm.wo_number=wo.wo_number)`;
  }
  if (woNumber) { sql += ' AND wo.wo_number=?'; params.push(woNumber); }
  sql += ' ORDER BY (wo.finished_planner IS NULL), wo.finished_planner ASC, wo.created_at ASC';
  return rows<Record<string, unknown>>(sql, params);
}

async function getVoidEligiblePreventiveWo(woNumber?: string): Promise<Record<string, unknown>[]> {
  const all = await Promise.all(VOID_SOURCE_TABLES.map((config) => getVoidEligibleFromTable(config, woNumber)));
  return all.flat();
}

async function voidWoInSourceTable(config: VoidSourceConfig, woNumber: string, reason: string, person: ReturnType<typeof personPayload>): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute(`UPDATE \`${config.table}\` SET status='VOID', reason=?, pic='-', updated_at=NOW() WHERE wo_number=?`, [reason, woNumber]);
    await connection.execute(`INSERT INTO \`${config.approvalTable}\` (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())`,
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, reason]);
  });
}

async function getVoidHistoryByActionDate(): Promise<Record<string, unknown>[]> {
  const all = await Promise.all(VOID_SOURCE_TABLES.map((config) =>
    rows<{ action_date: string; count: number }>(
      `SELECT DATE(updated_at) AS action_date, COUNT(*) AS count FROM \`${config.table}\`
       WHERE status='VOID' AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(updated_at)`,
      [],
    ),
  ));
  const merged = new Map<string, number>();
  for (const set of all) for (const row of set) merged.set(row.action_date, (merged.get(row.action_date) ?? 0) + Number(row.count));
  return [...merged.entries()].map(([action_date, count]) => ({ action_date, count })).sort((a, b) => String(a.action_date).localeCompare(String(b.action_date)));
}

const MATERIAL_SERVICE_BASE = process.env.MATERIAL_SERVICE_URL ?? 'http://192.168.10.100:8989/microserviceLive/material';

function callMaterialService(pathSuffix: string, method: 'GET' | 'POST', query: Record<string, string>, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(`${MATERIAL_SERVICE_BASE.replace(/\/+$/, '')}/${pathSuffix.replace(/^\/+/, '')}`);
    } catch {
      reject(new HttpError(502, 'Gagal mengambil data material: invalid service URL'));
      return;
    }
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (payload) headers['Content-Type'] = 'application/json';
    const request = http.request(target, { method, headers, timeout: 20000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) { reject(new HttpError(502, `Gagal mengambil data material: HTTP ${status}`)); return; }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new HttpError(502, 'Gagal mengambil data material: invalid response'));
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', (err) => reject(new HttpError(502, `Gagal mengambil data material: ${err.message}`)));
    if (payload) request.write(payload);
    request.end();
  });
}

maintenanceRouter.use('/maintenance', authenticate, (req, res, next) => {
  if (req.method === 'GET') return next();
  const user = (req as AuthRequest).user!;
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const nativeAccess = Number(user.wo_operational ?? 0) === 1;
  if (crossAccess && !nativeAccess) throw new HttpError(403, 'Cross WO Access is read-only');
  next();
});

// `DECLINE` gak pernah beneran kesimpen di kolom status manapun — status
// tolak yang asli adalah `REJECT` (dicek langsung ke data). Tetap disertain
// `DECLINE` buat jaga-jaga tanpa menghapusnya.
const LIST_EXCLUDED_STATUSES = ['CLOSED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'COMPLETE EXECUTOR', 'NEED_CLOSED', 'VOID', 'DECLINE', 'REJECT'];

async function buildListQuery(user: User, mtcDivisionId: string, params0: { creatorOnly?: string; status?: string; search?: string; typeWo?: string; dateFrom?: string; dateTo?: string; company?: string; applyCategoryScope?: boolean }) {
  const scope = params0.creatorOnly ? { sql: 'w.creator = ?', params: [params0.creatorOnly] } : visibilityScope(user, 'w', mtcDivisionId);
  const areas = getAllowedAssetAreas(user);
  const areaScope = assetAreaScopeSql(areas, 'a');

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (scope.sql) { where += ` AND ${scope.sql}`; params.push(...scope.params); }
  if (areaScope.sql) { where += ` AND ${areaScope.sql}`; params.push(...areaScope.params); }
  // Exclusion cuma dipakai kalau user gak minta status spesifik — kalau
  // enggak, filter status='VOID' misalnya jadi kontradiktif sama exclusion
  // ini (NOT IN (...VOID...) AND ='VOID') dan selalu balikin 0 baris.
  if (params0.status) { where += ' AND w.status=?'; params.push(params0.status); }
  else { where += ` AND w.status NOT IN (${LIST_EXCLUDED_STATUSES.map(() => '?').join(',')})`; params.push(...LIST_EXCLUDED_STATUSES); }
  if (params0.search) { where += ' AND (w.wo_number LIKE ? OR w.job_title LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ?)'; params.push(...Array(4).fill(`%${params0.search}%`)); }
  if (params0.typeWo) {
    const aliases = getTypeWoAliases(params0.typeWo);
    if (aliases.length) { where += ` AND w.type_wo IN (${aliases.map(() => '?').join(',')})`; params.push(...aliases); }
  }
  if (params0.dateFrom) { where += ' AND w.date >= ?'; params.push(params0.dateFrom); }
  if (params0.dateTo) { where += ' AND w.date <= ?'; params.push(params0.dateTo); }
  if (params0.company) { where += ' AND w.company = ?'; params.push(params0.company); }
  if (params0.applyCategoryScope) {
    const categories = getUserCategories(user);
    if (categories.length) {
      where += ` AND (w.category_maintenance IN (${categories.map(() => '?').join(',')}) OR w.category_maintenance IS NULL OR w.category_maintenance='')`;
      params.push(...categories);
    }
  }
  return { where, params };
}

maintenanceRouter.get('/maintenance/list', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const mtcDivisionId = await getMtcDivisionId();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 10)));
  const sortOrder = String(req.query.sort_order ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const { where, params } = await buildListQuery(user, mtcDivisionId, {
    status: req.query.status ? String(req.query.status) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    typeWo: req.query.type_wo ? String(req.query.type_wo) : undefined,
    dateFrom: req.query.date_from ? String(req.query.date_from) : undefined,
    dateTo: req.query.date_to ? String(req.query.date_to) : undefined,
    company: req.query.company ? String(req.query.company) : undefined,
    applyCategoryScope: ['1', 'true'].includes(String(req.query.apply_category_scope ?? '')),
  });

  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_mtc_operational w LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}`, params);
  const items = await rows<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_mtc_operational w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}
     ORDER BY w.date ${sortOrder}, w.created_at ${sortOrder} LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  ).then((r) => r.map((row) => ({ ...row, type_wo: normalizeTypeWo(row.type_wo) })));

  const totalCount = Number(total?.total ?? 0);
  legacyOk(res, { items, pagination: { total: totalCount, page, limit, total_pages: Math.max(1, Math.ceil(totalCount / limit)) } }, 'WO Operational list retrieved');
}));

maintenanceRouter.get('/maintenance/my_wo', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const mtcDivisionId = await getMtcDivisionId();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 10)));
  const { where, params } = await buildListQuery(user, mtcDivisionId, { creatorOnly: String(user.fullname ?? '') });

  const total = await one<{ total: number }>(`SELECT COUNT(*) total FROM tb_wo_mtc_operational w LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}`, params);
  const items = await rows<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_mtc_operational w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment ${where}
     ORDER BY w.date DESC, w.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const totalCount = Number(total?.total ?? 0);
  legacyOk(res, { items: items.map((row) => ({ ...row, type_wo: normalizeTypeWo(row.type_wo) })), pagination: { total: totalCount, page, limit, total_pages: Math.max(1, Math.ceil(totalCount / limit)) } });
}));

maintenanceRouter.get('/maintenance/detail', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const areas = getAllowedAssetAreas(user);
  const areaScope = assetAreaScopeSql(areas, 'a');
  const where = areaScope.sql ? `AND ${areaScope.sql}` : '';
  const header = await one<Record<string, unknown>>(
    `SELECT w.*, d.division_name, d.division_code, a.AssetCode, a.AssetName FROM tb_wo_mtc_operational w
     LEFT JOIN tb_division d ON d.id_division=w.id_division LEFT JOIN asset a ON a.AssetID=w.id_equipment
     WHERE w.wo_number=? ${where}`,
    [woNumber, ...areaScope.params],
  );
  if (!header) throw new HttpError(404, 'WO not found');

  const assetCode = String(header.AssetCode ?? '');
  const isPreventive = isPreventiveType(header.type_wo);
  const [executors, labor, materialA, materialB, approvals, servicePhotos] = await Promise.all([
    getExecutors(woNumber),
    rows('SELECT * FROM tb_detail_labor WHERE wo_number=?', [woNumber]),
    rows('SELECT * FROM tb_detail_material WHERE wo_number=?', [woNumber]),
    // Mobile (Material.fromJson) baca kolom gaya tb_detail_material
    // (material/qty/unit/id_detail_material) — tb_material_request punya
    // nama kolom beda (part/material_request/material_usage/uom_*), jadi
    // di-alias dulu di sini biar baris part-request ikut kebaca mobile,
    // bukan cuma web (yang punya query remap sendiri di work-orders.ts).
    rows(
      `SELECT id AS id_detail_material, wo_number, job_executor, level, part AS material,
              COALESCE(NULLIF(material_usage, 0), material_request, 0) AS qty,
              COALESCE(uom_usage, uom_request) AS unit,
              purchase_request AS pr
       FROM tb_material_request WHERE wo_number=? AND level != 'others'`,
      [woNumber],
    ),
    rows('SELECT * FROM tb_approval_operational WHERE wo_number=? ORDER BY created_at ASC', [woNumber]),
    getServicePhotos(woNumber),
  ]);

  let preventiveParts: unknown[] = [];
  let partExecution: unknown[] = [];
  if (isPreventive) {
    preventiveParts = await getPreventivePartDefinitions(woNumber, assetCode);
    const result = await getPartExecution(woNumber, assetCode);
    partExecution = result.rows;
    await syncStatusFromPartExecution(woNumber, assetCode);
  }

  // 386+ WO di database punya baris di KEDUA tabel (tb_detail_material
  // sudah kesinkron dari tb_material_request oleh syncMaterialRequestFromMobile,
  // tapi baris asli di tb_material_request tidak pernah dihapus) — merge
  // polos bakal nampilin part yang sama dua kali di mobile. Buang baris
  // materialB yang nama part-nya udah ada di materialA buat WO yang sama.
  const materialANames = new Set(
    materialA.map((m) => String((m as Record<string, unknown>).material ?? '').trim().toLowerCase()).filter(Boolean),
  );
  const materialBDeduped = materialB.filter(
    (m) => !materialANames.has(String((m as Record<string, unknown>).material ?? '').trim().toLowerCase()),
  );

  legacyOk(res, {
    ...header,
    type_wo: normalizeTypeWo(header.type_wo),
    executors, labor,
    material: [...materialA, ...materialBDeduped],
    approvals, preventive_parts: preventiveParts, part_execution: partExecution, service_photos: servicePhotos,
  }, 'WO detail retrieved');
}));

maintenanceRouter.get('/maintenance/dashboard', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const company = String(req.query.company ?? 'ALL');
  const startDate = req.query.start_date ? String(req.query.start_date) : '';
  const endDate = req.query.end_date ? String(req.query.end_date) : '';
  const crossAccess = Number(user.wo_cross_access ?? 0) === 1;
  const areas = getAllowedAssetAreas(user);
  const categories = getUserCategories(user);

  const buildWhere = (statuses: string[], dateColumn: string, applyDateFilter: boolean): { sql: string; params: unknown[] } => {
    let sql = `WHERE w.status IN (${statuses.map(() => '?').join(',')})`;
    const params: unknown[] = [...statuses];
    if (applyDateFilter) {
      const effectiveStart = startDate || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      sql += ` AND w.${dateColumn} >= ?`; params.push(effectiveStart);
      if (endDate) { sql += ` AND w.${dateColumn} <= ?`; params.push(endDate); }
    }
    if (company !== 'ALL') { sql += ' AND w.company = ?'; params.push(company); }
    if (!crossAccess && user.id_division) { sql += ' AND w.id_division = ?'; params.push(user.id_division); }
    const areaScope = assetAreaScopeSql(areas, 'a');
    if (areaScope.sql) { sql += ` AND ${areaScope.sql}`; params.push(...areaScope.params); }
    if (categories.length) { sql += ` AND (w.category_maintenance IN (${categories.map(() => '?').join(',')}) OR w.category_maintenance IS NULL OR w.category_maintenance='')`; params.push(...categories); }
    return { sql, params };
  };

  const open = buildWhere(['WAIT_KA_DIV', 'WAIT_KA_DIV_MTC', 'WAIT_EXECUTOR_ADMIN'], 'date', false);
  const progress = buildWhere(['IN_PROGRESS_EXECUTOR', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'PARTS_RECEIVED', 'WAITING_PARTS'], 'date', false);
  const closed = buildWhere(['CLOSED'], 'closedDate', true);

  const fromClause = 'FROM tb_wo_mtc_operational w LEFT JOIN asset a ON a.AssetID=w.id_equipment';
  const [openCount, progressCount, closedCount] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*) total ${fromClause} ${open.sql}`, open.params),
    one<{ total: number }>(`SELECT COUNT(*) total ${fromClause} ${progress.sql}`, progress.params),
    one<{ total: number }>(`SELECT COUNT(*) total ${fromClause} ${closed.sql}`, closed.params),
  ]);

  const openN = Number(openCount?.total ?? 0);
  const progressN = Number(progressCount?.total ?? 0);
  const closedN = Number(closedCount?.total ?? 0);
  const total = openN + progressN + closedN;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  legacyOk(res, {
    open: openN, in_progress: progressN, closed: closedN, total,
    open_percentage: pct(openN), progress_percentage: pct(progressN), closed_percentage: pct(closedN),
  }, 'Dashboard data retrieved successfully');
}));

maintenanceRouter.get('/maintenance/get_new', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const divisionCode = String(user.division_code ?? '');
  if (!divisionCode) throw new HttpError(400, 'Division not found');
  legacyOk(res, { wo_number: await generateWoNumber(divisionCode) });
}));

maintenanceRouter.get('/maintenance/get_list_user', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!user.id_division) throw new HttpError(400, 'Division not found');
  legacyOk(res, await rows('SELECT id_user, fullname, username FROM tb_user WHERE id_division=? AND active=1 ORDER BY fullname ASC', [user.id_division]));
}));

maintenanceRouter.post('/maintenance/create', attachmentUpload.array('attachment', 10), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  if (!b.job_title) throw new HttpError(400, 'job_title is required');
  const idEquipment = String(b.id_equipment ?? '').split('|')[0].trim() || null;
  const areas = getAllowedAssetAreas(user);
  if (!idEquipment || !(await validateAssetAreaAccess(idEquipment, areas))) throw new HttpError(403, 'Asset tidak sesuai area maintenance user.');

  const divisionCode = String(user.division_code ?? '');
  const woNumber = b.wo_number ? String(b.wo_number) : await generateWoNumber(divisionCode);
  if (b.wo_number) await rejectIfFinal(woNumber).catch((err) => { if (err instanceof HttpError && err.status === 404) return; throw err; });

  const safePrefix = woNumber.replace(/[-/\\ ]/g, '').replace(/[^a-zA-Z0-9_]/g, '') || 'WOPR';
  const uploaded = await Promise.all(((req.files as Express.Multer.File[] | undefined) ?? [])
    .map((f) => saveUploadedFile(f.buffer, 'wo_operational', f.originalname, f.mimetype)));
  const base64Attachments = await decodeBase64Attachments(b.attachments, safePrefix);
  const attachment = [...uploaded, ...base64Attachments].join(',');

  const isPreventive = isPreventiveType(b.type_wo);
  const status = isPreventive ? 'IN_PROGRESS_EXECUTOR' : 'WAIT_KA_DIV_MTC';
  const executorStatus = isPreventive ? 'IN_PROGRESS' : 'WAITING';

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO tb_wo_mtc_operational (wo_number, date, company, shift, type_wo, category_maintenance, priority, id_division, id_equipment, job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [woNumber, b.date ?? new Date().toISOString().slice(0, 10), b.company ?? '', b.shift ?? '', normalizeTypeWoForWrite(b.type_wo), b.category_maintenance ?? null, b.priority ?? 'NORMAL',
        b.id_division ?? user.id_division, idEquipment, b.job_title, b.running_hours ?? null, b.job_requirement ?? '', attachment, 'MTC', status, 'MTC', user.fullname] as never,
    );
    await connection.execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', ['MTC', woNumber, '', executorStatus]);
  });

  legacyOk(res, { wo_number: woNumber }, 'WO created successfully', 201);
}));

maintenanceRouter.post('/maintenance/update', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const woNumber = String(b.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await rejectIfFinal(woNumber);

  if (b.id_equipment !== undefined && String(b.id_equipment).trim() !== '') {
    const idEquipment = String(b.id_equipment).split('|')[0].trim() || null;
    const areas = getAllowedAssetAreas(user);
    if (!(await validateAssetAreaAccess(idEquipment, areas))) throw new HttpError(403, 'Asset tidak sesuai area maintenance user.');
  }

  const existingAttachments = String(header.attachment ?? '').split(',').filter(Boolean);
  const safePrefix = woNumber.replace(/[-/\\ ]/g, '').replace(/[^a-zA-Z0-9_]/g, '') || 'WOPR';
  const newAttachments = await decodeBase64Attachments(b.attachments, `${safePrefix}-${existingAttachments.length}`);

  const fields: Record<string, unknown> = {};
  for (const key of ['date', 'company', 'shift', 'type_wo', 'category_maintenance', 'priority', 'job_title', 'running_hours', 'job_requirement']) {
    if (b[key] !== undefined && b[key] !== null && b[key] !== '') fields[key] = b[key];
  }
  if (fields.type_wo !== undefined) fields.type_wo = normalizeTypeWoForWrite(fields.type_wo);
  fields.id_division = b.id_division || user.id_division;
  if (b.id_equipment !== undefined && String(b.id_equipment).trim() !== '') fields.id_equipment = String(b.id_equipment).split('|')[0].trim() || null;
  if (newAttachments.length) fields.attachment = [...existingAttachments, ...newAttachments].join(',');

  const protectedStatuses = new Set(['CLOSED', 'VOID', 'WAITING_PARTS', 'PARTS_RECEIVED', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'DECLINE', 'REJECT']);
  if (!protectedStatuses.has(String(header.status).toUpperCase())) fields.status = 'IN_PROGRESS_EXECUTOR';

  const keys = Object.keys(fields);
  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, user.fullname, user.avatar ?? 'avatar.png', user.id_division, user.id_position, 'Updated Work order']);
    if (keys.length) await connection.execute(`UPDATE tb_wo_mtc_operational SET ${keys.map((k) => `\`${k}\`=?`).join(',')}, updated_at=NOW() WHERE wo_number=?`, [...keys.map((k) => fields[k]), woNumber] as never);
  });

  legacyOk(res, { wo_number: woNumber }, 'WO updated successfully');
}));

maintenanceRouter.post('/maintenance/update_asset', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const idEquipment = String(req.body.id_equipment ?? '').split('|')[0].trim() || null;
  if (!woNumber || !idEquipment) throw new HttpError(400, 'wo_number and id_equipment are required');
  await rejectIfFinal(woNumber);
  const areas = getAllowedAssetAreas(user);
  if (!(await validateAssetAreaAccess(idEquipment, areas))) throw new HttpError(403, 'Asset tidak sesuai area maintenance user.');

  await execute('UPDATE tb_wo_mtc_operational SET id_equipment=?, updated_at=NOW() WHERE wo_number=?', [idEquipment, woNumber]);
  legacyOk(res, { wo_number: woNumber }, 'Asset updated successfully');
}));

maintenanceRouter.delete('/maintenance/delete', asyncHandler(async (req, res) => {
  const woNumber = String(req.body.wo_number ?? req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');

  await transaction(async (connection) => {
    await connection.execute('DELETE FROM tb_approval_operational WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_detail_labor WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_detail_material WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_material_request WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
    await connection.execute('DELETE FROM tb_wo_mtc_operational WHERE wo_number=?', [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order deleted successfully');
}));

maintenanceRouter.post('/maintenance/approve', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await rejectIfFinal(woNumber);
  const person = personPayload(user);
  const position = String(user.id_position ?? '').toUpperCase();
  const callerIsMtc = String(user.division_code ?? '').toUpperCase() === 'MTC';

  let targetStatus: string;
  let pic: string;
  if (position === 'DIVHEAD' && callerIsMtc) {
    targetStatus = 'WAIT_EXECUTOR_ADMIN';
    pic = String(header.job_executor ?? 'MTC');
  } else if (position === 'DIVHEAD') {
    targetStatus = 'WAIT_KA_DIV_MTC';
    pic = 'MTC';
  } else if (position === 'ADMIN_DIVISI' && callerIsMtc) {
    targetStatus = 'COMPLETE_EXECUTOR';
    const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
    pic = divisionRow?.division_code ?? '-';
  } else if (position === 'ADMIN_DIVISI') {
    targetStatus = 'CLOSED';
    pic = '-';
  } else {
    targetStatus = 'COMPLETE_EXECUTOR';
    const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
    pic = divisionRow?.division_code ?? '-';
  }

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute('UPDATE tb_wo_mtc_operational SET status=?, pic=?, updated_at=NOW() WHERE wo_number=?', [targetStatus, pic, woNumber]);
  });

  legacyOk(res, { wo_number: woNumber }, 'WO approved successfully');
}));

maintenanceRouter.post('/maintenance/close', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? 'Close');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (String(header.status) !== 'COMPLETE_EXECUTOR') throw new HttpError(409, 'Work Order is not awaiting closing');
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_mtc_operational SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'CLOSED' }, 'WO closed successfully');
}));

maintenanceRouter.post('/maintenance/decline', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const comment = String(req.body.comment ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  await rejectIfFinal(woNumber);
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, comment]);
    await connection.execute("UPDATE tb_wo_mtc_operational SET status='REJECT', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    await connection.execute('DELETE FROM tb_job_executor WHERE wo_number=?', [woNumber]);
  });

  legacyOk(res, { wo_number: woNumber, status: 'REJECT' }, 'WO declined successfully');
}));

maintenanceRouter.post('/maintenance/forward', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const toDivision = String(req.body.to_division ?? '').toUpperCase();
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  if (!['MES', 'MESO'].includes(toDivision)) throw new HttpError(400, 'Flow web hanya mendukung forward ke MESO.');
  await forwardToMeso(woNumber, user);
  legacyOk(res, { wo_number: woNumber, status: 'FORWARD_TO_MESO' }, 'WO forwarded to MESO successfully');
}));

async function forwardToMeso(woNumber: string, user: User): Promise<void> {
  const header = await rejectIfFinal(woNumber);
  const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
  const divisionCode = divisionRow?.division_code ?? '';
  const now = new Date();
  const base = `WO-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/${divisionCode}`;
  const seqRow = await one<{ seq: number | null }>('SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM tb_wo_mtc WHERE wo_number LIKE ?', [`${base}/%`]);
  const newWoNumber = `${base}/${String(Number(seqRow?.seq ?? 0) + 1).padStart(4, '0')}`;
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO tb_wo_mtc (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment, location, job_title, running_hours, job_requirement, attachment, status, pic, creator, created_at)
       VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [newWoNumber, header.company, header.shift, header.type_wo, header.priority, header.id_division, header.id_equipment, header.location,
        header.job_title, header.running_hours, header.job_requirement, header.attachment, 'FROM_MAINTENANCE', '-', header.creator] as never,
    );
    await connection.execute("UPDATE tb_wo_mtc_operational SET status='FORWARD_TO_MESO', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, 'WO Has been Move To MESO']);
  });
}

maintenanceRouter.post('/maintenance/void_document', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1) throw new HttpError(403, 'You do not have permission to void this work order');
  const woNumber = String(req.body.wo_number ?? '');
  const reason = String(req.body.reason ?? '');
  if (!woNumber || !reason) throw new HttpError(400, 'wo_number and reason are required');
  await rejectIfFinal(woNumber);
  const person = personPayload(user);

  await transaction(async (connection) => {
    await connection.execute("UPDATE tb_wo_mtc_operational SET status='VOID', reason=?, pic='-', updated_at=NOW() WHERE wo_number=?", [reason, woNumber]);
    await connection.execute('INSERT INTO tb_approval_operational (wo_number, fullname, avatar, id_division, id_position, comment, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [woNumber, person.fullname, person.avatar, person.id_division, person.id_position, reason]);
  });

  legacyOk(res, { wo_number: woNumber }, 'Work Order voided successfully');
}));

maintenanceRouter.post('/maintenance/add_job_explanation', servicePhotoUpload.array('service_photos', 10), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const b = req.body;
  const woNumber = String(b.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const status = String(b.status ?? 'COMPLETE');
  const jobExplanation = String(b.job_explanation ?? '');

  const header = await rejectIfFinal(woNumber);
  const assetRow = await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=?', [header.id_equipment]);
  const assetCode = String(assetRow?.AssetCode ?? '');
  const isPreventive = isPreventiveType(header.type_wo);

  const divisionCode = String(user.division_code ?? '');
  let executor = b.id || b.executor_id
    ? await one<Record<string, unknown>>('SELECT * FROM tb_job_executor WHERE id=?', [b.id ?? b.executor_id])
    : await getExecutorByDivision(woNumber, divisionCode);
  if (!executor) executor = await getFallbackExecutorForUpdate(woNumber);
  if (!executor) throw new HttpError(400, 'Executor row is required');
  if (String(executor.wo_number) !== woNumber) throw new HttpError(404, 'Executor not found');

  if (status === 'COMPLETE' && isPreventive) {
    const validation = await validatePreventiveCompletion(woNumber, assetCode);
    if (!validation.ok) throw new HttpError(400, validation.message ?? 'Checklist belum lengkap');
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'At least one service photo is required');

  const uploaded = await Promise.all(files.map(async (file) => ({
    file, relativePath: await saveUploadedFile(file.buffer, 'wo_operational', file.originalname, file.mimetype),
  })));

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 8);
  const startedPlanner = b.started_planner ? String(b.started_planner) : null;
  const finishedPlanner = b.finished_planner ? String(b.finished_planner) : null;
  const estimatePlanner = b.estimate_planner ? String(b.estimate_planner) : null;
  const startedActual = `${nowDate} ${b.started_actual_time ? String(b.started_actual_time) : nowTime}`;
  const finishedActual = `${nowDate} ${b.finished_actual_time ? String(b.finished_actual_time) : nowTime}`;

  await transaction(async (connection) => {
    await connection.execute(
      'UPDATE tb_wo_mtc_operational SET started_planner=?, finished_planner=?, estimate_planner=?, started_actual=?, finished_actual=?, job_explanation=?, updated_at=NOW() WHERE wo_number=?',
      [startedPlanner, finishedPlanner, estimatePlanner, startedActual, finishedActual, jobExplanation, woNumber],
    );
    for (const { file, relativePath } of uploaded) {
      await connection.execute(
        'INSERT INTO tb_wo_service_evidence (wo_number, executor_id, module_code, file_name, file_path, file_ext, file_size_kb, mime_type, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
        [woNumber, executor!.id, 'MTC', file.originalname, relativePath, path.extname(file.originalname).slice(1), Math.round(file.size / 1024), file.mimetype, 'MOBILE', user.id_user] as never,
      );
    }
  });

  await syncDailyControlForWoUpdate({
    woNumber,
    company: String(header.company ?? ''),
    idEquipment: header.id_equipment,
    jobTitle: String(header.job_title ?? ''),
    notes: jobExplanation,
    actorUserId: Number(user.id_user),
    actorFullname: String(user.fullname ?? ''),
    actorDivisionId: user.id_division ? Number(user.id_division) : null,
    jobExecutorCode: String(executor.job_executor ?? executor.pic ?? divisionCode),
  });

  const person = personPayload(user);
  const position = String(user.id_position ?? '').toUpperCase();
  const callerIsMtc = String(user.division_code ?? '').toUpperCase() === 'MTC';

  if (status === 'COMPLETE') {
    await execute('UPDATE tb_job_executor SET status=? WHERE id=?', [status, executor.id] as never);
    await execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [divisionCode, woNumber, jobExplanation, 'ADDITIONAL']);

    if (isPreventive) {
      await insertApprovalOperational(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_mtc_operational SET status='CLOSED', closedDate=NOW(), pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    } else if (position === 'DIVHEAD') {
      const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
      await insertApprovalOperational(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_mtc_operational SET status='COMPLETE_EXECUTOR', pic=?, updated_at=NOW() WHERE wo_number=?", [divisionRow?.division_code ?? '-', woNumber]);
    } else if (position === 'ADMIN_DIVISI' && callerIsMtc) {
      const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
      await insertApprovalOperational(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_mtc_operational SET status='COMPLETE_EXECUTOR', pic=?, updated_at=NOW() WHERE wo_number=?", [divisionRow?.division_code ?? '-', woNumber]);
    } else if (position === 'ADMIN_DIVISI') {
      await insertApprovalOperational(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_mtc_operational SET status='CLOSED', pic='-', updated_at=NOW() WHERE wo_number=?", [woNumber]);
    } else {
      const divisionRow = await one<{ division_code: string }>('SELECT division_code FROM tb_division WHERE id_division=?', [header.id_division]);
      await insertApprovalOperational(woNumber, person, jobExplanation);
      await execute("UPDATE tb_wo_mtc_operational SET status='COMPLETE_EXECUTOR', pic=?, updated_at=NOW() WHERE wo_number=?", [divisionRow?.division_code ?? '-', woNumber]);
    }
  } else if (status === 'IN_PROGRESS') {
    await execute('UPDATE tb_job_executor SET status=? WHERE id=?', [status, executor.id] as never);
    const firstExecutor = await one<{ job_executor: string; status: string }>('SELECT job_executor, status FROM tb_job_executor WHERE wo_number=? ORDER BY id ASC LIMIT 1', [woNumber]);
    if (firstExecutor && String(firstExecutor.status) === 'IN_PROGRESS') {
      await execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [firstExecutor.job_executor, woNumber, jobExplanation, 'ADDITIONAL']);
    }
    await insertApprovalOperational(woNumber, person, jobExplanation);
    await execute("UPDATE tb_wo_mtc_operational SET status='IN_PROGRESS_EXECUTOR', updated_at=NOW() WHERE wo_number=?", [woNumber]);
  } else if (status === 'FORWARD_TO_MESO') {
    await forwardToMeso(woNumber, user);
  }

  const allowedUsernames = await getAllowedLaborUsernames(user.id_division);
  const laborSaved = await saveLaborFromJobUpdate(woNumber, String(executor.job_executor), b, allowedUsernames);

  legacyOk(res, { wo_number: woNumber, labor_saved: laborSaved }, 'Job explanation added successfully');
}));

maintenanceRouter.get('/maintenance/void_candidates', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1) throw new HttpError(403, 'WO VOID permission is required');
  legacyOk(res, await getVoidEligiblePreventiveWo());
}));

maintenanceRouter.get('/maintenance/void_history', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1) throw new HttpError(403, 'WO VOID permission is required');
  legacyOk(res, await getVoidHistoryByActionDate());
}));

maintenanceRouter.post('/maintenance/void_preventive', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_void ?? 0) !== 1) throw new HttpError(403, 'WO VOID permission is required');
  const woNumber = String(req.body.wo_number ?? '');
  const reason = String(req.body.reason ?? '');
  if (!woNumber || !reason) throw new HttpError(400, 'wo_number and reason are required');

  const eligible = await getVoidEligiblePreventiveWo(woNumber);
  if (!eligible.length) throw new HttpError(422, 'WO tidak memenuhi syarat void H-1 atau sudah memiliki progress');

  const sourceTable = String(eligible[0].source_table);
  const config = VOID_SOURCE_TABLES.find((c) => c.table === sourceTable)!;
  const person = personPayload(user);
  await voidWoInSourceTable(config, woNumber, reason, person);

  legacyOk(res, { wo_number: woNumber }, 'Work Order voided successfully');
}));

maintenanceRouter.post('/maintenance/update_executor', asyncHandler(async (req, res) => {
  const b = req.body;
  const id = b.id;
  const woNumber = String(b.wo_number ?? '');
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  await rejectIfFinal(woNumber);
  const fields: Record<string, unknown> = {};
  if (b.job_executor !== undefined) fields.job_executor = b.job_executor;
  if (b.status !== undefined) fields.status = b.status;
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'No changes provided');
  await execute(`UPDATE tb_job_executor SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id=? AND wo_number=?`, [...keys.map((k) => fields[k]), id, woNumber] as never);
  legacyOk(res, { id }, 'Executor updated successfully');
}));

maintenanceRouter.delete('/maintenance/delete_executor', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  if (!id) throw new HttpError(400, 'id is required');
  await execute('DELETE FROM tb_job_executor WHERE id=?', [id]);
  legacyOk(res, null, 'Executor removed successfully');
}));

maintenanceRouter.post('/maintenance/add_labor', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  await rejectIfFinal(woNumber);
  const raw = req.body.trade;
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const trades = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
  if (!trades.length) throw new HttpError(400, 'PIC wajib dipilih');
  if (trades.length > 10) throw new HttpError(400, 'Maksimal 10 PIC');

  const allowed = await getAllowedLaborUsernames(user.id_division);
  const allowedSet = new Set(allowed);
  const invalidUsers = trades.filter((t) => !allowedSet.has(t));
  if (invalidUsers.length) throw new HttpError(400, 'PIC harus berasal dari divisi yang sama dan masih aktif.');

  const men = req.body.men != null ? String(req.body.men) : null;
  const hours = req.body.hours != null ? String(req.body.hours) : null;
  const jobExecutor = String(user.division_code ?? '');

  await transaction(async (connection) => {
    for (const trade of trades) {
      await connection.execute('INSERT INTO tb_detail_labor (job_executor, wo_number, trade, men, hours, `for`) VALUES (?,?,?,?,?,?)', [jobExecutor, woNumber, trade, men, hours, 'MTC']);
    }
  });

  legacyOk(res, { inserted: trades.length }, 'Labor added successfully', 201);
}));

maintenanceRouter.delete('/maintenance/remove_labor', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  const woNumber = req.query.wo_number ?? req.body.wo_number;
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  await execute('DELETE FROM tb_detail_labor WHERE id_detail_labor=? AND wo_number=?', [id, woNumber]);
  legacyOk(res, null, 'Labor removed successfully');
}));

maintenanceRouter.post('/maintenance/add_material', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const material = String(req.body.material ?? req.body.material_name ?? '');
  const qty = Number(req.body.qty ?? req.body.quantity ?? 0);
  const unit = req.body.unit != null ? String(req.body.unit) : 'PCS';
  const pr = req.body.pr != null ? String(req.body.pr) : null;
  if (!woNumber || !material || qty <= 0) throw new HttpError(400, 'wo_number, material and qty are required');
  await rejectIfFinal(woNumber);
  const jobExecutor = String(user.division_code ?? '');

  const existing = await one<{ id_detail_material: number; qty: number }>(
    "SELECT id_detail_material, qty FROM tb_detail_material WHERE wo_number=? AND material=?",
    [woNumber, material],
  );
  if (existing) {
    await execute('UPDATE tb_detail_material SET qty=?, unit=?, pr=? WHERE id_detail_material=?', [Number(existing.qty) + qty, unit, pr, existing.id_detail_material]);
  } else {
    await execute('INSERT INTO tb_detail_material (job_executor, wo_number, pr, material, qty, unit, `for`) VALUES (?,?,?,?,?,?,?)', [jobExecutor, woNumber, pr, material, qty, unit, 'OPERATIONAL']);
  }

  const header = await getHeader(woNumber);
  if (isPreventiveType(header?.type_wo)) {
    await upsertPartExecution(woNumber, { custom_detail_id: 0, part_mesin: material, bagian_mesin: null, maintenance_status: 'PENDING', request_qty: qty, request_part: material, request_uom: unit ?? 'PCS', keterangan: '' }, String(user.fullname ?? ''));
  }

  await syncMaterialRequestFromMobile(woNumber, material, qty, unit, jobExecutor, user);
  legacyOk(res, null, 'Material added successfully', 201);
}));

maintenanceRouter.delete('/maintenance/remove_material', asyncHandler(async (req, res) => {
  const id = req.query.id ?? req.body.id;
  const woNumber = req.query.wo_number ?? req.body.wo_number;
  if (!id || !woNumber) throw new HttpError(400, 'id and wo_number are required');
  await execute('DELETE FROM tb_detail_material WHERE id_detail_material=? AND wo_number=?', [id, woNumber]);
  legacyOk(res, null, 'Material removed successfully');
}));

maintenanceRouter.get('/maintenance/get_material_received', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  legacyOk(res, await rows("SELECT * FROM tb_material_request WHERE wo_number=? AND level != 'others' ORDER BY id ASC", [woNumber]));
}));

maintenanceRouter.get('/maintenance/part_execution', asyncHandler(async (req, res) => {
  const woNumber = String(req.query.wo_number ?? '');
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (!isPreventiveType(header.type_wo)) { legacyOk(res, [], 'WO is not preventive'); return; }
  const assetRow = header.id_equipment ? await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=?', [header.id_equipment]) : null;
  const { rows: parts } = await getPartExecution(woNumber, String(assetRow?.AssetCode ?? ''));
  legacyOk(res, parts);
}));

maintenanceRouter.post('/maintenance/part_execution', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_executor ?? 0) !== 1) throw new HttpError(403, 'WO Executor permission is required');
  const woNumber = String(req.body.wo_number ?? '');
  let rowsInput = req.body.rows;
  if (typeof rowsInput === 'string') { try { rowsInput = JSON.parse(rowsInput); } catch { rowsInput = null; } }
  if (!woNumber || !Array.isArray(rowsInput)) throw new HttpError(400, 'wo_number and rows are required');

  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (!isPreventiveType(header.type_wo)) throw new HttpError(400, 'WO is not preventive');
  if (isFinalWoStatus(header.status)) throw new HttpError(409, 'Work Order sudah final dan tidak dapat diubah');

  const assetRow = header.id_equipment ? await one<{ AssetCode: string }>('SELECT AssetCode FROM asset WHERE AssetID=?', [header.id_equipment]) : null;
  const assetCode = String(assetRow?.AssetCode ?? '');
  const categories = getUserCategories(user);
  const definitions = await getPreventivePartDefinitions(woNumber, assetCode);
  const whitelist = categories.length ? new Map(definitions.map((d) => [partKey(d.custom_detail_id, d.part_mesin), d])) : null;

  const requestRows: { part: string; qty: number }[] = [];
  for (const row of rowsInput as Record<string, unknown>[]) {
    const customDetailId = Number(row.custom_detail_id ?? 0);
    const partMesin = String(row.part_mesin ?? '');
    const key = partKey(customDetailId, partMesin);
    const definition = whitelist ? whitelist.get(key) : { custom_detail_id: customDetailId, part_mesin: partMesin, bagian_mesin: null };
    if (!definition) continue;

    const statusInput = String(row.maintenance_status ?? '').trim().toUpperCase();
    const maintenanceStatus = statusInput === 'DONE' ? 'DONE' : 'PENDING';
    const requestQty = Math.max(0, Number(row.request_qty ?? 0));
    const requestPart = String(row.request_part ?? '').trim() || definition.part_mesin;
    const requestUom = String(row.request_uom ?? 'PCS');
    const keterangan = String(row.keterangan ?? '');

    await upsertPartExecution(woNumber, {
      custom_detail_id: customDetailId, part_mesin: definition.part_mesin, bagian_mesin: definition.bagian_mesin,
      maintenance_status: maintenanceStatus, request_qty: requestQty, request_part: requestPart, request_uom: requestUom, keterangan,
    }, String(user.fullname ?? ''));

    if (requestQty > 0 && requestPart) requestRows.push({ part: requestPart, qty: requestQty });
  }

  await execute("DELETE FROM tb_material_request WHERE wo_number=? AND level='part_execution'", [woNumber]);
  const divisionCode = String(user.division_code ?? '');
  for (const r of requestRows) {
    await execute('INSERT INTO tb_material_request (wo_number, level, part, material_request, uom_request, job_executor, request_code, date) VALUES (?,?,?,?,?,?,?,NOW())',
      [woNumber, 'part_execution', r.part, String(r.qty), 'PCS', divisionCode, randomCode(10)]);
  }
  if (requestRows.length) await syncMaterialRequestFromMobile(woNumber, requestRows[0].part, requestRows[0].qty, 'PCS', divisionCode, user);

  legacyOk(res, { wo_number: woNumber, requested: requestRows.length }, 'Part execution updated');
}));

maintenanceRouter.post('/maintenance/part_execution_media', partExecutionMediaUpload.single('media'), asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (Number(user.wo_executor ?? 0) !== 1) throw new HttpError(403, 'WO Executor permission is required');
  const woNumber = String(req.body.wo_number ?? '');
  const customDetailId = Number(req.body.custom_detail_id ?? 0);
  const partMesin = String(req.body.part_mesin ?? '');
  if (!woNumber || (customDetailId <= 0 && !partMesin) || !req.file) throw new HttpError(400, 'wo_number, part reference and media file are required');
  const header = await getHeader(woNumber);
  if (!header) throw new HttpError(404, 'Work Order not found');
  if (!isPreventiveType(header.type_wo)) throw new HttpError(400, 'WO is not preventive');
  if (isFinalWoStatus(header.status)) throw new HttpError(409, 'Work Order sudah final dan tidak dapat diubah');

  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  const mediaType = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) ? 'video' : 'image';
  const relativePath = await saveUploadedFile(req.file.buffer, 'wo_operational_part_execution', req.file.originalname, req.file.mimetype);

  const result = await execute(
    'INSERT INTO tb_wo_operational_part_execution_media (wo_number, custom_detail_id, part_mesin, media_type, media_name, media_path, created_by, created_at) VALUES (?,?,?,?,?,?,?,NOW())',
    [woNumber, customDetailId || null, partMesin || null, mediaType, req.file.originalname, relativePath, String(user.fullname ?? '')],
  );

  legacyOk(res, { id: result.insertId, url: `/uploads/${relativePath}`, name: req.file.originalname, media_type: mediaType }, 'Media uploaded');
}));

maintenanceRouter.get('/maintenance/material_suggestions', asyncHandler(async (req, res) => {
  const term = String(req.query.term ?? '').trim();
  if (!term) { legacyOk(res, []); return; }
  const result = await callMaterialService('getMaterial', 'GET', { term });
  const list = Array.isArray(result) ? result : (result as { data?: unknown[] })?.data ?? [];
  const names = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item === 'string') names.add(item);
    else if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const value = record.value ?? record.label ?? record.part ?? record.material;
      if (value) names.add(String(value));
    }
    if (names.size >= 100) break;
  }
  legacyOk(res, [...names]);
}));

maintenanceRouter.post('/maintenance/material_detail', asyncHandler(async (req, res) => {
  const part = String(req.body.part ?? '').trim();
  if (!part) throw new HttpError(400, 'part is required');
  const result = await callMaterialService('getMaterialDetails', 'POST', {}, { part });
  legacyOk(res, result);
}));

const SUB_WO_TARGETS: Record<string, { prefix: string; table: string; executor: string; status: string; pic: string; createExecutorRow: boolean }> = {
  GA: { prefix: 'WOGA', table: 'tb_wo_ga', executor: 'HRGA', status: 'WAIT_KA_DIV_HRGA', pic: 'HRGA', createExecutorRow: true },
  IT: { prefix: 'WOIT', table: 'tb_wo_it', executor: 'ITS', status: 'WAIT_KA_DIV_ITIS', pic: 'ITS', createExecutorRow: true },
  MES: { prefix: 'WO', table: 'tb_wo_mtc', executor: '', status: 'WAIT_KA_DEPT_MESO', pic: 'MESO', createExecutorRow: false },
};

maintenanceRouter.post('/maintenance/add_sub_wo', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const woNumber = String(req.body.wo_number ?? '');
  const subto = String(req.body.subto ?? '').toUpperCase();
  if (!woNumber) throw new HttpError(400, 'wo_number is required');
  const target = SUB_WO_TARGETS[subto];
  if (!target) throw new HttpError(400, 'Invalid subto');
  await rejectIfFinal(woNumber);

  const original = await one<Record<string, unknown>>(
    'SELECT w.*, d.division_code FROM tb_wo_mtc_operational w LEFT JOIN tb_division d ON d.id_division=w.id_division WHERE w.wo_number=?',
    [woNumber],
  );
  if (!original) throw new HttpError(404, 'Work Order not found');

  const now = new Date();
  const base = `${target.prefix}-${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}/SUB/${original.division_code ?? ''}`;
  const seqRow = await one<{ seq: number | null }>(`SELECT MAX(CAST(RIGHT(wo_number,4) AS UNSIGNED)) AS seq FROM \`${target.table}\` WHERE wo_number LIKE ?`, [`${base}/%`]);
  const subWoNumber = `${base}/${String(Number(seqRow?.seq ?? 0) + 1).padStart(4, '0')}`;

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO \`${target.table}\` (wo_number, date, company, shift, type_wo, priority, id_division, id_equipment, job_title, running_hours, job_requirement, attachment, job_executor, status, pic, creator, created_at)
       VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [subWoNumber, original.company, original.shift, original.type_wo, original.priority, original.id_division, original.id_equipment,
        original.job_title, original.running_hours, original.job_requirement, original.attachment, target.executor, target.status, target.pic, user.fullname] as never,
    );
    if (target.createExecutorRow) {
      await connection.execute('INSERT INTO tb_job_executor (job_executor, wo_number, job_explanation, status, created_at) VALUES (?,?,?,?,NOW())', [target.executor, subWoNumber, '', 'WAITING']);
    }
  });

  legacyOk(res, { sub_wo_number: subWoNumber }, 'Sub WO created successfully', 201);
}));
