/** Status siklus tb_material_part_request. */
export const MATERIAL_STATUS = [
  "PENDING",
  "SELECTED",
  "SENT_ERP",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUS)[number];

export interface MaterialUsageListItem {
  id: number | string;
  ref?: string;
  wo_number?: string | null;
  module?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
  job_title?: string | null;
  requester?: string | null;
  executor?: string | null;
  status?: string | null;
  pr_number?: string | null;
  erp_status?: string | null;
  erp_synced_at?: string | null;
  requested_at?: string | null;
  received_at?: string | null;
  [key: string]: unknown;
}

export interface MaterialUsageLine {
  id?: number | string;
  part_code?: string;
  part_name?: string;
  uom?: string;
  qty_request?: number;
  qty_receive?: number;
  qty_usage?: number;
  pr_number?: string | null;
  erp_status?: string | null;
  [key: string]: unknown;
}

/** Payload GET /v2/material-usage/detail?id=. */
export interface MaterialUsageDetail {
  request?: Record<string, unknown>;
  wo?: Record<string, unknown>;
  /** Header tb_material_usage; status proses aktual berada di sini. */
  usage_header?: Record<string, unknown> | null;
  request_code?: string;
  wo_number?: string;
  job_executor?: string;
  parts?: Array<Record<string, unknown>>;
  purchase?: Array<Record<string, unknown>>;
  hold?: Array<Record<string, unknown>> | Record<string, unknown> | null;
}

export interface MaterialUsageFilters {
  q?: string;
  status?: string;
  wo_number?: string;
  page?: number;
  per_page?: number;
}

export interface ErpPartOption {
  part_code: string;
  part_name: string;
  uom?: string;
  stock?: number;
  [key: string]: unknown;
}
