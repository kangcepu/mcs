-- MCS Energy & Utilities - Fuel Tank Stock Opname & physical reconciliation.
-- Extension only: tidak mengubah struktur asset atau fuel movement existing.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_fuel_stock_opname (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fuel_tank_id BIGINT UNSIGNED NOT NULL,
  opname_number VARCHAR(120) NOT NULL,
  opname_at DATETIME NOT NULL,
  system_balance_liter DECIMAL(18,3) NOT NULL,
  physical_balance_liter DECIMAL(18,3) NOT NULL,
  variance_liter DECIMAL(18,3) NOT NULL,
  variance_percent DECIMAL(12,6) DEFAULT NULL,
  tolerance_liter DECIMAL(18,3) NOT NULL DEFAULT 0,
  measurement_method VARCHAR(32) NOT NULL DEFAULT 'DIP_STICK',
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  measured_by VARCHAR(120) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  adjustment_movement_id BIGINT UNSIGNED DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_fuel_opname_number (opname_number),
  UNIQUE KEY uq_energy_fuel_opname_tank_time (fuel_tank_id, opname_at),
  KEY idx_energy_fuel_opname_status_time (status, opname_at),
  KEY idx_energy_fuel_opname_adjustment (adjustment_movement_id),
  CONSTRAINT fk_energy_fuel_opname_tank
    FOREIGN KEY (fuel_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_fuel_opname_adjustment
    FOREIGN KEY (adjustment_movement_id) REFERENCES energy_fuel_movement (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_fuel_stock_opname_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opname_id BIGINT UNSIGNED NOT NULL,
  attachment_type VARCHAR(32) NOT NULL DEFAULT 'PHYSICAL_EVIDENCE',
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_fuel_opname_attachment (opname_id, attachment_type),
  CONSTRAINT fk_energy_fuel_opname_attachment_opname
    FOREIGN KEY (opname_id) REFERENCES energy_fuel_stock_opname (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
