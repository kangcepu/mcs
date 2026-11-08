import { apiV2 } from "@/lib/api-client";
import type { FleetOverview } from "@/types/fleet";

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
