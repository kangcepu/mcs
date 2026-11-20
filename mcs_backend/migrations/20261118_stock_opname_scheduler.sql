-- Scheduler Stock Opname Asset/BOM dan penugasan petugas.
-- Dokumen SO tetap dibuat oleh service Stock Opname existing; tabel ini hanya
-- menyimpan definisi jadwal, assignee, serta jejak proses scheduler MCS.
-- Jalankan manual pada database MCS sebelum backend versi ini diaktifkan.

CREATE TABLE IF NOT EXISTS stock_opname_schedule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_code VARCHAR(40) NOT NULL,
  schedule_name VARCHAR(180) NOT NULL,
  recurrence_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  interval_value INT UNSIGNED NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  next_run_date DATE NOT NULL,
  is_bom TINYINT(1) NOT NULL DEFAULT 0,
  company_ids TEXT NOT NULL,
  category_ids TEXT NOT NULL,
  location_ids TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) DEFAULT NULL,
  last_run_date DATE DEFAULT NULL,
  created_by_user_id INT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  updated_by VARCHAR(120) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_opname_schedule_code (schedule_code),
  KEY idx_stock_opname_schedule_due (status, next_run_date),
  CONSTRAINT fk_stock_opname_schedule_creator
    FOREIGN KEY (created_by_user_id) REFERENCES tb_user(id_user)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_schedule_assignee (
  schedule_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by VARCHAR(120) DEFAULT NULL,
  PRIMARY KEY (schedule_id, user_id),
  KEY idx_stock_opname_schedule_assignee_user (user_id, schedule_id),
  CONSTRAINT fk_stock_opname_schedule_assignee_schedule
    FOREIGN KEY (schedule_id) REFERENCES stock_opname_schedule(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_stock_opname_schedule_assignee_user
    FOREIGN KEY (user_id) REFERENCES tb_user(id_user)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_opname_schedule_run (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  no_so VARCHAR(30) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  executed_by_user_id INT DEFAULT NULL,
  error_message VARCHAR(1000) DEFAULT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_opname_schedule_run_due (schedule_id, due_date),
  KEY idx_stock_opname_schedule_run_status (status, due_date),
  KEY idx_stock_opname_schedule_run_no_so (no_so),
  CONSTRAINT fk_stock_opname_schedule_run_schedule
    FOREIGN KEY (schedule_id) REFERENCES stock_opname_schedule(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_stock_opname_schedule_run_user
    FOREIGN KEY (executed_by_user_id) REFERENCES tb_user(id_user)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
