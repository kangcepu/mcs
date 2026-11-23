-- Multi-foto untuk satu proses AI Image Analysis.
-- Jalankan manual setelah 20261121_ai_image_calibration_analysis.sql.
-- Aman dijalankan ulang dan tidak mengubah data analisis lama.

CREATE TABLE IF NOT EXISTS ai_image_analysis_image (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_id BIGINT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL DEFAULT 1,
  file_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_analysis_image_sequence (analysis_id, sequence_no),
  KEY idx_ai_analysis_image_header (analysis_id),
  CONSTRAINT fk_ai_analysis_image_header
    FOREIGN KEY (analysis_id) REFERENCES ai_image_analysis(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Masukkan foto utama record lama ke koleksi multi-foto.
INSERT INTO ai_image_analysis_image
  (analysis_id, sequence_no, file_name, object_key, mime_type, created_at)
SELECT id, 1, image_file_name, image_object_key, image_mime_type, created_at
FROM ai_image_analysis a
WHERE NOT EXISTS (
  SELECT 1 FROM ai_image_analysis_image i WHERE i.analysis_id=a.id
);
