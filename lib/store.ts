import { get, set, del, keys } from 'idb-keyval';
import type { ItemMetaBox, FileType, Provider, GenerationSession } from './types';

const HISTORE = 'history-v1';
const SESSION_STORE = 'sessions-v1';
const OPENAI_KEY = 'openai_key';
const GEMINI_KEY = 'gemini_key';
const GAS_PROXY_KEY = 'gas_proxy_key';
const SETTINGS_KEY = 'gen_settings';

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

export async function saveHistoryItem(it: ItemMetaBox) {
  const id = `${HISTORE}:${it.id}`;
  await set(id, it);
}

export async function deleteHistoryItem(id: string) {
  const key = `${HISTORE}:${id}`;
  await del(key);
}

export async function deleteHistoryItems(ids: string[]) {
  await Promise.all(ids.map((id) => deleteHistoryItem(id)));
}

export async function loadHistory(page: number, pageSize: number) {
  const allKeys = (await keys()) as string[];
  const histKeys = allKeys.filter((k) => k.startsWith(`${HISTORE}:`)).sort().reverse();
  const start = page * pageSize;
  const pageKeys = histKeys.slice(start, start + pageSize);
  const items = await Promise.all(pageKeys.map((k) => get<ItemMetaBox>(k)));
  return { items: items.filter(Boolean) as ItemMetaBox[], total: histKeys.length };
}

export async function getHistoryItem(id: string): Promise<ItemMetaBox | undefined> {
  const key = `${HISTORE}:${id}`;
  return get<ItemMetaBox>(key);
}

/* ---------- Session Management ---------- */
export async function saveSession(session: GenerationSession): Promise<void> {
  const key = `${SESSION_STORE}:${session.id}`;
  await set(key, session);
}

export async function getSession(id: string): Promise<GenerationSession | undefined> {
  const key = `${SESSION_STORE}:${id}`;
  return get<GenerationSession>(key);
}

export async function loadSessions(): Promise<GenerationSession[]> {
  const allKeys = (await keys()) as string[];
  const sessionKeys = allKeys.filter((k) => k.startsWith(`${SESSION_STORE}:`));
  const sessions = await Promise.all(sessionKeys.map((k) => get<GenerationSession>(k)));
  const valid = sessions.filter(Boolean) as GenerationSession[];
  return valid.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id: string, deleteItems = false): Promise<void> {
  const key = `${SESSION_STORE}:${id}`;
  if (deleteItems) {
    const session = await get<GenerationSession>(key);
    if (session?.itemIds?.length) {
      await deleteHistoryItems(session.itemIds);
    }
  }
  await del(key);
}

export async function loadSessionItems(itemIds: string[]): Promise<ItemMetaBox[]> {
  const items = await Promise.all(itemIds.map((id) => getHistoryItem(id)));
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

export function saveSettings(settings: SavedSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSettings(): SavedSettings | null {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as SavedSettings;
    // Auto-migrate legacy providers ('gemini' or 'openai') to 'gas-proxy'
    if (parsed.provider !== 'gas-proxy') {
      parsed.provider = 'gas-proxy';
      parsed.model = 'gemini-2.5-flash';
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return null;
  }
}
