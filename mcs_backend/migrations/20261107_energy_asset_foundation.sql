-- MCS Energy & Utility - Tahap 1: fondasi asset extension.
--
-- Migration ini hanya MENAMBAH tabel baru dan tidak mengubah tabel `asset`
-- maupun tabel WO yang sudah berjalan. Asset tetap menjadi master utama;
-- seluruh tabel energy mereferensikan asset.AssetID.
-- Aman dijalankan ulang karena semua object dibuat dengan IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS energy_asset_profile (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  energy_type VARCHAR(40) NOT NULL,
  utility_type VARCHAR(40) NOT NULL,
  profile_code VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  commissioning_date DATE DEFAULT NULL,
  ownership VARCHAR(80) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  metadata_json LONGTEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_asset_profile_asset (asset_id),
  KEY idx_energy_asset_profile_type_status (energy_type, status),
  KEY idx_energy_asset_profile_utility (utility_type),
  CONSTRAINT fk_energy_asset_profile_asset
    FOREIGN KEY (asset_id) REFERENCES asset (AssetID)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  energy_profile_id BIGINT UNSIGNED NOT NULL,
  parent_meter_id BIGINT UNSIGNED DEFAULT NULL,
  meter_number VARCHAR(120) DEFAULT NULL,
  meter_type VARCHAR(32) NOT NULL DEFAULT 'MAIN',
  unit VARCHAR(24) NOT NULL,
  multiplier DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  digit_count SMALLINT UNSIGNED DEFAULT NULL,
  rollover_value DECIMAL(24,6) DEFAULT NULL,
  reading_frequency VARCHAR(24) DEFAULT NULL,
  effective_from DATE DEFAULT NULL,
  effective_to DATE DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_meter_profile (energy_profile_id),
  KEY idx_energy_meter_number (meter_number),
  KEY idx_energy_meter_parent (parent_meter_id),
  CONSTRAINT fk_energy_meter_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_meter_parent
    FOREIGN KEY (parent_meter_id) REFERENCES energy_meter (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter_reading (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meter_id BIGINT UNSIGNED NOT NULL,
  reading_period DATE NOT NULL,
  read_at DATETIME NOT NULL,
  previous_reading DECIMAL(24,6) DEFAULT NULL,
  current_reading DECIMAL(24,6) NOT NULL,
  multiplier DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  consumption DECIMAL(24,6) DEFAULT NULL,
  reading_type VARCHAR(24) NOT NULL DEFAULT 'MEASURED',
  is_rollover TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  validated_by VARCHAR(120) DEFAULT NULL,
  validated_at DATETIME DEFAULT NULL,
  locked_by VARCHAR(120) DEFAULT NULL,
  locked_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_meter_read_at (meter_id, read_at),
  KEY idx_energy_meter_reading_period (reading_period),
  KEY idx_energy_meter_reading_status (status),
  CONSTRAINT fk_energy_meter_reading_meter
    FOREIGN KEY (meter_id) REFERENCES energy_meter (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter_reading_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reading_id BIGINT UNSIGNED NOT NULL,
  attachment_type VARCHAR(32) NOT NULL DEFAULT 'METER_PHOTO',
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_reading_attachment (reading_id, attachment_type),
  CONSTRAINT fk_energy_reading_attachment_reading
    FOREIGN KEY (reading_id) REFERENCES energy_meter_reading (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter_correction (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reading_id BIGINT UNSIGNED NOT NULL,
  requested_previous_reading DECIMAL(24,6) DEFAULT NULL,
  requested_current_reading DECIMAL(24,6) DEFAULT NULL,
  requested_multiplier DECIMAL(18,6) DEFAULT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  requested_by VARCHAR(120) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  replacement_reading_id BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_energy_meter_correction_reading (reading_id),
  KEY idx_energy_meter_correction_status (status),
  KEY idx_energy_meter_correction_replacement (replacement_reading_id),
  CONSTRAINT fk_energy_meter_correction_reading
    FOREIGN KEY (reading_id) REFERENCES energy_meter_reading (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_meter_correction_replacement
    FOREIGN KEY (replacement_reading_id) REFERENCES energy_meter_reading (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_genset_profile (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  energy_profile_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(120) DEFAULT NULL,
  rated_kva DECIMAL(18,3) DEFAULT NULL,
  rated_kw DECIMAL(18,3) DEFAULT NULL,
  fuel_type VARCHAR(40) NOT NULL DEFAULT 'DIESEL',
  tank_capacity_liter DECIMAL(18,3) DEFAULT NULL,
  initial_hour_meter DECIMAL(18,3) DEFAULT NULL,
  current_hour_meter DECIMAL(18,3) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_genset_profile (energy_profile_id),
  KEY idx_energy_genset_serial (serial_number),
  CONSTRAINT fk_energy_genset_energy_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_genset_operation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  genset_profile_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME DEFAULT NULL,
  hour_meter_start DECIMAL(18,3) DEFAULT NULL,
  hour_meter_end DECIMAL(18,3) DEFAULT NULL,
  operating_hours DECIMAL(18,3) DEFAULT NULL,
  generated_kwh DECIMAL(24,6) DEFAULT NULL,
  average_load_percent DECIMAL(8,3) DEFAULT NULL,
  fuel_consumed_liter DECIMAL(18,3) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  operator_name VARCHAR(120) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_energy_genset_operation_time (genset_profile_id, started_at),
  KEY idx_energy_genset_operation_status (status),
  CONSTRAINT fk_energy_genset_operation_profile
    FOREIGN KEY (genset_profile_id) REFERENCES energy_genset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_fuel_tank (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  energy_profile_id BIGINT UNSIGNED NOT NULL,
  tank_number VARCHAR(120) DEFAULT NULL,
  fuel_type VARCHAR(40) NOT NULL DEFAULT 'DIESEL',
  capacity_liter DECIMAL(18,3) NOT NULL,
  minimum_level_liter DECIMAL(18,3) DEFAULT NULL,
  maximum_level_liter DECIMAL(18,3) DEFAULT NULL,
  reference_balance_liter DECIMAL(18,3) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_fuel_tank_profile (energy_profile_id),
  KEY idx_energy_fuel_tank_number (tank_number),
  CONSTRAINT fk_energy_fuel_tank_energy_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_fuel_movement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fuel_tank_id BIGINT UNSIGNED NOT NULL,
  movement_type VARCHAR(32) NOT NULL,
  movement_at DATETIME NOT NULL,
  quantity_liter DECIMAL(18,3) NOT NULL,
  destination_type VARCHAR(32) DEFAULT NULL,
  destination_asset_id INT DEFAULT NULL,
  destination_tank_id BIGINT UNSIGNED DEFAULT NULL,
  reference_number VARCHAR(120) DEFAULT NULL,
  meter_before DECIMAL(18,3) DEFAULT NULL,
  meter_after DECIMAL(18,3) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_energy_fuel_movement_time (fuel_tank_id, movement_at),
  KEY idx_energy_fuel_movement_status (status),
  KEY idx_energy_fuel_destination_asset (destination_asset_id),
  KEY idx_energy_fuel_destination_tank (destination_tank_id),
  CONSTRAINT fk_energy_fuel_movement_tank
    FOREIGN KEY (fuel_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_fuel_movement_destination_asset
    FOREIGN KEY (destination_asset_id) REFERENCES asset (AssetID)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_fuel_movement_destination_tank
    FOREIGN KEY (destination_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
