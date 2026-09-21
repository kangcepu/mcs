import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { getSetting, putSetting } from './app-settings.js';
import { decryptSecret, encryptSecret } from './crypto-secrets.js';

export const STORAGE_SECRET_SETTING_KEY = 'storage_secret_key_encrypted';
const LEGACY_SECRET_SETTING_KEY = 'storage_secret_key';

export interface StorageConfig {
  enabled: boolean;
  serve: boolean;
  gateway: boolean;
  public: boolean;
  verify: boolean;
  publicEndpoint: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  pathStyle: boolean;
  updatedAt: string;
}

async function readSecretKey(): Promise<string> {
  const encrypted = await getSetting(STORAGE_SECRET_SETTING_KEY, '');
  if (encrypted !== '') {
    try {
      return decryptSecret(encrypted);
    } catch {}
  }
  return getSetting(LEGACY_SECRET_SETTING_KEY, '');
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const [enabled, serve, gateway, isPublic, verify, publicEndpoint, endpoint, region, bucket, accessKey, pathStyle, updatedAt, secretKey] = await Promise.all([
    getSetting('storage_enabled', '0'),
    getSetting('storage_serve', '0'),
    getSetting('storage_gateway', '0'),
    getSetting('storage_public', '0'),
    getSetting('storage_verify', '1'),
    getSetting('storage_public_endpoint', ''),
    getSetting('storage_endpoint', ''),
    getSetting('storage_region', 'us-east-1'),
    getSetting('storage_bucket', ''),
    getSetting('storage_access_key', ''),
    getSetting('storage_path_style', '1'),
    getSetting('storage_updated_at', ''),
    readSecretKey(),
  ]);
  return {
    enabled: enabled === '1', serve: serve === '1', gateway: gateway === '1', public: isPublic === '1', verify: verify === '1',
    publicEndpoint, endpoint, region: region || 'us-east-1', bucket, accessKey, secretKey, pathStyle: pathStyle === '1', updatedAt,
  };
}

export async function getStorageStatus(): Promise<Record<string, unknown>> {
  const cfg = await getStorageConfig();
  return {
    enabled: cfg.enabled, serve: cfg.serve, gateway: cfg.gateway, public: cfg.public, verify: cfg.verify,
    public_endpoint: cfg.publicEndpoint, endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket,
    access_key: cfg.accessKey, path_style: cfg.pathStyle, secret_key_set: cfg.secretKey !== '', updated_at: cfg.updatedAt,
  };
}

export async function putStorageConfig(input: {
  endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; pathStyle: boolean;
  enabled: boolean; serve: boolean; gateway: boolean; public: boolean; verify: boolean; publicEndpoint: string;
}): Promise<void> {
  await Promise.all([
    putSetting('storage_endpoint', input.endpoint),
    putSetting('storage_region', input.region),
    putSetting('storage_bucket', input.bucket),
    putSetting('storage_access_key', input.accessKey),
    input.secretKey !== '' ? putSetting(STORAGE_SECRET_SETTING_KEY, encryptSecret(input.secretKey)) : Promise.resolve(),
    putSetting('storage_path_style', input.pathStyle ? '1' : '0'),
    putSetting('storage_enabled', input.enabled ? '1' : '0'),
    putSetting('storage_serve', input.serve ? '1' : '0'),
    putSetting('storage_gateway', input.gateway ? '1' : '0'),
    putSetting('storage_public', input.public ? '1' : '0'),
    putSetting('storage_verify', input.verify ? '1' : '0'),
    putSetting('storage_public_endpoint', input.publicEndpoint),
    putSetting('storage_updated_at', new Date().toISOString()),
  ]);
}

function isValidUrl(value: string): boolean {
  if (value === '') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
export { isValidUrl as isValidStorageUrl };

function buildClient(cfg: { endpoint: string; region: string; accessKey: string; secretKey: string; pathStyle: boolean }): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region || 'us-east-1',
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    forcePathStyle: cfg.pathStyle,
  });
}

function hasCredentials(cfg: StorageConfig): boolean {
  return cfg.endpoint !== '' && cfg.bucket !== '' && cfg.accessKey !== '' && cfg.secretKey !== '';
}

let cachedClient: { fingerprint: string; client: S3Client; bucket: string } | null = null;
function clientFor(cfg: StorageConfig): { client: S3Client; bucket: string } {
  const fingerprint = JSON.stringify([cfg.endpoint, cfg.region, cfg.bucket, cfg.accessKey, cfg.secretKey, cfg.pathStyle]);
  if (cachedClient && cachedClient.fingerprint === fingerprint) return { client: cachedClient.client, bucket: cachedClient.bucket };
  const client = buildClient(cfg);
  cachedClient = { fingerprint, client, bucket: cfg.bucket };
  return { client, bucket: cfg.bucket };
}

export async function isStorageWritable(): Promise<boolean> {
  const cfg = await getStorageConfig();
  return cfg.enabled && hasCredentials(cfg);
}

async function writableClient(): Promise<{ client: S3Client; bucket: string } | null> {
  const cfg = await getStorageConfig();
  if (!cfg.enabled || !hasCredentials(cfg)) return null;
  return clientFor(cfg);
}

async function readableClient(): Promise<{ client: S3Client; bucket: string } | null> {
  const cfg = await getStorageConfig();
  if (!cfg.serve || !hasCredentials(cfg)) return null;
  return clientFor(cfg);
}

export async function testStorageConnection(input: { endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; pathStyle: boolean }): Promise<{ ok: boolean; message: string }> {
  try {
    const client = buildClient(input);
    await client.send(new HeadBucketCommand({ Bucket: input.bucket }));
    return { ok: true, message: 'Koneksi berhasil, bucket ditemukan.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Koneksi gagal.' };
  }
}

function guessMime(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType?: string): Promise<boolean> {
  const active = await writableClient();
  if (!active) return false;
  await active.client.send(new PutObjectCommand({ Bucket: active.bucket, Key: key, Body: buffer, ContentType: contentType ?? guessMime(key) }));
  return true;
}

export async function objectSize(key: string): Promise<number | null> {
  const active = await writableClient();
  if (!active) return null;
  try {
    const result = await active.client.send(new HeadObjectCommand({ Bucket: active.bucket, Key: key }));
    return result.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function uploadLocalFile(key: string, localPath: string): Promise<boolean> {
  const active = await writableClient();
  if (!active) return false;
  const buffer = await fs.readFile(localPath);
  await active.client.send(new PutObjectCommand({ Bucket: active.bucket, Key: key, Body: buffer, ContentType: guessMime(key) }));
  return true;
}

export async function deleteObjectKey(key: string): Promise<boolean> {
  const active = await writableClient();
  if (!active) return false;
  try {
    await active.client.send(new DeleteObjectCommand({ Bucket: active.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export interface ObjectStreamResult { stream: Readable; contentType: string; contentLength?: number }

export async function getObjectStream(key: string): Promise<ObjectStreamResult | null> {
  const active = await readableClient();
  if (!active) return null;
  try {
    const result = await active.client.send(new GetObjectCommand({ Bucket: active.bucket, Key: key }));
    if (!result.Body) return null;
    return {
      stream: result.Body as Readable,
      contentType: result.ContentType ?? guessMime(key),
      contentLength: result.ContentLength,
    };
  } catch {
    return null;
  }
}

function randomName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

export async function saveFileWithKey(buffer: Buffer, relativeDir: string, filename: string, contentType?: string): Promise<string> {
  const key = `${relativeDir}/${filename}`;

  if (await isStorageWritable()) {
    const uploaded = await uploadBuffer(key, buffer, contentType);
    if (!uploaded) throw new Error('Failed to upload file to storage');
    return key;
  }

  const dir = path.join(config.uploadDir, relativeDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return key;
}

export async function saveUploadedFile(buffer: Buffer, relativeDir: string, originalName: string, contentType?: string): Promise<string> {
  return saveFileWithKey(buffer, relativeDir, randomName(originalName), contentType);
}
