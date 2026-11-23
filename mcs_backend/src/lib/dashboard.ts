import { one, rows, tableExists } from '../db.js';
import { companyFilterVariants, resolveCompanyCode } from './employee-api.js';
import { normalizeTypeWo } from '../routes/work-orders.js';
import type { User } from '../types.js';
import { getPreventiveCoverageSummary } from './preventive-coverage.js';

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
  for (let d = from; d <= to; d = addDays(d, 1)) trend.push({ date: isoDate(d), created: 0, closed: 0, closed_corrective: 0 });
  const preventiveDaily: Record<string, unknown>[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    preventiveDaily.push({ date: isoDate(d), closed: 0, in_progress: 0, open: 0, total: 0, closed_pct: 0, in_progress_pct: 0, open_pct: 0 });
  }
  return {
    range_days: range, from: fromStr, to: toStr, generated_at: new Date().toISOString(),
    totals: { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 },
    delta: { total_prev: 0, closed_prev: 0, total_pct: null, closed_pct: null },
    by_module: [], by_status: [], by_company: [], top_assets: [], trend,
    aging: AGING_LABELS.map((bucket) => ({ bucket, count: 0 })),
    by_type: {
      preventive: 0, corrective: 0, project: 0, other: 0,
      preventive_ratio: null, preventive_ratio_prev: null, preventive_ratio_delta_pts: null,
      corrective_prev: 0, corrective_pct: null,
      project_prev: 0, project_pct: null,
      ratio_trend: [],
    },
    preventive_daily: preventiveDaily,
  };
}

export interface DashboardFilters { range?: number | string; company?: string; module?: string }

type DashboardDataState = 'available' | 'not_active' | 'no_permission';

interface DashboardDomainSnapshot {
  key: string;
  label: string;
  status: DashboardDataState;
  primary: { label: string; value: number | null; unit?: string };
  secondary: Array<{ label: string; value: number | null; unit?: string }>;
  detail_route: string | null;
  note?: string;
}

function hasAnyPermission(user: User, permissions: string[]): boolean {
  if (Number(user.user_management ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1) return true;
  return permissions.some((permission) => Number(user[permission] ?? 0) === 1);
}

function unavailableDomain(
  key: string,
  label: string,
  status: Exclude<DashboardDataState, 'available'>,
  note: string,
): DashboardDomainSnapshot {
  return {
    key,
    label,
    status,
    primary: { label: status === 'no_permission' ? 'Tidak dapat diakses' : 'Belum aktif', value: null },
    secondary: [],
    detail_route: null,
    note,
  };
}

async function getEnterpriseSnapshot(
  user: User,
  params: {
    company: string;
    from: string;
    toExclusive: string;
    totals: { total: number; open: number; in_progress: number; closed: number; rejected: number };
    byModule: Record<string, unknown>[];
    preventiveCoverage: { required: number; scheduled: number; missing: number };
  },
): Promise<Record<string, unknown>> {
  const generatedAt = new Date().toISOString();
  const companyVariants = params.company ? companyFilterVariants(params.company) : [];
  const companySql = (alias: string) => companyVariants.length
    ? ` AND ${alias}.CompanyName IN (${companyVariants.map(() => '?').join(',')})`
    : '';
  const companyParams = companyVariants;

  const canReadAsset = hasAnyPermission(user, ['list_of_asset', 'privilage_asset', 'approve_asset']);
  const canReadGovernance = hasAnyPermission(user, ['list_of_asset', 'privilage_asset', 'approve_asset', 'approval_all']);

  const companies = (await tableExists('tb_company'))
    ? (await rows<{ company_name: string }>('SELECT company_name FROM tb_company ORDER BY company_name'))
        .map((row) => String(row.company_name ?? '').trim())
        .filter(Boolean)
    : [];

  let assetDomain: DashboardDomainSnapshot;
  let assetMetric: Record<string, unknown> = {
    key: 'asset_active', label: 'Asset aktif', value: null, unit: 'asset',
    data_quality_status: canReadAsset ? 'not_active' : 'no_permission', detail_route: null,
  };
  if (!canReadAsset) {
    assetDomain = unavailableDomain('asset', 'Asset Management', 'no_permission', 'Hak akses Asset Management diperlukan.');
  } else {
    const assetCount = await one<{ total: number; active: number; inactive: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN LOWER(COALESCE(active,''))='active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN LOWER(COALESCE(active,''))='inactive' THEN 1 ELSE 0 END) AS inactive
       FROM asset a WHERE 1=1${companySql('a')}`,
      companyParams,
    );
    const active = Number(assetCount?.active ?? 0);
    assetDomain = {
      key: 'asset', label: 'Asset Management', status: 'available',
      primary: { label: 'Asset aktif', value: active, unit: 'asset' },
      secondary: [
        { label: 'Total terdaftar', value: Number(assetCount?.total ?? 0), unit: 'asset' },
        { label: 'Nonaktif', value: Number(assetCount?.inactive ?? 0), unit: 'asset' },
      ],
      detail_route: '/assets',
      note: 'Verified rate dan kondisi kritikal belum ditampilkan karena master verifikasi belum tersedia.',
    };
    assetMetric = {
      key: 'asset_active', label: 'Asset aktif', value: active, unit: 'asset',
      data_quality_status: 'valid', detail_route: '/assets',
    };
  }

  const maintenanceDomain: DashboardDomainSnapshot = {
    key: 'maintenance', label: 'Maintenance & Work Order', status: 'available',
    primary: { label: 'WO aktif', value: params.totals.open + params.totals.in_progress, unit: 'WO' },
    secondary: [
      { label: 'WO periode ini', value: params.totals.total, unit: 'WO' },
      { label: 'Asset belum PM', value: Number(params.preventiveCoverage.missing ?? 0), unit: 'asset' },
    ],
    detail_route: '/work-orders',
    note: 'MTTR/MTBF menunggu timestamp breakdown dan operating hour tervalidasi.',
  };

  let fleetDomain: DashboardDomainSnapshot;
  if (!canReadAsset) {
    fleetDomain = unavailableDomain('fleet', 'Fleet & Vehicle', 'no_permission', 'Hak akses Asset Management diperlukan.');
  } else if (!(await tableExists('fleet_vehicle_profile'))) {
    fleetDomain = unavailableDomain('fleet', 'Fleet & Vehicle', 'not_active', 'Migration Fleet belum aktif.');
  } else {
    const fleet = await one<{ total: number; active: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN UPPER(COALESCE(v.status,''))='ACTIVE' THEN 1 ELSE 0 END) AS active
       FROM fleet_vehicle_profile v JOIN asset a ON a.AssetID=v.asset_id
       WHERE 1=1${companySql('a')}`,
      companyParams,
    );
    const anomaly = (await tableExists('fleet_anomaly'))
      ? await one<{ total: number }>(
          `SELECT COUNT(*) AS total FROM fleet_anomaly n
           JOIN fleet_vehicle_profile v ON v.id=n.vehicle_id
           JOIN asset a ON a.AssetID=v.asset_id
           WHERE UPPER(n.status) NOT IN ('RESOLVED','CLOSED')${companySql('a')}`,
          companyParams,
        )
      : null;
    fleetDomain = {
      key: 'fleet', label: 'Fleet & Vehicle', status: 'available',
      primary: { label: 'Armada aktif', value: Number(fleet?.active ?? 0), unit: 'unit' },
      secondary: [
        { label: 'Total armada', value: Number(fleet?.total ?? 0), unit: 'unit' },
        { label: 'Anomali terbuka', value: anomaly ? Number(anomaly.total ?? 0) : null, unit: 'kasus' },
      ],
      detail_route: '/fleet',
    };
  }

  let energyDomain: DashboardDomainSnapshot;
  if (!canReadAsset) {
    energyDomain = unavailableDomain('energy', 'Energy & Utilities', 'no_permission', 'Hak akses Energy/Asset diperlukan.');
  } else if (!(await tableExists('energy_asset_profile'))) {
    energyDomain = unavailableDomain('energy', 'Energy & Utilities', 'not_active', 'Migration Energy belum aktif.');
  } else {
    const profiles = await one<{ total: number; active: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN UPPER(COALESCE(p.status,''))='ACTIVE' THEN 1 ELSE 0 END) AS active
       FROM energy_asset_profile p JOIN asset a ON a.AssetID=p.asset_id
       WHERE 1=1${companySql('a')}`,
      companyParams,
    );
    let measured: number | null = null;
    let estimated: number | null = null;
    if (await tableExists('energy_meter_reading')) {
      const consumption = await one<{ measured: number | null; estimated: number | null }>(
        `SELECT
          SUM(CASE WHEN UPPER(COALESCE(r.reading_type,'MEASURED'))='MEASURED' THEN r.consumption END) AS measured,
          SUM(CASE WHEN UPPER(COALESCE(r.reading_type,''))='ESTIMATED' THEN r.consumption END) AS estimated
         FROM energy_meter_reading r
         JOIN energy_meter m ON m.id=r.meter_id
         JOIN energy_asset_profile p ON p.id=m.energy_profile_id
         JOIN asset a ON a.AssetID=p.asset_id
         WHERE UPPER(r.status)='LOCKED' AND r.reading_period>=? AND r.reading_period<?${companySql('a')}`,
        [params.from, params.toExclusive, ...companyParams],
      );
      measured = consumption?.measured == null ? null : Number(consumption.measured);
      estimated = consumption?.estimated == null ? null : Number(consumption.estimated);
    }
    energyDomain = {
      key: 'energy', label: 'Energy & Utilities', status: 'available',
      primary: { label: 'Profil aktif', value: Number(profiles?.active ?? 0), unit: 'asset' },
      secondary: [
        { label: 'Konsumsi measured', value: measured, unit: 'unit meter' },
        { label: 'Konsumsi estimated', value: estimated, unit: 'unit meter' },
      ],
      detail_route: '/energy',
      note: 'Measured dan estimated sengaja dipisahkan; satuan mengikuti masing-masing meter.',
    };
  }

  let governanceDomain: DashboardDomainSnapshot;
  let criticalNcrMetric: Record<string, unknown> = {
    key: 'critical_ncr', label: 'Critical NCR', value: null, unit: 'kasus',
    data_quality_status: canReadGovernance ? 'not_active' : 'no_permission', detail_route: null,
  };
  if (!canReadGovernance) {
    governanceDomain = unavailableDomain('governance', 'Governance & Enterprise', 'no_permission', 'Hak akses governance diperlukan.');
  } else if (!(await tableExists('energy_governance_ncr'))) {
    governanceDomain = unavailableDomain('governance', 'Governance & Enterprise', 'not_active', 'NCR Governance belum aktif.');
  } else {
    const ncr = await one<{ open_count: number; critical_count: number; overdue_count: number }>(
      `SELECT
        SUM(CASE WHEN UPPER(status) NOT IN ('CLOSED','VERIFIED') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN UPPER(status) NOT IN ('CLOSED','VERIFIED') AND UPPER(severity) IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) AS critical_count,
        SUM(CASE WHEN UPPER(status) NOT IN ('CLOSED','VERIFIED') AND due_date<CURDATE() THEN 1 ELSE 0 END) AS overdue_count
       FROM energy_governance_ncr`,
    );
    const critical = Number(ncr?.critical_count ?? 0);
    governanceDomain = {
      key: 'governance', label: 'Governance & Enterprise', status: 'available',
      primary: { label: 'NCR terbuka', value: Number(ncr?.open_count ?? 0), unit: 'kasus' },
      secondary: [
        { label: 'Critical/High', value: critical, unit: 'kasus' },
        { label: 'Overdue', value: Number(ncr?.overdue_count ?? 0), unit: 'kasus' },
      ],
      detail_route: '/governance',
      note: 'Saat ini bersumber dari NCR Energy Governance yang sudah tersedia.',
    };
    criticalNcrMetric = {
      key: 'critical_ncr', label: 'Critical NCR', value: critical, unit: 'kasus',
      data_quality_status: 'valid', detail_route: '/governance', source: 'energy_governance_ncr',
    };
  }

  const ga = params.byModule.find((item) => item.module === 'ga');
  let gaDomain: DashboardDomainSnapshot;
  if (!ga) {
    gaDomain = unavailableDomain('ga', 'General Affair', 'no_permission', 'WO GA tidak termasuk cakupan user ini.');
  } else if (await tableExists('ga_task')) {
    const scope = params.company ? ' WHERE company_code=?' : '';
    const values = params.company ? [params.company] : [];
    const summary = await one<{ open_count:number; pending_count:number; completed_count:number; overdue_count:number }>(`SELECT
      SUM(status IN ('PLANNED','IN_PROGRESS','REJECTED')) open_count,
      SUM(status IN ('SUBMITTED','CHECKED')) pending_count,
      SUM(status IN ('APPROVED','CLOSED')) completed_count,
      SUM(due_at<NOW() AND status NOT IN ('APPROVED','CLOSED')) overdue_count
      FROM ga_task${scope}`, values);
    gaDomain = {
      key:'ga',label:'General Affair',status:'available',
      primary:{label:'Task GA aktif',value:Number(summary?.open_count??0),unit:'task'},
      secondary:[
        {label:'Menunggu validasi',value:Number(summary?.pending_count??0),unit:'task'},
        {label:'Selesai disetujui',value:Number(summary?.completed_count??0),unit:'task'},
        {label:'Overdue',value:Number(summary?.overdue_count??0),unit:'task'},
      ],
      detail_route:'/general-affair',
      note:'GA01–GA10 aktif: field task, preventive, CCTV, weighbridge, NCR, dan weekly governance.',
    };
  } else {
    gaDomain = {
        key: 'ga', label: 'General Affair', status: 'available',
        primary: { label: 'WO GA aktif', value: Number(ga.open ?? 0) + Number(ga.in_progress ?? 0), unit: 'WO' },
        secondary: [
          { label: 'WO GA periode ini', value: Number(ga.total ?? 0), unit: 'WO' },
          { label: 'WO GA ditutup', value: Number(ga.closed ?? 0), unit: 'WO' },
        ],
        detail_route: '/work-orders?module=ga',
        note: 'Fondasi GA01–GA10 belum dimigrasikan; snapshot sementara memakai WO GA.',
      };
  }

  let sparepartDomain: DashboardDomainSnapshot;
  const canReadSparepart = hasAnyPermission(user, ['material_usage', 'approval_all']);
  if (!canReadSparepart) {
    sparepartDomain = unavailableDomain('sparepart', 'Sparepart Management', 'no_permission', 'Hak akses Sparepart diperlukan.');
  } else if (!(await tableExists('sparepart_master')) || !(await tableExists('sparepart_stock_ledger'))) {
    sparepartDomain = unavailableDomain('sparepart', 'Sparepart Management', 'not_active', 'Migration Sparepart Receiving & Stock belum aktif.');
  } else {
    const sparepartCompanyWhere = params.company ? ' WHERE w.company_code=?' : '';
    const stock = await one<{ master_count: number; stocked_items: number; hold_items: number; receipt_pending: number }>(
      `SELECT
        (SELECT COUNT(*) FROM sparepart_master WHERE status='ACTIVE') master_count,
        (SELECT COUNT(*) FROM (
          SELECT l.sparepart_id FROM sparepart_stock_ledger l JOIN sparepart_warehouse sw ON sw.id=l.warehouse_id
          ${params.company ? 'WHERE sw.company_code=?' : ''} GROUP BY l.sparepart_id
          HAVING SUM(CASE WHEN l.stock_bucket='AVAILABLE' THEN l.quantity_delta ELSE 0 END)>0
        ) available_parts) stocked_items,
        (SELECT COUNT(*) FROM (
          SELECT l.sparepart_id FROM sparepart_stock_ledger l JOIN sparepart_warehouse hw ON hw.id=l.warehouse_id
          ${params.company ? 'WHERE hw.company_code=?' : ''} GROUP BY l.sparepart_id
          HAVING SUM(CASE WHEN l.stock_bucket='HOLD' THEN l.quantity_delta ELSE 0 END)>0
        ) held_parts) hold_items,
        (SELECT COUNT(*) FROM sparepart_receipt h JOIN sparepart_warehouse rw ON rw.id=h.warehouse_id WHERE h.status='SUBMITTED'${params.company ? ' AND rw.company_code=?' : ''}) receipt_pending
       FROM sparepart_warehouse w${sparepartCompanyWhere} LIMIT 1`,
      params.company ? [params.company, params.company, params.company, params.company] : [],
    );
    sparepartDomain = {
      key: 'sparepart', label: 'Sparepart Management', status: 'available',
      primary: { label: 'Item memiliki stok', value: Number(stock?.stocked_items ?? 0), unit: 'SKU' },
      secondary: [
        { label: 'Master aktif', value: Number(stock?.master_count ?? 0), unit: 'item' },
        { label: 'Item dalam hold', value: Number(stock?.hold_items ?? 0), unit: 'SKU' },
        { label: 'Receiving menunggu', value: Number(stock?.receipt_pending ?? 0), unit: 'dokumen' },
      ],
      detail_route: '/spareparts',
      note: 'Kuantitas operasional lintas UOM; rincian per item tersedia pada kartu stok.',
    };
  }

  return {
    version: 'enterprise-v1',
    generated_at: generatedAt,
    last_success_at: generatedAt,
    data_quality_status: 'partial',
    scope: {
      company: params.company || null,
      available_companies: companies,
      period_from: params.from,
      period_to: params.toExclusive,
      timezone: 'Asia/Jakarta',
    },
    headline: {
      asset_active: assetMetric,
      wo_open: {
        key: 'wo_open', label: 'WO open', value: params.totals.open + params.totals.in_progress,
        unit: 'WO', data_quality_status: 'valid', detail_route: '/work-orders',
      },
      preventive_missing: {
        key: 'preventive_missing', label: 'Asset belum terjadwal',
        value: Number(params.preventiveCoverage.missing ?? 0), unit: 'asset',
        numerator: Number(params.preventiveCoverage.scheduled ?? 0),
        denominator: Number(params.preventiveCoverage.required ?? 0),
        data_quality_status: 'valid', detail_route: '/my-work?tab=preventive_missing',
      },
      critical_ncr: criticalNcrMetric,
    },
    domains: [assetDomain, maintenanceDomain, sparepartDomain, fleetDomain, energyDomain, governanceDomain, gaDomain],
  };
}

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
  const preventiveCoveragePromise = getPreventiveCoverageSummary(user, company);

  const selected = Object.entries(MODULES).filter(([key, cfg]) => {
    if (onlyModule !== '' && onlyModule !== 'all' && onlyModule !== key) return false;
    return Number(user[cfg.perm] ?? 0) === 1 || Number(user[cfg.all] ?? 0) === 1 || Number(user.wo_cross_access ?? 0) === 1;
  });

  if (!selected.length) {
    const preventiveCoverage = await preventiveCoveragePromise;
    const empty = emptyPayload(range, fromStr, toStr);
    return {
      ...empty,
      preventive_coverage: preventiveCoverage,
      enterprise: await getEnterpriseSnapshot(user, {
        company,
        from: fromStr,
        toExclusive: toX,
        totals: { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 },
        byModule: [],
        preventiveCoverage,
      }),
    };
  }

  const totals = { total: 0, open: 0, in_progress: 0, closed: 0, rejected: 0 };
  let prevTotal = 0;
  let prevClosed = 0;
  const byModule: Record<string, unknown>[] = [];
  const typeAgg = { preventive: 0, corrective: 0, project: 0, other: 0 };
  const prevTypeAgg = { preventive: 0, corrective: 0, project: 0, other: 0 };
  const statusAgg = new Map<string, { label: string; count: number }>();
  const companyAgg = new Map<string, number>();
  const assetAgg = new Map<string, number>();
  const createdByDay = new Map<string, number>();
  const closedByDay = new Map<string, number>();
  const preventiveByDay = new Map<string, number>();
  const correctiveByDay = new Map<string, number>();
  const closedCorrectiveByDay = new Map<string, number>();
  const aging = { b0: 0, b1: 0, b2: 0, b3: 0 };
  const preventiveDailyAgg = new Map<string, { open: number; in_progress: number; closed: number }>();

  const perModule = await Promise.all(selected.map(async ([key, cfg]) => {
    const scope = scopeSql(user, cfg);
    let extraSql = '';
    const extraParams: unknown[] = [];
    if (company !== '') { const variants = companyFilterVariants(company); extraSql += ` AND w.company IN (${variants.map(() => '?').join(',')})`; extraParams.push(...variants); }
    if (key === 'meso') extraSql += ' AND NOT EXISTS (SELECT 1 FROM tb_wo_preventive p WHERE p.wo_number = w.wo_number)';

    const [statusRows, prevRow, typeRows, prevTypeRows, typeByDayRows, companyRows, assetRows, createdRows, closedRows, closedTypeByDayRows, agingRow, preventiveStatusByDayRows] = await Promise.all([
      rows<{ s: string; c: number }>(
        `SELECT w.status AS s, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY w.status`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      one<{ pt: number | null; pc: number | null }>(
        `SELECT SUM(CASE WHEN w.date >= ? AND w.date < ? THEN 1 ELSE 0 END) AS pt,
                SUM(CASE WHEN w.status='CLOSED' AND w.date >= ? AND w.date < ? THEN 1 ELSE 0 END) AS pc
         FROM \`${cfg.table}\` w WHERE 1=1${extraSql}${scope.sql}`,
        [prevFromStr, prevToX, prevFromStr, prevToX, ...extraParams, ...scope.params],
      ),
      rows<{ t: string | null; c: number }>(
        `SELECT w.type_wo AS t, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY w.type_wo`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ t: string | null; c: number }>(
        `SELECT w.type_wo AS t, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY w.type_wo`,
        [prevFromStr, prevToX, ...extraParams, ...scope.params],
      ),
      rows<{ d: string; t: string | null; c: number }>(
        `SELECT DATE(w.date) AS d, w.type_wo AS t, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY DATE(w.date), w.type_wo`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ co: string; c: number }>(
        `SELECT w.company AS co, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} AND w.company IS NOT NULL AND w.company <> '' GROUP BY w.company`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ eq: string; c: number }>(
        `SELECT w.id_equipment AS eq, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} AND w.id_equipment IS NOT NULL AND w.id_equipment <> '' GROUP BY w.id_equipment`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ d: string; c: number }>(
        `SELECT DATE(w.date) AS d, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY DATE(w.date)`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
      rows<{ d: string | null; c: number }>(
        `SELECT DATE(w.updated_at) AS d, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.status='CLOSED' AND w.updated_at BETWEEN ? AND ?${extraSql}${scope.sql} GROUP BY DATE(w.updated_at)`,
        [`${fromStr} 00:00:00`, `${toStr} 23:59:59`, ...extraParams, ...scope.params],
      ),
      rows<{ d: string | null; t: string | null; c: number }>(
        `SELECT DATE(w.updated_at) AS d, w.type_wo AS t, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.status='CLOSED' AND w.updated_at BETWEEN ? AND ?${extraSql}${scope.sql} GROUP BY DATE(w.updated_at), w.type_wo`,
        [`${fromStr} 00:00:00`, `${toStr} 23:59:59`, ...extraParams, ...scope.params],
      ),
      one<{ b0: number | null; b1: number | null; b2: number | null; b3: number | null }>(
        `SELECT
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) <= 3 THEN 1 ELSE 0 END) AS b0,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS b1,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) AS b2,
          SUM(CASE WHEN DATEDIFF(CURDATE(), w.date) > 14 THEN 1 ELSE 0 END) AS b3
         FROM \`${cfg.table}\` w WHERE w.status LIKE 'WAIT%'${extraSql}${scope.sql}`,
        [...extraParams, ...scope.params],
      ),
      // Status WO Preventive per-hari (buat kartu "Preventive Harian") —
      // status+type sekaligus biar gak nambah query lagi, difilter/diklasifikasi
      // di JS (bucketOf/classify) sama kayak query lain di file ini.
      rows<{ d: string; s: string; t: string | null; c: number }>(
        `SELECT DATE(w.date) AS d, w.status AS s, w.type_wo AS t, COUNT(*) AS c FROM \`${cfg.table}\` w WHERE w.date >= ? AND w.date < ?${extraSql}${scope.sql} GROUP BY DATE(w.date), w.status, w.type_wo`,
        [fromStr, toX, ...extraParams, ...scope.params],
      ),
    ]);

    return { key, cfg, statusRows, prevRow, typeRows, prevTypeRows, typeByDayRows, companyRows, assetRows, createdRows, closedRows, closedTypeByDayRows, agingRow, preventiveStatusByDayRows };
  }));

  const bucketOf = (raw: string | null): 'preventive' | 'corrective' | 'project' | 'other' => {
    const norm = normalizeTypeWo(String(raw ?? ''));
    if (norm === 'PREVENTIVE MAINTENANCE') return 'preventive';
    if (norm === 'CORRECTIVE MAINTENANCE') return 'corrective';
    if (norm === 'PROJECT') return 'project';
    return 'other';
  };

  for (const { key, cfg, statusRows, prevRow, typeRows, prevTypeRows, typeByDayRows, companyRows, assetRows, createdRows, closedRows, closedTypeByDayRows, agingRow, preventiveStatusByDayRows } of perModule) {
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

    for (const r of typeRows) typeAgg[bucketOf(r.t)] += Number(r.c);
    for (const r of prevTypeRows) prevTypeAgg[bucketOf(r.t)] += Number(r.c);
    for (const r of typeByDayRows) {
      const bucket = bucketOf(r.t);
      if (bucket === 'preventive') preventiveByDay.set(r.d, (preventiveByDay.get(r.d) ?? 0) + Number(r.c));
      else if (bucket === 'corrective') correctiveByDay.set(r.d, (correctiveByDay.get(r.d) ?? 0) + Number(r.c));
    }
    for (const r of preventiveStatusByDayRows) {
      if (bucketOf(r.t) !== 'preventive') continue;
      const st = classify(String(r.s ?? '').toUpperCase().trim());
      // "Ditolak/Void" preventive jarang & bukan "belum dikerjakan" dalam arti
      // normal — digabung ke bucket "open" (Belum Dikerjakan) biar kartu ini
      // tetap 3 kategori sederhana (Selesai/Dikerjakan/Belum Dikerjakan).
      const entry = preventiveDailyAgg.get(r.d) ?? { open: 0, in_progress: 0, closed: 0 };
      if (st === 'closed') entry.closed += Number(r.c);
      else if (st === 'in_progress') entry.in_progress += Number(r.c);
      else entry.open += Number(r.c);
      preventiveDailyAgg.set(r.d, entry);
    }

    // WO lama nyimpen nama company panjang ("Ganda Saribu Utama") sementara
    // yang baru nyimpen kode singkat ("GSU") — tanpa normalisasi ini,
    // widget "WO per Company" ngitung dua-duanya sebagai company beda.
    for (const r of companyRows) { const co = resolveCompanyCode(r.co) || r.co; companyAgg.set(co, (companyAgg.get(co) ?? 0) + Number(r.c)); }
    for (const r of assetRows) { const id = String(r.eq); assetAgg.set(id, (assetAgg.get(id) ?? 0) + Number(r.c)); }
    for (const r of createdRows) { const d = String(r.d); createdByDay.set(d, (createdByDay.get(d) ?? 0) + Number(r.c)); }
    for (const r of closedRows) { const d = String(r.d ?? ''); if (!d) continue; closedByDay.set(d, (closedByDay.get(d) ?? 0) + Number(r.c)); }
    for (const r of closedTypeByDayRows) {
      const d = String(r.d ?? ''); if (!d) continue;
      if (bucketOf(r.t) === 'corrective') closedCorrectiveByDay.set(d, (closedCorrectiveByDay.get(d) ?? 0) + Number(r.c));
    }

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
    trend.push({
      date: ds,
      created: createdByDay.get(ds) ?? 0,
      closed: closedByDay.get(ds) ?? 0,
      // Ditutup CLOSED yang khusus Corrective — angka agregat "closed" aja
      // gak cukup buat lihat beban kerja reaktif/breakdown harian.
      closed_corrective: closedCorrectiveByDay.get(ds) ?? 0,
    });
  }

  // Sparkline rasio preventive: dihitung kumulatif per hari (bukan rasio
  // harian mentah) karena jumlah WO per hari kecil & gampang bikin rasio
  // harian melompat-lompat — kumulatif kasih tren yang lebih kebaca.
  const ratioTrend: { date: string; ratio: number | null }[] = [];
  let cumPreventive = 0;
  let cumCorrective = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const ds = isoDate(d);
    cumPreventive += preventiveByDay.get(ds) ?? 0;
    cumCorrective += correctiveByDay.get(ds) ?? 0;
    const base = cumPreventive + cumCorrective;
    ratioTrend.push({ date: ds, ratio: base > 0 ? Math.round((cumPreventive / base) * 1000) / 10 : null });
  }

  // "Preventive Harian" — status WO Preventive per hari (Selesai/Dikerjakan/
  // Belum Dikerjakan) + persentase, buat lihat konsistensi eksekusi harian,
  // bukan cuma rasio keseluruhan periode.
  const preventiveDaily: Record<string, unknown>[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const ds = isoDate(d);
    const entry = preventiveDailyAgg.get(ds) ?? { open: 0, in_progress: 0, closed: 0 };
    const total = entry.open + entry.in_progress + entry.closed;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
    preventiveDaily.push({
      date: ds,
      closed: entry.closed,
      in_progress: entry.in_progress,
      open: entry.open,
      total,
      closed_pct: pct(entry.closed),
      in_progress_pct: pct(entry.in_progress),
      open_pct: pct(entry.open),
    });
  }

  const totalPct = prevTotal > 0 ? Math.round(((totals.total - prevTotal) / prevTotal) * 1000) / 10 : null;
  const closedPct = prevClosed > 0 ? Math.round(((totals.closed - prevClosed) / prevClosed) * 1000) / 10 : null;

  // "Rasio Preventive" = preventive / (preventive+corrective) — satu angka yang
  // langsung nunjukin tim lebih proaktif (PM) atau reaktif (CM), dibanding cuma
  // 3 angka mentah yang gak jelas arah baik/buruknya kalau dilihat terpisah.
  // Project sengaja gak ikut di rasio ini (itu kerjaan pengembangan, bukan
  // soal reaktif-vs-proaktif), ditampilkan sendiri sebagai jumlah + tren.
  const pmBaseNow = typeAgg.preventive + typeAgg.corrective;
  const pmBasePrev = prevTypeAgg.preventive + prevTypeAgg.corrective;
  const preventiveRatio = pmBaseNow > 0 ? Math.round((typeAgg.preventive / pmBaseNow) * 1000) / 10 : null;
  const preventiveRatioPrev = pmBasePrev > 0 ? Math.round((prevTypeAgg.preventive / pmBasePrev) * 1000) / 10 : null;
  const preventiveRatioDeltaPts = preventiveRatio !== null && preventiveRatioPrev !== null
    ? Math.round((preventiveRatio - preventiveRatioPrev) * 10) / 10 : null;
  const projectPct = prevTypeAgg.project > 0
    ? Math.round(((typeAgg.project - prevTypeAgg.project) / prevTypeAgg.project) * 1000) / 10 : null;
  const correctivePct = prevTypeAgg.corrective > 0
    ? Math.round(((typeAgg.corrective - prevTypeAgg.corrective) / prevTypeAgg.corrective) * 1000) / 10 : null;

  const preventiveCoverage = await preventiveCoveragePromise;
  const enterprise = await getEnterpriseSnapshot(user, {
    company,
    from: fromStr,
    toExclusive: toX,
    totals,
    byModule,
    preventiveCoverage,
  });

  return {
    range_days: range, from: fromStr, to: toStr, generated_at: new Date().toISOString(),
    totals,
    delta: { total_prev: prevTotal, closed_prev: prevClosed, total_pct: totalPct, closed_pct: closedPct },
    by_module: byModule, by_status: byStatus, by_company: byCompany, top_assets: topAssets, trend,
    by_type: {
      ...typeAgg,
      preventive_ratio: preventiveRatio,
      preventive_ratio_prev: preventiveRatioPrev,
      preventive_ratio_delta_pts: preventiveRatioDeltaPts,
      corrective_prev: prevTypeAgg.corrective,
      corrective_pct: correctivePct,
      project_prev: prevTypeAgg.project,
      project_pct: projectPct,
      ratio_trend: ratioTrend,
    },
    aging: [
      { bucket: AGING_LABELS[0], count: aging.b0 },
      { bucket: AGING_LABELS[1], count: aging.b1 },
      { bucket: AGING_LABELS[2], count: aging.b2 },
      { bucket: AGING_LABELS[3], count: aging.b3 },
    ],
    preventive_daily: preventiveDaily,
    preventive_coverage: preventiveCoverage,
    enterprise,
  };
}
