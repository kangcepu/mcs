export interface AssetListItem {
  id?: number | string;
  asset_code: string;
  asset_name?: string;
  name?: string;
  company?: string | null;
  company_name?: string | null;
  location?: string | null;
  location_name?: string | null;
  category?: string | null;
  category_name?: string | null;
  is_active?: boolean;
  status?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  pic_user_id?: number | null;
  pic_name?: string | null;
  [key: string]: unknown;
}

export interface AssetFilters {
  q?: string;
  company?: string;
  location?: string;
  category?: string;
  is_active?: string;
  unlinked_only?: string;
  scope?: string;
  pic_user_id?: string;
  page?: number;
  per_page?: number;
}

export interface AssetOption {
  value: string;
  label: string;
}

export interface AssetOptions {
  companies: AssetOption[];
  locations: AssetOption[];
  categories: AssetOption[];
  [key: string]: unknown;
}

export interface AssetPicOption extends AssetOption { username?: string; division?: string; asset_count?: number }
export interface AssetPicSummaryRow { pic_user_id: number; pic_name: string; username: string; division?: string; total_assets: number; active_assets: number; disabled_assets: number; inventory_it_assets: number }

export interface AssetBomItem {
  part_code?: string;
  part_name?: string;
  qty?: number;
  uom?: string;
  note?: string | null;
  children?: AssetBomItem[];
  [key: string]: unknown;
}

export interface AssetCustomDetail {
  part?: string;
  condition?: string;
  frequency?: string;
  photo_url?: string | null;
  note?: string | null;
  [key: string]: unknown;
}

export interface AssetAttachment {
  id?: number | string;
  url: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

export interface AssetHistoryEntry {
  at?: string;
  actor?: string;
  action?: string;
  note?: string | null;
  [key: string]: unknown;
}

export interface AssetLocationHistoryEntry {
  id: number | string;
  asset_id: number | string;
  asset_code: string;
  company_from?: string | null;
  company_to?: string | null;
  location_from?: string | null;
  location_to?: string | null;
  event_type: "INITIAL" | "MOVED" | string;
  source?: string | null;
  reference_no?: string | null;
  note?: string | null;
  changed_by?: string | null;
  moved_at: string;
}

export interface AssetDetail extends AssetListItem {
  parent_asset_id?: number | null;
  parent_asset_code?: string | null;
  parent_asset_name?: string | null;
  children?: Array<{
    AssetID: number;
    AssetCode: string;
    AssetName: string;
    CategoryAsset?: string | null;
    LocationAsset?: string | null;
    active?: string | null;
  }>;
  related_groups?: Array<{
    id: number;
    child_name: string;
    source_row?: number | null;
    source_file?: string | null;
    created_at?: string | null;
    items: Array<{
      id: number;
      group_id: number;
      item_name: string;
      condition_text?: string | null;
      frequency?: string | null;
      pic?: string | null;
      source_row?: number | null;
      sort_order?: number | null;
      linked_asset_id?: number | null;
      AssetCode?: string | null;
      AssetName?: string | null;
      CategoryAsset?: string | null;
      LocationAsset?: string | null;
      active?: string | null;
      photo_1_path?: string | null;
      photo_1_name?: string | null;
      photo_1_mime?: string | null;
      photo_1_url?: string | null;
      photo_2_path?: string | null;
      photo_2_name?: string | null;
      photo_2_mime?: string | null;
      photo_2_url?: string | null;
    }>;
  }>;
  bom?: AssetBomItem[];
  parts?: AssetBomItem[];
  custom_details?: AssetCustomDetail[];
  attachments?: AssetAttachment[];
  gallery?: AssetAttachment[];
  history?: AssetHistoryEntry[];
  histories?: AssetHistoryEntry[];
  location_history?: AssetLocationHistoryEntry[];
  specs?: Record<string, unknown>;
  energy_profile?: import("@/types/energy").EnergyAssetProfile | null;
  fleet_profile?: import("@/types/fleet").FleetProfile | null;
}
