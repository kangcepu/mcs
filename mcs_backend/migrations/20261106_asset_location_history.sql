-- Riwayat lokasi aset.
-- Aman dijalankan ulang: tabel/backfill memakai IF NOT EXISTS/NOT EXISTS dan
-- trigger lama diganti dengan definisi terbaru.

CREATE TABLE IF NOT EXISTS asset_location_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT NOT NULL,
  asset_code VARCHAR(80) NOT NULL,
  company_from VARCHAR(255) DEFAULT NULL,
  company_to VARCHAR(255) DEFAULT NULL,
  location_from VARCHAR(255) DEFAULT NULL,
  location_to VARCHAR(255) DEFAULT NULL,
  event_type VARCHAR(30) NOT NULL DEFAULT 'MOVED',
  source VARCHAR(40) NOT NULL DEFAULT 'ASSET_UPDATE',
  reference_no VARCHAR(120) DEFAULT NULL,
  note VARCHAR(255) DEFAULT NULL,
  changed_by VARCHAR(120) DEFAULT NULL,
  moved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asset_location_history_asset (asset_id, moved_at),
  KEY idx_asset_location_history_code (asset_code, moved_at),
  KEY idx_asset_location_history_reference (reference_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ambil mutasi yang sudah pernah disetujui agar perpindahan lama langsung
-- terlihat, bukan hanya perubahan yang terjadi setelah fitur ini dipasang.
INSERT INTO asset_location_history (
  asset_id, asset_code, company_from, company_to, location_from, location_to,
  event_type, source, reference_no, note, changed_by, moved_at
)
SELECT
  a.AssetID,
  a.AssetCode,
  h.company_before,
  d.company_after,
  h.location_before,
  d.location_after,
  'MOVED',
  'ASSET_MUTATION',
  h.doc_no,
  d.mutation_purpose,
  COALESCE(ap.fullname, h.creator),
  COALESCE(ap.approved_at, h.created_at, CONCAT(h.date, ' 00:00:00'))
FROM asset_mutation_header h
JOIN asset_mutation_detail d ON d.doc_no = h.doc_no
JOIN asset a ON a.AssetID = d.AssetID OR (d.AssetID IS NULL AND a.AssetCode = d.AssetCode)
LEFT JOIN (
  SELECT doc_no, MAX(fullname) AS fullname, MAX(approved_at) AS approved_at
  FROM approval_asset_mutation
  GROUP BY doc_no
) ap ON ap.doc_no = h.doc_no
WHERE UPPER(h.status) = 'APPROVED'
  AND NOT EXISTS (
    SELECT 1
    FROM asset_location_history x
    WHERE x.asset_id = a.AssetID
      AND x.source = 'ASSET_MUTATION'
      AND x.reference_no = h.doc_no
  );

-- Aset yang belum pernah punya catatan mendapat baseline lokasi saat ini.
INSERT INTO asset_location_history (
  asset_id, asset_code, company_to, location_to, event_type, source,
  reference_no, note, changed_by, moved_at
)
SELECT
  a.AssetID,
  a.AssetCode,
  NULLIF(a.CompanyName, ''),
  NULLIF(a.LocationAsset, ''),
  'INITIAL',
  'MIGRATION_BASELINE',
  CONCAT('BASELINE-', a.AssetID),
  'Lokasi saat fitur riwayat diaktifkan',
  COALESCE(NULLIF(a.updated_by, ''), NULLIF(a.created_by, ''), 'system'),
  COALESCE(a.updated_at, a.created_at, NOW())
FROM asset a
WHERE NOT EXISTS (
  SELECT 1 FROM asset_location_history x WHERE x.asset_id = a.AssetID
);

DROP TRIGGER IF EXISTS trg_asset_location_history_insert;
CREATE TRIGGER trg_asset_location_history_insert
AFTER INSERT ON asset
FOR EACH ROW
INSERT INTO asset_location_history (
  asset_id, asset_code, company_to, location_to, event_type, source,
  note, changed_by, moved_at
)
VALUES (
  NEW.AssetID, NEW.AssetCode, NULLIF(NEW.CompanyName, ''),
  NULLIF(NEW.LocationAsset, ''), 'INITIAL', 'ASSET_CREATE',
  'Lokasi awal aset', COALESCE(NULLIF(NEW.created_by, ''), 'system'),
  COALESCE(NEW.created_at, NOW())
);

DROP TRIGGER IF EXISTS trg_asset_location_history_update;
CREATE TRIGGER trg_asset_location_history_update
AFTER UPDATE ON asset
FOR EACH ROW
INSERT INTO asset_location_history (
  asset_id, asset_code, company_from, company_to, location_from, location_to,
  event_type, source, note, changed_by, moved_at
)
SELECT
  NEW.AssetID,
  NEW.AssetCode,
  NULLIF(OLD.CompanyName, ''),
  NULLIF(NEW.CompanyName, ''),
  NULLIF(OLD.LocationAsset, ''),
  NULLIF(NEW.LocationAsset, ''),
  'MOVED',
  'ASSET_UPDATE',
  'Lokasi atau company aset diperbarui',
  COALESCE(NULLIF(NEW.updated_by, ''), 'system'),
  COALESCE(NEW.updated_at, NOW())
WHERE NOT (OLD.CompanyName <=> NEW.CompanyName)
   OR NOT (OLD.LocationAsset <=> NEW.LocationAsset);
