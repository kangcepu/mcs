import { HttpError } from '../http.js';
import { jsonrepair } from 'jsonrepair';
import sharp from 'sharp';
import { getOpenCodeVisionRuntimeConfig } from './opencode-llm.js';

export interface ImageAnalysisValue {
  section: string;
  parameter: string;
  value: string;
  numeric_value: number | null;
  unit: string;
  confidence: number | null;
  assessment: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNASSESSED';
  assessment_note: string;
}

export interface ImageAnalysisRecommendation {
  item_name: string;
  specification: string;
  estimated_quantity: number | null;
  unit: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
}

export interface CalibrationImageAnalysis {
  raw_text: string;
  machine_label: string;
  calibration_label: string;
  captured_at: string | null;
  summary: string;
  findings: Array<{ severity: string; title: string; description: string }>;
  recommendations: string[];
  suggested_products: ImageAnalysisRecommendation[];
  required_materials: ImageAnalysisRecommendation[];
  values: ImageAnalysisValue[];
  model: string;
  provider: 'OPENCODE_GO';
  raw_response: Record<string, unknown>;
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload.output_text)) return payload.output_text.map(text).filter(Boolean).join('\n');
  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const row = item as Record<string, unknown>;
    if (typeof row.text === 'string') chunks.push(row.text);
    const content = Array.isArray(row.content)
      ? row.content as Array<Record<string, unknown>>
      : [];
    for (const part of content) {
      if (typeof part.text === 'string') chunks.push(part.text);
      else if (typeof part.content === 'string') chunks.push(part.content);
    }
  }
  const choices = Array.isArray(payload.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  for (const choice of choices) {
    if (typeof choice.text === 'string') chunks.push(choice.text);
    const message = choice.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') chunks.push(message.content);
    else if (Array.isArray(message?.content)) {
      for (const part of message.content as Array<Record<string, unknown>>) {
        if (typeof part.text === 'string') chunks.push(part.text);
      }
    }
  }
  if (Array.isArray(payload.content)) {
    for (const part of payload.content as Array<Record<string, unknown>>) {
      if (typeof part.text === 'string') chunks.push(part.text);
    }
  }
  for (const key of ['response', 'completion', 'text']) {
    if (typeof payload[key] === 'string') chunks.push(payload[key] as string);
  }
  return chunks.join('\n').trim();
}

function firstJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return value.slice(start, index + 1);
  }
  return value.slice(start);
}

function parseJson(text: string): Record<string, unknown> {
  const withoutThinking = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
  const candidates = [withoutThinking, ...fenced, firstJsonObject(withoutThinking)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    for (const source of [candidate, (() => { try { return jsonrepair(candidate); } catch { return ''; } })()]) {
      if (!source) continue;
      try {
        const parsed = JSON.parse(source) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch { /* coba kandidat berikutnya */ }
    }
  }
  throw new HttpError(502, 'Model berhasil membaca gambar tetapi hasilnya bukan JSON yang valid.', 'LLM_INVALID_JSON');
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestOpenCode(input: {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${input.baseUrl}/openai/v1/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'mcs-ai-vision/1.0',
        'x-opencode-session': input.sessionId,
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const nested = payload.error as Record<string, unknown> | undefined;
      throw new HttpError(502, `Analisis OpenCode Go gagal (HTTP ${response.status}): ${text(nested?.message ?? payload.message) || 'upstream error'}`, 'LLM_ANALYSIS_FAILED');
    }
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new HttpError(504, 'Analisis gambar melewati batas waktu 90 detik.', 'LLM_ANALYSIS_TIMEOUT');
    throw new HttpError(502, error instanceof Error ? error.message : 'Tidak dapat menjalankan analisis gambar.', 'LLM_ANALYSIS_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

async function parseOrRepairJson(input: {
  output: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  sessionId: string;
}): Promise<Record<string, unknown>> {
  try {
    return parseJson(input.output);
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'LLM_INVALID_JSON') throw error;
  }
  const repairPayload = await requestOpenCode({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    sessionId: `${input.sessionId}-json-repair`,
    body: {
      model: input.model,
      max_output_tokens: 8000,
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: `Perbaiki keluaran berikut menjadi SATU objek JSON valid. Pertahankan seluruh teks, angka, array, dan nilai yang sudah ada. Jangan menambahkan markdown, penjelasan, atau data baru. Pastikan field raw_text, machine_label, calibration_label, captured_at, summary, findings, recommendations, suggested_products, required_materials, dan values tersedia.\n\nKELUARAN YANG HARUS DIPERBAIKI:\n${input.output.slice(0, 60000)}`,
        }],
      }],
    },
  });
  const repairedOutput = outputText(repairPayload);
  if (!repairedOutput) throw new HttpError(502, 'Model JSON repair tidak mengembalikan teks.', 'LLM_EMPTY_OUTPUT');
  return parseJson(repairedOutput);
}

export async function analyzeCalibrationImage(input: {
  images: Array<{ buffer: Buffer; mimeType: string }>;
  assetCode: string;
  assetName: string;
  activityName: string;
  referenceNote: string;
  sessionId?: string;
}): Promise<CalibrationImageAnalysis> {
  const runtime = await getOpenCodeVisionRuntimeConfig();
  const normalizedImages = await Promise.all(input.images.slice(0, 8).map((image) => sharp(image.buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()));
  const sessionId = input.sessionId || `mcs-ai-image-${input.assetCode}-${input.activityName}`;
  const prompt = `Anda adalah engineer kalibrasi dan OCR industri. Baca seluruh teks dan angka pada ${normalizedImages.length} foto panel/HMI mesin secara teliti. Semua foto berasal dari asset yang sama dan harus dianalisis sebagai satu rangkaian.

Konteks dari pengguna:
- Asset: ${input.assetCode || '-'} ${input.assetName || ''}
- Aktivitas/kalibrasi: ${input.activityName}
- Acuan atau batas normal: ${input.referenceNote || 'Tidak diberikan. Jangan mengarang batas normal; gunakan UNASSESSED.'}

Kembalikan HANYA JSON valid tanpa markdown dengan struktur:
{
  "raw_text": "transkripsi lengkap semua teks yang terbaca",
  "machine_label": "identitas mesin yang terlihat atau string kosong",
  "calibration_label": "nama layar/kalibrasi yang terlihat",
  "captured_at": "tanggal waktu pada gambar dalam ISO bila terlihat, atau null",
  "summary": "ringkasan teknis singkat dalam Bahasa Indonesia",
  "findings": [{"severity":"INFO|WARNING|CRITICAL","title":"...","description":"..."}],
  "recommendations": ["..."],
  "suggested_products": [{
    "item_name":"kategori/nama produk yang disarankan",
    "specification":"spesifikasi teknis minimum; jangan mengarang merek",
    "estimated_quantity":1,
    "unit":"pcs/liter/set atau string kosong",
    "priority":"LOW|MEDIUM|HIGH|CRITICAL",
    "reason":"alasan teknis dan kaitannya dengan temuan"
  }],
  "required_materials": [{
    "item_name":"nama bahan baku/consumable",
    "specification":"grade/ukuran/karakteristik yang dibutuhkan",
    "estimated_quantity":1,
    "unit":"kg/liter/pcs atau string kosong",
    "priority":"LOW|MEDIUM|HIGH|CRITICAL",
    "reason":"alasan kebutuhan"
  }],
  "values": [{
    "section":"kelompok pada layar",
    "parameter":"nama parameter",
    "value":"nilai persis yang terlihat",
    "numeric_value": 0.0,
    "unit":"unit atau string kosong",
    "confidence": 0.0,
    "assessment":"NORMAL|WARNING|CRITICAL|UNASSESSED",
    "assessment_note":"alasan; bila tidak ada acuan gunakan UNASSESSED"
  }]
}
Jangan menghilangkan angka berulang. Bedakan posisi/step dengan mencantumkannya pada section atau parameter. Confidence antara 0 dan 1.
Rekomendasi produk dan bahan hanya boleh diturunkan dari temuan, aktivitas, atau acuan pengguna. Bila bukti tidak cukup, kembalikan array kosong. Gunakan kategori dan spesifikasi teknis, bukan merek dagang, kecuali merek terlihat jelas pada foto.`;

  try {
    const payload = await requestOpenCode({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      sessionId,
      body: {
        model: runtime.model,
        max_output_tokens: 8000,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: prompt },
          ...normalizedImages.map((image) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${image.toString('base64')}` })),
        ] }],
      },
    });
    const initialOutput = outputText(payload);
    if (!initialOutput) {
      const incomplete = payload.incomplete_details as Record<string, unknown> | undefined;
      throw new HttpError(502,
        `Model tidak mengembalikan teks OCR${payload.status ? ` (status ${text(payload.status)})` : ''}${incomplete?.reason ? `: ${text(incomplete.reason)}` : ''}.`,
        'LLM_EMPTY_OUTPUT');
    }
    const parsed = await parseOrRepairJson({ output: initialOutput, baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey, model: runtime.model, sessionId });
    const rawValues = Array.isArray(parsed.values) ? parsed.values : [];
    const values: ImageAnalysisValue[] = rawValues.map((item) => {
      const row = item as Record<string, unknown>;
      const assessment = text(row.assessment).toUpperCase();
      return {
        section: text(row.section), parameter: text(row.parameter) || 'Parameter tanpa nama', value: text(row.value),
        numeric_value: nullableNumber(row.numeric_value), unit: text(row.unit), confidence: nullableNumber(row.confidence),
        assessment: ['NORMAL', 'WARNING', 'CRITICAL'].includes(assessment) ? assessment as ImageAnalysisValue['assessment'] : 'UNASSESSED',
        assessment_note: text(row.assessment_note),
      };
    });
    const recommendationRows = (value: unknown): ImageAnalysisRecommendation[] =>
      (Array.isArray(value) ? value : []).map((item) => {
        const row = item as Record<string, unknown>;
        const priority = text(row.priority).toUpperCase();
        return {
          item_name: text(row.item_name),
          specification: text(row.specification),
          estimated_quantity: nullableNumber(row.estimated_quantity),
          unit: text(row.unit),
          priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)
            ? priority as ImageAnalysisRecommendation['priority'] : 'MEDIUM',
          reason: text(row.reason),
        };
      }).filter((item) => item.item_name);
    if (!text(parsed.raw_text) && !text(parsed.summary) && values.length === 0) {
      throw new HttpError(502, 'Model mengembalikan JSON kosong tanpa teks OCR atau parameter.', 'LLM_EMPTY_RESULT');
    }
    return {
      raw_text: text(parsed.raw_text), machine_label: text(parsed.machine_label), calibration_label: text(parsed.calibration_label),
      captured_at: text(parsed.captured_at) || null, summary: text(parsed.summary),
      findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map((item) => {
        const row = item as Record<string, unknown>;
        return { severity: text(row.severity) || 'INFO', title: text(row.title), description: text(row.description) };
      }),
      recommendations: (Array.isArray(parsed.recommendations) ? parsed.recommendations : []).map(text).filter(Boolean),
      suggested_products: recommendationRows(parsed.suggested_products),
      required_materials: recommendationRows(parsed.required_materials),
      values, model: runtime.model, provider: 'OPENCODE_GO', raw_response: parsed,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : 'Tidak dapat menjalankan analisis gambar.', 'LLM_ANALYSIS_FAILED');
  }
}
