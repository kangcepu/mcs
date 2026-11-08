-- Meter Master lanjutan: reminder reading dan histori kalibrasi.
-- Extension only; tabel meter dan reading existing tidak diubah.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_meter_management (
  meter_id BIGINT UNSIGNED NOT NULL,
  reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
  reminder_lead_days SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  overdue_grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reminder_responsible VARCHAR(120) DEFAULT NULL,
  calibration_interval_months SMALLINT UNSIGNED DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (meter_id),
  CONSTRAINT fk_energy_meter_management_meter
    FOREIGN KEY (meter_id) REFERENCES energy_meter (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter_calibration (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meter_id BIGINT UNSIGNED NOT NULL,
  calibration_number VARCHAR(80) NOT NULL,
  performed_at DATETIME NOT NULL,
  next_due_date DATE NOT NULL,
  certificate_number VARCHAR(120) DEFAULT NULL,
  laboratory_name VARCHAR(180) DEFAULT NULL,
  method_name VARCHAR(180) DEFAULT NULL,
  standard_reference VARCHAR(180) DEFAULT NULL,
  error_before_percent DECIMAL(12,6) DEFAULT NULL,
  error_after_percent DECIMAL(12,6) DEFAULT NULL,
  result VARCHAR(20) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  technician_name VARCHAR(120) DEFAULT NULL,
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
  UNIQUE KEY uq_energy_meter_calibration_number (calibration_number),
  UNIQUE KEY uq_energy_meter_calibration_time (meter_id, performed_at),
  KEY idx_energy_meter_calibration_due (status, next_due_date),
  CONSTRAINT fk_energy_meter_calibration_meter
    FOREIGN KEY (meter_id) REFERENCES energy_meter (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_meter_calibration_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calibration_id BIGINT UNSIGNED NOT NULL,
  attachment_type VARCHAR(32) NOT NULL DEFAULT 'CERTIFICATE',
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_meter_calibration_attachment (calibration_id, attachment_type),
  CONSTRAINT fk_energy_meter_calibration_attachment_header
    FOREIGN KEY (calibration_id) REFERENCES energy_meter_calibration (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
