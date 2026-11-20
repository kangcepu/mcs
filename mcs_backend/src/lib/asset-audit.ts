import type { PoolConnection } from 'mysql2/promise';
import { execute, rows, tableExists } from '../db.js';

type AuditData = Record<string, unknown> | null | undefined;

export async function recordAssetAudit(
  assetCode: string,
  eventType: string,
  category: string,
  summary: string,
  actor: string,
  options: {
    before?: AuditData;
    after?: AuditData;
    referenceType?: string;
    referenceId?: string | number;
    connection?: PoolConnection;
  } = {},
): Promise<void> {
  if (!assetCode || !(await tableExists('asset_audit_timeline'))) return;
  const sql = `INSERT INTO asset_audit_timeline
    (asset_id,asset_code,event_type,event_category,event_summary,before_data,after_data,
     reference_type,reference_id,actor_name,event_at)
    SELECT AssetID,AssetCode,?,?,?,?,?,?,?,?,NOW() FROM asset WHERE AssetCode=? LIMIT 1`;
  const params = [
    eventType,
    category,
    summary,
    options.before ? JSON.stringify(options.before) : null,
    options.after ? JSON.stringify(options.after) : null,
    options.referenceType ?? null,
    options.referenceId == null ? null : String(options.referenceId),
    actor || 'SYSTEM',
    assetCode,
  ];
  if (options.connection) await options.connection.execute(sql, params);
  else await execute(sql, params);
}

export async function getAssetAudit(assetId: number): Promise<Record<string, unknown>[]> {
  if (!assetId || !(await tableExists('asset_audit_timeline'))) return [];
  return rows<Record<string, unknown>>(
    `SELECT id,asset_id,asset_code,event_type,event_category,event_summary,before_data,after_data,
            reference_type,reference_id,actor_name,event_at
     FROM asset_audit_timeline WHERE asset_id=? ORDER BY event_at DESC,id DESC`,
    [assetId],
  );
}
