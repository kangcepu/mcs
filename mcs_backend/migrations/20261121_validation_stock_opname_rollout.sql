-- Validation Engine Tahap 5-7: pilot Stock Opname, SLA/NCR/delegasi/escalation,
-- dan registry rollout 69 submodul. Jalankan setelah 20261120_validation_engine_my_work.sql.
-- Aman dijalankan ulang. Tidak mengunci SO existing sebelum submit workflow baru.

SET @sql_add_validation_mime := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='validation_evidence' AND COLUMN_NAME='mime_type'),
  'SELECT 1',
  'ALTER TABLE validation_evidence ADD COLUMN mime_type VARCHAR(120) DEFAULT NULL AFTER object_key'
);
PREPARE stmt FROM @sql_add_validation_mime; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS stock_opname_validation_control (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  no_so VARCHAR(60) NOT NULL,
  opname_type VARCHAR(20) NOT NULL DEFAULT 'ASSET',
  status VARCHAR(30) NOT NULL DEFAULT 'COUNTING',
  total_snapshot INT NOT NULL DEFAULT 0,
  checked_count INT NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  variance_count INT NOT NULL DEFAULT 0,
  exception_count INT NOT NULL DEFAULT 0,
  submitted_by_user_id INT DEFAULT NULL,
  submitted_by VARCHAR(120) DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  approved_by_user_id INT DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  locked_by_user_id INT DEFAULT NULL,
  locked_by VARCHAR(120) DEFAULT NULL,
  locked_at DATETIME DEFAULT NULL,
  source_locked_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_validation_control_no (no_so),
  KEY idx_so_validation_control_status (status,submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_validation_location (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  control_id BIGINT UNSIGNED NOT NULL,
  location_id VARCHAR(120) NOT NULL,
  location_name VARCHAR(255) DEFAULT NULL,
  counter_user_id INT NOT NULL,
  validation_request_id BIGINT UNSIGNED DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'COUNTING',
  total_snapshot INT NOT NULL DEFAULT 0,
  checked_count INT NOT NULL DEFAULT 0,
  missing_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  damaged_count INT NOT NULL DEFAULT 0,
  location_variance_count INT NOT NULL DEFAULT 0,
  unregistered_count INT NOT NULL DEFAULT 0,
  recount_no INT UNSIGNED NOT NULL DEFAULT 0,
  submitted_at DATETIME DEFAULT NULL,
  checked_at DATETIME DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_validation_location_counter (control_id,location_id,counter_user_id),
  KEY idx_so_validation_location_request (validation_request_id),
  KEY idx_so_validation_location_status (status,counter_user_id),
  CONSTRAINT fk_so_validation_location_control FOREIGN KEY (control_id)
    REFERENCES stock_opname_validation_control(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_validation_location_request FOREIGN KEY (validation_request_id)
    REFERENCES validation_request(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_validation_exception (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  control_id BIGINT UNSIGNED NOT NULL,
  location_validation_id BIGINT UNSIGNED DEFAULT NULL,
  validation_request_id BIGINT UNSIGNED DEFAULT NULL,
  exception_type VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  asset_code VARCHAR(120) DEFAULT NULL,
  asset_name VARCHAR(255) DEFAULT NULL,
  expected_location VARCHAR(255) DEFAULT NULL,
  actual_location VARCHAR(255) DEFAULT NULL,
  condition_status VARCHAR(50) DEFAULT NULL,
  description VARCHAR(1000) NOT NULL,
  disposition VARCHAR(40) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  ncr_id BIGINT UNSIGNED DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by VARCHAR(120) DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_so_validation_exception_control (control_id,status,exception_type),
  KEY idx_so_validation_exception_request (validation_request_id),
  CONSTRAINT fk_so_validation_exception_control FOREIGN KEY (control_id)
    REFERENCES stock_opname_validation_control(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_validation_exception_location FOREIGN KEY (location_validation_id)
    REFERENCES stock_opname_validation_location(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_validation_recount (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  control_id BIGINT UNSIGNED NOT NULL,
  location_validation_id BIGINT UNSIGNED NOT NULL,
  recount_no INT UNSIGNED NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  requested_by_user_id INT NOT NULL,
  requested_by VARCHAR(120) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_to_user_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  submitted_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_validation_recount (location_validation_id,recount_no),
  KEY idx_so_validation_recount_assignee (assigned_to_user_id,status,requested_at),
  CONSTRAINT fk_so_validation_recount_control FOREIGN KEY (control_id)
    REFERENCES stock_opname_validation_control(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_validation_recount_location FOREIGN KEY (location_validation_id)
    REFERENCES stock_opname_validation_location(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_transfer_proposal (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  control_id BIGINT UNSIGNED NOT NULL,
  exception_id BIGINT UNSIGNED NOT NULL,
  asset_code VARCHAR(120) NOT NULL,
  from_location VARCHAR(255) NOT NULL,
  to_location VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',
  proposed_by VARCHAR(120) DEFAULT NULL,
  proposed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(120) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  transfer_reference VARCHAR(120) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_transfer_proposal_exception (exception_id),
  KEY idx_so_transfer_proposal_status (status,proposed_at),
  CONSTRAINT fk_so_transfer_proposal_control FOREIGN KEY (control_id)
    REFERENCES stock_opname_validation_control(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_transfer_proposal_exception FOREIGN KEY (exception_id)
    REFERENCES stock_opname_validation_exception(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_ncr (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_number VARCHAR(90) NOT NULL,
  request_id BIGINT UNSIGNED DEFAULT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_reference VARCHAR(160) NOT NULL,
  ncr_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'HIGH',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  assigned_to_user_id INT DEFAULT NULL,
  assigned_to VARCHAR(120) DEFAULT NULL,
  due_at DATETIME DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  root_cause TEXT DEFAULT NULL,
  corrective_action TEXT DEFAULT NULL,
  preventive_action TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(120) DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_ncr_number (ncr_number),
  UNIQUE KEY uq_validation_ncr_source (source_type,source_reference,ncr_type),
  KEY idx_validation_ncr_status (status,severity,due_at),
  KEY idx_validation_ncr_assignee (assigned_to_user_id,status,due_at),
  CONSTRAINT fk_validation_ncr_request FOREIGN KEY (request_id)
    REFERENCES validation_request(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_notification (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id INT NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  notification_key VARCHAR(220) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_notification_key (notification_key),
  KEY idx_validation_notification_recipient (recipient_user_id,status,scheduled_at),
  CONSTRAINT fk_validation_notification_request FOREIGN KEY (request_id)
    REFERENCES validation_request(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_escalation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  escalation_level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  from_user_id INT DEFAULT NULL,
  to_user_id INT DEFAULT NULL,
  reason VARCHAR(1000) NOT NULL,
  escalated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  PRIMARY KEY (id),
  UNIQUE KEY uq_validation_escalation_level (request_id,escalation_level),
  KEY idx_validation_escalation_status (status,escalated_at),
  CONSTRAINT fk_validation_escalation_request FOREIGN KEY (request_id)
    REFERENCES validation_request(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_assignment_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED DEFAULT NULL,
  delegation_id BIGINT UNSIGNED DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  old_snapshot LONGTEXT DEFAULT NULL,
  new_snapshot LONGTEXT DEFAULT NULL,
  actor_user_id INT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_assignment_audit_assignment (assignment_id,event_at),
  KEY idx_validation_assignment_audit_delegation (delegation_id,event_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS validation_module_registry (
  module_code VARCHAR(20) NOT NULL,
  module_group VARCHAR(40) NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  rollout_order SMALLINT UNSIGNED NOT NULL,
  rollout_status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED',
  default_risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  default_sla_hours INT UNSIGNED NOT NULL DEFAULT 24,
  evidence_config TEXT DEFAULT NULL,
  transition_config TEXT DEFAULT NULL,
  adapter_code VARCHAR(100) DEFAULT NULL,
  activated_at DATETIME DEFAULT NULL,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (module_code),
  KEY idx_validation_module_rollout (rollout_status,rollout_order,module_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO validation_module_registry
  (module_code,module_group,module_name,rollout_order,rollout_status,default_risk_level,default_sla_hours,evidence_config,transition_config,adapter_code,activated_at,updated_at)
VALUES
('AS01','ASSET','Asset Register',1,'REGISTERED','MEDIUM',24,'["SOURCE","AUDIT"]',NULL,NULL,NULL,NOW()),
('AS02','ASSET','Asset Category & Criticality',2,'REGISTERED','HIGH',24,'["ASSESSMENT"]',NULL,NULL,NULL,NOW()),
('AS03','ASSET','Asset Location Mapping',3,'REGISTERED','MEDIUM',24,'["QR","LOCATION"]',NULL,NULL,NULL,NOW()),
('AS04','ASSET','Asset Transfer & Relocation',4,'REGISTERED','HIGH',24,'["TRANSFER","RECEIPT"]',NULL,NULL,NULL,NOW()),
('AS05','ASSET','Asset BOM & As-Built',5,'REGISTERED','HIGH',48,'["SERIAL","AS_BUILT"]',NULL,NULL,NULL,NOW()),
('AS06','ASSET','Stock Opname Asset BOM',6,'PILOT','HIGH',48,'["QR","COUNT","PHOTO"]','["COUNTING","SUBMITTED","CHECKING","PENDING_APPROVAL","APPROVED","RECOUNT","REJECTED","LOCKED"]','STOCK_OPNAME',NOW(),NOW()),
('AS07','ASSET','Stock Opname Seluruh Asset',7,'PILOT','HIGH',48,'["QR","COUNT","PHOTO","LOCATION","CONDITION"]','["COUNTING","SUBMITTED","CHECKING","PENDING_APPROVAL","APPROVED","RECOUNT","REJECTED","LOCKED"]','STOCK_OPNAME',NOW(),NOW()),
('AS08','ASSET','Asset Condition Inspection',8,'REGISTERED','HIGH',24,'["CHECKLIST","PHOTO"]',NULL,NULL,NULL,NOW()),
('AS09','ASSET','QR Asset & Equipment History',9,'REGISTERED','LOW',24,'["QR","AUDIT"]',NULL,NULL,NULL,NOW()),
('AS10','ASSET','Asset Lifecycle & Disposal',10,'REGISTERED','CRITICAL',72,'["ASSESSMENT","APPROVAL"]',NULL,NULL,NULL,NOW()),
('MT01','MAINTENANCE','Preventive Maintenance Master',11,'REGISTERED','HIGH',24,'["TEMPLATE","SAFETY"]',NULL,NULL,NULL,NOW()),
('MT02','MAINTENANCE','Preventive Maintenance Work Order',12,'PILOT','HIGH',24,'["CHECKLIST","TEST_RESULT","SIGNOFF"]','["PENDING_CLOSE_REVIEW","CLOSE_APPROVED","CLOSED"]','PREVENTIVE_WO_CLOSE',NOW(),NOW()),
('MT03','MAINTENANCE','Breakdown & Corrective Ticket',13,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('MT04','MAINTENANCE','Corrective Maintenance Work Order',14,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT05','MAINTENANCE','WO Maintenance Broker',15,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT06','MAINTENANCE','WO Maintenance Inject & Mould',16,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT07','MAINTENANCE','WO Maintenance Sawmill',17,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT08','MAINTENANCE','WO Maintenance FJLB',18,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT09','MAINTENANCE','WO Mekanikal',19,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT10','MAINTENANCE','WO Elektrikal',20,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT11','MAINTENANCE','WO Sipil',21,'REGISTERED','MEDIUM',48,NULL,NULL,NULL,NULL,NOW()),
('MT12','MAINTENANCE','WO Otomotif',22,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('MT13','MAINTENANCE','Maintenance Safety & LOTO',23,'REGISTERED','CRITICAL',4,'["LOTO","SAFETY_SIGNOFF"]',NULL,NULL,NULL,NOW()),
('SP01','SPAREPART','Sparepart Master & Compatibility',24,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('SP02','SPAREPART','Penerimaan Barang Sparepart',25,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('SP03','SPAREPART','Pemeriksaan Sparepart Masuk',26,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('SP04','SPAREPART','Monitoring Stok Sparepart',27,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('SP05','SPAREPART','Mapping Gudang Sparepart',28,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('SP06','SPAREPART','Permintaan & Reservasi Sparepart WO',29,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('SP07','SPAREPART','Picking & Issue Sparepart',30,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('SP08','SPAREPART','Return Sparepart',31,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('SP09','SPAREPART','Transfer & Stock Movement',32,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('SP10','SPAREPART','Stock Opname Sparepart',33,'REGISTERED','HIGH',48,NULL,NULL,NULL,NULL,NOW()),
('SP11','SPAREPART','Stock Adjustment & Reconciliation',34,'REGISTERED','CRITICAL',48,NULL,NULL,NULL,NULL,NOW()),
('SP12','SPAREPART','Reorder & Shortage Control',35,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('FL01','FLEET','Fleet Master Kendaraan/Forklift',36,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('FL02','FLEET','Vehicle Daily Inspection',37,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('FL03','FLEET','Pengisian Solar Kendaraan',38,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('FL04','FLEET','Pengisian Solar Forklift',39,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('FL05','FLEET','Odometer & Hour Meter Register',40,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('FL06','FLEET','Vehicle Preventive Maintenance',41,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('FL07','FLEET','Vehicle Service & Corrective History',42,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('FL08','FLEET','Fuel Anomaly & Efficiency Control',43,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('EN01','ENERGY','Electricity Meter Master',44,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('EN02','ENERGY','Pemakaian Listrik / Meter Reading',45,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('EN03','ENERGY','Electricity Consumption Analytics',46,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('EN04','ENERGY','Genset Master & Maintenance',47,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('EN05','ENERGY','Genset Operation Log',48,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('EN06','ENERGY','Genset Fuel Consumption',49,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('EN07','ENERGY','Fuel Tank Inventory & Opname',50,'REGISTERED','CRITICAL',24,NULL,NULL,NULL,NULL,NOW()),
('EN08','ENERGY','Water Consumption',51,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('EN09','ENERGY','Compressed Air / Boiler Utilities',52,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('EN10','ENERGY','Utility Allocation & Cost Reference',53,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('GV01','GOVERNANCE','My Work & Management Dashboard',54,'ACTIVE','MEDIUM',24,NULL,NULL,'MY_WORK',NOW(),NOW()),
('GV02','GOVERNANCE','KPI Engine & Ratio Dictionary',55,'REGISTERED','HIGH',48,NULL,NULL,NULL,NULL,NOW()),
('GV03','GOVERNANCE','Report Center & Scheduled Reports',56,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('GV04','GOVERNANCE','Report NCR & AIMS CAPA',57,'ACTIVE','HIGH',24,NULL,NULL,'VALIDATION_NCR',NOW(),NOW()),
('GV05','GOVERNANCE','Manual, SOP & ISO Reference',58,'REGISTERED','MEDIUM',48,NULL,NULL,NULL,NULL,NOW()),
('GV06','GOVERNANCE','Integration & Reconciliation Center',59,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('GA01','GENERAL_AFFAIR','Daily Cleaning & Hygiene Checklist',60,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('GA02','GENERAL_AFFAIR','Waste, TPS & Environmental Housekeeping',61,'REGISTERED','HIGH',12,NULL,NULL,NULL,NULL,NOW()),
('GA03','GENERAL_AFFAIR','Landscaping, Garden & Drainage',62,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('GA04','GENERAL_AFFAIR','Outdoor Area Condition Monitoring',63,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('GA05','GENERAL_AFFAIR','Pallet & Minor Facility Handling',64,'REGISTERED','MEDIUM',24,NULL,NULL,NULL,NULL,NOW()),
('GA06','GENERAL_AFFAIR','GA Preventive Plan & Calendar',65,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('GA07','GENERAL_AFFAIR','GA Preventive Work Order & Close Approval',66,'REGISTERED','HIGH',24,NULL,NULL,NULL,NULL,NOW()),
('GA08','GENERAL_AFFAIR','CCTV Offline Monitoring & Escalation',67,'REGISTERED','CRITICAL',4,NULL,NULL,NULL,NULL,NOW()),
('GA09','GENERAL_AFFAIR','Weighbridge CCTV & Security Log Reconciliation',68,'REGISTERED','CRITICAL',4,NULL,NULL,NULL,NULL,NOW()),
('GA10','GENERAL_AFFAIR','GA Report Center & Weekly Governance',69,'REGISTERED','MEDIUM',48,NULL,NULL,NULL,NULL,NOW())
ON DUPLICATE KEY UPDATE module_group=VALUES(module_group),module_name=VALUES(module_name),rollout_order=VALUES(rollout_order),
  default_risk_level=VALUES(default_risk_level),default_sla_hours=VALUES(default_sla_hours),
  evidence_config=VALUES(evidence_config),transition_config=VALUES(transition_config),adapter_code=VALUES(adapter_code),updated_at=NOW();

INSERT INTO validation_rule
  (rule_code,module_code,feature_code,action_code,rule_name,risk_level,requires_checker,requires_approver,
   requires_evidence,prevent_self_check,prevent_self_approve,sla_hours,rule_config,version_no,status,created_by,updated_by,created_at,updated_at)
VALUES
('AS06-DISPOSITION','AS06','FTR-AS06-06','APPROVE_BOM_VARIANCE','Review dan disposition selisih Stock Opname BOM','HIGH',1,1,1,1,1,48,
 '{"workflow":["COUNTING","SUBMITTED","CHECKING","PENDING_APPROVAL","APPROVED","RECOUNT","REJECTED","LOCKED"],"variance_requires_ncr":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW()),
('AS07-DISPOSITION','AS07','FTR-AS07-07','APPROVE_ASSET_VARIANCE','Review dan disposition selisih Stock Opname Asset','HIGH',1,1,1,1,1,48,
 '{"workflow":["COUNTING","SUBMITTED","CHECKING","PENDING_APPROVAL","APPROVED","RECOUNT","REJECTED","LOCKED"],"variance_requires_ncr":true}',1,'ACTIVE','SYSTEM','SYSTEM',NOW(),NOW())
ON DUPLICATE KEY UPDATE rule_name=VALUES(rule_name),rule_config=VALUES(rule_config),updated_at=NOW();
