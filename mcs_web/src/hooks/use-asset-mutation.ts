"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addMutationLine,
  approveAssetMutation,
  deleteMutationLine,
  getAssetMutationDetail,
  getAssetMutationMeta,
  listAssetMutations,
  submitAssetMutation,
} from "@/lib/api/asset-mutation";

export function useAssetMutations(params: {
  search?: string;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["asset-mutations", params],
    queryFn: ({ signal }) => listAssetMutations(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAssetMutationMeta(
  params: { location_before?: string; company_before?: string; search?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ["asset-mutation-meta", params],
    queryFn: ({ signal }) => getAssetMutationMeta(params, signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useAssetMutationDetail(docNo: string) {
  return useQuery({
    queryKey: ["asset-mutation-detail", docNo],
    queryFn: ({ signal }) => getAssetMutationDetail(docNo, signal),
    enabled: Boolean(docNo),
  });
}

export function useAssetMutationActions(docNo?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["asset-mutations"] });
    if (docNo) qc.invalidateQueries({ queryKey: ["asset-mutation-detail", docNo] });
    qc.invalidateQueries({ queryKey: ["approval-summary"] });
    qc.invalidateQueries({ queryKey: ["approval-list"] });
  };

  return {
    addLine: useMutation({
      mutationFn: (body: Parameters<typeof addMutationLine>[0]) => addMutationLine(body),
      onSuccess: invalidate,
    }),
    deleteLine: useMutation({
      mutationFn: (id: string | number) => deleteMutationLine(id),
      onSuccess: invalidate,
    }),
    submit: useMutation({
      mutationFn: (body: Parameters<typeof submitAssetMutation>[0]) =>
        submitAssetMutation(body),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (dn: string) => approveAssetMutation(dn),
      onSuccess: invalidate,
    }),
  };
}
