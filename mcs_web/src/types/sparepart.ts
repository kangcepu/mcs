export interface SparepartMaster {
  id: number;
  part_code: string;
  part_name: string;
  part_number: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  base_uom: string;
  criticality: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  is_serialized: number;
  is_lot_controlled: number;
  has_expiry: number;
  status: "ACTIVE" | "INACTIVE";
  description: string | null;
  compatibility_count: number;
  erp_mapping_count: number;
}

export interface SparepartCompatibility {
  id: number;
  sparepart_id: number;
  compatibility_type: "ASSET" | "ASSET_CATEGORY";
  asset_id: number | null;
  asset_category: string | null;
  notes: string | null;
  part_code: string;
  part_name: string;
  AssetCode: string | null;
  AssetName: string | null;
  CompanyName: string | null;
}

export interface SparepartWarehouse { id: number; warehouse_code: string; warehouse_name: string; company_code: string; location_description: string | null; custodian_name: string | null; status: string }
export interface SparepartRack { id: number; warehouse_id: number; rack_code: string; rack_name: string | null; warehouse_code: string; warehouse_name: string; status: string }
export interface SparepartBin { id: number; rack_id: number; bin_code: string; bin_name: string | null; rack_code: string; warehouse_code: string; status: string }
export interface SparepartErpMapping { id: number; sparepart_id: number; company_code: string; erp_system: string; erp_item_code: string; erp_item_name: string | null; erp_uom: string | null; sync_mode: "REFERENCE_ONLY"; status: string; part_code: string; part_name: string }

export interface SparepartFoundation {
  parts: SparepartMaster[];
  compatibility: SparepartCompatibility[];
  warehouses: SparepartWarehouse[];
  racks: SparepartRack[];
  bins: SparepartBin[];
  erp_mappings: SparepartErpMapping[];
  asset_categories: string[];
  companies: string[];
}

export interface SparepartReceipt {
  id: number; receipt_number: string; po_reference: string; supplier_name: string | null;
  warehouse_id: number; warehouse_code: string; warehouse_name: string; received_at: string;
  delivery_note: string | null; status: "SUBMITTED" | "LOCKED" | "CANCELLED";
  line_count: number; received_qty: number; accepted_qty: number; hold_qty: number; rejected_qty: number;
}
export interface SparepartStockBalance {
  sparepart_id: number; part_code: string; part_name: string; base_uom: string;
  warehouse_id: number; warehouse_code: string; warehouse_name: string; bin_id: number;
  bin_code: string; rack_code: string; lot_number: string | null; expiry_date: string | null;
  available_qty: number; hold_qty: number;
}
export interface SparepartStockLedger {
  id: number; movement_number: string; movement_type: string; stock_bucket: "AVAILABLE" | "HOLD";
  part_code: string; part_name: string; warehouse_code: string; rack_code: string; bin_code: string;
  lot_number: string | null; expiry_date: string | null; quantity_delta: number; uom: string;
  reference_number: string | null; movement_at: string; created_by: string | null;
}
export interface SparepartReceivingOption {
  id: number; part_code: string; part_name: string; base_uom: string;
  is_serialized: number; is_lot_controlled: number; has_expiry: number;
}
export interface SparepartBinOption {
  id: number; bin_code: string; bin_name: string | null; rack_id: number; rack_code: string;
  warehouse_id: number; warehouse_code: string; warehouse_name: string;
}
export interface SparepartReceivingData {
  receipts: SparepartReceipt[]; balances: SparepartStockBalance[]; ledger: SparepartStockLedger[];
  parts: SparepartReceivingOption[]; bins: SparepartBinOption[];
  stats: { pending_receipts: number; locked_receipts: number; available_qty: number; hold_qty: number };
}
export interface SparepartReceiptDetail extends SparepartReceipt {
  delivery_note: string | null; notes: string | null; locked_by: string | null; locked_at: string | null;
  lines: Array<{
    id: number; part_code: string; part_name: string; rack_code: string; bin_code: string;
    ordered_qty: number | null; received_qty: number; accepted_qty: number; hold_qty: number; rejected_qty: number;
    uom: string; qc_status: string; lot_number: string | null; expiry_date: string | null; qc_note: string | null;
    serials: Array<{ id: number; serial_number: string; qc_status: string; stock_status: string }>;
  }>;
}

export interface SparepartWoRequest {
  id: number; request_number: string; wo_module: string; wo_number: string; asset_id: number | null;
  AssetCode: string | null; AssetName: string | null; warehouse_id: number; warehouse_code: string; warehouse_name: string;
  status: "REQUESTED"|"RESERVED"|"PICKED"|"ISSUED"|"COMPLETED"|"CANCELLED";
  requested_at: string; requested_by: string | null; line_count: number; requested_qty: number;
  reserved_qty: number; issued_qty: number; used_qty: number; returned_qty: number;
}
export interface SparepartWoListData {
  requests: SparepartWoRequest[];
  parts: SparepartReceivingOption[];
  warehouses: Array<{ id:number; warehouse_code:string; warehouse_name:string; company_code:string }>;
}
export interface SparepartWoSearchResult { module:string; wo_number:string; job_title:string; status:string; id_equipment:number|null; AssetCode:string|null; AssetName:string|null }
export interface SparepartWoDetail extends SparepartWoRequest {
  request_note:string|null;
  lines:Array<{ id:number; sparepart_id:number; part_code:string; part_name:string; requested_qty:number; reserved_qty:number; picked_qty:number; issued_qty:number; used_qty:number; returned_available_qty:number; returned_hold_qty:number; uom:string; is_serialized:number; allocations:Array<{ id:number; rack_code:string; bin_code:string; lot_number:string|null; expiry_date:string|null; reserved_qty:number; issued_qty:number; serials:Array<{id:number;serial_number:string;status:string}> }> }>;
  history:Array<{id:number;action_type:string;from_status:string|null;to_status:string;action_note:string|null;acted_by:string|null;acted_at:string}>;
}

export interface SparepartInventoryPolicy {
  id:number;sparepart_id:number;warehouse_id:number;part_code:string;part_name:string;base_uom:string;criticality:string;
  warehouse_code:string;warehouse_name:string;minimum_qty:number;maximum_qty?:number|null;reorder_point:number;reorder_qty?:number|null;
  lead_time_days:number;slow_moving_days:number;dead_stock_days:number;current_qty:number;last_consumption_at?:string|null;
}
export interface SparepartInventoryAlert extends SparepartInventoryPolicy {
  below_minimum:boolean;reorder_due:boolean;over_maximum:boolean;movement_class:"ACTIVE"|"SLOW_MOVING"|"DEAD_STOCK"|"OUT_OF_STOCK";days_since_consumption?:number|null;
}
export interface SparepartInventoryOverview {
  transfers:Array<{id:number;transfer_number:string;from_warehouse_id:number;to_warehouse_id:number;from_code:string;from_name:string;to_code:string;to_name:string;transferred_at:string;status:string;total_qty:number;line_count:number;created_by?:string;checked_by?:string}>;
  opnames:Array<{id:number;opname_number:string;warehouse_id:number;warehouse_code:string;warehouse_name:string;counted_at:string;status:string;line_count:number;counted_lines:number;absolute_variance:number;recount_count:number;created_by?:string;checked_by?:string}>;
  policies:SparepartInventoryPolicy[];alerts:SparepartInventoryAlert[];bins:SparepartBinOption[];
  parts:Array<{id:number;part_code:string;part_name:string;base_uom:string;criticality:string;is_serialized:number}>;
  balances:Array<{sparepart_id:number;warehouse_id:number;bin_id:number;stock_bucket:string;lot_number:string|null;expiry_date:string|null;part_code:string;part_name:string;base_uom:string;is_serialized:number;warehouse_code:string;rack_code:string;bin_code:string;current_qty:number}>;
  serials:Array<{id:number;sparepart_id:number;bin_id:number;stock_bucket:string;status:string;serial_number:string}>;
  trend:Array<{period:string;sparepart_id:number;consumption_qty:number}>;
  forecast:Array<{sparepart_id:number;part_code:string;part_name:string;base_uom:string;criticality:string;active_schedule_count:number;consumption_180_days:number;current_qty:number}>;
  audit:Array<{id:number;entity_type:string;entity_id:number;event_type:string;event_summary:string;actor_name?:string;event_at:string}>;
  stats:{pending_transfer:number;counting_opname:number;pending_adjustment:number;reorder_due:number;critical_alert:number;slow_dead:number};
}
export interface SparepartOpnameDetail {
  id:number;opname_number:string;warehouse_code:string;warehouse_name:string;status:string;blind_count:number;created_by?:string;
  lines:Array<{id:number;part_code:string;part_name:string;is_serialized:number;rack_code:string;bin_code:string;stock_bucket:string;lot_number?:string|null;expiry_date?:string|null;system_qty?:number;counted_qty?:number|null;variance_qty?:number|null;uom:string;count_note?:string|null;serials?:Array<{serial_number:string;expected_present:number;counted_present:number}>}>;
}
export interface SparepartInventoryAttachment {id:number;file_name:string;url:string;created_at:string}

export interface SparepartErpCatalogMapping {
  mapping_id:number;sparepart_id:number;erp_item_code:string;last_reference_at:string|null;
  part_code:string;part_name:string;snapshot_balance:number|null;last_synced_at:string|null;
}
export interface SparepartErpCatalogItem {
  item_id:number;item_code:string;item_name:string;uom:string;balance_qty:number;
  category_name:string|null;brand_name:string|null;is_serialized:boolean;has_expiry:boolean;
  minimum_qty:number|null;maximum_qty:number|null;reorder_point:number|null;lead_time_days:number|null;
  disabled:boolean;discontinued:boolean;source_updated_at:string|null;mapping:SparepartErpCatalogMapping|null;
}
export interface SparepartErpSyncHistory {
  id:number;sync_number:string;company_code:string;requested_count:number;created_count:number;
  updated_count:number;failed_count:number;status:string;synced_by:string|null;synced_at:string;
}
export interface SparepartErpCatalogData {
  company:"UC"|"RU"|"GSU";items:SparepartErpCatalogItem[];history:SparepartErpSyncHistory[];
  synced_count:number;balance_source:string;read_only:boolean;
}
export interface SparepartErpSyncResult {
  sync_number:string;company:string;requested_count:number;created_count:number;updated_count:number;
  failed_count:number;status:string;failures:Array<{item_id:number;message:string}>;
}

export interface SparepartErpPurchaseOrder {
  po_id:number;po_number:string;supplier_code:string|null;supplier_name:string|null;po_date:string|null;
  expected_delivery_date:string|null;warehouse_id:number|null;warehouse_code:string|null;warehouse_name:string|null;
  remarks:string|null;approved:boolean;closed:boolean;line_count:number;ordered_qty:number;
}
export interface SparepartErpPurchaseOrderDetail extends SparepartErpPurchaseOrder {
  company:"UC"|"RU"|"GSU";read_only:boolean;
  lines:Array<{po_detail_id:number;item_id:number;item_code:string;item_name:string;uom:string;uom_level:number;
    ordered_qty:number;expected_delivery_date:string|null;remarks:string|null;mapping:(SparepartErpCatalogMapping&{
      base_uom:string;is_serialized:number;is_lot_controlled:number;has_expiry:number;status:string;
    })|null}>;
}
export interface SparepartWoHistoryItem {
  line_id:number;request_id:number;request_number:string;wo_module:string;wo_number:string;status:string;
  requested_at:string;requested_by:string|null;completed_at:string|null;completed_by:string|null;
  asset_id:number|null;AssetCode:string|null;AssetName:string|null;CompanyName:string|null;
  sparepart_id:number;part_code:string;part_name:string;uom:string;requested_qty:number;reserved_qty:number;
  picked_qty:number;issued_qty:number;used_qty:number;returned_available_qty:number;returned_hold_qty:number;line_note:string|null;
}
export interface SparepartWoHistoryData {
  items:SparepartWoHistoryItem[];
  summary:{request_count:number;wo_count:number;asset_count:number;used_qty:number;returned_qty:number};
}
