import { Router } from 'express';
import { authenticate } from '../auth.js';
import { asyncHandler, ok } from '../http.js';
import { getDashboard } from '../lib/dashboard.js';
import type { AuthRequest } from '../types.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const data = await getDashboard(user, {
    range: req.query.range as string | undefined,
    company: req.query.company as string | undefined,
    module: req.query.module as string | undefined,
  });
  ok(res, data);
}));
