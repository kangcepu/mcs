"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cancelMaterialRequest,
  confirmMaterialUsage,
  getMaterialUsageDetail,
  holdMaterialPart,
  listMaterialUsage,
  requestMaterial,
  searchErpParts,
  selectMaterialParts,
  setMaterialUsage,
  triggerErpSync,
  voidSelectedMaterialRequest,
  type ConfirmPurchaseRow,
  type SelectPartItem,
  type UsageRow,
} from "@/lib/api/material-usage";
import type { MaterialUsageFilters } from "@/types/material";

export function useMaterialUsageList(filters: MaterialUsageFilters) {
  return useQuery({
    queryKey: ["material-usage", filters],
    queryFn: ({ signal }) => listMaterialUsage(filters, signal),
    placeholderData: keepPreviousData,
    // Daftar sudah di-invalidasi langsung setelah aksi sukses. Cache singkat
    // mencegah fetch ulang saat pindah halaman/modal tanpa membuat status basi.
    staleTime: 15_000,
  });
}

export function useMaterialUsageDetail(id: string | number) {
  return useQuery({
    queryKey: ["material-usage-detail", String(id)],
    queryFn: ({ signal }) => getMaterialUsageDetail(id, signal),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

/** Pencarian part ERP — `q` sudah di-debounce oleh pemanggil. */
export function useErpPartSearch(company: string, q: string) {
  return useQuery({
    queryKey: ["erp-parts", company, q],
    queryFn: ({ signal }) => searchErpParts(company, q, signal),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}

export function useMaterialUsageMutations(id?: string | number) {
  const qc = useQueryClient();
  const invalidateMaterial = () => {
    qc.invalidateQueries({ queryKey: ["material-usage"] });
    if (id) qc.invalidateQueries({ queryKey: ["material-usage-detail", String(id)] });
  };
  const invalidateWorkOrders = () => {
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["work-order-detail"] });
    qc.invalidateQueries({ queryKey: ["work-order-materials"] });
  };

  return {
    request: useMutation({
      mutationFn: (body: Record<string, unknown>) => requestMaterial(body),
      onSuccess: invalidateMaterial,
    }),
    cancel: useMutation({
      mutationFn: (requestId: string | number) => cancelMaterialRequest(requestId),
      onSuccess: invalidateMaterial,
    }),
    voidSelection: useMutation({
      mutationFn: (requestId: string | number) => voidSelectedMaterialRequest(requestId),
      onSuccess: () => { invalidateMaterial(); invalidateWorkOrders(); },
    }),
    select: useMutation({
      mutationFn: (vars: { id: string | number; items: SelectPartItem[] }) =>
        selectMaterialParts(vars),
      onSuccess: () => { invalidateMaterial(); invalidateWorkOrders(); },
    }),
    setUsage: useMutation({
      mutationFn: (body: {
        wo_number: string;
        job_executor: string;
        request_code: string;
        rows: UsageRow[];
      }) => setMaterialUsage(body),
      onSuccess: invalidateMaterial,
    }),
    triggerErp: useMutation({
      mutationFn: (triggerId: string | number) => triggerErpSync({ id: triggerId }),
      onSuccess: invalidateMaterial,
    }),
    confirm: useMutation({
      mutationFn: (body: {
        wo_number: string;
        job_executor: string;
        request_code: string;
        purchase_rows: ConfirmPurchaseRow[];
      }) => confirmMaterialUsage(body),
      onSuccess: () => { invalidateMaterial(); invalidateWorkOrders(); },
    }),
    hold: useMutation({
      mutationFn: (body: {
        id: string | number;
        hold_qty: number;
        remarks: string;
      }) => holdMaterialPart(body),
      onSuccess: invalidateMaterial,
    }),
  };
}
