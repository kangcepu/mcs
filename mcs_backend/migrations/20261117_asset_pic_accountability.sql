-- PIC utama aset, riwayat penugasan, dan fondasi MyWork aset tanpa PIC.
-- Jalankan manual sebelum deploy code 2026-11-17.
-- Kolom dibuat nullable agar data lama tetap valid; aplikasi mewajibkan PIC
-- untuk aset baru/perubahan, sedangkan aset lama tanpa PIC masuk MyWork.

SET @sql_asset_pic_user := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asset' AND COLUMN_NAME='pic_user_id'),
  'SELECT 1',
  'ALTER TABLE asset ADD COLUMN pic_user_id INT NULL AFTER mtc_area_key'
);
PREPARE stmt_asset_pic_user FROM @sql_asset_pic_user;
EXECUTE stmt_asset_pic_user;
DEALLOCATE PREPARE stmt_asset_pic_user;

SET @sql_asset_pic_name := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asset' AND COLUMN_NAME='pic_name'),
  'SELECT 1',
  'ALTER TABLE asset ADD COLUMN pic_name VARCHAR(255) NULL AFTER pic_user_id'
);
PREPARE stmt_asset_pic_name FROM @sql_asset_pic_name;
EXECUTE stmt_asset_pic_name;
DEALLOCATE PREPARE stmt_asset_pic_name;

SET @sql_asset_pic_index := IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asset' AND INDEX_NAME='idx_asset_pic_user'),
  'SELECT 1',
  'ALTER TABLE asset ADD INDEX idx_asset_pic_user (pic_user_id, active)'
);
PREPARE stmt_asset_pic_index FROM @sql_asset_pic_index;
EXECUTE stmt_asset_pic_index;
DEALLOCATE PREPARE stmt_asset_pic_index;

CREATE TABLE IF NOT EXISTS asset_pic_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  asset_code VARCHAR(254) NOT NULL,
  pic_user_id_from INT DEFAULT NULL,
  pic_name_from VARCHAR(255) DEFAULT NULL,
  pic_user_id_to INT DEFAULT NULL,
  pic_name_to VARCHAR(255) DEFAULT NULL,
  event_type VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
  note VARCHAR(500) DEFAULT NULL,
  changed_by VARCHAR(254) DEFAULT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asset_pic_history_asset (asset_id, changed_at),
  KEY idx_asset_pic_history_pic (pic_user_id_to, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TRIGGER IF EXISTS trg_asset_pic_history_insert;
CREATE TRIGGER trg_asset_pic_history_insert
AFTER INSERT ON asset
FOR EACH ROW
INSERT INTO asset_pic_history
  (asset_id,asset_code,pic_user_id_to,pic_name_to,event_type,note,changed_by,changed_at)
SELECT NEW.AssetID,NEW.AssetCode,NEW.pic_user_id,NEW.pic_name,'ASSIGNED',
       'PIC ditetapkan saat aset dibuat',NEW.created_by,COALESCE(NEW.created_at,NOW())
WHERE NEW.pic_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_asset_pic_history_update;
CREATE TRIGGER trg_asset_pic_history_update
AFTER UPDATE ON asset
FOR EACH ROW
INSERT INTO asset_pic_history
  (asset_id,asset_code,pic_user_id_from,pic_name_from,pic_user_id_to,pic_name_to,
   event_type,note,changed_by,changed_at)
SELECT NEW.AssetID,NEW.AssetCode,OLD.pic_user_id,OLD.pic_name,NEW.pic_user_id,NEW.pic_name,
       CASE
         WHEN OLD.pic_user_id IS NULL AND NEW.pic_user_id IS NOT NULL THEN 'ASSIGNED'
         WHEN OLD.pic_user_id IS NOT NULL AND NEW.pic_user_id IS NULL THEN 'UNASSIGNED'
         ELSE 'TRANSFERRED'
       END,
       'PIC utama aset diperbarui',NEW.updated_by,NOW()
WHERE NOT (OLD.pic_user_id <=> NEW.pic_user_id)
   OR NOT (OLD.pic_name <=> NEW.pic_name);
