-- Permission eksplisit untuk Stock Opname dan AI Image Analysis.
-- Default 0: akses harus diberikan dari Master Data > User/Permission Group.
-- SUPERUSER tetap mendapat bypass dari middleware backend.
-- Aman dijalankan ulang.

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='stock_opname'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN stock_opname TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='ai_image_analysis_view'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN ai_image_analysis_view TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='ai_image_analysis_create'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN ai_image_analysis_create TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='ai_image_analysis_retry'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN ai_image_analysis_retry TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_user' AND COLUMN_NAME='ai_image_analysis_verify'),
  'SELECT 1','ALTER TABLE tb_user ADD COLUMN ai_image_analysis_verify TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
