import mysql from 'mysql2/promise';

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_WO = process.argv.find((a) => a.startsWith('--wo='))?.slice('--wo='.length);

const c = await mysql.createConnection({
  host: '192.168.10.100', port: 3306, database: 'mcs_new',
  user: 'upm', password: 'Utama1234', dateStrings: true, timezone: '+07:00',
});

// Semua WO_MAINTENANCE daily_control yang ADA sekarang (1 baris per WO, hasil
// bug lama) dipakai sebagai TEMPLATE (company/division/asset/title) buat
// baris historis yang mau direkonstruksi.
const currentRows = await c.query(
  `SELECT id, wo_number, activity_date, id_company, id_division, AssetCode, title
   FROM tb_daily_control WHERE source_type='WO_MAINTENANCE'` +
  (ONLY_WO ? ' AND wo_number=?' : ''),
  ONLY_WO ? [ONLY_WO] : [],
).then(([r]) => r);

let totalInserted = 0;
let totalMediaLinked = 0;
let woTouched = 0;

for (const cur of currentRows) {
  const wo = cur.wo_number;
  const [evDays] = await c.query(
    `SELECT DISTINCT DATE(created_at) AS d FROM tb_wo_service_evidence WHERE wo_number=? ORDER BY d`,
    [wo],
  );
  const missingDates = evDays.map((r) => r.d).filter((d) => d !== cur.activity_date);
  if (!missingDates.length) continue;
  woTouched++;

  for (const date of missingDates) {
    // Idempotent: skip kalau baris buat (wo, date) ini udah ada (mis. script
    // dijalankan ulang, atau sync baru udah sempat bikin baris buat hari ini).
    const [existing] = await c.query(
      `SELECT id FROM tb_daily_control WHERE wo_number=? AND source_type='WO_MAINTENANCE' AND activity_date=? LIMIT 1`,
      [wo, date],
    );
    if (existing.length) continue;

    const [dayEvidence] = await c.query(
      `SELECT file_name, file_path, mime_type, created_at, created_by
       FROM tb_wo_service_evidence WHERE wo_number=? AND DATE(created_at)=? ORDER BY id ASC`,
      [wo, date],
    );
    if (!dayEvidence.length) continue;
    const lastEv = dayEvidence[dayEvidence.length - 1];

    const [userRow] = await c.query(`SELECT fullname FROM tb_user WHERE id_user=?`, [lastEv.created_by]);
    const fullname = userRow[0]?.fullname?.trim() || 'System';
    const activityTime = String(lastEv.created_at).split(' ')[1] ?? '00:00:00';

    // Coba ambil komentar approval WO di hari yang sama sebagai catatan yang
    // lebih bermakna dari placeholder generik — kalau gak ada, fallback biasa.
    const [approvalNote] = await c.query(
      `SELECT comment FROM tb_approval WHERE wo_number=? AND DATE(created_at)=? AND comment IS NOT NULL AND TRIM(comment)<>'' ORDER BY created_at DESC LIMIT 1`,
      [wo, date],
    );
    const notes = approvalNote[0]?.comment?.trim() || 'Update WO (direkonstruksi dari evidence)';

    if (DRY_RUN) {
      console.log(`[DRY] ${wo} ${date} ${activityTime} by ${fullname} (${dayEvidence.length} evidence) notes="${notes}"`);
      totalInserted++;
      totalMediaLinked += dayEvidence.length;
      continue;
    }

    const [insertResult] = await c.query(
      `INSERT INTO tb_daily_control (activity_date, activity_time, id_company, id_division, id_user, fullname, AssetCode, wo_number, title, notes, status, source_type, created_by, updated_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [date, activityTime, cur.id_company, cur.id_division, lastEv.created_by, fullname, cur.AssetCode, wo, cur.title, notes, 'POSTED', 'WO_MAINTENANCE', fullname, fullname, `${date} ${activityTime}`],
    );
    const dailyControlId = insertResult.insertId;
    totalInserted++;

    for (const ev of dayEvidence) {
      const path = String(ev.file_path ?? '').trim();
      if (!path) continue;
      const mime = String(ev.mime_type ?? '').trim();
      const mediaType = mime.startsWith('video/') ? 'video' : 'image';
      const mediaName = String(ev.file_name ?? '').trim() || path.split('/').pop() || path;
      await c.query(
        `INSERT INTO tb_daily_control_media (daily_control_id, media_type, media_name, media_path, mime_type, created_at, created_by) VALUES (?,?,?,?,?,?,?)`,
        [dailyControlId, mediaType, mediaName, path, mime || null, ev.created_at, fullname],
      );
      totalMediaLinked++;
    }
  }
}

console.log('---');
console.log('WO touched:', woTouched);
console.log('rows inserted:', totalInserted, DRY_RUN ? '(dry-run, not committed)' : '');
console.log('media linked:', totalMediaLinked);

await c.end();
