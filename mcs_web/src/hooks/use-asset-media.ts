"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAttachmentCategory,
  createCustomDetail,
  deleteAssetAttachment,
  deleteAttachmentCategory,
  deleteCustomDetail,
  deleteCustomDetailImage,
  importCustomDetails,
  listAssetAttachments,
  listAttachmentCategories,
  listCustomDetails,
  reorderAssetAttachments,
  reorderAttachmentCategories,
  updateAttachmentCategory,
  updateCustomDetail,
  uploadAssetAttachment,
  uploadCustomDetailImage,
  type CustomDetailInput,
} from "@/lib/api/asset-media";

export function useAttachmentCategories(enabled = true) {
  return useQuery({
    queryKey: ["attachment-categories"],
    queryFn: ({ signal }) => listAttachmentCategories(signal),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useAssetAttachments(assetCode: string, enabled = true) {
  return useQuery({
    queryKey: ["asset-attachments", assetCode],
    queryFn: ({ signal }) => listAssetAttachments(assetCode, signal),
    enabled: enabled && !!assetCode,
  });
}

export function useCustomDetails(assetCode: string, enabled = true) {
  return useQuery({
    queryKey: ["asset-custom-details", assetCode],
    queryFn: ({ signal }) => listCustomDetails(assetCode, signal),
    enabled: enabled && !!assetCode,
  });
}

export function useAttachmentCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["attachment-categories"] });
  return {
    create: useMutation({
      mutationFn: (name: string) => createAttachmentCategory(name),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (v: { id: number | string; name: string }) =>
        updateAttachmentCategory(v.id, v.name),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number | string) => deleteAttachmentCategory(id),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: (order: Array<number | string>) =>
        reorderAttachmentCategories(order),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Mutations untuk lampiran & custom detail sebuah aset. Semua meng-invalidate
 * query detail aset supaya tab Gallery / Custom Detail langsung ter-refresh.
 */
export function useAssetMediaMutations(assetCode: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["asset-detail", assetCode] });
    qc.invalidateQueries({ queryKey: ["asset-attachments", assetCode] });
    qc.invalidateQueries({ queryKey: ["asset-custom-details", assetCode] });
  };

  return {
    uploadAttachment: useMutation({
      mutationFn: (fd: FormData) => uploadAssetAttachment(fd),
      onSuccess: invalidate,
    }),
    deleteAttachment: useMutation({
      mutationFn: (id: number | string) => deleteAssetAttachment(id),
      onSuccess: invalidate,
    }),
    reorderAttachment: useMutation({
      mutationFn: (order: Array<number | string>) =>
        reorderAssetAttachments(assetCode, order),
      onSuccess: invalidate,
    }),
    createDetail: useMutation({
      mutationFn: (body: CustomDetailInput) =>
        createCustomDetail({ ...body, asset_code: assetCode }),
      onSuccess: invalidate,
    }),
    updateDetail: useMutation({
      mutationFn: (v: { id: number | string; body: CustomDetailInput }) =>
        updateCustomDetail(v.id, v.body),
      onSuccess: invalidate,
    }),
    deleteDetail: useMutation({
      mutationFn: (id: number | string) => deleteCustomDetail(id),
      onSuccess: invalidate,
    }),
    uploadDetailImage: useMutation({
      mutationFn: (v: { id: number | string; fd: FormData }) =>
        uploadCustomDetailImage(v.id, v.fd),
      onSuccess: invalidate,
    }),
    deleteDetailImage: useMutation({
      mutationFn: (imageId: number | string) => deleteCustomDetailImage(imageId),
      onSuccess: invalidate,
    }),
    importDetails: useMutation({
      mutationFn: (v: {
        file: File;
        mode?: "replace" | "append";
        dryRun?: boolean;
      }) =>
        importCustomDetails(assetCode, v.file, {
          mode: v.mode,
          dryRun: v.dryRun,
        }),
      onSuccess: (_res, v) => {
        if (!v.dryRun) invalidate();
      },
    }),
  };
}
