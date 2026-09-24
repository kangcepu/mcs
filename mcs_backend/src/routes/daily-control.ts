import { Router } from 'express';
import { authenticate } from '../auth.js';
import { one, rows } from '../db.js';
import {
  buildUserUpdateSummary,
  createComment,
  getActivitiesByDate,
  getActivityById,
  getActivityPartMentions,
  getAssetParts,
  getCommentById,
  getCommentsByDailyControl,
  getDivisionScope,
  getReaderNames,
  getTeamUsers,
  getTotalUnreadActivityCountForUser,
  getUnreadActivitiesForUser,
  getV2ActivityFeed,
  hasDailyControlPermission,
  isActivityInScope,
  markAsRead,
  normalizeAreaKey,
  notifyCommentRecipients,
  nowInJakarta,
  searchAssets,
  searchWorkOrders,
} from '../lib/daily-control.js';
import { asyncHandler, HttpError, created, legacyOk, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const dailyControlRouter = Router();

dailyControlRouter.use('/daily-control', authenticate, (req, res, next) => {
  const user = (req as AuthRequest).user!;
  if (!hasDailyControlPermission(user)) throw new HttpError(403, 'Daily Control permission required');
  next();
});

/**
 * `new Date("YYYY-MM-DDT00:00:00")` (tanpa suffix zona waktu) di-parse pakai
 * timezone LOKAL proses Node, bukan UTC — di server yang OS-nya di-set
 * Asia/Jakarta, "2026-09-23T00:00:00" jadi berarti tengah malam WIB = jam
 * 17:00 UTC tanggal 22, jadi re-serialize ke ISO balik lagi jadi "2026-09-22"
 * dan validasi round-trip di bawah SELALU gagal untuk tanggal apa pun selain
 * kebetulan hari ini — akibatnya filter tanggal di Daily Control diam-diam
 * selalu balik ke hari ini, walau user eksplisit minta tanggal lain.
 * Validasi manual pakai Date.UTC (unambiguous) biar tidak kena masalah ini.
 */
function normalizeDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth) return raw;
  }
  return nowInJakarta().date;
}

dailyControlRouter.get('/daily-control', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const selectedDate = normalizeDate(req.query.date);
  const area = normalizeAreaKey(req.query.area);
  const scope = getDivisionScope(user);

  const activities = await getActivitiesByDate(selectedDate, scope, 'WO_MAINTENANCE', area, Number(user.id_user));
  const users = await getTeamUsers(scope);
  const summary = buildUserUpdateSummary(users, activities);

  legacyOk(res, {
    selected_date: selectedDate,
    total: activities.length,
    activities,
    users,
    summary,
    scope,
    mode: 'WO_MAINTENANCE_UPDATED_REPLY_ONLY',
  }, 'Daily control list retrieved');
}));

function classifyMesoFilterMatch(row: Record<string, unknown>, filter: string): boolean {
  if (filter === 'ALL') return true;
  const haystack = [row.division_code, row.division_name, row.job_executor, row.wo_number, row.job_title, row.company, row.AssetName, row.location]
    .map((v) => String(v ?? '').toUpperCase()).join(' ');
  return haystack.includes(filter);
}

dailyControlRouter.get('/daily-control/scheduled_summary', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const selectedDate = normalizeDate(req.query.date);
  const scope = getDivisionScope(user);
  const mesoFilter = ['MKL', 'ELC', 'SPL', 'OTO'].includes(String(req.query.meso_filter ?? '').toUpperCase()) ? String(req.query.meso_filter).toUpperCase() : 'ALL';
  const mtcCategory = ['GENERAL', 'ELECTRICAL', 'MOULD'].includes(String(req.query.mtc_category ?? '').toUpperCase()) ? String(req.query.mtc_category).toUpperCase() : 'ALL';
  const mtcArea = normalizeAreaKey(req.query.mtc_area) ?? 'ALL';

  let division = scope.type === 'ALL' ? String(req.query.division ?? '').toUpperCase() : scope.type;
  if (!['MTC', 'MESO', 'ITS'].includes(division)) division = scope.type === 'ALL' ? division : '';

  if (!division || !['MTC', 'MESO', 'ITS'].includes(division)) {
    legacyOk(res, { division: division || '', preventive_total: 0, selected_date: selectedDate }, 'Daily control scheduled summary retrieved');
    return;
  }

  let total = 0;
  if (division === 'ITS') {
    const result = await rows(
      "SELECT wo.wo_number FROM tb_wo_it wo WHERE wo.date=? AND wo.status != 'CLOSED' AND wo.type_wo IN ('preventive','PREVENTIVE','PREVENTIVE MAINTENANCE','PREV MAINTENANCE','PM')",
      [selectedDate],
    );
    total = result.length;
  } else if (division === 'MESO') {
    const result = await rows<Record<string, unknown>>(
      `SELECT wo.wo_number, wo.job_title, wo.company, wo.location, wo.job_executor, d.division_code, d.division_name, a.AssetName
       FROM tb_wo_mtc wo LEFT JOIN tb_division d ON d.id_division=wo.id_division LEFT JOIN asset a ON a.AssetID=wo.id_equipment
       WHERE wo.date=? AND wo.status != 'CLOSED' AND wo.type_wo IN ('preventive','PREVENTIVE','PREVENTIVE MAINTENANCE','PREV MAINTENANCE','PM')`,
      [selectedDate],
    );
    total = result.filter((r) => classifyMesoFilterMatch(r, mesoFilter)).length;
  } else {
    const result = await rows<Record<string, unknown>>(
      `SELECT wo.wo_number, wo.id_equipment AS wo_asset_id, wo.category_maintenance, a.mtc_area_key
       FROM tb_wo_mtc_operational wo LEFT JOIN asset a ON a.AssetID=wo.id_equipment
       WHERE wo.date=? AND wo.status != 'CLOSED' AND wo.type_wo IN ('preventive','PREVENTIVE','PREVENTIVE MAINTENANCE','PREV MAINTENANCE','PM')
         AND (wo.job_requirement LIKE 'AUTO FROM SCHEDULE:%' OR wo.auto_generate='yes')`,
      [selectedDate],
    );
    const filtered = result.filter((r) => {
      if (mtcCategory !== 'ALL' && String(r.category_maintenance ?? '').toUpperCase() !== mtcCategory) return false;
      if (mtcArea !== 'ALL' && String(r.mtc_area_key ?? '').toUpperCase() !== mtcArea) return false;
      return true;
    });
    const seen = new Set<string>();
    total = filtered.filter((r) => {
      const key = String(r.wo_asset_id ?? r.wo_number ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  legacyOk(res, { division, preventive_total: total, selected_date: selectedDate }, 'Daily control scheduled summary retrieved');
}));

dailyControlRouter.get('/daily-control/asset_options', asyncHandler(async (req, res) => {
  const term = String(req.query.term ?? '').trim();
  legacyOk(res, { items: await searchAssets(term, 30) }, 'Asset options retrieved');
}));

dailyControlRouter.get('/daily-control/unread_count', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const scope = getDivisionScope(user);
  const total = await getTotalUnreadActivityCountForUser(Number(user.id_user), scope, 'WO_MAINTENANCE');
  legacyOk(res, { total_unread: total }, 'Unread count retrieved');
}));

dailyControlRouter.get('/daily-control/unread_activities', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const scope = getDivisionScope(user);
  const limit = Math.min(300, Math.max(1, Number(req.query.limit ?? 100)));
  const items = await getUnreadActivitiesForUser(Number(user.id_user), scope, 'WO_MAINTENANCE', limit);
  legacyOk(res, { total: items.length, items }, 'Unread activities retrieved');
}));

dailyControlRouter.get('/daily-control/part_mentions', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.query.daily_control_id ?? 0);
  if (id <= 0) throw new HttpError(400, 'daily_control_id is required');
  const scope = getDivisionScope(user);
  if (!(await isActivityInScope(id, scope))) throw new HttpError(404, 'Activity not found');
  legacyOk(res, { daily_control_id: id, items: await getActivityPartMentions(id) }, 'Part mention options retrieved');
}));

dailyControlRouter.get('/daily-control/asset_part_options', asyncHandler(async (req, res) => {
  const assetCode = String(req.query.asset_code ?? '').trim();
  legacyOk(res, { asset_code: assetCode, items: await getAssetParts(assetCode) }, 'Asset part options retrieved');
}));

dailyControlRouter.get('/daily-control/wo_options', asyncHandler(async (req, res) => {
  const term = String(req.query.term ?? '').trim();
  const assetCode = String(req.query.asset_code ?? '').trim();
  legacyOk(res, { items: await searchWorkOrders(term, 30, assetCode) }, 'WO options retrieved');
}));

dailyControlRouter.post('/daily-control/create', asyncHandler(async (_req, res) => {
  throw new HttpError(403, 'Posting manual Daily Control dinonaktifkan. Feed otomatis dari WO Corrective/Project/Preventive yang sudah di-update, gunakan komentar/reply pada item feed.');
}));

dailyControlRouter.post('/daily-control/mark_read', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.body.daily_control_id ?? 0);
  if (id <= 0) throw new HttpError(400, 'daily_control_id is required');
  const scope = getDivisionScope(user);
  if (!(await isActivityInScope(id, scope))) throw new HttpError(404, 'Activity not found');

  const success = await markAsRead(id, Number(user.id_user));
  if (!success) throw new HttpError(500, 'Failed to mark activity as read');
  const readerNames = await getReaderNames(id);
  legacyOk(res, { daily_control_id: id, unread_count: 0, reader_names: readerNames }, 'Activity marked as read');
}));

dailyControlRouter.get('/daily-control/summary', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const selectedDate = normalizeDate(req.query.date);
  const scope = getDivisionScope(user);
  const activities = await getActivitiesByDate(selectedDate, scope, null, null, Number(user.id_user));

  let pro = 0, cor = 0, prev = 0;
  for (const a of activities) {
    const kind = String(a.maintenance_kind ?? '');
    if (kind === 'Project') pro++;
    else if (kind === 'Preventive') prev++;
    else cor++;
  }
  const unread = await getTotalUnreadActivityCountForUser(Number(user.id_user), scope, null);
  ok(res, { date: selectedDate, pro, cor, prev, total_activities: activities.length, unread_count: unread });
}));

dailyControlRouter.get('/daily-control/activities', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const selectedDate = normalizeDate(req.query.date);
  const area = normalizeAreaKey(req.query.area);
  const sourceType = req.query.source_type ? String(req.query.source_type) : null;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page ?? 50)));
  const scope = getDivisionScope(user);

  const { items, total } = await getV2ActivityFeed(selectedDate, scope, sourceType, area, Number(user.id_user), page, perPage);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  ok(res, items, 'OK', { date: selectedDate, total, page, per_page: perPage, total_pages: totalPages, area, source_type: sourceType });
}));

dailyControlRouter.get('/daily-control/activity', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.query.id ?? 0);
  if (id <= 0) throw new HttpError(422, 'id is required');
  const scope = getDivisionScope(user);
  if (!(await isActivityInScope(id, scope))) throw new HttpError(404, 'Activity not found');

  const activity = await getActivityById(id, Number(user.id_user));
  if (!activity) throw new HttpError(404, 'Activity not found');
  ok(res, activity);
}));

dailyControlRouter.get('/daily-control/unread', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const scope = getDivisionScope(user);
  const count = await getTotalUnreadActivityCountForUser(Number(user.id_user), scope, null);
  const activities = await getUnreadActivitiesForUser(Number(user.id_user), scope, null, 100);
  ok(res, { count, activities });
}));

dailyControlRouter.post('/daily-control/read', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const scope = getDivisionScope(user);

  if (req.body.all === true || req.body.all === 'true') {
    const items = await getUnreadActivitiesForUser(Number(user.id_user), scope, null, 300);
    const marked: number[] = [];
    for (const item of items) {
      const id = Number(item.id);
      const success = await markAsRead(id, Number(user.id_user));
      if (success) marked.push(id);
    }
    ok(res, { marked, count: marked.length }, 'Semua aktivitas ditandai terbaca');
    return;
  }

  const id = Number(req.body.activity_id ?? req.body.daily_control_id ?? 0);
  if (id <= 0) throw new HttpError(422, 'activity_id is required');
  const success = await markAsRead(id, Number(user.id_user));
  if (!success) throw new HttpError(422, 'Failed to mark as read');
  ok(res, { activity_id: id }, 'Aktivitas ditandai terbaca');
}));

dailyControlRouter.get('/daily-control/comments', asyncHandler(async (req, res) => {
  const id = Number(req.query.activity_id ?? req.query.daily_control_id ?? 0);
  if (id <= 0) throw new HttpError(422, 'activity_id is required');
  ok(res, await getCommentsByDailyControl(id));
}));

dailyControlRouter.post('/daily-control/comment', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const id = Number(req.body.activity_id ?? req.body.daily_control_id ?? 0);
  const message = String(req.body.message ?? req.body.body ?? req.body.comment ?? '').trim();
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  if (id <= 0 || !message) throw new HttpError(422, 'activity_id and message are required');

  const divisionRow = await one<{ division_name: string }>('SELECT division_name FROM tb_division WHERE id_division=?', [user.id_division]);
  const commentId = await createComment(id, Number(user.id_user), user.fullname, divisionRow?.division_name ?? '', message, parentId);
  if (!commentId) throw new HttpError(422, 'Gagal mengirim komentar');

  const comment = await getCommentById(commentId);
  await notifyCommentRecipients(id, comment, Number(user.id_user), String(user.alias ?? user.fullname ?? 'User'));
  created(res, comment ?? { id: commentId }, 'Komentar terkirim');
}));

dailyControlRouter.get('/daily-control/mention-users', asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const scope = getDivisionScope(user);
  const teamUsers = await getTeamUsers(scope);

  const filtered = teamUsers.filter((u) => {
    const haystack = `${(u.alias as string) || ''} ${u.fullname} ${u.division_name ?? ''}`.toLowerCase();
    return !q || haystack.includes(q);
  }).slice(0, 20);

  const items = filtered.map((u) => {
    const label = (u.alias as string) || (u.fullname as string);
    return { id: u.id_user, label, fullname: u.fullname, division: u.division_name, insert_text: `@${label}` };
  });
  ok(res, items);
}));

dailyControlRouter.get('/daily-control/part-mentions', asyncHandler(async (req, res) => {
  const id = Number(req.query.activity_id ?? req.query.daily_control_id ?? 0);
  if (id <= 0) throw new HttpError(422, 'activity_id is required');
  const items = (await getActivityPartMentions(id)).map((item) => ({ ...item, label: item.part_name, insert_text: `#${item.part_name}` }));
  ok(res, items);
}));
