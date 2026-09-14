import { Router } from 'express';
import { z } from 'zod';
import { authenticate, findUserByCredentials, findUserById, md5, publicUser, signToken } from '../auth.js';
import { execute } from '../db.js';
import { asyncHandler, HttpError, legacyOk, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

const credentials = z.object({ username: z.string().trim().min(1), password: z.string() });
export const authRouter = Router();

authRouter.post('/auth/login', asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await findUserByCredentials(input.username, input.password);
  if (!user) throw new HttpError(401, 'Invalid username or password');
  if (Number(user.active) !== 1) throw new HttpError(403, 'This account is not active');
  const data = { requires_password_change: false, token: signToken(user), token_type: 'Bearer', expires_in: 86400, user: publicUser(user) };
  legacyOk(res, data, 'Login successful');
}));

authRouter.post('/auth/change_password', asyncHandler(async (req, res) => {
  const input = z.object({ username: z.string().min(1), current_password: z.string().optional().default(''), password: z.string().min(1), confirm_password: z.string().min(1) }).parse(req.body);
  if (input.password !== input.confirm_password) throw new HttpError(400, 'Confirm password does not match');
  const user = await findUserByCredentials(input.username, input.current_password);
  if (!user) throw new HttpError(401, 'Invalid username or current password');
  if (md5(input.password) === md5(input.current_password)) throw new HttpError(400, 'New password must be different from current password');
  await execute('UPDATE tb_user SET password = ?, updated_at = NOW() WHERE id_user = ?', [md5(input.password), user.id_user]);
  legacyOk(res, { requires_password_change: false }, 'Password changed successfully');
}));

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, publicUser((req as AuthRequest).user!), 'OK')));
authRouter.get('/auth/profile', authenticate, asyncHandler(async (req, res) => legacyOk(res, publicUser((req as AuthRequest).user!), 'OK')));
authRouter.post('/auth/validate', authenticate, asyncHandler(async (req, res) => legacyOk(res, { valid: true, user: publicUser((req as AuthRequest).user!) }, 'Token valid')));
authRouter.post('/auth/logout', authenticate, asyncHandler(async (req, res) => legacyOk(res, { user: publicUser((req as AuthRequest).user!) }, 'Logout successful')));

async function deviceToken(req: AuthRequest, res: import('express').Response, deleted = false): Promise<void> {
  const input = z.object({ token: z.string().min(1), platform: z.string().optional().default('unknown') }).parse(req.body);
  if (deleted) await execute('DELETE FROM tb_user_device_token WHERE id_user = ? AND token = ?', [req.user!.id_user, input.token]);
  else await execute(`INSERT INTO tb_user_device_token (id_user, token, platform, updated_at, created_at) VALUES (?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE id_user=VALUES(id_user), platform=VALUES(platform), updated_at=NOW()`, [req.user!.id_user, input.token, input.platform]);
  legacyOk(res, null, deleted ? 'Device token unregistered' : 'Device token registered');
}
authRouter.post('/auth/register_device_token', authenticate, asyncHandler(async (req, res) => deviceToken(req as AuthRequest, res)));
authRouter.post('/auth/unregister_device_token', authenticate, asyncHandler(async (req, res) => deviceToken(req as AuthRequest, res, true)));
