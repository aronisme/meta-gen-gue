// lib/agent/key-rotator.ts
/**
 * Smart Key Rotation Engine for MetaGen Omnigent Live Agent.
 * Faithfully ports Omnigent's services/key_rotator.py to TypeScript.
 *
 * Capabilities:
 * 1. Priority tiers (Tier 1 = Primary, Tier 2 = Secondary, Tier 3 = Fallback)
 * 2. Least-Recently-Used (LRU) load balancing within the top priority tier
 * 3. 60-second automatic cooldown upon HTTP 429 / Rate Limit
 * 4. Automatic cooldown recovery when reset timestamp expires
 * 5. Transparent failover execution across multiple keys / providers
 */

import type { KeyLease, KeyStatus, ProviderKey, ProviderType } from './types';

const STORAGE_KEY = 'metagen_agent_keys_v1';
const COOLDOWN_DURATION_MS = 60_000; // 60 seconds

export class NoAvailableKeyError extends Error {
  public providerId: ProviderType;
  public resetInSeconds?: number;

  constructor(providerId: ProviderType, message: string, resetInSeconds?: number) {
    super(message);
    this.name = 'NoAvailableKeyError';
    this.providerId = providerId;
    this.resetInSeconds = resetInSeconds;
  }
}

export function maskApiKey(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export class SmartKeyRotator {
  private keys: ProviderKey[] = [];
  private isLoaded = false;
  private listeners: Array<(keys: ProviderKey[]) => void> = [];

  constructor(initialKeys?: ProviderKey[]) {
    if (initialKeys && initialKeys.length > 0) {
      this.keys = [...initialKeys];
      this.isLoaded = true;
    } else {
      this.loadFromStorage();
    }
  }

  public subscribe(listener: (keys: ProviderKey[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.listKeys());
      } catch (err) {
        console.error('[SmartKeyRotator] Listener error:', err);
      }
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') {
      this.isLoaded = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProviderKey[];
        if (Array.isArray(parsed)) {
          this.keys = parsed;
          this.isLoaded = true;
          return;
        }
      }
    } catch (e) {
      console.warn('[SmartKeyRotator] Failed to read keys from storage:', e);
    }
    this.isLoaded = true;
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));
    } catch (e) {
      console.warn('[SmartKeyRotator] Failed to save keys to storage:', e);
    }
    this.notify();
  }

  public listKeys(providerId?: ProviderType): ProviderKey[] {
    this.ensureLoaded();
    const now = Date.now();
    // Auto-recover expired cooldowns
    let changed = false;
    for (const k of this.keys) {
      if ((k.status === 'rate_limited' || k.status === 'quota_exceeded') && k.rateLimitResetAt) {
        if (now >= k.rateLimitResetAt) {
          k.status = 'active';
          k.rateLimitResetAt = undefined;
          k.consecutiveErrors = 0;
          changed = true;
        }
      }
    }
    if (changed) {
      this.saveToStorage();
    }

    if (providerId) {
      return this.keys.filter((k) => k.providerId === providerId);
    }
    return [...this.keys];
  }

  public addKey(params: {
    providerId: ProviderType;
    name: string;
    keyValue: string;
    baseUrl?: string;
    priority?: number;
    weight?: number;
  }): ProviderKey {
    this.ensureLoaded();
    const id = `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newKey: ProviderKey = {
      id,
      providerId: params.providerId,
      name: params.name || `${params.providerId.toUpperCase()} Key`,
      keyValue: params.keyValue.trim(),
      keyMasked: maskApiKey(params.keyValue),
      baseUrl: params.baseUrl?.trim() || undefined,
      priority: params.priority || 1,
      weight: params.weight || 10,
      status: 'active',
      consecutiveErrors: 0,
      callCount: 0,
      errorCount: 0,
    };

    this.keys.push(newKey);
    this.saveToStorage();
    return newKey;
  }

  public updateKey(keyId: string, updates: Partial<Omit<ProviderKey, 'id'>>): ProviderKey | null {
    this.ensureLoaded();
    const idx = this.keys.findIndex((k) => k.id === keyId);
    if (idx === -1) return null;

    const current = this.keys[idx];
    const updated: ProviderKey = {
      ...current,
      ...updates,
      keyMasked: updates.keyValue ? maskApiKey(updates.keyValue) : current.keyMasked,
    };

    this.keys[idx] = updated;
    this.saveToStorage();
    return updated;
  }

  public deleteKey(keyId: string): boolean {
    this.ensureLoaded();
    const beforeLen = this.keys.length;
    this.keys = this.keys.filter((k) => k.id !== keyId);
    if (this.keys.length !== beforeLen) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public resetCooldown(keyId: string): boolean {
    this.ensureLoaded();
    const key = this.keys.find((k) => k.id === keyId);
    if (!key) return false;
    key.status = 'active';
    key.rateLimitResetAt = undefined;
    key.consecutiveErrors = 0;
    this.saveToStorage();
    return true;
  }

  /**
   * Acquire the best available API key lease for a provider.
   * Uses Omnigent's selection algorithm:
   * 1. Auto-recovers expired keys.
   * 2. Filters active candidates.
   * 3. Selects the highest priority tier (lowest integer, e.g. 1 before 2).
   * 4. Within tier, selects using LRU (least recently used + least consecutive errors).
   */
  public acquireKey(providerId: ProviderType): KeyLease {
    this.ensureLoaded();
    const now = Date.now();

    // 1. Auto-recover keys whose cooldown has expired
    let recoveredAny = false;
    for (const k of this.keys) {
      if (k.providerId === providerId && (k.status === 'rate_limited' || k.status === 'quota_exceeded')) {
        if (k.rateLimitResetAt && now >= k.rateLimitResetAt) {
          k.status = 'active';
          k.rateLimitResetAt = undefined;
          k.consecutiveErrors = 0;
          recoveredAny = true;
        }
      }
    }
    if (recoveredAny) {
      this.saveToStorage();
    }

    const providerKeys = this.keys.filter((k) => k.providerId === providerId);
    if (providerKeys.length === 0) {
      throw new NoAvailableKeyError(
        providerId,
        `Belum ada API key terdaftar untuk provider '${providerId}'. Silakan tambahkan API key di tab Pengaturan Key.`
      );
    }

    const activeCandidates = providerKeys.filter((k) => k.status === 'active');
    if (activeCandidates.length === 0) {
      const rateLimited = providerKeys.filter(
        (k) => (k.status === 'rate_limited' || k.status === 'quota_exceeded') && k.rateLimitResetAt
      );

      if (rateLimited.length > 0) {
        const earliestReset = Math.min(...rateLimited.map((k) => k.rateLimitResetAt!));
        const waitSec = Math.max(1, Math.ceil((earliestReset - now) / 1000));
        throw new NoAvailableKeyError(
          providerId,
          `Semua API key untuk provider '${providerId}' sedang terkena limit atau cooldown. Key berikutnya pulih dalam ~${waitSec} detik.`,
          waitSec
        );
      }

      throw new NoAvailableKeyError(
        providerId,
        `Semua API key untuk provider '${providerId}' saat ini non-aktif, dijeda, atau kuota habis.`
      );
    }

    // 2. Group by priority tier (Tier 1 is highest priority)
    const minPriority = Math.min(...activeCandidates.map((k) => k.priority || 1));
    const tierCandidates = activeCandidates.filter((k) => (k.priority || 1) === minPriority);

    // 3. Sort by LRU: fewest consecutive errors, then oldest lastUsedAt
    tierCandidates.sort((a, b) => {
      const errDiff = (a.consecutiveErrors || 0) - (b.consecutiveErrors || 0);
      if (errDiff !== 0) return errDiff;
      return (a.lastUsedAt || 0) - (b.lastUsedAt || 0);
    });

    const chosen = tierCandidates[0];

    // Mark lastUsedAt as provisional touch
    chosen.lastUsedAt = now;
    this.saveToStorage();

    return {
      keyId: chosen.id,
      providerId: chosen.providerId,
      keyValue: chosen.keyValue,
      keyMasked: chosen.keyMasked,
      baseUrl: chosen.baseUrl,
      priority: chosen.priority,
      weight: chosen.weight,
    };
  }

  /**
   * Report execution outcome back to key metrics and adjust cooldown state.
   */
  public reportResult(params: {
    lease: KeyLease;
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
    latencyMs?: number;
  }): void {
    this.ensureLoaded();
    const key = this.keys.find((k) => k.id === params.lease.keyId);
    if (!key) return;

    const now = Date.now();
    key.lastUsedAt = now;
    if (params.latencyMs !== undefined) {
      key.latencyMs = params.latencyMs;
    }

    if (params.success) {
      key.callCount = (key.callCount || 0) + 1;
      key.consecutiveErrors = 0;
      key.status = 'active';
      key.rateLimitResetAt = undefined;
    } else {
      key.errorCount = (key.errorCount || 0) + 1;
      key.consecutiveErrors = (key.consecutiveErrors || 0) + 1;

      const code = params.statusCode;
      const msg = params.errorMessage || '';

      // Check HTTP 429 or rate limit pattern
      if (code === 429 || /rate[- ]limit|too many requests|resource_exhausted/i.test(msg)) {
        key.status = 'rate_limited';
        key.rateLimitResetAt = now + COOLDOWN_DURATION_MS;
      } else if (code === 401 || code === 403 || /invalid[- ]api[- ]key|unauthorized/i.test(msg)) {
        if (key.consecutiveErrors >= 2) {
          key.status = 'invalid';
        }
      } else if (/quota/i.test(msg)) {
        key.status = 'quota_exceeded';
        key.rateLimitResetAt = now + COOLDOWN_DURATION_MS * 5; // 5 min for quota
      }
    }

    this.saveToStorage();
  }

  /**
   * Execute an async function with automatic key rotation and transparent failover.
   * If a key encounters rate limit (429) or network issue, it instantly tries the next healthy key!
   */
  public async executeWithFailover<T>(
    providerId: ProviderType,
    fn: (lease: KeyLease) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < maxRetries) {
      attempt++;
      let lease: KeyLease;
      try {
        lease = this.acquireKey(providerId);
      } catch (err) {
        if (lastError) throw lastError;
        throw err;
      }

      const startT = Date.now();
      try {
        const result = await fn(lease);
        const latency = Date.now() - startT;
        this.reportResult({
          lease,
          success: true,
          latencyMs: latency,
        });
        return result;
      } catch (err: unknown) {
        const latency = Date.now() - startT;
        lastError = err;

        const errObj = err as Record<string, unknown> | null;
        let statusCode: number | undefined;
        let errMsg = '';

        if (errObj) {
          if (typeof errObj.status === 'number') statusCode = errObj.status;
          else if (typeof errObj.statusCode === 'number') statusCode = errObj.statusCode;
          else if (errObj.response && typeof (errObj.response as Record<string, unknown>).status === 'number') {
            statusCode = (errObj.response as Record<string, unknown>).status as number;
          }
          errMsg = String(errObj.message || errObj.error || err);
        } else {
          errMsg = String(err);
        }

        if (!statusCode) {
          if (errMsg.includes('429')) statusCode = 429;
          else if (errMsg.includes('401')) statusCode = 401;
          else if (errMsg.includes('403')) statusCode = 403;
        }

        this.reportResult({
          lease,
          success: false,
          statusCode,
          errorMessage: errMsg,
          latencyMs: latency,
        });
      }
    }

    throw lastError || new Error(`Gagal mengeksekusi request setelah ${maxRetries} percobaan rotasi key.`);
  }

  private ensureLoaded() {
    if (!this.isLoaded) {
      this.loadFromStorage();
    }
  }
}

// Global Singleton Instance
let globalRotator: SmartKeyRotator | null = null;

export function getGlobalKeyRotator(): SmartKeyRotator {
  if (!globalRotator) {
    globalRotator = new SmartKeyRotator();
  }
  return globalRotator;
}

export function setGlobalKeyRotator(rotator: SmartKeyRotator | null): void {
  globalRotator = rotator;
}
