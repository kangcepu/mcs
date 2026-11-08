-- Integrasi pemakaian bahan bakar genset dengan kartu stok Fuel Tank.
-- Extension only: tidak mengubah tabel asset maupun data operasi/movement existing.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS energy_genset_fuel_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  genset_operation_id BIGINT UNSIGNED NOT NULL,
  fuel_tank_id BIGINT UNSIGNED NOT NULL,
  fuel_movement_id BIGINT UNSIGNED DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_energy_genset_fuel_usage_operation (genset_operation_id),
  UNIQUE KEY uq_energy_genset_fuel_usage_movement (fuel_movement_id),
  KEY idx_energy_genset_fuel_usage_tank (fuel_tank_id, created_at),
  CONSTRAINT fk_energy_genset_fuel_usage_operation
    FOREIGN KEY (genset_operation_id) REFERENCES energy_genset_operation (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_genset_fuel_usage_tank
    FOREIGN KEY (fuel_tank_id) REFERENCES energy_fuel_tank (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_energy_genset_fuel_usage_movement
    FOREIGN KEY (fuel_movement_id) REFERENCES energy_fuel_movement (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
