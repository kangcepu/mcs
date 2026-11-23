-- Rekomendasi produk dan bahan baku hasil AI Image Analysis.
-- Jalankan manual setelah 20261121_ai_image_calibration_analysis.sql.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS ai_image_analysis_recommendation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_id BIGINT UNSIGNED NOT NULL,
  recommendation_type VARCHAR(30) NOT NULL,
  sequence_no INT UNSIGNED NOT NULL DEFAULT 0,
  item_name VARCHAR(255) NOT NULL,
  specification VARCHAR(500) DEFAULT NULL,
  estimated_quantity DECIMAL(20,4) DEFAULT NULL,
  unit VARCHAR(60) DEFAULT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  reason VARCHAR(1000) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_analysis_recommendation_header (analysis_id, recommendation_type, sequence_no),
  CONSTRAINT fk_ai_analysis_recommendation_header
    FOREIGN KEY (analysis_id) REFERENCES ai_image_analysis(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
