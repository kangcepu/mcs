import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { authenticate } from './auth.js';
import { rows } from './db.js';
import type { AuthRequest } from './types.js';

export interface RealtimeEvent {
  topics: string[];
  module?: string;
  wo_number?: string;
  source: 'api' | 'db';
}

interface Client {
  res: Response;
  userId: number;
  kind: 'mobile' | 'web';
  userAgent: string;
  connectedAt: number;
  lastWriteAt: number;
}

const startedAt = Date.now();
const stats = {
  pollCount: 0,
  lastPollAt: 0,
  lastPollOk: true,
  lastPollMs: 0,
  lastChangeAt: 0,
  lastEventAt: 0,
  eventCount: 0,
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HEARTBEAT_MS = 20_000;
const WATCH_INTERVAL_MS = 5_000;
const WO_MODULES = ['is', 'ga', 'meso', 'maintenance', 'production'];

const clients = new Set<Client>();
const lastMobileDisconnect = new Map<number, number>();
let eventSeq = 0;

export function publishRealtime(event: RealtimeEvent): void {
  if (clients.size === 0) return;
  eventSeq += 1;
  stats.eventCount += 1;
  stats.lastEventAt = Date.now();
  const payload = JSON.stringify({ id: eventSeq, ts: Date.now(), ...event, topics: [...new Set(event.topics)] });
  for (const client of clients) {
    try {
      client.res.write(`id: ${eventSeq}\nevent: change\ndata: ${payload}\n\n`);
      client.lastWriteAt = Date.now();
    } catch {
      clients.delete(client);
    }
  }
}

function woTopics(module?: string): string[] {
  const base = ['wo', 'dashboard', 'approval', 'daily-control'];
  return module && WO_MODULES.includes(module) ? [...base, `wo:${module}`] : base;
}

function topicsFor(path: string, body: Record<string, unknown>): { topics: string[]; module?: string } | null {
  const trimmed = path.replace(/^api\/v2\//, '').replace(/^api\//, '');
  const [head = ''] = trimmed.split('/');
  if (head === 'auth' || head === 'realtime' || head === 'media' || head === 'profile') return null;

  if (WO_MODULES.includes(head)) return { topics: woTopics(head), module: head };
  if (head === 'work-orders') {
    const module = String(body.module ?? '').toLowerCase();
    return { topics: woTopics(module), module: WO_MODULES.includes(module) ? module : undefined };
  }
  if (head === 'approval-center' || head === 'void-center') return { topics: [...woTopics(), 'asset-mutation'] };
  if (head === 'daily-control') return { topics: ['daily-control', 'dashboard'] };
  if (head === 'asset-mutations') return { topics: ['asset-mutation', 'assets', 'approval', 'dashboard'] };
  if (head === 'assets' || head === 'equipment') return { topics: ['assets', 'dashboard'] };
  if (head === 'material' || head === 'materials' || head === 'material-usage') return { topics: ['material', 'wo', 'dashboard'] };
  if (head === 'schedules' || head === 'preventive-schedules' || head === 'preventive') return { topics: ['preventive', 'wo', 'dashboard'] };
  if (head === 'master') return { topics: ['master'] };
  if (head === 'mcs-mobile') return { topics: ['mcs-mobile'] };
  return { topics: ['any'] };
}

export function realtimeMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (res.statusCode >= 400 || !MUTATING_METHODS.has(req.method.toUpperCase())) return;
    const path = req.originalUrl.split('?')[0].replace(/^\/+/, '');
    if (!path.startsWith('api/')) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const resolved = topicsFor(path, body);
    if (!resolved) return;
    const woNumber = body.wo_number ?? req.query.wo_number;
    publishRealtime({
      topics: resolved.topics,
      module: resolved.module,
      wo_number: woNumber ? String(woNumber) : undefined,
      source: 'api',
    });
  });
  next();
}

interface WatchSpec {
  table: string;
  column: 'updated_at' | 'created_at';
  topics: string[];
  module?: string;
}

const WATCHES: WatchSpec[] = [
  { table: 'tb_wo_mtc', column: 'updated_at', topics: woTopics('meso'), module: 'meso' },
  { table: 'tb_wo_mtc_operational', column: 'updated_at', topics: woTopics('maintenance'), module: 'maintenance' },
  { table: 'tb_wo_preventive', column: 'updated_at', topics: woTopics('production'), module: 'production' },
  { table: 'tb_wo_it', column: 'updated_at', topics: woTopics('is'), module: 'is' },
  { table: 'tb_wo_ga', column: 'updated_at', topics: woTopics('ga'), module: 'ga' },
  { table: 'tb_approval', column: 'created_at', topics: ['approval', 'wo', 'dashboard'] },
  { table: 'tb_approval_it', column: 'created_at', topics: ['approval', 'wo', 'dashboard'], module: 'is' },
  { table: 'tb_approval_operational', column: 'created_at', topics: ['approval', 'wo', 'dashboard'], module: 'maintenance' },
  { table: 'tb_approval_preventive', column: 'created_at', topics: ['approval', 'wo', 'dashboard'], module: 'production' },
  { table: 'tb_approval_ga', column: 'created_at', topics: ['approval', 'wo', 'dashboard'], module: 'ga' },
  { table: 'tb_job_executor', column: 'created_at', topics: ['wo', 'dashboard'] },
  { table: 'tb_daily_control', column: 'updated_at', topics: ['daily-control', 'dashboard'] },
  { table: 'tb_daily_control_comment', column: 'updated_at', topics: ['daily-control'] },
  { table: 'tb_material_usage', column: 'created_at', topics: ['material', 'wo'] },
  { table: 'tb_material_part_request', column: 'updated_at', topics: ['material', 'wo'] },
  { table: 'asset', column: 'updated_at', topics: ['assets', 'dashboard'] },
  { table: 'asset_mutation_header', column: 'updated_at', topics: ['asset-mutation', 'assets', 'approval'] },
];

const WATCH_SQL = WATCHES
  .map((w) => `SELECT '${w.table}' AS t, COUNT(*) AS c, CAST(MAX(${w.column}) AS CHAR) AS m FROM ${w.table}`)
  .join(' UNION ALL ');

let baseline: Map<string, string> | null = null;
let watchTimer: NodeJS.Timeout | null = null;
let watching = false;

async function pollDatabase(): Promise<void> {
  if (watching) return;
  watching = true;
  const began = Date.now();
  try {
    const result = await rows<{ t: string; c: number; m: string | null }>(WATCH_SQL);
    const next = new Map(result.map((r) => [r.t, `${r.c}|${r.m ?? ''}`]));
    if (baseline) {
      const changed = new Set<string>();
      const topics = new Set<string>();
      let module: string | undefined;
      for (const spec of WATCHES) {
        if (baseline.get(spec.table) !== next.get(spec.table)) {
          changed.add(spec.table);
          spec.topics.forEach((t) => topics.add(t));
          module = changed.size === 1 ? spec.module : undefined;
        }
      }
      if (topics.size) {
        stats.lastChangeAt = Date.now();
        publishRealtime({ topics: [...topics], module, source: 'db' });
      }
    }
    baseline = next;
    stats.lastPollOk = true;
  } catch {
    baseline = null;
    stats.lastPollOk = false;
  } finally {
    stats.pollCount += 1;
    stats.lastPollAt = Date.now();
    stats.lastPollMs = stats.lastPollAt - began;
    watching = false;
  }
}

function startWatcher(): void {
  if (watchTimer) return;
  watchTimer = setInterval(() => void pollDatabase(), WATCH_INTERVAL_MS);
  watchTimer.unref();
}

function stopWatcherIfIdle(): void {
  if (clients.size > 0 || !watchTimer) return;
  clearInterval(watchTimer);
  watchTimer = null;
  baseline = null;
}

export const realtimeRouter = Router();

realtimeRouter.get('/realtime/stream', authenticate, (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userAgent = String(req.header('user-agent') ?? '');
  const now = Date.now();
  const client: Client = {
    res,
    userId: Number((req as AuthRequest).user?.id_user ?? 0),
    kind: /dart/i.test(userAgent) || /okhttp/i.test(userAgent) ? 'mobile' : 'web',
    userAgent,
    connectedAt: now,
    lastWriteAt: now,
  };
  clients.add(client);
  startWatcher();
  res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ ts: Date.now(), clients: clients.size })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
      client.lastWriteAt = Date.now();
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
    if (client.kind === 'mobile' && client.userId) lastMobileDisconnect.set(client.userId, Date.now());
    stopWatcherIfIdle();
  });
});

export interface OnlineUser {
  id_user: number;
  mobile_connections: number;
  web_connections: number;
  connected_since: number;
  last_active: number;
}

export function getOnlineUsers(): Map<number, OnlineUser> {
  const map = new Map<number, OnlineUser>();
  for (const client of clients) {
    const entry = map.get(client.userId) ?? { id_user: client.userId, mobile_connections: 0, web_connections: 0, connected_since: client.connectedAt, last_active: client.lastWriteAt };
    if (client.kind === 'mobile') entry.mobile_connections += 1;
    else entry.web_connections += 1;
    entry.connected_since = Math.min(entry.connected_since, client.connectedAt);
    entry.last_active = Math.max(entry.last_active, client.lastWriteAt);
    map.set(client.userId, entry);
  }
  return map;
}

export function getRealtimeServerStatus(): Record<string, unknown> {
  const now = Date.now();
  const all = [...clients];
  return {
    running: true,
    started_at: startedAt,
    uptime_seconds: Math.round((now - startedAt) / 1000),
    heartbeat_seconds: HEARTBEAT_MS / 1000,
    clients_total: all.length,
    clients_mobile: all.filter((c) => c.kind === 'mobile').length,
    clients_web: all.filter((c) => c.kind === 'web').length,
    users_online: new Set(all.map((c) => c.userId)).size,
    events_total: stats.eventCount,
    last_event_seconds_ago: stats.lastEventAt ? Math.round((now - stats.lastEventAt) / 1000) : null,
    watcher: {
      active: watchTimer !== null,
      interval_seconds: WATCH_INTERVAL_MS / 1000,
      polls_total: stats.pollCount,
      last_poll_seconds_ago: stats.lastPollAt ? Math.round((now - stats.lastPollAt) / 1000) : null,
      last_poll_ok: stats.lastPollOk,
      last_poll_ms: stats.lastPollMs,
      last_change_seconds_ago: stats.lastChangeAt ? Math.round((now - stats.lastChangeAt) / 1000) : null,
    },
  };
}

export function getLastMobileDisconnect(userId: number): number | null {
  return lastMobileDisconnect.get(userId) ?? null;
}
