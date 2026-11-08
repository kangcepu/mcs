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
