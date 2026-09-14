import { apiV2 } from "@/lib/api-client";

/**
 * Aksi eksekutor Work Order. Memakai facade kompatibilitas v2
 * (`/v2/{module}/{action}` → controller mobile per-modul), tanpa perubahan
 * backend. `module` = meso | maintenance | production | is | ga.
 */

export type JobStatus = "IN_PROGRESS" | "COMPLETE" | "PENDING";

/**
 * Nama segmen aksi per-modul. MESO (controller mobile `wo_mtc`) memakai
 * `job_explanation` / `labor`; modul lain memakai prefiks `add_`.
 */
const ACTION_PATH: Record<string, { job: string; labor: string }> = {
  meso: { job: "job_explanation", labor: "labor" },
};
const DEFAULT_ACTION_PATH = {
  job: "add_job_explanation",
  labor: "add_labor",
};
function actionPath(module: string, key: "job" | "labor") {
  return (ACTION_PATH[module] ?? DEFAULT_ACTION_PATH)[key];
}

/**
 * POST /v2/{module}/add_job_explanation (multipart).
 * Field wajib: `wo_number`, `job_explanation`, minimal 1 `service_photos[]`.
 * Opsional: `status`, `started_planner`/`started_actual_time`,
 * `finished_planner`/`finished_actual_time`.
 */
export function submitJobExplanation(module: string, fd: FormData) {
  return apiV2.post<{ wo_number: string }>(
    `/${module}/${actionPath(module, "job")}`,
    undefined,
    { formData: fd },
  );
}

/** POST /v2/{module}/add_labor — body {wo_number, trade[], men, hours}. */
export function addWoLabor(
  module: string,
  body: {
    wo_number: string;
    trade: string[];
    men: number | string;
    hours: number | string;
  },
) {
  return apiV2.post<{ inserted: number }>(
    `/${module}/${actionPath(module, "labor")}`,
    body,
  );
}

/**
 * POST /v2/material-usage/request — permohonan part dari eksekutor.
 * Body {wo_number, note?}. Eksekutor TIDAK mengisi nama/jumlah part; tim
 * Sparepart yang memilih part di modul Material Usage. Backend membuat satu
 * baris `tb_material_part_request` PENDING per WO+eksekutor (409 bila sudah ada).
 */
export function requestPart(body: { wo_number: string; note?: string }) {
  return apiV2.post<{ id?: number; wo_number: string; status?: string }>(
    "/material-usage/request",
    { wo_number: body.wo_number, note: body.note ?? "" },
  );
}

/** POST /v2/{module}/complete — body {wo_number, comment?}. Status → NEED_CLOSED. */
export function completeWo(
  module: string,
  body: { wo_number: string; comment?: string },
) {
  return apiV2.post<{ wo_number: string; status: string }>(
    `/${module}/complete`,
    body,
  );
}

/* ---------------- Preventive part checklist (module = maintenance) ---------------- */

export interface PreventivePartRow {
  custom_detail_id: number;
  part_mesin: string;
  bagian_mesin?: string | null;
  tipe_jadwal?: string | null;
  kondisi?: string | null;
  pic?: string | null;
  /** PENDING | DONE */
  maintenance_status?: string;
  /** Eksekutor cukup menandai butuh part — nama/qty diisi tim Sparepart. */
  need_request_part?: boolean;
  /** @deprecated dipertahankan utk kompat payload maintenance lama */
  request_qty?: number;
  request_part?: string;
  request_uom?: string;
  keterangan?: string;
  tampak_jauh?: Array<Record<string, unknown>>;
  tampak_dekat?: Array<Record<string, unknown>>;
  detail_part?: Array<Record<string, unknown>>;
  execution_media?: Array<Record<string, unknown>>;
}

/** Ringkasan permohonan part (satu per WO) yang dikembalikan di `meta`. */
export interface PreventivePartRequestInfo {
  exists: boolean;
  status?: string;
  note?: string;
  requested_by?: string;
  created_at?: string;
}

/**
 * Endpoint checklist part preventive per-modul (semua lewat V2_bridge, TANPA
 * gate `wo_executor` — mengikuti web lama yang hanya butuh login):
 *  - maintenance → `/work-orders/maintenance-parts`
 *  - meso        → `/work-orders/meso-parts`
 */
function preventivePath(module: string) {
  return module === "meso"
    ? "/work-orders/meso-parts"
    : "/work-orders/maintenance-parts";
}

/** GET checklist part preventive untuk sebuah WO. */
export function getPreventiveParts(
  module: string,
  woNumber: string,
  signal?: AbortSignal,
) {
  return apiV2.get<PreventivePartRow[]>(preventivePath(module), {
    params: { wo_number: woNumber },
    signal,
  });
}

/**
 * POST simpan checklist. Eksekutor hanya menandai `need_request_part` — tidak
 * mengisi nama/qty part; tim Sparepart yang memilih part di modul Material Usage.
 * (Field `request_*` dikirim sebagai placeholder qty=1 hanya utk kompat endpoint
 * maintenance lama; endpoint MESO mengabaikannya.)
 */
export function savePreventiveParts(
  module: string,
  woNumber: string,
  rows: Array<{
    custom_detail_id: number;
    part_mesin: string;
    bagian_mesin?: string;
    maintenance_status: "PENDING" | "DONE";
    need_request_part?: boolean;
    keterangan?: string;
  }>,
) {
  const payload = rows.map((r) => ({
    ...r,
    request_qty: r.need_request_part ? 1 : 0,
    request_part: r.part_mesin,
    request_uom: "PCS",
  }));
  return apiV2.post<{ wo_number: string; requested?: number; updated?: number }>(
    preventivePath(module),
    { wo_number: woNumber, rows: payload },
  );
}

/** POST /v2/maintenance/forward — teruskan WO ke tim MESO/MTC. */
export function forwardWoToMeso(woNumber: string, comment?: string) {
  return apiV2.post<{ wo_number: string }>("/maintenance/forward", {
    wo_number: woNumber,
    to_division: "MESO",
    comment: comment ?? "Diteruskan ke MESO",
  });
}
