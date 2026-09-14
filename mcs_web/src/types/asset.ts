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
  [key: string]: unknown;
}

export interface AssetFilters {
  q?: string;
  company?: string;
  location?: string;
  category?: string;
  is_active?: string;
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

export interface AssetDetail extends AssetListItem {
  bom?: AssetBomItem[];
  parts?: AssetBomItem[];
  custom_details?: AssetCustomDetail[];
  attachments?: AssetAttachment[];
  gallery?: AssetAttachment[];
  histories?: AssetHistoryEntry[];
  specs?: Record<string, unknown>;
}
