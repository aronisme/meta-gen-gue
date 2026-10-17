import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getStoredUser,
  saveStoredUser,
  clearStoredUser,
  onAuthChange,
  loginWithGoogleIdToken,
  refreshUserStatus,
} from '../auth/store';
import { saveSettings, loadSettings } from '../store';
import type { AuthUser } from '../auth/types';

describe('Auth Store & Whitelist Quota Management', () => {
  const mockUser: AuthUser = {
    email: 'test@microstock.com',
    name: 'Test Contributor',
    picture: 'https://example.com/avatar.jpg',
    role: 'member',
    status: 'active',
    dailyQuota: 100,
    usageCount: 15,
    remainingQuota: 85,
    lastLogin: new Date().toISOString(),
    idToken: 'mock-google-id-token',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return null when no user is stored', () => {
    expect(getStoredUser()).toBeNull();
  });

  it('should save and retrieve stored user', () => {
    saveStoredUser(mockUser);
    const retrieved = getStoredUser();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.email).toBe('test@microstock.com');
    expect(retrieved?.remainingQuota).toBe(85);
    expect(retrieved?.status).toBe('active');
  });

  it('should clear stored user on logout', () => {
    saveStoredUser(mockUser);
    expect(getStoredUser()).not.toBeNull();

    clearStoredUser();
    expect(getStoredUser()).toBeNull();
  });

  it('should trigger onAuthChange listener on save and clear', () => {
    const listener = vi.fn();
    const unsubscribe = onAuthChange(listener);

    saveStoredUser(mockUser);
    expect(listener).toHaveBeenCalledWith(mockUser);

    clearStoredUser();
    expect(listener).toHaveBeenCalledWith(null);

    unsubscribe();
  });

  it('should process loginWithGoogleIdToken successfully', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          email: 'test@microstock.com',
          name: 'Test Contributor',
          role: 'user',
          status: 'active',
          dailyQuota: 100,
          usageCount: 0,
          remainingQuota: 100,
        },
      }),
    } as Response);

    const result = await loginWithGoogleIdToken('valid-id-token-123');
    expect(fetchSpy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.user?.email).toBe('test@microstock.com');
    expect(result.user?.idToken).toBe('valid-id-token-123');

    // Should also be saved in local storage
    expect(getStoredUser()?.email).toBe('test@microstock.com');
  });

  it('should refresh user quota status correctly', async () => {
    saveStoredUser(mockUser);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          dailyQuota: 100,
          usageCount: 20,
          remainingQuota: 80,
          status: 'active',
        },
      }),
    } as Response);

    const updated = await refreshUserStatus();
    expect(updated?.usageCount).toBe(20);
    expect(updated?.remainingQuota).toBe(80);
    expect(getStoredUser()?.remainingQuota).toBe(80);
  });

  it('should clamp remainingQuota to 0 when usage exceeds dailyQuota', async () => {
    saveStoredUser(mockUser);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          dailyQuota: 100,
          usageCount: 120,
          status: 'active',
        },
      }),
    } as Response);

    const updated = await refreshUserStatus();
    expect(updated?.usageCount).toBe(120);
    expect(updated?.remainingQuota).toBe(0);
  });

  it('should save and load settings without triggering background sync when triggerSync is false', () => {
    saveSettings(
      {
        provider: 'gas-proxy',
        model: 'gemini-2.5-flash',
        fileType: 'auto',
        titleLength: 120,
        descriptionLength: 60,
        keywordsCount: 35,
        extraInstructions: 'Focus on commercial keywords',
      },
      false
    );

    const loaded = loadSettings();
    expect(loaded).not.toBeNull();
    expect(loaded?.titleLength).toBe(120);
    expect(loaded?.keywordsCount).toBe(35);
    expect(loaded?.extraInstructions).toBe('Focus on commercial keywords');
  });
});
