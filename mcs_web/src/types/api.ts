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
