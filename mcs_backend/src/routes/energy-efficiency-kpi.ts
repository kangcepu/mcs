import { Router, type NextFunction, type Response } from 'express';
import { authenticate, requirePermission } from '../auth.js';
import { config } from '../config.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export const energyEfficiencyKpiRouter = Router();

const canRead = requirePermission('list_of_asset', 'privilage_asset');
const canManage = requirePermission('privilage_asset');
const canApprove = requirePermission('approve_asset', 'approval_all', 'privilage_asset');
const METRICS = {
  ELECTRICITY_CONSUMPTION: { unit: 'kWh', direction: 'LOWER_BETTER' },
  WATER_CONSUMPTION: { unit: 'm³', direction: 'LOWER_BETTER' },
  GENSET_KWH_PER_LITER: { unit: 'kWh/L', direction: 'HIGHER_BETTER' },
  GENSET_KWH_PER_HOUR: { unit: 'kWh/jam', direction: 'HIGHER_BETTER' },
  COMPRESSOR_OUTPUT_PER_HOUR: { unit: 'output/jam', direction: 'HIGHER_BETTER' },
  BOILER_OUTPUT_PER_HOUR: { unit: 'output/jam', direction: 'HIGHER_BETTER' },
} as const;
type MetricCode = keyof typeof METRICS;
type ScopeType = 'GLOBAL' | 'COMPANY' | 'ASSET';

function featureEnabled(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!config.energyModuleEnabled) return next(new HttpError(404, 'Modul Energy belum diaktifkan.', 'ENERGY_MODULE_DISABLED'));
  next();
}

energyEfficiencyKpiRouter.use('/energy', authenticate, featureEnabled);

async function ensureFeature(): Promise<void> {
  if (!(await tableExists('energy_efficiency_kpi'))) {
    throw new HttpError(503, 'KPI efisiensi Energy belum tersedia. Jalankan migration 20261108_energy_efficiency_kpi.sql.');
  }
}

function requiredText(value: unknown, field: string, max: number): string {
  const result = String(value ?? '').trim();
  if (!result) throw new HttpError(422, `${field} wajib diisi.`);
  if (result.length > max) throw new HttpError(422, `${field} maksimal ${max} karakter.`);
  return result;
}

function optionalText(value: unknown, max: number): string | null {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (result.length > max) throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return result;
}

function dateOnly(value: unknown, field: string): string {
  const result = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new HttpError(422, `${field} tidak valid.`);
  return result;
}

function decimal(value: unknown, field: string, required = true): number | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(422, `${field} wajib diisi.`);
    return null;
  }
  const result = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(result) || result < 0) throw new HttpError(422, `${field} harus berupa angka nol atau lebih.`);
  return result;
}

function metricCode(value: unknown): MetricCode {
  const result = String(value ?? '').trim().toUpperCase() as MetricCode;
  if (!(result in METRICS)) throw new HttpError(422, 'Metric KPI tidak valid.');
  return result;
}

function scopeType(value: unknown): ScopeType {
  const result = String(value ?? 'GLOBAL').trim().toUpperCase();
  if (!['GLOBAL', 'COMPANY', 'ASSET'].includes(result)) throw new HttpError(422, 'Scope KPI tidak valid.');
  return result as ScopeType;
}

type KpiScope = { scope_type: ScopeType; scope_company: string | null; energy_profile_id: number | null };
type MetricResult = { actual: number | null; numerator: number | null; denominator: number | null; sample_count: number };

async function calculateMetric(metric: MetricCode, scope: KpiScope, from: string, to: string): Promise<MetricResult> {
  const conditions: string[] = [];
  const params: unknown[] = [from, to];
  if (scope.scope_type === 'COMPANY') { conditions.push('a.CompanyName=?'); params.push(scope.scope_company); }
  if (scope.scope_type === 'ASSET') { conditions.push('p.id=?'); params.push(scope.energy_profile_id); }
  const scoped = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

  if (metric === 'ELECTRICITY_CONSUMPTION' || metric === 'WATER_CONSUMPTION') {
    const type = metric === 'ELECTRICITY_CONSUMPTION' ? 'ELECTRICITY_METER' : 'WATER_METER';
    const result = await one<{ numerator: number | string | null; sample_count: number | string }>(
      `SELECT SUM(r.consumption) numerator, COUNT(*) sample_count
       FROM energy_meter_reading r JOIN energy_meter m ON m.id=r.meter_id
       JOIN energy_asset_profile p ON p.id=m.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
       WHERE r.status='LOCKED' AND p.energy_type=? AND DATE(r.read_at) BETWEEN ? AND ?${scoped}`,
      [type, ...params]);
    const count = Number(result?.sample_count ?? 0);
    const numerator = count ? Number(result?.numerator ?? 0) : null;
    return { actual: numerator, numerator, denominator: null, sample_count: count };
  }

  if (metric === 'GENSET_KWH_PER_LITER' || metric === 'GENSET_KWH_PER_HOUR') {
    const result = await one<{ numerator: number | string | null; denominator: number | string | null; sample_count: number | string }>(
      `SELECT SUM(o.generated_kwh) numerator,
        SUM(${metric === 'GENSET_KWH_PER_LITER' ? 'o.fuel_consumed_liter' : 'o.operating_hours'}) denominator,
        COUNT(*) sample_count
       FROM energy_genset_operation o JOIN energy_genset_profile g ON g.id=o.genset_profile_id
       JOIN energy_asset_profile p ON p.id=g.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
       WHERE o.status='LOCKED' AND DATE(o.started_at) BETWEEN ? AND ?${scoped}`, params);
    const count = Number(result?.sample_count ?? 0);
    const numerator = count ? Number(result?.numerator ?? 0) : null;
    const denominator = count ? Number(result?.denominator ?? 0) : null;
    return { actual: denominator && numerator !== null ? numerator / denominator : null, numerator, denominator, sample_count: count };
  }

  const utilityKind = metric === 'COMPRESSOR_OUTPUT_PER_HOUR' ? 'COMPRESSOR' : 'BOILER';
  const result = await one<{ numerator: number | string | null; denominator: number | string | null; sample_count: number | string }>(
    `SELECT SUM(o.output_value) numerator, SUM(o.operating_hours) denominator, COUNT(*) sample_count
     FROM energy_utility_operation o JOIN energy_utility_profile u ON u.id=o.utility_profile_id
     JOIN energy_asset_profile p ON p.id=u.energy_profile_id JOIN asset a ON a.AssetID=p.asset_id
     WHERE o.status='LOCKED' AND u.utility_kind=? AND DATE(o.inspected_at) BETWEEN ? AND ?${scoped}`,
    [utilityKind, ...params]);
  const count = Number(result?.sample_count ?? 0);
  const numerator = count ? Number(result?.numerator ?? 0) : null;
  const denominator = count ? Number(result?.denominator ?? 0) : null;
  return { actual: denominator && numerator !== null ? numerator / denominator : null, numerator, denominator, sample_count: count };
}

type KpiInput = {
  kpiCode: string; name: string; metric: MetricCode; scope: KpiScope; period: string;
  direction: string; unit: string; baseline: number; baselineStart: string; baselineEnd: string;
  target: number; minimum: number; weight: number; owner: string; effectiveFrom: string;
  effectiveTo: string | null; notes: string | null;
};

async function parseInput(body: Record<string, unknown>): Promise<KpiInput> {
  const kpiCode = requiredText(body.kpi_code, 'Kode KPI', 60).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(kpiCode)) throw new HttpError(422, 'Kode KPI hanya boleh berisi huruf, angka, underscore, atau strip.');
  const metric = metricCode(body.metric_code);
  const scope = scopeType(body.scope_type);
  const company = scope === 'COMPANY' ? requiredText(body.scope_company, 'Company scope', 120) : null;
  const profileId = scope === 'ASSET' ? Number(body.energy_profile_id) : null;
  if (scope === 'ASSET' && (!Number.isSafeInteger(profileId) || Number(profileId) <= 0)) throw new HttpError(422, 'Energy asset scope wajib dipilih.');
  if (profileId && !(await one('SELECT id FROM energy_asset_profile WHERE id=? LIMIT 1', [profileId]))) throw new HttpError(404, 'Energy asset scope tidak ditemukan.');
  if ((metric === 'COMPRESSOR_OUTPUT_PER_HOUR' || metric === 'BOILER_OUTPUT_PER_HOUR') && scope !== 'ASSET') {
    throw new HttpError(422, 'KPI output Compressor/Boiler harus menggunakan scope asset agar satuan output tetap konsisten.');
  }
  const baselineStart = dateOnly(body.baseline_start, 'Awal baseline');
  const baselineEnd = dateOnly(body.baseline_end, 'Akhir baseline');
  if (baselineEnd < baselineStart) throw new HttpError(422, 'Akhir baseline tidak boleh lebih awal dari awal baseline.');
  let baseline = decimal(body.baseline_value, 'Nilai baseline', false);
  const kpiScope: KpiScope = { scope_type: scope, scope_company: company, energy_profile_id: profileId };
  if (baseline === null) {
    const calculated = await calculateMetric(metric, kpiScope, baselineStart, baselineEnd);
    if (calculated.actual === null) throw new HttpError(422, 'Baseline tidak dapat dihitung: data terkunci belum tersedia atau denominator masih nol.');
    baseline = calculated.actual;
  }
  const target = decimal(body.target_value, 'Target')!;
  const minimum = decimal(body.minimum_value, 'Ambang minimum')!;
  const direction = METRICS[metric].direction;
  if (direction === 'HIGHER_BETTER' && target < minimum) throw new HttpError(422, 'Untuk KPI higher better, target harus sama atau lebih besar dari ambang minimum.');
  if (direction === 'LOWER_BETTER' && target > minimum) throw new HttpError(422, 'Untuk KPI lower better, target harus sama atau lebih kecil dari ambang batas.');
  const weight = decimal(body.weight_percent, 'Bobot')!;
  if (weight <= 0 || weight > 100) throw new HttpError(422, 'Bobot harus lebih dari 0 dan maksimal 100%.');
  const period = String(body.period_type ?? 'MONTHLY').trim().toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].includes(period)) throw new HttpError(422, 'Periode KPI tidak valid.');
  const effectiveFrom = dateOnly(body.effective_from, 'Tanggal efektif');
  const effectiveTo = body.effective_to ? dateOnly(body.effective_to, 'Tanggal akhir efektif') : null;
  if (effectiveTo && effectiveTo < effectiveFrom) throw new HttpError(422, 'Tanggal akhir efektif tidak boleh lebih awal.');
  return {
    kpiCode, name: requiredText(body.kpi_name, 'Nama KPI', 180), metric, scope: kpiScope,
    period, direction, unit: optionalText(body.unit, 40) ?? METRICS[metric].unit, baseline,
    baselineStart, baselineEnd, target, minimum, weight, owner: requiredText(body.owner_name, 'Owner KPI', 120),
    effectiveFrom, effectiveTo, notes: optionalText(body.notes, 5000),
  };
}

function evaluation(definition: Record<string, unknown>, metric: MetricResult): Record<string, unknown> {
  const actual = metric.actual;
  if (actual === null) return { ...definition, ...metric, actual_value: null, result_status: 'NOT_MEASURABLE', achievement_percent: null, improvement_from_baseline_percent: null, weighted_score: null };
  const target = Number(definition.target_value);
  const minimum = Number(definition.minimum_value);
  const baseline = Number(definition.baseline_value);
  const higher = definition.direction === 'HIGHER_BETTER';
  const resultStatus = higher ? (actual >= target ? 'ACHIEVED' : actual >= minimum ? 'WARNING' : 'BELOW_MINIMUM')
    : (actual <= target ? 'ACHIEVED' : actual <= minimum ? 'WARNING' : 'BELOW_MINIMUM');
  const achievement = higher ? (target > 0 ? actual / target * 100 : (actual >= target ? 100 : null))
    : (actual === 0 ? 100 : target / actual * 100);
  const improvement = baseline > 0 ? (higher ? (actual - baseline) / baseline * 100 : (baseline - actual) / baseline * 100) : null;
  const weighted = achievement === null ? null : Math.min(achievement, 100) * Number(definition.weight_percent) / 100;
  return { ...definition, ...metric, actual_value: actual, result_status: resultStatus, achievement_percent: achievement, improvement_from_baseline_percent: improvement, weighted_score: weighted };
}

energyEfficiencyKpiRouter.get('/energy/efficiency-kpis', canRead, asyncHandler(async (req, res) => {
  await ensureFeature();
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = req.query.date_from ? dateOnly(req.query.date_from, 'Tanggal mulai') : defaultFromDate.toISOString().slice(0, 10);
  const to = req.query.date_to ? dateOnly(req.query.date_to, 'Tanggal selesai') : defaultTo;
  if (to < from) throw new HttpError(422, 'Tanggal selesai tidak boleh lebih awal.');
  const company = optionalText(req.query.company, 120) ?? '';
  const companyFilter = company ? ' WHERE (k.scope_type=\'GLOBAL\' OR k.scope_company=? OR a.CompanyName=?)' : '';
  const definitions = await rows<Record<string, unknown>>(
    `SELECT k.*, a.AssetCode, a.AssetName, a.CompanyName AS asset_company, a.LocationAsset
     FROM energy_efficiency_kpi k LEFT JOIN energy_asset_profile p ON p.id=k.energy_profile_id
     LEFT JOIN asset a ON a.AssetID=p.asset_id${companyFilter}
     ORDER BY k.kpi_code, k.version_no DESC`, company ? [company, company] : []);
  const active = definitions.filter((item) => item.status === 'ACTIVE' && String(item.effective_from) <= to && (!item.effective_to || String(item.effective_to) >= from));
  const evaluations = [];
  for (const item of active) {
    const metric = await calculateMetric(item.metric_code as MetricCode, {
      scope_type: item.scope_type as ScopeType,
      scope_company: item.scope_company as string | null,
      energy_profile_id: item.energy_profile_id as number | null,
    }, from, to);
    evaluations.push(evaluation(item, metric));
  }
  const measurable = evaluations.filter((item) => item.weighted_score !== null);
  const totalWeight = measurable.reduce((sum, item) => sum + Number(item.weight_percent), 0);
  const overallScore = totalWeight ? measurable.reduce((sum, item) => sum + Number(item.weighted_score), 0) / totalWeight * 100 : null;
  const companies = await rows<{ value: string }>('SELECT DISTINCT CompanyName value FROM asset WHERE CompanyName IS NOT NULL AND CompanyName<>\'\' ORDER BY CompanyName');
  const profiles = await rows<Record<string, unknown>>(
    `SELECT p.id, p.energy_type, p.utility_type, a.AssetCode, a.AssetName, a.CompanyName, a.LocationAsset
     FROM energy_asset_profile p JOIN asset a ON a.AssetID=p.asset_id WHERE p.status='ACTIVE' ORDER BY a.AssetName`);
  ok(res, { filters: { date_from: from, date_to: to, company }, definitions, evaluations, overall_score: overallScore, options: { metrics: METRICS, companies: companies.map((item) => item.value), profiles } });
}));

energyEfficiencyKpiRouter.post('/energy/efficiency-kpis', canManage, asyncHandler(async (req, res) => {
  await ensureFeature();
  const input = await parseInput(req.body);
  const actor = String((req as AuthRequest).user!.fullname);
  const id = await transaction(async (connection) => {
    const current = await connectionOne<{ version_no: number | string }>(connection,
      'SELECT version_no FROM energy_efficiency_kpi WHERE kpi_code=? ORDER BY version_no DESC LIMIT 1 FOR UPDATE', [input.kpiCode]);
    const version = Number(current?.version_no ?? 0) + 1;
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO energy_efficiency_kpi
       (kpi_code,version_no,kpi_name,metric_code,scope_type,scope_company,energy_profile_id,period_type,direction,unit,
        baseline_value,baseline_start,baseline_end,target_value,minimum_value,weight_percent,owner_name,
        effective_from,effective_to,status,notes,created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,NOW(),NOW())`,
      [input.kpiCode, version, input.name, input.metric, input.scope.scope_type, input.scope.scope_company,
        input.scope.energy_profile_id, input.period, input.direction, input.unit, input.baseline, input.baselineStart,
        input.baselineEnd, input.target, input.minimum, input.weight, input.owner, input.effectiveFrom,
        input.effectiveTo, input.notes, actor, actor] as never);
    return { id: inserted.insertId, version };
  });
  created(res, id, 'Draft KPI Energy dibuat. Baseline dan sumber datanya telah disimpan.');
}));

energyEfficiencyKpiRouter.patch('/energy/efficiency-kpis/:id', canManage, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, 'KPI ID tidak valid.');
  const input = await parseInput(req.body);
  const actor = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const current = await connectionOne<{ status: string; kpi_code: string }>(connection, 'SELECT status,kpi_code FROM energy_efficiency_kpi WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    if (!current) throw new HttpError(404, 'KPI Energy tidak ditemukan.');
    if (current.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft KPI yang dapat diubah. Buat versi baru untuk KPI aktif.');
    if (current.kpi_code !== input.kpiCode) throw new HttpError(422, 'Kode KPI tidak dapat diubah setelah draft dibuat.');
    await connection.execute(
      `UPDATE energy_efficiency_kpi SET kpi_name=?,metric_code=?,scope_type=?,scope_company=?,energy_profile_id=?,period_type=?,
       direction=?,unit=?,baseline_value=?,baseline_start=?,baseline_end=?,target_value=?,minimum_value=?,weight_percent=?,
       owner_name=?,effective_from=?,effective_to=?,notes=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [input.name,input.metric,input.scope.scope_type,input.scope.scope_company,input.scope.energy_profile_id,input.period,
        input.direction,input.unit,input.baseline,input.baselineStart,input.baselineEnd,input.target,input.minimum,input.weight,
        input.owner,input.effectiveFrom,input.effectiveTo,input.notes,actor,id] as never);
  });
  ok(res, { id }, 'Draft KPI Energy diperbarui.');
}));

energyEfficiencyKpiRouter.post('/energy/efficiency-kpis/:id/activate', canApprove, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, 'KPI ID tidak valid.');
  const actor = String((req as AuthRequest).user!.fullname);
  await transaction(async (connection) => {
    const item = await connectionOne<{ status: string; kpi_code: string }>(connection, 'SELECT status,kpi_code FROM energy_efficiency_kpi WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    if (!item) throw new HttpError(404, 'KPI Energy tidak ditemukan.');
    if (item.status !== 'DRAFT') throw new HttpError(409, 'Hanya draft KPI yang dapat diaktifkan.');
    await connection.execute("UPDATE energy_efficiency_kpi SET status='INACTIVE',updated_by=?,updated_at=NOW() WHERE kpi_code=? AND status='ACTIVE'", [actor, item.kpi_code]);
    await connection.execute("UPDATE energy_efficiency_kpi SET status='ACTIVE',activated_by=?,activated_at=NOW(),updated_by=?,updated_at=NOW() WHERE id=?", [actor, actor, id]);
  });
  ok(res, { id, status: 'ACTIVE' }, 'KPI Energy diaktifkan dan versi aktif sebelumnya dinonaktifkan.');
}));

energyEfficiencyKpiRouter.post('/energy/efficiency-kpis/:id/archive', canApprove, asyncHandler(async (req, res) => {
  await ensureFeature();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, 'KPI ID tidak valid.');
  const actor = String((req as AuthRequest).user!.fullname);
  const result = await transaction(async (connection) => {
    const item = await connectionOne<{ status: string }>(connection, 'SELECT status FROM energy_efficiency_kpi WHERE id=? LIMIT 1 FOR UPDATE', [id]);
    if (!item) throw new HttpError(404, 'KPI Energy tidak ditemukan.');
    if (item.status === 'INACTIVE') throw new HttpError(409, 'KPI sudah nonaktif.');
    await connection.execute("UPDATE energy_efficiency_kpi SET status='INACTIVE',updated_by=?,updated_at=NOW() WHERE id=?", [actor, id]);
    return item.status;
  });
  ok(res, { id, status: 'INACTIVE', previous_status: result }, 'KPI Energy dinonaktifkan.');
}));

async function connectionOne<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const [result] = await connection.execute(sql, params as never);
  return ((result as T[])[0] ?? null);
}
