export interface FleetProfile {
  id: number;
  asset_id: number;
  AssetCode: string;
  AssetName: string;
  LocationAsset?: string | null;
  CompanyName?: string | null;
  vehicle_type: "VEHICLE" | "FORKLIFT";
  registration_number?: string | null;
  make?: string | null;
  model?: string | null;
  meter_type: "ODOMETER" | "HOUR_METER";
  current_meter: number;
  inspection_due: boolean;
  preventive_due: boolean;
  status: string;
}

export interface FleetInspection {
  id: number;
  inspection_number: string;
  AssetCode: string;
  AssetName: string;
  inspected_at: string;
  operator_name: string;
  meter_value: number;
  overall_condition: string;
  unsafe_to_operate: number;
  status: string;
}

export interface FleetFuelTransaction {
  id: number;
  transaction_number: string;
  AssetCode: string;
  AssetName: string;
  fueled_at: string;
  quantity_liter: number;
  efficiency_value?: number | null;
  meter_type: string;
  status: string;
  anomaly_status: string;
}

export interface FleetService {
  id: number;
  service_number: string;
  AssetCode: string;
  AssetName: string;
  service_type: string;
  started_at: string;
  completed_at?: string | null;
  meter_value: number;
  wo_number?: string | null;
  status: string;
}

export interface FleetAnomaly {
  id: number;
  anomaly_number: string;
  AssetCode: string;
  AssetName: string;
  anomaly_type: string;
  severity: string;
  detected_at: string;
  description: string;
  status: string;
}

export interface FleetFuelTank {
  id: number;
  AssetCode: string;
  AssetName: string;
  tank_number?: string | null;
  reference_balance_liter: number;
}

export interface FleetOverview {
  profiles: FleetProfile[];
  inspections: FleetInspection[];
  fuel_transactions: FleetFuelTransaction[];
  services: FleetService[];
  anomalies: FleetAnomaly[];
  fuel_tanks: FleetFuelTank[];
  stats: {
    total: number;
    inspection_due: number;
    preventive_due: number;
    open_anomalies: number;
    pending_approvals: number;
  };
}

export interface FleetReminder {
  id: number;
  vehicle_id: number;
  AssetCode: string;
  AssetName: string;
  meter_type: string;
  trigger_type: "DATE" | "METER";
  due_date?: string | null;
  due_meter?: number | null;
  current_meter?: number | null;
  status: string;
  wo_number?: string | null;
}

export interface FleetEfficiencyRow {
  id: number;
  AssetCode: string;
  AssetName: string;
  vehicle_type: string;
  meter_type: string;
  transaction_count: number;
  fuel_liter: number;
  distance_or_hours: number;
  avg_efficiency: number;
  fuel_efficiency_target?: number | null;
  fuel_efficiency_minimum?: number | null;
}

export interface FleetReconciliation {
  id?: number;
  reconciliation_number?: string;
  fuel_tank_id: number;
  tank_number?: string | null;
  AssetCode: string;
  AssetName: string;
  period_start?: string;
  period_end?: string;
  fleet_transaction_liter: number;
  tank_movement_liter: number;
  variance_liter: number;
  unmatched_transaction_count: number;
  orphan_movement_count: number;
  status?: string;
}

export interface FleetAuditItem {
  id: number;
  vehicle_id?: number | null;
  AssetCode?: string | null;
  AssetName?: string | null;
  entity_type: string;
  entity_id: number;
  event_type: string;
  event_summary: string;
  actor_name?: string | null;
  event_at: string;
}

export interface FleetDashboard {
  filters: { date_from: string; date_to: string };
  summary: {
    active_fleet: number;
    preventive_due: number;
    unsafe_count: number;
    open_anomalies: number;
    fuel_liter: number;
    avg_efficiency: number;
  };
  trend: Array<{ period_date: string; transaction_count: number; fuel_liter: number; avg_efficiency: number; distance_or_hours: number }>;
  efficiency: FleetEfficiencyRow[];
  reminders: FleetReminder[];
  unsafe: Array<{ id: number; inspection_number: string; inspected_at: string; AssetCode: string; AssetName: string; wo_number?: string | null }>;
  reconciliations: FleetReconciliation[];
}

export interface FleetAttachment {
  id: number;
  entity_type: string;
  entity_id: number;
  file_name: string;
  url: string;
  mime_type?: string | null;
  created_at: string;
}
