import { one, rows } from '../db.js';
import type { User } from '../types.js';

interface ModuleCfg {
  table: string;
  label: string;
  perm: string;
  all: string;
  viewAllPerm: string | null;
  hqDiv: number;
  areaScope: boolean;
}

const MODULES: Record<string, ModuleCfg> = {
  meso: { table: 'tb_wo_mtc', label: 'MESO', perm: 'wo_mtc', all: 'wo_mtc_all', viewAllPerm: 'wo_mtc_all', hqDiv: 0, areaScope: false },
  maintenance: { table: 'tb_wo_mtc_operational', label: 'MAINTENANCE', perm: 'wo_operational', all: 'wo_mtc_all', viewAllPerm: 'wo_mtc_all', hqDiv: 15, areaScope: true },
  production: { table: 'tb_wo_preventive', label: 'PRODUCTION', perm: 'wo_preventive', all: 'wo_preventive', viewAllPerm: null, hqDiv: 15, areaScope: false },
  is: { table: 'tb_wo_it', label: 'IS', perm: 'wo_it', all: 'wo_it', viewAllPerm: null, hqDiv: 6, areaScope: false },
  ga: { table: 'tb_wo_ga', label: 'GA', perm: 'wo_ga', all: 'wo_ga', viewAllPerm: null, hqDiv: 7, areaScope: false },
};

const RANGE_OPTIONS = [7, 14, 30, 90, 180];
const AGING_LABELS = ['0-3 hari', '4-7 hari', '8-14 hari', '> 14 hari'];

const STATUS_LABELS: Record<string, string> = {
  WAIT_KA_DIV: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_ITIS: 'Menunggu Ka. ITIS',
  WAIT_KA_DIV_MTC: 'Menunggu Ka. MTC',
  WAIT_KA_DIV_HRGA: 'Menunggu Ka. HRGA',
  WAIT_KA_DEPT_MESO: 'Menunggu Ka. Dept MESO',
  WAIT_EXECUTOR_ADMIN: 'Menunggu Admin Eksekutor',
  IN_PROGRESS_EXECUTOR: 'Dikerjakan',
  WAITING_PARTS: 'Menunggu Part',
  PARTS_RECEIVED: 'Part Diterima',
  COMPLETE_EXECUTOR: 'Selesai Eksekutor',
  NEED_CLOSED: 'Perlu Ditutup',
  COMPLETE: 'Selesai',
  CLOSED: 'Ditutup',
  VOID: 'Void',
  REJECT: 'Ditolak',
  DECLINE: 'Ditolak',
  FROM_MAINTENANCE: 'Dari Maintenance',
  FORWARD_TO_MESO: 'Diteruskan ke MESO',
};

export function applyDashboardEscalation(user: User): User {
  const pos = String(user.id_position ?? '').toUpperCase().trim();
  const dcode = String(user.division_code ?? '').toUpperCase().trim();
  const dname = String(user.division_name ?? '').toUpperCase().trim();
  const isMgmt = (pos !== '' && pos.includes('MANAGEMENT')) || Number(user.user_management ?? 0) === 1;
  const isAutoHead = pos === 'DIVHEAD' && (dcode.includes('OTO') || dname.includes('OTOMOTIF') || dname.includes('AUTOMOTIVE'));
  if (isMgmt || isAutoHead) {
    Object.assign(user, { wo_it: 1, wo_mtc: 1, wo_mtc_all: 1, wo_operational: 1, wo_preventive: 1, wo_ga: 1, wo_cross_access: 1 });
  }
  return user;
}

function canSeeAllModule(user: User, cfg: ModuleCfg): boolean {
  if (Number(user.wo_cross_access ?? 0) === 1) return true;
  if (cfg.viewAllPerm && Number(user[cfg.viewAllPerm] ?? 0) === 1) return true;
  const pos = String(user.id_position ?? '').toUpperCase().trim();
  if (pos === 'EXECUTOR_ADMIN' || pos === 'EXECUTOR_HEAD') return false;
  if (pos === 'ADMIN_DIVISI' || pos === 'DIVHEAD') return cfg.hqDiv > 0 && Number(user.id_division) === cfg.hqDiv;
  return true;
}

const AREA_MAP: Array<[string, string]> = [
  ['mtc_area_gsu_wnb', 'GSU_WNB'], ['mtc_area_gsu_inject', 'GSU_INJECT'],
  ['mtc_area_ru_sawmill', 'RU_SAWMILL'], ['mtc_area_ru_production', 'RU_PRODUCTION'],
];

function scopeSql(user: User, cfg: ModuleCfg): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (!canSeeAllModule(user, cfg)) {
    const pos = String(user.id_position ?? '').toUpperCase().trim();
    if (pos === 'EXECUTOR_ADMIN' || pos === 'EXECUTOR_HEAD') {
      const code = String(user.division_code ?? '').trim();
      if (code !== '') { clauses.push('w.job_executor LIKE ?'); params.push(`%${code}%`); }
    } else {
      clauses.push('w.id_division = ?');
      params.push(Number(user.id_division ?? 0));
    }
  }

  if (cfg.areaScope && Number(user.wo_cross_access ?? 0) !== 1) {
    const areas = AREA_MAP.filter(([col]) => Number(user[col] ?? 0) === 1).map(([, key]) => key);
    if (areas.length) {
      clauses.push(`EXISTS (SELECT 1 FROM \`asset\` sa WHERE sa.AssetID = w.id_equipment AND sa.mtc_area_key IN (${areas.map(() => '?').join(',')}))`);
      params.push(...areas);
    }
  }

  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

function classify(status: string): 'open' | 'closed' | 'rejected' | 'in_progress' {
  if (status.startsWith('WAIT') || status === '') return 'open';
  if (status === 'CLOSED') return 'closed';
  if (status === 'REJECT' || status === 'DECLINE' || status === 'VOID') return 'rejected';
  return 'in_progress';
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  nd.setDate(nd.getDate() + days);
  return nd;
}

function emptyPayload(range: number, fromStr: string, toStr: string): Record<string, unknown> {
  const trend: Record<string, unknown>[] = [];
  const from = new Date(fromStr);
  const to = new Date(toStr);
  for (let d = from; d <= to; d = addDays(d, 1)) trend.push({ date: isoDate(d), created: 0, closed: 0 });
  return {
    range_days: range, from: fromStr, to: toStr, generated_at: new Date().toISOString(),
    totals: { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 },
    delta: { total_prev: 0, closed_prev: 0, total_pct: null, closed_pct: null },
    by_module: [], by_status: [], by_company: [], top_assets: [], trend,
    aging: AGING_LABELS.map((bucket) => ({ bucket, count: 0 })),
  };
}

export interface DashboardFilters { range?: number | string; company?: string; module?: string }

export async function getDashboard(userInput: User, filters: DashboardFilters): Promise<Record<string, unknown>> {
  const user = applyDashboardEscalation({ ...userInput });

  const rangeNum = Number(filters.range);
  const range = RANGE_OPTIONS.includes(rangeNum) ? rangeNum : 30;

  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const toStr = isoDate(to);
  const from = addDays(to, -(range - 1));
  const fromStr = isoDate(from);
  const prevFrom = addDays(to, -(2 * range - 1));
  const prevFromStr = isoDate(prevFrom);
  const prevTo = addDays(to, -range);
  const prevToStr = isoDate(prevTo);
  const toX = isoDate(addDays(to, 1));
  const prevToX = isoDate(addDays(prevTo, 1));

  const company = String(filters.company ?? '').trim();
  const onlyModule = String(filters.module ?? '').toLowerCase().trim();

  const selected = Object.entries(MODULES).filter(([key, cfg]) => {
    if (onlyModule !== '' && onlyModule !== 'all' && onlyModule !== key) return false;
    return Number(user[cfg.perm] ?? 0) === 1 || Number(user[cfg.all] ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;
  });

  if (!selected.length) return emptyPayload(range, fromStr, toStr);

  const totals = { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 };
  let prevTotal = 0;
  let prevClosed = 0;
  const byModule: Record<string, unknown>[] = [];
  const statusAgg = new Map<string, { label: string; count: number }>();
  const companyAgg = new Map<string, number>();
  const assetAgg = new Map<string, number>();
  const createdByDay = new Map<string, number>();
  const closedByDay = new Map<string, number>();
  const aging = { b0: 0, b1: 0, b2: 0, b3: 0 };

  const perModule = await Promise.all(selected.map(async ([key, cfg]) => {
    const scope = scopeSql(user, cfg);
    let extraSql = '';
    const extraParams: unknown[] = [];
    if (company !== '') { extraSql += ' AND w.company = ?'; extraParams.push(company); }
    if (key === 'meso') extraSql += ' AND NOT EXISTS (SELECT 1 FROM tb_wo_preventive p WHERE p.wo_number = w.wo_number)';

    const [statusRows, prevRow, companyRows, assetRows, createdRows, closedRows, agingRow] = await Promise.all([
      rows<{ s: string; c: number }>(
        `SELECT w.status AS s, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY w.status`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      one<{ pt: number | null; pc: number | null }>(
        `SELECT SUM(CASE WHEN w.date >= ? AND w.date < ? THEN 1 ELSE 0 END) AS pt,
                SUM(CASE WHEN w.status='CLOSED' AND w.date >= ? AND w.date < ? THEN 1 ELSE 0 END) AS pc
         FROM \`${cfg.table}\` w WHERE 1=1${scope.sql}`,
        [prevFromStr, prevToX, prevFromStr, prevToX, ...scope.params],
      ),
      rows<{ co: string; c: number }>(
        `SELECT w.company AS co, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${scope.sql} AND w.company IS NOT NULL AND w.company <> '' GROUP BY w.company`,
        [fromStr, toX, ...scope.params],
      ),
      rows<{ eq: string; c: number }>(
        `SELECT w.id_equipment AS eq, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${scope.sql} AND w.id_equipment IS NOT NULL AND w.id_equipment <> '' GROUP BY w.id_equipment`,
        [fromStr, toX, ...scope.params],
      ),
      rows<{ d: string; c: number }>(
        `SELECT DATE(w.date) AS d, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY DATE(w.date)`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ d: string | null; c: number }>(
        `SELECT DATE(w.updated_at) AS d, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.status='CLOSED' AND w.updated_at BETWEEN ? AND ?${scope.sql} GROUP BY DATE(w.updated_at)`,
        [`${fromStr} 00:00:00`, `${toStr} 23:59:59`, ...scope.params],
      ),
      one<{ b0: number | null; b1: number | null; b2: number | null; b3: number | null }>(
        `SELECT
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) <= 3 THEN 1 ELSE 0 END) AS b0,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS b1,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) AS b2,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) > 14 THEN 1 ELSE 0 END) AS b3
         FROM \`${cfg.table}\` w WHERE w.status LIKE 'WAIT%'${scope.sql}`,
        scope.params,
      ),
    ]);

    return { key, cfg, statusRows, prevRow, companyRows, assetRows, createdRows, closedRows, agingRow };
  }));

  for (const { key, cfg, statusRows, prevRow, companyRows, assetRows, createdRows, closedRows, agingRow } of perModule) {
    const modTotals = { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 };
    for (const r of statusRows) {
      const c = Number(r.c);
      const st = String(r.s ?? '').toUpperCase().trim();
      const bucket = classify(st);
      modTotals.total += c; modTotals[bucket] += c;
      totals.total += c; totals[bucket] += c;
      const entry = statusAgg.get(st) ?? { label: STATUS_LABELS[st] ?? st, count: 0 };
      entry.count += c;
      statusAgg.set(st, entry);
    }
    byModule.push({ module: key, label: cfg.label, total: modTotals.total, open: modTotals.open, in_progress: modTotals.in_progress, closed: modTotals.closed, rejected: modTotals.rejected });

    prevTotal += Number(prevRow?.pt ?? 0);
    prevClosed += Number(prevRow?.pc ?? 0);

    for (const r of companyRows) companyAgg.set(r.co, (companyAgg.get(r.co) ?? 0) + Number(r.c));
    for (const r of assetRows) { const id = String(r.eq); assetAgg.set(id, (assetAgg.get(id) ?? 0) + Number(r.c)); }
    for (const r of createdRows) { const d = String(r.d); createdByDay.set(d, (createdByDay.get(d) ?? 0) + Number(r.c)); }
    for (const r of closedRows) { const d = String(r.d ?? ''); if (!d) continue; closedByDay.set(d, (closedByDay.get(d) ?? 0) + Number(r.c)); }

    aging.b0 += Number(agingRow?.b0 ?? 0);
    aging.b1 += Number(agingRow?.b1 ?? 0);
    aging.b2 += Number(agingRow?.b2 ?? 0);
    aging.b3 += Number(agingRow?.b3 ?? 0);
  }

  const byStatus = [...statusAgg.entries()]
    .map(([status, v]) => ({ status, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byCompany = [...companyAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([company_, c]) => ({ company: company_, total: c }));

  const topAssetIds = [...assetAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  let topAssets: Record<string, unknown>[] = [];
  if (topAssetIds.length) {
    const resolved = await rows<{ AssetID: number; AssetCode: string; AssetName: string }>(
      `SELECT AssetID, AssetCode, AssetName FROM asset WHERE AssetID IN (${topAssetIds.map(() => '?').join(',')})`,
      topAssetIds,
    );
    const byId = new Map(resolved.map((a) => [String(a.AssetID), a]));
    topAssets = topAssetIds.map((id) => {
      const a = byId.get(id);
      return { asset_id: Number(id), asset_code: a ? String(a.AssetCode ?? '') : '', asset_name: a ? String(a.AssetName ?? '') : `#${id}`, count: assetAgg.get(id) ?? 0 };
    });
  }

  const trend: Record<string, unknown>[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const ds = isoDate(d);
    trend.push({ date: ds, created: createdByDay.get(ds) ?? 0, closed: closedByDay.get(ds) ?? 0 });
  }

  const totalPct = prevTotal > 0 ? Math.round(((totals.total - prevTotal) / prevTotal) * 1000) / 10 : null;
  const closedPct = prevClosed > 0 ? Math.round(((totals.closed - prevClosed) / prevClosed) * 1000) / 10 : null;

  return {
    range_days: range, from: fromStr, to: toStr, generated_at: new Date().toISOString(),
    totals,
    delta: { total_prev: prevTotal, closed_prev: prevClosed, total_pct: totalPct, closed_pct: closedPct },
    by_module: byModule, by_status: byStatus, by_company: byCompany, top_assets: topAssets, trend,
    aging: [
      { bucket: AGING_LABELS[0], count: aging.b0 },
      { bucket: AGING_LABELS[1], count: aging.b1 },
      { bucket: AGING_LABELS[2], count: aging.b2 },
      { bucket: AGING_LABELS[3], count: aging.b3 },
    ],
  };
}
