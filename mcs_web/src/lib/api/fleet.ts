import { apiV2 } from "@/lib/api-client";
import { API_V2_URL } from "@/lib/env";
import { forceLogout, getToken } from "@/lib/auth";
import { ApiError } from "@/types/api";
import type { FleetAttachment, FleetAuditItem, FleetDashboard, FleetOverview, FleetReconciliation } from "@/types/fleet";

export const getFleetOverview = (signal?: AbortSignal) =>
  apiV2.get<FleetOverview>("/fleet/overview", { signal });

export const createFleetProfile = (body: Record<string, unknown>) =>
  apiV2.post<{ id: number }>("/fleet/profiles", body);

export const createFleetMeterReading = (body: Record<string, unknown>) =>
  apiV2.post("/fleet/meter-readings", body);

export const createFleetInspection = (body: Record<string, unknown>) =>
  apiV2.post<{ id: number }>("/fleet/inspections", body);

export const submitFleetInspection = (id: number) =>
  apiV2.post(`/fleet/inspections/${id}/submit`, {});

export const reviewFleetInspection = (id: number, action: "APPROVE" | "REJECT") =>
  apiV2.post(`/fleet/inspections/${id}/review`, { action });

export const createFleetFuel = (body: Record<string, unknown>) =>
  apiV2.post<{ id: number }>("/fleet/fuel-transactions", body);

export const submitFleetFuel = (id: number) =>
  apiV2.post(`/fleet/fuel-transactions/${id}/submit`, {});

export const reviewFleetFuel = (id: number, action: "APPROVE" | "REJECT") =>
  apiV2.post(`/fleet/fuel-transactions/${id}/review`, { action });

export const createFleetService = (body: Record<string, unknown>) =>
  apiV2.post<{ id: number }>("/fleet/services", body);

export const resolveFleetAnomaly = (id: number, resolution_note: string) =>
  apiV2.post(`/fleet/anomalies/${id}/resolve`, { resolution_note });

export const getFleetDashboard = (params: { date_from: string; date_to: string }, signal?: AbortSignal) =>
  apiV2.get<FleetDashboard>("/fleet/dashboard", { params, signal });

export const refreshFleetReminders = () =>
  apiV2.post<{ created: number }>("/fleet/preventive-reminders/refresh", {});

export const createFleetReminderWorkOrder = (id: number) =>
  apiV2.post<{ wo_number: string }>(`/fleet/preventive-reminders/${id}/work-order`, {});

export const getFleetAttachments = (entity_type: "INSPECTION" | "SERVICE", entity_id: number) =>
  apiV2.get<FleetAttachment[]>("/fleet/attachments", { params: { entity_type, entity_id } });

export const uploadFleetAttachments = (entity_type: "INSPECTION" | "SERVICE", entity_id: number, files: File[]) => {
  const formData = new FormData();
  formData.append("entity_type", entity_type); formData.append("entity_id", String(entity_id));
  files.forEach((file) => formData.append("files", file));
  return apiV2.post<FleetAttachment[]>("/fleet/attachments", undefined, { formData });
};

export const deleteFleetAttachment = (id: number) => apiV2.delete(`/fleet/attachments/${id}`);

export const getFleetReconciliationPreview = (params: { date_from: string; date_to: string; fuel_tank_id?: number }) =>
  apiV2.get<FleetReconciliation[]>("/fleet/fuel-reconciliation/preview", { params });

export const saveFleetReconciliation = (body: { fuel_tank_id: number; period_start: string; period_end: string; notes?: string }) =>
  apiV2.post<{ id: number }>("/fleet/fuel-reconciliations", body);

export const reviewFleetReconciliation = (id: number) => apiV2.post(`/fleet/fuel-reconciliations/${id}/review`, {});

export const getFleetAuditTimeline = (vehicle_id?: number) =>
  apiV2.get<FleetAuditItem[]>("/fleet/audit-timeline", { params: { vehicle_id } });

export async function downloadFleetReport(params: { date_from: string; date_to: string }): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams(params); const token = getToken();
  const response = await fetch(`${API_V2_URL}/fleet/reports/export?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 401) { forceLogout(); throw new ApiError("Sesi Anda telah berakhir.", 401); }
  if (!response.ok) { let message = `Export gagal (HTTP ${response.status}).`; try { message = (await response.json() as { message?: string }).message ?? message; } catch {} throw new ApiError(message, response.status); }
  const disposition = response.headers.get("content-disposition") ?? "";
  return { blob: await response.blob(), fileName: disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "Fleet-Report.xlsx" };
}
