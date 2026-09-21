import { execute, one, pool, rows } from '../db.js';
import { isFcmConfigured, sendToTokens } from './fcm.js';

let schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await execute(`CREATE TABLE IF NOT EXISTS tb_preventive_alarm_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    alarm_date DATE NOT NULL,
    id_user INT NOT NULL,
    wo_count INT NOT NULL DEFAULT 0,
    wo_numbers TEXT DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    sent_at DATETIME DEFAULT NULL,
    last_error TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_preventive_alarm_recipient (alarm_date, id_user),
    KEY idx_preventive_alarm_status (alarm_date, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  schemaReady = true;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

interface OpenPreventiveRow {
  source: string;
  wo_number: string;
  date: string;
  status: string;
  type_wo: string | null;
  job_title: string | null;
  job_executor: string | null;
}

async function getOpenRowsFromTable(table: string, source: string, date: string): Promise<OpenPreventiveRow[]> {
  return rows<OpenPreventiveRow>(
    `SELECT ? AS source, wo.wo_number, wo.date, wo.status, wo.type_wo, wo.job_title, wo.job_executor
     FROM \`${table}\` wo
     WHERE wo.date = ?
       AND (UPPER(COALESCE(wo.type_wo, '')) LIKE '%PREV%' OR wo.wo_number LIKE 'WOPR-%/MTC/%')
       AND (UPPER(COALESCE(wo.status, '')) IN ('IN_PROGRESS', 'IN_PROGRESS_EXECUTOR')
            OR EXISTS (SELECT 1 FROM tb_job_executor je WHERE je.wo_number = wo.wo_number AND UPPER(COALESCE(je.status, '')) = 'IN_PROGRESS'))
     ORDER BY wo.wo_number ASC`,
    [source, date],
  );
}

export async function getOpenPreventiveRows(date: string): Promise<OpenPreventiveRow[]> {
  if (!isValidDate(date)) return [];
  const combined = [...await getOpenRowsFromTable('tb_wo_mtc', 'WO MESO', date), ...await getOpenRowsFromTable('tb_wo_mtc_operational', 'WO MTC', date)];
  return combined.sort((a, b) => String(a.wo_number).localeCompare(String(b.wo_number)));
}

export async function getRecipientUserIds(): Promise<number[]> {
  const recipients = await rows<{ id_user: number }>('SELECT id_user FROM tb_user WHERE preventive_alarm = 1 AND active = 1');
  return [...new Set(recipients.map((r) => Number(r.id_user)).filter((id) => id > 0))];
}

async function claimRecipient(date: string, userId: number, woRows: OpenPreventiveRow[]): Promise<boolean> {
  await ensureSchema();
  const existing = await one<{ status: string }>('SELECT status FROM tb_preventive_alarm_log WHERE alarm_date=? AND id_user=?', [date, userId]);
  if (existing && String(existing.status).toUpperCase() === 'SENT') return false;

  const woCount = woRows.length;
  const woNumbers = woRows.map((r) => String(r.wo_number ?? '').trim()).filter(Boolean).join(',');
  if (existing) {
    await execute('UPDATE tb_preventive_alarm_log SET wo_count=?, wo_numbers=?, status=?, last_error=NULL, updated_at=NOW() WHERE alarm_date=? AND id_user=?', [woCount, woNumbers, 'PROCESSING', date, userId]);
  } else {
    await execute('INSERT INTO tb_preventive_alarm_log (alarm_date, id_user, wo_count, wo_numbers, status, created_at, updated_at) VALUES (?,?,?,?,?,NOW(),NOW())', [date, userId, woCount, woNumbers, 'PROCESSING']);
  }
  return true;
}

async function markRecipientResult(date: string, userId: number, status: 'SENT' | 'NO_TOKEN' | 'FAILED', error: string | null = null): Promise<void> {
  const sentAt = status === 'SENT' ? ', sent_at=NOW()' : '';
  await execute(`UPDATE tb_preventive_alarm_log SET status=?, last_error=?, updated_at=NOW()${sentAt} WHERE alarm_date=? AND id_user=?`, [status, error, date, userId]);
}

function buildPayload(date: string, woRows: OpenPreventiveRow[]) {
  const numbers = woRows.map((r) => String(r.wo_number ?? '').trim()).filter(Boolean);
  const preview = numbers.slice(0, 3);
  let body = `${woRows.length} WO Preventive hari ini masih In Progress dan belum Complete.`;
  if (preview.length) body += ` ${preview.join(', ')}${numbers.length > preview.length ? ', ...' : ''}`;

  return {
    title: 'Preventive Alarm',
    body,
    dataOnly: true,
    androidChannelId: 'mcs_preventive_alarm_v4',
    androidSound: 'preventive_alarm',
    data: {
      type: 'preventive_alarm',
      alarm_date: date,
      wo_count: String(woRows.length),
      wo_numbers: numbers.join(','),
      alarm_sound_url: '',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
  };
}

export interface PreventiveAlarmResult {
  ran: boolean;
  reason?: string;
  woCount?: number;
  sentUsers?: number;
  failedUsers?: number;
}

export async function runPreventiveAlarmCron(dateInput?: string): Promise<PreventiveAlarmResult> {
  const date = dateInput && isValidDate(dateInput) ? dateInput : new Date().toISOString().slice(0, 10);
  const connection = await pool.getConnection();
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('mcs_preventive_alarm', 0) AS acquired");
    const acquired = Number((lockRows as { acquired: number }[])[0]?.acquired ?? 0) === 1;
    if (!acquired) return { ran: false, reason: 'Another process is still running.' };

    try {
      const openRows = await getOpenPreventiveRows(date);
      if (!openRows.length) return { ran: false, reason: `No in-progress preventive WO for ${date}.` };

      const recipients = await getRecipientUserIds();
      if (!recipients.length) return { ran: false, reason: 'No active user has the preventive_alarm permission.' };

      if (!(await isFcmConfigured())) return { ran: false, reason: 'Firebase service account is not configured.' };

      const tokenRows = await rows<{ id_user: number; token: string }>(
        `SELECT id_user, token FROM tb_user_device_token WHERE id_user IN (${recipients.map(() => '?').join(',')}) AND is_active=1 AND TRIM(COALESCE(token,'')) <> ''`,
        recipients,
      );
      const tokensByUser = new Map<number, string[]>();
      for (const row of tokenRows) {
        const list = tokensByUser.get(row.id_user) ?? [];
        list.push(row.token);
        tokensByUser.set(row.id_user, list);
      }

      const payload = buildPayload(date, openRows);
      let sentUsers = 0;
      let failedUsers = 0;
      const invalidTokens: string[] = [];

      for (const userId of recipients) {
        if (!(await claimRecipient(date, userId, openRows))) continue;

        const tokens = tokensByUser.get(userId) ?? [];
        if (!tokens.length) {
          await markRecipientResult(date, userId, 'NO_TOKEN', 'No active FCM token');
          continue;
        }

        const result = await sendToTokens(tokens, payload);
        invalidTokens.push(...result.invalidTokens);
        if (result.sent > 0) {
          await markRecipientResult(date, userId, 'SENT');
          sentUsers++;
        } else {
          await markRecipientResult(date, userId, 'FAILED', 'FCM did not accept the message');
          failedUsers++;
        }
      }

      if (invalidTokens.length) {
        const unique = [...new Set(invalidTokens)];
        await execute(`UPDATE tb_user_device_token SET is_active=0, updated_at=NOW() WHERE token IN (${unique.map(() => '?').join(',')})`, unique);
      }

      return { ran: true, woCount: openRows.length, sentUsers, failedUsers };
    } finally {
      await connection.query("SELECT RELEASE_LOCK('mcs_preventive_alarm')");
    }
  } finally {
    connection.release();
  }
}
