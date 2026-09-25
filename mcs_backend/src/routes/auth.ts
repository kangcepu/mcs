import { clientIp } from '../lib/client-ip.js';
import { Router } from 'express';
import { z } from 'zod';
import { applyAutomaticAccess, authenticate, findUserByCredentials, findUserById, findUserByIdentity, isPasswordEmpty, md5, publicUser, publicUserWithEmployee, requiresPasswordChange, signToken, syncEmployeeStatusFromApi } from '../auth.js';
import { execute } from '../db.js';
import { asyncHandler, HttpError, legacyOk, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

const credentials = z.object({ username: z.string().trim().min(1), password: z.string() });
export const authRouter = Router();

authRouter.post('/auth/login', asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  let user = input.password !== '' ? await findUserByCredentials(input.username, input.password) : null;
  if (!user && input.password === '') {
    const byIdentity = await findUserByIdentity(input.username);
    if (byIdentity && isPasswordEmpty(byIdentity)) user = byIdentity;
  }
  if (!user) throw new HttpError(401, 'Invalid username or password');

  user = await syncEmployeeStatusFromApi(user);
  if (Number(user.active) !== 1) throw new HttpError(403, 'This account is not active');
  user = applyAutomaticAccess(user);

  if (requiresPasswordChange(user)) {
    const message = isPasswordEmpty(user)
      ? 'Password akun belum diatur. Silakan buat password baru terlebih dahulu.'
      : 'Password default terdeteksi. Silakan ganti password terlebih dahulu.';
    legacyOk(res, {
      requires_password_change: true,
      change_password_endpoint: '/api/auth/change_password',
      user: { id_user: user.id_user, username: user.username, fullname: user.fullname, email: user.email ?? '' },
    }, message);
    return;
  }

  const data = { requires_password_change: false, token: signToken(user), token_type: 'Bearer', expires_in: 86400, user: publicUser(user) };
  legacyOk(res, data, 'Login successful');
}));

authRouter.post('/auth/change_password', asyncHandler(async (req, res) => {
  const input = z.object({ username: z.string().min(1), current_password: z.string().optional().default(''), password: z.string().min(1), confirm_password: z.string().min(1) }).parse(req.body);
  if (input.password !== input.confirm_password) throw new HttpError(400, 'Confirm password does not match');

  let user = input.current_password !== '' ? await findUserByCredentials(input.username, input.current_password) : null;
  if (!user && input.current_password === '') {
    const byIdentity = await findUserByIdentity(input.username);
    if (byIdentity && isPasswordEmpty(byIdentity)) user = byIdentity;
  }
  if (!user) throw new HttpError(401, 'Invalid username or current password');

  user = applyAutomaticAccess(user);
  if (Number(user.active) !== 1) throw new HttpError(403, 'This account is not active');
  if (!isPasswordEmpty(user) && md5(input.password) === md5(input.current_password)) {
    throw new HttpError(400, 'New password must be different from current password');
  }

  await execute('UPDATE tb_user SET password = ?, force_password_change = 0, updated_at = NOW() WHERE id_user = ?', [md5(input.password), user.id_user]);
  legacyOk(res, { requires_password_change: false }, 'Password changed successfully');
}));

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, await publicUserWithEmployee((req as AuthRequest).user!), 'OK')));
authRouter.get('/auth/profile', authenticate, asyncHandler(async (req, res) => legacyOk(res, await publicUserWithEmployee((req as AuthRequest).user!), 'OK')));
authRouter.post('/auth/validate', authenticate, asyncHandler(async (req, res) => legacyOk(res, { valid: true, user: publicUser((req as AuthRequest).user!) }, 'Token valid')));
authRouter.post('/auth/logout', authenticate, asyncHandler(async (req, res) => legacyOk(res, { user: publicUser((req as AuthRequest).user!) }, 'Logout successful')));

const registerDeviceInput = z.object({
  token: z.string().min(1),
  platform: z.string().optional().default('unknown'),
  device_name: z.string().optional().default(''),
  app_version: z.string().optional().default(''),
  build_number: z.string().optional().default(''),
  previous_token: z.string().optional().default(''),
});

authRouter.post('/auth/register_device_token', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const input = registerDeviceInput.parse(req.body);
  const ipAddress = clientIp(req).ip;

  if (input.previous_token && input.previous_token !== input.token) {
    await execute('UPDATE tb_user_device_token SET is_active = 0, updated_at = NOW() WHERE token = ?', [input.previous_token]);
  }

  await execute(
    `INSERT INTO tb_user_device_token (id_user, token, platform, device_name, app_version, build_number, ip_address, is_active, last_seen_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE id_user=VALUES(id_user), platform=VALUES(platform), device_name=VALUES(device_name),
       app_version=VALUES(app_version), build_number=VALUES(build_number), ip_address=VALUES(ip_address),
       is_active=1, last_seen_at=NOW(), updated_at=NOW()`,
    [authReq.user!.id_user, input.token, input.platform, input.device_name, input.app_version, input.build_number, ipAddress],
  );
  legacyOk(res, null, 'Device token registered');
}));

authRouter.post('/auth/unregister_device_token', authenticate, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const input = z.object({ token: z.string().min(1) }).parse(req.body);
  await execute('UPDATE tb_user_device_token SET is_active = 0, updated_at = NOW() WHERE id_user = ? AND token = ?', [authReq.user!.id_user, input.token]);
  legacyOk(res, null, 'Device token unregistered');
}));
