"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createWorkOrder,
  decideWorkOrder,
  getWorkOrderDetail,
  getWorkOrderMaterials,
  getWorkOrderOptions,
  listWorkOrders,
  type CreateWorkOrderInput,
  type WoAction,
} from "@/lib/api/work-orders";
import type { WorkOrderFilters } from "@/types/work-order";

export function useWorkOrders(filters: WorkOrderFilters) {
  return useQuery({
    queryKey: ["work-orders", filters],
    queryFn: ({ signal }) => listWorkOrders(filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function useWorkOrderDetail(woNumber: string, module: string) {
  return useQuery({
    queryKey: ["work-order-detail", module, woNumber],
    queryFn: ({ signal }) => getWorkOrderDetail(woNumber, module, signal),
    enabled: Boolean(woNumber && module),
  });
}

/** Semua jejak material sebuah WO (tab Material di detail WO). */
export function useWorkOrderMaterials(woNumber: string, enabled = true) {
  return useQuery({
    queryKey: ["work-order-materials", woNumber],
    queryFn: ({ signal }) => getWorkOrderMaterials(woNumber, signal),
    enabled: enabled && Boolean(woNumber),
    staleTime: 30_000,
  });
}

export function useWorkOrderOptions() {
  return useQuery({
    queryKey: ["work-order-options"],
    queryFn: ({ signal }) => getWorkOrderOptions(signal),
    staleTime: 30 * 60_000,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkOrderInput) => createWorkOrder(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["approval-summary"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useWorkOrderAction(woNumber: string, module: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: WoAction; comment?: string }) =>
      decideWorkOrder(vars.action, {
        module,
        wo_number: woNumber,
        comment: vars.comment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-order-detail", module, woNumber] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["approval-summary"] });
      qc.invalidateQueries({ queryKey: ["approval-list"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
