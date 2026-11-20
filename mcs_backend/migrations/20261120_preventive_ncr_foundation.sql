-- MCS Preventive Compliance & NCR Foundation.
-- Menambahkan status terminal AUTO_CLOSED ke seluruh tabel header WO yang
-- dapat dibuat oleh Preventive Schedule, serta fondasi NCR dan audit trail.
-- Migration ini belum menjalankan auto-close; engine proses dibuat pada tahap berikutnya.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS preventive_compliance_policy (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL',
  module_code VARCHAR(30) NOT NULL DEFAULT 'ALL',
  late_tolerance_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  required_evidence_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  ncr_approval_required TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_preventive_compliance_policy_scope (company_code, module_code),
  KEY idx_preventive_compliance_policy_status (status, company_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS preventive_ncr (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_number VARCHAR(90) NOT NULL,
  source_key VARCHAR(220) NOT NULL,
  ncr_type VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  module_code VARCHAR(30) NOT NULL,
  wo_number VARCHAR(120) NOT NULL,
  trigger_wo_number VARCHAR(120) DEFAULT NULL,
  asset_id INT DEFAULT NULL,
  asset_code VARCHAR(100) DEFAULT NULL,
  schedule_id INT DEFAULT NULL,
  schedule_detail_id INT DEFAULT NULL,
  planned_date DATE DEFAULT NULL,
  actual_completion_date DATETIME DEFAULT NULL,
  variance_days INT DEFAULT NULL,
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  UNIQUE KEY uq_preventive_ncr_number (ncr_number),
  UNIQUE KEY uq_preventive_ncr_source (source_key),
  KEY idx_preventive_ncr_status (status, severity, due_date),
  KEY idx_preventive_ncr_wo (module_code, wo_number),
  KEY idx_preventive_ncr_asset (asset_id, planned_date),
  KEY idx_preventive_ncr_schedule (schedule_detail_id, planned_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS preventive_ncr_action (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) NOT NULL,
  action_note TEXT DEFAULT NULL,
  acted_by VARCHAR(120) DEFAULT NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_preventive_ncr_action_header (ncr_id, acted_at),
  CONSTRAINT fk_preventive_ncr_action_header
    FOREIGN KEY (ncr_id) REFERENCES preventive_ncr (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS preventive_ncr_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ncr_id BIGINT UNSIGNED NOT NULL,
  evidence_type VARCHAR(30) NOT NULL DEFAULT 'SUPPORTING',
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  description VARCHAR(500) DEFAULT NULL,
  uploaded_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_preventive_ncr_evidence_header (ncr_id, evidence_type),
  CONSTRAINT fk_preventive_ncr_evidence_header
    FOREIGN KEY (ncr_id) REFERENCES preventive_ncr (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS preventive_auto_close_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_code VARCHAR(30) NOT NULL,
  wo_number VARCHAR(120) NOT NULL,
  trigger_wo_number VARCHAR(120) NOT NULL,
  asset_id INT DEFAULT NULL,
  asset_code VARCHAR(100) DEFAULT NULL,
  schedule_detail_id INT DEFAULT NULL,
  planned_date DATE DEFAULT NULL,
  trigger_planned_date DATE DEFAULT NULL,
  previous_status VARCHAR(40) DEFAULT NULL,
  resulting_status VARCHAR(40) NOT NULL DEFAULT 'AUTO_CLOSED',
  ncr_id BIGINT UNSIGNED DEFAULT NULL,
  close_reason VARCHAR(500) NOT NULL,
  closed_by VARCHAR(120) NOT NULL DEFAULT 'SYSTEM',
  closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_preventive_auto_close_wo (module_code, wo_number),
  KEY idx_preventive_auto_close_trigger (module_code, trigger_wo_number),
  KEY idx_preventive_auto_close_asset (asset_id, planned_date),
  KEY idx_preventive_auto_close_ncr (ncr_id),
  CONSTRAINT fk_preventive_auto_close_ncr
    FOREIGN KEY (ncr_id) REFERENCES preventive_ncr (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO preventive_compliance_policy
  (company_code, module_code, late_tolerance_days, required_evidence_count,
   ncr_approval_required, status, notes, created_by, updated_by, created_at, updated_at)
VALUES
  ('GLOBAL', 'ALL', 0, 1, 1, 'ACTIVE',
   'Default awal; toleransi dan approval NCR dapat disesuaikan setelah keputusan bisnis final.',
   'SYSTEM', 'SYSTEM', NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at=updated_at;

-- Tambahkan AUTO_CLOSED tanpa menimpa anggota ENUM existing.
SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_wo_mtc' AND COLUMN_NAME='status'
);
SET @sql := IF(
  @status_type IS NULL OR @status_type NOT LIKE 'enum(%' OR LOCATE('''AUTO_CLOSED''', @status_type) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `tb_wo_mtc` MODIFY COLUMN `status` ',
    LEFT(@status_type, CHAR_LENGTH(@status_type)-1), ',''AUTO_CLOSED'') NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_wo_mtc_operational' AND COLUMN_NAME='status'
);
SET @sql := IF(
  @status_type IS NULL OR @status_type NOT LIKE 'enum(%' OR LOCATE('''AUTO_CLOSED''', @status_type) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `tb_wo_mtc_operational` MODIFY COLUMN `status` ',
    LEFT(@status_type, CHAR_LENGTH(@status_type)-1), ',''AUTO_CLOSED'') NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_wo_preventive' AND COLUMN_NAME='status'
);
SET @sql := IF(
  @status_type IS NULL OR @status_type NOT LIKE 'enum(%' OR LOCATE('''AUTO_CLOSED''', @status_type) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `tb_wo_preventive` MODIFY COLUMN `status` ',
    LEFT(@status_type, CHAR_LENGTH(@status_type)-1), ',''AUTO_CLOSED'') NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_wo_it' AND COLUMN_NAME='status'
);
SET @sql := IF(
  @status_type IS NULL OR @status_type NOT LIKE 'enum(%' OR LOCATE('''AUTO_CLOSED''', @status_type) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `tb_wo_it` MODIFY COLUMN `status` ',
    LEFT(@status_type, CHAR_LENGTH(@status_type)-1), ',''AUTO_CLOSED'') NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_wo_ga' AND COLUMN_NAME='status'
);
SET @sql := IF(
  @status_type IS NULL OR @status_type NOT LIKE 'enum(%' OR LOCATE('''AUTO_CLOSED''', @status_type) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `tb_wo_ga` MODIFY COLUMN `status` ',
    LEFT(@status_type, CHAR_LENGTH(@status_type)-1), ',''AUTO_CLOSED'') NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
