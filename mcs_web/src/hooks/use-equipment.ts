"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addSubPart,
  consumePart,
  deleteBomPhoto,
  deletePartHistory,
  disablePart,
  enablePart,
  getMissingAreaAlerts,
  listBomParts,
  listBomPhotos,
  listPartHistory,
  restockPart,
  reviewMissingAreaAlert,
  saveAnnotatedImage,
  togglePart,
  uploadBomPhoto,
} from "@/lib/api/equipment";

export function useBomParts(assetCode: string) {
  return useQuery({
    queryKey: ["bom-parts", assetCode],
    queryFn: ({ signal }) => listBomParts(assetCode, signal),
    enabled: Boolean(assetCode),
    staleTime: 30_000,
  });
}

export function usePartHistory(partId: number | null) {
  return useQuery({
    queryKey: ["part-history", partId],
    queryFn: ({ signal }) => listPartHistory(partId as number, signal),
    enabled: Boolean(partId),
  });
}

export function useBomPhotos(assetCode: string, partId: number | null) {
  return useQuery({
    queryKey: ["bom-photos", assetCode, partId],
    queryFn: ({ signal }) => listBomPhotos(assetCode, partId as number, signal),
    enabled: Boolean(assetCode && partId),
  });
}

export function useBomPartMutations(assetCode: string) {
  const qc = useQueryClient();
  const invalidateParts = () =>
    qc.invalidateQueries({ queryKey: ["bom-parts", assetCode] });
  const invalidateHistory = (partId: number) => {
    qc.invalidateQueries({ queryKey: ["part-history", partId] });
    invalidateParts();
  };

  return {
    addSubPart: useMutation({
      mutationFn: (body: Parameters<typeof addSubPart>[0]) => addSubPart(body),
      onSuccess: invalidateParts,
    }),
    toggle: useMutation({
      mutationFn: (id: number) => togglePart(id),
      onSuccess: invalidateParts,
    }),
    disable: useMutation({
      mutationFn: (id: number) => disablePart(id),
      onSuccess: invalidateParts,
    }),
    enable: useMutation({
      mutationFn: (id: number) => enablePart(id),
      onSuccess: invalidateParts,
    }),
    use: useMutation({
      mutationFn: (body: Parameters<typeof consumePart>[0]) => consumePart(body),
      onSuccess: (_r, body) => invalidateHistory(body.part_id),
    }),
    restock: useMutation({
      mutationFn: (body: Parameters<typeof restockPart>[0]) => restockPart(body),
      onSuccess: (_r, body) => invalidateHistory(body.part_id),
    }),
    deleteHistory: useMutation({
      mutationFn: (vars: { id: number; partId: number }) =>
        deletePartHistory(vars.id),
      onSuccess: (_r, vars) => invalidateHistory(vars.partId),
    }),
    uploadPhoto: useMutation({
      mutationFn: (vars: { partId: number; file: File }) =>
        uploadBomPhoto(assetCode, vars.partId, vars.file),
      onSuccess: (_r, vars) =>
        qc.invalidateQueries({ queryKey: ["bom-photos", assetCode, vars.partId] }),
    }),
    deletePhoto: useMutation({
      mutationFn: (vars: { id: number; partId: number }) => deleteBomPhoto(vars.id),
      onSuccess: (_r, vars) =>
        qc.invalidateQueries({ queryKey: ["bom-photos", assetCode, vars.partId] }),
    }),
  };
}

export function useSaveAnnotatedImage(assetCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof saveAnnotatedImage>[0]) =>
      saveAnnotatedImage(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-custom-details", assetCode] });
      qc.invalidateQueries({ queryKey: ["asset-detail", assetCode] });
    },
  });
}

export function useMissingAreaAlerts(limit = 100, enabled = true) {
  return useQuery({
    queryKey: ["missing-area-alerts", limit],
    queryFn: ({ signal }) => getMissingAreaAlerts(limit, signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useReviewMissingAreaAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof reviewMissingAreaAlert>[0]) =>
      reviewMissingAreaAlert(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["missing-area-alerts"] }),
  });
}
