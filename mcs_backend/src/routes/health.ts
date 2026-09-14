import { Router } from 'express';
import { one } from '../db.js';
import { asyncHandler, ok } from '../http.js';

export const healthRouter = Router();
healthRouter.get(['/health', ''], asyncHandler(async (_req, res) => {
  await one('SELECT 1 AS connected');
  ok(res, { service: 'mcs-backend', database: 'connected', time: new Date().toISOString() }, 'Healthy');
}));
healthRouter.get('/info', (_req, res) => ok(res, { name: 'MCS API v2', version: '2.0', auth: true, native_v2: true }, 'MCS API v2'));
