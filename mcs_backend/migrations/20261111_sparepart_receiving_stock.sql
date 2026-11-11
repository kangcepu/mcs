-- MCS Sparepart Receiving & Operational Stock (PRD v7 SP02-SP04).
-- PO hanya referensi; tidak melakukan posting ERP, valuasi, GL, atau HPP.
-- Stok baru bertambah ketika dokumen receiving dikunci.
-- Aman dijalankan ulang setelah 20261111_sparepart_foundation.sql.

CREATE TABLE IF NOT EXISTS sparepart_receipt (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_number VARCHAR(80) NOT NULL,
  po_reference VARCHAR(120) NOT NULL,
  supplier_name VARCHAR(180) DEFAULT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  received_at DATETIME NOT NULL,
  delivery_note VARCHAR(120) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
  notes TEXT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  locked_by VARCHAR(120) DEFAULT NULL,
  locked_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_receipt_number (receipt_number),
  KEY idx_sparepart_receipt_po (po_reference),
  KEY idx_sparepart_receipt_status_date (status, received_at),
  CONSTRAINT fk_sparepart_receipt_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_receipt_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  bin_id BIGINT UNSIGNED NOT NULL,
  ordered_qty DECIMAL(24,6) DEFAULT NULL,
  received_qty DECIMAL(24,6) NOT NULL,
  accepted_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  hold_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  rejected_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  uom VARCHAR(30) NOT NULL,
  qc_status VARCHAR(24) NOT NULL,
  lot_number VARCHAR(120) DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  qc_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sparepart_receipt_line_header (receipt_id),
  KEY idx_sparepart_receipt_line_part_bin (sparepart_id, bin_id),
  CONSTRAINT fk_sparepart_receipt_line_header
    FOREIGN KEY (receipt_id) REFERENCES sparepart_receipt (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_receipt_line_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_receipt_line_bin
    FOREIGN KEY (bin_id) REFERENCES sparepart_bin (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_receipt_serial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(160) NOT NULL,
  qc_status VARCHAR(24) NOT NULL,
  stock_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_serial_number (sparepart_id, serial_number),
  KEY idx_sparepart_receipt_serial_line (receipt_line_id),
  CONSTRAINT fk_sparepart_receipt_serial_line
    FOREIGN KEY (receipt_line_id) REFERENCES sparepart_receipt_line (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_receipt_serial_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movement_number VARCHAR(100) NOT NULL,
  movement_type VARCHAR(40) NOT NULL,
  stock_bucket VARCHAR(20) NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  bin_id BIGINT UNSIGNED NOT NULL,
  lot_number VARCHAR(120) DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  quantity_delta DECIMAL(24,6) NOT NULL,
  uom VARCHAR(30) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  source_line_id BIGINT UNSIGNED NOT NULL,
  reference_number VARCHAR(120) DEFAULT NULL,
  movement_at DATETIME NOT NULL,
  notes VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_ledger_movement (movement_number),
  UNIQUE KEY uq_sparepart_ledger_source_bucket (source_type, source_line_id, stock_bucket),
  KEY idx_sparepart_ledger_card (sparepart_id, warehouse_id, bin_id, movement_at),
  KEY idx_sparepart_ledger_lot (sparepart_id, lot_number, expiry_date),
  CONSTRAINT fk_sparepart_ledger_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_ledger_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_ledger_bin
    FOREIGN KEY (bin_id) REFERENCES sparepart_bin (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
