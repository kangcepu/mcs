import { rows } from '../db.js';
import { resolveCompanyCode } from './employee-api.js';
import { normalizeTypeWo } from '../routes/work-orders.js';

// Tab "History" di halaman detail Aset (web) sebelumnya selalu kosong —
// backend `/assets/detail` gak pernah ngirim field `history` sama sekali.
// Modul ini bikin riwayat WO per-aset yang real, lintas SEMUA modul & SEMUA
// tipe WO (preventive/corrective/project) — beda dari `buildHistory()` di
// report-equipment.ts yang sengaja cuma ambil Corrective buat laporan
// "Kartu Historikal Mesin" tersendiri, dan cuma 4 dari 5 modul (GA ketinggalan).

const WO_SOURCES: { table: string; label: string }[] = [
  { table: 'tb_wo_mtc', label: 'MESO' },
  { table: 'tb_wo_mtc_operational', label: 'MAINTENANCE' },
  { table: 'tb_wo_it', label: 'IS' },
  { table: 'tb_wo_ga', label: 'GA' },
  { table: 'tb_wo_preventive', label: 'PRODUCTION' },
];

const STATUS_LABELS: Record<string, string> = {
  WAIT_KA_DIV: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_MTC: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_ITIS: 'Menunggu Ka. Divisi',
  WAIT_KA_DIV_HRGA: 'Menunggu Ka. Divisi',
  WAIT_KA_DEPT_MESO: 'Menunggu Ka. Dept. MESO',
  WAIT_EXECUTOR_ADMIN: 'Menunggu Admin Eksekutor',
  IN_PROGRESS_EXECUTOR: 'Dikerjakan',
  WAITING_PARTS: 'Menunggu Part',
  PARTS_RECEIVED: 'Part Diterima',
  NEED_CLOSED: 'Perlu Ditutup',
  COMPLETE_EXECUTOR: 'Selesai Eksekutor',
  COMPLETE: 'Selesai',
  CLOSED: 'Ditutup',
  DECLINE: 'Ditolak',
  REJECT: 'Ditolak',
  VOID: 'Dibatalkan',
  CHECKING_KA_DEPT_MESO: 'Pemeriksaan Ka. Dept. MESO',
  FORWARD_TO_MESO: 'Dilimpahkan ke MESO',
};

function mapStatus(status: string | null | undefined): string {
  const s = String(status ?? '').toUpperCase();
  return STATUS_LABELS[s] ?? s;
}

function parseHours(value: unknown): number {
  const match = String(value ?? '').match(/[\d.,]+/);
  if (!match) return 0;
  return Number(match[0].replace(',', '.')) || 0;
}

export async function buildAssetWoHistory(assetId: number): Promise<Record<string, unknown>[]> {
  const perTable = await Promise.all(
    WO_SOURCES.map(({ table, label }) => {
      // WO MESO yang sebenarnya digenerate dari jadwal Preventive (wo_number
      // yang sama juga ada di tb_wo_preventive) sengaja dikecualikan di sini
      // — sama kayak exclusion di dashboard.ts — biar gak muncul 2x (sekali
      // sebagai MESO, sekali sebagai PRODUCTION) buat kejadian riwayat yang
      // sama.
      const excl = table === 'tb_wo_mtc' ? ' AND NOT EXISTS (SELECT 1 FROM tb_wo_preventive p WHERE p.wo_number = w.wo_number)' : '';
      return rows<Record<string, unknown>>(
        `SELECT wo_number, type_wo, job_title, job_requirement, status, created_at, updated_at, finished_actual, closedDate, company
         FROM ${table} w WHERE id_equipment = ?${excl} ORDER BY created_at DESC`,
        [assetId],
      ).then((list) => list.map((r): Record<string, unknown> => ({ ...r, wo_source: label })));
    }),
  );

  const merged = perTable.flat().sort((a, b) => {
    const ta = new Date(String(a.created_at ?? 0)).getTime();
    const tb = new Date(String(b.created_at ?? 0)).getTime();
    return tb - ta;
  });

  if (!merged.length) return [];
  const woNumbers = merged.map((m) => String(m.wo_number));
  const placeholders = woNumbers.map(() => '?').join(',');

  const [explanations, labor, material] = await Promise.all([
    rows<{ wo_number: string; job_explanation: string }>(
      `SELECT wo_number, job_explanation FROM tb_job_executor WHERE wo_number IN (${placeholders}) AND job_explanation <> '' ORDER BY created_at ASC`,
      woNumbers,
    ),
    rows<{ wo_number: string; trade: string; men: string; hours: string; for: string }>(
      `SELECT wo_number, trade, men, hours, \`for\` FROM tb_detail_labor WHERE wo_number IN (${placeholders})`,
      woNumbers,
    ),
    rows<{ wo_number: string; part: string; material_request: string; uom_request: string; material_usage: string; uom_usage: string }>(
      `SELECT wo_number, part, material_request, uom_request, material_usage, uom_usage FROM tb_material_request WHERE wo_number IN (${placeholders})`,
      woNumbers,
    ),
  ]);

  const explanationsByWo = new Map<string, string[]>();
  for (const e of explanations) {
    const list = explanationsByWo.get(e.wo_number) ?? [];
    list.push(e.job_explanation);
    explanationsByWo.set(e.wo_number, list);
  }
  const laborByWo = new Map<string, typeof labor>();
  for (const l of labor) {
    const list = laborByWo.get(l.wo_number) ?? [];
    list.push(l);
    laborByWo.set(l.wo_number, list);
  }
  const materialByWo = new Map<string, typeof material>();
  for (const m of material) {
    const list = materialByWo.get(m.wo_number) ?? [];
    list.push(m);
    materialByWo.set(m.wo_number, list);
  }

  return merged.map((wo) => {
    const woNumber = String(wo.wo_number);
    const laborRows = laborByWo.get(woNumber) ?? [];
    const totalHours = laborRows.reduce((sum, l) => sum + parseHours(l.hours), 0);
    const status = String(wo.status ?? '').toUpperCase();
    const closedAt = status === 'CLOSED' ? (wo.closedDate ?? wo.finished_actual ?? null) : (wo.finished_actual ?? null);

    return {
      wo_number: woNumber,
      type_wo: normalizeTypeWo(String(wo.type_wo ?? '')) || wo.type_wo,
      wo_source: wo.wo_source,
      job_title: wo.job_title ?? '',
      job_requirement: wo.job_requirement ?? '',
      job_explanation: (explanationsByWo.get(woNumber) ?? []).join(' | '),
      status,
      status_label: mapStatus(status),
      created_at: wo.created_at,
      closed_at: closedAt,
      company: wo.company ? (resolveCompanyCode(String(wo.company)) || wo.company) : null,
      labor: laborRows,
      material: materialByWo.get(woNumber) ?? [],
      total_labor_hours: totalHours,
    };
  });
}
