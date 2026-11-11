-- Deteksi NCR salah issue/reversal dan workflow recount Stock Opname.
-- Extension only; adjustment stok tetap hanya terjadi setelah approval checker.
-- Aman dijalankan ulang setelah migration Sparepart Governance dan Inventory Control.

CREATE TABLE IF NOT EXISTS sparepart_stock_opname_recount (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opname_id BIGINT UNSIGNED NOT NULL,
  recount_no INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  reason VARCHAR(1000) NOT NULL,
  requested_by VARCHAR(120) DEFAULT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note VARCHAR(1000) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_opname_recount_no (opname_id,recount_no),
  KEY idx_sparepart_opname_recount_status (status,requested_at),
  CONSTRAINT fk_sparepart_opname_recount_header
    FOREIGN KEY (opname_id) REFERENCES sparepart_stock_opname(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_stock_opname_recount_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recount_id BIGINT UNSIGNED NOT NULL,
  opname_line_id BIGINT UNSIGNED NOT NULL,
  system_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  previous_counted_qty DECIMAL(24,6) DEFAULT NULL,
  previous_variance_qty DECIMAL(24,6) DEFAULT NULL,
  recounted_qty DECIMAL(24,6) DEFAULT NULL,
  recount_variance_qty DECIMAL(24,6) DEFAULT NULL,
  recount_note VARCHAR(500) DEFAULT NULL,
  counted_by VARCHAR(120) DEFAULT NULL,
  counted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_opname_recount_line (recount_id,opname_line_id),
  CONSTRAINT fk_sparepart_opname_recount_line_header
    FOREIGN KEY (recount_id) REFERENCES sparepart_stock_opname_recount(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_opname_recount_line_opname
    FOREIGN KEY (opname_line_id) REFERENCES sparepart_stock_opname_line(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
