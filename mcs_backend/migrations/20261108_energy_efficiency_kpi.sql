-- Baseline, target, dan KPI efisiensi Energy.
-- Extension only; transaksi Energy existing tetap menjadi sumber data.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_efficiency_kpi (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kpi_code VARCHAR(60) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  kpi_name VARCHAR(180) NOT NULL,
  metric_code VARCHAR(60) NOT NULL,
  scope_type VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
  scope_company VARCHAR(120) DEFAULT NULL,
  energy_profile_id BIGINT UNSIGNED DEFAULT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  direction VARCHAR(24) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  baseline_value DECIMAL(24,6) NOT NULL,
  baseline_start DATE NOT NULL,
  baseline_end DATE NOT NULL,
  target_value DECIMAL(24,6) NOT NULL,
  minimum_value DECIMAL(24,6) NOT NULL,
  weight_percent DECIMAL(8,3) NOT NULL DEFAULT 100,
  owner_name VARCHAR(120) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  activated_by VARCHAR(120) DEFAULT NULL,
  activated_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_efficiency_kpi_version (kpi_code, version_no),
  KEY idx_energy_efficiency_kpi_status_effective (status, effective_from, effective_to),
  KEY idx_energy_efficiency_kpi_scope (scope_type, scope_company, energy_profile_id),
  CONSTRAINT fk_energy_efficiency_kpi_profile
    FOREIGN KEY (energy_profile_id) REFERENCES energy_asset_profile (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
