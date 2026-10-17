import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const inMemoryIdb = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => inMemoryIdb.get(key)),
  set: vi.fn(async (key: string, val: unknown) => inMemoryIdb.set(key, val)),
  getMany: vi.fn(async (keys: string[]) => keys.map((k) => inMemoryIdb.get(k))),
  setMany: vi.fn(async (entries: Array<[string, unknown]>) => {
    entries.forEach(([k, v]) => inMemoryIdb.set(k, v));
  }),
  keys: vi.fn(async () => Array.from(inMemoryIdb.keys())),
  del: vi.fn(async (key: string) => inMemoryIdb.delete(key)),
}));

import {
  pushLocalDataToCloud,
  pullCloudDataToLocal,
  syncDeleteSession,
  syncDeleteFtpAccount,
  syncDeleteHistoryItems,
} from '../sync/engine';
import { saveStoredUser, clearStoredUser } from '../auth/store';
import { loadSettings } from '../store';
import type { AuthUser } from '../auth/types';

describe('Sync Engine & D1 Cloud Integration', () => {
  const mockUser: AuthUser = {
    email: 'sync_test@microstock.com',
    name: 'Sync Tester',
    role: 'user',
    status: 'active',
    dailyQuota: 100,
    usageCount: 10,
    remainingQuota: 90,
    idToken: 'mock-valid-id-token-xyz',
  };

  beforeEach(() => {
    localStorage.clear();
    inMemoryIdb.clear();
    saveStoredUser(mockUser);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    inMemoryIdb.clear();
    clearStoredUser();
  });

  it('should push local data with idToken and authorization header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, synced: true }),
    } as Response);

    const pushed = await pushLocalDataToCloud('sync_test@microstock.com');
    expect(pushed).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/sync');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toContain('mock-valid-id-token-xyz');

    const body = JSON.parse(init?.body as string);
    expect(body.action).toBe('push_batch');
    expect(body.userEmail).toBe('sync_test@microstock.com');
    expect(body.idToken).toBe('mock-valid-id-token-xyz');
  });

  it('should pull cloud data and update local settings without echo-sync', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          history: [
            {
              id: 'item-101',
              filename: 'test_asset.mp4',
              assetType: 'video',
              title: 'Dynamic motion footage',
              description: 'Drone view of city',
              keywords: 'drone, city, motion',
              category: '19',
              shutterstockCategory: 'Technology',
              illustration: 0,
              aiModel: 'gemini-2.5-flash',
              createdAt: new Date().toISOString(),
            },
          ],
          sessions: [
            {
              id: 'ses-101',
              name: 'Batch Session A',
              fileCount: 1,
              itemIds: ['item-101'],
              status: 'completed',
              totalFiles: 1,
              successCount: 1,
              errorCount: 0,
              createdAt: new Date().toISOString(),
            },
          ],
          ftpAccounts: [],
          uploadLedger: [],
          settings: {
            provider: 'gas-proxy',
            model: 'gemini-2.5-flash',
            fileType: 'video',
            titleLength: 140,
            descriptionLength: 70,
            keywordsCount: 40,
            extraInstructions: 'Focus on motion tags',
          },
        },
      }),
    } as Response);

    const pulled = await pullCloudDataToLocal('sync_test@microstock.com');
    expect(pulled).toBe(true);

    const updatedSettings = loadSettings();
    expect(updatedSettings?.titleLength).toBe(140);
    expect(updatedSettings?.keywordsCount).toBe(40);
    expect(updatedSettings?.fileType).toBe('video');
  });

  it('should send syncDeleteSession action with itemIds to D1 cloud', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, deletedSessionId: 'ses-999' }),
    } as Response);

    await syncDeleteSession('ses-999', ['item-1', 'item-2']);
    expect(fetchSpy).toHaveBeenCalled();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.action).toBe('delete_session');
    expect(body.sessionId).toBe('ses-999');
    expect(body.itemIds).toEqual(['item-1', 'item-2']);
    expect(body.deleteItems).toBe(true);
  });

  it('should send syncDeleteFtpAccount action to D1 cloud', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, deletedAccountId: 'ftp-acc-123' }),
    } as Response);

    await syncDeleteFtpAccount('ftp-acc-123');
    expect(fetchSpy).toHaveBeenCalled();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.action).toBe('delete_ftp_account');
    expect(body.accountId).toBe('ftp-acc-123');
    expect(body.userEmail).toBe('sync_test@microstock.com');
  });

  it('should send syncDeleteHistoryItems action to D1 cloud', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, deletedCount: 2 }),
    } as Response);

    await syncDeleteHistoryItems(['item-a', 'item-b']);
    expect(fetchSpy).toHaveBeenCalled();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.action).toBe('delete_history');
    expect(body.ids).toEqual(['item-a', 'item-b']);
  });
});
