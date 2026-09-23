import crypto from 'node:crypto';
import { execute, one, rows } from '../db.js';

export interface ApiClient {
  id: number;
  name: string;
  key_prefix: string;
  scope: string;
  is_active: number;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function createApiClient(name: string, scope: string, actor: string): Promise<{ id: number; key: string }> {
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `mcs_${secret}`;
  const prefix = key.slice(0, 12);
  const result = await execute(
    'INSERT INTO tb_api_client (name, key_prefix, key_hash, scope, created_by) VALUES (?,?,?,?,?)',
    [name, prefix, hashKey(key), scope, actor],
  );
  return { id: result.insertId, key };
}

export async function listApiClients(): Promise<ApiClient[]> {
  return rows<ApiClient>('SELECT id, name, key_prefix, scope, is_active, created_by, created_at, last_used_at FROM tb_api_client ORDER BY id DESC');
}

export async function revokeApiClient(id: number): Promise<boolean> {
  const result = await execute('UPDATE tb_api_client SET is_active=0 WHERE id=?', [id]);
  return result.affectedRows > 0;
}

export async function verifyApiKey(key: string, requiredScope?: string): Promise<ApiClient | null> {
  const client = await one<ApiClient>('SELECT * FROM tb_api_client WHERE key_hash=? AND is_active=1', [hashKey(key)]);
  if (!client) return null;
  if (requiredScope && client.scope !== requiredScope) return null;
  await execute('UPDATE tb_api_client SET last_used_at=NOW() WHERE id=?', [client.id]);
  return client;
}
