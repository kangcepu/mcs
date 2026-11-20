import { apiV2 } from "@/lib/api-client";

export type StockOpnameSchedule = {
  id: number;
  schedule_code: string;
  schedule_name: string;
  recurrence_type: "DAILY" | "WEEKLY" | "MONTHLY";
  interval_value: number;
  start_date: string;
  end_date: string | null;
  next_run_date: string;
  last_run_date: string | null;
  is_bom: number;
  company_ids: string[];
  category_ids: string[];
  location_ids: string[];
  status: "ACTIVE" | "PAUSED";
  notes: string | null;
  last_run_status: string | null;
  last_no_so: string | null;
  location_assignments: StockOpnameLocationAssignment[];
};

export type StockOpnameLocationAssignment = {
  location_id: string;
  location_name: string | null;
  user_id: number;
  fullname?: string;
  username?: string;
};

export type StockOpnameScheduleInput = {
  schedule_name: string;
  recurrence_type: "DAILY" | "WEEKLY" | "MONTHLY";
  interval_value: number;
  start_date: string;
  end_date: string;
  is_bom: boolean;
  company_ids: string[];
  category_ids: string[];
  location_assignments: StockOpnameLocationAssignment[];
  notes: string;
};

export type StockOpnameScheduleOptions = {
  users: Array<{ value: number; label: string; username: string; division: string | null }>;
  masters: unknown;
};

export type StockOpnameMonitoring = {
  summary: { total_snapshot: number; checked: number; unchecked: number; variance: number };
  rows: Array<{
    id: number; no_so: string; schedule_name: string; category_id: string;
    location_id: string; location_name: string | null; user_id: number;
    username: string; fullname: string; run_status: string; type: "ASSET" | "BOM";
    total_snapshot: number; checked: number; unchecked: number; variance: number;
    checked_by_user: number; progress_percent: number;
  }>;
};

export const getStockOpnameSchedules = (signal?: AbortSignal) =>
  apiV2.get<StockOpnameSchedule[]>("/stock-opname-schedules", { signal });
export const getStockOpnameScheduleOptions = (signal?: AbortSignal) =>
  apiV2.get<StockOpnameScheduleOptions>("/stock-opname-schedules/options", { signal });
export const getStockOpnameMonitoring = (signal?: AbortSignal) =>
  apiV2.get<StockOpnameMonitoring>("/stock-opname-schedules/monitoring", { signal });
export const createStockOpnameSchedule = (body: StockOpnameScheduleInput) =>
  apiV2.post<{ id: number }>("/stock-opname-schedules", body);
export const updateStockOpnameSchedule = (id: number, body: StockOpnameScheduleInput) =>
  apiV2.patch<{ id: number }>(`/stock-opname-schedules/${id}`, body);
export const setStockOpnameScheduleStatus = (id: number, status: "ACTIVE" | "PAUSED") =>
  apiV2.patch<{ id: number; status: string }>(`/stock-opname-schedules/${id}/status`, { status });
export const runStockOpnameScheduleCron = () =>
  apiV2.post<{ processed: number; created: number; partial: number; failed: number; runs: Array<{ schedule_name: string; no_so: string; status: string; message?: string }> }>("/stock-opname-schedules/run-cron", {});
