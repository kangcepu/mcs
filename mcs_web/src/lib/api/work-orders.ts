import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  WorkOrderDetail,
  WorkOrderFilters,
  WorkOrderListItem,
} from "@/types/work-order";

export function listWorkOrders(
  filters: WorkOrderFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<WorkOrderListItem[]>> {
  return apiV2.get<WorkOrderListItem[]>("/work-orders", {
    params: { ...filters },
    signal,
  });
}

export function getWorkOrderDetail(
  woNumber: string,
  module: string,
  signal?: AbortSignal,
): Promise<ApiResponse<WorkOrderDetail>> {
  return apiV2.get<WorkOrderDetail>("/work-orders/detail", {
    params: { wo_number: woNumber, module },
    signal,
  });
}

export interface WorkOrderMaterials {
  /** `tb_material_request` — alur Material Usage klasik (request/receive/usage per part). */
  line_items: Array<Record<string, unknown>>;
  /** `tb_material_part_request` — alur executor "Ajukan Part" → tim Sparepart. */
  requests: Array<Record<string, unknown>>;
  /** `tb_detail_material` — material dicatat langsung di WO. */
  recorded: Array<Record<string, unknown>>;
  headers: Array<Record<string, unknown>>;
  summary: { line_items: number; requests: number; recorded: number };
}

/** GET /v2/work-orders/materials?wo_number= — semua jejak material sebuah WO. */
export function getWorkOrderMaterials(
  woNumber: string,
  signal?: AbortSignal,
): Promise<ApiResponse<WorkOrderMaterials>> {
  return apiV2.get<WorkOrderMaterials>("/work-orders/materials", {
    params: { wo_number: woNumber },
    signal,
  });
}

export interface WoOptionItem {
  code: string;
  label: string;
}
export interface WorkOrderOptions {
  statuses: WoOptionItem[];
  types: WoOptionItem[];
  priorities: WoOptionItem[];
  shifts: WoOptionItem[];
  modules: WoOptionItem[];
}

export function getWorkOrderOptions(
  signal?: AbortSignal,
): Promise<ApiResponse<WorkOrderOptions>> {
  return apiV2.get<WorkOrderOptions>("/work-orders/options", { signal });
}

export interface CreateWorkOrderInput {
  module: string;
  asset_code: string;
  job_title: string;
  type_wo?: string;
  priority?: string;
  shift?: string;
  date?: string;
  company?: string;
  id_division?: number | string;
  running_hours?: string;
  job_requirement?: string;
  /** Khusus module "maintenance": MKL | ELC | SPL | OTO. */
  category_maintenance?: string;
}

export interface CreatedWorkOrder {
  wo_number: string;
  module: string;
  asset_code: string;
}

/** POST /v2/work-orders/create — buat WO baru pada modul terpilih. */
export function createWorkOrder(
  body: CreateWorkOrderInput,
): Promise<ApiResponse<CreatedWorkOrder>> {
  return apiV2.post<CreatedWorkOrder>("/work-orders/create", body);
}

export interface UpdateWorkOrderInput {
  module: string;
  wo_number: string;
  company?: string;
  shift?: string;
  type_wo?: string;
  priority?: string;
  id_division?: number | string;
  /** AssetID atau asset_code. */
  id_equipment?: string;
  asset_code?: string;
  job_title?: string;
  running_hours?: string;
  job_requirement?: string;
  category_maintenance?: string;
}

/** POST /v2/work-orders/update — edit header WO (memicu approval ulang). */
export function updateWorkOrderHeader(body: UpdateWorkOrderInput) {
  return apiV2.post<{ wo_number: string; module: string }>(
    "/work-orders/update",
    body,
  );
}

export interface WorkOrderPlannerInput {
  module: string;
  wo_number: string;
  job_executor: string[];
  started_planner: string;
  finished_planner: string;
  estimate_planner?: string;
  comment?: string;
}

/** POST /v2/work-orders/planner — assign eksekutor + jadwal planner. */
export function saveWorkOrderPlanner(body: WorkOrderPlannerInput) {
  return apiV2.post<{ wo_number: string; job_executor: string }>(
    "/work-orders/planner",
    body,
  );
}

/** POST /v2/work-orders/sub — buat sub-WO ke divisi lain (GA | IT | MTC). */
export function createSubWorkOrder(
  module: string,
  woNumber: string,
  subTo: "GA" | "IT" | "MTC",
) {
  return apiV2.post<{ wo_number: string; sub_wo_number: string; sub_to: string }>(
    "/work-orders/sub",
    { module, wo_number: woNumber, sub_to: subTo },
  );
}

export type WoAction = "approve" | "reject" | "close" | "void";

/** POST /v2/work-orders/{approve|reject|close|void} — body {module, wo_number, comment?}. */
export function decideWorkOrder(
  action: WoAction,
  body: { module: string; wo_number: string; comment?: string },
) {
  return apiV2.post<unknown>(`/work-orders/${action}`, body);
}
