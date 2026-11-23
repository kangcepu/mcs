import { execute, rows, tableExists, withNamedLock } from '../db.js';

export async function runDueGeneralAffairSchedules(): Promise<Array<{ id:number; task_number:string }>> {
  if (!(await tableExists('ga_preventive_schedule')) || !(await tableExists('ga_task'))) return [];
  return withNamedLock('mcs:ga-preventive-schedule', async () => {
    const due = await rows<any>(`SELECT s.*,o.company_code,o.site_code,o.location_name,o.risk_level,t.template_name
      FROM ga_preventive_schedule s JOIN ga_area_object o ON o.id=s.area_object_id
      JOIN ga_checklist_template t ON t.id=s.template_id
      WHERE s.status='ACTIVE' AND s.next_due_date<=CURDATE()`);
    const made: Array<{ id:number; task_number:string }> = [];
    for (const schedule of due) {
      const planned = String(schedule.next_due_date).slice(0,10);
      const number = `GA-${schedule.module_code}-${planned.replaceAll('-','')}-${schedule.id}`;
      const result = await execute(`INSERT IGNORE INTO ga_task
        (task_number,module_code,task_type,area_object_id,template_id,schedule_id,title,company_code,site_code,location_name,shift_code,planned_date,due_at,risk_level,maker_user_id,checker_user_id,approver_user_id,status,created_by,created_at)
        VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,CONCAT(?,' 23:59:59'),?,?,?,?, 'PLANNED','SYSTEM',NOW())`,
      [number,schedule.module_code,'PREVENTIVE',schedule.area_object_id,schedule.template_id,schedule.id,schedule.template_name,
        schedule.company_code,schedule.site_code,schedule.location_name,schedule.shift_code,planned,planned,schedule.risk_level,
        schedule.pic_user_id,schedule.checker_user_id,schedule.approver_user_id]);
      if (result.affectedRows) made.push({ id:result.insertId, task_number:number });
      await execute(`UPDATE ga_preventive_schedule SET next_due_date=CASE frequency_type
        WHEN 'DAILY' THEN DATE_ADD(next_due_date,INTERVAL interval_value DAY)
        WHEN 'WEEKLY' THEN DATE_ADD(next_due_date,INTERVAL interval_value WEEK)
        WHEN 'MONTHLY' THEN DATE_ADD(next_due_date,INTERVAL interval_value MONTH)
        ELSE DATE_ADD(next_due_date,INTERVAL interval_value DAY) END,updated_at=NOW() WHERE id=?`,[schedule.id]);
    }
    return made;
  }, 0).catch((error) => error instanceof Error && error.message.includes('Failed to acquire lock') ? [] : Promise.reject(error));
}
