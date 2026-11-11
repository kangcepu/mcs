-- Integrasi read-only PO ERP dan jejak refresh saldo sebelum rekonsiliasi.
-- Tidak melakukan posting receipt, stok, GL, HPP, atau valuasi ke ERP.
-- Aman dijalankan ulang setelah migration Sparepart Governance.

CREATE TABLE IF NOT EXISTS sparepart_receipt_erp_reference (
  receipt_id BIGINT UNSIGNED NOT NULL,
  company_code VARCHAR(20) NOT NULL,
  erp_po_id BIGINT NOT NULL,
  erp_po_number VARCHAR(120) NOT NULL,
  pulled_by VARCHAR(120) DEFAULT NULL,
  pulled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (receipt_id),
  KEY idx_sparepart_receipt_erp_po (company_code, erp_po_id),
  CONSTRAINT fk_sparepart_receipt_erp_reference_receipt
    FOREIGN KEY (receipt_id) REFERENCES sparepart_receipt (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_erp_balance_refresh_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  refresh_number VARCHAR(90) NOT NULL,
  company_code VARCHAR(20) NOT NULL,
  trigger_type VARCHAR(30) NOT NULL DEFAULT 'RECONCILIATION',
  requested_count INT NOT NULL DEFAULT 0,
  refreshed_count INT NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  result_detail TEXT DEFAULT NULL,
  refreshed_by VARCHAR(120) DEFAULT NULL,
  refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_erp_balance_refresh_number (refresh_number),
  KEY idx_sparepart_erp_balance_refresh_company (company_code, refreshed_at),
  KEY idx_sparepart_erp_balance_refresh_status (status, refreshed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
