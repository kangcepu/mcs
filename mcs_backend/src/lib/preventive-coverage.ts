import { rows } from '../db.js';
import type { User } from '../types.js';

export const MAINTENANCE_AREAS = [
  { key: 'GSU_INJECT', label: 'GSU - Inject', permission: 'mtc_area_gsu_inject' },
  { key: 'GSU_WNB', label: 'GSU - WNB', permission: 'mtc_area_gsu_wnb' },
  { key: 'RU_PRODUCTION', label: 'RU - FJLB', permission: 'mtc_area_ru_production' },
  { key: 'RU_SAWMILL', label: 'RU - Sawmill', permission: 'mtc_area_ru_sawmill' },
] as const;

export interface PreventiveCoverageAsset {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  company: string;
  location: string;
  mtc_area_key: string;
  mtc_area_label: string;
  status: 'BELUM_TERJADWAL';
}

export interface PreventiveCoverageSummary {
  required: number;
  scheduled: number;
  missing: number;
  coverage_percent: number;
  by_area: Array<{ key: string; label: string; required: number; scheduled: number; missing: number; coverage_percent: number }>;
}

function allAreaAccess(user: User): boolean {
  const username = String(user.username ?? '').toUpperCase();
  return username === 'SUPERUSER'
    || Number(user.wo_cross_access ?? 0) === 1
    || Number(user.wo_cross_access_maintenance ?? 0) === 1;
}

export function preventiveAreasForUser(user: User): string[] {
  if (allAreaAccess(user)) return MAINTENANCE_AREAS.map((area) => area.key);
  return MAINTENANCE_AREAS
    .filter((area) => Number(user[area.permission] ?? 0) === 1)
    .map((area) => area.key);
}

export async function getPreventiveCoverageAssets(user: User, company = ''): Promise<PreventiveCoverageAsset[]> {
  const areas = preventiveAreasForUser(user);
  if (!areas.length) return [];
  const params: unknown[] = [...areas];
  let companySql = '';
  if (company.trim()) {
    companySql = ' AND UPPER(TRIM(a.CompanyName))=UPPER(TRIM(?))';
    params.push(company.trim());
  }
  const data = await rows<Record<string, unknown>>(
    `SELECT a.AssetID,a.AssetCode,a.AssetName,a.CompanyName,a.LocationAsset,a.mtc_area_key
     FROM asset a
     WHERE a.active='active'
       AND a.mtc_area_key IN (${areas.map(() => '?').join(',')})${companySql}
       AND NOT EXISTS (
         SELECT 1 FROM tb_schedule_header h
         JOIN tbl_schedules_detail sd ON sd.tbl_schedules_id=h.id AND sd.is_pause='started'
         WHERE h.AssetCode=a.AssetCode
       )
     ORDER BY FIELD(a.mtc_area_key,'GSU_INJECT','GSU_WNB','RU_PRODUCTION','RU_SAWMILL'),a.CompanyName,a.AssetName,a.AssetCode`,
    params,
  );
  const labels = new Map<string, string>(MAINTENANCE_AREAS.map((area) => [area.key, area.label]));
  return data.map((item) => ({
    asset_id: Number(item.AssetID),
    asset_code: String(item.AssetCode ?? ''),
    asset_name: String(item.AssetName ?? ''),
    company: String(item.CompanyName ?? ''),
    location: String(item.LocationAsset ?? ''),
    mtc_area_key: String(item.mtc_area_key ?? ''),
    mtc_area_label: labels.get(String(item.mtc_area_key ?? '')) ?? String(item.mtc_area_key ?? ''),
    status: 'BELUM_TERJADWAL',
  }));
}

export async function getPreventiveCoverageSummary(user: User, company = ''): Promise<PreventiveCoverageSummary> {
  const areas = preventiveAreasForUser(user);
  const empty = { required: 0, scheduled: 0, missing: 0, coverage_percent: 0, by_area: [] };
  if (!areas.length) return empty;
  const params: unknown[] = [...areas];
  let companySql = '';
  if (company.trim()) {
    companySql = ' AND UPPER(TRIM(a.CompanyName))=UPPER(TRIM(?))';
    params.push(company.trim());
  }
  const data = await rows<{ area_key: string; required_count: number; scheduled_count: number }>(
    `SELECT a.mtc_area_key AS area_key,COUNT(*) AS required_count,
       SUM(CASE WHEN EXISTS (
         SELECT 1 FROM tb_schedule_header h
         JOIN tbl_schedules_detail sd ON sd.tbl_schedules_id=h.id AND sd.is_pause='started'
         WHERE h.AssetCode=a.AssetCode
       ) THEN 1 ELSE 0 END) AS scheduled_count
     FROM asset a
     WHERE a.active='active' AND a.mtc_area_key IN (${areas.map(() => '?').join(',')})${companySql}
     GROUP BY a.mtc_area_key`,
    params,
  );
  const byKey = new Map(data.map((item) => [String(item.area_key), item]));
  const byArea = MAINTENANCE_AREAS.filter((area) => areas.includes(area.key)).map((area) => {
    const item = byKey.get(area.key);
    const required = Number(item?.required_count ?? 0);
    const scheduled = Number(item?.scheduled_count ?? 0);
    return { key: area.key, label: area.label, required, scheduled, missing: Math.max(0, required - scheduled), coverage_percent: required ? Math.round((scheduled / required) * 1000) / 10 : 0 };
  });
  const required = byArea.reduce((sum, area) => sum + area.required, 0);
  const scheduled = byArea.reduce((sum, area) => sum + area.scheduled, 0);
  return { required, scheduled, missing: Math.max(0, required - scheduled), coverage_percent: required ? Math.round((scheduled / required) * 1000) / 10 : 0, by_area: byArea };
}
