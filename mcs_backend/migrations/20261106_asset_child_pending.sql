-- Slot aset terkait hasil import yang belum memiliki Asset Code / QR.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS asset_child_pending (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_asset_id INT NOT NULL,
  child_name VARCHAR(255) NOT NULL,
  source_row INT DEFAULT NULL,
  source_file VARCHAR(255) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_child_pending_parent_name (parent_asset_id, child_name),
  KEY idx_asset_child_pending_parent (parent_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
