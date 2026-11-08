import { apiV2 } from "@/lib/api-client";
import { API_V2_URL } from "@/lib/env";
import { getToken, forceLogout } from "@/lib/auth";
import type { ApiResponse } from "@/types/api";
import { ApiError } from "@/types/api";
import type {
  EnergyAssetProfile,
  EnergyProfileFilters,
  EnergyProfileInput,
  EnergyProfileOptions,
  GensetOperationInput,
  GensetOperationList,
  MeterCorrection,
  MeterReadingInput,
  MeterReadingList,
  EnergyMonitoring,
  EnergyMonitoringFilters,
  FuelMovementInput,
  FuelMovementList,
  FuelTankOption,
  UtilityOperationInput,
  UtilityOperationList,
  FuelStockOpnameInput,
  FuelStockOpnameList,
  EnergyEfficiencyKpiInput,
  EnergyEfficiencyKpiResponse,
  UtilityAllocationInput,
  UtilityAllocationResponse,
  MeterCalibrationInput,
  MeterMasterResponse,
  EnergyGovernanceResponse,
  EnergyNcrDetail,
} from "@/types/energy";

export function listEnergyProfiles(
  filters: EnergyProfileFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<EnergyAssetProfile[]>> {
  return apiV2.get<EnergyAssetProfile[]>("/energy/asset-profiles", {
    params: { ...filters },
    signal,
  });
}

export function getEnergyProfileOptions(signal?: AbortSignal) {
  return apiV2.get<EnergyProfileOptions>("/energy/asset-profiles/options", { signal });
}

export function createEnergyProfile(body: EnergyProfileInput) {
  return apiV2.post<{ id: number; asset_id: number; asset_code: string }>(
    "/energy/asset-profiles",
    body,
  );
}

export function updateEnergyProfile(assetId: number, body: EnergyProfileInput) {
  return apiV2.patch<{ asset_id: number }>(`/energy/asset-profiles/${assetId}`, body);
}

export function listMeterReadings(meterId: number, signal?: AbortSignal) {
  return apiV2.get<MeterReadingList>(`/energy/meters/${meterId}/readings`, { signal });
}

export function createMeterReading(meterId: number, body: MeterReadingInput) {
  return apiV2.post<{ id: number; consumption: number; unit: string }>(`/energy/meters/${meterId}/readings`, body);
}

export function updateMeterReading(readingId: number, body: MeterReadingInput) {
  return apiV2.patch<{ id: number; consumption: number }>(`/energy/meter-readings/${readingId}`, body);
}

export function uploadMeterReadingPhotos(readingId: number, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return apiV2.post<Array<{ id: number; url: string }>>(
    `/energy/meter-readings/${readingId}/attachments`,
    undefined,
    { formData },
  );
}

export function moveMeterReading(readingId: number, action: "submit" | "validate" | "lock") {
  return apiV2.post<{ id: number; status: string }>(`/energy/meter-readings/${readingId}/${action}`, {});
}

export function listMeterCorrections(readingId: number, signal?: AbortSignal) {
  return apiV2.get<MeterCorrection[]>(`/energy/meter-readings/${readingId}/corrections`, { signal });
}

export function requestMeterCorrection(readingId: number, body: Record<string, string>) {
  return apiV2.post<{ id: number; reading_id: number }>(`/energy/meter-readings/${readingId}/corrections`, body);
}

export function reviewMeterCorrection(correctionId: number, action: "APPROVE" | "REJECT", reviewNote: string) {
  return apiV2.post<{ id: number; status: string }>(`/energy/meter-corrections/${correctionId}/review`, {
    action,
    review_note: reviewNote,
  });
}

export function listGensetOperations(gensetId: number, signal?: AbortSignal) {
  return apiV2.get<GensetOperationList>(`/energy/gensets/${gensetId}/operations`, { signal });
}

export function createGensetOperation(gensetId: number, body: GensetOperationInput) {
  return apiV2.post<{ id: number }>(`/energy/gensets/${gensetId}/operations`, body);
}

export function updateGensetOperation(operationId: number, body: GensetOperationInput) {
  return apiV2.patch<{ id: number }>(`/energy/genset-operations/${operationId}`, body);
}

export function moveGensetOperation(operationId: number, action: "submit" | "lock") {
  return apiV2.post<{ id: number; status: string }>(`/energy/genset-operations/${operationId}/${action}`, {});
}

export function listUtilityOperations(utilityId: number, signal?: AbortSignal) {
  return apiV2.get<UtilityOperationList>(`/energy/utilities/${utilityId}/operations`, { signal });
}

export function createUtilityOperation(utilityId: number, body: UtilityOperationInput) {
  return apiV2.post<{ id: number; condition_status: string; abnormal_reasons: string | null }>(
    `/energy/utilities/${utilityId}/operations`,
    body,
  );
}

export function updateUtilityOperation(operationId: number, body: UtilityOperationInput) {
  return apiV2.patch<{ id: number; condition_status: string; abnormal_reasons: string | null }>(
    `/energy/utility-operations/${operationId}`,
    body,
  );
}

export function moveUtilityOperation(operationId: number, action: "submit" | "lock") {
  return apiV2.post<{ id: number; status: string; condition_status?: string; work_orders?: Array<{ type: string; wo_number: string }> }>(
    `/energy/utility-operations/${operationId}/${action}`,
    {},
  );
}

export function listFuelTanks(signal?: AbortSignal) {
  return apiV2.get<FuelTankOption[]>("/energy/fuel-tanks/options", { signal });
}

export function listFuelMovements(tankId: number, signal?: AbortSignal) {
  return apiV2.get<FuelMovementList>(`/energy/fuel-tanks/${tankId}/movements`, { signal });
}

export function createFuelMovement(tankId: number, body: FuelMovementInput) {
  return apiV2.post<{ id: number }>(`/energy/fuel-tanks/${tankId}/movements`, body);
}

export function updateFuelMovement(movementId: number, body: FuelMovementInput) {
  return apiV2.patch<{ id: number }>(`/energy/fuel-movements/${movementId}`, body);
}

export function submitFuelMovement(movementId: number) {
  return apiV2.post<{ id: number; status: string }>(`/energy/fuel-movements/${movementId}/submit`, {});
}

export function reviewFuelMovement(movementId: number, action: "APPROVE" | "REJECT", reviewNote = "") {
  return apiV2.post<{ id: number; status: string; source_balance_liter?: number; destination_balance_liter?: number }>(
    `/energy/fuel-movements/${movementId}/review`,
    { action, review_note: reviewNote },
  );
}

export function listFuelStockOpnames(tankId: number, signal?: AbortSignal) {
  return apiV2.get<FuelStockOpnameList>(`/energy/fuel-tanks/${tankId}/opnames`, { signal });
}

export function createFuelStockOpname(tankId: number, body: FuelStockOpnameInput) {
  return apiV2.post<{ id: number; system_balance_liter: number; physical_balance_liter: number; variance_liter: number; variance_percent: number | null }>(
    `/energy/fuel-tanks/${tankId}/opnames`,
    body,
  );
}

export function updateFuelStockOpname(opnameId: number, body: FuelStockOpnameInput) {
  return apiV2.patch<{ id: number; system_balance_liter: number; physical_balance_liter: number; variance_liter: number; variance_percent: number | null }>(
    `/energy/fuel-opnames/${opnameId}`,
    body,
  );
}

export function uploadFuelStockOpnameEvidence(opnameId: number, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return apiV2.post<Array<{ id: number; file_name: string; url: string }>>(
    `/energy/fuel-opnames/${opnameId}/attachments`,
    undefined,
    { formData },
  );
}

export function submitFuelStockOpname(opnameId: number) {
  return apiV2.post<{ id: number; status: string }>(`/energy/fuel-opnames/${opnameId}/submit`, {});
}

export function reviewFuelStockOpname(opnameId: number, action: "APPROVE" | "REJECT", reviewNote = "") {
  return apiV2.post<{ id: number; status: string; adjustment_movement_id: number | null; reconciled_balance_liter: number | null; variance_liter?: number }>(
    `/energy/fuel-opnames/${opnameId}/review`,
    { action, review_note: reviewNote },
  );
}

export function getEnergyMonitoring(filters: EnergyMonitoringFilters, signal?: AbortSignal) {
  return apiV2.get<EnergyMonitoring>("/energy/monitoring", { params: { ...filters }, signal });
}

export function getEnergyEfficiencyKpis(filters: EnergyMonitoringFilters, signal?: AbortSignal) {
  return apiV2.get<EnergyEfficiencyKpiResponse>("/energy/efficiency-kpis", { params: { ...filters }, signal });
}

export function createEnergyEfficiencyKpi(body: EnergyEfficiencyKpiInput) {
  return apiV2.post<{ id: number; version: number }>("/energy/efficiency-kpis", body);
}

export function updateEnergyEfficiencyKpi(id: number, body: EnergyEfficiencyKpiInput) {
  return apiV2.patch<{ id: number }>(`/energy/efficiency-kpis/${id}`, body);
}

export function transitionEnergyEfficiencyKpi(id: number, action: "activate" | "archive") {
  return apiV2.post<{ id: number; status: string }>(`/energy/efficiency-kpis/${id}/${action}`, {});
}

export function listUtilityAllocations(filters: { status?: string; company?: string }, signal?: AbortSignal) {
  return apiV2.get<UtilityAllocationResponse>("/energy/utility-allocations", { params: filters, signal });
}

export function createUtilityAllocation(body: UtilityAllocationInput) {
  return apiV2.post<{ id: number; allocation_number: string; source_quantity: number; unit: string }>("/energy/utility-allocations", body);
}

export function updateUtilityAllocation(id: number, body: UtilityAllocationInput) {
  return apiV2.patch<{ id: number; source_quantity: number; unit: string }>(`/energy/utility-allocations/${id}`, body);
}

export function submitUtilityAllocation(id: number) {
  return apiV2.post<{ id: number; status: string }>(`/energy/utility-allocations/${id}/submit`, {});
}

export function reviewUtilityAllocation(id: number, action: "LOCK" | "REJECT", reviewNote = "") {
  return apiV2.post<{ id: number; status: string }>(`/energy/utility-allocations/${id}/review`, { action, review_note: reviewNote });
}

export function getMeterMaster(filters: { company?: string; reminder_state?: string }, signal?: AbortSignal) {
  return apiV2.get<MeterMasterResponse>("/energy/meter-master", { params: filters, signal });
}

export function updateMeterHierarchy(meterId: number, parentMeterId: number | null, meterType: string) {
  return apiV2.patch<{ id: number; parent_meter_id: number | null; meter_type: string }>(`/energy/meters/${meterId}/hierarchy`, { parent_meter_id: parentMeterId, meter_type: meterType });
}

export function updateMeterReminderSettings(meterId: number, body: Record<string, unknown>) {
  return apiV2.patch<{ id: number }>(`/energy/meters/${meterId}/reminder-settings`, body);
}

export function createMeterCalibration(meterId: number, body: MeterCalibrationInput) {
  return apiV2.post<{ id: number }>(`/energy/meters/${meterId}/calibrations`, body);
}

export function updateMeterCalibration(id: number, body: MeterCalibrationInput) {
  return apiV2.patch<{ id: number }>(`/energy/meter-calibrations/${id}`, body);
}

export function uploadMeterCalibrationEvidence(id: number, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return apiV2.post<Array<{ id: number; file_name: string; url: string }>>(`/energy/meter-calibrations/${id}/attachments`, undefined, { formData });
}

export function submitMeterCalibration(id: number) {
  return apiV2.post<{ id: number; status: string }>(`/energy/meter-calibrations/${id}/submit`, {});
}

export function reviewMeterCalibration(id: number, action: "APPROVE" | "REJECT", reviewNote = "") {
  return apiV2.post<{ id: number; status: string }>(`/energy/meter-calibrations/${id}/review`, { action, review_note: reviewNote });
}

export function getEnergyGovernance(filters: { status?: string; severity?: string; q?: string }, signal?: AbortSignal) {
  return apiV2.get<EnergyGovernanceResponse>("/energy/governance", { params: filters, signal });
}

export function getEnergyNcr(id: number, signal?: AbortSignal) {
  return apiV2.get<EnergyNcrDetail>(`/energy/governance/ncr/${id}`, { signal });
}

export function createEnergyNcr(body: Record<string, unknown>) {
  return apiV2.post<{ id: number; ncr_number: string }>("/energy/governance/ncr", body);
}

export function actionEnergyNcr(id: number, body: Record<string, unknown>) {
  return apiV2.patch<{ id: number; status: string }>(`/energy/governance/ncr/${id}/action`, body);
}

export function verifyEnergyNcr(id: number, action: "CLOSE" | "REJECT", verificationNote: string) {
  return apiV2.post<{ id: number; status: string }>(`/energy/governance/ncr/${id}/verify`, { action, verification_note: verificationNote });
}

export function uploadEnergyNcrEvidence(id: number, files: File[], metadata: Record<string, string>) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  Object.entries(metadata).forEach(([key, value]) => { if (value) formData.append(key, value); });
  return apiV2.post<Array<{ id: number; file_name: string; url: string }>>(`/energy/governance/ncr/${id}/evidence`, undefined, { formData });
}

export async function downloadEnergyReport(filters: EnergyMonitoringFilters): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const token = getToken();
  const response = await fetch(`${API_V2_URL}/energy/reports/export?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    forceLogout();
    throw new ApiError("Sesi Anda telah berakhir.", 401);
  }
  if (!response.ok) {
    let message = `Export gagal (HTTP ${response.status}).`;
    try { message = (await response.json() as { message?: string }).message ?? message; } catch {}
    throw new ApiError(message, response.status);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "Energy-Report.xlsx";
  return { blob: await response.blob(), fileName };
}
