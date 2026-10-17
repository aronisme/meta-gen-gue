import { get, set, del, keys } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { getUserScope } from '@/lib/store';
import { normalizeVisualDna } from './engine';
import type {
  PromptGenerationSession,
  VCPASettings,
} from './types';

export const DEFAULT_VCPA_SETTINGS: VCPASettings = {
  count: 5,
  similarity: 60,
  engine: 'midjourney',
  visualDirection: 'photorealistic',
  aspectRatio: '16:9',
  creativeFocus: 'composition_lighting',
  semanticMode: 'meaning_preservation',
  commercialSafety: true,
  promptLanguage: 'en',
};

export function getPromptSessionPrefix(scope = getUserScope()): string {
  return `prompt_sess:${scope}:`;
}

export function getActivePromptSessionKey(scope = getUserScope()): string {
  return `prompt_active:${scope}`;
}

export function createNewPromptSession(
  title?: string,
  targetScope?: string
): PromptGenerationSession {
  const scope = targetScope || getUserScope();
  const now = Date.now();
  const dateStr = new Date(now).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    id: nanoid(),
    userEmail: scope,
    title: title?.trim() || `Sesi Prompt (${dateStr})`,
    createdAt: now,
    updatedAt: now,
    mode: 'reference_to_prompt',
    prompts: [],
    settings: { ...DEFAULT_VCPA_SETTINGS },
  };
}

/**
 * Menyimpan sesi prompt ke IndexedDB sesuai namespace pengguna aktif.
 */
export async function savePromptSession(
  session: PromptGenerationSession,
  targetScope?: string
): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = `${getPromptSessionPrefix(scope)}${session.id}`;
  const payload: PromptGenerationSession = {
    ...session,
    userEmail: scope,
    updatedAt: Date.now(),
  };
  await set(key, payload);
  await saveActivePromptSession(payload, scope);
}

/**
 * Menyimpan snapshot sesi aktif yang sedang dikerjakan di layar.
 */
export async function saveActivePromptSession(
  session: PromptGenerationSession,
  targetScope?: string
): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = getActivePromptSessionKey(scope);
  await set(key, session);
}

/**
 * Memuat sesi aktif terakhir yang belum selesai dari IndexedDB.
 */
export async function loadActivePromptSession(
  targetScope?: string
): Promise<PromptGenerationSession | null> {
  const scope = targetScope || getUserScope();
  const key = getActivePromptSessionKey(scope);
  const active = await get<PromptGenerationSession>(key);
  if (active) {
    if (active.visualDna) {
      active.visualDna = normalizeVisualDna(active.visualDna) || undefined;
    }
    return active;
  }
  return null;
}

/**
 * Menghapus pointer sesi aktif di layar.
 */
export async function clearActivePromptSession(targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = getActivePromptSessionKey(scope);
  await del(key);
}

/**
 * Memuat seluruh daftar riwayat sesi prompt pengguna terurut dari terbaru.
 */
export async function loadPromptSessions(
  targetScope?: string
): Promise<PromptGenerationSession[]> {
  const scope = targetScope || getUserScope();
  const prefix = getPromptSessionPrefix(scope);
  const allKeys = (await keys()) as string[];

  const sessionKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  const rawSessions = await Promise.all(
    sessionKeys.map((k) => get<PromptGenerationSession>(k))
  );

  const valid = rawSessions.filter(Boolean) as PromptGenerationSession[];
  return valid
    .map((s) => ({
      ...s,
      visualDna: s.visualDna ? normalizeVisualDna(s.visualDna) || undefined : undefined,
    }))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
}

/**
 * Mengambil satu sesi prompt berdasarkan ID.
 */
export async function getPromptSession(
  id: string,
  targetScope?: string
): Promise<PromptGenerationSession | null> {
  const scope = targetScope || getUserScope();
  const key = `${getPromptSessionPrefix(scope)}${id}`;
  const session = await get<PromptGenerationSession>(key);
  if (session && session.visualDna) {
    session.visualDna = normalizeVisualDna(session.visualDna) || undefined;
  }
  return session || null;
}

/**
 * Menghapus sesi prompt dari daftar riwayat.
 */
export async function deletePromptSession(
  id: string,
  targetScope?: string
): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = `${getPromptSessionPrefix(scope)}${id}`;
  await del(key);

  // Jika sesi yang dihapus adalah sesi aktif saat ini, bersihkan pointer sesi aktif
  const active = await loadActivePromptSession(scope);
  if (active && active.id === id) {
    await clearActivePromptSession(scope);
  }
}
