import { clientIp } from './lib/client-ip.js';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { execute } from './db.js';

const MODULE_RULES: [string, string][] = [
  ['auth/', 'Authentication'],
  ['mcs-mobile', 'MCS Mobile'],
  ['mcs_mobile', 'MCS Mobile'],
  ['work-orders', 'Work Order'],
  ['wo_', 'Work Order'],
  ['daily', 'Daily Control'],
  ['material', 'Material Usage'],
  ['asset-mutation', 'Asset Mutation'],
  ['preventive', 'Preventive Schedule'],
  ['asset', 'Asset'],
  ['equipment', 'Asset'],
  ['master', 'Master Data'],
  ['setting', 'Settings'],
  ['branding', 'Settings'],
];

const REDACT_KEY = /password|token|authorization/i;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_system_activity_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    module VARCHAR(80) NOT NULL,
    action VARCHAR(120) NOT NULL,
    reference VARCHAR(255) NOT NULL DEFAULT '',
    route VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    outcome VARCHAR(16) NOT NULL,
    http_status SMALLINT NOT NULL,
    actor_id BIGINT NULL,
    actor_username VARCHAR(100) NOT NULL DEFAULT '',
    actor_fullname VARCHAR(255) NOT NULL DEFAULT '',
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    request_data MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_system_audit_created (created_at),
    KEY idx_system_audit_module (module),
    KEY idx_system_audit_actor (actor_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  tableReady = true;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEY.test(key) ? '[REDACTED]' : redact(val);
    }
    return out;
  }
  return value;
}

interface Actor { id: number | null; username: string; fullname: string }

function actorFromToken(req: Request): Actor {
  const header = req.header('authorization');
  const raw = header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
  if (raw) {
    try {
      const payload = jwt.verify(raw, config.jwtSecret, { algorithms: ['HS256'] }) as Record<string, unknown>;
      return {
        id: Number.isFinite(Number(payload.id_user)) ? Number(payload.id_user) : null,
        username: String(payload.username ?? ''),
        fullname: String(payload.fullname ?? ''),
      };
    } catch {
      return { id: null, username: '', fullname: '' };
    }
  }
  return { id: null, username: '', fullname: '' };
}

function moduleFor(path: string): string {
  const lower = path.toLowerCase();
  for (const [needle, label] of MODULE_RULES) if (lower.includes(needle)) return label;
  return 'System';
}

function actionFor(path: string, method: string): string {
  if (path.includes('auth/login')) return 'Login';
  if (path.includes('logout')) return 'Logout';
  if (path.includes('password')) return 'Change Password';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const label = last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${method} ${label}`;
}

function referenceFor(body: Record<string, unknown>): string {
  const value = body.wo_number ?? body.reference ?? body.doc_no ?? body.asset_code ?? body.username ?? body.id ?? '';
  return String(value).slice(0, 255);
}

interface AuditResponseBody {
  success?: boolean;
  status?: boolean;
  data?: { user?: { id_user?: number; username?: string; fullname?: string } };
}

async function record(req: Request, statusCode: number, responseBody: unknown): Promise<void> {
  const method = req.method.toUpperCase();
  const path = req.originalUrl.split('?')[0].replace(/^\/+/, '');
  if (!MUTATING_METHODS.has(method) || !path.startsWith('api/')) return;

  try {
    await ensureTable();
    const body = redact({ ...(req.body ?? {}) }) as Record<string, unknown>;
    const parsed = responseBody as AuditResponseBody | null;

    let actor = actorFromToken(req);
    const loginUser = parsed?.data?.user;
    if (loginUser) {
      actor = {
        id: typeof loginUser.id_user === 'number' ? loginUser.id_user : actor.id,
        username: loginUser.username ?? actor.username,
        fullname: loginUser.fullname ?? actor.fullname,
      };
    }

    const success = statusCode < 400 && !(parsed && (parsed.success === false || parsed.status === false));

    await execute(
      `INSERT INTO tb_system_activity_log
       (module, action, reference, route, method, outcome, http_status, actor_id, actor_username, actor_fullname, ip_address, user_agent, request_data, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        moduleFor(path), actionFor(path, method), referenceFor(body), path.slice(0, 255), method,
        success ? 'success' : 'failed', statusCode, actor.id, actor.username.slice(0, 100), actor.fullname.slice(0, 255),
        clientIp(req).ip.slice(0, 64), String(req.header('user-agent') ?? '').slice(0, 500),
        JSON.stringify(body).slice(0, 30000),
      ],
    );
  } catch {
    return;
  }
}

export function systemAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  let captured: unknown;
  res.json = ((body: unknown) => {
    captured = body;
    return originalJson(body);
  }) as Response['json'];

  res.on('finish', () => {
    void record(req, res.statusCode, captured);
  });

  next();
}
