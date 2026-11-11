-- MCS Fleet Enhancement: dashboard, preventive reminder, WO link, audit, dan rekonsiliasi fuel.
-- Extension only; tabel FL01-FL08 existing tetap menjadi sumber transaksi utama.
-- Aman dijalankan ulang setelah 20261108_fleet_vehicle_foundation.sql.

CREATE TABLE IF NOT EXISTS fleet_preventive_reminder (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  reminder_key VARCHAR(180) NOT NULL,
  trigger_type VARCHAR(30) NOT NULL,
  due_date DATE DEFAULT NULL,
  due_meter DECIMAL(18,3) DEFAULT NULL,
  current_meter DECIMAL(18,3) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  note VARCHAR(500) DEFAULT NULL,
  acknowledged_by VARCHAR(120) DEFAULT NULL,
  acknowledged_at DATETIME DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_preventive_reminder_key (reminder_key),
  KEY idx_fleet_preventive_reminder_status (status, due_date),
  KEY idx_fleet_preventive_reminder_vehicle (vehicle_id, created_at),
  CONSTRAINT fk_fleet_preventive_reminder_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_work_order_link (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  wo_module VARCHAR(30) NOT NULL DEFAULT 'MESO',
  wo_number VARCHAR(120) NOT NULL,
  link_type VARCHAR(24) NOT NULL DEFAULT 'AUTO_CREATED',
  link_note VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_work_order_source (source_type, source_id),
  UNIQUE KEY uq_fleet_work_order_number (wo_module, wo_number),
  KEY idx_fleet_work_order_vehicle (vehicle_id, created_at),
  CONSTRAINT fk_fleet_work_order_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_audit_timeline (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id BIGINT UNSIGNED DEFAULT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_summary VARCHAR(255) NOT NULL,
  event_data TEXT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fleet_audit_vehicle (vehicle_id, event_at),
  KEY idx_fleet_audit_entity (entity_type, entity_id, event_at),
  CONSTRAINT fk_fleet_audit_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicle_profile (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fleet_fuel_reconciliation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_number VARCHAR(90) NOT NULL,
  fuel_tank_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  fleet_transaction_liter DECIMAL(24,6) NOT NULL DEFAULT 0,
  tank_movement_liter DECIMAL(24,6) NOT NULL DEFAULT 0,
  variance_liter DECIMAL(24,6) NOT NULL DEFAULT 0,
  unmatched_transaction_count INT NOT NULL DEFAULT 0,
  orphan_movement_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fleet_fuel_reconciliation_number (reconciliation_number),
  UNIQUE KEY uq_fleet_fuel_reconciliation_period (fuel_tank_id, period_start, period_end),
  KEY idx_fleet_fuel_reconciliation_status (status, period_end),
  CONSTRAINT fk_fleet_fuel_reconciliation_tank
    FOREIGN KEY (fuel_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
