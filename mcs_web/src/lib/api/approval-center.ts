import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type { ApprovalItem, ApprovalSummary, ApprovalTabKey } from "@/types/approval";

/** GET /v2/approval-center/summary → { wo_approvals, wo_closings, materials, mutations, total, categories, can_decide } */
export function getApprovalSummary(
  signal?: AbortSignal,
): Promise<ApiResponse<ApprovalSummary>> {
  return apiV2.get<ApprovalSummary>("/approval-center/summary", { signal });
}

/** tab key (`wo_approvals`) → path segment (`wo-approvals`). */
const TAB_PATH: Record<ApprovalTabKey, string> = {
  wo_approvals: "wo-approvals",
  wo_closings: "wo-closings",
  materials: "materials",
  mutations: "mutations",
};

export function listApprovals(
  tab: ApprovalTabKey,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<ApprovalItem[]>> {
  return apiV2.get<ApprovalItem[]>(`/approval-center/${TAB_PATH[tab]}`, {
    params,
    signal,
  });
}

export type WoDecision = "approve" | "reject" | "close" | "void";

/** POST /v2/approval-center/wo-{approve|reject|close|void} — body {module, wo_number, comment?} */
export function decideWorkOrder(
  decision: WoDecision,
  body: { module: string; wo_number: string; comment?: string },
) {
  return apiV2.post<unknown>(`/approval-center/wo-${decision}`, body);
}

/** POST /v2/approval-center/mutation-{approve|reject} — body {doc_no, comment?} */
export function decideMutation(
  decision: "approve" | "reject",
  body: { doc_no: string; comment?: string },
) {
  return apiV2.post<unknown>(`/approval-center/mutation-${decision}`, body);
}
