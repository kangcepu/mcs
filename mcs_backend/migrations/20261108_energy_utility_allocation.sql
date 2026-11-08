-- Utility Allocation per department / cost center.
-- MCS menyimpan kuantitas dan biaya referensi; tidak melakukan posting ERP/GL.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_utility_allocation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  allocation_number VARCHAR(80) NOT NULL,
  energy_profile_id BIGINT UNSIGNED NOT NULL,
  source_energy_type VARCHAR(40) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  allocation_basis VARCHAR(32) NOT NULL,
  source_quantity DECIMAL(24,6) NOT NULL DEFAULT 0,
  source_sample_count INT NOT NULL DEFAULT 0,
  unit VARCHAR(40) NOT NULL,
  reference_rate DECIMAL(24,6) DEFAULT NULL,
  currency_code VARCHAR(12) NOT NULL DEFAULT 'IDR',
  tariff_source VARCHAR(40) DEFAULT NULL,
  tariff_reference VARCHAR(180) DEFAULT NULL,
  tariff_as_of DATE DEFAULT NULL,
  total_reference_cost DECIMAL(24,6) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_utility_allocation_number (allocation_number),
  UNIQUE KEY uq_energy_utility_allocation_period (energy_profile_id, period_start, period_end),
  KEY idx_energy_utility_allocation_status_period (status, period_start, period_end),
  CONSTRAINT fk_energy_utility_allocation_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_utility_allocation_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  allocation_id BIGINT UNSIGNED NOT NULL,
  id_division INT NOT NULL,
  department_code VARCHAR(255) DEFAULT NULL,
  department_name VARCHAR(120) NOT NULL,
  cost_center_code VARCHAR(80) NOT NULL,
  cost_center_name VARCHAR(180) DEFAULT NULL,
  allocation_type VARCHAR(20) NOT NULL,
  sub_meter_profile_id BIGINT UNSIGNED DEFAULT NULL,
  driver_value DECIMAL(24,6) DEFAULT NULL,
  measured_quantity DECIMAL(24,6) DEFAULT NULL,
  allocated_quantity DECIMAL(24,6) NOT NULL DEFAULT 0,
  allocation_percent DECIMAL(12,6) NOT NULL DEFAULT 0,
  reference_cost DECIMAL(24,6) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_utility_allocation_cost_center (allocation_id, cost_center_code),
  KEY idx_energy_utility_allocation_line_division (id_division, cost_center_code),
  KEY idx_energy_utility_allocation_line_submeter (sub_meter_profile_id),
  CONSTRAINT fk_energy_utility_allocation_line_header
    FOREIGN KEY (allocation_id) REFERENCES energy_utility_allocation (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_energy_utility_allocation_line_submeter
    FOREIGN KEY (sub_meter_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_utility_allocation_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  allocation_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  from_status VARCHAR(24) DEFAULT NULL,
  to_status VARCHAR(24) NOT NULL,
  action_note TEXT DEFAULT NULL,
  acted_by VARCHAR(120) DEFAULT NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_utility_allocation_history (allocation_id, acted_at),
  CONSTRAINT fk_energy_utility_allocation_history_header
    FOREIGN KEY (allocation_id) REFERENCES energy_utility_allocation (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
