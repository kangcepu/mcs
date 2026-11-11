-- Sparepart Governance dan External Report Center.
-- ERP/reporting bersifat read-only; tidak membuat posting GL, HPP, atau valuasi.
-- Aman dijalankan ulang setelah migration Sparepart ERP Reference Sync.

CREATE TABLE IF NOT EXISTS sparepart_governance_ncr (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_number VARCHAR(90) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED DEFAULT NULL,
  source_key VARCHAR(160) NOT NULL,
  category VARCHAR(30) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  assigned_to VARCHAR(120) DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  root_cause TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  preventive_action TEXT DEFAULT NULL,
  resolution_note TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  verified_by VARCHAR(120) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_governance_ncr_number (ncr_number),
  UNIQUE KEY uq_sparepart_governance_ncr_source (source_key),
  KEY idx_sparepart_governance_ncr_status (status,severity,due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_governance_ncr_action (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  action_note TEXT DEFAULT NULL,
  acted_by VARCHAR(120) DEFAULT NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sparepart_governance_ncr_action (ncr_id,acted_at),
  CONSTRAINT fk_sparepart_governance_ncr_action FOREIGN KEY (ncr_id) REFERENCES sparepart_governance_ncr(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_erp_reconciliation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_number VARCHAR(90) NOT NULL,
  company_code VARCHAR(20) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  item_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_erp_reconciliation_number (reconciliation_number),
  KEY idx_sparepart_erp_reconciliation_status (company_code,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_erp_reconciliation_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_id BIGINT UNSIGNED NOT NULL,
  mapping_id BIGINT UNSIGNED NOT NULL,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  erp_item_code VARCHAR(120) NOT NULL,
  erp_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  mcs_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  variance_qty DECIMAL(24,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_reconciliation_mapping (reconciliation_id,mapping_id),
  CONSTRAINT fk_sparepart_reconciliation_line_header FOREIGN KEY (reconciliation_id) REFERENCES sparepart_erp_reconciliation(id) ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_reconciliation_line_mapping FOREIGN KEY (mapping_id) REFERENCES sparepart_erp_mapping(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sparepart_reconciliation_line_part FOREIGN KEY (sparepart_id) REFERENCES sparepart_master(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS external_report_endpoint (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  endpoint_name VARCHAR(120) NOT NULL,
  catalog_url VARCHAR(1000) NOT NULL,
  auth_header_name VARCHAR(120) DEFAULT NULL,
  auth_header_value VARCHAR(1000) DEFAULT NULL,
  timeout_seconds INT NOT NULL DEFAULT 30,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_report_endpoint_name (endpoint_name),
  KEY idx_external_report_endpoint_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
