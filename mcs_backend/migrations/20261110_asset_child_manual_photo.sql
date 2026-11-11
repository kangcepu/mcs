-- Penambahan manual Aset Terkait dan dua foto opsional per komponen.
-- Struktur group/detail tetap memakai tabel hasil import agar data manual dan
-- Excel tampil dalam hierarki yang sama. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS asset_child_import_detail_photo (
  detail_id BIGINT UNSIGNED NOT NULL,
  photo_1_path VARCHAR(500) DEFAULT NULL,
  photo_1_name VARCHAR(255) DEFAULT NULL,
  photo_1_mime VARCHAR(120) DEFAULT NULL,
  photo_2_path VARCHAR(500) DEFAULT NULL,
  photo_2_name VARCHAR(255) DEFAULT NULL,
  photo_2_mime VARCHAR(120) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (detail_id),
  CONSTRAINT fk_asset_child_detail_photo
    FOREIGN KEY (detail_id) REFERENCES asset_child_import_detail (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
