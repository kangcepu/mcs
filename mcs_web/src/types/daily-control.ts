export interface DailyControlSummary {
  date: string;
  pro?: number;
  cor?: number;
  prev?: number;
  unread_count?: number;
  [key: string]: unknown;
}

export interface DailyControlActivity {
  id: number | string;
  type?: string;
  title?: string;
  wo_number?: string | null;
  asset_code?: string | null;
  actor?: string | null;
  at?: string | null;
  is_unread?: boolean;
  comment_count?: number;
  [key: string]: unknown;
}

export interface DailyControlComment {
  id: number | string;
  actor?: string;
  body?: string;
  at?: string;
  [key: string]: unknown;
}

export interface DailyControlFilters {
  date?: string;
  date_from?: string;
  date_to?: string;
  company?: string;
  division?: string;
  page?: number;
  per_page?: number;
}
