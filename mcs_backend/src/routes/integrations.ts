import { Router } from 'express';
import { authenticate, authenticateApiKey, requirePermission } from '../auth.js';
import { createApiClient, listApiClients, revokeApiClient } from '../lib/api-clients.js';
import { rows } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const integrationsRouter = Router();

const canManageClients = requirePermission('user_management');

/** Provisioning API key untuk sistem eksternal (mis. sistem IT) — dikelola admin lewat token user biasa. */
integrationsRouter.post('/integrations/api-clients', authenticate, canManageClients, asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const scope = String(req.body.scope ?? 'it-assets').trim();
  if (!name) throw new HttpError(422, 'name is required');
  const actor = (req as AuthRequest).user!.fullname;
  const result = await createApiClient(name, scope, actor);
  created(res, result, 'API client dibuat. Simpan key ini sekarang — tidak akan ditampilkan lagi.');
}));

integrationsRouter.get('/integrations/api-clients', authenticate, canManageClients, asyncHandler(async (_req, res) => {
  ok(res, await listApiClients());
}));

integrationsRouter.delete('/integrations/api-clients/:id', authenticate, canManageClients, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw new HttpError(422, 'id is required');
  const revoked = await revokeApiClient(id);
  if (!revoked) throw new HttpError(404, 'API client not found');
  ok(res, { id }, 'API client direvoke');
}));

/* ---------------- Pull endpoints untuk sistem eksternal (API key) ---------------- */

// Aset "milik IT" ditandai lewat `it_ownership_status` (independen dari
// Kategori) — satu kategori seperti Inventaris bisa campur aset IT & bukan,
// jadi filter kepemilikan tidak boleh ikut CategoryAsset.
const canPullItAssets = authenticateApiKey('it-assets');

integrationsRouter.get('/integrations/it-assets', canPullItAssets, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(500, Math.max(1, Number(req.query.per_page ?? 100)));
  const offset = (page - 1) * perPage;

  const [items, totalRow] = await Promise.all([
    rows<Record<string, unknown>>(
      `SELECT AssetID, AssetCode, AssetName, AliasName, brand, CompanyName, CategoryAsset, LocationAsset,
              it_ownership_status, active, status, created_at, updated_at
       FROM asset WHERE it_ownership_status IS NOT NULL ORDER BY AssetID ASC LIMIT ? OFFSET ?`,
      [perPage, offset],
    ),
    rows<{ total: number }>('SELECT COUNT(*) AS total FROM asset WHERE it_ownership_status IS NOT NULL'),
  ]);

  ok(res, items, 'OK', { page, per_page: perPage, total: totalRow[0]?.total ?? 0 });
}));

integrationsRouter.get('/integrations/it-work-orders', canPullItAssets, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(500, Math.max(1, Number(req.query.per_page ?? 100)));
  const offset = (page - 1) * perPage;
  const updatedSince = req.query.updated_since ? String(req.query.updated_since) : null;

  const where: string[] = ["a.it_ownership_status IS NOT NULL"];
  const params: unknown[] = [];
  if (updatedSince) { where.push('w.updated_at >= ?'); params.push(updatedSince); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [items, totalRow] = await Promise.all([
    rows<Record<string, unknown>>(
      `SELECT w.wo_number, w.date, w.status, w.priority, w.job_title, w.job_requirement, w.job_explanation,
              w.started_planner, w.finished_planner, w.started_actual, w.finished_actual,
              w.creator, w.pic, w.created_at, w.updated_at,
              a.AssetID, a.AssetCode, a.AssetName
       FROM tb_wo_it w
       JOIN asset a ON a.AssetID = w.id_equipment
       ${whereSql}
       ORDER BY w.updated_at DESC, w.wo_number DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    ),
    rows<{ total: number }>(
      `SELECT COUNT(*) AS total FROM tb_wo_it w JOIN asset a ON a.AssetID = w.id_equipment ${whereSql}`,
      params,
    ),
  ]);

  ok(res, items, 'OK', { page, per_page: perPage, total: totalRow[0]?.total ?? 0 });
}));
