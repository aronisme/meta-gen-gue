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
  getUserScope,
  getHistPrefix,
  getSessionPrefix,
  saveHistoryItem,
  loadHistory,
  saveSession,
  loadSessions,
} from '../store';
import {
  getFtpAccountsKey,
  loadFtpProfiles,
  saveFtpProfile,
} from '../ftp/store';
import { saveStoredUser, clearStoredUser } from '../auth/store';
import type { ItemMetaBox, GenerationSession } from '../types';

describe('Multi-Tenant Client Isolation & Storage Scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    inMemoryIdb.clear();
    clearStoredUser();
  });

  afterEach(() => {
    localStorage.clear();
    inMemoryIdb.clear();
    clearStoredUser();
  });

  it('should default to guest scope when unauthenticated', () => {
    expect(getUserScope()).toBe('guest');
    expect(getHistPrefix()).toBe('hist:guest:');
    expect(getSessionPrefix()).toBe('sess:guest:');
    expect(getFtpAccountsKey()).toBe('metagen_ftp_accounts_v1');
  });

  it('should isolate storage by userEmail when authenticated', () => {
    saveStoredUser({
      email: 'UserA@gmail.com',
      name: 'User Alpha',
      role: 'user',
      status: 'active',
      dailyQuota: 100,
      usageCount: 0,
      remainingQuota: 100,
    });

    expect(getUserScope()).toBe('usera@gmail.com');
    expect(getHistPrefix()).toBe('hist:usera@gmail.com:');
    expect(getSessionPrefix()).toBe('sess:usera@gmail.com:');
    expect(getFtpAccountsKey()).toBe('metagen_ftp_accounts_usera@gmail.com');
  });

  it('should not allow User B to see User A history or sessions', async () => {
    // 1. User A logs in and generates history & sessions
    saveStoredUser({
      email: 'usera@gmail.com',
      name: 'User A',
      role: 'user',
      status: 'active',
      dailyQuota: 100,
      usageCount: 0,
      remainingQuota: 100,
    });

    const itemA: ItemMetaBox = {
      id: 'item-user-a',
      filename: 'photo_a.jpg',
      fileType: 'image',
      assetType: 'image',
      createdAt: Date.now(),
      status: 'success',
      meta: { title: 'Photo by User A', keywords: 'nature, landscape' },
    };
    await saveHistoryItem(itemA);

    const sessionA: GenerationSession = {
      id: 'session-user-a',
      title: 'Session Alpha',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'completed',
      itemIds: ['item-user-a'],
      totalFiles: 1,
      errorCount: 0,
      settings: {
        provider: 'gas-proxy',
        model: 'gemini-2.5-flash',
        fileType: 'auto',
        titleLength: 120,
        descriptionLength: 60,
        keywordsCount: 35,
        extraInstructions: '',
      },
    };
    await saveSession(sessionA);

    const histA = await loadHistory(0, 10);
    expect(histA.total).toBe(1);
    expect(histA.items[0].id).toBe('item-user-a');

    const sessA = await loadSessions();
    expect(sessA.length).toBe(1);
    expect(sessA[0].id).toBe('session-user-a');

    // 2. User A logs out
    clearStoredUser();

    // 3. User B (e.g. Hunter or T-Neon) logs in
    saveStoredUser({
      email: 'userb@gmail.com',
      name: 'User B',
      role: 'user',
      status: 'active',
      dailyQuota: 100,
      usageCount: 0,
      remainingQuota: 100,
    });

    // User B should have 0 items and 0 sessions!
    const histB = await loadHistory(0, 10);
    expect(histB.total).toBe(0);
    expect(histB.items).toEqual([]);

    const sessB = await loadSessions();
    expect(sessB).toEqual([]);
  });

  it('should not allow User B to see User A FTP accounts', async () => {
    // User A logs in and saves an FTP profile
    saveStoredUser({
      email: 'usera@gmail.com',
      name: 'User A',
      role: 'user',
      status: 'active',
      dailyQuota: 100,
      usageCount: 0,
      remainingQuota: 100,
    });

    await saveFtpProfile({
      agencyId: 'adobe',
      accountLabel: 'User A Adobe',
      host: 'sftp.contributor.adobestock.com',
      port: 22,
      protocol: 'sftp',
      username: 'userA_adobe',
      password: 'password123',
    });

    const profilesA = await loadFtpProfiles();
    expect(profilesA.length).toBe(1);
    expect(profilesA[0].accountLabel).toBe('User A Adobe');

    // User A logs out, User B logs in
    clearStoredUser();
    saveStoredUser({
      email: 'userb@gmail.com',
      name: 'User B',
      role: 'user',
      status: 'active',
      dailyQuota: 100,
      usageCount: 0,
      remainingQuota: 100,
    });

    // User B must have 0 profiles
    const profilesB = await loadFtpProfiles();
    expect(profilesB.length).toBe(0);
  });
});
