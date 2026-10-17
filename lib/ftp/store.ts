import { get, set } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { queueBackgroundSync, syncDeleteFtpAccount } from '@/lib/sync/engine';
import type {
  FtpAccountProfile,
  FtpProtocol,
  MicrostockAgencyId,
  UploadLedgerRecord,
  DuplicateCheckResult,
} from '@/lib/types';


export interface AgencyPresetInfo {
  agencyId: MicrostockAgencyId;
  name: string;
  host: string;
  port: number;
  protocol: FtpProtocol;
  helperNote: string;
  badgeColor: string;
}

/**
 * Membersihkan format hostname yang di-copy user dari portal agensi (seperti Adobe Stock yang menyertakan 'sftp://').
 * Menghapus skema protokol (sftp://, ftp://, ftps://, https://, http://), port suffix (:22), trailing slash, dan whitespace.
 */
export function sanitizeFtpHost(rawHost: string): string {
  if (!rawHost) return '';
  let host = rawHost.trim();
  // Hapus skema protokol URI seperti sftp://, ftp://, ftps://, https://, http://
  host = host.replace(/^[a-zA-Z0-9]+:\/\//, '');
  // Hapus path URL jika user mem-paste URL lengkap
  host = host.split('/')[0];
  // Hapus port jika user memasukkan host:port (misal host.com:22)
  host = host.split(':')[0];
  return host.trim();
}

export const AGENCY_PRESETS: Record<MicrostockAgencyId, AgencyPresetInfo> = {
  adobe: {
    agencyId: 'adobe',
    name: 'Adobe Stock',
    host: 'sftp.contributor.adobestock.com',
    port: 22,
    protocol: 'sftp',
    helperNote: 'Gunakan password khusus SFTP yang digenerate dari tab Upload portal Adobe Stock.',
    badgeColor: '#ff0000',
  },
  shutterstock: {
    agencyId: 'shutterstock',
    name: 'Shutterstock',
    host: 'sftp.shutterstock.com',
    port: 22,
    protocol: 'sftp',
    helperNote: 'Gunakan username dan password akun Shutterstock Contributor Anda.',
    badgeColor: '#e02424',
  },
  vecteezy: {
    agencyId: 'vecteezy',
    name: 'Vecteezy',
    host: 'ftp.vecteezy.com',
    port: 21,
    protocol: 'ftp',
    helperNote: 'Gunakan kredensial akun Vecteezy Contributor. File video/vektor diunggah ke root folder.',
    badgeColor: '#f97316',
  },
  dreamstime: {
    agencyId: 'dreamstime',
    name: 'Dreamstime',
    host: 'upload.dreamstime.com',
    port: 21,
    protocol: 'ftp',
    helperNote: 'Wajib gunakan Numeric User ID (contoh: 58008129, bukan email) & password akun Dreamstime. Sistem otomatis mengunggah video ke /video, vektor ke /additional, dan foto ke root (/).',
    badgeColor: '#10b981',
  },
  freepik: {
    agencyId: 'freepik',
    name: 'Freepik',
    host: 'ftp.freepik.com',
    port: 21,
    protocol: 'ftps',
    helperNote: 'Gunakan password khusus FTP dari dashboard contributor Freepik.',
    badgeColor: '#0284c7',
  },
  pond5: {
    agencyId: 'pond5',
    name: 'Pond5',
    host: 'ftp.pond5.com',
    port: 21,
    protocol: 'ftp',
    helperNote: 'Gunakan username dan password akun Pond5.',
    badgeColor: '#8b5cf6',
  },
  custom: {
    agencyId: 'custom',
    name: 'Custom Server',
    host: '',
    port: 22,
    protocol: 'sftp',
    helperNote: 'Konfigurasi host, port, dan protokol sesuai server FTP/SFTP Anda sendiri.',
    badgeColor: '#6b7280',
  },
};

import { getUserScope } from '@/lib/store';

const LEGACY_STORAGE_KEYS = {
  ACCOUNTS: 'metagen_ftp_accounts_v1',
  ACTIVE_ACCOUNT: 'metagen_ftp_active_account_v1',
  LEDGER: 'metagen_upload_ledger_v1',
};

export function getFtpAccountsKey(scope = getUserScope()): string {
  return scope === 'guest' ? LEGACY_STORAGE_KEYS.ACCOUNTS : `metagen_ftp_accounts_${scope}`;
}

export function getFtpActiveAccountKey(scope = getUserScope()): string {
  return scope === 'guest' ? LEGACY_STORAGE_KEYS.ACTIVE_ACCOUNT : `metagen_ftp_active_account_${scope}`;
}

export function getUploadLedgerKey(scope = getUserScope()): string {
  return scope === 'guest' ? LEGACY_STORAGE_KEYS.LEDGER : `metagen_upload_ledger_${scope}`;
}

/* =========================================================================
 * 1. Account Profiles Management (IndexedDB + Bridge Local File Sync)
 * ========================================================================= */

const BRIDGE_PROFILES_URL = 'http://127.0.0.1:45678/api/ftp/profiles';

async function syncWithBridge(list?: FtpAccountProfile[], targetScope?: string): Promise<FtpAccountProfile[] | null> {
  if (typeof window === 'undefined') return null;
  const scope = targetScope || getUserScope();
  // Jangan sinkronkan profil bridge lokal jika user adalah tamu (guest)
  if (scope === 'guest') return null;

  try {
    const url = `${BRIDGE_PROFILES_URL}?userEmail=${encodeURIComponent(scope)}`;
    if (list) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
        signal: AbortSignal.timeout(2000),
      });
      return list;
    } else {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const fromBridge = (await resp.json()) as FtpAccountProfile[];
        if (Array.isArray(fromBridge)) {
          return fromBridge;
        }
      }
    }
  } catch {
    // Bridge offline or not reachable, silently fallback
  }
  return null;
}

export async function loadFtpProfiles(targetScope?: string): Promise<FtpAccountProfile[]> {
  try {
    const scope = targetScope || getUserScope();
    const key = getFtpAccountsKey(scope);
    let list = await get<FtpAccountProfile[]>(key);

    // Migrasi otomatis data legacy hanya untuk admin/pemilik asli jika namespace masih kosong
    if ((!Array.isArray(list) || list.length === 0) && scope === 'sr7aron@gmail.com') {
      const legacy = await get<FtpAccountProfile[]>(LEGACY_STORAGE_KEYS.ACCOUNTS);
      if (Array.isArray(legacy) && legacy.length > 0) {
        await set(key, legacy);
        list = legacy;
      }
    }

    // Jika IndexedDB kosong dan bukan guest, tarik dari Bridge lokal khusus untuk user aktif
    if (!Array.isArray(list) || list.length === 0) {
      if (scope !== 'guest') {
        const fromBridge = await syncWithBridge(undefined, scope);
        if (fromBridge && fromBridge.length > 0) {
          await set(key, fromBridge);
          const activeId = await getActiveFtpProfileId(scope);
          if (!activeId) {
            await setActiveFtpProfileId(fromBridge[0].id, scope);
          }
          return fromBridge;
        }
      }
    }
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[FTP Store] Gagal memuat daftar akun:', err);
    return [];
  }
}

export async function syncFtpProfilesWithBridge(targetScope?: string): Promise<FtpAccountProfile[]> {
  const scope = targetScope || getUserScope();
  if (scope === 'guest') return loadFtpProfiles(scope);

  const fromBridge = await syncWithBridge(undefined, scope);
  if (fromBridge && fromBridge.length > 0) {
    const key = getFtpAccountsKey(scope);
    const current = (await get<FtpAccountProfile[]>(key)) || [];
    const mergedMap = new Map<string, FtpAccountProfile>();
    fromBridge.forEach((p) => mergedMap.set(p.id, p));
    current.forEach((p) => mergedMap.set(p.id, p));
    const merged = Array.from(mergedMap.values());
    await set(key, merged);
    syncWithBridge(merged, scope).catch(() => {});
    return merged;
  }
  return loadFtpProfiles(scope);
}

export async function saveFtpProfile(
  profileData: Omit<FtpAccountProfile, 'id' | 'createdAt'> & { id?: string },
  targetScope?: string
): Promise<FtpAccountProfile> {
  const scope = targetScope || getUserScope();
  const key = getFtpAccountsKey(scope);
  const current = await loadFtpProfiles(scope);
  const id = profileData.id || nanoid();
  const existing = current.find((p) => p.id === id);

  const updatedProfile: FtpAccountProfile = {
    ...profileData,
    id,
    createdAt: existing?.createdAt || Date.now(),
    lastUsedAt: Date.now(),
  };

  const nextList = existing
    ? current.map((p) => (p.id === id ? updatedProfile : p))
    : [...current, updatedProfile];

  await set(key, nextList);
  syncWithBridge(nextList, scope).catch(() => {});
  queueBackgroundSync();
  return updatedProfile;
}

export async function deleteFtpProfile(id: string, targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = getFtpAccountsKey(scope);
  const current = await loadFtpProfiles(scope);
  const nextList = current.filter((p) => p.id !== id);
  await set(key, nextList);
  syncWithBridge(nextList, scope).catch(() => {});
  queueBackgroundSync();
  void syncDeleteFtpAccount(id);

  const activeId = await getActiveFtpProfileId(scope);
  if (activeId === id) {
    await setActiveFtpProfileId(nextList[0]?.id || null, scope);
  }
}

export async function getActiveFtpProfileId(targetScope?: string): Promise<string | null> {
  try {
    const scope = targetScope || getUserScope();
    const key = getFtpActiveAccountKey(scope);
    return (await get<string>(key)) || null;
  } catch {
    return null;
  }
}

export async function setActiveFtpProfileId(id: string | null, targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = getFtpActiveAccountKey(scope);
  await set(key, id);
}

/* =========================================================================
 * 2. Deterministic File Fingerprint (SHA-256)
 * ========================================================================= */

export { computeFileFingerprint } from '@/lib/dedupe';

/* =========================================================================
 * 3. Anti-Duplicate Upload Ledger (Audit Trail)
 * ========================================================================= */

export async function loadUploadLedger(targetScope?: string): Promise<UploadLedgerRecord[]> {
  try {
    const scope = targetScope || getUserScope();
    const key = getUploadLedgerKey(scope);
    const list = await get<UploadLedgerRecord[]>(key);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[FTP Store] Gagal memuat upload ledger:', err);
    return [];
  }
}

export async function recordSuccessfulUpload(
  record: Omit<UploadLedgerRecord, 'id'>,
  targetScope?: string
): Promise<UploadLedgerRecord> {
  const scope = targetScope || getUserScope();
  const key = getUploadLedgerKey(scope);
  const current = await loadUploadLedger(scope);
  const newRecord: UploadLedgerRecord = {
    ...record,
    id: nanoid(),
  };

  const nextList = [newRecord, ...current.slice(0, 9999)];
  await set(key, nextList);
  queueBackgroundSync();
  return newRecord;
}

export async function clearUploadLedger(targetScope?: string): Promise<void> {
  const scope = targetScope || getUserScope();
  const key = getUploadLedgerKey(scope);
  await set(key, []);
}

/**
 * Memverifikasi apakah suatu aset pernah diunggah ke salah satu akun
 * dalam agensi yang sama.
 */
export function checkDuplicateAsset(
  filename: string,
  fingerprint: string,
  targetAgencyId: MicrostockAgencyId,
  ledger: UploadLedgerRecord[]
): DuplicateCheckResult {
  const cleanFilename = filename.trim().toLowerCase();

  // 1. Cari kecocokan exact hash fingerprint di agensi yang sama
  const matchByHash = ledger.find(
    (rec) => rec.agencyId === targetAgencyId && rec.assetHash === fingerprint && rec.status === 'success'
  );

  if (matchByHash) {
    const dateStr = new Date(matchByHash.uploadedAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return {
      isDuplicate: true,
      matchedRecord: matchByHash,
      warningMessage: `File ini terdeteksi identik (SHA-256) dan sudah pernah diunggah ke akun "${matchByHash.accountLabel}" (${matchByHash.filename}) pada ${dateStr}.`,
    };
  }

  // 2. Cari kecocokan nama file di agensi yang sama (peringatan nama sama)
  const matchByName = ledger.find(
    (rec) =>
      rec.agencyId === targetAgencyId &&
      rec.filename.toLowerCase() === cleanFilename &&
      rec.status === 'success'
  );

  if (matchByName) {
    const dateStr = new Date(matchByName.uploadedAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return {
      isDuplicate: true,
      matchedRecord: matchByName,
      warningMessage: `Nama file "${filename}" sudah pernah diunggah ke akun "${matchByName.accountLabel}" pada ${dateStr}. Disarankan mengganti nama file untuk menghindari tumpang-tindih di server agensi.`,
    };
  }

  return { isDuplicate: false };
}
