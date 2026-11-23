import { execute, one, rows, tableExists, transaction, withNamedLock } from '../db.js';
import { analyzeCalibrationImage } from './ai-image-analysis.js';
import { readStoredFile } from './storage.js';

interface QueueRow {
  id: number;
  asset_code: string;
  asset_name: string;
  activity_name: string;
  reference_note: string | null;
  image_object_key: string;
  image_mime_type: string;
  retry_count: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 4000) : 'Analisis gambar gagal.';
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(1800, 30 * (2 ** Math.min(6, Math.max(0, attempt - 1))));
}

async function analyzeOne(row: QueueRow): Promise<void> {
  const claimed = await execute(
    `UPDATE ai_image_analysis SET status='PROCESSING',max_retry=0,processing_started_at=NOW(),last_attempt_at=NOW(),updated_at=NOW()
     WHERE id=? AND (status IN ('QUEUED','RETRY_WAIT','FAILED') OR
       (status='PROCESSING' AND (processing_started_at IS NULL OR processing_started_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE))))`,
    [row.id],
  );
  if (claimed.affectedRows !== 1) return;

  try {
    const hasImageTable = await tableExists('ai_image_analysis_image');
    const imageRows = hasImageTable
      ? await rows<{ object_key: string; mime_type: string }>(
        'SELECT object_key,mime_type FROM ai_image_analysis_image WHERE analysis_id=? ORDER BY sequence_no,id', [row.id])
      : [{ object_key: row.image_object_key, mime_type: row.image_mime_type }];
    const images = (await Promise.all(imageRows.map(async (item) => {
      const stored = await readStoredFile(item.object_key);
      return stored ? { buffer: stored.buffer, mimeType: item.mime_type || stored.contentType } : null;
    }))).filter((item): item is { buffer: Buffer; mimeType: string } => item !== null);
    if (!images.length) throw new Error('File evidence tidak ditemukan di local storage maupun object storage.');
    const result = await analyzeCalibrationImage({
      images,
      assetCode: row.asset_code,
      assetName: row.asset_name,
      activityName: row.activity_name,
      referenceNote: row.reference_note ?? '',
      sessionId: `mcs-ai-image-analysis-${row.id}`,
    });
    const hasRecommendationTable = await tableExists('ai_image_analysis_recommendation');
    await transaction(async (connection) => {
      await connection.execute('DELETE FROM ai_image_analysis_value WHERE analysis_id=?', [row.id] as never);
      if (hasRecommendationTable) {
        await connection.execute('DELETE FROM ai_image_analysis_recommendation WHERE analysis_id=?', [row.id] as never);
      }
      await connection.execute(
        `UPDATE ai_image_analysis SET raw_text=?,structured_data=?,analysis_summary=?,findings=?,recommendations=?,
          llm_provider=?,llm_model=?,status='ANALYZED',error_message=NULL,next_retry_at=NULL,
          processing_started_at=NULL,updated_at=NOW() WHERE id=?`,
        [result.raw_text, JSON.stringify(result.raw_response), result.summary, JSON.stringify(result.findings),
          JSON.stringify(result.recommendations), result.provider, result.model, row.id] as never,
      );
      for (let index = 0; index < result.values.length; index += 1) {
        const value = result.values[index];
        await connection.execute(
          `INSERT INTO ai_image_analysis_value
            (analysis_id,sequence_no,section_name,parameter_name,text_value,numeric_value,unit,confidence,assessment,assessment_note)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [row.id, index + 1, value.section || null, value.parameter, value.value || null, value.numeric_value,
            value.unit || null, value.confidence, value.assessment, value.assessment_note || null] as never,
        );
      }
      if (hasRecommendationTable) {
        for (const [type, items] of [['PRODUCT', result.suggested_products], ['RAW_MATERIAL', result.required_materials]] as const) {
          for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            await connection.execute(
              `INSERT INTO ai_image_analysis_recommendation
                (analysis_id,recommendation_type,sequence_no,item_name,specification,estimated_quantity,unit,priority,reason)
               VALUES (?,?,?,?,?,?,?,?,?)`,
              [row.id, type, index + 1, item.item_name, item.specification || null, item.estimated_quantity,
                item.unit || null, item.priority, item.reason || null] as never,
            );
          }
        }
      }
      await connection.execute(
        `INSERT INTO ai_image_analysis_audit (analysis_id,event_type,from_status,to_status,event_note,actor_name)
         VALUES (?,'ANALYZED','PROCESSING','ANALYZED',?,'SYSTEM')`,
        [row.id, `${images.length} foto dianalisis dan ${result.values.length} parameter berhasil dibaca.`] as never,
      );
    });
  } catch (error) {
    const errorMessage = messageOf(error);
    const attempt = Number(row.retry_count ?? 0) + 1;
    const delay = retryDelaySeconds(attempt);
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE ai_image_analysis SET status='RETRY_WAIT',retry_count=?,max_retry=0,error_message=?,
          next_retry_at=DATE_ADD(NOW(),INTERVAL ? SECOND),processing_started_at=NULL,updated_at=NOW()
         WHERE id=?`,
        [attempt, errorMessage, delay, row.id] as never,
      );
      await connection.execute(
        `INSERT INTO ai_image_analysis_audit (analysis_id,event_type,from_status,to_status,event_note,actor_name)
         VALUES (?,'RETRY_SCHEDULED','PROCESSING','RETRY_WAIT',?,'SYSTEM')`,
        [row.id, `Percobaan ${attempt} gagal. Dicoba kembali dalam ${delay} detik tanpa batas jumlah percobaan. ${errorMessage}`] as never,
      );
    });
  }
}

export async function runAiImageAnalysisQueue(limit = 2): Promise<number> {
  if (!await tableExists('ai_image_analysis')) return 0;
  return withNamedLock('mcs-ai-image-analysis-worker', async () => {
    const jobs = await rows<QueueRow>(
      `SELECT id,asset_code,asset_name,activity_name,reference_note,image_object_key,image_mime_type,retry_count
       FROM ai_image_analysis
       WHERE ((status IN ('QUEUED','RETRY_WAIT','FAILED') AND (next_retry_at IS NULL OR next_retry_at<=NOW()))
          OR (status='PROCESSING' AND (processing_started_at IS NULL OR processing_started_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE))))
       ORDER BY COALESCE(next_retry_at,created_at),id LIMIT ?`, [limit],
    );
    for (const job of jobs) await analyzeOne(job);
    return jobs.length;
  }, 0).catch((error) => {
    if (error instanceof Error && error.message.includes('Failed to acquire lock')) return 0;
    throw error;
  });
}

/**
 * Kuras semua job yang saat ini sudah jatuh tempo. Job yang gagal akan mendapat
 * next_retry_at di masa depan, sehingga loop berhenti dan dilanjutkan oleh tick
 * berikutnya. Tidak ada batas jumlah percobaan maupun batas jumlah batch.
 */
export async function drainAiImageAnalysisQueue(batchSize = 2): Promise<number> {
  let total = 0;
  while (true) {
    const processed = await runAiImageAnalysisQueue(batchSize);
    total += processed;
    if (processed < batchSize) return total;
  }
}

export function kickAiImageAnalysisQueue(): void {
  setImmediate(() => void drainAiImageAnalysisQueue().catch((error) => console.error('AI image analysis worker failed:', error)));
}
