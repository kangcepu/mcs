import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { User } from '../types.js';
import { HttpError } from '../http.js';

function actor(user: User): string {
  return String(user.fullname || user.username || 'SYSTEM').trim();
}

function woNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `WO-FLEET/${stamp}/${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function createFleetCorrectiveWo(connection: PoolConnection, input: {
  vehicleId: number;
  assetId: number;
  company?: string | null;
  sourceType: 'INSPECTION' | 'REMINDER' | 'ANOMALY' | 'SERVICE';
  sourceId: number;
  title: string;
  requirement: string;
  priority?: 'Emergency' | 'High' | 'Medium';
  user: User;
}): Promise<string> {
  const [existingRows] = await connection.query(
    'SELECT wo_number FROM fleet_work_order_link WHERE source_type=? AND source_id=? LIMIT 1',
    [input.sourceType, input.sourceId],
  );
  const existing = (existingRows as Array<{ wo_number: string }>)[0];
  if (existing) return existing.wo_number;
  if (!input.user.id_division) throw new HttpError(422, 'User belum memiliki divisi untuk membuat WO Fleet otomatis.');

  const number = woNumber();
  const divisionCode = String(input.user.division_code ?? '').trim() || 'MTC';
  await connection.execute(
    `INSERT INTO tb_wo_mtc
      (wo_number,date,company,shift,type_wo,priority,id_division,id_equipment,job_title,
       running_hours,job_requirement,attachment,job_executor,status,pic,creator,created_at)
     VALUES (?,CURDATE(),?,'NON SHIFT','Corrective',?,?,?,?,0,?,'',?,'WAIT_KA_DIV',?,?,NOW())`,
    [number, input.company ?? '', input.priority ?? 'High', input.user.id_division, input.assetId,
      input.title, input.requirement, divisionCode, divisionCode, actor(input.user)],
  );
  await connection.execute(
    `INSERT INTO tb_job_executor (job_executor,wo_number,job_explanation,status,created_at)
     VALUES (?,?,'','WAITING',NOW())`,
    [divisionCode, number],
  );
  const [link] = await connection.execute<ResultSetHeader>(
    `INSERT INTO fleet_work_order_link
      (vehicle_id,source_type,source_id,wo_module,wo_number,link_type,link_note,created_by,created_at)
     VALUES (?,?,?,'MESO',?,'AUTO_CREATED',?,?,NOW())`,
    [input.vehicleId, input.sourceType, input.sourceId, number, input.requirement, actor(input.user)],
  );
  await connection.execute(
    `INSERT INTO fleet_audit_timeline
      (vehicle_id,entity_type,entity_id,event_type,event_summary,event_data,actor_name,event_at)
     VALUES (?,?,?,'WO_AUTO_CREATED',?,?,?,NOW())`,
    [input.vehicleId, input.sourceType, input.sourceId, `WO otomatis ${number} dibuat`, JSON.stringify({ wo_number: number, link_id: link.insertId }), actor(input.user)],
  );
  return number;
}
