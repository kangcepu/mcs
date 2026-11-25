-- AI Image berbasis machine dan master parameter.
-- Asset Management hanya dibaca sebagai sumber identitas machine; tidak ada
-- perubahan struktur maupun data pada tabel asset.
-- Jalankan manual setelah migration AI Image sebelumnya. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS ai_image_parameter_master (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  parameter_code VARCHAR(80) NOT NULL,
  parameter_name VARCHAR(180) NOT NULL,
  parameter_group VARCHAR(120) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  reference_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
  minimum_value DECIMAL(30,10) DEFAULT NULL,
  target_value DECIMAL(30,10) DEFAULT NULL,
  maximum_value DECIMAL(30,10) DEFAULT NULL,
  reference_text TEXT DEFAULT NULL,
  unit VARCHAR(60) DEFAULT NULL,
  photo_instruction TEXT DEFAULT NULL,
  minimum_photo_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  check_interval_days INT UNSIGNED DEFAULT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by_id INT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by_id INT DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_parameter_asset_code (asset_id,parameter_code),
  KEY idx_ai_parameter_asset_status (asset_id,status,sort_order),
  KEY idx_ai_parameter_name (parameter_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_image_parameter_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parameter_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  before_data LONGTEXT DEFAULT NULL,
  after_data LONGTEXT DEFAULT NULL,
  event_note VARCHAR(500) DEFAULT NULL,
  actor_id INT DEFAULT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_parameter_audit_header (parameter_id,event_at),
  CONSTRAINT fk_ai_parameter_audit_header FOREIGN KEY (parameter_id)
    REFERENCES ai_image_parameter_master(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND COLUMN_NAME='parameter_id'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD COLUMN parameter_id BIGINT UNSIGNED DEFAULT NULL AFTER asset_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis' AND INDEX_NAME='idx_ai_analysis_parameter'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD KEY idx_ai_analysis_parameter (parameter_id,created_at)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='ai_image_analysis'
    AND CONSTRAINT_NAME='fk_ai_analysis_parameter'),
  'SELECT 1','ALTER TABLE ai_image_analysis ADD CONSTRAINT fk_ai_analysis_parameter FOREIGN KEY (parameter_id) REFERENCES ai_image_parameter_master(id) ON UPDATE RESTRICT ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='ai_image_analysis_master'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN ai_image_analysis_master TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

