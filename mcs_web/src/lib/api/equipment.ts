import { apiV2 } from "@/lib/api-client";

export interface BomPart {
  id: number;
  AssetCode?: string;
  part?: string;
  header?: string | null;
  level?: number | string | null;
  parent?: number | string | null;
  no_urut?: number | string | null;
  id_nested?: string | null;
  qty_on_hand?: number | string | null;
  uom?: string | null;
  company?: string | null;
  is_active?: number | string | null;
  total_used?: number | string | null;
  last_usage_date?: string | null;
  [key: string]: unknown;
}

export interface PartUsageRow {
  id: number;
  part_id: number;
  qty_used: number | string;
  qty_before: number | string;
  qty_after: number | string;
  used_for: string;
  work_order_no?: string | null;
  project_name?: string | null;
  reference_no?: string | null;
  used_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  uom?: string | null;
  part?: string | null;
  [key: string]: unknown;
}

export interface BomPhoto {
  id: number;
  filename: string;
  url: string;
  original_filename?: string | null;
  [key: string]: unknown;
}

export function listBomParts(assetCode: string, signal?: AbortSignal) {
  return apiV2.get<BomPart[]>("/equipment/parts", {
    params: { asset_code: assetCode },
    signal,
  });
}

export function addSubPart(body: {
  asset_code: string;
  part: string;
  uom?: string;
  company?: string;
  qty_on_hand?: number | string;
  level?: number | string;
  id_nested?: string;
}) {
  return apiV2.post<{ id: number }>("/equipment/parts/sub", body);
}

export function togglePart(id: number) {
  return apiV2.post<{ id: number; is_active: number }>(
    "/equipment/parts/toggle",
    { id },
  );
}
export function disablePart(id: number) {
  return apiV2.post<{ id: number }>("/equipment/parts/disable", { id });
}
export function enablePart(id: number) {
  return apiV2.post<{ id: number }>("/equipment/parts/enable", { id });
}

export function consumePart(body: {
  part_id: number;
  qty_used: number | string;
  used_for: string;
  work_order_no?: string;
  project_name?: string;
  reference_no?: string;
  used_date?: string;
  notes?: string;
}) {
  return apiV2.post<{ qty_before: number; qty_after: number; is_disabled: boolean }>(
    "/equipment/parts/use",
    body,
  );
}

export function restockPart(body: {
  part_id: number;
  qty_added: number | string;
  notes: string;
  reference_no?: string;
}) {
  return apiV2.post<{ qty_before: number; qty_after: number; is_enabled: boolean }>(
    "/equipment/parts/restock",
    body,
  );
}

export function listPartHistory(partId: number, signal?: AbortSignal) {
  return apiV2.get<PartUsageRow[]>("/equipment/parts/history", {
    params: { part_id: partId },
    signal,
  });
}

export function deletePartHistory(id: number) {
  return apiV2.delete<{ id: number }>("/equipment/parts/history", {
    params: { id },
  });
}

export function listBomPhotos(
  assetCode: string,
  partId: number,
  signal?: AbortSignal,
) {
  return apiV2.get<BomPhoto[]>("/equipment/bom-photos", {
    params: { asset_code: assetCode, part_id: partId },
    signal,
  });
}

export function uploadBomPhoto(assetCode: string, partId: number, file: File) {
  const fd = new FormData();
  fd.append("asset_code", assetCode);
  fd.append("part_id", String(partId));
  fd.append("photo", file);
  return apiV2.post<BomPhoto>("/equipment/bom-photos", undefined, {
    formData: fd,
  });
}

export function deleteBomPhoto(id: number) {
  return apiV2.delete<{ id: number }>("/equipment/bom-photos", {
    params: { id },
  });
}

/* ---------------- Anotasi gambar custom detail ---------------- */

/** GET /v2/equipment/custom-detail-image?path= — gambar sbg data URI (bebas taint CORS). */
export function getCustomDetailImageData(path: string, signal?: AbortSignal) {
  return apiV2.get<{ filename: string; mime: string; data_uri: string }>(
    "/equipment/custom-detail-image",
    { params: { path }, signal },
  );
}

/** POST /v2/equipment/annotated-image — timpa file gambar dengan hasil anotasi. */
export function saveAnnotatedImage(body: {
  image: string;
  row_id: number | string;
  column_type: string;
  original_filename: string;
}) {
  return apiV2.post<{ filename: string; url: string }>(
    "/equipment/annotated-image",
    body,
  );
}

/* ---------------- Missing maintenance-area WO alert ---------------- */

export interface MissingAreaAlert {
  wo_number?: string;
  AssetCode?: string;
  [key: string]: unknown;
}

export function getMissingAreaAlerts(limit = 100, signal?: AbortSignal) {
  return apiV2.get<{
    items: MissingAreaAlert[];
    summary: { total_wo: number; total_asset: number };
  }>("/equipment/missing-area-alerts", { params: { limit }, signal });
}

export function reviewMissingAreaAlert(body: {
  wo_number: string;
  decision: string;
  note?: string;
}) {
  return apiV2.post<Record<string, unknown>>(
    "/equipment/missing-area-alerts/review",
    body,
  );
}
