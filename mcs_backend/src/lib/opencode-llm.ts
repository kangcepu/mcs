import { HttpError } from '../http.js';
import { deleteSetting, getSetting, putSetting } from './app-settings.js';
import { decryptSecret, encryptSecret } from './crypto-secrets.js';

const API_KEY_SETTING = 'llm_opencode_go_api_key_encrypted';
const BASE_URL_SETTING = 'llm_opencode_go_base_url';
const ENABLED_SETTING = 'llm_opencode_go_enabled';
const DEFAULT_MODEL_SETTING = 'llm_opencode_go_default_model';
const MODELS_SETTING = 'llm_opencode_go_models';
const SYNCED_AT_SETTING = 'llm_opencode_go_models_synced_at';
const UPDATED_AT_SETTING = 'llm_opencode_go_updated_at';
const UPDATED_BY_SETTING = 'llm_opencode_go_updated_by';

export const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/inference/go';

export interface OpenCodeModel {
  id: string;
  name: string;
  owned_by?: string;
  supports_vision?: boolean;
}

export interface OpenCodeLlmSettings {
  provider: 'OPENCODE_GO';
  enabled: boolean;
  base_url: string;
  api_key_set: boolean;
  api_key_hint: string | null;
  default_model: string;
  models: OpenCodeModel[];
  models_synced_at: string;
  updated_at: string;
  updated_by: string;
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new HttpError(422, 'Base URL OpenCode tidak valid.', 'LLM_BASE_URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(422, 'Base URL OpenCode harus menggunakan HTTP atau HTTPS.', 'LLM_BASE_URL');
  }
  return normalized;
}

function parseModels(raw: string): OpenCodeModel[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = item as Record<string, unknown>;
        const id = String(row.id ?? '').trim();
        if (!id) return null;
        return {
          id,
          name: String(row.name ?? row.display_name ?? id).trim() || id,
          ...(row.owned_by ? { owned_by: String(row.owned_by) } : {}),
          ...(typeof row.supports_vision === 'boolean' ? { supports_vision: row.supports_vision } : {}),
        };
      })
      .filter((item): item is OpenCodeModel => item !== null);
  } catch {
    return [];
  }
}

async function readApiKey(): Promise<string> {
  const encrypted = await getSetting(API_KEY_SETTING, '');
  if (!encrypted) return '';
  try {
    return decryptSecret(encrypted);
  } catch {
    throw new HttpError(500, 'API key OpenCode tersimpan tetapi tidak dapat didekripsi.', 'LLM_KEY_DECRYPT');
  }
}

export async function getOpenCodeLlmSettings(): Promise<OpenCodeLlmSettings> {
  const [encrypted, baseUrl, enabled, defaultModel, models, syncedAt, updatedAt, updatedBy] = await Promise.all([
    getSetting(API_KEY_SETTING, ''),
    getSetting(BASE_URL_SETTING, DEFAULT_OPENCODE_BASE_URL),
    getSetting(ENABLED_SETTING, '0'),
    getSetting(DEFAULT_MODEL_SETTING, ''),
    getSetting(MODELS_SETTING, '[]'),
    getSetting(SYNCED_AT_SETTING, ''),
    getSetting(UPDATED_AT_SETTING, ''),
    getSetting(UPDATED_BY_SETTING, ''),
  ]);
  let hint: string | null = null;
  if (encrypted) {
    try {
      const plain = decryptSecret(encrypted);
      hint = plain.length > 4 ? `••••${plain.slice(-4)}` : '••••';
    } catch {
      hint = '••••';
    }
  }
  return {
    provider: 'OPENCODE_GO',
    enabled: enabled === '1',
    base_url: baseUrl || DEFAULT_OPENCODE_BASE_URL,
    api_key_set: encrypted !== '',
    api_key_hint: hint,
    default_model: defaultModel,
    models: parseModels(models),
    models_synced_at: syncedAt,
    updated_at: updatedAt,
    updated_by: updatedBy,
  };
}

/** Konfigurasi rahasia untuk pemanggilan LLM dari service backend saja. */
export async function getOpenCodeRuntimeConfig(): Promise<{
  baseUrl: string;
  apiKey: string;
  model: string;
}> {
  const settings = await getOpenCodeLlmSettings();
  if (!settings.enabled) throw new HttpError(503, 'Integrasi LLM OpenCode belum diaktifkan.', 'LLM_DISABLED');
  const apiKey = await readApiKey();
  if (!apiKey) throw new HttpError(503, 'API key OpenCode belum dikonfigurasi.', 'LLM_NOT_CONFIGURED');
  if (!settings.default_model) throw new HttpError(503, 'Model default OpenCode belum dipilih.', 'LLM_MODEL_NOT_CONFIGURED');
  return { baseUrl: settings.base_url, apiKey, model: settings.default_model };
}

function extractModels(payload: unknown): OpenCodeModel[] {
  const body = payload as Record<string, unknown>;
  const source = Array.isArray(body?.data) ? body.data : Array.isArray(payload) ? payload : [];
  const seen = new Set<string>();
  const models: OpenCodeModel[] = [];
  for (const item of source) {
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? row.model ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: String(row.name ?? row.display_name ?? id).trim() || id,
      ...(row.owned_by ? { owned_by: String(row.owned_by) } : {}),
      supports_vision: (() => {
        const modalities = row.modalities as Record<string, unknown> | undefined;
        const inputs = Array.isArray(modalities?.input) ? modalities.input.map(String) : [];
        return inputs.some((value) => value.startsWith('image'));
      })(),
    });
  }
  return models;
}

async function fetchModels(baseUrl: string, apiKey: string): Promise<OpenCodeModel[]> {
  if (!apiKey) throw new HttpError(422, 'Isi API key OpenCode terlebih dahulu.', 'LLM_API_KEY_REQUIRED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const modelsUrl = normalizedBaseUrl.endsWith('/v1')
      ? `${normalizedBaseUrl}/models`
      : `${normalizedBaseUrl}/v1/models`;
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const errorBody = await response.json() as Record<string, unknown>;
        const nested = errorBody.error as Record<string, unknown> | undefined;
        detail = String(nested?.message ?? errorBody.message ?? '').trim();
      } catch { /* respons upstream bukan JSON */ }
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(422, 'API key OpenCode tidak valid atau tidak memiliki akses.', 'LLM_AUTH');
      }
      throw new HttpError(502, `Gagal membaca model OpenCode (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`, 'LLM_UPSTREAM');
    }
    const models = extractModels(await response.json());
    if (!models.length) throw new HttpError(502, 'OpenCode tidak mengembalikan model yang dapat digunakan.', 'LLM_MODELS_EMPTY');
    return models;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'Koneksi ke OpenCode melewati batas waktu 20 detik.', 'LLM_TIMEOUT');
    }
    throw new HttpError(502, 'Tidak dapat terhubung ke OpenCode.', 'LLM_CONNECTION');
  } finally {
    clearTimeout(timer);
  }
}

export async function syncOpenCodeModels(options?: { apiKey?: string; baseUrl?: string }): Promise<OpenCodeLlmSettings> {
  const current = await getOpenCodeLlmSettings();
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? current.base_url);
  const apiKey = options?.apiKey?.trim() || await readApiKey();
  const models = await fetchModels(baseUrl, apiKey);
  const selected = models.some((model) => model.id === current.default_model)
    ? current.default_model
    : models[0].id;
  const now = new Date().toISOString();
  await Promise.all([
    putSetting(BASE_URL_SETTING, baseUrl),
    putSetting(MODELS_SETTING, JSON.stringify(models)),
    putSetting(DEFAULT_MODEL_SETTING, selected),
    putSetting(SYNCED_AT_SETTING, now),
  ]);
  return getOpenCodeLlmSettings();
}

export async function getOpenCodeVisionRuntimeConfig(): Promise<{
  baseUrl: string;
  apiKey: string;
  model: string;
}> {
  const runtime = await getOpenCodeRuntimeConfig();
  let settings = await getOpenCodeLlmSettings();
  const configured = settings.models.find((model) => model.id === runtime.model);
  // Model vision yang dipilih admin tetap menjadi pilihan utama. Daftar
  // prioritas di bawah hanya fallback bila model default tidak menerima gambar.
  if (configured?.supports_vision) return runtime;
  // Dahulukan model vision native Responses API. Model reasoning yang native
  // Chat Completions dapat menghabiskan output token untuk reasoning saat
  // diterjemahkan ke Responses sehingga tidak menyisakan hasil OCR.
  const visionPriority = ['gpt-6-luna', 'gpt-5.6-luna', 'grok-4.7', 'gemini-4-argon'];
  const findVisionModel = () => visionPriority
    .map((id) => settings.models.find((model) => model.id === id && model.supports_vision))
    .find(Boolean) ?? settings.models.find((model) => model.supports_vision);
  let visionModel = findVisionModel();
  // Cache model versi awal belum menyimpan metadata modalities. Refresh satu
  // kali secara otomatis agar modul kamera langsung dapat dipakai tanpa admin
  // harus menekan Deteksi Model ulang setelah upgrade.
  if (!visionModel) {
    settings = await syncOpenCodeModels();
    visionModel = findVisionModel();
  }
  if (!visionModel) {
    throw new HttpError(422, 'Katalog OpenCode Go tidak memiliki model vision. Sinkronkan ulang model atau pilih model yang mendukung gambar.', 'LLM_VISION_MODEL');
  }
  return { ...runtime, model: visionModel.id };
}

export async function saveOpenCodeLlmSettings(input: {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  updatedBy: string;
  syncModels?: boolean;
}): Promise<OpenCodeLlmSettings> {
  const current = await getOpenCodeLlmSettings();
  const baseUrl = normalizeBaseUrl(input.baseUrl || DEFAULT_OPENCODE_BASE_URL);
  const apiKey = input.apiKey?.trim() ?? '';
  if (input.enabled && !apiKey && !current.api_key_set) {
    throw new HttpError(422, 'API key wajib diisi sebelum integrasi OpenCode diaktifkan.', 'LLM_API_KEY_REQUIRED');
  }
  const now = new Date().toISOString();
  await Promise.all([
    putSetting(BASE_URL_SETTING, baseUrl),
    putSetting(ENABLED_SETTING, input.enabled ? '1' : '0'),
    putSetting(UPDATED_AT_SETTING, now),
    putSetting(UPDATED_BY_SETTING, input.updatedBy),
    ...(apiKey ? [putSetting(API_KEY_SETTING, encryptSecret(apiKey))] : []),
  ]);

  if (input.syncModels || apiKey) {
    await syncOpenCodeModels({ baseUrl, ...(apiKey ? { apiKey } : {}) });
  }

  const refreshed = await getOpenCodeLlmSettings();
  const requestedDefault = String(input.defaultModel ?? '').trim();
  if (requestedDefault) {
    if (!refreshed.models.some((model) => model.id === requestedDefault)) {
      throw new HttpError(422, 'Model default tidak tersedia pada katalog OpenCode terbaru.', 'LLM_DEFAULT_MODEL');
    }
    await putSetting(DEFAULT_MODEL_SETTING, requestedDefault);
  }
  return getOpenCodeLlmSettings();
}

export async function clearOpenCodeApiKey(updatedBy: string): Promise<OpenCodeLlmSettings> {
  await Promise.all([
    deleteSetting(API_KEY_SETTING),
    putSetting(ENABLED_SETTING, '0'),
    putSetting(UPDATED_AT_SETTING, new Date().toISOString()),
    putSetting(UPDATED_BY_SETTING, updatedBy),
  ]);
  return getOpenCodeLlmSettings();
}

export async function testOpenCodeConnection(input?: { apiKey?: string; baseUrl?: string }): Promise<{ ok: true; model_count: number; message: string }> {
  const current = await getOpenCodeLlmSettings();
  const apiKey = input?.apiKey?.trim() || await readApiKey();
  const models = await fetchModels(input?.baseUrl || current.base_url, apiKey);
  return { ok: true, model_count: models.length, message: `Koneksi berhasil. ${models.length} model tersedia.` };
}
