"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addWoLabor,
  completeWo,
  forwardWoToMeso,
  getPreventiveParts,
  requestPart,
  savePreventiveParts,
  submitJobExplanation,
} from "@/lib/api/wo-execution";
import {
  createSubWorkOrder,
  saveWorkOrderPlanner,
  updateWorkOrderHeader,
  type UpdateWorkOrderInput,
  type WorkOrderPlannerInput,
} from "@/lib/api/work-orders";

/** Kapabilitas aksi eksekutor per-modul (mengikuti controller backend yang tersedia). */
export const WO_EXEC_CAPS: Record<
  string,
  { job: boolean; labor: boolean; material: boolean; complete: boolean }
> = {
  is: { job: true, labor: true, material: true, complete: true },
  ga: { job: true, labor: true, material: true, complete: true },
  production: { job: true, labor: true, material: true, complete: true },
  maintenance: { job: true, labor: true, material: true, complete: false },
  meso: { job: true, labor: true, material: true, complete: true },
};

export function woExecCaps(module: string) {
  return (
    WO_EXEC_CAPS[module] ?? {
      job: false,
      labor: false,
      material: false,
      complete: false,
    }
  );
}

export function useWoExecution(module: string, woNumber: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["work-order-detail", module, woNumber] });
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["work-order-materials", woNumber] });
    qc.invalidateQueries({ queryKey: ["material-usage"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["preventive-parts", module, woNumber] });
  };

  return {
    savePreventiveParts: useMutation({
      mutationFn: (rows: Parameters<typeof savePreventiveParts>[2]) =>
        savePreventiveParts(module, woNumber, rows),
      onSuccess: invalidate,
    }),
    forwardMeso: useMutation({
      mutationFn: (comment?: string) => forwardWoToMeso(woNumber, comment),
      onSuccess: invalidate,
    }),
    jobExplanation: useMutation({
      mutationFn: (fd: FormData) => submitJobExplanation(module, fd),
      onSuccess: invalidate,
    }),
    addLabor: useMutation({
      mutationFn: (body: {
        wo_number: string;
        trade: string[];
        men: number | string;
        hours: number | string;
      }) => addWoLabor(module, body),
      onSuccess: invalidate,
    }),
    requestPart: useMutation({
      mutationFn: (note?: string) => requestPart({ wo_number: woNumber, note }),
      onSuccess: invalidate,
    }),
    complete: useMutation({
      mutationFn: (body: { wo_number: string; comment?: string }) =>
        completeWo(module, body),
      onSuccess: invalidate,
    }),
    updateHeader: useMutation({
      mutationFn: (body: Omit<UpdateWorkOrderInput, "module" | "wo_number">) =>
        updateWorkOrderHeader({ ...body, module, wo_number: woNumber }),
      onSuccess: invalidate,
    }),
    savePlanner: useMutation({
      mutationFn: (
        body: Omit<WorkOrderPlannerInput, "module" | "wo_number">,
      ) => saveWorkOrderPlanner({ ...body, module, wo_number: woNumber }),
      onSuccess: invalidate,
    }),
    subWo: useMutation({
      mutationFn: (subTo: "GA" | "IT" | "MTC") =>
        createSubWorkOrder(module, woNumber, subTo),
      onSuccess: invalidate,
    }),
  };
}

export function usePreventiveParts(
  module: string,
  woNumber: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["preventive-parts", module, woNumber],
    queryFn: ({ signal }) => getPreventiveParts(module, woNumber, signal),
    enabled: enabled && !!woNumber,
    staleTime: 30_000,
  });
}
