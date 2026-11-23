-- MCS Validation Engine & My Work Queue Foundation.
-- Mengikuti MCS-VALIDATION-MASTER-v1.0: maker, checker, approver, evidence,
-- delegation dan audit dipisahkan. Migration ini hanya fondasi + rule awal;
-- belum mengubah status transaksi existing sampai adapter per modul dipasang.
-- Aman dijalankan ulang setelah migration fondasi user dan preventive NCR.

CREATE TABLE IF NOT EXISTS validation_rule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_code VARCHAR(100) NOT NULL,
  module_code VARCHAR(30) NOT NULL,
  feature_code VARCHAR(80) NOT NULL,
  action_code VARCHAR(80) NOT NULL,
  rule_name VARCHAR(220) NOT NULL,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  requires_checker TINYINT(1) NOT NULL DEFAULT 1,
  requires_approver TINYINT(1) NOT NULL DEFAULT 1,
  requires_evidence TINYINT(1) NOT NULL DEFAULT 1,
  prevent_self_check TINYINT(1) NOT NULL DEFAULT 1,
  prevent_self_approve TINYINT(1) NOT NULL DEFAULT 1,
  sla_hours INT UNSIGNED DEFAULT NULL,
  rule_config TEXT DEFAULT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_until DATETIME DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_rule_code_version (rule_code,version_no),
  KEY idx_validation_rule_lookup (module_code,feature_code,action_code,status),
  KEY idx_validation_rule_effective (status,effective_from,effective_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_scope (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id BIGINT UNSIGNED NOT NULL,
  company_id VARCHAR(80) DEFAULT NULL,
  site_id VARCHAR(80) DEFAULT NULL,
  department_id VARCHAR(80) DEFAULT NULL,
  division_id VARCHAR(80) DEFAULT NULL,
  asset_category VARCHAR(180) DEFAULT NULL,
  asset_id INT DEFAULT NULL,
  domain_code VARCHAR(50) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_scope_rule (rule_id,status),
  KEY idx_validation_scope_org (company_id,site_id,department_id,division_id),
  CONSTRAINT fk_validation_scope_rule FOREIGN KEY (rule_id) REFERENCES validation_rule(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_delegation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  delegation_code VARCHAR(90) NOT NULL,
  delegator_user_id INT DEFAULT NULL,
  delegate_user_id INT NOT NULL,
  actor_type VARCHAR(30) NOT NULL,
  module_code VARCHAR(30) DEFAULT NULL,
  permission_code VARCHAR(100) DEFAULT NULL,
  company_id VARCHAR(80) DEFAULT NULL,
  site_id VARCHAR(80) DEFAULT NULL,
  department_id VARCHAR(80) DEFAULT NULL,
  reason VARCHAR(500) NOT NULL,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  approved_by_user_id INT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_delegation_code (delegation_code),
  KEY idx_validation_delegation_actor (delegate_user_id,actor_type,status,valid_from,valid_until),
  KEY idx_validation_delegation_scope (module_code,company_id,site_id,department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_assignment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id BIGINT UNSIGNED NOT NULL,
  scope_id BIGINT UNSIGNED DEFAULT NULL,
  actor_type VARCHAR(30) NOT NULL,
  user_id INT DEFAULT NULL,
  permission_code VARCHAR(100) DEFAULT NULL,
  position_code VARCHAR(100) DEFAULT NULL,
  delegation_id BIGINT UNSIGNED DEFAULT NULL,
  priority_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until DATETIME DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_validation_assignment_user (user_id,actor_type,status,valid_from,valid_until),
  KEY idx_validation_assignment_rule (rule_id,scope_id,actor_type,status),
  CONSTRAINT fk_validation_assignment_rule FOREIGN KEY (rule_id) REFERENCES validation_rule(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_validation_assignment_scope FOREIGN KEY (scope_id) REFERENCES validation_scope(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_validation_assignment_delegation FOREIGN KEY (delegation_id) REFERENCES validation_delegation(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_request (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(100) NOT NULL,
  rule_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  source_reference VARCHAR(160) NOT NULL,
  source_route VARCHAR(500) DEFAULT NULL,
  source_status VARCHAR(50) DEFAULT NULL,
  target_status VARCHAR(50) DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description VARCHAR(1000) DEFAULT NULL,
  module_code VARCHAR(30) NOT NULL,
  domain_code VARCHAR(50) DEFAULT NULL,
  company_id VARCHAR(80) DEFAULT NULL,
  site_id VARCHAR(80) DEFAULT NULL,
  department_id VARCHAR(80) DEFAULT NULL,
  division_id VARCHAR(80) DEFAULT NULL,
  asset_id INT DEFAULT NULL,
  asset_code VARCHAR(120) DEFAULT NULL,
  maker_user_id INT NOT NULL,
  checker_user_id INT DEFAULT NULL,
  approver_user_id INT DEFAULT NULL,
  close_reviewer_user_id INT DEFAULT NULL,
  state VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  return_reason VARCHAR(1000) DEFAULT NULL,
  payload_snapshot LONGTEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_request_number (request_number),
  UNIQUE KEY uq_validation_request_source_action (rule_id,source_type,source_id,target_status),
  KEY idx_validation_request_state (state,due_at,risk_level),
  KEY idx_validation_request_checker (checker_user_id,state,due_at),
  KEY idx_validation_request_approver (approver_user_id,state,due_at),
  KEY idx_validation_request_maker (maker_user_id,state,submitted_at),
  KEY idx_validation_request_scope (company_id,site_id,department_id,division_id),
  CONSTRAINT fk_validation_request_rule FOREIGN KEY (rule_id) REFERENCES validation_rule(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_decision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  stage VARCHAR(30) NOT NULL,
  decision VARCHAR(30) NOT NULL,
  from_state VARCHAR(40) DEFAULT NULL,
  to_state VARCHAR(40) NOT NULL,
  reason_code VARCHAR(80) DEFAULT NULL,
  decision_note VARCHAR(2000) DEFAULT NULL,
  actor_user_id INT NOT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  delegation_id BIGINT UNSIGNED DEFAULT NULL,
  decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_decision_request (request_id,decided_at),
  KEY idx_validation_decision_actor (actor_user_id,stage,decided_at),
  CONSTRAINT fk_validation_decision_request FOREIGN KEY (request_id) REFERENCES validation_request(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_validation_decision_delegation FOREIGN KEY (delegation_id) REFERENCES validation_delegation(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  evidence_type VARCHAR(40) NOT NULL DEFAULT 'SUPPORTING',
  attachment_id BIGINT UNSIGNED DEFAULT NULL,
  file_name VARCHAR(255) DEFAULT NULL,
  object_key VARCHAR(500) DEFAULT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  checksum VARCHAR(128) DEFAULT NULL,
  test_values LONGTEXT DEFAULT NULL,
  source_mode VARCHAR(30) DEFAULT NULL,
  signed_by_user_id INT DEFAULT NULL,
  signed_at DATETIME DEFAULT NULL,
  uploaded_by_user_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_evidence_request (request_id,evidence_type),
  CONSTRAINT fk_validation_evidence_request FOREIGN KEY (request_id) REFERENCES validation_request(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_exception (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  exception_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  exception_summary VARCHAR(255) NOT NULL,
  exception_detail TEXT DEFAULT NULL,
  containment_action TEXT DEFAULT NULL,
  sla_due_at DATETIME DEFAULT NULL,
  ncr_source VARCHAR(50) DEFAULT NULL,
  ncr_reference VARCHAR(120) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  assigned_to_user_id INT DEFAULT NULL,
  resolved_by_user_id INT DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  resolution_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_validation_exception_request (request_id,status,created_at),
  KEY idx_validation_exception_assignee (assigned_to_user_id,status,sla_due_at),
  KEY idx_validation_exception_ncr (ncr_source,ncr_reference),
  CONSTRAINT fk_validation_exception_request FOREIGN KEY (request_id) REFERENCES validation_request(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  old_snapshot LONGTEXT DEFAULT NULL,
  new_snapshot LONGTEXT DEFAULT NULL,
  validation_errors LONGTEXT DEFAULT NULL,
  actor_user_id INT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  device_info VARCHAR(500) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_audit_request (request_id,event_at),
  KEY idx_validation_audit_actor (actor_user_id,event_at),
  CONSTRAINT fk_validation_audit_request FOREIGN KEY (request_id) REFERENCES validation_request(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rule pilot awal. Actor assignment tetap harus diisi berdasarkan mandat HRIS.
INSERT INTO validation_rule
  (rule_code,module_code,feature_code,action_code,rule_name,risk_level,
   requires_checker,requires_approver,requires_evidence,prevent_self_check,
   prevent_self_approve,sla_hours,rule_config,version_no,status,created_by,updated_by,created_at,updated_at)
VALUES
  ('MT02-CLOSE','MT02','FTR-MT02-06','CLOSE_PM','Validasi dan approval penutupan Preventive WO','HIGH',1,1,1,1,1,24,
   '{"required_states":["PENDING_CLOSE_REVIEW","CLOSE_APPROVED"],"required_evidence":["CHECKLIST","TEST_RESULT","SIGNOFF"]}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
  ('AS07-DISPOSITION','AS07','FTR-AS07-06','APPROVE_VARIANCE','Review dan disposition selisih Stock Opname Asset','HIGH',1,1,1,1,1,48,
   '{"required_evidence":["QR","PHOTO","LOCATION","CONDITION"],"variance_requires_ncr":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
  ('GV01-GENERIC','GV01','FTR-GV01-02','VALIDATE','Antrean validasi generik My Work','MEDIUM',1,1,1,1,1,24,
   '{"row_level_security":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW())
ON DUPLICATE KEY UPDATE
  rule_name=VALUES(rule_name),risk_level=VALUES(risk_level),rule_config=VALUES(rule_config),updated_at=NOW();
