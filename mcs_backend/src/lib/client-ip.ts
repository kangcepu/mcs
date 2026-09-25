import type { Request } from 'express';

const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;

function clean(value: unknown): string {
  return String(value ?? '').trim().replace(/^::ffff:/i, '');
}

function header(req: Request, name: string): string {
  const raw = req.headers[name];
  return clean(Array.isArray(raw) ? raw[0] : raw);
}

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP.test(ip);
}

export function clientIp(req: Request): { ip: string; source: string; is_public: boolean } {
  const candidates: Array<[string, string]> = [
    ['cf-connecting-ip', header(req, 'cf-connecting-ip')],
    ['true-client-ip', header(req, 'true-client-ip')],
  ];
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map(clean).filter(Boolean);
  const publicForwarded = forwarded.find((ip) => !isPrivateIp(ip));
  if (publicForwarded) candidates.push(['x-forwarded-for', publicForwarded]);
  candidates.push(['x-real-ip', header(req, 'x-real-ip')]);

  for (const [source, ip] of candidates) {
    if (ip && !isPrivateIp(ip)) return { ip, source, is_public: true };
  }
  const fallback = forwarded[0] || header(req, 'x-real-ip') || clean(req.socket.remoteAddress ?? req.ip);
  return { ip: fallback, source: forwarded[0] ? 'x-forwarded-for' : 'socket', is_public: !isPrivateIp(fallback) };
}
