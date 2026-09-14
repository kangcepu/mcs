export type MasterResource =
  | "company-structure"
  | "asset-categories"
  | "asset-locations"
  | "permission-groups"
  | "users"
  | "user-aliases";

export interface CompanyStructureItem {
  id: number | string;
  code?: string;
  company_code?: string;
  name?: string;
  company_name?: string;
  parent_id?: number | string | null;
  level?: string | null;
  [key: string]: unknown;
}

export interface AssetCategoryItem {
  id: number | string;
  category_code?: string;
  code?: string;
  category_name?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AssetLocationItem {
  id: number | string;
  location_code?: string;
  code?: string;
  location_name?: string;
  name?: string;
  company?: string | null;
  [key: string]: unknown;
}

export interface PermissionGroupItem {
  id: number | string;
  name?: string;
  description?: string | null;
  permissions?: string[];
  member_count?: number;
  [key: string]: unknown;
}

export interface MasterUserItem {
  id: number | string;
  username?: string;
  fullname?: string;
  full_name?: string;
  email?: string | null;
  division?: string | null;
  company?: string | null;
  role?: string | null;
  permission_group?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface UserAliasItem {
  id: number | string;
  fullname?: string;
  full_name?: string;
  username?: string;
  alias?: string;
  division?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

/** Metadata tampilan per resource master-data. */
export const MASTER_META: Record<
  MasterResource,
  { title: string; canCreate: boolean }
> = {
  "company-structure": { title: "Struktur Perusahaan", canCreate: true },
  "asset-categories": { title: "Kategori Aset", canCreate: true },
  "asset-locations": { title: "Lokasi Aset", canCreate: true },
  "permission-groups": { title: "Grup Permission", canCreate: false },
  users: { title: "Pengguna", canCreate: false },
  "user-aliases": { title: "Alias Pengguna", canCreate: false },
};
