import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

export interface MutationPermissions {
  can_create?: boolean;
  can_approve?: boolean;
  can_access?: boolean;
}

export interface MutationListResult {
  items: Array<Record<string, unknown>>;
  total: number;
  permissions?: MutationPermissions;
}

export interface MutationMeta {
  permissions?: MutationPermissions;
  document_no?: string | null;
  companies: Array<{ id_company: string; company_name: string }>;
  locations: Array<{ id_location_asset: string; location_name: string }>;
  assets: Array<Record<string, unknown>>;
}

export interface MutationDetail {
  header: Record<string, unknown>;
  details: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  permissions?: MutationPermissions;
}

export function listAssetMutations(
  params: { search?: string; status?: string; limit?: number },
  signal?: AbortSignal,
): Promise<ApiResponse<MutationListResult>> {
  return apiV2.get<MutationListResult>("/asset-mutations", { params, signal });
}

export function getAssetMutationMeta(
  params: { location_before?: string; company_before?: string; search?: string },
  signal?: AbortSignal,
): Promise<ApiResponse<MutationMeta>> {
  return apiV2.get<MutationMeta>("/asset-mutations/meta", { params, signal });
}

export function searchMutationAssets(
  params: { location_before?: string; company_before?: string; search?: string; limit?: number },
  signal?: AbortSignal,
): Promise<ApiResponse<{ items: Array<Record<string, unknown>>; total: number }>> {
  return apiV2.get<{ items: Array<Record<string, unknown>>; total: number }>(
    "/asset-mutations/assets",
    { params, signal },
  );
}

export function getAssetMutationDetail(
  docNo: string,
  signal?: AbortSignal,
): Promise<ApiResponse<MutationDetail>> {
  return apiV2.get<MutationDetail>("/asset-mutations/detail", {
    params: { doc_no: docNo },
    signal,
  });
}

/** POST form: tambah baris aset ke dokumen (doc_no dari meta.document_no). */
export function addMutationLine(body: {
  doc_no: string;
  asset_code: string;
  asset_name: string;
  alias_name?: string;
  category?: string;
  company_after: string;
  location_after: string;
  mutation_purpose: string;
  asset_id?: string | number;
}) {
  return apiV2.post<unknown>("/asset-mutations/detail-item", undefined, {
    form: {
      doc_no: body.doc_no,
      asset_code: body.asset_code,
      asset_name: body.asset_name,
      alias_name: body.alias_name ?? "",
      category: body.category ?? "",
      company_after: body.company_after,
      location_after: body.location_after,
      mutation_purpose: body.mutation_purpose,
      asset_id: body.asset_id ?? "",
    },
  });
}

export function deleteMutationLine(id: string | number) {
  return apiV2.post<unknown>("/asset-mutations/detail-item-delete", undefined, {
    form: { id },
  });
}

export function submitAssetMutation(body: {
  doc_no: string;
  date: string;
  location_before: string;
  company_before: string;
}) {
  return apiV2.post<unknown>("/asset-mutations/submit", undefined, { form: body });
}

export function approveAssetMutation(docNo: string) {
  return apiV2.post<unknown>("/asset-mutations/approve", undefined, {
    form: { doc_no: docNo },
  });
}
