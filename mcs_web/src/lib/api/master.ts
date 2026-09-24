import { apiV2 } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type { MasterResource } from "@/types/master";

export function listMaster<T = Record<string, unknown>>(
  resource: MasterResource,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<T[]>> {
  return apiV2.get<T[]>(`/master/${resource}`, { params, signal });
}

export function getMasterDetail<T = Record<string, unknown>>(
  resource: MasterResource,
  id: string | number,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  return apiV2.get<T>(`/master/${resource}/detail/${id}`, { signal });
}

/**
 * POST /v2/master/{resource}. Didukung untuk company-structure, asset-categories,
 * asset-locations, permission-groups, dan users.
 */
export function createMaster<T = Record<string, unknown>>(
  resource: MasterResource,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  return apiV2.post<T>(`/master/${resource}`, body);
}

export interface MasterOptionItem {
  value: string;
  label: string;
}

export interface MasterFormOptions {
  companies: MasterOptionItem[];
  divisions: MasterOptionItem[];
  positions: MasterOptionItem[];
  sections: MasterOptionItem[];
  permission_groups: MasterOptionItem[];
}

export function getMasterOptions(
  signal?: AbortSignal,
): Promise<ApiResponse<MasterFormOptions>> {
  return apiV2.get<MasterFormOptions>("/master/options", { signal });
}

export interface PermissionCatalogItem {
  field: string;
  label: string;
  on_user: boolean;
}

export function getPermissionCatalog(
  signal?: AbortSignal,
): Promise<ApiResponse<PermissionCatalogItem[]>> {
  return apiV2.get<PermissionCatalogItem[]>("/master/permission-catalog", { signal });
}

export interface MasterActivityItem {
  id: number | string;
  module?: string;
  action: string;
  reference?: string | null;
  outcome?: "success" | "failed" | string;
  http_status?: number;
  actor_username?: string | null;
  actor_fullname?: string | null;
  created_at: string;
}

export function listMasterActivity(
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<MasterActivityItem[]>> {
  return apiV2.get<MasterActivityItem[]>("/system-activity-log", { params, signal });
}

export interface EmployeeHit {
  employee_id?: number | string | null;
  employee_code: string;
  name: string;
  email?: string | null;
  /** Field dari Employee API dapat memakai beberapa variasi nama. */
  mobilephone?: string | null;
  mobile_phone?: string | null;
  phone?: string | null;
  position?: string;
  position_code?: string;
  id_position?: number | string | null;
  division?: string;
  division_code?: string;
  id_division?: number | string | null;
  company?: string;
  company_code?: string;
  id_company?: number | string | null;
}

/** GET /v2/master/employees — autocomplete pegawai (EmployeeCode → username). */
export function searchEmployees(
  q: string,
  company?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<EmployeeHit[]>> {
  return apiV2.get<EmployeeHit[]>("/master/employees", {
    params: { q, company: company || undefined },
    signal,
  });
}

export function updateMaster<T = Record<string, unknown>>(
  resource: MasterResource,
  id: string | number,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  return apiV2.patch<T>(`/master/${resource}/detail/${id}`, body);
}

export function deleteMaster(resource: MasterResource, id: string | number) {
  return apiV2.delete<null>(`/master/${resource}/detail/${id}`);
}
