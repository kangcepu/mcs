import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  MaterialUsageDetail,
  MaterialUsageFilters,
  MaterialUsageListItem,
} from "@/types/material";

/** GET /v2/material-usage/list → { data:[rows], meta } (V2 bridge, paginated) */
export function listMaterialUsage(
  filters: MaterialUsageFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<MaterialUsageListItem[]>> {
  return apiV2.get<MaterialUsageListItem[]>("/material-usage/list", {
    params: {
      page: filters.page,
      per_page: filters.per_page,
      status: filters.status,
      wo_number: filters.wo_number,
      q: filters.q,
    },
    signal,
  });
}

/**
 * GET /v2/material-usage/detail?id= → { request, wo, request_code, wo_number,
 * job_executor, parts[], purchase[], hold }
 */
export function getMaterialUsageDetail(
  id: string | number,
  signal?: AbortSignal,
): Promise<ApiResponse<MaterialUsageDetail>> {
  return apiV2.get<MaterialUsageDetail>("/material-usage/detail", {
    params: { id },
    signal,
  });
}

export interface MaterialRequestResult {
  id: number | string;
  wo_number: string;
  status: "PENDING";
}

/** POST /v2/material-usage/request — executor mengajukan (belum ada part). */
export function requestMaterial(body: Record<string, unknown>) {
  return apiV2.post<MaterialRequestResult>("/material-usage/request", body);
}

export interface ErpPartHit {
  part_name: string;
  item_id?: number | string | null;
  item_code?: string;
  company?: string;
  uom?: string;
  uom_level?: number | string | null;
}

/** GET /v2/material-usage/erp-parts?company=&q= — cari part dari master ERP. */
export function searchErpParts(
  company: string,
  q: string,
  signal?: AbortSignal,
): Promise<ApiResponse<ErpPartHit[]>> {
  return apiV2.get<ErpPartHit[]>("/material-usage/erp-parts", {
    params: { company, q },
    signal,
  });
}

export interface SelectPartItem {
  part_name: string;
  qty: number;
  uom: string;
  pr_number?: string;
  erp_company?: string;
  erp_item_id?: number | string;
  erp_item_code?: string;
  erp_uom_level?: number | string;
  erp_warehouse_id?: number;
}

/** POST /v2/material-usage/select-parts — tim Sparepart mengisi part + qty request. */
export function selectMaterialParts(body: { id: string | number; items: SelectPartItem[] }) {
  return apiV2.post<{ request_code: string | null }>("/material-usage/select-parts", body);
}

export interface UsageRow {
  id: number | string;
  material_usage: number;
  uom: string;
}

/** POST /v2/material-usage/set-usage — isi pemakaian aktual per part. */
export function setMaterialUsage(body: {
  wo_number: string;
  job_executor: string;
  request_code: string;
  rows: UsageRow[];
}) {
  return apiV2.post<{ request_code: string }>("/material-usage/set-usage", body);
}

/**
 * Trigger alur sinkronisasi ERP lama untuk request yang sudah SELECTED.
 * Endpoint ini masih diteruskan oleh compatibility facade V2, sehingga
 * pemanggil tetap selalu menggunakan namespace /api/v2.
 */
export function triggerErpSync(body: { id: string | number }) {
  return apiV2.post<{ id: number; status: string; note?: string }>(
    "/material-usage/trigger_erp",
    body,
  );
}

export interface ConfirmPurchaseRow {
  part_prc: string;
  material_usage_prc: number;
  material_receive_prc: number;
  uom_prc: string;
}

/** POST /v2/material-usage/confirm — finalisasi (IN_PROGRESS → CLOSED). */
export function confirmMaterialUsage(body: {
  wo_number: string;
  job_executor: string;
  request_code: string;
  purchase_rows: ConfirmPurchaseRow[];
}) {
  return apiV2.post<{ request_code: string }>("/material-usage/confirm", body);
}

/** POST /v2/material-usage/hold — tahan sebagian qty part (id = row tb_material_request). */
export function holdMaterialPart(body: {
  id: string | number;
  hold_qty: number;
  remarks: string;
}) {
  return apiV2.post<{ id: number }>("/material-usage/hold", body);
}

export function cancelMaterialRequest(id: string | number) {
  return apiV2.delete<null>("/material-usage/cancel", { params: { id } });
}

/** Void part yang sudah SELECTED tapi ternyata gak jadi diambil. */
export function voidSelectedMaterialRequest(id: string | number) {
  return apiV2.delete<null>("/material-usage/void-selection", { params: { id } });
}
