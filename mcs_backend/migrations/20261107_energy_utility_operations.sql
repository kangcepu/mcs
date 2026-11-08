-- MCS Energy & Utilities - Compressor / Boiler operations.
-- Extension only: tidak mengubah tabel asset maupun tabel WO existing.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_utility_profile (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  energy_profile_id BIGINT UNSIGNED NOT NULL,
  utility_kind VARCHAR(24) NOT NULL,
  capacity_value DECIMAL(18,3) DEFAULT NULL,
  capacity_unit VARCHAR(32) DEFAULT NULL,
  rated_power_kw DECIMAL(18,3) DEFAULT NULL,
  initial_hour_meter DECIMAL(18,3) DEFAULT NULL,
  current_hour_meter DECIMAL(18,3) DEFAULT NULL,
  pressure_min_bar DECIMAL(18,3) DEFAULT NULL,
  pressure_max_bar DECIMAL(18,3) DEFAULT NULL,
  temperature_min_c DECIMAL(18,3) DEFAULT NULL,
  temperature_max_c DECIMAL(18,3) DEFAULT NULL,
  flow_min DECIMAL(18,3) DEFAULT NULL,
  flow_max DECIMAL(18,3) DEFAULT NULL,
  flow_unit VARCHAR(24) DEFAULT NULL,
  output_min DECIMAL(18,3) DEFAULT NULL,
  output_max DECIMAL(18,3) DEFAULT NULL,
  output_unit VARCHAR(24) DEFAULT NULL,
  inspection_frequency VARCHAR(24) DEFAULT 'DAILY',
  preventive_interval_hours DECIMAL(18,3) DEFAULT NULL,
  last_preventive_hour_meter DECIMAL(18,3) DEFAULT NULL,
  auto_corrective_wo TINYINT(1) NOT NULL DEFAULT 1,
  auto_preventive_wo TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_utility_profile_energy (energy_profile_id),
  KEY idx_energy_utility_profile_kind_status (utility_kind, status),
  CONSTRAINT fk_energy_utility_profile_energy
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_utility_operation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utility_profile_id BIGINT UNSIGNED NOT NULL,
  inspected_at DATETIME NOT NULL,
  started_at DATETIME DEFAULT NULL,
  ended_at DATETIME DEFAULT NULL,
  hour_meter_start DECIMAL(18,3) DEFAULT NULL,
  hour_meter_end DECIMAL(18,3) DEFAULT NULL,
  operating_hours DECIMAL(18,3) DEFAULT NULL,
  pressure_bar DECIMAL(18,3) DEFAULT NULL,
  temperature_c DECIMAL(18,3) DEFAULT NULL,
  flow_value DECIMAL(18,3) DEFAULT NULL,
  output_value DECIMAL(18,3) DEFAULT NULL,
  condition_status VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  abnormal_reasons TEXT DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  operator_name VARCHAR(120) DEFAULT NULL,
  inspection_notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  locked_by VARCHAR(120) DEFAULT NULL,
  locked_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_energy_utility_operation_time (utility_profile_id, inspected_at),
  KEY idx_energy_utility_operation_condition (condition_status, status),
  CONSTRAINT fk_energy_utility_operation_profile
    FOREIGN KEY (utility_profile_id) REFERENCES energy_utility_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_utility_work_order_link (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utility_profile_id BIGINT UNSIGNED NOT NULL,
  operation_id BIGINT UNSIGNED NOT NULL,
  trigger_type VARCHAR(24) NOT NULL,
  wo_module VARCHAR(24) NOT NULL DEFAULT 'meso',
  wo_number VARCHAR(120) NOT NULL,
  trigger_reason TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_utility_operation_trigger (operation_id, trigger_type),
  UNIQUE KEY uq_energy_utility_wo (wo_module, wo_number),
  KEY idx_energy_utility_wo_profile (utility_profile_id, trigger_type, created_at),
  CONSTRAINT fk_energy_utility_wo_profile
    FOREIGN KEY (utility_profile_id) REFERENCES energy_utility_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_utility_wo_operation
    FOREIGN KEY (operation_id) REFERENCES energy_utility_operation (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Profil Compressor/Boiler existing langsung diaktifkan untuk operasi.
INSERT INTO energy_utility_profile (
  energy_profile_id, utility_kind, status, created_by, updated_by, created_at, updated_at
)
SELECT p.id, p.energy_type, p.status, p.created_by, p.updated_by, p.created_at, p.updated_at
FROM energy_asset_profile AS p
WHERE p.energy_type IN ('COMPRESSOR', 'BOILER')
ON DUPLICATE KEY UPDATE
  utility_kind=VALUES(utility_kind),
  status=VALUES(status),
  updated_by=VALUES(updated_by),
  updated_at=NOW();
