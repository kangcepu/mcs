-- Struktur bertingkat hasil Form Preventive Audit:
-- parent asset -> kelompok/Bagian -> item Asset/checklist.
-- Aman dijalankan ulang. Data dari tabel pending versi awal ikut dimigrasikan.

-- Pastikan tabel versi awal tersedia agar migration ini juga aman pada
-- instalasi baru yang belum sempat menjalankan migration pending terpisah.
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

CREATE TABLE IF NOT EXISTS asset_child_import_group (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_asset_id INT NOT NULL,
  child_name VARCHAR(255) NOT NULL,
  linked_asset_id INT DEFAULT NULL,
  source_row INT DEFAULT NULL,
  source_file VARCHAR(255) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_child_group_parent_name (parent_asset_id, child_name),
  UNIQUE KEY uq_asset_child_group_linked_asset (linked_asset_id),
  KEY idx_asset_child_group_parent (parent_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS asset_child_import_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  condition_text TEXT DEFAULT NULL,
  frequency VARCHAR(80) DEFAULT NULL,
  pic VARCHAR(120) DEFAULT NULL,
  source_row INT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_child_detail_group_item (group_id, item_name),
  KEY idx_asset_child_detail_group (group_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Asset Code / QR berada pada item komponen (CPU, Monitor, Keyboard, dst),
-- bukan pada kelompok/Bagian (Personal Computer 1, CCTV 1, dst).
CREATE TABLE IF NOT EXISTS asset_child_import_detail_link (
  detail_id BIGINT UNSIGNED NOT NULL,
  linked_asset_id INT NOT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (detail_id),
  UNIQUE KEY uq_asset_child_detail_linked_asset (linked_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO asset_child_import_group (
  parent_asset_id, child_name, source_row, source_file, created_by, created_at, updated_at
)
SELECT
  p.parent_asset_id, p.child_name, p.source_row, p.source_file,
  p.created_by, p.created_at, p.updated_at
FROM asset_child_pending AS p
ON DUPLICATE KEY UPDATE
  source_row=VALUES(source_row),
  source_file=VALUES(source_file),
  updated_at=COALESCE(VALUES(updated_at), asset_child_import_group.updated_at);
