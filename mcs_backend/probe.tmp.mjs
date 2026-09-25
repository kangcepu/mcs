import { rows } from './dist/db.js';
const BASE = 'http://192.168.11.2:3100';
const enc = (p) => '/' + p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const sources = [
  { name: 'service_evidence.file_path', sql: "SELECT file_path v FROM tb_wo_service_evidence", url: (v) => `/uploads/${v}` },
  { name: 'daily_control_media.media_path', sql: "SELECT media_path v FROM tb_daily_control_media", url: (v) => `/uploads/${v}` },
  { name: 'daily_comment_media.media_path', sql: "SELECT media_path v FROM tb_daily_control_comment_media", url: (v) => `/uploads/${v}` },
  { name: 'part_exec_media.media_path', sql: "SELECT media_path v FROM tb_wo_operational_part_execution_media", url: (v) => `/uploads/${v}` },
  { name: 'custom_detail_images.image_path', sql: "SELECT image_path v FROM asset_custom_detail_images", url: (v) => `/uploads/${String(v).replace(/^\.?\//,'')}` },
  { name: 'asset_attachment.filename', sql: "SELECT filename v FROM tb_attachment_asset", url: (v) => v.includes('/') ? `/uploads/${v}` : `/uploads/assets/docs/masterAsset/${v}` },
  { name: 'user.avatar (backend rule)', sql: "SELECT avatar v FROM tb_user WHERE avatar IS NOT NULL AND avatar NOT IN ('','avatar.png')", url: (v) => v.includes('/') ? `/uploads/${v}` : `/uploads/assets/img/profile/${v}` },
];
const groupKey = (v) => { const s = String(v).replace(/^\.?\//,''); const parts = s.split('/'); return parts.length > 1 ? parts.slice(0, Math.min(3, parts.length-1)).join('/') : '(plain)'; };
async function head(u) { try { const r = await fetch(BASE + enc(u), { method: 'HEAD', signal: AbortSignal.timeout(20000) }); return r.status; } catch { return 0; } }

async function pool(items, worker, n=24) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({length:n}, async () => { while (i < items.length) { const k = i++; out[k] = await worker(items[k]); } })); return out; }
for (const s of sources.slice(0, 6)) {
  const all = [...new Set((await rows(s.sql)).map(r => String(r.v ?? '').trim()).filter(Boolean))];
  const res = await pool(all, async (v) => [v, await head(s.url(v))]);
  const bad = res.filter(([, c]) => !(c === 200 || c === 206));
  console.log(`${s.name}: checked ${all.length}, broken ${bad.length}` + (bad.length ? '  e.g. ' + bad.slice(0,4).map(([v,c])=>`${v} -> ${c}`).join(' | ') : ''));
}
process.exit(0);
