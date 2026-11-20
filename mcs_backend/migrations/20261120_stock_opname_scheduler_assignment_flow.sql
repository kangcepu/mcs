-- Penyesuaian Scheduler Stock Opname MCS mengikuti pola kerja PPS.
-- Data tetap Asset/BOM MCS. Pola yang diadopsi: satu NoSO per kategori,
-- assignment user per lokasi dan per sesi, serta maksimal dua lokasi/user.
-- Jalankan manual setelah 20261118_stock_opname_scheduler.sql.

CREATE TABLE IF NOT EXISTS stock_opname_schedule_location_assignment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  location_id VARCHAR(120) NOT NULL,
  location_name VARCHAR(255) DEFAULT NULL,
  user_id INT NOT NULL,
  assigned_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_schedule_location_user (schedule_id, location_id, user_id),
  KEY idx_so_schedule_assignment_user (user_id, schedule_id),
  CONSTRAINT fk_so_schedule_location_assignment_schedule
    FOREIGN KEY (schedule_id) REFERENCES stock_opname_schedule(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_schedule_location_assignment_user
    FOREIGN KEY (user_id) REFERENCES tb_user(id_user)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql_add_category_id := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='stock_opname_schedule_run' AND COLUMN_NAME='category_id'),
  'SELECT 1',
  'ALTER TABLE stock_opname_schedule_run ADD COLUMN category_id VARCHAR(120) DEFAULT NULL AFTER due_date'
);
PREPARE stmt FROM @sql_add_category_id; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql_add_assignment_count := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='stock_opname_schedule_run' AND COLUMN_NAME='assignment_count'),
  'SELECT 1',
  'ALTER TABLE stock_opname_schedule_run ADD COLUMN assignment_count INT NOT NULL DEFAULT 0 AFTER status'
);
PREPARE stmt FROM @sql_add_assignment_count; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql_add_upstream_response := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='stock_opname_schedule_run' AND COLUMN_NAME='upstream_response'),
  'SELECT 1',
  'ALTER TABLE stock_opname_schedule_run ADD COLUMN upstream_response TEXT DEFAULT NULL AFTER error_message'
);
PREPARE stmt FROM @sql_add_upstream_response; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buat index pengganti lebih dahulu. Foreign key schedule_id pada beberapa
-- instalasi MySQL memakai unique index lama sebagai supporting index; jika
-- index lama di-drop lebih dahulu akan muncul error #1553.
SET @sql_add_category_run_unique := IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='stock_opname_schedule_run' AND INDEX_NAME='uq_stock_opname_schedule_run_category_due'),
  'SELECT 1',
  'ALTER TABLE stock_opname_schedule_run ADD UNIQUE KEY uq_stock_opname_schedule_run_category_due (schedule_id,due_date,category_id)'
);
PREPARE stmt FROM @sql_add_category_run_unique; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql_drop_old_run_unique := IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='stock_opname_schedule_run' AND INDEX_NAME='uq_stock_opname_schedule_run_due'),
  'ALTER TABLE stock_opname_schedule_run DROP INDEX uq_stock_opname_schedule_run_due',
  'SELECT 1'
);
PREPARE stmt FROM @sql_drop_old_run_unique; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS stock_opname_schedule_run_assignment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  no_so VARCHAR(30) NOT NULL,
  location_id VARCHAR(120) NOT NULL,
  location_name VARCHAR(255) DEFAULT NULL,
  user_id INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_run_location_user (run_id, location_id, user_id),
  KEY idx_so_run_assignment_user (user_id, status, assigned_at),
  KEY idx_so_run_assignment_no_so (no_so),
  CONSTRAINT fk_so_run_assignment_run FOREIGN KEY (run_id)
    REFERENCES stock_opname_schedule_run(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_so_run_assignment_user FOREIGN KEY (user_id)
    REFERENCES tb_user(id_user) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
