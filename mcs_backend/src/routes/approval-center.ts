import { Router } from 'express';
import {
  approveMutation,
  approveWo,
  canVoidWorkOrder,
  closeWo,
  countPendingAssetMutations,
  countPendingMaterialRequests,
  countPendingWoApprovals,
  countPendingWoClosings,
  getCategoryCounts,
  getPendingAssetMutations,
  getPendingMaterialRequests,
  getPendingWoApprovals,
  getPendingWoClosings,
  isFinalWorkOrder,
  isManagementRole,
  isPendingAssetMutation,
  isPendingWoApproval,
  isPendingWoClosing,
  MODULE_MAP,
  rejectMutation,
  rejectWo,
  voidWo,
} from '../lib/approval-center.js';
import { authenticate } from '../auth.js';
import { asyncHandler, HttpError, ok } from '../http.js';
import { getVoidCenterList } from '../lib/void-center.js';
import type { AuthRequest } from '../types.js';

export const approvalCenterRouter = Router();

function paginate<T extends { module_key?: string; wo_number?: string; job_title?: string; asset_name?: string; company?: string; doc_no?: string }>(
  req: import('express').Request, items: T[], canDecide: boolean,
): { data: (T & { can_decide: boolean })[]; meta: Record<string, unknown> } {
  const page = Math.max(1, Number(req.query.page ?? 1));
  let perPage = Number(req.query.per_page ?? 25);
  if (!(perPage > 0)) perPage = 25;
  if (perPage > 200) perPage = 200;
  const q = String(req.query.q ?? '').toLowerCase().trim();
  const module = String(req.query.module ?? '').toLowerCase().trim();

  let filtered = items;
  if (module) filtered = filtered.filter((row) => String(row.module_key ?? '').toLowerCase().trim() === module);
  if (q) {
    filtered = filtered.filter((row) =>
      ['wo_number', 'job_title', 'asset_name', 'company', 'doc_no'].some((key) =>
        String((row as Record<string, unknown>)[key] ?? '').toLowerCase().includes(q)));
  }

  const withDecide = filtered.map((row) => ({ ...row, can_decide: canDecide }));
  const total = withDecide.length;
  const slice = withDecide.slice((page - 1) * perPage, page * perPage);
  return { data: slice, meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

approvalCenterRouter.get('/approval-center/summary', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const [woApprovals, woClosings, mutations, materials, categories] = await Promise.all([
    countPendingWoApprovals(user), countPendingWoClosings(user), countPendingAssetMutations(user),
    countPendingMaterialRequests(user), getCategoryCounts(user),
  ]);
  ok(res, {
    wo_approvals: woApprovals, wo_closings: woClosings, materials, mutations,
    total: woApprovals + woClosings + materials + mutations,
    categories, can_decide: !isManagementRole(user),
  });
}));

approvalCenterRouter.get('/approval-center/wo-approvals', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const { data, meta } = paginate(req, await getPendingWoApprovals(user), !isManagementRole(user));
  ok(res, data, undefined, meta);
}));

approvalCenterRouter.get('/approval-center/wo-closings', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const { data, meta } = paginate(req, await getPendingWoClosings(user), !isManagementRole(user));
  ok(res, data, undefined, meta);
}));

approvalCenterRouter.get('/approval-center/materials', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const { data, meta } = paginate(req, await getPendingMaterialRequests(user), false);
  ok(res, data, undefined, meta);
}));

approvalCenterRouter.get('/approval-center/mutations', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const { data, meta } = paginate(req, await getPendingAssetMutations(user), !isManagementRole(user));
  ok(res, data, undefined, meta);
}));

async function woDecision(req: AuthRequest, res: import('express').Response, action: 'approve' | 'reject' | 'close' | 'void'): Promise<void> {
  const user = req.user!;
  if (isManagementRole(user)) throw new HttpError(403, 'User management hanya dapat melihat approval.', 'APPROVAL_VIEW_ONLY');

  const body = req.body;
  const module = String(body.module ?? '').toLowerCase().trim();
  const woNumber = String(body.wo_number ?? '').trim();
  let comment = String(body.comment ?? '').trim();
  if (!comment) comment = `${action.charAt(0).toUpperCase()}${action.slice(1)} via Approval Center (web)`;

  if (!module || !woNumber) throw new HttpError(422, 'module and wo_number are required', 'APPROVAL_INPUT_REQUIRED');
  if (!MODULE_MAP[module]) throw new HttpError(422, 'Unknown WO module', 'APPROVAL_MODULE_UNKNOWN');

  if (action === 'approve' && !(await isPendingWoApproval(user, module, woNumber))) {
    throw new HttpError(403, 'WO is not available for approval by this user', 'APPROVAL_NOT_PENDING');
  }
  if (action === 'close' && !(await isPendingWoClosing(user, module, woNumber))) {
    throw new HttpError(403, 'WO is not available for closing by this user', 'APPROVAL_NOT_PENDING');
  }
  if (action === 'void') {
    if (!canVoidWorkOrder(user)) throw new HttpError(403, 'Anda tidak memiliki permission void untuk Work Order.', 'WO_VOID_FORBIDDEN');
    if (await isFinalWorkOrder(module, woNumber)) throw new HttpError(422, 'Work Order sudah final dan tidak dapat di-void.', 'WO_ALREADY_FINAL');
  }

  try {
    if (action === 'approve') await approveWo(module, woNumber, user, comment);
    else if (action === 'reject') await rejectWo(module, woNumber, user, comment);
    else if (action === 'close') await closeWo(module, woNumber, user, comment);
    else await voidWo(module, woNumber, user, comment);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, `Failed to ${action} WO: ${error instanceof Error ? error.message : String(error)}`, 'APPROVAL_ENGINE_ERROR');
  }

  ok(res, { module, wo_number: woNumber, action }, `WO ${action} berhasil`);
}

approvalCenterRouter.post('/approval-center/wo-approve', authenticate, asyncHandler((req, res) => woDecision(req as AuthRequest, res, 'approve')));
approvalCenterRouter.post('/approval-center/wo-reject', authenticate, asyncHandler((req, res) => woDecision(req as AuthRequest, res, 'reject')));
approvalCenterRouter.post('/approval-center/wo-close', authenticate, asyncHandler((req, res) => woDecision(req as AuthRequest, res, 'close')));
approvalCenterRouter.post('/approval-center/wo-void', authenticate, asyncHandler((req, res) => woDecision(req as AuthRequest, res, 'void')));

approvalCenterRouter.get('/void-center', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  if (!canVoidWorkOrder(user)) throw new HttpError(403, 'Anda tidak memiliki permission void untuk Work Order.', 'WO_VOID_FORBIDDEN');
  const { data, meta } = await getVoidCenterList({
    module: String(req.query.module ?? ''),
    q: String(req.query.q ?? ''),
    date_from: String(req.query.date_from ?? ''),
    date_to: String(req.query.date_to ?? ''),
    page: Number(req.query.page ?? 1),
    per_page: Number(req.query.per_page ?? 25),
  }, user);
  ok(res, data, undefined, meta);
}));

approvalCenterRouter.post('/void-center/void', authenticate, asyncHandler((req, res) => woDecision(req as AuthRequest, res, 'void')));

async function mutationDecision(req: AuthRequest, res: import('express').Response, action: 'approve' | 'reject'): Promise<void> {
  const user = req.user!;
  if (isManagementRole(user)) throw new HttpError(403, 'User management hanya dapat melihat approval.', 'APPROVAL_VIEW_ONLY');

  const docNo = String(req.body.doc_no ?? '').trim();
  if (!docNo) throw new HttpError(422, 'doc_no is required', 'MUTATION_DOC_REQUIRED');

  if (!(await isPendingAssetMutation(user, docNo))) {
    throw new HttpError(403, 'Mutation document is not available for approval by this user', 'MUTATION_NOT_PENDING');
  }

  try {
    if (action === 'approve') await approveMutation(docNo, user);
    else await rejectMutation(docNo);
  } catch (error) {
    throw new HttpError(500, `Failed to ${action} mutation: ${error instanceof Error ? error.message : String(error)}`, 'MUTATION_ENGINE_ERROR');
  }

  ok(res, { doc_no: docNo, action }, `Mutation ${action} berhasil`);
}

approvalCenterRouter.post('/approval-center/mutation-approve', authenticate, asyncHandler((req, res) => mutationDecision(req as AuthRequest, res, 'approve')));
approvalCenterRouter.post('/approval-center/mutation-reject', authenticate, asyncHandler((req, res) => mutationDecision(req as AuthRequest, res, 'reject')));
