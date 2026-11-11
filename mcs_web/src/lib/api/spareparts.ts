import { apiV2 } from "@/lib/api-client";
import type { SparepartErpCatalogData, SparepartErpPurchaseOrder, SparepartErpPurchaseOrderDetail, SparepartErpSyncResult, SparepartFoundation, SparepartInventoryAttachment, SparepartInventoryOverview, SparepartOpnameDetail, SparepartReceiptDetail, SparepartReceivingData, SparepartWoDetail, SparepartWoHistoryData, SparepartWoListData, SparepartWoSearchResult } from "@/types/sparepart";

export const getSparepartFoundation = (filters: { q?: string; status?: string }, signal?: AbortSignal) =>
  apiV2.get<SparepartFoundation>("/spareparts/foundation", { params: filters, signal });

export const createSparepart = (body: unknown) => apiV2.post<{ id: number }>("/spareparts", body);
export const updateSparepart = (id: number, body: unknown) => apiV2.patch<{ id: number }>(`/spareparts/${id}`, body);
export const createSparepartCompatibility = (body: unknown) => apiV2.post<{ id: number }>("/spareparts/compatibility", body);
export const deleteSparepartCompatibility = (id: number) => apiV2.delete<{ id: number }>(`/spareparts/compatibility/${id}`);
export const createSparepartWarehouse = (body: unknown) => apiV2.post<{ id: number }>("/spareparts/warehouses", body);
export const updateSparepartWarehouse = (id: number, body: unknown) => apiV2.patch<{ id: number }>(`/spareparts/warehouses/${id}`, body);
export const createSparepartRack = (body: unknown) => apiV2.post<{ id: number }>("/spareparts/racks", body);
export const updateSparepartRack = (id: number, body: unknown) => apiV2.patch<{ id: number }>(`/spareparts/racks/${id}`, body);
export const createSparepartBin = (body: unknown) => apiV2.post<{ id: number }>("/spareparts/bins", body);
export const updateSparepartBin = (id: number, body: unknown) => apiV2.patch<{ id: number }>(`/spareparts/bins/${id}`, body);
export const createSparepartErpMapping = (body: unknown) => apiV2.post<{ id: number }>("/spareparts/erp-mappings", body);
export const updateSparepartErpMapping = (id: number, body: unknown) => apiV2.patch<{ id: number }>(`/spareparts/erp-mappings/${id}`, body);
export const getSparepartErpCatalog = (filters:{company:string;q?:string;page:number;per_page:number;active_only?:boolean},signal?:AbortSignal) => apiV2.get<SparepartErpCatalogData>("/spareparts/erp/catalog",{params:filters,signal});
export const syncSparepartErpItems = (company:string,item_ids:number[]) => apiV2.post<SparepartErpSyncResult>("/spareparts/erp/sync",{company,item_ids});
export const getSparepartErpPurchaseOrders = (filters:{company:string;q?:string;page?:number;per_page?:number;include_closed?:boolean},signal?:AbortSignal) => apiV2.get<{company:string;items:SparepartErpPurchaseOrder[];read_only:boolean}>("/spareparts/erp/purchase-orders",{params:filters,signal});
export const getSparepartErpPurchaseOrder = (company:string,poId:number,signal?:AbortSignal) => apiV2.get<SparepartErpPurchaseOrderDetail>(`/spareparts/erp/purchase-orders/${poId}`,{params:{company},signal});

export const getSparepartReceiving = (filters: { q?: string; status?: string }, signal?: AbortSignal) =>
  apiV2.get<SparepartReceivingData>("/spareparts/receiving", { params: filters, signal });
export const createSparepartReceipt = (body: unknown) => apiV2.post<{ id: number; receipt_number: string; status: string }>("/spareparts/receipts", body);
export const getSparepartReceipt = (id: number, signal?: AbortSignal) => apiV2.get<SparepartReceiptDetail>(`/spareparts/receipts/${id}`, { signal });
export const lockSparepartReceipt = (id: number) => apiV2.post<{ id: number; status: string }>(`/spareparts/receipts/${id}/lock`, {});
export const cancelSparepartReceipt = (id: number, reason: string) => apiV2.post<{ id: number; status: string }>(`/spareparts/receipts/${id}/cancel`, { reason });

export const searchSparepartWorkOrders = (q: string, signal?: AbortSignal) => apiV2.get<SparepartWoSearchResult[]>("/spareparts/wo/search", { params: { q }, signal });
export const getSparepartWoRequests = (filters: { q?: string; status?: string }, signal?: AbortSignal) => apiV2.get<SparepartWoListData>("/spareparts/wo/requests", { params: filters, signal });
export const getSparepartWoRequest = (id: number, signal?: AbortSignal) => apiV2.get<SparepartWoDetail>(`/spareparts/wo/requests/${id}`, { signal });
export const createSparepartWoRequest = (body: unknown) => apiV2.post<{id:number;request_number:string;status:string}>("/spareparts/wo/requests", body);
export const transitionSparepartWoRequest = (id: number, action: "reserve"|"pick"|"issue") => apiV2.post<{id:number;status:string}>(`/spareparts/wo/requests/${id}/${action}`, {});
export const settleSparepartWoRequest = (id: number, body: unknown) => apiV2.post<{id:number;status:string}>(`/spareparts/wo/requests/${id}/settle`, body);
export const cancelSparepartWoRequest = (id: number, reason: string) => apiV2.post<{id:number;status:string}>(`/spareparts/wo/requests/${id}/cancel`, { reason });
export const getSparepartWoHistory = (filters:{q?:string;asset_id?:number;wo_number?:string;page?:number;per_page?:number},signal?:AbortSignal) => apiV2.get<SparepartWoHistoryData>("/spareparts/wo/history",{params:filters,signal});

export const getSparepartInventoryOverview = (signal?:AbortSignal) => apiV2.get<SparepartInventoryOverview>("/spareparts/inventory/overview",{signal});
export const createSparepartTransfer = (body:Record<string,unknown>) => apiV2.post<{id:number;transfer_number:string}>("/spareparts/inventory/transfers",body);
export const reviewSparepartTransfer = (id:number,action:"APPROVE"|"REJECT",check_note?:string) => apiV2.post(`/spareparts/inventory/transfers/${id}/review`,{action,check_note});
export const createSparepartOpname = (body:Record<string,unknown>) => apiV2.post<{id:number;opname_number:string}>("/spareparts/inventory/opnames",body);
export const getSparepartOpname = (id:number,signal?:AbortSignal) => apiV2.get<SparepartOpnameDetail>(`/spareparts/inventory/opnames/${id}`,{signal});
export const saveSparepartOpnameCounts = (id:number,lines:Array<Record<string,unknown>>) => apiV2.put(`/spareparts/inventory/opnames/${id}/counts`,{lines});
export const submitSparepartOpname = (id:number) => apiV2.post(`/spareparts/inventory/opnames/${id}/submit`,{});
export const reviewSparepartOpname = (id:number,action:"APPROVE"|"REJECT"|"RECOUNT",check_note?:string) => apiV2.post(`/spareparts/inventory/opnames/${id}/review`,{action,check_note});
export const saveSparepartInventoryPolicy = (body:Record<string,unknown>) => apiV2.post<{id:number}>("/spareparts/inventory/policies",body);
export const getSparepartInventoryAttachments = (entity_type:"TRANSFER"|"OPNAME",entity_id:number) => apiV2.get<SparepartInventoryAttachment[]>("/spareparts/inventory/attachments",{params:{entity_type,entity_id}});
export const uploadSparepartInventoryAttachments = (entity_type:"TRANSFER"|"OPNAME",entity_id:number,files:File[]) => {const formData=new FormData();formData.append("entity_type",entity_type);formData.append("entity_id",String(entity_id));files.forEach(file=>formData.append("files",file));return apiV2.post<SparepartInventoryAttachment[]>("/spareparts/inventory/attachments",undefined,{formData});};
export const deleteSparepartInventoryAttachment = (id:number) => apiV2.delete(`/spareparts/inventory/attachments/${id}`);
export interface SparepartGovernanceData {approvals:Array<{id:number;source_type:string;reference_number:string;status:string;requested_by?:string;requested_at?:string}>;ncrs:Array<{id:number;ncr_number:string;category:string;severity:string;title:string;description:string;assigned_to?:string;due_date?:string;status:string;created_at:string}>;reconciliations:Array<{id:number;reconciliation_number:string;company_code:string;status:string;item_count:number;mismatch_count:number;created_by?:string;created_at:string}>;summary:{approvals:number;open:number;high:number;mismatch:number}}
export const getSparepartGovernance=(status?:string,signal?:AbortSignal)=>apiV2.get<SparepartGovernanceData>("/spareparts/governance",{params:{status},signal});
export const createSparepartNcr=(body:unknown)=>apiV2.post<{id:number}>("/spareparts/governance/ncr",body);
export const updateSparepartNcr=(id:number,body:unknown)=>apiV2.patch(`/spareparts/governance/ncr/${id}`,body);
export const createSparepartReconciliation=(company_code:string,notes?:string)=>apiV2.post<{id:number;reconciliation_number:string}>("/spareparts/governance/reconciliations",{company_code,notes});
export const reviewSparepartReconciliation=(id:number,action:"APPROVE"|"REJECT",review_note?:string)=>apiV2.post(`/spareparts/governance/reconciliations/${id}/review`,{action,review_note});
