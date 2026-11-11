-- MCS Sparepart Foundation (PRD v7 SP01 + fondasi lokasi stok).
-- Extension only: tidak mengubah tabel Asset, WO, atau Material Usage existing.
-- Mapping ERP hanya referensi; migration ini tidak membuat posting ERP/GL.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS sparepart_master (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  part_code VARCHAR(80) NOT NULL,
  part_name VARCHAR(180) NOT NULL,
  part_number VARCHAR(120) DEFAULT NULL,
  category VARCHAR(120) DEFAULT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  model VARCHAR(100) DEFAULT NULL,
  base_uom VARCHAR(30) NOT NULL,
  criticality VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  is_serialized TINYINT(1) NOT NULL DEFAULT 0,
  is_lot_controlled TINYINT(1) NOT NULL DEFAULT 0,
  has_expiry TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  description TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_master_code (part_code),
  KEY idx_sparepart_master_name (part_name),
  KEY idx_sparepart_master_category_status (category, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_asset_compatibility (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  compatibility_type VARCHAR(24) NOT NULL,
  target_key VARCHAR(320) NOT NULL,
  asset_id INT DEFAULT NULL,
  asset_category VARCHAR(255) DEFAULT NULL,
  notes VARCHAR(500) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_compatibility_target (sparepart_id, target_key),
  KEY idx_sparepart_compatibility_asset (asset_id),
  KEY idx_sparepart_compatibility_category (asset_category),
  CONSTRAINT fk_sparepart_compatibility_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sparepart_compatibility_asset
    FOREIGN KEY (asset_id) REFERENCES asset (AssetID)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_warehouse (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_code VARCHAR(60) NOT NULL,
  warehouse_name VARCHAR(160) NOT NULL,
  company_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL',
  location_description VARCHAR(255) DEFAULT NULL,
  custodian_name VARCHAR(120) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_warehouse_code (warehouse_code),
  KEY idx_sparepart_warehouse_company_status (company_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_rack (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  rack_code VARCHAR(60) NOT NULL,
  rack_name VARCHAR(160) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_rack_code (warehouse_id, rack_code),
  CONSTRAINT fk_sparepart_rack_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES sparepart_warehouse (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_bin (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rack_id BIGINT UNSIGNED NOT NULL,
  bin_code VARCHAR(60) NOT NULL,
  bin_name VARCHAR(160) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_bin_code (rack_id, bin_code),
  CONSTRAINT fk_sparepart_bin_rack
    FOREIGN KEY (rack_id) REFERENCES sparepart_rack (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sparepart_erp_mapping (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sparepart_id BIGINT UNSIGNED NOT NULL,
  company_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL',
  erp_system VARCHAR(40) NOT NULL DEFAULT 'ERP_REFERENCE',
  erp_item_code VARCHAR(120) NOT NULL,
  erp_item_name VARCHAR(180) DEFAULT NULL,
  erp_uom VARCHAR(30) DEFAULT NULL,
  sync_mode VARCHAR(24) NOT NULL DEFAULT 'REFERENCE_ONLY',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_reference_at DATETIME DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sparepart_erp_part_company (sparepart_id, company_code, erp_system),
  UNIQUE KEY uq_sparepart_erp_item_company (company_code, erp_system, erp_item_code),
  KEY idx_sparepart_erp_status (status, company_code),
  CONSTRAINT fk_sparepart_erp_mapping_part
    FOREIGN KEY (sparepart_id) REFERENCES sparepart_master (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
