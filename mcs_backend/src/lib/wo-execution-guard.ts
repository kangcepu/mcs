import { HttpError } from '../http.js';

/**
 * Status header WO yang menandakan approval awal sudah selesai dan pekerjaan
 * boleh disentuh oleh executor. Guard ini wajib tetap ada di server karena UI
 * mobile/web lama masih dapat mengirim request langsung.
 */
const EXECUTION_READY_STATUSES = new Set([
  'WAIT_EXECUTOR_ADMIN',
  'IN_PROGRESS',
  'IN_PROGRESS_EXECUTOR',
  'WAITING_PARTS',
  'PARTS_RECEIVED',
  'COMPLETE_EXECUTOR',
]);

export function isWoExecutionReady(status: unknown): boolean {
  return EXECUTION_READY_STATUSES.has(String(status ?? '').trim().toUpperCase());
}

export function assertWoExecutionReady(status: unknown): void {
  if (!isWoExecutionReady(status)) {
    throw new HttpError(409, 'WO belum disetujui Kadiv atau belum masuk tahap eksekusi.');
  }
}
