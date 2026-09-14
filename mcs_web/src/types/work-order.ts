export const WO_MODULES = ["meso", "maintenance", "production", "is", "ga"] as const;
export type WoModule = (typeof WO_MODULES)[number];

export const WO_MODULE_LABEL: Record<WoModule, string> = {
  meso: "MESO",
  maintenance: "Maintenance",
  production: "Production",
  is: "IS",
  ga: "GA",
};

export interface WorkOrderListItem {
  id?: number | string;
  wo_number: string;
  module?: string;
  title?: string;
  description?: string;
  type_wo?: string;
  status?: string;
  priority?: string | null;
  company?: string | null;
  company_name?: string | null;
  asset_id?: number | string | null;
  asset_code?: string | null;
  asset_name?: string | null;
  requested_by?: string | null;
  executor?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  closed_at?: string | null;
  [key: string]: unknown;
}

export interface WorkOrderFilters {
  module?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  type_wo?: string;
  company?: string;
  asset_id?: string;
  q?: string;
  page?: number;
  per_page?: number;
}

export interface WorkOrderLabor {
  name?: string;
  role?: string;
  hours?: number;
  cost?: number;
  [key: string]: unknown;
}

export interface WorkOrderMaterial {
  part_code?: string;
  part_name?: string;
  qty?: number;
  uom?: string;
  status?: string;
  [key: string]: unknown;
}

export interface WorkOrderApprovalStep {
  level?: number | string;
  role?: string;
  approver?: string;
  status?: string;
  note?: string | null;
  acted_at?: string | null;
  [key: string]: unknown;
}

export interface WorkOrderEvidence {
  id?: number | string;
  url?: string;
  type?: string;
  caption?: string | null;
  stage?: string | null;
  [key: string]: unknown;
}

export interface WorkOrderHistoryEntry {
  at?: string;
  actor?: string;
  action?: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  [key: string]: unknown;
}

export interface WorkOrderScheduleItem {
  part?: string;
  activity?: string;
  frequency?: string;
  condition?: string | null;
  [key: string]: unknown;
}

export interface WorkOrderDetail extends WorkOrderListItem {
  actions?: {
    can_approve?: boolean;
    can_close?: boolean;
  };
  executors?: Array<Record<string, unknown>>;
  labors?: WorkOrderLabor[];
  materials?: WorkOrderMaterial[];
  approvals?: WorkOrderApprovalStep[];
  evidences?: WorkOrderEvidence[];
  histories?: WorkOrderHistoryEntry[];
  schedule_items?: WorkOrderScheduleItem[];
  schedule_id?: number | string | null;
}
