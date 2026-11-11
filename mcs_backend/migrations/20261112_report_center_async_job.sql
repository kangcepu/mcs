-- Adapter Report Center untuk API reporting/Gotenberg berbasis asynchronous job.
-- Token tidak ditanam di migration; isi melalui Master Data lalu aktifkan endpoint.
-- Aman dijalankan ulang setelah 20261111_sparepart_governance_report_center.sql.

CREATE TABLE IF NOT EXISTS external_report_async_config (
  endpoint_id BIGINT UNSIGNED NOT NULL,
  base_url VARCHAR(1000) NOT NULL,
  system_code VARCHAR(80) NOT NULL DEFAULT 'mcs',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (endpoint_id),
  CONSTRAINT fk_external_report_async_endpoint FOREIGN KEY (endpoint_id) REFERENCES external_report_endpoint(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS external_report_definition (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  endpoint_id BIGINT UNSIGNED NOT NULL,
  report_type VARCHAR(120) NOT NULL,
  report_title VARCHAR(180) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'General',
  output_format VARCHAR(20) NOT NULL DEFAULT 'PDF',
  default_params TEXT DEFAULT NULL,
  required_permission VARCHAR(80) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_report_definition_type (endpoint_id,report_type),
  KEY idx_external_report_definition_status (status,category),
  CONSTRAINT fk_external_report_definition_endpoint FOREIGN KEY (endpoint_id) REFERENCES external_report_endpoint(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS external_report_job (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  endpoint_id BIGINT UNSIGNED NOT NULL,
  report_definition_id BIGINT UNSIGNED NOT NULL,
  upstream_job_id VARCHAR(180) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  request_params TEXT DEFAULT NULL,
  upstream_response TEXT DEFAULT NULL,
  requested_by VARCHAR(120) DEFAULT NULL,
  requested_user_id INT DEFAULT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_checked_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_report_job_upstream (endpoint_id,upstream_job_id),
  KEY idx_external_report_job_status (status,requested_at),
  CONSTRAINT fk_external_report_job_endpoint FOREIGN KEY (endpoint_id) REFERENCES external_report_endpoint(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_external_report_job_definition FOREIGN KEY (report_definition_id) REFERENCES external_report_definition(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Upgrade aman bila migration versi awal sudah sempat dijalankan.
SET @sql_add_report_permission := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_definition' AND COLUMN_NAME='required_permission'),
  'SELECT 1',
  'ALTER TABLE external_report_definition ADD COLUMN required_permission VARCHAR(80) DEFAULT NULL AFTER default_params'
);
PREPARE stmt_add_report_permission FROM @sql_add_report_permission;
EXECUTE stmt_add_report_permission;
DEALLOCATE PREPARE stmt_add_report_permission;

SET @sql_add_report_user := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_report_job' AND COLUMN_NAME='requested_user_id'),
  'SELECT 1',
  'ALTER TABLE external_report_job ADD COLUMN requested_user_id INT DEFAULT NULL AFTER requested_by'
);
PREPARE stmt_add_report_user FROM @sql_add_report_user;
EXECUTE stmt_add_report_user;
DEALLOCATE PREPARE stmt_add_report_user;

INSERT INTO external_report_endpoint
  (endpoint_name,catalog_url,auth_header_name,auth_header_value,timeout_seconds,status,notes,created_by,updated_by,created_at,updated_at)
VALUES
  ('MCS Reporting Async','http://192.168.10.100:5007/reports',NULL,NULL,30,'ACTIVE',
   'Authorization meneruskan token user MCS yang sedang login.','SYSTEM','SYSTEM',NOW(),NOW())
ON DUPLICATE KEY UPDATE catalog_url=VALUES(catalog_url),auth_header_name=NULL,auth_header_value=NULL,status='ACTIVE',notes=VALUES(notes),updated_at=NOW();

SET @mcs_report_endpoint_id := (SELECT id FROM external_report_endpoint WHERE endpoint_name='MCS Reporting Async' LIMIT 1);

INSERT INTO external_report_async_config (endpoint_id,base_url,system_code,created_at,updated_at)
VALUES (@mcs_report_endpoint_id,'http://192.168.10.100:5007/reports','mcs',NOW(),NOW())
ON DUPLICATE KEY UPDATE base_url=VALUES(base_url),system_code=VALUES(system_code),updated_at=NOW();

INSERT INTO external_report_definition
  (endpoint_id,report_type,report_title,description,category,output_format,default_params,required_permission,status,created_at,updated_at)
VALUES
  (@mcs_report_endpoint_id,'report-assets','Laporan Assets','Laporan daftar asset dari layanan reporting/Gotenberg.',
   'Asset Management','PDF','{}','report_asset','ACTIVE',NOW(),NOW())
ON DUPLICATE KEY UPDATE report_title=VALUES(report_title),description=VALUES(description),category=VALUES(category),
  output_format=VALUES(output_format),default_params=VALUES(default_params),required_permission=VALUES(required_permission),status=VALUES(status),updated_at=NOW();
