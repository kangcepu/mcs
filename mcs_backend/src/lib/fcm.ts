import fs from 'node:fs';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { config } from '../config.js';
import { getSetting } from './app-settings.js';
import { decryptSecret } from './crypto-secrets.js';

export const FIREBASE_CREDENTIAL_SETTING_KEY = 'firebase_service_account_encrypted';

let app: App | null | undefined;
let cachedSource = '';

function readServiceAccountFromFile(): string | null {
  const path = config.firebaseServiceAccountPath.trim();
  if (!path || !fs.existsSync(path)) return null;
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

async function resolveServiceAccountJson(): Promise<string | null> {
  const encrypted = await getSetting(FIREBASE_CREDENTIAL_SETTING_KEY, '');
  if (encrypted !== '') {
    try {
      return decryptSecret(encrypted);
    } catch {
      return null;
    }
  }
  return readServiceAccountFromFile();
}

async function getApp(): Promise<App | null> {
  const source = await resolveServiceAccountJson();
  if (source === null) {
    if (app) await deleteApp(app).catch(() => {});
    app = null;
    cachedSource = '';
    return null;
  }
  if (app !== undefined && app !== null && cachedSource === source) return app;

  if (app) await deleteApp(app).catch(() => {});
  try {
    const serviceAccount = JSON.parse(source);
    app = initializeApp({ credential: cert(serviceAccount) }, `mcs-fcm-${Date.now()}`);
    cachedSource = source;
  } catch {
    app = null;
    cachedSource = '';
  }
  return app;
}

export async function isFcmConfigured(): Promise<boolean> {
  return (await getApp()) !== null;
}

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badgeCount?: number;
  androidChannelId?: string;
  androidSound?: string;
  dataOnly?: boolean;
}

export interface FcmSendResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendToTokens(tokens: string[], payload: FcmPayload): Promise<FcmSendResult> {
  const uniqueTokens = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (!uniqueTokens.length) return { sent: 0, failed: 0, invalidTokens: [] };

  const application = await getApp();
  if (!application) return { sent: 0, failed: uniqueTokens.length, invalidTokens: [] };

  const androidChannelId = payload.androidChannelId?.trim() || 'mcs_realtime_channel';
  const androidSound = payload.androidSound?.trim() || 'default';
  const hasBadge = payload.badgeCount !== undefined && payload.badgeCount >= 0;
  const dataOnly = payload.dataOnly === true;

  const data = { ...(payload.data ?? {}), ...(dataOnly ? { title: payload.title, body: payload.body } : {}) };

  const message: MulticastMessage = {
    tokens: uniqueTokens,
    data,
    android: {
      priority: 'high',
      ...(dataOnly ? {} : {
        notification: {
          channelId: androidChannelId,
          sound: androidSound,
          ...(hasBadge ? { notificationCount: payload.badgeCount } : {}),
        },
      }),
    },
    ...(dataOnly ? {} : { notification: { title: payload.title, body: payload.body } }),
    ...(hasBadge ? { apns: { payload: { aps: { badge: payload.badgeCount } } } } : {}),
  };

  try {
    const response = await getMessaging(application).sendEachForMulticast(message);
    const invalidTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_TOKEN_ERROR_CODES.has(r.error.code)) invalidTokens.push(uniqueTokens[i]);
    });
    return { sent: response.successCount, failed: response.failureCount, invalidTokens };
  } catch (error) {
    console.error('FCM sendToTokens failed:', error);
    return { sent: 0, failed: uniqueTokens.length, invalidTokens: [] };
  }
}
