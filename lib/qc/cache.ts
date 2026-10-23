import { get, set } from 'idb-keyval';
import type { QcReport } from '@/lib/qc/types';

export const QC_CACHE_STORAGE_KEY = 'metagen_qc_history_memory_v1';

export interface CachedQcRecord {
  key: string;
  filename: string;
  filePath?: string;
  fileSize: number;
  lastModified?: number;
  report: QcReport;
  auditedAt: number;
}

let memoryCacheMap: Map<string, CachedQcRecord> | null = null;

/**
 * Compute unique composite key based on path or filename, size, and modification timestamp
 */
export function computeQcFileKey(file?: File, filename?: string, filePath?: string): string {
  const normPath = (filePath || (file as unknown as { path?: string })?.path || '').trim().toLowerCase();
  const normName = (filename || file?.name || '').trim().toLowerCase();
  const size = file?.size || 0;
  const modified = file?.lastModified || 0;

  if (normPath) {
    return `path::${normPath}::${size}::${modified}`;
  }
  return `file::${normName}::${size}::${modified}`;
}

export function computeQcNameOnlyKey(filename: string): string {
  return `name::${filename.trim().toLowerCase()}`;
}

/**
 * Load QC history cache from IndexedDB
 */
export async function loadQcCache(): Promise<Map<string, CachedQcRecord>> {
  if (memoryCacheMap) return memoryCacheMap;
  try {
    const raw = await get<Record<string, CachedQcRecord>>(QC_CACHE_STORAGE_KEY);
    memoryCacheMap = new Map();
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        memoryCacheMap.set(k, v);
      }
    }
  } catch (err) {
    console.warn('[Meta-Gen QC Cache] Error reading from IndexedDB:', err);
    memoryCacheMap = new Map();
  }
  return memoryCacheMap;
}

/**
 * Save a QC record to persistent cache
 */
export async function saveQcCacheRecord(record: CachedQcRecord): Promise<void> {
  const cache = await loadQcCache();
  cache.set(record.key, record);

  // Secondary indexing for path and name
  if (record.filePath) {
    cache.set(`path::${record.filePath.trim().toLowerCase()}`, record);
  }
  cache.set(computeQcNameOnlyKey(record.filename), record);

  try {
    const obj: Record<string, CachedQcRecord> = {};
    for (const [k, v] of cache.entries()) {
      obj[k] = v;
    }
    await set(QC_CACHE_STORAGE_KEY, obj);
  } catch (err) {
    console.warn('[Meta-Gen QC Cache] Error saving to IndexedDB:', err);
  }
}

/**
 * Check if a file has previously been audited
 */
export async function findCachedQcRecord(
  file?: File,
  filename?: string,
  filePath?: string
): Promise<CachedQcRecord | null> {
  const cache = await loadQcCache();
  const primaryKey = computeQcFileKey(file, filename, filePath);

  if (cache.has(primaryKey)) {
    return cache.get(primaryKey)!;
  }

  // Fallback 1: check path lookup if absolute path is known
  const normPath = (filePath || (file as unknown as { path?: string })?.path || '').trim().toLowerCase();
  if (normPath && cache.has(`path::${normPath}`)) {
    const candidate = cache.get(`path::${normPath}`)!;
    if (!file || !candidate.fileSize || candidate.fileSize === file.size) {
      return candidate;
    }
  }

  // Fallback 2: check name lookup if size matches
  const nameKey = computeQcNameOnlyKey(filename || file?.name || '');
  if (cache.has(nameKey)) {
    const candidate = cache.get(nameKey)!;
    if (!file || !candidate.fileSize || candidate.fileSize === file.size) {
      return candidate;
    }
  }

  return null;
}

/**
 * Remove a cached QC record (e.g. when user requests re-audit)
 */
export async function removeQcCacheRecord(
  file?: File,
  filename?: string,
  filePath?: string
): Promise<void> {
  const cache = await loadQcCache();
  const primaryKey = computeQcFileKey(file, filename, filePath);
  cache.delete(primaryKey);

  const normPath = (filePath || (file as unknown as { path?: string })?.path || '').trim().toLowerCase();
  if (normPath) cache.delete(`path::${normPath}`);
  cache.delete(computeQcNameOnlyKey(filename || file?.name || ''));

  try {
    const obj: Record<string, CachedQcRecord> = {};
    for (const [k, v] of cache.entries()) {
      obj[k] = v;
    }
    await set(QC_CACHE_STORAGE_KEY, obj);
  } catch (err) {
    console.warn('[Meta-Gen QC Cache] Error updating cache after removal:', err);
  }
}

/**
 * Clear all QC cache
 */
export async function clearQcCache(): Promise<void> {
  if (memoryCacheMap) memoryCacheMap.clear();
  try {
    await set(QC_CACHE_STORAGE_KEY, {});
  } catch (err) {
    console.warn('[Meta-Gen QC Cache] Error clearing cache:', err);
  }
}
