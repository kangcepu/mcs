import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { one, rows, tableExists, transaction, withNamedLock } from '../db.js';

export type PreventiveModuleCode = 'MESO' | 'MAINTENANCE' | 'PRODUCTION' | 'IS' | 'GA';

const MODULE_TABLES: Record<PreventiveModuleCode, { header: string; detail: string }> = {
  MESO: { header: 'tb_wo_mtc', detail: 'tb_wo_meso_detail' },
  MAINTENANCE: { header: 'tb_wo_mtc_operational', detail: 'tb_wo_mtc_operational_detail' },
  PRODUCTION: { header: 'tb_wo_preventive', detail: 'tb_wo_preventive_detail' },
  IS: { header: 'tb_wo_it', detail: 'tb_wo_it_detail' },
  GA: { header: 'tb_wo_ga', detail: 'tb_wo_ga_detail' },
};

const TERMINAL_STATUSES = ['CLOSED', 'AUTO_CLOSED', 'VOID', 'COMPLETE', 'DONE', 'COMPLETE_EXECUTOR', 'NEED_CLOSED', 'DECLINE', 'REJECT'];

interface HeaderRow extends RowDataPacket {
  wo_number: string;
  date: string;
  closedDate: string | null;
  company: string | null;
  type_wo: string | null;
  id_equipment: number | null;
  status: string | null;
  auto_generate: number | null;
  AssetCode: string | null;
  AssetName: string | null;
}

interface PolicyRow extends RowDataPacket {
  late_tolerance_days: number;
}

interface OlderWoRow extends RowDataPacket {
  wo_number: string;
  planned_date: string;
  status: string | null;
  schedule_detail_id: number | null;
}

export interface PreventiveComplianceResult {
  enabled: boolean;
  processed: boolean;
  auto_closed: number;
  ncr_created: number;
  warning?: string;
}

function isPreventiveType(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase().includes('PREV');
}

function ncrNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `NCR-PREV-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function insertNcr(
  connection: PoolConnection,
  data: {
    sourceKey: string;
    type: 'MISSED_SCHEDULE' | 'LATE_COMPLETION';
    severity: 'MEDIUM' | 'HIGH';
    moduleCode: PreventiveModuleCode;
    woNumber: string;
    triggerWoNumber?: string | null;
    assetId: number | null;
    assetCode: string | null;
    scheduleDetailId: number | null;
    plannedDate: string | null;
    actualCompletionDate?: string | null;
    varianceDays?: number | null;
    title: string;
    description: string;
    actor: string;
  },
): Promise<{ id: number; created: boolean }> {
  const [existingRows] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM preventive_ncr WHERE source_key=? LIMIT 1 FOR UPDATE',
    [data.sourceKey],
  );
  const existingId = Number(existingRows[0]?.id ?? 0);
  if (existingId) return { id: existingId, created: false };

  const [result] = await connection.execute(
    `INSERT INTO preventive_ncr
      (ncr_number,source_key,ncr_type,severity,module_code,wo_number,trigger_wo_number,
       asset_id,asset_code,schedule_detail_id,planned_date,actual_completion_date,variance_days,
       title,description,detected_at,due_date,status,created_by,updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),DATE_ADD(CURDATE(),INTERVAL 7 DAY),'OPEN',?,?,NOW(),NOW())`,
    [ncrNumber(), data.sourceKey, data.type, data.severity, data.moduleCode, data.woNumber,
      data.triggerWoNumber ?? null, data.assetId, data.assetCode, data.scheduleDetailId,
      data.plannedDate, data.actualCompletionDate ?? null, data.varianceDays ?? null,
      data.title, data.description, data.actor, data.actor],
  );
  const id = Number((result as { insertId: number }).insertId);
  await connection.execute(
    `INSERT INTO preventive_ncr_action
      (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at)
     VALUES (?,'AUTO_DETECTED',NULL,'OPEN',?,?,NOW())`,
    [id, data.description, data.actor],
  );
  return { id, created: true };
}

/**
 * Dipanggil sesudah WO benar-benar CLOSED. Error compliance tidak boleh
 * membatalkan response penyelesaian WO yang sudah tersimpan; hasil error
 * dicatat ke log dan proses aman diulang karena source_key bersifat unik.
 */
export async function processPreventiveCompletion(input: {
  moduleCode: PreventiveModuleCode;
  woNumber: string;
  actor?: string;
}): Promise<PreventiveComplianceResult> {
  const empty: PreventiveComplianceResult = { enabled: false, processed: false, auto_closed: 0, ncr_created: 0 };
  try {
    if (!(await tableExists('preventive_ncr')) || !(await tableExists('preventive_auto_close_audit'))) return empty;
    const tables = MODULE_TABLES[input.moduleCode];
    const trigger = await one<HeaderRow>(
      `SELECT h.wo_number,h.date,h.closedDate,h.company,h.type_wo,h.id_equipment,h.status,h.auto_generate,
              a.AssetCode,a.AssetName
       FROM \`${tables.header}\` h LEFT JOIN asset a ON a.AssetID=h.id_equipment
       WHERE h.wo_number=? LIMIT 1`,
      [input.woNumber],
    );
    if (!trigger || String(trigger.status).toUpperCase() !== 'CLOSED' || !isPreventiveType(trigger.type_wo)) {
      return { ...empty, enabled: true };
    }

    const detailIds = (await rows<{ schedule_detail_id: number }>(
      `SELECT DISTINCT schedule_detail_id FROM \`${tables.detail}\`
       WHERE wo_number=? AND schedule_detail_id IS NOT NULL`,
      [input.woNumber],
    )).map((row) => Number(row.schedule_detail_id)).filter((id) => id > 0);
    if (!detailIds.length || !trigger.id_equipment) return { ...empty, enabled: true };

    return await withNamedLock(`preventive-compliance:${input.moduleCode}:${trigger.id_equipment}`, async () => {
      const actor = String(input.actor || 'SYSTEM');
      const policy = await one<PolicyRow>(
        `SELECT late_tolerance_days FROM preventive_compliance_policy
         WHERE status='ACTIVE' AND company_code IN (?, 'GLOBAL') AND module_code IN (?, 'ALL')
         ORDER BY (company_code=?) DESC,(module_code=?) DESC LIMIT 1`,
        [String(trigger.company ?? 'GLOBAL'), input.moduleCode, String(trigger.company ?? 'GLOBAL'), input.moduleCode],
      );
      const tolerance = Number(policy?.late_tolerance_days ?? 0);
      const placeholders = detailIds.map(() => '?').join(',');
      const terminalPlaceholders = TERMINAL_STATUSES.map(() => '?').join(',');
      const olderRows = await rows<OlderWoRow>(
        `SELECT h.wo_number,h.date AS planned_date,h.status,MIN(d.schedule_detail_id) AS schedule_detail_id
         FROM \`${tables.header}\` h
         JOIN \`${tables.detail}\` d ON d.wo_number=h.wo_number
         WHERE h.id_equipment=? AND h.wo_number<>? AND h.date<?
           AND d.schedule_detail_id IN (${placeholders})
           AND UPPER(COALESCE(h.type_wo,'')) LIKE '%PREV%'
           AND UPPER(COALESCE(h.status,'')) NOT IN (${terminalPlaceholders})
         GROUP BY h.wo_number,h.date,h.status
         ORDER BY h.date ASC`,
        [trigger.id_equipment, trigger.wo_number, trigger.date, ...detailIds, ...TERMINAL_STATUSES],
      );

      return transaction(async (connection) => {
        let autoClosed = 0;
        let created = 0;
        for (const older of olderRows) {
          const [lockedRows] = await connection.query<RowDataPacket[]>(
            `SELECT status FROM \`${tables.header}\` WHERE wo_number=? LIMIT 1 FOR UPDATE`,
            [older.wo_number],
          );
          const currentStatus = String(lockedRows[0]?.status ?? '').toUpperCase();
          if (!currentStatus || TERMINAL_STATUSES.includes(currentStatus)) continue;
          await connection.execute(
            `UPDATE \`${tables.header}\`
             SET status='AUTO_CLOSED',closedDate=NOW(),pic='-',updated_at=NOW() WHERE wo_number=?`,
            [older.wo_number],
          );
          const description = `Preventive ${older.wo_number} belum diselesaikan saat preventive terbaru ${trigger.wo_number} ditutup.`;
          const ncr = await insertNcr(connection, {
            sourceKey: `MISSED_SCHEDULE:${input.moduleCode}:${older.wo_number}`,
            type: 'MISSED_SCHEDULE', severity: 'HIGH', moduleCode: input.moduleCode,
            woNumber: older.wo_number, triggerWoNumber: trigger.wo_number,
            assetId: trigger.id_equipment, assetCode: trigger.AssetCode,
            scheduleDetailId: older.schedule_detail_id, plannedDate: older.planned_date,
            title: `Preventive terlewat - ${trigger.AssetCode ?? older.wo_number}`,
            description, actor,
          });
          if (ncr.created) created += 1;
          await connection.execute(
            `INSERT IGNORE INTO preventive_auto_close_audit
              (module_code,wo_number,trigger_wo_number,asset_id,asset_code,schedule_detail_id,
               planned_date,trigger_planned_date,previous_status,resulting_status,ncr_id,close_reason,closed_by,closed_at)
             VALUES (?,?,?,?,?,?,?,?,?,'AUTO_CLOSED',?,?,?,NOW())`,
            [input.moduleCode, older.wo_number, trigger.wo_number, trigger.id_equipment,
              trigger.AssetCode, older.schedule_detail_id, older.planned_date, trigger.date,
              currentStatus, ncr.id, description, actor],
          );
          autoClosed += 1;
        }

        const [lateRows] = await connection.query<RowDataPacket[]>(
          'SELECT DATEDIFF(DATE(COALESCE(?,NOW())),DATE(?)) AS variance_days',
          [trigger.closedDate, trigger.date],
        );
        const varianceDays = Number(lateRows[0]?.variance_days ?? 0);
        if (varianceDays > tolerance) {
          const late = await insertNcr(connection, {
            sourceKey: `LATE_COMPLETION:${input.moduleCode}:${trigger.wo_number}`,
            type: 'LATE_COMPLETION', severity: varianceDays > tolerance + 7 ? 'HIGH' : 'MEDIUM',
            moduleCode: input.moduleCode, woNumber: trigger.wo_number,
            assetId: trigger.id_equipment, assetCode: trigger.AssetCode,
            scheduleDetailId: detailIds[0] ?? null, plannedDate: trigger.date,
            actualCompletionDate: trigger.closedDate, varianceDays,
            title: `Preventive terlambat ${varianceDays} hari - ${trigger.AssetCode ?? trigger.wo_number}`,
            description: `WO ${trigger.wo_number} selesai ${varianceDays} hari setelah tanggal rencana; toleransi policy ${tolerance} hari.`,
            actor,
          });
          if (late.created) created += 1;
        }
        return { enabled: true, processed: true, auto_closed: autoClosed, ncr_created: created };
      });
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    console.error('Preventive compliance processing failed:', input, error);
    return { ...empty, enabled: true, warning };
  }
}
