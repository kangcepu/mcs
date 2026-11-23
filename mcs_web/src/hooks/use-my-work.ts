"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decideValidationRequest, getMyWorkList, getMyWorkSummary, getValidationRequest, uploadValidationEvidence, type MyWorkCategoryKey } from "@/lib/api/my-work";

export function useMyWorkSummary() {
  return useQuery({
    queryKey: ["my-work", "summary"],
    queryFn: ({ signal }) => getMyWorkSummary(signal),
    staleTime: 30_000,
    retry: false,
  });
}

export function useValidationRequest(id?: number) {
  return useQuery({
    queryKey: ["validation-request", id],
    queryFn: ({ signal }) => getValidationRequest(id!, signal),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useValidationActions() {
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["my-work"] }),
      client.invalidateQueries({ queryKey: ["validation-request"] }),
    ]);
  };
  return {
    decide: useMutation({
      mutationFn: (input: { id: number; action: "APPROVE" | "RETURN" | "REJECT" | "RESUBMIT"; note?: string }) =>
        decideValidationRequest(input.id, { action: input.action, note: input.note }),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: (input: { id: number; files: File[] }) => uploadValidationEvidence(input.id, input.files),
      onSuccess: refresh,
    }),
  };
}

export function useMyWorkList(
  category: MyWorkCategoryKey,
  params: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["my-work", "list", category, params],
    queryFn: ({ signal }) => getMyWorkList(category, params, signal),
    placeholderData: keepPreviousData,
    enabled: Boolean(category),
  });
}
