/** Format respons standar MCS API V2. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PageMeta;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  summary?: Record<string, number>;
  max_outdated_version?: string;
  realtime?: RealtimeServerStatus;
}

export interface RealtimeServerStatus {
  running: boolean;
  uptime_seconds: number;
  heartbeat_seconds: number;
  clients_total: number;
  clients_mobile: number;
  clients_web: number;
  users_online: number;
  events_total: number;
  last_event_seconds_ago: number | null;
  watcher: {
    active: boolean;
    interval_seconds: number;
    polls_total: number;
    last_poll_seconds_ago: number | null;
    last_poll_ok: boolean;
    last_poll_ms: number;
    last_change_seconds_ago: number | null;
  };
}

/** Parameter paginasi yang dipakai hampir semua list endpoint. */
export interface PageParams {
  page?: number;
  per_page?: number;
}

export const DEFAULT_PER_PAGE = 25;

/** Error terstruktur yang dilempar api-client. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}
