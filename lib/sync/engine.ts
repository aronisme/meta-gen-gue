// lib/sync/engine.ts
// Automatic, Silent Two-Way Sync Engine between Browser (IndexedDB/LocalStorage) and Cloudflare D1

import { get, set, getMany, setMany, keys } from 'idb-keyval';
import type {
  ItemMetaBox,
  GenerationSession,
  FtpAccountProfile,
  UploadLedgerRecord,
  MicrostockAgencyId,
  FtpProtocol,
  FileType,
  AssetType,
  SessionStatus,
} from '@/lib/types';
import { loadSettings, saveSettings } from '@/lib/store';
import { getStoredUser } from '@/lib/auth/store';

const HISTORE = 'history-v1';
const SESSION_STORE = 'sessions-v1';
const FTP_ACCOUNTS_KEY = 'metagen_ftp_accounts_v1';
const UPLOAD_LEDGER_KEY = 'metagen_upload_ledger_v1';

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

export const SYNC_COMPLETED_EVENT = 'metagen_sync_completed';

/**
 * Mendorong seluruh data lokal (IndexedDB & LocalStorage) ke Cloudflare D1
 */
export async function pushLocalDataToCloud(userEmail: string): Promise<boolean> {
  try {
    const user = getStoredUser();
    const idToken = user?.idToken;
    const allKeys = (await keys()) as string[];

    // 1. Kumpulkan Item Riwayat via Batch
    const histKeys = allKeys.filter((k) => k.startsWith(`${HISTORE}:`));
    const rawHist = histKeys.length > 0 ? await getMany<ItemMetaBox>(histKeys) : [];
    const historyItems: ItemMetaBox[] = rawHist.filter(Boolean) as ItemMetaBox[];

    // 2. Kumpulkan Sesi Batch
    const sessionKeys = allKeys.filter((k) => k.startsWith(`${SESSION_STORE}:`));
    const rawSessions = sessionKeys.length > 0 ? await getMany<GenerationSession>(sessionKeys) : [];
    const sessions: GenerationSession[] = rawSessions.filter(Boolean) as GenerationSession[];

    // 3. Kumpulkan Akun FTP
    const ftpAccounts = (await get<FtpAccountProfile[]>(FTP_ACCOUNTS_KEY)) || [];

    // 4. Kumpulkan Upload Ledger
    const uploadLedger = (await get<UploadLedgerRecord[]>(UPLOAD_LEDGER_KEY)) || [];

    // 5. Kumpulkan Pengaturan
    const settings = loadSettings();

    // Format payload untuk API D1
    const payload = {
      action: 'push_batch',
      userEmail,
      idToken,
      historyItems: historyItems.slice(0, 300).map((it) => ({
        id: it.id,
        sessionId: it.sessionId,
        filename: it.filename,
        assetType: it.assetType || 'image',
        title: it.meta?.title || '',
        description: it.meta?.description || it.meta?.title || '',
        keywords: it.meta?.keywords || '',
        category: it.meta?.category,
        shutterstockCategory: it.meta?.shutterstockCategory,
        illustration: it.meta?.illustration,
        aiModel: it.meta?.aiModel,
        createdAt: new Date(it.createdAt || Date.now()).toISOString(),
      })),
      sessions: sessions.slice(0, 50).map((s) => ({
        id: s.id,
        name: s.title,
        fileCount: s.totalFiles || s.itemIds?.length || 0,
        itemIds: s.itemIds || [],
        status: s.status || 'completed',
        totalFiles: s.totalFiles || s.itemIds?.length || 0,
        successCount: s.successCount || 0,
        errorCount: s.errorCount || 0,
        createdAt: new Date(s.createdAt || Date.now()).toISOString(),
      })),
      ftpAccounts: ftpAccounts.map((a) => ({
        id: a.id,
        agencyId: a.agencyId,
        accountName: a.accountLabel || a.username,
        host: a.host,
        port: a.port,
        protocol: a.protocol,
        username: a.username,
        password: a.password || '',
        isActive: true,
        createdAt: new Date(a.createdAt || Date.now()).toISOString(),
      })),
      uploadLedger: uploadLedger.slice(0, 500).map((r) => ({
        id: r.id,
        fileHash: r.assetHash,
        filename: r.filename,
        agencyId: r.agencyId,
        fileSize: r.fileSize || 0,
        accountId: r.accountId || '',
        accountLabel: r.accountLabel || r.agencyId || '',
        status: r.status,
        uploadedAt: new Date(r.uploadedAt || Date.now()).toISOString(),
      })),
      settings: settings || undefined,
    };

    const resp = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { ok?: boolean };
      return !!data.ok;
    }
    return false;
  } catch (err) {
    console.warn('[Auto-Sync Push Error]:', err);
    return false;
  }
}

/**
 * Menarik data dari Cloudflare D1 dan menggabungkannya ke IndexedDB browser
 */
export async function pullCloudDataToLocal(userEmail: string): Promise<boolean> {
  try {
    const user = getStoredUser();
    const idToken = user?.idToken;

    const resp = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        action: 'pull',
        userEmail,
        idToken,
      }),
    });

    if (!resp.ok) return false;

    const res = (await resp.json()) as {
      ok?: boolean;
      data?: {
        history?: Array<{
          id: string;
          filename: string;
          assetType?: string;
          title: string;
          description?: string;
          keywords: string;
          category?: string;
          shutterstockCategory?: string;
          illustration?: number | boolean;
          aiModel?: string;
          createdAt: string;
          sessionId?: string;
        }>;
        sessions?: Array<{
          id: string;
          name: string;
          fileCount?: number;
          itemIds?: string[];
          status?: string;
          totalFiles?: number;
          successCount?: number;
          errorCount?: number;
          createdAt: string;
        }>;
        ftpAccounts?: Array<{
          id: string;
          agencyId: string;
          accountName: string;
          host: string;
          port?: number;
          protocol?: string;
          username: string;
          password?: string;
          isActive?: boolean;
          createdAt?: string;
        }>;
        uploadLedger?: Array<{
          id: string;
          fileHash: string;
          filename: string;
          agencyId: string;
          fileSize?: number;
          accountId?: string;
          accountLabel?: string;
          status?: string;
          uploadedAt: string;
        }>;
        settings?: {
          provider: string;
          model: string;
          fileType: string;
          titleLength: number;
          descriptionLength: number;
          keywordsCount: number;
          extraInstructions: string;
        } | null;
      };
    };

    if (!res.ok || !res.data) return false;

    const { history, sessions, ftpAccounts, uploadLedger, settings } = res.data;

    // 1. Simpan Riwayat dari Cloud ke IndexedDB via Batch
    if (history && history.length > 0) {
      const keysToCheck = history.map((h) => `${HISTORE}:${h.id}`);
      const existingItems = await getMany<ItemMetaBox>(keysToCheck);
      const newEntries: Array<[string, ItemMetaBox]> = [];

      for (let i = 0; i < history.length; i++) {
        const h = history[i];
        if (!existingItems[i]) {
          const createdAtNum = typeof h.createdAt === 'string' ? new Date(h.createdAt).getTime() : Date.now();
          const item: ItemMetaBox = {
            id: h.id,
            filename: h.filename,
            fileType: 'auto',
            assetType: (h.assetType as AssetType) || 'image',
            createdAt: createdAtNum,
            sessionId: h.sessionId,
            status: 'success',
            meta: {
              title: h.title,
              description: h.description || h.title,
              keywords: h.keywords,
              category: h.category,
              shutterstockCategory: h.shutterstockCategory,
              illustration: Boolean(h.illustration),
              aiModel: h.aiModel,
              aiGenerated: true,
            },
          };
          newEntries.push([keysToCheck[i], item]);
        }
      }

      if (newEntries.length > 0) {
        await setMany(newEntries);
      }
    }

    // 2. Simpan Sesi Batch dari Cloud ke IndexedDB
    if (sessions && sessions.length > 0) {
      const sessionKeysToCheck = sessions.map((s) => `${SESSION_STORE}:${s.id}`);
      const existingSessions = await getMany<GenerationSession>(sessionKeysToCheck);
      const newSessionEntries: Array<[string, GenerationSession]> = [];

      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        if (!existingSessions[i]) {
          const sesCreatedAt = typeof s.createdAt === 'string' ? new Date(s.createdAt).getTime() : Date.now();
          const ses: GenerationSession = {
            id: s.id,
            title: s.name,
            createdAt: sesCreatedAt,
            updatedAt: sesCreatedAt,
            status: (s.status as SessionStatus) || 'completed',
            settings: {
              provider: 'gas-proxy',
              model: 'gemini-2.5-flash',
              fileType: 'auto',
              titleLength: 120,
              descriptionLength: 60,
              keywordsCount: 35,
              extraInstructions: '',
            },
            itemIds: Array.isArray(s.itemIds) ? s.itemIds : [],
            totalFiles: s.totalFiles || s.fileCount || 0,
            successCount: s.successCount || s.fileCount || 0,
            errorCount: s.errorCount || 0,
          };
          newSessionEntries.push([sessionKeysToCheck[i], ses]);
        }
      }

      if (newSessionEntries.length > 0) {
        await setMany(newSessionEntries);
      }
    }

    // 3. Gabungkan Akun FTP dari Cloud ke IndexedDB
    if (ftpAccounts && ftpAccounts.length > 0) {
      const localAccounts = (await get<FtpAccountProfile[]>(FTP_ACCOUNTS_KEY)) || [];
      const map = new Map<string, FtpAccountProfile>();
      for (const a of localAccounts) map.set(a.id, a);
      for (const a of ftpAccounts) {
        if (!map.has(a.id)) {
          const profile: FtpAccountProfile = {
            id: a.id,
            agencyId: (a.agencyId as MicrostockAgencyId) || 'other',
            accountLabel: a.accountName || a.username,
            host: a.host,
            port: a.port || 22,
            protocol: (a.protocol as FtpProtocol) || 'sftp',
            username: a.username,
            password: a.password || '',
            createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
          };
          map.set(a.id, profile);
        }
      }
      await set(FTP_ACCOUNTS_KEY, Array.from(map.values()));
    }

    // 4. Gabungkan Upload Ledger dari Cloud ke IndexedDB
    if (uploadLedger && uploadLedger.length > 0) {
      const localLedger = (await get<UploadLedgerRecord[]>(UPLOAD_LEDGER_KEY)) || [];
      const map = new Map<string, UploadLedgerRecord>();
      for (const r of localLedger) map.set(r.id, r);
      for (const r of uploadLedger) {
        if (!map.has(r.id)) {
          const record: UploadLedgerRecord = {
            id: r.id,
            assetHash: r.fileHash,
            filename: r.filename,
            fileSize: r.fileSize || 0,
            agencyId: (r.agencyId as MicrostockAgencyId) || 'adobe',
            accountId: r.accountId || '',
            accountLabel: r.accountLabel || r.agencyId,
            uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).getTime() : Date.now(),
            status: (r.status as 'success' | 'failed') || 'success',
          };
          map.set(r.id, record);
        }
      }
      await set(UPLOAD_LEDGER_KEY, Array.from(map.values()));
    }

    // 5. Terapkan Pengaturan dari Cloud (tanpa memicu push balik / echo)
    if (settings) {
      const existing = loadSettings();
      saveSettings(
        {
          provider: 'gas-proxy',
          model: settings.model || existing?.model || 'gemini-2.5-flash',
          fileType: (settings.fileType as FileType) || existing?.fileType || 'auto',
          titleLength: settings.titleLength || existing?.titleLength || 120,
          descriptionLength: settings.descriptionLength || existing?.descriptionLength || 60,
          keywordsCount: settings.keywordsCount || existing?.keywordsCount || 35,
          extraInstructions: settings.extraInstructions || existing?.extraInstructions || '',
        },
        false
      );
    }

    // Beri tahu UI bahwa data baru dari cloud telah digabungkan
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT));
    }

    return true;
  } catch (err) {
    console.warn('[Auto-Sync Pull Error]:', err);
    return false;
  }
}

/**
 * Sinkronisasi Dua Arah Otomatis saat Pengguna Login
 */
export async function runInitialSilentSync(userEmail: string): Promise<void> {
  if (isSyncing || !userEmail) return;
  isSyncing = true;

  try {
    // 1. Tarik data dari cloud terlebih dahulu agar preferensi akun termuat
    await pullCloudDataToLocal(userEmail);
    // 2. Unggah data lokal yang belum tersimpan di cloud
    await pushLocalDataToCloud(userEmail);
  } catch (e) {
    console.warn('[Initial Silent Sync Error]:', e);
  } finally {
    isSyncing = false;
  }
}

/**
 * Memanggil sinkronisasi di latar belakang dengan sistem debounce (2 detik)
 */
export function queueBackgroundSync(): void {
  const user = getStoredUser();
  if (!user?.email) return;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    void pushLocalDataToCloud(user.email);
  }, 2000);
}

/**
 * Hapus item riwayat di cloud D1 saat pengguna menghapus dari riwayat lokal
 */
export async function syncDeleteHistoryItems(ids: string[]): Promise<void> {
  const user = getStoredUser();
  if (!user?.email || ids.length === 0) return;

  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.idToken ? { Authorization: `Bearer ${user.idToken}` } : {}),
      },
      body: JSON.stringify({
        action: 'delete_history',
        userEmail: user.email,
        idToken: user.idToken,
        ids,
      }),
    });
  } catch (err) {
    console.warn('[Sync Delete Error]:', err);
  }
}

/**
 * Hapus sesi tugas di cloud D1 saat pengguna menghapus sesi lokal
 */
export async function syncDeleteSession(sessionId: string, itemIds?: string[]): Promise<void> {
  const user = getStoredUser();
  if (!user?.email || !sessionId) return;

  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.idToken ? { Authorization: `Bearer ${user.idToken}` } : {}),
      },
      body: JSON.stringify({
        action: 'delete_session',
        userEmail: user.email,
        idToken: user.idToken,
        sessionId,
        deleteItems: !!(itemIds && itemIds.length > 0),
        itemIds,
      }),
    });
  } catch (err) {
    console.warn('[Sync Delete Session Error]:', err);
  }
}

/**
 * Hapus akun FTP/SFTP di cloud D1 saat pengguna menghapus akun lokal
 */
export async function syncDeleteFtpAccount(accountId: string): Promise<void> {
  const user = getStoredUser();
  if (!user?.email || !accountId) return;

  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.idToken ? { Authorization: `Bearer ${user.idToken}` } : {}),
      },
      body: JSON.stringify({
        action: 'delete_ftp_account',
        userEmail: user.email,
        idToken: user.idToken,
        accountId,
      }),
    });
  } catch (err) {
    console.warn('[Sync Delete FTP Account Error]:', err);
  }
}
