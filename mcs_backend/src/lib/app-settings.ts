import { execute, one } from '../db.js';

let ready = false;
export async function ensureAppSettingTable(): Promise<void> {
  if (ready) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_app_setting (
    skey VARCHAR(64) NOT NULL, svalue LONGTEXT NULL, updated_at DATETIME NULL, PRIMARY KEY (skey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready = true;
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  await ensureAppSettingTable();
  const row = await one<{ svalue: string | null }>('SELECT svalue FROM tb_app_setting WHERE skey = ?', [key]);
  return row && row.svalue !== null ? String(row.svalue) : fallback;
}

export async function putSetting(key: string, value: string): Promise<void> {
  await ensureAppSettingTable();
  await execute('INSERT INTO tb_app_setting (skey,svalue,updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue),updated_at=NOW()', [key, value]);
}

export async function deleteSetting(key: string): Promise<void> {
  await ensureAppSettingTable();
  await execute('DELETE FROM tb_app_setting WHERE skey=?', [key]);
}
