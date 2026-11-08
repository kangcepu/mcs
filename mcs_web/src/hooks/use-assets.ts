"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  attachChildAsset,
  createAsset,
  detachChildAsset,
  generateAssetCode,
  getAssetDetail,
  getAssetOptions,
  importAssets,
  importChildAssets,
  linkPendingChildAsset,
  listAssets,
  moveChildAsset,
  deletePendingChildAsset,
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
  unlinkedOnly = false,
) {
  return useQuery({
    queryKey: ["asset-search", q, includeInactive, forWorkOrder, unlinkedOnly],
    queryFn: ({ signal }) =>
      forWorkOrder
        ? searchWorkOrderAssets(q, signal)
        : listAssets({
            q,
            per_page: 15,
            is_active: includeInactive ? undefined : "1",
            unlinked_only: unlinkedOnly ? "1" : undefined,
          }, signal),
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
  const invalidateHierarchy = () => {
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["asset-detail"] });
  };

  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => createAsset(body),
      onSuccess: invalidateHierarchy,
    }),
    update: useMutation({
      mutationFn: (vars: { asset: string; body: Record<string, unknown> }) =>
        updateAsset(vars.asset, vars.body),
      onSuccess: invalidateHierarchy,
    }),
    setStatus: useMutation({
      mutationFn: (body: { asset: string; is_active: boolean; note?: string }) =>
        setAssetStatus(body),
      onSuccess: invalidate,
    }),
    attachChild: useMutation({
      mutationFn: (childAsset: string) => {
        if (!asset) throw new Error("Kode aset induk tidak tersedia.");
        return attachChildAsset(asset, childAsset);
      },
      onSuccess: invalidateHierarchy,
    }),
    detachChild: useMutation({
      mutationFn: (childAsset: string) => detachChildAsset(childAsset),
      onSuccess: invalidateHierarchy,
    }),
    moveChild: useMutation({
      mutationFn: (vars: { childAsset: string; newParentAsset: string }) =>
        moveChildAsset(vars.childAsset, vars.newParentAsset),
      onSuccess: invalidateHierarchy,
    }),
    linkPendingChild: useMutation({
      mutationFn: (vars: { pendingId: number; childAsset: string }) =>
        linkPendingChildAsset(vars.pendingId, vars.childAsset),
      onSuccess: invalidateHierarchy,
    }),
    deletePendingChild: useMutation({
      mutationFn: (pendingId: number) => deletePendingChildAsset(pendingId),
      onSuccess: invalidateHierarchy,
    }),
    importChildren: useMutation({
      mutationFn: (vars: { file: File; dryRun: boolean }) => {
        if (!asset) throw new Error("Kode aset induk tidak tersedia.");
        return importChildAssets(asset, vars.file, vars.dryRun);
      },
      onSuccess: (_res, vars) => {
        if (!vars.dryRun) invalidateHierarchy();
      },
    }),
    generateCode: useMutation({
      mutationFn: (body: { company: string; location: string; category: string }) =>
        generateAssetCode(body),
    }),
  };
}
