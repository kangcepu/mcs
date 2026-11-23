import { apiV2 } from "@/lib/api-client";

export type StockOpnameWorkItem = {
  NoSO: string;
  Tanggal: string;
  IsBOM: number | boolean;
  LockedDate?: string | null;
  companies?: string[];
  categories?: string[];
  locations?: string[];
  workflow_status?: string;
  assigned_locations?: Array<{ location_id: string; location_name: string | null }>;
};

export type StockOpnameWorkItems = { can_manage: boolean; items: StockOpnameWorkItem[] };
export type StockOpnameDetailRow = {
  asset_code: string; asset_name: string; company: string; category: string;
  location: string; status: string; username: string; parts_count: number | null;
  qty_found: number | null; checked: boolean;
};
export type StockOpnameWorkflow = { no_so: string; status: string; locations: Array<Record<string, unknown>>; exceptions: Array<Record<string, unknown>>; recounts: Array<Record<string, unknown>>; transfer_proposals: Array<Record<string, unknown>> };
export type StockOpnameDetail = { no_so: string; type: "ASSET" | "BOM"; rows: StockOpnameDetailRow[]; workflow: StockOpnameWorkflow };
export type StockOpnameFindings = { assets: Array<Record<string, unknown>>; parts: Array<Record<string, unknown>> };
export type StockOpnameCreate = { Tanggal: string; IdCompanies: string[]; IdCategories: string[]; IdLocations: string[]; IsBOM: boolean };

export const getStockOpnameWorkItems = (signal?: AbortSignal) =>
  apiV2.get<StockOpnameWorkItems>("/stock-opname-schedules/work-items", { signal });
export const getStockOpnameMasters = (signal?: AbortSignal) =>
  apiV2.get<Record<string, unknown>>("/stock-opname-operations/masters", { signal });
export const createStockOpname = (body: StockOpnameCreate) =>
  apiV2.post<unknown>("/stock-opname-operations", body);
export const getStockOpnameDetail = (noSo: string, signal?: AbortSignal) =>
  apiV2.get<StockOpnameDetail>(`/stock-opname-operations/${encodeURIComponent(noSo)}/detail`, { signal });
export const scanStockOpnameAsset = (noSo: string, assetCode: string) =>
  apiV2.post<unknown>(`/stock-opname-operations/${encodeURIComponent(noSo)}/scan`, { asset_code: assetCode });
export const lockStockOpname = (noSo: string) =>
  apiV2.put<unknown>(`/stock-opname-operations/${encodeURIComponent(noSo)}/lock`);
export const submitStockOpname = (noSo: string) =>
  apiV2.post<unknown>(`/stock-opname-operations/${encodeURIComponent(noSo)}/submit`);
export const getStockOpnameBom = (noSo: string, assetCode: string, signal?: AbortSignal) =>
  apiV2.get<unknown[]>(`/stock-opname-operations/${encodeURIComponent(noSo)}/bom`, { params: { asset_code: assetCode }, signal });
export const saveStockOpnameBom = (noSo: string, assetCode: string, parts: Array<Record<string, unknown>>) =>
  apiV2.post<unknown>(`/stock-opname-operations/${encodeURIComponent(noSo)}/bom`, { asset_code: assetCode, parts });
export const getStockOpnameFindings = (noSo: string, signal?: AbortSignal) =>
  apiV2.get<StockOpnameFindings>(`/stock-opname-operations/${encodeURIComponent(noSo)}/findings`, { signal });
export const addStockOpnameFinding = (noSo: string, kind: "asset" | "part", body: { name: string; location_code?: string; qty?: number; remark: string }) =>
  apiV2.post<unknown>(`/stock-opname-operations/${encodeURIComponent(noSo)}/findings/${kind}`, body);
