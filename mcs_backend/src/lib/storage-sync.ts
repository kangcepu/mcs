import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { getSetting, putSetting } from './app-settings.js';
import { objectSize, uploadLocalFile } from './storage.js';

type SyncStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped';

interface SyncState {
  status: SyncStatus;
  root: string;
  total_files: number;
  total_bytes: number;
  done_files: number;
  uploaded: number;
  skipped: number;
  failed: number;
  uploaded_bytes: number;
  cursor: string;
  last_error: string;
  recent: string[];
  started_at: string;
  updated_at: string;
}

const SYNC_STATE_KEY = 'storage_sync_state';
const BATCH_SIZE = 20;
const RECENT_MAX = 10;

const DEFAULT_STATE: SyncState = {
  status: 'idle', root: '', total_files: 0, total_bytes: 0, done_files: 0,
  uploaded: 0, skipped: 0, failed: 0, uploaded_bytes: 0, cursor: '',
  last_error: '', recent: [], started_at: '', updated_at: '',
};

async function loadState(): Promise<SyncState> {
  const raw = await getSetting(SYNC_STATE_KEY, '');
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<SyncState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: SyncState): Promise<void> {
  state.updated_at = new Date().toISOString();
  await putSetting(SYNC_STATE_KEY, JSON.stringify(state));
}

function publicState(state: SyncState): Record<string, unknown> {
  const percent = state.total_files > 0 ? Math.round((state.done_files / state.total_files) * 1000) / 10 : 0;
  return { ...state, percent };
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed.includes('..')) return '';
  return trimmed;
}

interface LocalFile { rel: string; abs: string; size: number }

async function walkFiles(rootDir: string): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(config.uploadDir, abs).split(path.sep).join('/');
        const stat = await fs.stat(abs);
        out.push({ rel, abs, size: stat.size });
      }
    }
  }
  await recurse(rootDir);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

export async function getSyncStatus(): Promise<Record<string, unknown>> {
  return publicState(await loadState());
}

export async function startSync(rootInput: string, force: boolean): Promise<Record<string, unknown>> {
  const state = await loadState();
  if (state.status === 'running' && !force) return publicState(state);

  const root = normalizeRoot(rootInput);
  const rootDir = path.join(config.uploadDir, root);
  const files = await walkFiles(rootDir);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const next: SyncState = {
    ...DEFAULT_STATE,
    status: 'running',
    root,
    total_files: files.length,
    total_bytes: totalBytes,
    started_at: new Date().toISOString(),
  };
  await saveState(next);
  return publicState(next);
}

export async function stepSync(): Promise<Record<string, unknown>> {
  const state = await loadState();
  if (state.status !== 'running') return publicState(state);

  const rootDir = path.join(config.uploadDir, state.root);
  const files = await walkFiles(rootDir);
  if (!files.length) {
    state.status = 'done';
    await saveState(state);
    return publicState(state);
  }

  const startIdx = state.cursor ? files.findIndex((f) => f.rel > state.cursor) : 0;
  if (startIdx === -1) {
    state.status = 'done';
    await saveState(state);
    return publicState(state);
  }

  const batch = files.slice(startIdx, startIdx + BATCH_SIZE);
  for (const file of batch) {
    try {
      const existingSize = await objectSize(file.rel);
      if (existingSize !== null && existingSize === file.size) {
        state.skipped++;
      } else {
        const uploaded = await uploadLocalFile(file.rel, file.abs);
        if (uploaded) {
          state.uploaded++;
          state.uploaded_bytes += file.size;
          state.recent = [file.rel, ...state.recent].slice(0, RECENT_MAX);
        } else {
          state.failed++;
          state.last_error = `Gagal upload: ${file.rel}`;
        }
      }
    } catch (e) {
      state.failed++;
      state.last_error = e instanceof Error ? e.message : String(e);
    }
    state.done_files++;
    state.cursor = file.rel;
  }

  if (startIdx + batch.length >= files.length) state.status = 'done';
  await saveState(state);
  return publicState(state);
}

export async function stopSync(): Promise<Record<string, unknown>> {
  const state = await loadState();
  if (state.status === 'running') state.status = 'stopped';
  await saveState(state);
  return publicState(state);
}

export async function checkSync(rootInput: string): Promise<Record<string, unknown>> {
  const root = normalizeRoot(rootInput);
  const rootDir = path.join(config.uploadDir, root);
  const files = await walkFiles(rootDir);

  let ok = 0;
  let missing = 0;
  let mismatch = 0;
  let missingBytes = 0;
  const sample: string[] = [];
  for (const file of files) {
    const size = await objectSize(file.rel);
    if (size === null) {
      missing++;
      missingBytes += file.size;
      if (sample.length < 20) sample.push(file.rel);
    } else if (size !== file.size) {
      mismatch++;
      if (sample.length < 20) sample.push(file.rel);
    } else {
      ok++;
    }
  }

  return {
    local: files.length, ok, missing, mismatch,
    remote_total: ok + mismatch,
    local_bytes: files.reduce((sum, f) => sum + f.size, 0),
    missing_bytes: missingBytes,
    sample,
  };
}
