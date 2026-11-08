export type EnergyAssetType =
  | "ELECTRICITY_METER"
  | "GENSET"
  | "FUEL_TANK"
  | "WATER_METER"
  | "COMPRESSOR"
  | "BOILER"
  | "OTHER";

export type UtilityType =
  | "ELECTRICITY"
  | "FUEL"
  | "WATER"
  | "COMPRESSED_AIR"
  | "STEAM"
  | "OTHER";

export type EnergyProfileStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED";

export interface EnergyAssetProfile {
  id: number;
  asset_id: number;
  energy_type: EnergyAssetType;
  utility_type: UtilityType;
  profile_code: string | null;
  description: string | null;
  commissioning_date: string | null;
  ownership: string | null;
  status: EnergyProfileStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
  CategoryAsset: string;
  asset_status: string;
  metadata_json: string | null;
  meter_id: number | null;
  parent_meter_id: number | null;
  meter_number: string | null;
  meter_type: "MAIN" | "SUB" | "INCOMING" | "OUTGOING" | null;
  meter_unit: string | null;
  meter_multiplier: string | number | null;
  digit_count: number | null;
  rollover_value: string | number | null;
  reading_frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | null;
  meter_effective_from: string | null;
  meter_effective_to: string | null;
  genset_profile_id: number | null;
  serial_number: string | null;
  rated_kva: string | number | null;
  rated_kw: string | number | null;
  genset_fuel_type: string | null;
  tank_capacity_liter: string | number | null;
  initial_hour_meter: string | number | null;
  current_hour_meter: string | number | null;
  fuel_tank_id: number | null;
  tank_number: string | null;
  tank_fuel_type: string | null;
  capacity_liter: string | number | null;
  minimum_level_liter: string | number | null;
  maximum_level_liter: string | number | null;
  reference_balance_liter: string | number | null;
  utility_profile_id: number | null;
  utility_kind: "COMPRESSOR" | "BOILER" | null;
  utility_capacity_value: string | number | null;
  utility_capacity_unit: string | null;
  utility_rated_power_kw: string | number | null;
  utility_initial_hour_meter: string | number | null;
  utility_current_hour_meter: string | number | null;
  pressure_min_bar: string | number | null;
  pressure_max_bar: string | number | null;
  temperature_min_c: string | number | null;
  temperature_max_c: string | number | null;
  flow_min: string | number | null;
  flow_max: string | number | null;
  flow_unit: string | null;
  output_min: string | number | null;
  output_max: string | number | null;
  output_unit: string | null;
  utility_inspection_frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | null;
  preventive_interval_hours: string | number | null;
  last_preventive_hour_meter: string | number | null;
  auto_corrective_wo: number | boolean | null;
  auto_preventive_wo: number | boolean | null;
}

export interface EnergyProfileFilters {
  q?: string;
  company?: string;
  energy_type?: string;
  utility_type?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

export interface EnergyOption {
  value: string;
  label: string;
}

export interface EnergyProfileOptions {
  energy_types: EnergyOption[];
  utility_types: EnergyOption[];
  statuses: EnergyOption[];
  default_utility: Record<string, UtilityType>;
}

export interface EnergyProfileInput {
  asset_id?: number;
  energy_type: EnergyAssetType;
  utility_type: UtilityType;
  profile_code?: string;
  description?: string;
  commissioning_date?: string;
  ownership?: string;
  status: EnergyProfileStatus;
  meter_number?: string;
  meter_type?: "MAIN" | "SUB" | "INCOMING" | "OUTGOING";
  meter_unit?: string;
  meter_multiplier?: string;
  digit_count?: string;
  rollover_value?: string;
  reading_frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | "";
  meter_effective_from?: string;
  meter_effective_to?: string;
  serial_number?: string;
  rated_kva?: string;
  rated_kw?: string;
  fuel_type?: string;
  tank_capacity_liter?: string;
  initial_hour_meter?: string;
  current_hour_meter?: string;
  tank_number?: string;
  capacity_liter?: string;
  minimum_level_liter?: string;
  maximum_level_liter?: string;
  reference_balance_liter?: string;
  capacity_value?: string;
  capacity_unit?: string;
  operating_pressure_bar?: string;
  rated_power_kw?: string;
  technical_specification?: string;
  utility_initial_hour_meter?: string;
  utility_current_hour_meter?: string;
  pressure_min_bar?: string;
  pressure_max_bar?: string;
  temperature_min_c?: string;
  temperature_max_c?: string;
  flow_min?: string;
  flow_max?: string;
  flow_unit?: string;
  output_min?: string;
  output_max?: string;
  output_unit?: string;
  utility_inspection_frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";
  preventive_interval_hours?: string;
  last_preventive_hour_meter?: string;
  auto_corrective_wo?: boolean;
  auto_preventive_wo?: boolean;
}

export type MeterReadingStatus = "DRAFT" | "SUBMITTED" | "VALIDATED" | "LOCKED" | "CORRECTED";

export interface MeterReadingAttachment {
  id: number;
  reading_id: number;
  attachment_type: string;
  file_name: string;
  object_key: string;
  mime_type: string | null;
  file_size: number | null;
  url: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface MeterReading {
  id: number;
  meter_id: number;
  reading_period: string;
  read_at: string;
  previous_reading: string | number | null;
  current_reading: string | number;
  multiplier: string | number;
  consumption: string | number | null;
  reading_type: string;
  is_rollover: number | boolean;
  status: MeterReadingStatus;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  pending_corrections: number;
  attachments: MeterReadingAttachment[];
}

export interface MeterReadingList {
  meter: EnergyAssetProfile & { unit?: string };
  readings: MeterReading[];
}

export interface MeterReadingInput {
  reading_period?: string;
  read_at: string;
  previous_reading?: string;
  current_reading: string;
  multiplier?: string;
  notes?: string;
}

export interface MeterCorrection {
  id: number;
  reading_id: number;
  requested_previous_reading: string | number | null;
  requested_current_reading: string | number | null;
  requested_multiplier: string | number | null;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export type GensetOperationStatus = "DRAFT" | "SUBMITTED" | "LOCKED";

export interface GensetOperation {
  id: number;
  genset_profile_id: number;
  started_at: string;
  ended_at: string | null;
  hour_meter_start: string | number | null;
  hour_meter_end: string | number | null;
  operating_hours: string | number | null;
  generated_kwh: string | number | null;
  average_load_percent: string | number | null;
  fuel_consumed_liter: string | number | null;
  fuel_tank_id: number | null;
  fuel_movement_id: number | null;
  fuel_tank_number: string | null;
  fuel_tank_asset_code: string | null;
  fuel_tank_asset_name: string | null;
  fuel_movement_status: FuelMovementStatus | null;
  status: GensetOperationStatus;
  notes: string | null;
  operator_name: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GensetOperationList {
  profile: EnergyAssetProfile;
  operations: GensetOperation[];
}

export interface GensetOperationInput {
  started_at: string;
  ended_at?: string;
  hour_meter_start?: string;
  hour_meter_end?: string;
  generated_kwh?: string;
  average_load_percent?: string;
  fuel_consumed_liter?: string;
  fuel_tank_id?: string;
  operator_name?: string;
  notes?: string;
}

export type UtilityConditionStatus = "NORMAL" | "ATTENTION" | "CRITICAL";
export type UtilityOperationStatus = "DRAFT" | "SUBMITTED" | "LOCKED";

export interface UtilityWorkOrderLink {
  id: number;
  operation_id: number;
  trigger_type: "CORRECTIVE" | "PREVENTIVE";
  wo_module: "meso";
  wo_number: string;
  wo_status: string | null;
  trigger_reason: string | null;
  created_at: string;
}

export interface UtilityOperation {
  id: number;
  utility_profile_id: number;
  inspected_at: string;
  started_at: string | null;
  ended_at: string | null;
  hour_meter_start: string | number | null;
  hour_meter_end: string | number | null;
  operating_hours: string | number | null;
  pressure_bar: string | number | null;
  temperature_c: string | number | null;
  flow_value: string | number | null;
  output_value: string | number | null;
  condition_status: UtilityConditionStatus;
  abnormal_reasons: string | null;
  status: UtilityOperationStatus;
  operator_name: string | null;
  inspection_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  work_orders: UtilityWorkOrderLink[];
}

export interface UtilityOperationList {
  profile: EnergyAssetProfile;
  operations: UtilityOperation[];
}

export interface UtilityOperationInput {
  inspected_at: string;
  started_at?: string;
  ended_at?: string;
  hour_meter_start?: string;
  hour_meter_end?: string;
  pressure_bar?: string;
  temperature_c?: string;
  flow_value?: string;
  output_value?: string;
  observed_condition: UtilityConditionStatus;
  abnormal_note?: string;
  operator_name?: string;
  inspection_notes?: string;
}

export type FuelMovementType = "RECEIPT" | "CONSUMPTION" | "TRANSFER" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
export type FuelMovementStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED";

export interface FuelTankOption {
  id: number;
  energy_profile_id?: number;
  asset_id: number;
  tank_number: string | null;
  fuel_type: string;
  capacity_liter: string | number;
  minimum_level_liter: string | number | null;
  maximum_level_liter: string | number | null;
  reference_balance_liter: string | number | null;
  current_balance_liter: string | number;
  status: string;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
}

export interface FuelMovement {
  id: number;
  fuel_tank_id: number;
  movement_type: FuelMovementType;
  movement_at: string;
  quantity_liter: string | number;
  destination_type: string | null;
  destination_asset_id: number | null;
  destination_tank_id: number | null;
  reference_number: string | null;
  meter_before: string | number | null;
  meter_after: string | number | null;
  status: FuelMovementStatus;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  source_asset_code?: string;
  source_asset_name?: string;
  destination_asset_code?: string | null;
  destination_asset_name?: string | null;
  destination_tank_number?: string | null;
  destination_tank_asset_code?: string | null;
  tank_role?: "SOURCE" | "INCOMING_TRANSFER";
}

export interface FuelMovementList {
  tank: FuelTankOption;
  movements: FuelMovement[];
}

export interface FuelMovementInput {
  movement_type: FuelMovementType;
  movement_at: string;
  quantity_liter: string;
  destination_asset_id?: number;
  destination_tank_id?: number;
  reference_number?: string;
  meter_before?: string;
  meter_after?: string;
  notes?: string;
}

export type FuelStockOpnameStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type FuelMeasurementMethod = "DIP_STICK" | "LEVEL_GAUGE" | "FLOW_METER" | "OTHER";

export interface FuelStockOpnameAttachment {
  id: number;
  opname_id: number;
  attachment_type: string;
  file_name: string;
  object_key: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  url: string;
}

export interface FuelStockOpname {
  id: number;
  fuel_tank_id: number;
  opname_number: string;
  opname_at: string;
  system_balance_liter: string | number;
  physical_balance_liter: string | number;
  variance_liter: string | number;
  variance_percent: string | number | null;
  tolerance_liter: string | number;
  measurement_method: FuelMeasurementMethod;
  status: FuelStockOpnameStatus;
  measured_by: string | null;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  adjustment_movement_id: number | null;
  created_by: string | null;
  created_at: string;
  attachments: FuelStockOpnameAttachment[];
}

export interface FuelStockOpnameList {
  tank: FuelTankOption;
  opnames: FuelStockOpname[];
}

export interface FuelStockOpnameInput {
  opname_at: string;
  physical_balance_liter: string;
  tolerance_liter?: string;
  measurement_method: FuelMeasurementMethod;
  measured_by?: string;
  notes?: string;
}

export interface EnergyTrendPoint {
  date: string;
  electricity: number;
  water: number;
  genset_kwh: number;
  genset_fuel: number;
  fuel_in: number;
  fuel_out: number;
}

export interface EnergyAlert {
  kind: "ROLLOVER" | "ANOMALY" | "LOW_STOCK";
  severity: "warning" | "critical";
  occurred_at: string | null;
  asset_code: string;
  asset_name: string;
  message: string;
}

export interface EnergyMonitoring {
  filters: {
    date_from: string;
    date_to: string;
    company: string;
    companies: string[];
  };
  summary: {
    electricity_consumption: number;
    water_consumption: number;
    genset_generated_kwh: number;
    genset_operating_hours: number;
    genset_fuel_liter: number;
    total_fuel_stock_liter: number;
    pending_approvals: number;
    alerts: number;
  };
  trend: EnergyTrendPoint[];
  alerts: EnergyAlert[];
  tanks: FuelTankOption[];
}

export interface EnergyMonitoringFilters {
  date_from: string;
  date_to: string;
  company?: string;
}

export type EnergyKpiMetricCode =
  | "ELECTRICITY_CONSUMPTION"
  | "WATER_CONSUMPTION"
  | "GENSET_KWH_PER_LITER"
  | "GENSET_KWH_PER_HOUR"
  | "COMPRESSOR_OUTPUT_PER_HOUR"
  | "BOILER_OUTPUT_PER_HOUR";
export type EnergyKpiScopeType = "GLOBAL" | "COMPANY" | "ASSET";
export type EnergyKpiStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export interface EnergyEfficiencyKpi {
  id: number;
  kpi_code: string;
  version_no: number;
  kpi_name: string;
  metric_code: EnergyKpiMetricCode;
  scope_type: EnergyKpiScopeType;
  scope_company: string | null;
  energy_profile_id: number | null;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  unit: string;
  baseline_value: string | number;
  baseline_start: string;
  baseline_end: string;
  target_value: string | number;
  minimum_value: string | number;
  weight_percent: string | number;
  owner_name: string;
  effective_from: string;
  effective_to: string | null;
  status: EnergyKpiStatus;
  notes: string | null;
  AssetCode: string | null;
  AssetName: string | null;
  asset_company: string | null;
  LocationAsset: string | null;
}

export interface EnergyKpiEvaluation extends EnergyEfficiencyKpi {
  actual_value: number | null;
  numerator: number | null;
  denominator: number | null;
  sample_count: number;
  result_status: "ACHIEVED" | "WARNING" | "BELOW_MINIMUM" | "NOT_MEASURABLE";
  achievement_percent: number | null;
  improvement_from_baseline_percent: number | null;
  weighted_score: number | null;
}

export interface EnergyKpiProfileOption {
  id: number;
  energy_type: EnergyAssetType;
  utility_type: UtilityType;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
  parent_energy_profile_id?: number | null;
}

export interface EnergyEfficiencyKpiResponse {
  filters: EnergyMonitoringFilters;
  definitions: EnergyEfficiencyKpi[];
  evaluations: EnergyKpiEvaluation[];
  overall_score: number | null;
  options: {
    metrics: Record<EnergyKpiMetricCode, { unit: string; direction: "HIGHER_BETTER" | "LOWER_BETTER" }>;
    companies: string[];
    profiles: EnergyKpiProfileOption[];
  };
}

export interface EnergyEfficiencyKpiInput {
  kpi_code: string;
  kpi_name: string;
  metric_code: EnergyKpiMetricCode;
  scope_type: EnergyKpiScopeType;
  scope_company?: string;
  energy_profile_id?: string;
  period_type: string;
  unit?: string;
  baseline_value?: string;
  baseline_start: string;
  baseline_end: string;
  target_value: string;
  minimum_value: string;
  weight_percent: string;
  owner_name: string;
  effective_from: string;
  effective_to?: string;
  notes?: string;
}

export type UtilityAllocationStatus = "DRAFT" | "SUBMITTED" | "LOCKED" | "REJECTED";
export type UtilityAllocationType = "MEASURED" | "ESTIMATED";

export interface UtilityAllocationLine {
  id: number;
  allocation_id: number;
  id_division: number;
  department_code: string | null;
  department_name: string;
  cost_center_code: string;
  cost_center_name: string | null;
  allocation_type: UtilityAllocationType;
  sub_meter_profile_id: number | null;
  driver_value: string | number | null;
  measured_quantity: string | number | null;
  allocated_quantity: string | number;
  allocation_percent: string | number;
  reference_cost: string | number | null;
  notes: string | null;
  sub_meter_asset_code: string | null;
  sub_meter_asset_name: string | null;
}

export interface UtilityAllocationHistory {
  id: number;
  action_type: string;
  from_status: string | null;
  to_status: string;
  action_note: string | null;
  acted_by: string | null;
  acted_at: string;
}

export interface UtilityAllocation {
  id: number;
  allocation_number: string;
  energy_profile_id: number;
  source_energy_type: EnergyAssetType;
  period_start: string;
  period_end: string;
  allocation_basis: string;
  source_quantity: string | number;
  source_sample_count: number;
  unit: string;
  reference_rate: string | number | null;
  currency_code: string;
  tariff_source: string | null;
  tariff_reference: string | null;
  tariff_as_of: string | null;
  total_reference_cost: string | number | null;
  status: UtilityAllocationStatus;
  notes: string | null;
  created_by: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
  allocated_quantity: string | number;
  allocated_reference_cost: string | number;
  line_count: number;
  lines: UtilityAllocationLine[];
  history: UtilityAllocationHistory[];
}

export interface UtilityAllocationDivisionOption {
  id_division: number;
  id_company: string | null;
  division_code: string | null;
  division_name: string;
}

export interface UtilityAllocationResponse {
  allocations: UtilityAllocation[];
  options: {
    profiles: EnergyKpiProfileOption[];
    divisions: UtilityAllocationDivisionOption[];
    companies: string[];
    bases: string[];
  };
}

export interface UtilityAllocationLineInput {
  id_division: string;
  cost_center_code: string;
  cost_center_name?: string;
  allocation_type: UtilityAllocationType;
  sub_meter_profile_id?: string;
  driver_value?: string;
  notes?: string;
}

export interface UtilityAllocationInput {
  energy_profile_id: string;
  period_start: string;
  period_end: string;
  allocation_basis: string;
  reference_rate?: string;
  currency_code: string;
  tariff_source?: string;
  tariff_reference?: string;
  tariff_as_of?: string;
  notes?: string;
  lines: UtilityAllocationLineInput[];
}

export type MeterReminderState = "NOT_SCHEDULED" | "SCHEDULED" | "UPCOMING" | "DUE" | "OVERDUE";
export type MeterCalibrationStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface MeterMasterItem {
  id: number;
  energy_profile_id: number;
  parent_meter_id: number | null;
  parent_energy_profile_id: number | null;
  parent_asset_code: string | null;
  parent_asset_name: string | null;
  meter_number: string | null;
  meter_type: "MAIN" | "SUB" | "INCOMING" | "OUTGOING";
  unit: string;
  reading_frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | null;
  status: string;
  energy_type: "ELECTRICITY_METER" | "WATER_METER";
  AssetCode: string;
  AssetName: string;
  CompanyName: string;
  LocationAsset: string;
  reminder_enabled: number | boolean;
  reminder_lead_days: number;
  overdue_grace_days: number;
  reminder_responsible: string | null;
  calibration_interval_months: number | null;
  management_notes: string | null;
  last_locked_read_at: string | null;
  last_reading_value: string | number | null;
  next_reading_due: string | null;
  reading_reminder_state: MeterReminderState;
  calibration_next_due: string | null;
  calibration_result: "PASS" | "FAIL" | "CONDITIONAL" | null;
  calibration_state: MeterReminderState;
}

export interface MeterCalibrationAttachment {
  id: number;
  calibration_id: number;
  file_name: string;
  object_key: string;
  mime_type: string | null;
  url: string;
}

export interface MeterCalibration {
  id: number;
  meter_id: number;
  calibration_number: string;
  performed_at: string;
  next_due_date: string;
  certificate_number: string | null;
  laboratory_name: string | null;
  method_name: string | null;
  standard_reference: string | null;
  error_before_percent: string | number | null;
  error_after_percent: string | number | null;
  result: "PASS" | "FAIL" | "CONDITIONAL";
  status: MeterCalibrationStatus;
  technician_name: string | null;
  notes: string | null;
  AssetCode: string;
  AssetName: string;
  attachments: MeterCalibrationAttachment[];
}

export interface MeterMasterResponse {
  meters: MeterMasterItem[];
  calibrations: MeterCalibration[];
  options: { companies: string[] };
}

export interface MeterCalibrationInput {
  performed_at: string;
  next_due_date: string;
  certificate_number?: string;
  laboratory_name?: string;
  method_name?: string;
  standard_reference?: string;
  error_before_percent?: string;
  error_after_percent?: string;
  result: "PASS" | "FAIL" | "CONDITIONAL";
  technician_name?: string;
  notes?: string;
}

export type EnergyNcrStatus = "OPEN" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "CLOSED" | "CANCELLED";
export type EnergyNcrSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EnergyGovernanceApproval {
  source_type: string;
  source_id: number;
  reference_label: string;
  asset_code: string;
  asset_name: string;
  status: string;
  submitted_at: string;
  detail: string | null;
}

export interface EnergyGovernanceNcr {
  id: number;
  ncr_number: string;
  source_type: string;
  source_id: number | null;
  energy_profile_id: number | null;
  category: string;
  severity: EnergyNcrSeverity;
  title: string;
  description: string;
  detected_at: string;
  due_date: string | null;
  assigned_to: string | null;
  status: EnergyNcrStatus;
  root_cause: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  resolution_note: string | null;
  AssetCode: string | null;
  AssetName: string | null;
  CompanyName: string | null;
  LocationAsset: string | null;
  evidence_count: number;
  action_count: number;
}

export interface EnergyGovernanceAudit {
  id: number;
  entity_type: string;
  entity_id: number;
  event_type: string;
  event_summary: string;
  actor_name: string | null;
  event_at: string;
  ncr_number?: string | null;
  title?: string | null;
  outcome?: string;
}

export interface EnergyGovernanceResponse {
  summary: { total: number; open: number; high: number; overdue: number; approvals: number };
  approvals: EnergyGovernanceApproval[];
  ncrs: EnergyGovernanceNcr[];
  audit: EnergyGovernanceAudit[];
}

export interface EnergyNcrEvidence {
  id: number;
  document_type: string;
  standard_reference: string | null;
  revision_number: string | null;
  effective_date: string | null;
  description: string | null;
  file_name: string;
  url: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface EnergyNcrAction {
  id: number;
  action_type: string;
  from_status: string | null;
  to_status: string;
  action_note: string | null;
  acted_by: string | null;
  acted_at: string;
}

export interface EnergyNcrDetail extends EnergyGovernanceNcr {
  evidence: EnergyNcrEvidence[];
  actions: EnergyNcrAction[];
}
