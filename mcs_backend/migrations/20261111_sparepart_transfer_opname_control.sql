-- Sparepart Transfer, Stock Opname, dan Inventory Control (PRD v7 SP05, SP10-SP12).
-- Extension only; receiving, stock ledger, dan WO issue existing tetap digunakan.
-- Aman dijalankan ulang setelah 20261111_sparepart_wo_flow.sql.

CREATE TABLE IF NOT EXISTS sparepart_serial_location (
  receipt_serial_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  bin_id BIGINT UNSIGNED NOT NULL,
  stock_bucket VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  status VARCHAR(24) NOT NULL DEFAULT 'IN_STOCK',
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (receipt_serial_id),
  KEY idx_sparepart_serial_location_stock (sparepart_id, bin_id, stock_bucket, status),
  CONSTRAINT fk_sparepart_serial_location_serial FOREIGN KEY (receipt_serial_id) REFERENCES sparepart_receipt_serial (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_serial_location_part FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_serial_location_bin FOREIGN KEY (bin_id) REFERENCES sparepart_bin (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_transfer (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transfer_number VARCHAR(90) NOT NULL,
  from_warehouse_id BIGINT UNSIGNED NOT NULL,
  to_warehouse_id BIGINT UNSIGNED NOT NULL,
  transferred_at DATETIME NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  checked_by VARCHAR(120) DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  check_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_transfer_number (transfer_number),
  KEY idx_sparepart_transfer_status (status, transferred_at),
  CONSTRAINT fk_sparepart_transfer_from_wh FOREIGN KEY (from_warehouse_id) REFERENCES sparepart_warehouse (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_transfer_to_wh FOREIGN KEY (to_warehouse_id) REFERENCES sparepart_warehouse (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_transfer_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transfer_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  from_bin_id BIGINT UNSIGNED NOT NULL,
  to_bin_id BIGINT UNSIGNED NOT NULL,
  stock_bucket VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  lot_number VARCHAR(120) DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  quantity DECIMAL(24,6) NOT NULL,
  uom VARCHAR(30) NOT NULL,
  line_note VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_sparepart_transfer_line_header (transfer_id),
  KEY idx_sparepart_transfer_line_stock (sparepart_id, from_bin_id, stock_bucket),
  CONSTRAINT fk_sparepart_transfer_line_header FOREIGN KEY (transfer_id) REFERENCES sparepart_stock_transfer (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_transfer_line_part FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_transfer_line_from_bin FOREIGN KEY (from_bin_id) REFERENCES sparepart_bin (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_transfer_line_to_bin FOREIGN KEY (to_bin_id) REFERENCES sparepart_bin (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_transfer_serial (
  transfer_line_id BIGINT UNSIGNED NOT NULL,
  receipt_serial_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(160) NOT NULL,
  PRIMARY KEY (transfer_line_id, receipt_serial_id),
  UNIQUE KEY uq_sparepart_transfer_serial_once (receipt_serial_id, transfer_line_id),
  CONSTRAINT fk_sparepart_transfer_serial_line FOREIGN KEY (transfer_line_id) REFERENCES sparepart_stock_transfer_line (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_transfer_serial_receipt FOREIGN KEY (receipt_serial_id) REFERENCES sparepart_receipt_serial (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_opname (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opname_number VARCHAR(90) NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  counted_at DATETIME NOT NULL,
  blind_count TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'COUNTING',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  checked_by VARCHAR(120) DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  check_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_opname_number (opname_number),
  KEY idx_sparepart_opname_status (status, counted_at),
  CONSTRAINT fk_sparepart_opname_warehouse FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_opname_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opname_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  bin_id BIGINT UNSIGNED NOT NULL,
  stock_bucket VARCHAR(20) NOT NULL,
  lot_number VARCHAR(120) DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  system_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  counted_qty DECIMAL(24,6) DEFAULT NULL,
  variance_qty DECIMAL(24,6) DEFAULT NULL,
  uom VARCHAR(30) NOT NULL,
  count_note VARCHAR(500) DEFAULT NULL,
  counted_by VARCHAR(120) DEFAULT NULL,
  counted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_opname_scope (opname_id, sparepart_id, bin_id, stock_bucket, lot_number, expiry_date),
  KEY idx_sparepart_opname_line_header (opname_id),
  CONSTRAINT fk_sparepart_opname_line_header FOREIGN KEY (opname_id) REFERENCES sparepart_stock_opname (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_opname_line_part FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_opname_line_bin FOREIGN KEY (bin_id) REFERENCES sparepart_bin (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_opname_serial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opname_line_id BIGINT UNSIGNED NOT NULL,
  receipt_serial_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(160) NOT NULL,
  expected_present TINYINT(1) NOT NULL DEFAULT 0,
  counted_present TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_opname_serial_line (opname_line_id, receipt_serial_id),
  KEY idx_sparepart_opname_serial_receipt (receipt_serial_id),
  CONSTRAINT fk_sparepart_opname_serial_line FOREIGN KEY (opname_line_id) REFERENCES sparepart_stock_opname_line (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_opname_serial_receipt FOREIGN KEY (receipt_serial_id) REFERENCES sparepart_receipt_serial (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_inventory_policy (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  minimum_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  maximum_qty DECIMAL(24,6) DEFAULT NULL,
  reorder_point DECIMAL(24,6) NOT NULL DEFAULT 0,
  reorder_qty DECIMAL(24,6) DEFAULT NULL,
  lead_time_days INT UNSIGNED NOT NULL DEFAULT 0,
  slow_moving_days INT UNSIGNED NOT NULL DEFAULT 90,
  dead_stock_days INT UNSIGNED NOT NULL DEFAULT 180,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_inventory_policy (sparepart_id, warehouse_id),
  KEY idx_sparepart_inventory_policy_status (status, warehouse_id),
  CONSTRAINT fk_sparepart_inventory_policy_part FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_inventory_policy_warehouse FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_inventory_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(30) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sparepart_inventory_attachment_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_inventory_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(30) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(24) DEFAULT NULL,
  to_status VARCHAR(24) DEFAULT NULL,
  event_summary VARCHAR(255) NOT NULL,
  event_data TEXT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sparepart_inventory_audit_entity (entity_type, entity_id, event_at),
  KEY idx_sparepart_inventory_audit_time (event_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill posisi serial dari receiving agar transfer serial-aware dapat langsung dipakai.
INSERT IGNORE INTO sparepart_serial_location (receipt_serial_id, sparepart_id, bin_id, stock_bucket, status, updated_at)
SELECT s.id, s.sparepart_id, l.bin_id,
  CASE WHEN s.stock_status='HOLD' THEN 'HOLD' ELSE 'AVAILABLE' END,
  s.stock_status, NOW()
FROM sparepart_receipt_serial s
JOIN sparepart_receipt_line l ON l.id=s.receipt_line_id
WHERE s.stock_status IN ('IN_STOCK','HOLD');
