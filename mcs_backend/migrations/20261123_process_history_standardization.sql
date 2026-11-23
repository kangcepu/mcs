-- Fondasi History seluruh proses MCS.
-- Semua request perubahan POST/PUT/PATCH/DELETE dicatat otomatis oleh
-- systemAuditMiddleware. Migration ini memastikan tabel tersedia sebelum
-- service dijalankan dan aman dieksekusi ulang.

CREATE TABLE IF NOT EXISTS tb_system_activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  reference VARCHAR(255) NOT NULL DEFAULT '',
  route VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  http_status SMALLINT NOT NULL,
  actor_id BIGINT DEFAULT NULL,
  actor_username VARCHAR(100) NOT NULL DEFAULT '',
  actor_fullname VARCHAR(255) NOT NULL DEFAULT '',
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  request_data MEDIUMTEXT DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_system_audit_created (created_at),
  KEY idx_system_audit_module (module),
  KEY idx_system_audit_actor (actor_id),
  KEY idx_system_audit_reference (reference, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql := IF(EXISTS(
  SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_system_activity_log'
    AND INDEX_NAME='idx_system_audit_reference'
), 'SELECT 1',
  'ALTER TABLE tb_system_activity_log ADD KEY idx_system_audit_reference (reference,created_at)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
