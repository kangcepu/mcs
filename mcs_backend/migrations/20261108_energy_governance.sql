-- Energy Governance: NCR, evidence SOP/ISO, action history, dan audit timeline.
-- Approval queue membaca transaksi Energy existing dan tidak menduplikasi statusnya.
-- Aman dijalankan ulang; tidak mengubah tabel Asset/WO/transaksi Energy existing.

CREATE TABLE IF NOT EXISTS energy_governance_ncr (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_number VARCHAR(80) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id BIGINT UNSIGNED DEFAULT NULL,
  source_key VARCHAR(160) NOT NULL,
  energy_profile_id BIGINT UNSIGNED DEFAULT NULL,
  category VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  detected_at DATETIME NOT NULL,
  due_date DATE DEFAULT NULL,
  assigned_to VARCHAR(120) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  root_cause TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  preventive_action TEXT DEFAULT NULL,
  resolution_note TEXT DEFAULT NULL,
  verified_by VARCHAR(120) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  closed_by VARCHAR(120) DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_governance_ncr_number (ncr_number),
  UNIQUE KEY uq_energy_governance_ncr_source (source_key),
  KEY idx_energy_governance_ncr_status (status, severity, due_date),
  KEY idx_energy_governance_ncr_profile (energy_profile_id, detected_at),
  CONSTRAINT fk_energy_governance_ncr_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_governance_ncr_action (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  action_note TEXT DEFAULT NULL,
  acted_by VARCHAR(120) DEFAULT NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_governance_ncr_action (ncr_id, acted_at),
  CONSTRAINT fk_energy_governance_ncr_action_header
    FOREIGN KEY (ncr_id) REFERENCES energy_governance_ncr (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_governance_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(30) NOT NULL,
  standard_reference VARCHAR(180) DEFAULT NULL,
  revision_number VARCHAR(60) DEFAULT NULL,
  effective_date DATE DEFAULT NULL,
  description VARCHAR(500) DEFAULT NULL,
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_governance_evidence_ncr (ncr_id, document_type),
  CONSTRAINT fk_energy_governance_evidence_ncr
    FOREIGN KEY (ncr_id) REFERENCES energy_governance_ncr (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS energy_governance_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_summary VARCHAR(255) NOT NULL,
  event_data TEXT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_energy_governance_audit_entity (entity_type, entity_id, event_at),
  KEY idx_energy_governance_audit_time (event_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
