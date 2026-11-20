-- Audit timeline lengkap untuk perubahan data dan aktivitas aset.
-- Jalankan manual setelah 20261117_asset_pic_accountability.sql.
-- Aman dijalankan ulang; trigger diganti dengan definisi terbaru.

CREATE TABLE IF NOT EXISTS asset_audit_timeline (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  asset_code VARCHAR(254) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(40) NOT NULL DEFAULT 'ASSET_DATA',
  event_summary VARCHAR(500) NOT NULL,
  before_data TEXT DEFAULT NULL,
  after_data TEXT DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id VARCHAR(120) DEFAULT NULL,
  actor_name VARCHAR(254) DEFAULT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asset_audit_asset_time (asset_id,event_at),
  KEY idx_asset_audit_code_time (asset_code,event_at),
  KEY idx_asset_audit_category (event_category,event_at),
  KEY idx_asset_audit_reference (reference_type,reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO asset_audit_timeline
  (asset_id,asset_code,event_type,event_category,event_summary,after_data,reference_type,reference_id,actor_name,event_at)
SELECT a.AssetID,a.AssetCode,'BASELINE','ASSET_DATA','Baseline data aset saat audit timeline diaktifkan',
  JSON_OBJECT('name',a.AssetName,'company',a.CompanyName,'location',a.LocationAsset,'category',a.CategoryAsset,
    'active',a.active,'inventory_it',a.it_ownership_status,'pic_user_id',a.pic_user_id,'pic_name',a.pic_name),
  'MIGRATION',CONCAT('BASELINE-',a.AssetID),'SYSTEM',NOW()
FROM asset a
WHERE NOT EXISTS (
  SELECT 1 FROM asset_audit_timeline x
  WHERE x.asset_id=a.AssetID AND x.event_type='BASELINE' AND x.reference_type='MIGRATION'
);

DROP TRIGGER IF EXISTS trg_asset_audit_insert;
CREATE TRIGGER trg_asset_audit_insert
AFTER INSERT ON asset
FOR EACH ROW
INSERT INTO asset_audit_timeline
  (asset_id,asset_code,event_type,event_category,event_summary,after_data,reference_type,reference_id,actor_name,event_at)
VALUES
  (NEW.AssetID,NEW.AssetCode,'CREATED','ASSET_DATA','Aset dibuat',
   JSON_OBJECT('name',NEW.AssetName,'alias',NEW.AliasName,'brand',NEW.brand,'company',NEW.CompanyName,
     'location',NEW.LocationAsset,'category',NEW.CategoryAsset,'description',NEW.Keterangan,'active',NEW.active,
     'status',NEW.status,'remarks',NEW.Remarks,'maintenance_area',NEW.mtc_area_key,
     'inventory_it',NEW.it_ownership_status,'pic_user_id',NEW.pic_user_id,'pic_name',NEW.pic_name,
     'parent_asset_id',NEW.parent_asset_id),
   'ASSET',CAST(NEW.AssetID AS CHAR),COALESCE(NULLIF(NEW.created_by,''),'SYSTEM'),COALESCE(NEW.created_at,NOW()));

DROP TRIGGER IF EXISTS trg_asset_audit_update;
CREATE TRIGGER trg_asset_audit_update
AFTER UPDATE ON asset
FOR EACH ROW
INSERT INTO asset_audit_timeline
  (asset_id,asset_code,event_type,event_category,event_summary,before_data,after_data,reference_type,reference_id,actor_name,event_at)
SELECT NEW.AssetID,NEW.AssetCode,'UPDATED',
  CASE
    WHEN NOT (OLD.pic_user_id <=> NEW.pic_user_id) OR NOT (OLD.pic_name <=> NEW.pic_name) THEN 'PIC'
    WHEN NOT (OLD.CompanyName <=> NEW.CompanyName) OR NOT (OLD.LocationAsset <=> NEW.LocationAsset) OR NOT (OLD.parent_asset_id <=> NEW.parent_asset_id) THEN 'LOCATION'
    WHEN NOT (OLD.active <=> NEW.active) OR NOT (OLD.status <=> NEW.status) THEN 'STATUS'
    ELSE 'ASSET_DATA'
  END,
  CASE
    WHEN NOT (OLD.pic_user_id <=> NEW.pic_user_id) OR NOT (OLD.pic_name <=> NEW.pic_name) THEN 'PIC utama aset berubah'
    WHEN NOT (OLD.CompanyName <=> NEW.CompanyName) OR NOT (OLD.LocationAsset <=> NEW.LocationAsset) OR NOT (OLD.parent_asset_id <=> NEW.parent_asset_id) THEN 'Lokasi atau relasi induk aset berubah'
    WHEN NOT (OLD.active <=> NEW.active) OR NOT (OLD.status <=> NEW.status) THEN 'Status aset berubah'
    ELSE 'Data utama aset diperbarui'
  END,
  JSON_OBJECT('code',OLD.AssetCode,'name',OLD.AssetName,'alias',OLD.AliasName,'brand',OLD.brand,'company',OLD.CompanyName,
    'location',OLD.LocationAsset,'category',OLD.CategoryAsset,'description',OLD.Keterangan,'active',OLD.active,
    'status',OLD.status,'remarks',OLD.Remarks,'maintenance_area',OLD.mtc_area_key,'inventory_it',OLD.it_ownership_status,
    'pic_user_id',OLD.pic_user_id,'pic_name',OLD.pic_name,'parent_asset_id',OLD.parent_asset_id),
  JSON_OBJECT('code',NEW.AssetCode,'name',NEW.AssetName,'alias',NEW.AliasName,'brand',NEW.brand,'company',NEW.CompanyName,
    'location',NEW.LocationAsset,'category',NEW.CategoryAsset,'description',NEW.Keterangan,'active',NEW.active,
    'status',NEW.status,'remarks',NEW.Remarks,'maintenance_area',NEW.mtc_area_key,'inventory_it',NEW.it_ownership_status,
    'pic_user_id',NEW.pic_user_id,'pic_name',NEW.pic_name,'parent_asset_id',NEW.parent_asset_id),
  'ASSET',CAST(NEW.AssetID AS CHAR),COALESCE(NULLIF(NEW.updated_by,''),'SYSTEM'),NOW()
WHERE NOT (OLD.AssetCode <=> NEW.AssetCode)
   OR NOT (OLD.AssetName <=> NEW.AssetName)
   OR NOT (OLD.AliasName <=> NEW.AliasName)
   OR NOT (OLD.brand <=> NEW.brand)
   OR NOT (OLD.CompanyName <=> NEW.CompanyName)
   OR NOT (OLD.CategoryAsset <=> NEW.CategoryAsset)
   OR NOT (OLD.LocationAsset <=> NEW.LocationAsset)
   OR NOT (OLD.Keterangan <=> NEW.Keterangan)
   OR NOT (OLD.active <=> NEW.active)
   OR NOT (OLD.status <=> NEW.status)
   OR NOT (OLD.Remarks <=> NEW.Remarks)
   OR NOT (OLD.mtc_area_key <=> NEW.mtc_area_key)
   OR NOT (OLD.it_ownership_status <=> NEW.it_ownership_status)
   OR NOT (OLD.pic_user_id <=> NEW.pic_user_id)
   OR NOT (OLD.pic_name <=> NEW.pic_name)
   OR NOT (OLD.parent_asset_id <=> NEW.parent_asset_id);
