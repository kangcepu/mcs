import { rows } from '../db.js';
import type { PoolConnection } from 'mysql2/promise';

interface HierarchyAsset {
  AssetID: number;
  AssetCode: string;
  AssetName: string;
  CompanyName?: string | null;
}

function hierarchyLocation(asset: HierarchyAsset | null): string | null {
  if (!asset) return null;
  return `${asset.AssetName || asset.AssetCode} (${asset.AssetCode})`;
}

export async function recordAssetHierarchyHistory(
  connection: PoolConnection,
  child: HierarchyAsset,
  previousParent: HierarchyAsset | null,
  nextParent: HierarchyAsset | null,
  actor: string,
): Promise<void> {
  const eventType = previousParent && nextParent
    ? 'PARENT_MOVED'
    : (nextParent ? 'PARENT_ATTACHED' : 'PARENT_DETACHED');
  const note = previousParent && nextParent
    ? `Dipindahkan dari ${previousParent.AssetCode} ke ${nextParent.AssetCode}`
    : (nextParent ? `Ditautkan ke ${nextParent.AssetCode}` : `Dilepas dari ${previousParent?.AssetCode ?? '-'}`);
  await connection.execute(
    `INSERT INTO asset_location_history (
       asset_id, asset_code, company_from, company_to, location_from, location_to,
       event_type, source, note, changed_by, moved_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
    [
      child.AssetID,
      child.AssetCode,
      previousParent?.CompanyName ?? null,
      nextParent?.CompanyName ?? null,
      hierarchyLocation(previousParent),
      hierarchyLocation(nextParent),
      eventType,
      'ASSET_HIERARCHY',
      note,
      actor,
    ],
  );
}

export async function getAssetLocationHistory(assetId: number): Promise<Record<string, unknown>[]> {
  if (!assetId) return [];
  return rows<Record<string, unknown>>(
    `SELECT id, asset_id, asset_code, company_from, company_to,
            location_from, location_to, event_type, source, reference_no,
            note, changed_by, moved_at
     FROM asset_location_history
     WHERE asset_id = ?
     ORDER BY moved_at DESC, id DESC`,
    [assetId],
  );
}
