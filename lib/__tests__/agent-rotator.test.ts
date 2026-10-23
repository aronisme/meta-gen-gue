// lib/__tests__/agent-rotator.test.ts
import { describe, expect, it } from 'vitest';
import { SmartKeyRotator, maskApiKey, NoAvailableKeyError } from '../agent/key-rotator';
import type { ProviderKey } from '../agent/types';

describe('SmartKeyRotator', () => {
  it('masks API keys securely', () => {
    expect(maskApiKey('AIzaSyD-1234567890abcdef')).toBe('AIza...cdef');
    expect(maskApiKey('short')).toBe('****');
    expect(maskApiKey('')).toBe('');
  });

  it('acquires the highest priority tier key first', () => {
    const keys: ProviderKey[] = [
      {
        id: 'k1',
        providerId: 'gemini',
        name: 'Fallback Key',
        keyValue: 'AIza_fallback_key_1234',
        keyMasked: 'AIza...1234',
        priority: 3,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        callCount: 0,
        errorCount: 0,
      },
      {
        id: 'k2',
        providerId: 'gemini',
        name: 'Primary Key',
        keyValue: 'AIza_primary_key_5678',
        keyMasked: 'AIza...5678',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        callCount: 0,
        errorCount: 0,
      },
    ];

    const rotator = new SmartKeyRotator(keys);
    const lease = rotator.acquireKey('gemini');
    expect(lease.keyId).toBe('k2');
    expect(lease.priority).toBe(1);
  });

  it('selects using Least-Recently-Used (LRU) within the same priority tier', () => {
    const now = Date.now();
    const keys: ProviderKey[] = [
      {
        id: 'k_recent',
        providerId: 'groq',
        name: 'Recent Key',
        keyValue: 'gsk_recent_key_1111',
        keyMasked: 'gsk_...1111',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        lastUsedAt: now - 1000,
        callCount: 5,
        errorCount: 0,
      },
      {
        id: 'k_oldest',
        providerId: 'groq',
        name: 'Oldest Key',
        keyValue: 'gsk_oldest_key_2222',
        keyMasked: 'gsk_...2222',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        lastUsedAt: now - 50000, // oldest
        callCount: 2,
        errorCount: 0,
      },
    ];

    const rotator = new SmartKeyRotator(keys);
    const lease = rotator.acquireKey('groq');
    expect(lease.keyId).toBe('k_oldest');
  });

  it('enters cooldown on HTTP 429 and auto-recovers when reset expires', () => {
    const keys: ProviderKey[] = [
      {
        id: 'k1',
        providerId: 'gemini',
        name: 'Solo Key',
        keyValue: 'AIza_solo_key_9999',
        keyMasked: 'AIza...9999',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        callCount: 0,
        errorCount: 0,
      },
    ];

    const rotator = new SmartKeyRotator(keys);
    const lease = rotator.acquireKey('gemini');

    // Report HTTP 429
    rotator.reportResult({
      lease,
      success: false,
      statusCode: 429,
      errorMessage: 'Resource has been exhausted (e.g. check quota).',
    });

    // Key should now be rate_limited
    const updated = rotator.listKeys('gemini')[0];
    expect(updated.status).toBe('rate_limited');
    expect(updated.rateLimitResetAt).toBeDefined();

    // Acquiring key now should throw NoAvailableKeyError with wait seconds
    expect(() => rotator.acquireKey('gemini')).toThrow(NoAvailableKeyError);

    // Simulate reset time passed
    updated.rateLimitResetAt = Date.now() - 100;

    // Next acquire should auto-recover key!
    const recoveredLease = rotator.acquireKey('gemini');
    expect(recoveredLease.keyId).toBe('k1');
  });

  it('transparently fails over to next key on error in executeWithFailover', async () => {
    const keys: ProviderKey[] = [
      {
        id: 'k_bad',
        providerId: 'gemini',
        name: 'Bad Key',
        keyValue: 'AIza_bad_key',
        keyMasked: 'AIza..._bad',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        lastUsedAt: 100,
        callCount: 0,
        errorCount: 0,
      },
      {
        id: 'k_good',
        providerId: 'gemini',
        name: 'Good Key',
        keyValue: 'AIza_good_key',
        keyMasked: 'AIza...good',
        priority: 1,
        weight: 10,
        status: 'active',
        consecutiveErrors: 0,
        lastUsedAt: 200,
        callCount: 0,
        errorCount: 0,
      },
    ];

    const rotator = new SmartKeyRotator(keys);

    let attempts = 0;
    const result = await rotator.executeWithFailover('gemini', async (lease) => {
      attempts++;
      if (lease.keyId === 'k_bad') {
        const err = new Error('HTTP 429: Rate limit exceeded');
        (err as Record<string, unknown>).status = 429;
        throw err;
      }
      return `Success with ${lease.keyId}`;
    });

    expect(attempts).toBe(2);
    expect(result).toBe('Success with k_good');
  });
});
