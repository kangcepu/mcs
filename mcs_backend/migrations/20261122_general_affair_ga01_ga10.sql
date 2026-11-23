-- General Affair GA01-GA10.
-- Satu fondasi untuk checklist lapangan, preventive GA, CCTV, rekonsiliasi
-- weighbridge, NCR/exception, evidence, approval, dan publikasi mingguan.
-- Jalankan manual setelah validation engine. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS ga_area_object (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_code VARCHAR(20) NOT NULL,
  object_code VARCHAR(100) NOT NULL,
  object_name VARCHAR(255) NOT NULL,
  object_type VARCHAR(80) NOT NULL,
  company_code VARCHAR(80) NOT NULL,
  site_code VARCHAR(80) DEFAULT NULL,
  location_name VARCHAR(255) NOT NULL,
  route_name VARCHAR(180) DEFAULT NULL,
  custodian VARCHAR(120) DEFAULT NULL,
  capacity_value DECIMAL(24,6) DEFAULT NULL,
  capacity_unit VARCHAR(40) DEFAULT NULL,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  condition_standard TEXT DEFAULT NULL,
  metadata LONGTEXT DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_area_object_code (company_code,module_code,object_code),
  KEY idx_ga_area_object_scope (module_code,company_code,site_code,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_checklist_template (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_code VARCHAR(20) NOT NULL,
  template_code VARCHAR(100) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  frequency_type VARCHAR(30) NOT NULL DEFAULT 'DAILY',
  work_standard TEXT DEFAULT NULL,
  evidence_before_required TINYINT(1) NOT NULL DEFAULT 1,
  evidence_after_required TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  approved_by_id INT DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_checklist_template (module_code,template_code,version_no),
  KEY idx_ga_checklist_template_status (module_code,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_checklist_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  item_label VARCHAR(500) NOT NULL,
  response_type VARCHAR(30) NOT NULL DEFAULT 'PASS_FAIL',
  required_flag TINYINT(1) NOT NULL DEFAULT 1,
  minimum_value DECIMAL(24,6) DEFAULT NULL,
  maximum_value DECIMAL(24,6) DEFAULT NULL,
  unit VARCHAR(40) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_checklist_item (template_id,item_code),
  KEY idx_ga_checklist_item_order (template_id,sequence_no),
  CONSTRAINT fk_ga_checklist_item_template FOREIGN KEY (template_id) REFERENCES ga_checklist_template(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_preventive_schedule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_code VARCHAR(100) NOT NULL,
  module_code VARCHAR(20) NOT NULL,
  area_object_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  frequency_type VARCHAR(30) NOT NULL,
  interval_value INT UNSIGNED NOT NULL DEFAULT 1,
  shift_code VARCHAR(40) DEFAULT NULL,
  start_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  pic_user_id INT DEFAULT NULL,
  backup_pic_user_id INT DEFAULT NULL,
  checker_user_id INT DEFAULT NULL,
  approver_user_id INT DEFAULT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  change_reason VARCHAR(500) DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  frozen_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_preventive_schedule (schedule_code,version_no),
  KEY idx_ga_preventive_due (status,next_due_date,module_code),
  CONSTRAINT fk_ga_preventive_object FOREIGN KEY (area_object_id) REFERENCES ga_area_object(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ga_preventive_template FOREIGN KEY (template_id) REFERENCES ga_checklist_template(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_task (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_number VARCHAR(100) NOT NULL,
  module_code VARCHAR(20) NOT NULL,
  task_type VARCHAR(40) NOT NULL DEFAULT 'ROUTINE',
  area_object_id BIGINT UNSIGNED DEFAULT NULL,
  template_id BIGINT UNSIGNED DEFAULT NULL,
  schedule_id BIGINT UNSIGNED DEFAULT NULL,
  source_task_id BIGINT UNSIGNED DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  company_code VARCHAR(80) NOT NULL,
  site_code VARCHAR(80) DEFAULT NULL,
  location_name VARCHAR(255) NOT NULL,
  shift_code VARCHAR(40) DEFAULT NULL,
  planned_date DATE NOT NULL,
  due_at DATETIME DEFAULT NULL,
  quantity_total DECIMAL(24,6) DEFAULT NULL,
  quantity_repaired DECIMAL(24,6) DEFAULT NULL,
  quantity_scrap DECIMAL(24,6) DEFAULT NULL,
  result_code VARCHAR(40) DEFAULT NULL,
  condition_code VARCHAR(40) DEFAULT NULL,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  finding TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  skipped_reason VARCHAR(500) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  maker_user_id INT DEFAULT NULL,
  maker_name VARCHAR(120) DEFAULT NULL,
  checker_user_id INT DEFAULT NULL,
  checker_name VARCHAR(120) DEFAULT NULL,
  approver_user_id INT DEFAULT NULL,
  approver_name VARCHAR(120) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  started_at DATETIME DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_task_number (task_number),
  UNIQUE KEY uq_ga_task_schedule_date (schedule_id,planned_date),
  KEY idx_ga_task_queue (module_code,status,planned_date,due_at),
  KEY idx_ga_task_scope (company_code,site_code,location_name),
  KEY idx_ga_task_maker (maker_user_id,status,planned_date),
  CONSTRAINT fk_ga_task_object FOREIGN KEY (area_object_id) REFERENCES ga_area_object(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ga_task_template FOREIGN KEY (template_id) REFERENCES ga_checklist_template(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ga_task_schedule FOREIGN KEY (schedule_id) REFERENCES ga_preventive_schedule(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_ga_task_source FOREIGN KEY (source_task_id) REFERENCES ga_task(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_task_checklist_result (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  checklist_item_id BIGINT UNSIGNED NOT NULL,
  result_code VARCHAR(30) DEFAULT NULL,
  result_text VARCHAR(500) DEFAULT NULL,
  result_value DECIMAL(24,6) DEFAULT NULL,
  note VARCHAR(500) DEFAULT NULL,
  recorded_by VARCHAR(120) DEFAULT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_task_checklist_result (task_id,checklist_item_id),
  CONSTRAINT fk_ga_task_result_task FOREIGN KEY (task_id) REFERENCES ga_task(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_ga_task_result_item FOREIGN KEY (checklist_item_id) REFERENCES ga_checklist_item(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  evidence_type VARCHAR(40) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  captured_at DATETIME DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ga_evidence_entity (entity_type,entity_id,evidence_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_cctv_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_number VARCHAR(100) NOT NULL,
  camera_object_id BIGINT UNSIGNED NOT NULL,
  offline_at DATETIME NOT NULL,
  online_at DATETIME DEFAULT NULL,
  duration_minutes INT UNSIGNED DEFAULT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  source_reference VARCHAR(255) DEFAULT NULL,
  repeat_count INT UNSIGNED NOT NULL DEFAULT 1,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  repair_wo_number VARCHAR(120) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
  restoration_note VARCHAR(500) DEFAULT NULL,
  reported_by VARCHAR(120) DEFAULT NULL,
  verified_by VARCHAR(120) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_cctv_event_number (event_number),
  KEY idx_ga_cctv_event_camera (camera_object_id,offline_at,status),
  CONSTRAINT fk_ga_cctv_event_camera FOREIGN KEY (camera_object_id) REFERENCES ga_area_object(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_weighbridge_reconciliation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_number VARCHAR(100) NOT NULL,
  company_code VARCHAR(80) NOT NULL,
  site_code VARCHAR(80) DEFAULT NULL,
  ticket_number VARCHAR(120) NOT NULL,
  vehicle_plate VARCHAR(40) NOT NULL,
  cargo_name VARCHAR(255) DEFAULT NULL,
  ticket_entry_at DATETIME NOT NULL,
  ticket_exit_at DATETIME DEFAULT NULL,
  security_entry_at DATETIME DEFAULT NULL,
  security_exit_at DATETIME DEFAULT NULL,
  cctv_plate VARCHAR(40) DEFAULT NULL,
  cctv_observed_at DATETIME DEFAULT NULL,
  tolerance_minutes INT UNSIGNED NOT NULL DEFAULT 15,
  match_time TINYINT(1) DEFAULT NULL,
  match_plate TINYINT(1) DEFAULT NULL,
  match_cargo TINYINT(1) DEFAULT NULL,
  exception_note TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  maker_user_id INT DEFAULT NULL,
  maker_name VARCHAR(120) DEFAULT NULL,
  checker_user_id INT DEFAULT NULL,
  checker_name VARCHAR(120) DEFAULT NULL,
  approver_user_id INT DEFAULT NULL,
  approver_name VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_weighbridge_number (reconciliation_number),
  UNIQUE KEY uq_ga_weighbridge_ticket (company_code,ticket_number),
  KEY idx_ga_weighbridge_queue (status,ticket_entry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_exception_ncr (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_number VARCHAR(100) NOT NULL,
  module_code VARCHAR(20) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  containment TEXT DEFAULT NULL,
  root_cause TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  preventive_action TEXT DEFAULT NULL,
  assigned_to VARCHAR(120) DEFAULT NULL,
  due_at DATETIME DEFAULT NULL,
  aims_capa_reference VARCHAR(160) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  verified_by VARCHAR(120) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_exception_ncr_number (ncr_number),
  UNIQUE KEY uq_ga_exception_source (module_code,source_type,source_id,category),
  KEY idx_ga_exception_queue (status,severity,due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_weekly_publication (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publication_number VARCHAR(100) NOT NULL,
  company_code VARCHAR(80) NOT NULL,
  site_code VARCHAR(80) DEFAULT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_variant VARCHAR(60) NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  source_snapshot LONGTEXT NOT NULL,
  exception_summary TEXT DEFAULT NULL,
  reviewer_comment TEXT DEFAULT NULL,
  pdf_object_key VARCHAR(500) DEFAULT NULL,
  xlsx_object_key VARCHAR(500) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(120) DEFAULT NULL,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  published_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ga_weekly_publication (company_code,site_code,period_start,period_end,report_variant,version_no),
  UNIQUE KEY uq_ga_weekly_publication_number (publication_number),
  KEY idx_ga_weekly_publication_status (status,period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) DEFAULT NULL,
  event_note TEXT DEFAULT NULL,
  old_snapshot LONGTEXT DEFAULT NULL,
  new_snapshot LONGTEXT DEFAULT NULL,
  actor_user_id INT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ga_audit_entity (entity_type,entity_id,event_at),
  KEY idx_ga_audit_time (event_at,event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aktifkan GA01-GA10 hanya setelah tabel adapter di atas tersedia.
UPDATE validation_module_registry
SET rollout_status='ACTIVE',
    evidence_config='["CHECKLIST","BEFORE_PHOTO","AFTER_PHOTO","LOCATION","AUDIT"]',
    transition_config='["PLANNED","IN_PROGRESS","SUBMITTED","CHECKED","APPROVED","REJECTED","CLOSED"]',
    adapter_code=CASE
      WHEN module_code='GA08' THEN 'GA_CCTV'
      WHEN module_code='GA09' THEN 'GA_WEIGHBRIDGE'
      WHEN module_code='GA10' THEN 'GA_WEEKLY_GOVERNANCE'
      ELSE 'GA_FIELD_TASK'
    END,
    activated_at=COALESCE(activated_at,NOW()),updated_at=NOW()
WHERE module_code BETWEEN 'GA01' AND 'GA10';

INSERT INTO validation_rule
  (rule_code,module_code,feature_code,action_code,rule_name,risk_level,requires_checker,requires_approver,
   requires_evidence,prevent_self_check,prevent_self_approve,sla_hours,rule_config,version_no,status,created_by,updated_by,created_at,updated_at)
VALUES
('GA-FIELD-CLOSE','GA01','GA01-F06','APPROVE_GA_TASK','Approval hasil pekerjaan lapangan GA','HIGH',1,1,1,1,1,24,
 '{"modules":["GA01","GA02","GA03","GA04","GA05","GA06","GA07"],"unsafe_requires_ncr":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
('GA08-RESTORE','GA08','GA08-F06','APPROVE_CCTV_RESTORE','Verifikasi pemulihan CCTV','CRITICAL',1,1,1,1,1,4,
 '{"repair_wo_required_for_escalation":true,"repeated_offline_requires_ncr":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
('GA09-RECON','GA09','GA09-F06','APPROVE_WEIGHBRIDGE_RECON','Approval rekonsiliasi tiket timbang','CRITICAL',1,1,1,1,1,4,
 '{"mismatch_requires_exception":true,"tolerance_versioned":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
('GA10-PUBLISH','GA10','GA10-F05','PUBLISH_GA_REPORT','Approval publikasi laporan mingguan GA','HIGH',1,1,1,1,1,48,
 '{"approved_sources_only":true,"immutable_version":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW())
ON DUPLICATE KEY UPDATE rule_name=VALUES(rule_name),rule_config=VALUES(rule_config),status='ACTIVE',updated_at=NOW();
