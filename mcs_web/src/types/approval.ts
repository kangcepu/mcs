export interface ApprovalSummary {
  wo_approvals?: number;
  wo_closings?: number;
  materials?: number;
  mutations?: number;
  total?: number;
  can_decide?: boolean;
  categories?: unknown;
  [key: string]: unknown;
}

export const APPROVAL_TABS = [
  { key: "wo_approvals", label: "WO Approval" },
  { key: "wo_closings", label: "WO Closing" },
  { key: "materials", label: "Material Request" },
  { key: "mutations", label: "Asset Mutation" },
] as const;

export type ApprovalTabKey = (typeof APPROVAL_TABS)[number]["key"];

/**
 * Baris approval dari V2 bridge. WO rows: module_key, module_label, wo_number,
 * date, company, job_title, type_wo, status, asset_name, can_decide.
 */
export interface ApprovalItem {
  id?: number | string;
  module_key?: string;
  module_label?: string;
  wo_number?: string | null;
  doc_no?: string | null;
  document_no?: string | null;
  date?: string | null;
  job_title?: string | null;
  title?: string | null;
  type_wo?: string | null;
  company?: string | null;
  asset_name?: string | null;
  asset_code?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  status?: string | null;
  amount?: number | null;
  note?: string | null;
  can_decide?: boolean;
  [key: string]: unknown;
}
