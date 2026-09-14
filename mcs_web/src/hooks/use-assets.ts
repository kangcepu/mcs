"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createAsset,
  generateAssetCode,
  getAssetDetail,
  getAssetOptions,
  importAssets,
  listAssets,
  searchWorkOrderAssets,
  setAssetStatus,
  updateAsset,
} from "@/lib/api/assets";
import type { AssetFilters } from "@/types/asset";

export function useAssets(filters: AssetFilters) {
  return useQuery({
    queryKey: ["assets", filters],
    queryFn: ({ signal }) => listAssets(filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAssetDetail(asset: string) {
  return useQuery({
    queryKey: ["asset-detail", asset],
    queryFn: ({ signal }) => getAssetDetail(asset, signal),
    enabled: Boolean(asset),
  });
}

export function useAssetOptions() {
  return useQuery({
    queryKey: ["asset-options"],
    queryFn: ({ signal }) => getAssetOptions(signal),
    staleTime: 10 * 60_000,
  });
}

/** Autocomplete aset — cari berdasarkan nama/kode. `q` sudah di-debounce pemanggil. */
export function useAssetSearch(
  q: string,
  includeInactive = false,
  forWorkOrder = false,
) {
  return useQuery({
    queryKey: ["asset-search", q, includeInactive, forWorkOrder],
    queryFn: ({ signal }) =>
      forWorkOrder
        ? searchWorkOrderAssets(q, signal)
        : listAssets({ q, per_page: 15, is_active: includeInactive ? undefined : "1" }, signal),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}

/** Impor massal aset dari Excel/CSV. Invalidasi daftar aset saat sukses tulis. */
export function useImportAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      file: File;
      dryRun?: boolean;
      updateExisting?: boolean;
    }) =>
      importAssets(vars.file, {
        dryRun: vars.dryRun,
        updateExisting: vars.updateExisting,
      }),
    onSuccess: (_res, vars) => {
      if (!vars.dryRun) qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useAssetMutations(asset?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assets"] });
    if (asset) qc.invalidateQueries({ queryKey: ["asset-detail", asset] });
  };

  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => createAsset(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { asset: string; body: Record<string, unknown> }) =>
        updateAsset(vars.asset, vars.body),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (body: { asset: string; is_active: boolean; note?: string }) =>
        setAssetStatus(body),
      onSuccess: invalidate,
    }),
    generateCode: useMutation({
      mutationFn: (body: { company: string; location: string; category: string }) =>
        generateAssetCode(body),
    }),
  };
}
