import { Router } from 'express';
import { authenticate } from '../auth.js';
import { asyncHandler, ok } from '../http.js';
import {
  getPendingWoApprovals,
  getPendingWoClosings,
  getPendingMaterialRequests,
} from '../lib/approval-center.js';
import { getAssignedNcrDue, getAssignedStockOpnameSchedules, getMissingAssetPics, getUnlockedStockOpnames, getValidationQueue, getWoTodo } from '../lib/my-work.js';
import type { AuthRequest } from '../types.js';
import { getPreventiveCoverageAssets } from '../lib/preventive-coverage.js';

export const myWorkRouter = Router();

const PREVIEW_LIMIT = 5;

/**
 * "My Work" di Dashboard — ringkasan pekerjaan personal, isinya beda per
 * user sesuai hak akses & posisinya (sama persis logic yang sudah dipakai
 * Approval Center buat 3 kategori pertama; 2 kategori terakhir baru).
 */
myWorkRouter.get('/my-work/summary', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

  const [validations, validationApprovals, validationReturned, closeReviews, ncrDue,
    woApprovals, woClosings, materials, woTodo, soSchedules, soUnlocked, preventiveMissing, assetMissingPic] = await Promise.all([
    getValidationQueue(user, 'validation_pending'),
    getValidationQueue(user, 'validation_approval'),
    getValidationQueue(user, 'validation_returned'),
    getValidationQueue(user, 'validation_close_review'),
    getAssignedNcrDue(user),
    getPendingWoApprovals(user),
    getPendingWoClosings(user),
    getPendingMaterialRequests(user),
    getWoTodo(user),
    getAssignedStockOpnameSchedules(user),
    getUnlockedStockOpnames(token, user),
    getPreventiveCoverageAssets(user),
    getMissingAssetPics(user),
  ]);

  const categories = [
    {
      key: 'validation_pending',
      label: 'Menunggu Validasi',
      count: validations.length,
      items: validations.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'validation_approval',
      label: 'Menunggu Approval',
      count: validationApprovals.length,
      items: validationApprovals.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'validation_returned',
      label: 'Dikembalikan ke Saya',
      count: validationReturned.length,
      items: validationReturned.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'validation_close_review',
      label: 'Menunggu Close Review',
      count: closeReviews.length,
      items: closeReviews.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'ncr_due',
      label: 'NCR Due',
      count: ncrDue.length,
      items: ncrDue.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'wo_approvals',
      label: 'Approve WO',
      count: woApprovals.length,
      items: woApprovals.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'wo_closings',
      label: 'Tutup WO',
      count: woClosings.length,
      items: woClosings.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'materials',
      label: 'Part Perlu Diisi',
      count: materials.length,
      items: materials.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'wo_todo',
      label: 'WO Belum Dikerjakan',
      count: woTodo.length,
      items: woTodo.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'preventive_missing',
      label: 'Asset Belum Terjadwal',
      count: preventiveMissing.length,
      items: preventiveMissing.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'asset_missing_pic',
      label: 'Aset Belum Memiliki PIC',
      count: assetMissingPic.length,
      items: assetMissingPic.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'stock_opname_schedule',
      label: 'Jadwal Stock Opname',
      count: soSchedules.length,
      items: soSchedules.slice(0, PREVIEW_LIMIT),
    },
    {
      key: 'stock_opname_unlocked',
      label: 'Stock Opname Belum Dikunci',
      count: soUnlocked.length,
      items: soUnlocked.slice(0, PREVIEW_LIMIT),
    },
  ];

  ok(res, {
    categories,
    total: categories.reduce((sum, c) => sum + c.count, 0),
  });
}));

const CATEGORY_SEARCH_KEYS: Record<string, string[]> = {
  validation_pending: ['request_number', 'source_reference', 'title', 'description', 'module_code', 'company', 'asset_code', 'maker_name'],
  validation_approval: ['request_number', 'source_reference', 'title', 'description', 'module_code', 'company', 'asset_code', 'maker_name'],
  validation_returned: ['request_number', 'source_reference', 'title', 'description', 'module_code', 'company', 'asset_code', 'return_reason'],
  validation_close_review: ['request_number', 'source_reference', 'title', 'description', 'module_code', 'company', 'asset_code', 'maker_name'],
  ncr_due: ['source_reference', 'title', 'description', 'module_code', 'asset_code', 'assigned_to'],
  wo_approvals: ['wo_number', 'job_title', 'asset_name', 'company'],
  wo_closings: ['wo_number', 'job_title', 'asset_name', 'company'],
  materials: ['wo_number', 'job_title', 'request_code', 'requested_by_name'],
  wo_todo: ['wo_number', 'job_title', 'asset_name'],
  stock_opname_unlocked: ['no_so'],
  stock_opname_schedule: ['schedule_name', 'no_so', 'next_run_date'],
  preventive_missing: ['asset_code', 'asset_name', 'company', 'location', 'mtc_area_label'],
  asset_missing_pic: ['asset_code', 'asset_name', 'company', 'location', 'category'],
};

/** Daftar lengkap (berpaginasi + bisa dicari) untuk 1 kategori — dipakai halaman /my-work saat 1 tab dipilih. */
myWorkRouter.get('/my-work/list', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const category = String(req.query.category ?? '').trim();
  const q = String(req.query.q ?? '').toLowerCase().trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 10)));

  let items: Record<string, unknown>[];
  switch (category) {
    case 'validation_pending': items = await getValidationQueue(user, 'validation_pending'); break;
    case 'validation_approval': items = await getValidationQueue(user, 'validation_approval'); break;
    case 'validation_returned': items = await getValidationQueue(user, 'validation_returned'); break;
    case 'validation_close_review': items = await getValidationQueue(user, 'validation_close_review'); break;
    case 'ncr_due': items = await getAssignedNcrDue(user); break;
    case 'wo_approvals': items = await getPendingWoApprovals(user) as unknown as Record<string, unknown>[]; break;
    case 'wo_closings': items = await getPendingWoClosings(user) as unknown as Record<string, unknown>[]; break;
    case 'materials': items = await getPendingMaterialRequests(user) as unknown as Record<string, unknown>[]; break;
    case 'wo_todo': items = await getWoTodo(user) as unknown as Record<string, unknown>[]; break;
    case 'stock_opname_unlocked': items = await getUnlockedStockOpnames(token, user) as unknown as Record<string, unknown>[]; break;
    case 'stock_opname_schedule': items = await getAssignedStockOpnameSchedules(user); break;
    case 'preventive_missing': items = await getPreventiveCoverageAssets(user) as unknown as Record<string, unknown>[]; break;
    case 'asset_missing_pic': items = await getMissingAssetPics(user) as unknown as Record<string, unknown>[]; break;
    default: items = [];
  }

  const keys = CATEGORY_SEARCH_KEYS[category] ?? [];
  let filtered = items;
  if (q && keys.length) {
    filtered = items.filter((row) => keys.some((key) => String(row[key] ?? '').toLowerCase().includes(q)));
  }

  const total = filtered.length;
  const start = (page - 1) * perPage;
  const data = filtered.slice(start, start + perPage);
  ok(res, data, 'OK', { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
}));
