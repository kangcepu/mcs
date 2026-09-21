import { Router } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import {
  calendar,
  fillMissingDetailDivisions,
  getDetail,
  getList,
  save,
  setPause,
} from '../lib/preventive-schedule-crud.js';
import {
  generateScheduleNow,
  getAssetCustomDetailScheduleRows,
  rebuildScheduleDetailsFromCustomDetails,
  removeSchedule,
} from '../lib/preventive-schedule.js';
import type { AuthRequest } from '../types.js';

export const scheduleRouter = Router();

const canRead = requirePermission('schedule', 'work_calendar');
const canManage = requirePermission('schedule');

scheduleRouter.get('/preventive-schedules', authenticate, canRead, asyncHandler(async (req, res) => {
  const result = await getList({
    q: req.query.q as string, company: req.query.company as string, towo: req.query.towo as string,
    page: req.query.page as string, per_page: req.query.per_page as string,
  });
  ok(res, result.data, 'OK', result.meta);
}));

scheduleRouter.post('/preventive-schedules', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const result = await save(0, req.body, user);
  if (!result.ok) throw new HttpError(422, result.message ?? 'Failed to create schedule', 'SCHEDULE_CREATE_FAILED');

  const newId = Number((result.data?.header as Record<string, unknown> | undefined)?.id ?? 0);
  const generated = newId > 0 ? await generateScheduleNow(newId) : [];
  ok(res, { ...result.data, generated_work_orders: generated }, generated.length ? 'Preventive schedule dan WO awal dibuat' : 'Preventive schedule created');
}));

scheduleRouter.post('/preventive-schedules/generate', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.body.id ?? req.body.schedule_id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'SCHEDULE_ID_REQUIRED');
  if (!(await getDetail(id))) throw new HttpError(404, 'Schedule not found', 'SCHEDULE_NOT_FOUND');

  const repair = await fillMissingDetailDivisions(id, user);
  if (!repair.ok) throw new HttpError(422, repair.message ?? 'Schedule division could not be repaired', 'SCHEDULE_DIVISION_REQUIRED');

  const generated = await generateScheduleNow(id);
  ok(res, { schedule_id: id, repaired_detail_divisions: repair.updated ?? 0, generated_work_orders: generated },
    generated.length ? 'WO awal preventive berhasil dibuat' : 'Tidak ada WO yang dapat dibuat hari ini.');
}));

scheduleRouter.get('/preventive-schedules/detail', authenticate, canRead, asyncHandler(async (req, res) => {
  const id = Number(req.query.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'SCHEDULE_ID_REQUIRED');
  const data = await getDetail(id);
  if (!data) throw new HttpError(404, 'Schedule not found', 'SCHEDULE_NOT_FOUND');
  ok(res, data);
}));

scheduleRouter.patch('/preventive-schedules/detail', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.query.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'SCHEDULE_ID_REQUIRED');
  const result = await save(id, req.body, user);
  if (!result.ok) throw new HttpError(result.not_found ? 404 : 422, result.message ?? 'Failed to update schedule', 'SCHEDULE_UPDATE_FAILED');
  ok(res, result.data, 'Preventive schedule updated');
}));

scheduleRouter.delete('/preventive-schedules/detail', authenticate, canManage, asyncHandler(async (req, res) => {
  const id = Number(req.query.id ?? req.body.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'SCHEDULE_ID_REQUIRED');
  if (!(await getDetail(id))) throw new HttpError(404, 'Schedule not found', 'SCHEDULE_NOT_FOUND');
  if (!(await removeSchedule(id))) throw new HttpError(422, 'Failed to remove schedule', 'SCHEDULE_DELETE_FAILED');
  ok(res, { id }, 'Preventive schedule removed');
}));

scheduleRouter.post('/preventive-schedules/pause', authenticate, canManage, asyncHandler(async (req, res) => {
  const detailId = Number(req.body.detail_id ?? req.body.id ?? 0);
  const paused = 'pause' in req.body ? Boolean(req.body.pause) : Boolean(req.body.paused);
  const result = await setPause(detailId, paused);
  if (!result.ok) throw new HttpError(result.not_found ? 404 : 422, result.message ?? 'Failed to update schedule detail', 'SCHEDULE_PAUSE_FAILED');
  ok(res, result.data, 'Schedule detail updated');
}));

scheduleRouter.post('/preventive-schedules/repair', authenticate, canManage, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.body.id ?? req.body.schedule_id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required', 'SCHEDULE_ID_REQUIRED');
  const result = await rebuildScheduleDetailsFromCustomDetails(id, String(user.fullname ?? user.username ?? 'api v2'));
  if (!result.success) throw new HttpError(422, result.message ?? 'Schedule repair failed', 'SCHEDULE_REPAIR_FAILED');
  ok(res, { repair: result, schedule: await getDetail(id) }, 'Schedule repaired');
}));

scheduleRouter.get('/preventive-schedules/calendar', authenticate, canRead, asyncHandler(async (req, res) => {
  ok(res, await calendar(req.query.year));
}));

scheduleRouter.get('/preventive-schedules/custom-detail-rows', authenticate, canRead, asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? req.query.asset ?? '').trim();
  if (!assetCode) throw new HttpError(422, 'asset_code is required', 'ASSET_CODE_REQUIRED');
  const rows = await getAssetCustomDetailScheduleRows(assetCode);
  ok(res, { asset_code: assetCode, total: rows.length, rows });
}));
