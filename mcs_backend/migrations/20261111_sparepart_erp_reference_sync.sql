-- Sparepart ERP Reference Sync (PRD v7 SP01-F01 / BR-017).
-- ERP tetap read-only dan menjadi sumber Item/UOM/saldo referensi.
-- Migration ini tidak membuat posting stok, GL, HPP, receipt, atau adjustment ke ERP.
-- Aman dijalankan ulang setelah 20261111_sparepart_foundation.sql.

CREATE TABLE IF NOT EXISTS sparepart_erp_snapshot (
  mapping_id BIGINT UNSIGNED NOT NULL,
  erp_item_id BIGINT NOT NULL,
  balance_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  category_name VARCHAR(180) DEFAULT NULL,
  brand_name VARCHAR(120) DEFAULT NULL,
  is_serialized TINYINT(1) NOT NULL DEFAULT 0,
  has_expiry TINYINT(1) NOT NULL DEFAULT 0,
  minimum_qty DECIMAL(24,6) DEFAULT NULL,
  maximum_qty DECIMAL(24,6) DEFAULT NULL,
  reorder_point DECIMAL(24,6) DEFAULT NULL,
  lead_time_days INT DEFAULT NULL,
  source_updated_at DATETIME DEFAULT NULL,
  last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_id),
  KEY idx_sparepart_erp_snapshot_item (erp_item_id, last_synced_at),
  CONSTRAINT fk_sparepart_erp_snapshot_mapping
    FOREIGN KEY (mapping_id) REFERENCES sparepart_erp_mapping (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_erp_sync_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sync_number VARCHAR(90) NOT NULL,
  company_code VARCHAR(20) NOT NULL,
  sync_type VARCHAR(24) NOT NULL DEFAULT 'SELECTED_ITEMS',
  requested_count INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  result_detail TEXT DEFAULT NULL,
  synced_by VARCHAR(120) DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_erp_sync_number (sync_number),
  KEY idx_sparepart_erp_sync_company_time (company_code, synced_at),
  KEY idx_sparepart_erp_sync_status (status, synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
