-- Fleet & Vehicle FL01-FL08.
-- Extension Asset existing; tidak mengubah tabel asset/WO dan tidak melakukan posting ERP.
-- Memakai energy_fuel_tank sebagai sumber solar bila dipilih. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS fleet_vehicle_profile (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  vehicle_type VARCHAR(24) NOT NULL,
  registration_number VARCHAR(60) DEFAULT NULL,
  chassis_number VARCHAR(120) DEFAULT NULL,
  engine_number VARCHAR(120) DEFAULT NULL,
  make VARCHAR(100) DEFAULT NULL,
  model VARCHAR(100) DEFAULT NULL,
  manufacture_year SMALLINT UNSIGNED DEFAULT NULL,
  fuel_type VARCHAR(30) NOT NULL DEFAULT 'DIESEL',
  tank_capacity_liter DECIMAL(18,3) DEFAULT NULL,
  meter_type VARCHAR(24) NOT NULL,
  current_meter DECIMAL(18,3) NOT NULL DEFAULT 0,
  custodian_name VARCHAR(120) DEFAULT NULL,
  department_name VARCHAR(120) DEFAULT NULL,
  cost_center_code VARCHAR(80) DEFAULT NULL,
  inspection_frequency VARCHAR(24) NOT NULL DEFAULT 'DAILY',
  preventive_interval_days INT UNSIGNED DEFAULT NULL,
  preventive_interval_meter DECIMAL(18,3) DEFAULT NULL,
  fuel_efficiency_target DECIMAL(18,6) DEFAULT NULL,
  fuel_efficiency_minimum DECIMAL(18,6) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_vehicle_asset (asset_id),
  UNIQUE KEY uq_fleet_vehicle_registration (registration_number),
  KEY idx_fleet_vehicle_type_status (vehicle_type, status),
  CONSTRAINT fk_fleet_vehicle_asset FOREIGN KEY (asset_id) REFERENCES asset (AssetID)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_meter_reading (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  reading_at DATETIME NOT NULL,
  meter_type VARCHAR(24) NOT NULL,
  previous_value DECIMAL(18,3) NOT NULL,
  current_value DECIMAL(18,3) NOT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  source_id BIGINT UNSIGNED DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'LOCKED',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_meter_time (vehicle_id, reading_at, meter_type),
  KEY idx_fleet_meter_vehicle (vehicle_id, reading_at),
  CONSTRAINT fk_fleet_meter_vehicle FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_daily_inspection (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_number VARCHAR(80) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  inspected_at DATETIME NOT NULL,
  shift VARCHAR(30) DEFAULT NULL,
  operator_name VARCHAR(120) NOT NULL,
  meter_value DECIMAL(18,3) NOT NULL,
  overall_condition VARCHAR(24) NOT NULL DEFAULT 'PASS',
  unsafe_to_operate TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_inspection_number (inspection_number),
  UNIQUE KEY uq_fleet_inspection_vehicle_time (vehicle_id, inspected_at),
  KEY idx_fleet_inspection_status (status, overall_condition, inspected_at),
  CONSTRAINT fk_fleet_inspection_vehicle FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_daily_inspection_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(60) NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  result VARCHAR(20) NOT NULL,
  finding TEXT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_inspection_item (inspection_id, item_code),
  CONSTRAINT fk_fleet_inspection_item_header FOREIGN KEY (inspection_id) REFERENCES fleet_daily_inspection (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_fuel_transaction (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_number VARCHAR(80) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  fuel_tank_id BIGINT UNSIGNED DEFAULT NULL,
  fuel_movement_id BIGINT UNSIGNED DEFAULT NULL,
  fueled_at DATETIME NOT NULL,
  quantity_liter DECIMAL(18,3) NOT NULL,
  meter_before DECIMAL(18,3) NOT NULL,
  meter_after DECIMAL(18,3) NOT NULL,
  distance_or_hours DECIMAL(18,3) NOT NULL DEFAULT 0,
  efficiency_value DECIMAL(18,6) DEFAULT NULL,
  full_tank TINYINT(1) NOT NULL DEFAULT 0,
  reference_number VARCHAR(120) DEFAULT NULL,
  operator_name VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  anomaly_status VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_fuel_number (transaction_number),
  UNIQUE KEY uq_fleet_fuel_movement (fuel_movement_id),
  KEY idx_fleet_fuel_status_time (status, fueled_at),
  KEY idx_fleet_fuel_vehicle (vehicle_id, fueled_at),
  CONSTRAINT fk_fleet_fuel_vehicle FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_fleet_fuel_tank FOREIGN KEY (fuel_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_fleet_fuel_movement FOREIGN KEY (fuel_movement_id) REFERENCES energy_fuel_movement (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_service_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_number VARCHAR(80) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  service_type VARCHAR(24) NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME DEFAULT NULL,
  meter_value DECIMAL(18,3) NOT NULL,
  workshop_name VARCHAR(180) DEFAULT NULL,
  complaint TEXT DEFAULT NULL,
  work_performed TEXT DEFAULT NULL,
  parts_summary TEXT DEFAULT NULL,
  reference_cost DECIMAL(24,2) DEFAULT NULL,
  wo_module VARCHAR(30) DEFAULT NULL,
  wo_number VARCHAR(120) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_service_number (service_number),
  UNIQUE KEY uq_fleet_service_wo (wo_module, wo_number),
  KEY idx_fleet_service_vehicle (vehicle_id, started_at),
  CONSTRAINT fk_fleet_service_vehicle FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_anomaly (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  anomaly_number VARCHAR(80) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  anomaly_type VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  detected_at DATETIME NOT NULL,
  expected_value DECIMAL(18,6) DEFAULT NULL,
  actual_value DECIMAL(18,6) DEFAULT NULL,
  description TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  assigned_to VARCHAR(120) DEFAULT NULL,
  resolution_note TEXT DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_anomaly_number (anomaly_number),
  UNIQUE KEY uq_fleet_anomaly_source (source_type, source_id, anomaly_type),
  KEY idx_fleet_anomaly_status (status, severity, detected_at),
  CONSTRAINT fk_fleet_anomaly_vehicle FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  attachment_type VARCHAR(40) NOT NULL DEFAULT 'EVIDENCE',
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fleet_attachment_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
