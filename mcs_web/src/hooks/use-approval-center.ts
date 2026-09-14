"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  decideMutation,
  decideWorkOrder,
  getApprovalSummary,
  listApprovals,
  type WoDecision,
} from "@/lib/api/approval-center";
import type { ApprovalTabKey } from "@/types/approval";

export function useApprovalSummary() {
  return useQuery({
    queryKey: ["approval-summary"],
    queryFn: ({ signal }) => getApprovalSummary(signal),
    staleTime: 30_000,
  });
}

export function useApprovalList(
  tab: ApprovalTabKey,
  params: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["approval-list", tab, params],
    queryFn: ({ signal }) => listApprovals(tab, params, signal),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateApprovals() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["approval-summary"] });
    qc.invalidateQueries({ queryKey: ["approval-list"] });
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useWorkOrderDecision() {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (vars: {
      decision: WoDecision;
      module: string;
      wo_number: string;
      comment?: string;
    }) =>
      decideWorkOrder(vars.decision, {
        module: vars.module,
        wo_number: vars.wo_number,
        comment: vars.comment,
      }),
    onSuccess: invalidate,
  });
}

export function useMutationDecision() {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (vars: {
      decision: "approve" | "reject";
      doc_no: string;
      comment?: string;
    }) => decideMutation(vars.decision, { doc_no: vars.doc_no, comment: vars.comment }),
    onSuccess: invalidate,
  });
}
