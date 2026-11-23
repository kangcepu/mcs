-- Pembacaan foto kalibrasi/parameter mesin dengan LLM vision OpenCode Go.
-- Foto asli tetap menjadi evidence; teks, parameter, dan analisis disimpan
-- terstruktur agar bisa dicari, diverifikasi, dan dilaporkan.
-- Jalankan manual. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS ai_image_analysis (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_number VARCHAR(90) NOT NULL,
  module_code VARCHAR(40) NOT NULL DEFAULT 'CALIBRATION',
  asset_id INT DEFAULT NULL,
  asset_code VARCHAR(120) DEFAULT NULL,
  asset_name VARCHAR(255) DEFAULT NULL,
  activity_name VARCHAR(180) NOT NULL,
  reference_note TEXT DEFAULT NULL,
  captured_at DATETIME DEFAULT NULL,
  image_file_name VARCHAR(255) NOT NULL,
  image_object_key VARCHAR(500) NOT NULL,
  image_mime_type VARCHAR(120) NOT NULL,
  raw_text LONGTEXT DEFAULT NULL,
  structured_data LONGTEXT DEFAULT NULL,
  analysis_summary TEXT DEFAULT NULL,
  findings TEXT DEFAULT NULL,
  recommendations TEXT DEFAULT NULL,
  llm_provider VARCHAR(40) DEFAULT NULL,
  llm_model VARCHAR(180) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  error_message TEXT DEFAULT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_retry INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at DATETIME DEFAULT NULL,
  last_attempt_at DATETIME DEFAULT NULL,
  processing_started_at DATETIME DEFAULT NULL,
  created_by_id INT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  verified_by_id INT DEFAULT NULL,
  verified_by VARCHAR(120) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  verification_note TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_image_analysis_number (analysis_number),
  KEY idx_ai_image_analysis_asset (asset_id, captured_at),
  KEY idx_ai_image_analysis_status (status, created_at),
  KEY idx_ai_image_analysis_queue (status, next_retry_at),
  KEY idx_ai_image_analysis_module (module_code, activity_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Upgrade aman bila versi awal migration sudah pernah dijalankan.
-- max_retry=0 berarti retry tanpa batas; jeda retry tetap dibatasi agar API tidak dibanjiri.
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='retry_count'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN retry_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER error_message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='max_retry'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN max_retry INT UNSIGNED NOT NULL DEFAULT 0 AFTER retry_count');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='next_retry_at'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN next_retry_at DATETIME DEFAULT NULL AFTER max_retry');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='last_attempt_at'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN last_attempt_at DATETIME DEFAULT NULL AFTER next_retry_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='processing_started_at'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN processing_started_at DATETIME DEFAULT NULL AFTER last_attempt_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND INDEX_NAME='idx_ai_image_analysis_queue'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD KEY idx_ai_image_analysis_queue (status,next_retry_at)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Semua analisis menggunakan retry tanpa batas. Record lama yang pernah berhenti
-- karena batas retry langsung dimasukkan kembali ke antrean.
UPDATE ai_image_analysis
SET max_retry=0,
    next_retry_at=CASE WHEN status='FAILED' AND raw_text IS NULL THEN NOW() ELSE next_retry_at END,
    processing_started_at=CASE WHEN status='FAILED' AND raw_text IS NULL THEN NULL ELSE processing_started_at END,
    status=CASE WHEN status='FAILED' AND raw_text IS NULL THEN 'QUEUED' ELSE status END,
    updated_at=NOW()
WHERE max_retry<>0 OR (status='FAILED' AND raw_text IS NULL);

CREATE TABLE IF NOT EXISTS ai_image_analysis_value (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_id BIGINT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL DEFAULT 0,
  section_name VARCHAR(180) DEFAULT NULL,
  parameter_name VARCHAR(255) NOT NULL,
  text_value VARCHAR(500) DEFAULT NULL,
  numeric_value DECIMAL(30,10) DEFAULT NULL,
  unit VARCHAR(60) DEFAULT NULL,
  confidence DECIMAL(6,5) DEFAULT NULL,
  assessment VARCHAR(30) NOT NULL DEFAULT 'UNASSESSED',
  assessment_note VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_image_analysis_value_header (analysis_id, sequence_no),
  KEY idx_ai_image_analysis_value_parameter (parameter_name, assessment),
  CONSTRAINT fk_ai_image_analysis_value_header
    FOREIGN KEY (analysis_id) REFERENCES ai_image_analysis(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_image_analysis_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) DEFAULT NULL,
  to_status VARCHAR(30) DEFAULT NULL,
  event_note TEXT DEFAULT NULL,
  actor_id INT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_image_analysis_audit_header (analysis_id, event_at),
  CONSTRAINT fk_ai_image_analysis_audit_header
    FOREIGN KEY (analysis_id) REFERENCES ai_image_analysis(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
