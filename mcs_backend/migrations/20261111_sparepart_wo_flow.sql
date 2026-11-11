-- MCS Sparepart WO Flow (PRD v7 SP06-SP09).
-- Request -> reserve -> pick -> issue -> actual usage / return.
-- Extension only; Material Usage legacy tetap berjalan tanpa perubahan.
-- Aman dijalankan ulang setelah migration receiving & stock.

CREATE TABLE IF NOT EXISTS sparepart_wo_request (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(90) NOT NULL,
  wo_module VARCHAR(30) NOT NULL,
  wo_number VARCHAR(120) NOT NULL,
  asset_id INT DEFAULT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  request_note TEXT DEFAULT NULL,
  requested_by VARCHAR(120) DEFAULT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reserved_by VARCHAR(120) DEFAULT NULL,
  reserved_at DATETIME DEFAULT NULL,
  picked_by VARCHAR(120) DEFAULT NULL,
  picked_at DATETIME DEFAULT NULL,
  issued_by VARCHAR(120) DEFAULT NULL,
  issued_at DATETIME DEFAULT NULL,
  completed_by VARCHAR(120) DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  cancelled_by VARCHAR(120) DEFAULT NULL,
  cancelled_at DATETIME DEFAULT NULL,
  cancellation_reason VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_wo_request_number (request_number),
  KEY idx_sparepart_wo_request_wo (wo_module, wo_number),
  KEY idx_sparepart_wo_request_asset (asset_id, requested_at),
  KEY idx_sparepart_wo_request_status (status, requested_at),
  CONSTRAINT fk_sparepart_wo_request_asset
    FOREIGN KEY (asset_id) REFERENCES asset (AssetID)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_wo_request_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_wo_request_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  requested_qty DECIMAL(24,6) NOT NULL,
  reserved_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  picked_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  issued_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  used_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  returned_available_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  returned_hold_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  uom VARCHAR(30) NOT NULL,
  line_note VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_wo_request_part (request_id, sparepart_id),
  KEY idx_sparepart_wo_request_line_part (sparepart_id),
  CONSTRAINT fk_sparepart_wo_request_line_header
    FOREIGN KEY (request_id) REFERENCES sparepart_wo_request (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_wo_request_line_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_wo_allocation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_line_id BIGINT UNSIGNED NOT NULL,
  bin_id BIGINT UNSIGNED NOT NULL,
  lot_number VARCHAR(120) DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  reserved_qty DECIMAL(24,6) NOT NULL,
  picked_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  issued_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  returned_available_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  returned_hold_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  released_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_sparepart_wo_allocation_line (request_line_id),
  KEY idx_sparepart_wo_allocation_stock (bin_id, lot_number, expiry_date),
  CONSTRAINT fk_sparepart_wo_allocation_line
    FOREIGN KEY (request_line_id) REFERENCES sparepart_wo_request_line (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_wo_allocation_bin
    FOREIGN KEY (bin_id) REFERENCES sparepart_bin (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_wo_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  action_note VARCHAR(500) DEFAULT NULL,
  acted_by VARCHAR(120) DEFAULT NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sparepart_wo_history_request (request_id, acted_at),
  CONSTRAINT fk_sparepart_wo_history_header
    FOREIGN KEY (request_id) REFERENCES sparepart_wo_request (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_wo_allocation_serial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  allocation_id BIGINT UNSIGNED NOT NULL,
  receipt_serial_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(160) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_wo_allocation_serial (allocation_id, receipt_serial_id),
  KEY idx_sparepart_wo_serial_receipt (receipt_serial_id, status),
  CONSTRAINT fk_sparepart_wo_serial_allocation
    FOREIGN KEY (allocation_id) REFERENCES sparepart_wo_allocation (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_wo_serial_receipt
    FOREIGN KEY (receipt_serial_id) REFERENCES sparepart_receipt_serial (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
