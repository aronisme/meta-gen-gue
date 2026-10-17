import { get, set, del, keys } from 'idb-keyval';
import type { ItemMetaBox, FileType, Provider, GenerationSession } from './types';
import { queueBackgroundSync } from '@/lib/sync/engine';
import { getStoredUser } from '@/lib/auth/store';

const LEGACY_HISTORE = 'history-v1';
const LEGACY_SESSION_STORE = 'sessions-v1';
const OPENAI_KEY = 'openai_key';
const GEMINI_KEY = 'gemini_key';
const GAS_PROXY_KEY = 'gas_proxy_key';
const LEGACY_SETTINGS_KEY = 'gen_settings';

export const DEFAULT_GAS_TOKEN = process.env.NEXT_PUBLIC_GAS_PROXY_TOKEN || 'gas_live_8b84dd959b764b4296669623';
export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzB-MWqSfCXRbolr5yFkS33jkRrDw7Y9mjViluIeYJ5_-PJTbyZynrz1gl1K1UW5dKm/exec';

export interface SavedSettings {
  provider: Provider;
  model: string;
  fileType: FileType;
  titleLength: number;
  descriptionLength: number;
  keywordsCount: number;
  extraInstructions: string;
}

/**
 * Mengambil namespace pengguna aktif (email lowercase atau 'guest')
 */
export function getUserScope(): string {
  if (typeof window === 'undefined') return 'guest';
  try {
    const user = getStoredUser();
    if (user?.email) {
      return user.email.trim().toLowerCase();
    }
  } catch {}
  return 'guest';
}

export function getHistPrefix(scope = getUserScope()): string {
  return `hist:${scope}:`;
}

export function getSessionPrefix(scope = getUserScope()): string {
  return `sess:${scope}:`;
}

export function getSettingsKey(scope = getUserScope()): string {
  return scope === 'guest' ? LEGACY_SETTINGS_KEY : `gen_settings_${scope}`;
}

export async function saveHistoryItem(it: ItemMetaBox, targetScope?: string) {
  const scope = targetScope || getUserScope();
  const id = `${getHistPrefix(scope)}${it.id}`;
  await set(id, it);
  queueBackgroundSync();
}

export async function deleteHistoryItem(id: string, targetScope?: string) {
  const scope = targetScope || getUserScope();
  const key = `${getHistPrefix(scope)}${id}`;
  await del(key);
}

export async function deleteHistoryItems(ids: string[], targetScope?: string) {
  await Promise.all(ids.map((id) => deleteHistoryItem(id, targetScope)));
}

export async function loadHistory(page: number, pageSize: number, targetScope?: string) {
  const scope = targetScope || getUserScope();
  const prefix = getHistPrefix(scope);
  const allKeys = (await keys()) as string[];

  let histKeys = allKeys.filter((k) => k.startsWith(prefix)).sort().reverse();

  // Migrasi otomatis data legacy hanya untuk admin/pemilik asli jika namespace masih kosong
  if (histKeys.length === 0 && scope === 'sr7aron@gmail.com') {
    const legacyKeys = allKeys.filter((k) => k.startsWith(`${LEGACY_HISTORE}:`));
    if (legacyKeys.length > 0) {
      for (const oldKey of legacyKeys) {
        const item = await get<ItemMetaBox>(oldKey);
        if (item) {
          const newKey = `${prefix}${item.id}`;
          await set(newKey, item);
          await del(oldKey);
        }
      }
      histKeys = (await keys())
        .filter((k) => typeof k === 'string' && k.startsWith(prefix))
        .sort()
        .reverse() as string[];
    }
  }

  const start = page * pageSize;
  const pageKeys = histKeys.slice(start, start + pageSize);
  const items = await Promise.all(pageKeys.map((k) => get<ItemMetaBox>(k)));
  return { items: items.filter(Boolean) as ItemMetaBox[], total: histKeys.length };
}

export async function getHistoryItem(id: string, targetScope?: string): Promise<ItemMetaBox | undefined> {
  const scope = targetScope || getUserScope();
  const key = `${getHistPrefix(scope)}${id}`;
  const found = await get<ItemMetaBox>(key);
  if (found) return found;

  // Fallback legacy jika scope admin
  if (scope === 'sr7aron@gmail.com') {
    return get<ItemMetaBox>(`${LEGACY_HISTORE}:${id}`);
  }
  return undefined;
}

/* ---------- Session Management ---------- */
export async function saveSession(session: GenerationSession, targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = `${getSessionPrefix(scope)}${session.id}`;
  await set(key, session);
  queueBackgroundSync();
}

export async function getSession(id: string, targetScope?: string): Promise<GenerationSession | undefined> {
  const scope = targetScope || getUserScope();
  const key = `${getSessionPrefix(scope)}${id}`;
  const found = await get<GenerationSession>(key);
  if (found) return found;

  if (scope === 'sr7aron@gmail.com') {
    return get<GenerationSession>(`${LEGACY_SESSION_STORE}:${id}`);
  }
  return undefined;
}

export async function loadSessions(targetScope?: string): Promise<GenerationSession[]> {
  const scope = targetScope || getUserScope();
  const prefix = getSessionPrefix(scope);
  const allKeys = (await keys()) as string[];

  let sessionKeys = allKeys.filter((k) => k.startsWith(prefix));

  // Migrasi otomatis data legacy hanya untuk admin/pemilik asli jika namespace masih kosong
  if (sessionKeys.length === 0 && scope === 'sr7aron@gmail.com') {
    const legacyKeys = allKeys.filter((k) => k.startsWith(`${LEGACY_SESSION_STORE}:`));
    if (legacyKeys.length > 0) {
      for (const oldKey of legacyKeys) {
        const ses = await get<GenerationSession>(oldKey);
        if (ses) {
          const newKey = `${prefix}${ses.id}`;
          await set(newKey, ses);
          await del(oldKey);
        }
      }
      sessionKeys = (await keys()).filter((k) => typeof k === 'string' && k.startsWith(prefix)) as string[];
    }
  }

  const sessions = await Promise.all(sessionKeys.map((k) => get<GenerationSession>(k)));
  const valid = sessions.filter(Boolean) as GenerationSession[];
  return valid.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id: string, deleteItems = false, targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = `${getSessionPrefix(scope)}${id}`;
  if (deleteItems) {
    const session = await get<GenerationSession>(key);
    if (session?.itemIds?.length) {
      await deleteHistoryItems(session.itemIds, scope);
    }
  }
  await del(key);
}

export async function loadSessionItems(itemIds: string[], targetScope?: string): Promise<ItemMetaBox[]> {
  const scope = targetScope || getUserScope();
  const items = await Promise.all(itemIds.map((id) => getHistoryItem(id, scope)));
  return items.filter(Boolean) as ItemMetaBox[];
}

export function saveApiKey(provider: Provider, key: string) {
  const storageKey =
    provider === 'gas-proxy' ? GAS_PROXY_KEY : provider === 'openai' ? OPENAI_KEY : GEMINI_KEY;
  localStorage.setItem(storageKey, key.trim());
}

export function getApiKey(provider: Provider) {
  if (provider === 'gas-proxy') {
    return localStorage.getItem(GAS_PROXY_KEY) || DEFAULT_GAS_TOKEN;
  }
  return localStorage.getItem(provider === 'openai' ? OPENAI_KEY : GEMINI_KEY) || '';
}

export function saveSettings(settings: SavedSettings, triggerSync = true, targetScope?: string) {
  const scope = targetScope || getUserScope();
  const key = getSettingsKey(scope);
  localStorage.setItem(key, JSON.stringify(settings));
  if (triggerSync) {
    queueBackgroundSync();
  }
}

export function loadSettings(targetScope?: string): SavedSettings | null {
  const scope = targetScope || getUserScope();
  const key = getSettingsKey(scope);
  let stored = localStorage.getItem(key);
  if (!stored && scope !== 'guest') {
    stored = localStorage.getItem(LEGACY_SETTINGS_KEY);
  }
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as SavedSettings;
    let updated = false;
    if (parsed.provider !== 'gas-proxy') {
      parsed.provider = 'gas-proxy';
      parsed.model = 'gemini-2.5-flash';
      updated = true;
    }
    if (!parsed.titleLength || parsed.titleLength === 70 || isNaN(parsed.titleLength)) {
      parsed.titleLength = 120;
      updated = true;
    }
    if (updated) {
      localStorage.setItem(key, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return null;
  }
}

