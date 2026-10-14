'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Server,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Plus,
  FileCheck,
  Download,
  X,
  Eye,
  EyeOff,
  Search,
  Sliders,
  History,
  Film,
  Image as ImageIcon,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { downloadAgencyCSV, type Agency } from '@/lib/csv';
import type {
  FtpAccountProfile,
  FtpProtocol,
  MicrostockAgencyId,
  ItemMetaBox,
  UploadLedgerRecord,
  DuplicateCheckResult,
} from '@/lib/types';
import {
  AGENCY_PRESETS,
  loadFtpProfiles,
  saveFtpProfile,
  deleteFtpProfile,
  getActiveFtpProfileId,
  setActiveFtpProfileId,
  loadUploadLedger,
  recordSuccessfulUpload,
  clearUploadLedger,
  computeFileFingerprint,
  checkDuplicateAsset,
  sanitizeFtpHost,
} from '@/lib/ftp/store';
import { normalizeFileStem } from '@/lib/dedupe';
import { useFtpBridgeStatus, getFtpApiUrl } from '@/lib/ftp/bridge-client';
import { FtpBridgeStatusBanner } from '@/components/FtpBridgeStatusBanner';

interface FtpManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ItemMetaBox[];
  files: File[];
  onFilesAttached?: (files: File[]) => void;
}

interface LocalQueueItem {
  id: string;
  itemId: string;
  file?: File;
  filename: string;
  fileSize: number;
  assetType: 'image' | 'video';
  status: 'pending' | 'checking' | 'uploading' | 'success' | 'skipped' | 'error';
  progress: number;
  duplicateInfo?: DuplicateCheckResult;
  error?: string;
  thumbDataUrl?: string;
  metadataEmbedded?: boolean;
}

export function FtpManagerModal({ open, onOpenChange, items, files, onFilesAttached }: FtpManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'accounts' | 'ledger'>('queue');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const {
    status: bridgeStatus,
    isChecking: isCheckingBridge,
    checkStatus: refreshBridgeStatus,
  } = useFtpBridgeStatus();

  // Accounts state
  const [profiles, setProfiles] = useState<FtpAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form state
  const [formAgency, setFormAgency] = useState<MicrostockAgencyId>('adobe');
  const [formLabel, setFormLabel] = useState('');
  const [formHost, setFormHost] = useState(AGENCY_PRESETS.adobe.host);
  const [formPort, setFormPort] = useState(22);
  const [formProtocol, setFormProtocol] = useState<FtpProtocol>('sftp');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Ledger state
  const [ledger, setLedger] = useState<UploadLedgerRecord[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAgencyFilter, setLedgerAgencyFilter] = useState<string>('all');

  // Queue & Upload state
  const [queue, setQueue] = useState<LocalQueueItem[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoEmbedMetadata, setAutoEmbedMetadata] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  const [uploadStats, setUploadStats] = useState<{
    speed: string;
    bytesUploaded: number;
    totalBytes: number;
    completedCount: number;
  }>({ speed: '0 KB/s', bytesUploaded: 0, totalBytes: 0, completedCount: 0 });
  const [recentlyUploadedItemIds, setRecentlyUploadedItemIds] = useState<string[]>([]);

  // Combined available files (from studio props and locally attached inside modal)
  const availableFiles = useMemo(() => {
    const map = new Map<string, File>();
    for (const f of files) map.set(f.name.toLowerCase(), f);
    for (const f of attachedFiles) map.set(f.name.toLowerCase(), f);
    return Array.from(map.values());
  }, [files, attachedFiles]);

  const handleAttachFiles = useCallback(
    (newFiles: File[]) => {
      if (!newFiles.length) return;
      setAttachedFiles((prev) => [...prev, ...newFiles]);
      if (onFilesAttached) {
        onFilesAttached(newFiles);
      }
      const matchedCount = items.filter((it) =>
        newFiles.some((f) => f.name.toLowerCase() === it.filename.toLowerCase())
      ).length;
      if (matchedCount > 0) {
        toast.success(`${matchedCount} file fisik berhasil dipasangkan ke antrean!`);
      } else {
        toast.info(`${newFiles.length} file dipilih. Pastikan nama filenya cocok dengan nama aset di tabel.`);
      }
    },
    [items, onFilesAttached]
  );

  // 1. Load initial profiles and ledger
  const refreshData = useCallback(async () => {
    const loadedProfiles = await loadFtpProfiles();
    setProfiles(loadedProfiles);

    const activeId = await getActiveFtpProfileId();
    if (activeId && loadedProfiles.some((p) => p.id === activeId)) {
      setSelectedAccountId(activeId);
    } else if (loadedProfiles.length > 0) {
      setSelectedAccountId(loadedProfiles[0].id);
      await setActiveFtpProfileId(loadedProfiles[0].id);
    }

    const loadedLedger = await loadUploadLedger();
    setLedger(loadedLedger);
  }, []);

  useEffect(() => {
    if (open) {
      void refreshData();
      setIsAddingAccount(false);
      setEditingAccountId(null);
      setRecentlyUploadedItemIds([]);
    }
  }, [open, refreshData]);

  // Selected profile helper
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedAccountId),
    [profiles, selectedAccountId]
  );

  // 2. Build Queue and scan duplicates deterministically
  useEffect(() => {
    if (!open) return;

    let isCancelled = false;

    async function buildAndScanQueue() {
      const fileMap = new Map<string, File>();
      for (const f of availableFiles) {
        fileMap.set(f.name.toLowerCase(), f);
      }

      const freshLedger = await loadUploadLedger();
      if (isCancelled) return;
      setLedger(freshLedger);

      const itemsWithFiles = items.map((it) => {
        const matchedFile = fileMap.get(it.filename.toLowerCase());
        return {
          id: it.id,
          itemId: it.id,
          file: matchedFile,
          filename: it.filename,
          fileSize: matchedFile?.size || 0,
          assetType: it.assetType,
          thumbDataUrl: it.thumbDataUrl,
          status: 'pending' as const,
          progress: 0,
        };
      });

      // Compute duplicates for each item (termasuk intra-queue deduplication)
      const seenQueueFingerprints = new Map<string, string>(); // fingerprint -> filename
      const seenQueueStems = new Map<string, string>();        // stem_size -> filename

      const newQueue: LocalQueueItem[] = [];
      for (const item of itemsWithFiles) {
        if (!item.file || !selectedProfile) {
          newQueue.push(item);
          continue;
        }

        try {
          const fingerprint = await computeFileFingerprint(item.file);
          const stem = normalizeFileStem(item.filename);
          const stemKey = `${stem}_${item.fileSize}`;

          // 1. Cek duplikat dalam antrean saat ini (intra-queue deduplication)
          const dupInQueue = seenQueueFingerprints.get(fingerprint) || (stem ? seenQueueStems.get(stemKey) : undefined);
          if (dupInQueue && dupInQueue.toLowerCase() !== item.filename.toLowerCase()) {
            newQueue.push({
              ...item,
              duplicateInfo: {
                isDuplicate: true,
                isQueueDuplicate: true,
                duplicateOfFilename: dupInQueue,
                warningMessage: `File ini terdeteksi kembar/duplikat dengan "${dupInQueue}" dalam antrean sesi ini.`,
              },
            });
            continue;
          }

          // Daftarkan ke tracker antrean saat ini
          seenQueueFingerprints.set(fingerprint, item.filename);
          if (stem) seenQueueStems.set(stemKey, item.filename);

          // 2. Cek duplikat terhadap riwayat FTP agensi (ledger masa lalu)
          const dupCheck = checkDuplicateAsset(
            item.filename,
            fingerprint,
            selectedProfile.agencyId,
            freshLedger
          );

          newQueue.push({
            ...item,
            duplicateInfo: dupCheck,
          });
        } catch {
          newQueue.push(item);
        }
      }

      if (isCancelled) return;
      setQueue(newQueue);

      // Default selection: If skipDuplicates is active, uncheck duplicate items!
      const initialSelected = new Set<string>();
      for (const q of newQueue) {
        if (!skipDuplicates || !q.duplicateInfo?.isDuplicate) {
          initialSelected.add(q.id);
        }
      }
      setSelectedQueueIds(initialSelected);
    }

    void buildAndScanQueue();

    return () => {
      isCancelled = true;
    };
  }, [open, items, availableFiles, selectedProfile?.id, selectedProfile?.agencyId, skipDuplicates]);

  const missingFileCount = useMemo(() => {
    return queue.filter((q) => !q.file).length;
  }, [queue]);

  const selectedReadyCount = useMemo(() => {
    return queue.filter((q) => {
      if (!selectedQueueIds.has(q.id) || !q.file) return false;
      if (q.status === 'success') return false;
      if (skipDuplicates && q.duplicateInfo?.isDuplicate) return false;
      return true;
    }).length;
  }, [queue, selectedQueueIds, skipDuplicates]);

  // Preset changer for form
  const handleAgencyPresetSelect = (agency: MicrostockAgencyId) => {
    setFormAgency(agency);
    const preset = AGENCY_PRESETS[agency];
    if (preset) {
      setFormHost(preset.host);
      setFormPort(preset.port);
      setFormProtocol(preset.protocol);
      if (!formLabel || Object.values(AGENCY_PRESETS).some((p) => p.name === formLabel)) {
        setFormLabel(preset.name);
      }
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    if (!formHost || !formUsername || !formPassword) {
      toast.error('Lengkapi Host, Username, dan Password sebelum menguji.');
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    const cleanHost = sanitizeFtpHost(formHost);
    if (cleanHost !== formHost) {
      setFormHost(cleanHost);
    }

    try {
      const testUrl = getFtpApiUrl('test', bridgeStatus);
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: cleanHost,
          port: formPort,
          protocol: formProtocol,
          username: formUsername.trim(),
          password: formPassword,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: msg });
      toast.error(`Koneksi gagal: ${msg}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // Save Account Profile
  const handleSaveAccount = async () => {
    if (!formLabel.trim()) {
      toast.error('Beri label untuk akun ini (misal: "Adobe Stock - Akun Utama").');
      return;
    }

    const cleanHost = sanitizeFtpHost(formHost);
    if (cleanHost !== formHost) {
      setFormHost(cleanHost);
    }

    if (!cleanHost || !formUsername.trim() || !formPassword.trim()) {
      toast.error('Host, Username, dan Password wajib diisi.');
      return;
    }

    try {
      const saved = await saveFtpProfile({
        id: editingAccountId || undefined,
        agencyId: formAgency,
        accountLabel: formLabel.trim(),
        host: cleanHost,
        port: formPort,
        protocol: formProtocol,
        username: formUsername.trim(),
        password: formPassword.trim(),
      });

      toast.success(`Akun "${saved.accountLabel}" berhasil disimpan.`);
      await refreshData();
      setSelectedAccountId(saved.id);
      setIsAddingAccount(false);
      setEditingAccountId(null);
    } catch {
      toast.error('Gagal menyimpan akun.');
    }
  };

  // Start Editing Account
  const handleEditAccount = (p: FtpAccountProfile) => {
    setEditingAccountId(p.id);
    setFormAgency(p.agencyId);
    setFormLabel(p.accountLabel);
    setFormHost(p.host);
    setFormPort(p.port);
    setFormProtocol(p.protocol);
    setFormUsername(p.username);
    setFormPassword(p.password);
    setTestResult(null);
    setIsAddingAccount(true);
    setActiveTab('accounts');
  };

  // Delete Account Profile
  const handleDeleteAccount = async (id: string, label: string) => {
    if (confirm(`Hapus akun FTP "${label}"?`)) {
      await deleteFtpProfile(id);
      toast.info(`Akun "${label}" dihapus.`);
      await refreshData();
    }
  };

  // Queue Selection Helpers
  const toggleSelectQueue = (id: string) => {
    setSelectedQueueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllQueue = () => {
    setSelectedQueueIds(new Set(queue.map((q) => q.id)));
  };

  const selectUnuploadedOnly = () => {
    const unuploaded = queue.filter((q) => !q.duplicateInfo?.isDuplicate && q.status !== 'success');
    setSelectedQueueIds(new Set(unuploaded.map((q) => q.id)));
    toast.info(`Memilih ${unuploaded.length} file yang belum pernah diunggah.`);
  };

  const clearSelection = () => {
    setSelectedQueueIds(new Set());
  };

  // Execute Upload Process
  const handleStartUpload = async () => {
    if (!selectedProfile) {
      toast.error('Pilih akun FTP tujuan terlebih dahulu.');
      return;
    }

    // Filter queue to selected items
    const targetItems = queue.filter((q) => selectedQueueIds.has(q.id));
    if (targetItems.length === 0) {
      toast.error('Pilih setidaknya satu file untuk diunggah.');
      return;
    }

    if (!bridgeStatus.isAvailable) {
      toast.error(
        'Backend FTP Lokal belum aktif! Silakan jalankan start-ftp-bridge.bat di komputer Anda terlebih dahulu agar proses upload berjalan lancar.'
      );
      return;
    }

    const readyItems = targetItems.filter((q) => !!q.file);
    if (readyItems.length === 0) {
      toast.error('File fisik belum dimuat ke memori browser (0.0 MB). Klik "Pasangkan File Asli dari Komputer".');
      document.getElementById('ftp-attach-input')?.click();
      return;
    }

    if (readyItems.length < targetItems.length) {
      toast.warning(`${targetItems.length - readyItems.length} file dilewati karena file fisiknya belum dipasangkan.`);
    }

    setIsUploading(true);
    const uploadedIds: string[] = [];

    // Calculate total bytes
    const totalBytes = readyItems.reduce((acc, it) => acc + it.fileSize, 0);
    setUploadStats({
      speed: 'Memulai...',
      bytesUploaded: 0,
      totalBytes,
      completedCount: 0,
    });

    const startTime = Date.now();
    let cumulativeBytes = 0;

    for (let i = 0; i < targetItems.length; i++) {
      const qItem = targetItems[i];
      setCurrentUploadIndex(i);

      // Pre-flight check: Fresh live verification against latest ledger right before network call
      if (qItem.file && selectedProfile) {
        try {
          const freshLedger = await loadUploadLedger();
          const freshFingerprint = await computeFileFingerprint(qItem.file);
          const liveDupCheck = checkDuplicateAsset(
            qItem.filename,
            freshFingerprint,
            selectedProfile.agencyId,
            freshLedger
          );

          if (liveDupCheck.isDuplicate) {
            setQueue((prev) =>
              prev.map((item) =>
                item.id === qItem.id
                  ? {
                      ...item,
                      status: 'skipped',
                      duplicateInfo: liveDupCheck,
                      error: 'Dilewati: Terdeteksi duplikat',
                    }
                  : item
              )
            );

            if (skipDuplicates) {
              toast.warning(`File "${qItem.filename}" dilewati karena sudah ada di ${selectedProfile.accountLabel}.`);
              continue;
            }
          }
        } catch (err) {
          console.warn('[Pre-flight Check] Gagal verifikasi duplikat:', err);
        }
      }

      // Check if file object exists
      if (!qItem.file) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === qItem.id
              ? { ...item, status: 'error', error: 'File sumber tidak tersedia di memori' }
              : item
          )
        );
        continue;
      }

      // Set uploading status
      setQueue((prev) =>
        prev.map((item) => (item.id === qItem.id ? { ...item, status: 'uploading', progress: 30 } : item))
      );

      try {
        const formData = new FormData();
        formData.append('file', qItem.file);
        formData.append(
          'config',
          JSON.stringify({
            host: selectedProfile.host,
            port: selectedProfile.port,
            protocol: selectedProfile.protocol,
            username: selectedProfile.username,
            password: selectedProfile.password,
            agencyId: selectedProfile.agencyId,
          })
        );
        formData.append('remoteFilename', qItem.filename);

        // Sematkan metadata asli jika tersedia
        const metaItem = items.find((it) => it.id === qItem.itemId);
        if (metaItem?.meta) {
          formData.append(
            'metadata',
            JSON.stringify({
              title: metaItem.meta.title || '',
              description: metaItem.meta.description || '',
              keywords: metaItem.meta.keywords || '',
              aiGenerated: Boolean(metaItem.meta.aiGenerated),
              author: '',
              copyright: '',
            })
          );
          formData.append('embedMetadata', autoEmbedMetadata ? 'true' : 'false');
        }

        const uploadUrl = getFtpApiUrl('upload', bridgeStatus);
        const res = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Gagal mengirim file ke remote server');
        }

        // Success!
        cumulativeBytes += qItem.fileSize;
        const elapsedSecs = Math.max(0.5, (Date.now() - startTime) / 1000);
        const speedKB = cumulativeBytes / 1024 / elapsedSecs;
        const speedStr = speedKB > 1024 ? `${(speedKB / 1024).toFixed(1)} MB/s` : `${Math.round(speedKB)} KB/s`;

        setUploadStats((prev) => ({
          ...prev,
          speed: speedStr,
          bytesUploaded: cumulativeBytes,
          completedCount: prev.completedCount + 1,
        }));

        setQueue((prev) =>
          prev.map((item) =>
            item.id === qItem.id
              ? {
                  ...item,
                  status: 'success',
                  progress: 100,
                  metadataEmbedded: Boolean(data.metadataEmbedded),
                }
              : item
          )
        );

        uploadedIds.push(qItem.itemId);

        // Record to Ledger
        const fingerprint = await computeFileFingerprint(qItem.file);
        await recordSuccessfulUpload({
          assetHash: fingerprint,
          filename: qItem.filename,
          fileSize: qItem.fileSize,
          agencyId: selectedProfile.agencyId,
          accountId: selectedProfile.id,
          accountLabel: selectedProfile.accountLabel,
          uploadedAt: Date.now(),
          status: 'success',
          remotePath: data.remotePath,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === qItem.id ? { ...item, status: 'error', error: msg, progress: 0 } : item
          )
        );
      }
    }

    setIsUploading(false);
    setCurrentUploadIndex(-1);
    setRecentlyUploadedItemIds(uploadedIds);

    // Refresh ledger
    const nextLedger = await loadUploadLedger();
    setLedger(nextLedger);

    toast.success(`Proses upload selesai! (${uploadedIds.length} file berhasil diunggah).`);
  };

  // Download Companion CSV for newly uploaded items
  const handleDownloadCompanionCsv = () => {
    if (!selectedProfile || recentlyUploadedItemIds.length === 0) return;

    const matchedItems = items.filter((it) => recentlyUploadedItemIds.includes(it.id));
    if (matchedItems.length === 0) return;

    const validAgencies: Agency[] = ['adobe', 'shutterstock', 'vecteezy', 'freepik', 'dreamstime'];
    const targetAgency: Agency = validAgencies.includes(selectedProfile.agencyId as Agency)
      ? (selectedProfile.agencyId as Agency)
      : 'adobe';

    downloadAgencyCSV(targetAgency, matchedItems);
    toast.success(`CSV pendamping untuk ${selectedProfile.accountLabel} (${matchedItems.length} file) berhasil diunduh.`);
  };

  // Filtered Ledger Records
  const filteredLedger = useMemo(() => {
    return ledger.filter((rec) => {
      const matchSearch =
        !ledgerSearch.trim() ||
        rec.filename.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        rec.accountLabel.toLowerCase().includes(ledgerSearch.toLowerCase());

      const matchAgency =
        ledgerAgencyFilter === 'all' || rec.agencyId === ledgerAgencyFilter;

      return matchSearch && matchAgency;
    });
  }, [ledger, ledgerSearch, ledgerAgencyFilter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] shadow-[8px_8px_0_#2c1810] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-[#2c1810]">
        {/* Modal Header */}
        <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff6b35] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center font-bold">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-base tracking-tight leading-none">
                FTP / SFTP Distribution Manager
              </h2>
              <p className="text-[11px] text-[#6b5344] font-medium mt-0.5">
                Multi-Akun, Verifikasi Anti-Duplikat & Distribusi Agensi Microstock
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-lg bg-white hover:bg-[#ffe0b2] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4 text-[#2c1810]" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="bg-[#fff5e6]/60 border-b-2 border-[#2c1810] px-5 py-2 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'queue'
                  ? 'bg-[#ff6b35] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                  : 'bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-transparent'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Antrean Upload ({queue.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-[#ff6b35] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                  : 'bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-transparent'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Kelola Akun ({profiles.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-[#ff6b35] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                  : 'bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-transparent'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Ledger Riwayat ({ledger.length})</span>
            </button>
          </div>

          {activeTab === 'queue' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#6b5344]">Target Akun:</span>
              <Select
                value={selectedAccountId}
                onValueChange={(val) => {
                  setSelectedAccountId(val);
                  void setActiveFtpProfileId(val);
                }}
              >
                <SelectTrigger className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-bold h-8 text-xs min-w-[220px] shadow-[1px_1px_0_#2c1810]">
                  <SelectValue placeholder="Pilih Akun..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-[#2c1810]">
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="font-semibold text-xs">
                      {p.accountLabel} ({p.protocol.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <FtpBridgeStatusBanner
              status={bridgeStatus}
              isChecking={isCheckingBridge}
              onRefresh={refreshBridgeStatus}
              compact
            />
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* TAB 1: QUEUE & DISPATCH */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {profiles.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-[#2c1810] rounded-xl bg-[#fff5e6]/40 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center mx-auto text-[#ff6b35]">
                    <Sliders className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base">Belum Ada Akun FTP / SFTP</h3>
                  <p className="text-xs text-[#6b5344] max-w-md mx-auto">
                    Tambahkan profil akun microstock Anda (Adobe Stock, Shutterstock, dll.) untuk mulai mengunggah langsung dari studio.
                  </p>
                  <Button
                    onClick={() => {
                      setActiveTab('accounts');
                      setIsAddingAccount(true);
                    }}
                    className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    + Tambah Akun Sekarang
                  </Button>
                </div>
              ) : (
                <>
                  {/* Account Overview & Pre-flight Notice */}
                  {/* Account Overview & Metadata Flow Notice */}
                  {selectedProfile && (
                    <div className="bg-[#fffdf9] border-2 border-[#2c1810] p-3 rounded-xl shadow-[2px_2px_0_#2c1810] space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full border border-[#2c1810]"
                            style={{ backgroundColor: AGENCY_PRESETS[selectedProfile.agencyId]?.badgeColor || '#ff6b35' }}
                          />
                          <span className="font-extrabold text-sm">{selectedProfile.accountLabel}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#fff5e6] border border-[#2c1810] font-mono font-bold">
                            {selectedProfile.protocol.toUpperCase()}://{selectedProfile.host}:{selectedProfile.port}
                          </span>
                          <span className="text-xs text-[#6b5344] font-medium">({selectedProfile.username})</span>
                        </div>

                        {selectedProfile.agencyId === 'adobe' ? (
                          <span className="text-[11px] font-bold text-[#ff6b35] bg-[#fff5e6] px-2.5 py-1 rounded-md border border-[#2c1810] flex items-center gap-1.5">
                            <span>✨ Adobe Stock:</span>
                            <span className="text-[#2c1810] font-medium">JPG/PNG otomatis terbaca dari file. Video menggunakan CSV.</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-[#2c1810] bg-[#fff5e6] px-2 py-0.5 rounded-md border border-[#2c1810]">
                            Target: {AGENCY_PRESETS[selectedProfile.agencyId]?.name || selectedProfile.agencyId}
                          </span>
                        )}
                      </div>

                      {/* Bar Informasi Transparansi Metadata */}
                      <div className="bg-[#f0f9ff] border border-[#bae6fd] px-3 py-2 rounded-lg text-[11px] text-[#0369a1] flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold flex items-center gap-1">
                          🏷️ Sistem Metadata:
                        </span>
                        <span>
                          File <strong>JPG & PNG</strong> disuntik langsung metadata <strong>IPTC-IIM & Adobe XMP</strong> (Judul, Deskripsi, Kata Kunci). Untuk <strong>Video MP4</strong>, gunakan <strong>CSV Pendamping</strong> agar stream codec aman.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Top Integrated Action & Selection Toolbar */}
                  <div className="bg-[#fffdf9] border-2 border-[#2c1810] p-3 rounded-xl shadow-[3px_3px_0_#2c1810] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    {/* Left: Selection Controls, Counter, and Skip Duplicate Toggle */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={selectAllQueue}
                          className="px-2.5 py-1 bg-white hover:bg-[#fff5e6] border border-[#2c1810] rounded-lg text-xs font-bold shadow-[1px_1px_0_#2c1810] cursor-pointer"
                        >
                          Pilih Semua ({queue.length})
                        </button>
                        <button
                          onClick={selectUnuploadedOnly}
                          className="px-2.5 py-1 bg-[#fff5e6] hover:bg-[#ffe0b2] border border-[#2c1810] rounded-lg text-xs font-bold shadow-[1px_1px_0_#2c1810] cursor-pointer text-[#ff6b35]"
                        >
                          Hanya Yang Belum Diunggah
                        </button>
                        <button
                          onClick={clearSelection}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-[#2c1810] rounded-lg text-xs font-bold cursor-pointer text-[#6b5344]"
                        >
                          Kosongkan
                        </button>
                      </div>

                      <div className="text-xs font-bold text-[#6b5344] flex items-center gap-1.5">
                        <span>{selectedQueueIds.size}/{queue.length} terpilih</span>
                        <span>
                          (
                          {(
                            queue
                              .filter((q) => selectedQueueIds.has(q.id))
                              .reduce((acc, q) => acc + q.fileSize, 0) /
                            (1024 * 1024)
                          ).toFixed(1)}{' '}
                          MB)
                        </span>
                      </div>

                      <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none text-[#2c1810]">
                        <input
                          type="checkbox"
                          checked={skipDuplicates}
                          onChange={(e) => setSkipDuplicates(e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#ff6b35] rounded"
                        />
                        <span>Lewati duplikat</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none text-[#2c1810]" title="Otomatis menyuntikkan judul, deskripsi, dan kata kunci ke file JPG & PNG sebelum diunggah">
                        <input
                          type="checkbox"
                          checked={autoEmbedMetadata}
                          onChange={(e) => setAutoEmbedMetadata(e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#ff6b35] rounded"
                        />
                        <span className="flex items-center gap-1">
                          <span>Tanam Metadata</span>
                          <span className="text-[10px] bg-sky-100 text-sky-800 border border-sky-300 px-1 py-0.2 rounded font-extrabold">
                            IPTC & XMP
                          </span>
                        </span>
                      </label>
                    </div>

                    {/* Right: Upload Action Button & Speed Indicator */}
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      {isUploading && (
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#6b5344] mr-1">
                          <span>{uploadStats.speed}</span>
                          <span>
                            {(uploadStats.bytesUploaded / (1024 * 1024)).toFixed(1)} /{' '}
                            {(uploadStats.totalBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      )}

                      {selectedReadyCount === 0 && selectedQueueIds.size > 0 ? (
                        missingFileCount > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              onClick={() => document.getElementById('ftp-attach-input')?.click()}
                              className="h-9 bg-amber-500 hover:bg-amber-600 text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-xs px-3 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                              Pasangkan File ({missingFileCount})
                            </Button>
                            <Button
                              type="button"
                              onClick={() => document.getElementById('ftp-attach-folder-input')?.click()}
                              variant="outline"
                              className="h-9 bg-white hover:bg-amber-50 text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-xs px-2.5 cursor-pointer"
                            >
                              Folder
                            </Button>
                          </div>
                        ) : (
                          <Button
                            disabled
                            className="h-9 bg-stone-200 text-stone-600 border-2 border-stone-400 font-bold text-xs cursor-not-allowed opacity-80 shadow-none px-3.5"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                            File Sudah Pernah Diunggah (Dilewati)
                          </Button>
                        )
                      ) : (
                        <Button
                          disabled={isUploading || selectedReadyCount === 0 || !selectedProfile}
                          onClick={handleStartUpload}
                          className="h-9.5 bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-xs px-4 cursor-pointer disabled:opacity-50 transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"
                        >
                          {isUploading ? (
                            <span className="flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>
                                Mengunggah ({uploadStats.completedCount}/{selectedReadyCount})...
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Mulai Upload {selectedReadyCount > 0 ? `(${selectedReadyCount})` : ''}</span>
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Missing File Warning & Attacher Banner */}
                  {missingFileCount > 0 && (
                    <div className="p-3.5 bg-amber-50 border-2 border-amber-400 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-[2px_2px_0_#d97706]">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-950">
                            {missingFileCount} dari {queue.length} file fisik belum dimuat ke memori browser (0.0 MB)
                          </p>
                          <p className="text-[11px] text-amber-800">
                            Metadata sudah siap dari sesi sebelumnya. Agar file dapat dikirim via SFTP, pasangkan file JPG/MP4 asli dari folder komputer Anda.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="file"
                          id="ftp-attach-input"
                          multiple
                          accept="image/*,video/mp4,video/webm,video/quicktime"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) {
                              handleAttachFiles(Array.from(e.target.files));
                            }
                          }}
                        />
                        <input
                          type="file"
                          id="ftp-attach-folder-input"
                          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) {
                              handleAttachFiles(Array.from(e.target.files));
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={() => document.getElementById('ftp-attach-input')?.click()}
                          className="bg-[#2c1810] hover:bg-[#43281c] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#ff6b35] font-black text-xs h-8.5 px-3 cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4 mr-1.5 text-[#ff6b35]" />
                          Pilih File Asli
                        </Button>
                        <Button
                          type="button"
                          onClick={() => document.getElementById('ftp-attach-folder-input')?.click()}
                          variant="outline"
                          className="border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] text-[#2c1810] font-black text-xs h-8.5 px-3 cursor-pointer shadow-[2px_2px_0_#2c1810]"
                        >
                          <FolderOpen className="w-4 h-4 mr-1.5 text-amber-600" />
                          Pilih 1 Folder (Auto-Match)
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Queue Items Table with Thumbnail Preview */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files) {
                        handleAttachFiles(Array.from(e.dataTransfer.files));
                      }
                    }}
                    className="border-2 border-[#2c1810] rounded-xl overflow-hidden bg-white shadow-[2px_2px_0_#2c1810] max-h-[52vh] overflow-y-auto"
                  >
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#fff5e6] border-b-2 border-[#2c1810] text-[#2c1810] font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-10 text-center">Pilih</th>
                          <th className="p-2.5 w-16 text-center">Preview</th>
                          <th className="p-2.5">File Asset</th>
                          <th className="p-2.5 w-24">Ukuran</th>
                          <th className="p-2.5">Status Verifikasi Duplikasi</th>
                          <th className="p-2.5 w-36 text-right">Status Upload</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8ddd4] font-medium">
                        {queue.map((qItem) => {
                          const isSelected = selectedQueueIds.has(qItem.id);
                          const isDup = qItem.duplicateInfo?.isDuplicate;

                          return (
                            <tr
                              key={qItem.id}
                              className={`hover:bg-[#fffdf9] transition-colors ${
                                isDup ? 'bg-[#fff5e6]/30' : ''
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectQueue(qItem.id)}
                                  className="w-4 h-4 accent-[#ff6b35] rounded cursor-pointer"
                                />
                              </td>
                              <td className="p-2 w-16 text-center">
                                <div className="w-12 h-12 mx-auto rounded-lg border-2 border-[#2c1810] overflow-hidden bg-stone-100 relative shadow-[1px_1px_0_#2c1810] shrink-0">
                                  {qItem.thumbDataUrl ? (
                                    <img
                                      src={qItem.thumbDataUrl}
                                      alt={qItem.filename}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      {qItem.assetType === 'video' ? (
                                        <Film className="w-5 h-5 text-[#ff6b35]" />
                                      ) : (
                                        <ImageIcon className="w-5 h-5 text-[#0284c7]" />
                                      )}
                                    </div>
                                  )}
                                  {qItem.assetType === 'video' && (
                                    <span className="absolute bottom-0 right-0 bg-[#2c1810] text-[#fff5e6] text-[8px] font-black px-1 rounded-tl-sm leading-tight">
                                      VID
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="flex flex-col gap-1">
                                  <span className="font-bold text-xs text-[#2c1810] truncate max-w-xs sm:max-w-md" title={qItem.filename}>
                                    {qItem.filename}
                                  </span>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {qItem.filename.toLowerCase().match(/\.(jpg|jpeg)$/) ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-800 border border-sky-300 px-1.5 py-0.5 rounded font-semibold" title="Format JPEG: IPTC-IIM Photoshop & XMP Dublin Core otomatis disuntikkan ke dalam file fisik saat diunggah">
                                        🏷️ JPEG: IPTC & XMP Siap Ditanam
                                      </span>
                                    ) : qItem.filename.toLowerCase().endsWith('.png') ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-800 border border-purple-300 px-1.5 py-0.5 rounded font-semibold" title="Format PNG: Chunk iTXt (XMP Packet) resmi Adobe otomatis disuntikkan ke dalam file fisik saat diunggah">
                                        🏷️ PNG: XMP Chunk Siap Ditanam
                                      </span>
                                    ) : qItem.assetType === 'video' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-semibold" title="Video diunggah via FTP/SFTP, metadata disediakan via CSV Pendamping agar stream codec aman">
                                        📄 Video: Metadata via CSV
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-stone-100 text-stone-700 border border-stone-300 px-1.5 py-0.5 rounded font-semibold">
                                        📁 File Asli
                                      </span>
                                    )}

                                    {/* Indikator folder remote otomatis (khususnya Dreamstime yang mewajibkan subfolder terpisah) */}
                                    {selectedProfile?.agencyId === 'dreamstime' && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold"
                                        title="Subfolder otomatis di server FTP Dreamstime sesuai aturan resmi"
                                      >
                                        📁 {qItem.assetType === 'video' ? 'Target: /video' : qItem.filename.match(/\.(ai|eps|svg|cdr)$/i) ? 'Target: /additional' : 'Target: / (Root)'}
                                      </span>
                                    )}

                                    {qItem.duplicateInfo?.matchedRecord && (
                                      <span className="text-[10px] text-amber-800 font-semibold truncate">
                                        • Pernah diunggah: {new Date(qItem.duplicateInfo.matchedRecord.uploadedAt).toLocaleDateString('id-ID')} ({qItem.duplicateInfo.matchedRecord.accountLabel})
                                      </span>
                                    )}

                                    {qItem.duplicateInfo?.isQueueDuplicate && (
                                      <span className="text-[10px] text-amber-800 font-semibold truncate">
                                        • Kembar dengan: {qItem.duplicateInfo.duplicateOfFilename}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 font-mono text-[11px]">
                                {qItem.file ? (
                                  <span className="text-[#6b5344]">
                                    {(qItem.fileSize / (1024 * 1024)).toFixed(1)} MB
                                  </span>
                                ) : (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                    0.0 MB (Perlu File)
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                {!qItem.file ? (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 border border-stone-300 text-stone-700 text-[11px] font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                                    <span>Menunggu File Fisik</span>
                                  </div>
                                ) : isDup ? (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span className="truncate max-w-sm" title={qItem.duplicateInfo?.warningMessage}>
                                      {qItem.duplicateInfo?.isQueueDuplicate
                                        ? `Kembar di antrean: ${qItem.duplicateInfo.duplicateOfFilename}`
                                        : `Pernah diunggah ke [${qItem.duplicateInfo?.matchedRecord?.accountLabel}]`}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Bersih (Siap Unggah)</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono text-[11px]">
                                {!qItem.file && qItem.status === 'pending' && (
                                  <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Perlu File Asli
                                  </span>
                                )}
                                {qItem.file && qItem.status === 'pending' && (
                                  <span className="text-[#6b5344]">Antrean</span>
                                )}
                                {qItem.status === 'uploading' && (
                                  <span className="text-[#ff6b35] font-bold flex items-center justify-end gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Mengunggah...</span>
                                  </span>
                                )}
                                {qItem.status === 'success' && (
                                  <div className="flex flex-col items-end">
                                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>✓ Sukses</span>
                                    </span>
                                    {qItem.metadataEmbedded ? (
                                      <span className="text-[9px] text-sky-800 font-bold bg-sky-50 px-1.5 py-0.2 rounded border border-sky-300 mt-0.5">
                                        Metadata Tertanam
                                      </span>
                                    ) : qItem.assetType === 'video' ? (
                                      <span className="text-[9px] text-amber-800 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-300 mt-0.5">
                                        Sambung via CSV
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                                {qItem.status === 'skipped' && (
                                  <span className="text-amber-600 font-bold">Dilewati</span>
                                )}
                                {qItem.status === 'error' && (
                                  <span className="text-red-600 font-bold" title={qItem.error}>
                                    ✕ {qItem.error ? qItem.error : 'Gagal'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Companion CSV Offer Banner (After Uploads) */}
                  {recentlyUploadedItemIds.length > 0 && (
                    <div className="p-3 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center justify-between flex-wrap gap-2 animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-emerald-950">
                            {recentlyUploadedItemIds.length} file berhasil terkirim ke server SFTP!
                          </p>
                          <p className="text-[11px] text-emerald-800">
                            Unduh file CSV pendamping yang disinkronkan hanya untuk file yang baru diunggah ini.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleDownloadCompanionCsv}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 shadow-[2px_2px_0_#064e3b] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Download CSV Pendamping ({recentlyUploadedItemIds.length} File)
                      </Button>
                    </div>
                  )}


                </>
              )}
            </div>
          )}

          {/* TAB 2: MULTI-ACCOUNTS MANAGER */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              {!isAddingAccount ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm">Daftar Akun FTP / SFTP Tersimpan</h3>
                      <p className="text-xs text-[#6b5344]">
                        Kelola banyak akun untuk Adobe Stock, Shutterstock, Vecteezy, dll.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setEditingAccountId(null);
                        setFormLabel('');
                        setFormUsername('');
                        setFormPassword('');
                        setTestResult(null);
                        handleAgencyPresetSelect('adobe');
                        setIsAddingAccount(true);
                      }}
                      className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      + Tambah Akun Baru
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {profiles.map((p) => {
                      const preset = AGENCY_PRESETS[p.agencyId] || AGENCY_PRESETS.custom;
                      return (
                        <div
                          key={p.id}
                          className="bg-white border-2 border-[#2c1810] rounded-xl p-3.5 shadow-[3px_3px_0_#2c1810] space-y-2 relative"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: preset.badgeColor }}
                                />
                                <h4 className="font-extrabold text-sm">{p.accountLabel}</h4>
                              </div>
                              <p className="text-[11px] text-[#6b5344] font-medium mt-0.5">
                                Agensi: <strong className="text-[#2c1810]">{preset.name}</strong> ({p.username})
                              </p>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#fff5e6] border border-[#2c1810]">
                              {p.protocol.toUpperCase()}:{p.port}
                            </span>
                          </div>

                          <p className="text-[11px] font-mono text-[#6b5344] truncate">{p.host}</p>

                          <div className="pt-2 border-t border-[#e8ddd4] flex items-center justify-between">
                            <span className="text-[10px] text-[#6b5344]">
                              Terakhir digunakan:{' '}
                              {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleDateString('id-ID') : 'Belum pernah'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleEditAccount(p)}
                                className="p-1.5 bg-[#fff5e6] hover:bg-[#ffe0b2] border border-[#2c1810] rounded-lg text-xs font-bold cursor-pointer"
                                title="Edit Akun"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(p.id, p.accountLabel)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-300 rounded-lg text-xs cursor-pointer"
                                title="Hapus Akun"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* FORM ADD / EDIT ACCOUNT */
                <div className="bg-white border-2 border-[#2c1810] rounded-xl p-5 shadow-[4px_4px_0_#2c1810] space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e8ddd4] pb-3">
                    <h3 className="font-black text-sm">
                      {editingAccountId ? 'Edit Profil Akun FTP' : 'Tambah Akun FTP / SFTP Baru'}
                    </h3>
                    <button
                      onClick={() => setIsAddingAccount(false)}
                      className="text-xs font-bold text-[#6b5344] hover:underline cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>

                  {/* Preset Selector */}
                  <div>
                    <Label className="text-xs font-bold text-[#6b5344] mb-1.5 block">
                      Pilih Preset Agensi Microstock:
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.values(AGENCY_PRESETS).map((preset) => (
                        <button
                          key={preset.agencyId}
                          type="button"
                          onClick={() => handleAgencyPresetSelect(preset.agencyId)}
                          className={`p-2 rounded-lg border-2 text-left font-bold text-xs transition-all cursor-pointer ${
                            formAgency === preset.agencyId
                              ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                              : 'bg-[#fffdf9] text-[#2c1810] border-[#2c1810]/30 hover:border-[#2c1810]'
                          }`}
                        >
                          <span className="block truncate">{preset.name}</span>
                          <span className="text-[10px] opacity-80 font-mono font-normal">
                            {preset.protocol.toUpperCase()} ({preset.port})
                          </span>
                        </button>
                      ))}
                    </div>
                    {AGENCY_PRESETS[formAgency]?.helperNote && (
                      <p className="text-[11px] text-[#ff6b35] font-medium mt-1.5">
                        💡 {AGENCY_PRESETS[formAgency].helperNote}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Label Akun Kustom</Label>
                      <Input
                        value={formLabel}
                        onChange={(e) => setFormLabel(e.target.value)}
                        placeholder="Contoh: Adobe Stock - Footage Portofolio"
                        className="bg-white border-2 border-[#2c1810] font-bold text-xs h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Protokol Transfer</Label>
                      <Select
                        value={formProtocol}
                        onValueChange={(val) => setFormProtocol(val as FtpProtocol)}
                      >
                        <SelectTrigger className="bg-white border-2 border-[#2c1810] font-bold text-xs h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-2 border-[#2c1810]">
                          <SelectItem value="sftp">SFTP (SSH Port 22 - Adobe & Shutterstock)</SelectItem>
                          <SelectItem value="ftp">FTP (Port 21 - Vecteezy & Dreamstime)</SelectItem>
                          <SelectItem value="ftps">FTPS (FTP over TLS/SSL - Freepik)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-emerald-800 font-semibold mt-1 font-sans">
                        ⚡ Mode Transfer: <strong>Passive (PASV)</strong> aktif otomatis sesuai standar resmi Dreamstime.
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Host Server</Label>
                      <Input
                        value={formHost}
                        onChange={(e) => setFormHost(e.target.value)}
                        onBlur={(e) => setFormHost(sanitizeFtpHost(e.target.value))}
                        placeholder="sftp.contributor.adobestock.com"
                        className="bg-white border-2 border-[#2c1810] font-mono text-xs h-9"
                      />
                      <p className="text-[10px] text-[#8a7261] mt-1 font-sans">
                        💡 Domain server saja. Jika mem-paste dengan <code>sftp://</code> dari portal Adobe, sistem otomatis membersihkannya.
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Port</Label>
                      <Input
                        type="number"
                        value={formPort}
                        onChange={(e) => setFormPort(Number(e.target.value))}
                        className="bg-white border-2 border-[#2c1810] font-mono text-xs h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Username Kontributor</Label>
                      <Input
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder={
                          formAgency === 'dreamstime'
                            ? 'Contoh: 58008129 (User ID angka)'
                            : 'Username kontributor agensi'
                        }
                        className="bg-white border-2 border-[#2c1810] font-bold text-xs h-9"
                      />
                      {formAgency === 'dreamstime' && (
                        <p className="text-[10px] text-emerald-800 font-semibold mt-1">
                          💡 Dreamstime mewajibkan <strong>User ID (angka numerik)</strong>, bukan alamat email atau display name.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-[#6b5344] mb-1 block">Password SFTP / FTP</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                          placeholder={
                            formAgency === 'dreamstime'
                              ? 'Password akun Dreamstime'
                              : 'Password khusus SFTP / FTP'
                          }
                          className="bg-white border-2 border-[#2c1810] font-mono text-xs h-9 pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-2 text-[#6b5344] hover:text-[#2c1810] cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Banner */}
                  {testResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs font-medium ${
                        testResult.ok
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-red-50 border-red-300 text-red-900'
                      }`}
                    >
                      {testResult.ok ? '✓ ' : '✕ '} {testResult.message}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8ddd4]">
                    <Button
                      type="button"
                      disabled={testingConnection}
                      onClick={handleTestConnection}
                      className="bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs h-9 cursor-pointer"
                    >
                      {testingConnection ? (
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menguji...</span>
                        </span>
                      ) : (
                        <span>Uji Koneksi (Test Connection)</span>
                      )}
                    </Button>

                    <Button
                      type="button"
                      onClick={handleSaveAccount}
                      className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs h-9 cursor-pointer"
                    >
                      Simpan Profil Akun
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LEDGER & RIWAYAT DUPLIKASI */}
          {activeTab === 'ledger' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-extrabold text-sm">Upload Ledger & Audit Trail Duplikasi</h3>
                  <p className="text-xs text-[#6b5344]">
                    Catatan permanen setiap aset yang pernah diunggah untuk mencegah penolakan spam duplikat agensi.
                  </p>
                </div>

                {ledger.length > 0 && (
                  <Button
                    onClick={async () => {
                      if (confirm('Hapus seluruh riwayat upload ledger? Peringatan duplikasi aset akan ter-reset.')) {
                        await clearUploadLedger();
                        await refreshData();
                        toast.info('Riwayat ledger dibersihkan.');
                      }
                    }}
                    className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-300 text-xs h-8 cursor-pointer font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Reset Ledger
                  </Button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6b5344]" />
                  <Input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Cari nama file atau akun..."
                    className="bg-white border-2 border-[#2c1810] text-xs h-8 pl-8 font-medium"
                  />
                </div>

                <Select value={ledgerAgencyFilter} onValueChange={setLedgerAgencyFilter}>
                  <SelectTrigger className="bg-white border-2 border-[#2c1810] text-xs h-8 w-44 font-bold">
                    <SelectValue placeholder="Semua Agensi" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#2c1810]">
                    <SelectItem value="all">Semua Agensi</SelectItem>
                    <SelectItem value="adobe">Adobe Stock</SelectItem>
                    <SelectItem value="shutterstock">Shutterstock</SelectItem>
                    <SelectItem value="vecteezy">Vecteezy</SelectItem>
                    <SelectItem value="freepik">Freepik</SelectItem>
                    <SelectItem value="dreamstime">Dreamstime</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ledger Table */}
              <div className="border-2 border-[#2c1810] rounded-xl overflow-hidden bg-white shadow-[2px_2px_0_#2c1810] max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#fff5e6] border-b-2 border-[#2c1810] text-[#2c1810] font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Nama File</th>
                      <th className="p-2.5 w-24">Ukuran</th>
                      <th className="p-2.5">Agensi & Akun Tujuan</th>
                      <th className="p-2.5 w-32 font-mono">Fingerprint SHA</th>
                      <th className="p-2.5 w-32 text-right">Tanggal Upload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8ddd4] font-medium">
                    {filteredLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[#6b5344] italic">
                          Belum ada riwayat unggahan pada ledger.
                        </td>
                      </tr>
                    ) : (
                      filteredLedger.map((rec) => (
                        <tr key={rec.id} className="hover:bg-[#fffdf9]">
                          <td className="p-2.5 font-bold truncate max-w-xs">{rec.filename}</td>
                          <td className="p-2.5 font-mono text-[11px] text-[#6b5344]">
                            {(rec.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </td>
                          <td className="p-2.5">
                            <span className="font-bold text-[#ff6b35] uppercase text-[10px] mr-1.5">
                              [{rec.agencyId}]
                            </span>
                            <span>{rec.accountLabel}</span>
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-[#6b5344]" title={rec.assetHash}>
                            {rec.assetHash.slice(0, 10)}...
                          </td>
                          <td className="p-2.5 text-right font-mono text-[11px] text-[#6b5344]">
                            {new Date(rec.uploadedAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
