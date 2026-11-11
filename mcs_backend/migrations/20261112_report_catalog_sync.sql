-- Sinkronisasi katalog report Laravel -> MCS.
-- Report baru selalu masuk INACTIVE agar admin menentukan permission lebih dulu.
-- Aman dijalankan ulang setelah 20261112_report_center_async_job.sql.

SET @sql_add_catalog_url := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_async_config' AND COLUMN_NAME='catalog_url'),
  'SELECT 1',
  'ALTER TABLE external_report_async_config ADD COLUMN catalog_url VARCHAR(1000) DEFAULT NULL AFTER base_url'
);
PREPARE stmt_add_catalog_url FROM @sql_add_catalog_url;
EXECUTE stmt_add_catalog_url;
DEALLOCATE PREPARE stmt_add_catalog_url;

SET @sql_add_catalog_params := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_definition' AND COLUMN_NAME='catalog_params'),
  'SELECT 1',
  'ALTER TABLE external_report_definition ADD COLUMN catalog_params TEXT DEFAULT NULL AFTER default_params'
);
PREPARE stmt_add_catalog_params FROM @sql_add_catalog_params;
EXECUTE stmt_add_catalog_params;
DEALLOCATE PREPARE stmt_add_catalog_params;

SET @sql_add_catalog_status := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_definition' AND COLUMN_NAME='catalog_status'),
  'SELECT 1',
  'ALTER TABLE external_report_definition ADD COLUMN catalog_status VARCHAR(20) NOT NULL DEFAULT ''AVAILABLE'' AFTER required_permission'
);
PREPARE stmt_add_catalog_status FROM @sql_add_catalog_status;
EXECUTE stmt_add_catalog_status;
DEALLOCATE PREPARE stmt_add_catalog_status;

SET @sql_add_discovered_at := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_definition' AND COLUMN_NAME='discovered_at'),
  'SELECT 1',
  'ALTER TABLE external_report_definition ADD COLUMN discovered_at DATETIME DEFAULT NULL AFTER status'
);
PREPARE stmt_add_discovered_at FROM @sql_add_discovered_at;
EXECUTE stmt_add_discovered_at;
DEALLOCATE PREPARE stmt_add_discovered_at;

SET @sql_add_last_seen_at := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_definition' AND COLUMN_NAME='last_seen_at'),
  'SELECT 1',
  'ALTER TABLE external_report_definition ADD COLUMN last_seen_at DATETIME DEFAULT NULL AFTER discovered_at'
);
PREPARE stmt_add_last_seen_at FROM @sql_add_last_seen_at;
EXECUTE stmt_add_last_seen_at;
DEALLOCATE PREPARE stmt_add_last_seen_at;

UPDATE external_report_async_config
SET catalog_url='http://192.168.10.100:5007/report-types', updated_at=NOW()
WHERE base_url='http://192.168.10.100:5007/reports';

UPDATE external_report_definition
SET catalog_status='AVAILABLE',
    discovered_at=COALESCE(discovered_at,created_at),
    last_seen_at=COALESCE(last_seen_at,updated_at,created_at);
