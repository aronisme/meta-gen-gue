'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Key,
  Maximize2,
  RefreshCw,
  Sparkles,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

import type {
  DuplicateCheckResult,
  FtpAccountProfile,
  ItemMetaBox,
} from '@/lib/types';
import {
  AGENCY_PRESETS,
  checkDuplicateAsset,
  computeFileFingerprint,
  getActiveFtpProfileId,
  loadFtpProfiles,
  loadUploadLedger,
  recordSuccessfulUpload,
  setActiveFtpProfileId,
} from '@/lib/ftp/store';
import { normalizeFileStem } from '@/lib/dedupe';
import { useFtpBridgeStatus, getFtpApiUrl } from '@/lib/ftp/bridge-client';
import { FtpBridgeStatusBanner } from '@/components/FtpBridgeStatusBanner';

export interface FtpQueueViewProps {
  items: ItemMetaBox[];
  files: File[];
  onFilesAttached?: (files: File[]) => void;
  onNavigateToAccounts?: () => void;
  onNavigateToStudio?: () => void;
  onUploadStateChange?: (state: {
    isUploading: boolean;
    completedCount: number;
    totalCount: number;
    currentFilename?: string;
    speed?: string;
  }) => void;
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
  hasValidMeta?: boolean;
  metaError?: string;
}

export function FtpQueueView({
  items,
  files,
  onFilesAttached,
  onNavigateToAccounts,
  onNavigateToStudio,
  onUploadStateChange,
}: FtpQueueViewProps) {
  const {
    status: bridgeStatus,
    isChecking: isCheckingBridge,
    checkStatus: refreshBridgeStatus,
  } = useFtpBridgeStatus();

  // Profiles state
  const [profiles, setProfiles] = useState<FtpAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Queue state
  const [queue, setQueue] = useState<LocalQueueItem[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoEmbedMetadata, setAutoEmbedMetadata] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const isUploadingRef = useRef(false);
  const abortUploadRef = useRef(false);
  const activeAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeFilenamesRef = useRef<Set<string>>(new Set());
  const [currentUploadingFilename, setCurrentUploadingFilename] = useState<string>('');

  // Concurrency state (1 | 2 | 3 paralel stream)
  const [concurrency, setConcurrency] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('metagen_ftp_concurrency_v1');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if ([1, 2, 3].includes(parsed)) return parsed;
        }
      } catch {}
    }
    return 2; // Default 2x (Optimal)
  });

  const handleConcurrencyChange = (val: string) => {
    const num = parseInt(val, 10) || 2;
    setConcurrency(num);
    try {
      localStorage.setItem('metagen_ftp_concurrency_v1', String(num));
    } catch {}
  };

  const [uploadStats, setUploadStats] = useState<{
    speed: string;
    bytesUploaded: number;
    totalBytes: number;
    completedCount: number;
  }>({ speed: '0 KB/s', bytesUploaded: 0, totalBytes: 0, completedCount: 0 });

  // Lightbox preview modal state
  const [lightboxItem, setLightboxItem] = useState<LocalQueueItem | null>(null);

  // Available files combined (Studio + attached locally in this view)
  const availableFiles = useMemo(() => {
    const map = new Map<string, File>();
    for (const f of files) map.set(f.name.toLowerCase(), f);
    for (const f of attachedFiles) map.set(f.name.toLowerCase(), f);
    return Array.from(map.values());
  }, [files, attachedFiles]);

  // Load profiles on mount
  const refreshProfiles = useCallback(async () => {
    const loaded = await loadFtpProfiles();
    setProfiles(loaded);

    const activeId = await getActiveFtpProfileId();
    if (activeId && loaded.some((p) => p.id === activeId)) {
      setSelectedAccountId(activeId);
    } else if (loaded.length > 0) {
      setSelectedAccountId(loaded[0].id);
      await setActiveFtpProfileId(loaded[0].id);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedAccountId),
    [profiles, selectedAccountId]
  );

  // Warn on accidental tab close / page refresh while uploading
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  // Build Queue & scan duplicates deterministically
  useEffect(() => {
    let isCancelled = false;

    async function buildAndScanQueue() {
      // JANGAN timpa antrean jika proses upload sedang berjalan di latar!
      if (isUploadingRef.current) {
        return;
      }

      const fileMap = new Map<string, File>();
      for (const f of availableFiles) {
        fileMap.set(f.name.toLowerCase(), f);
      }

      const freshLedger = await loadUploadLedger();
      if (isCancelled) return;

      const itemsWithFiles = items.map((it) => {
        const matchedFile = fileMap.get(it.filename.toLowerCase());
        const hasValidMeta = Boolean(
          !it.error && it.meta && Boolean(it.meta.title?.trim()) && Boolean(it.meta.keywords?.trim())
        );
        return {
          id: it.id,
          itemId: it.id,
          file: matchedFile,
          filename: it.filename,
          fileSize: matchedFile?.size || 0,
          assetType: it.assetType,
          thumbDataUrl: it.thumbDataUrl,
          hasValidMeta,
          metaError: it.error,
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

      // Pertahankan status (success, error, progress) dari antrean sebelumnya
      setQueue((prevQueue) => {
        if (prevQueue.length === 0) return newQueue;
        const prevMap = new Map<string, LocalQueueItem>();
        for (const it of prevQueue) {
          prevMap.set(it.id, it);
          prevMap.set(it.filename.toLowerCase(), it);
        }

        return newQueue.map((item) => {
          const prev = prevMap.get(item.id) || prevMap.get(item.filename.toLowerCase());
          if (prev && prev.status !== 'pending') {
            return {
              ...item,
              status: prev.status,
              progress: prev.progress,
              error: prev.error,
              metadataEmbedded: prev.metadataEmbedded,
            };
          }
          return item;
        });
      });

      // Default selection: Jangan centang item yang gagal AI / belum ada metadata
      setSelectedQueueIds((prevSelected) => {
        if (prevSelected.size > 0) return prevSelected;
        const initialSelected = new Set<string>();
        for (const q of newQueue) {
          if (q.file && q.hasValidMeta && (!skipDuplicates || !q.duplicateInfo?.isDuplicate)) {
            initialSelected.add(q.id);
          }
        }
        return initialSelected;
      });
    }

    void buildAndScanQueue();

    return () => {
      isCancelled = true;
    };
  }, [items, availableFiles, selectedProfile?.id, selectedProfile?.agencyId, skipDuplicates]);

  const missingFileCount = useMemo(() => {
    return queue.filter((q) => !q.file).length;
  }, [queue]);

  const selectedReadyCount = useMemo(() => {
    return queue.filter((q) => {
      if (!selectedQueueIds.has(q.id) || !q.file) return false;
      if (q.status === 'success') return false;
      if (!q.hasValidMeta) return false;
      if (skipDuplicates && q.duplicateInfo?.isDuplicate) return false;
      return true;
    }).length;
  }, [queue, selectedQueueIds, skipDuplicates]);

  // Kirim update status ke parent (agar tab lain tahu ada proses berjalan di latar)
  useEffect(() => {
    onUploadStateChange?.({
      isUploading,
      completedCount: uploadStats.completedCount,
      totalCount: selectedReadyCount + uploadStats.completedCount,
      currentFilename: currentUploadingFilename,
      speed: uploadStats.speed,
    });
  }, [
    isUploading,
    uploadStats.completedCount,
    selectedReadyCount,
    currentUploadingFilename,
    uploadStats.speed,
    onUploadStateChange,
  ]);

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
        toast.info(`${newFiles.length} file dipilih. Pastikan nama filenya cocok dengan nama aset di antrean.`);
      }
    },
    [items, onFilesAttached]
  );

  // Selection helpers
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
    const unuploaded = queue.filter(
      (q) => q.hasValidMeta && !q.duplicateInfo?.isDuplicate && q.status !== 'success'
    );
    setSelectedQueueIds(new Set(unuploaded.map((q) => q.id)));
    toast.info(`Memilih ${unuploaded.length} file yang belum pernah diunggah.`);
  };

  const clearSelection = () => {
    setSelectedQueueIds(new Set());
  };

  // Coba ulang unggahan yang sebelumnya gagal
  const handleRetryFailed = () => {
    const failedItems = queue.filter((q) => q.status === 'error' && q.file && q.hasValidMeta);
    if (failedItems.length === 0) {
      toast.info('Tidak ada file gagal yang dapat dicoba lagi.');
      return;
    }
    const failedIds = new Set(failedItems.map((q) => q.id));
    setQueue((prev) =>
      prev.map((item) =>
        failedIds.has(item.id)
          ? { ...item, status: 'pending', error: undefined, progress: 0 }
          : item
      )
    );
    setSelectedQueueIds(failedIds);
    toast.success(`${failedItems.length} file gagal direset ke antrean. Klik "Mulai Upload" untuk mencoba kembali.`);
  };

  // Upload cancellation handler
  const handleCancelUpload = () => {
    abortUploadRef.current = true;
    activeAbortControllersRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch {}
    });
    activeAbortControllersRef.current.clear();
    activeFilenamesRef.current.clear();
    setIsUploading(false);
    isUploadingRef.current = false;
    setCurrentUploadingFilename('');
    toast.info('Unggahan dihentikan oleh pengguna.');

    // Fire and forget pembersihan sesi bridge jika diperlukan
    try {
      const disconnectUrl = getFtpApiUrl('disconnect-all', bridgeStatus);
      void fetch(disconnectUrl, { method: 'POST' }).catch(() => {});
    } catch {}
  };

  // Upload handler dengan Controlled Concurrency & Session Keep-Alive
  const handleStartUpload = async () => {
    if (!selectedProfile) {
      toast.error('Pilih akun FTP tujuan terlebih dahulu.');
      return;
    }

    const targetItems = queue.filter((q) => selectedQueueIds.has(q.id) && q.status !== 'success');
    if (targetItems.length === 0) {
      if (queue.some((q) => selectedQueueIds.has(q.id) && q.status === 'success')) {
        toast.info('Semua file yang dipilih sudah berhasil diunggah.');
      } else {
        toast.error('Pilih setidaknya satu file untuk diunggah.');
      }
      return;
    }

    if (!bridgeStatus.isAvailable) {
      toast.error(
        'Backend FTP Lokal belum aktif! Silakan jalankan start-ftp-bridge.bat di komputer Anda terlebih dahulu agar proses upload berjalan lancar.'
      );
      return;
    }

    const readyItems = targetItems.filter((q) => Boolean(q.file && q.hasValidMeta));
    if (readyItems.length === 0) {
      const missingMeta = targetItems.filter((q) => !q.hasValidMeta);
      if (missingMeta.length > 0) {
        toast.error(
          `${missingMeta.length} file yang dipilih tidak dapat diunggah karena belum memiliki metadata lengkap atau gagal AI generate.`
        );
        return;
      }
      toast.error('File fisik belum dimuat ke memori browser (0.0 MB). Klik "Pasangkan File Asli dari Komputer".');
      document.getElementById('ftp-queue-attach-input')?.click();
      return;
    }

    if (readyItems.length < targetItems.length) {
      const skippedCount = targetItems.length - readyItems.length;
      toast.warning(`${skippedCount} file dilewati karena belum memiliki file fisik atau metadata.`);
    }

    setIsUploading(true);
    isUploadingRef.current = true;
    abortUploadRef.current = false;
    activeAbortControllersRef.current.clear();
    activeFilenamesRef.current.clear();

    const totalBytes = readyItems.reduce((acc, it) => acc + it.fileSize, 0);
    setUploadStats({
      speed: 'Memulai...',
      bytesUploaded: 0,
      totalBytes,
      completedCount: 0,
    });

    const startTime = Date.now();
    let cumulativeBytes = 0;
    let completedCount = 0;
    let queueCursor = 0;

    // Helper untuk memperbarui status upload aktif
    const updateActiveFilenames = () => {
      const list = Array.from(activeFilenamesRef.current);
      if (list.length === 0) {
        setCurrentUploadingFilename('');
      } else if (list.length === 1) {
        setCurrentUploadingFilename(list[0]);
      } else {
        setCurrentUploadingFilename(`${list[0]} (+${list.length - 1} paralel)`);
      }
    };

    // Fungsi untuk memproses satu item antrean di slot worker tertentu
    const processItem = async (qItem: LocalQueueItem, slotIndex: number) => {
      if (abortUploadRef.current) return;

      // Pre-flight check terhadap ledger live
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
              return;
            }
          }
        } catch (err) {
          console.warn('[Pre-flight Check] Gagal verifikasi duplikat:', err);
        }
      }

      if (!qItem.file) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === qItem.id
              ? { ...item, status: 'error', error: 'File sumber tidak tersedia di memori' }
              : item
          )
        );
        return;
      }

      if (!qItem.hasValidMeta) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === qItem.id
              ? { ...item, status: 'error', error: 'Metadata belum digenerate atau gagal' }
              : item
          )
        );
        return;
      }

      activeFilenamesRef.current.add(qItem.filename);
      updateActiveFilenames();

      setQueue((prev) =>
        prev.map((item) => (item.id === qItem.id ? { ...item, status: 'uploading', progress: 30 } : item))
      );

      const abortController = new AbortController();
      activeAbortControllersRef.current.set(qItem.id, abortController);

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
            slotIndex,
          })
        );
        formData.append('remoteFilename', qItem.filename);

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
          signal: abortController.signal,
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Gagal mengirim file ke remote server');
        }

        cumulativeBytes += qItem.fileSize;
        completedCount++;
        const elapsedSecs = Math.max(0.5, (Date.now() - startTime) / 1000);
        const speedKB = cumulativeBytes / 1024 / elapsedSecs;
        const speedStr = speedKB > 1024 ? `${(speedKB / 1024).toFixed(1)} MB/s` : `${Math.round(speedKB)} KB/s`;

        setUploadStats((prev) => ({
          ...prev,
          speed: speedStr,
          bytesUploaded: cumulativeBytes,
          completedCount,
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
        if (abortUploadRef.current) {
          setQueue((prev) =>
            prev.map((item) => (item.id === qItem.id ? { ...item, status: 'pending', progress: 0 } : item))
          );
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((item) => (item.id === qItem.id ? { ...item, status: 'error', error: msg } : item))
        );
      } finally {
        activeAbortControllersRef.current.delete(qItem.id);
        activeFilenamesRef.current.delete(qItem.filename);
        updateActiveFilenames();
      }
    };

    // Worker loop runner
    const runWorker = async (slotIndex: number) => {
      while (!abortUploadRef.current) {
        let currentIndex = -1;
        if (queueCursor < targetItems.length) {
          currentIndex = queueCursor;
          queueCursor++;
        } else {
          break;
        }

        const qItem = targetItems[currentIndex];
        if (!qItem) break;

        await processItem(qItem, slotIndex);

        // Pacing delay ringan (50ms) per worker agar event loop tetap responsif
        if (!abortUploadRef.current && queueCursor < targetItems.length) {
          await new Promise((res) => setTimeout(res, 50));
        }
      }
    };

    // Jalankan worker pool secara paralel sesuai konfigurasi concurrency (1, 2, atau 3)
    const workerCount = Math.min(concurrency, targetItems.length);
    await Promise.all(
      Array.from({ length: workerCount }, (_, i) => runWorker(i))
    );

    setIsUploading(false);
    isUploadingRef.current = false;
    setCurrentUploadingFilename('');
    activeAbortControllersRef.current.clear();
    activeFilenamesRef.current.clear();

    if (!abortUploadRef.current) {
      toast.success('Proses batch upload selesai!');
    }
  };

  // Hidden file input helpers
  const triggerFileInput = () => {
    document.getElementById('ftp-queue-attach-input')?.click();
  };
  const triggerFolderInput = () => {
    document.getElementById('ftp-queue-attach-folder-input')?.click();
  };

  return (
    <div className="space-y-6">
      {/* Hidden file inputs for attachment */}
      <input
        id="ftp-queue-attach-input"
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleAttachFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        id="ftp-queue-attach-folder-input"
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in browsers
        webkitdirectory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleAttachFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {/* 1. Header Toolbar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Upload className="w-6 h-6 text-[#ff6b35]" />
              <span>Antrean Upload Microstock</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-xs font-black px-2.5 py-0.5 rounded-full shadow-[1px_1px_0_#2c1810]">
              {queue.length} File
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Kirim langsung ke server FTP/SFTP agensi dengan verifikasi anti-duplikat & auto-embed IPTC & XMP.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Target Profile Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#6b5344] whitespace-nowrap">Target Akun:</span>
            {profiles.length > 0 ? (
              <Select
                value={selectedAccountId}
                onValueChange={(val) => {
                  setSelectedAccountId(val);
                  void setActiveFtpProfileId(val);
                }}
              >
                <SelectTrigger className="h-9 w-48 sm:w-60 bg-white border-2 border-[#2c1810] font-bold text-xs shadow-[2px_2px_0_#2c1810] truncate">
                  <SelectValue placeholder="Pilih Akun Agensi" />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810]">
                  {profiles.map((p) => {
                    const preset = AGENCY_PRESETS[p.agencyId];
                    return (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-bold cursor-pointer">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: preset?.badgeColor || '#ff6b35' }}
                          />
                          <span className="truncate">{p.accountLabel}</span>
                          <span className="text-[10px] uppercase font-mono text-stone-500">({p.protocol})</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <Button
                type="button"
                onClick={onNavigateToAccounts}
                className="h-9 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 mr-1.5" />
                Tambah Akun Terlebih Dahulu
              </Button>
            )}
          </div>

          {/* Quick Navigate Buttons */}
          {onNavigateToAccounts && (
            <Button
              type="button"
              variant="outline"
              onClick={onNavigateToAccounts}
              className="h-9 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              Kelola Akun ({profiles.length})
            </Button>
          )}

          {onNavigateToStudio && (
            <Button
              type="button"
              variant="outline"
              onClick={onNavigateToStudio}
              className="h-9 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#ff6b35]" />
              Studio
            </Button>
          )}
        </div>
      </div>

      {/* Local FTP Bridge Status Banner */}
      <FtpBridgeStatusBanner
        status={bridgeStatus}
        isChecking={isCheckingBridge}
        onRefresh={refreshBridgeStatus}
      />

      {/* 2. Missing Physical File Alert Banner */}
      {missingFileCount > 0 && queue.length > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-[3px_3px_0_#d97706]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-bold text-amber-950">
                {missingFileCount} file di antrean belum memiliki file fisik di memori browser.
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                Pilih folder tempat Anda menyimpan aset di komputer. Sistem otomatis mencocokkan nama file secara instan.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={triggerFolderInput}
              className="bg-amber-500 hover:bg-amber-600 text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] h-9 px-3.5 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Pilih 1 Folder (Auto-Match)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={triggerFileInput}
              className="bg-white hover:bg-amber-100 text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] h-9 px-3 cursor-pointer"
            >
              Pilih File
            </Button>
          </div>
        </div>
      )}

      {/* 3. Empty Queue State */}
      {queue.length === 0 ? (
        <div className="bg-[#fffdf9] border-2 border-dashed border-[#2c1810] rounded-2xl p-12 text-center shadow-[4px_4px_0_#2c1810] space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] flex items-center justify-center text-[#ff6b35]">
            <Upload className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-black text-lg text-[#2c1810]">Antrean Masih Kosong</h3>
            <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
              Aset foto dan video yang Anda generate di tab Studio akan otomatis masuk ke antrean ini. Anda juga bisa memuat sesi kerja lama dari tab Riwayat.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            {onNavigateToStudio && (
              <Button
                type="button"
                onClick={onNavigateToStudio}
                className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-5 py-2.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Mulai di Studio
              </Button>
            )}
            {onNavigateToAccounts && (
              <Button
                type="button"
                variant="outline"
                onClick={onNavigateToAccounts}
                className="bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 py-2.5 cursor-pointer"
              >
                <Key className="w-4 h-4 mr-1.5 text-amber-600" />
                Atur Akun FTP
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* 4. Main Queue Card with Full-Width Table */
        <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[6px_6px_0_#2c1810] overflow-hidden">
          {/* Action & Filter Bar */}
          <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left Selection Controls */}
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllQueue}
                  className="h-8 bg-white border-2 border-[#2c1810] font-black text-xs px-2.5 shadow-[1px_1px_0_#2c1810] cursor-pointer"
                >
                  Pilih Semua
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectUnuploadedOnly}
                  className="h-8 bg-white border-2 border-[#2c1810] font-bold text-xs px-2.5 shadow-[1px_1px_0_#2c1810] cursor-pointer text-emerald-800"
                >
                  Pilih Siap Unggah
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-8 text-[#6b5344] font-bold text-xs hover:text-[#2c1810] cursor-pointer"
                >
                  Batal Pilih
                </Button>
              </div>

              <div className="h-4 w-px bg-stone-300 hidden sm:block" />

              <span className="font-bold text-[#2c1810]">
                {selectedQueueIds.size}/{queue.length} Terpilih
                <span className="text-[#6b5344] font-normal ml-1">
                  (
                  {(
                    queue
                      .filter((q) => selectedQueueIds.has(q.id))
                      .reduce((acc, q) => acc + q.fileSize, 0) /
                    (1024 * 1024)
                  ).toFixed(1)}{' '}
                  MB)
                </span>
              </span>
            </div>

            {/* Right Options & Upload Action */}
            <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
              <label
                className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none text-[#2c1810]"
                title="Otomatis lewati item yang terdeteksi identik di riwayat server atau kembar di antrean saat ini"
              >
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#ff6b35] rounded cursor-pointer"
                />
                <span>Lewati Duplikat</span>
              </label>

              <label
                className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none text-[#2c1810]"
                title="Otomatis menyuntikkan judul, deskripsi, dan kata kunci ke file JPG & PNG sebelum diunggah"
              >
                <input
                  type="checkbox"
                  checked={autoEmbedMetadata}
                  onChange={(e) => setAutoEmbedMetadata(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#ff6b35] rounded cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <span>Tanam Metadata</span>
                  <span className="text-[10px] bg-sky-100 text-sky-800 border border-sky-300 px-1 py-0.2 rounded font-black">
                    IPTC & XMP
                  </span>
                </span>
              </label>

              {/* Concurrency Selector */}
              <div
                className="flex items-center gap-1.5 text-xs font-bold text-[#2c1810]"
                title="Jumlah koneksi paralel yang mengunggah secara bersamaan (2x disarankan untuk Adobe Stock & Shutterstock)"
              >
                <span className="text-[#6b5344] whitespace-nowrap">Stream:</span>
                <Select
                  value={String(concurrency)}
                  onValueChange={handleConcurrencyChange}
                  disabled={isUploading}
                >
                  <SelectTrigger className="h-8 w-28 sm:w-32 bg-white border-2 border-[#2c1810] font-bold text-xs shadow-[1px_1px_0_#2c1810]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810]">
                    <SelectItem value="1" className="text-xs font-bold cursor-pointer">
                      1x (Serial)
                    </SelectItem>
                    <SelectItem value="2" className="text-xs font-bold cursor-pointer">
                      2x (Optimal)
                    </SelectItem>
                    <SelectItem value="3" className="text-xs font-bold cursor-pointer">
                      3x (Turbo)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Stats / Speed */}
              {isUploading && (
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#6b5344]">
                  <span>{uploadStats.speed}</span>
                  <span>
                    {(uploadStats.bytesUploaded / (1024 * 1024)).toFixed(1)} /{' '}
                    {(uploadStats.totalBytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              )}

                {/* Retry Failed Button */}
                {queue.some((q) => q.status === 'error' && q.file && q.hasValidMeta) && !isUploading && (
                  <Button
                    type="button"
                    onClick={handleRetryFailed}
                    className="h-9.5 bg-amber-500 hover:bg-amber-600 text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-xs px-3.5 cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
                    title="Pilih dan reset file yang gagal diunggah untuk dicoba kembali"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    <span>Coba Lagi Gagal ({queue.filter((q) => q.status === 'error' && q.file && q.hasValidMeta).length})</span>
                  </Button>
                )}

                {/* Main Upload Trigger */}
                <div className="flex items-center gap-2">
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

                {isUploading && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelUpload}
                    className="h-9.5 bg-red-50 hover:bg-red-100 text-red-700 border-2 border-red-700 font-bold text-xs px-3 shadow-[1px_1px_0_#b91c1c] cursor-pointer"
                    title="Hentikan proses unggahan saat ini"
                  >
                    <Square className="w-3 h-3 mr-1 fill-current" />
                    <span>Hentikan</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Full Table */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) {
                handleAttachFiles(Array.from(e.dataTransfer.files));
              }
            }}
            className="overflow-x-auto min-h-[360px]"
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#fff5e6] border-b-2 border-[#2c1810] text-[#2c1810] font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-12 text-center">Pilih</th>
                  <th className="p-3 w-20 text-center">Preview</th>
                  <th className="p-3">File Asset</th>
                  <th className="p-3 w-28">Ukuran</th>
                  <th className="p-3">Status Verifikasi Duplikasi</th>
                  <th className="p-3 w-44 text-right">Status Upload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ddd4] font-medium bg-white">
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
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectQueue(qItem.id)}
                          className="w-4 h-4 accent-[#ff6b35] rounded cursor-pointer"
                        />
                      </td>

                      {/* Thumbnail Preview */}
                      <td className="p-3 w-20 text-center">
                        <div
                          onClick={() => qItem.thumbDataUrl && setLightboxItem(qItem)}
                          className="w-14 h-14 mx-auto rounded-xl border-2 border-[#2c1810] overflow-hidden bg-stone-100 relative shadow-[1px_1px_0_#2c1810] shrink-0 cursor-pointer group"
                        >
                          {qItem.thumbDataUrl ? (
                            <>
                              <img
                                src={qItem.thumbDataUrl}
                                alt={qItem.filename}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                <Maximize2 className="w-3.5 h-3.5" />
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {qItem.assetType === 'video' ? (
                                <Film className="w-6 h-6 text-[#ff6b35]" />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-[#0284c7]" />
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

                      {/* Filename & Badges */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className="font-bold text-xs text-[#2c1810] truncate max-w-sm sm:max-w-md lg:max-w-xl"
                            title={qItem.filename}
                          >
                            {qItem.filename}
                          </span>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {qItem.filename.toLowerCase().match(/\.(jpg|jpeg)$/) ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-800 border border-sky-300 px-1.5 py-0.5 rounded font-bold"
                                title="Format JPEG: IPTC-IIM Photoshop & XMP Dublin Core otomatis disuntikkan ke dalam file fisik saat diunggah"
                              >
                                🏷️ JPEG: IPTC & XMP Siap Ditanam
                              </span>
                            ) : qItem.filename.toLowerCase().endsWith('.png') ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-800 border border-purple-300 px-1.5 py-0.5 rounded font-bold"
                                title="Format PNG: Chunk iTXt (XMP Packet) resmi Adobe otomatis disuntikkan ke dalam file fisik saat diunggah"
                              >
                                🏷️ PNG: XMP Chunk Siap Ditanam
                              </span>
                            ) : qItem.assetType === 'video' ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold"
                                title="Video diunggah via FTP/SFTP, metadata disediakan via CSV Pendamping agar stream codec aman"
                              >
                                📄 Video: Metadata via CSV
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-stone-100 text-stone-700 border border-stone-300 px-1.5 py-0.5 rounded font-semibold">
                                📁 File Asli
                              </span>
                            )}

                            {/* Dreamstime Remote Folder Routing Indicator */}
                            {selectedProfile?.agencyId === 'dreamstime' && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold"
                                title="Subfolder otomatis di server FTP Dreamstime sesuai aturan resmi"
                              >
                                📁 {qItem.assetType === 'video' ? 'Target: /video' : qItem.filename.match(/\.(ai|eps|svg|cdr)$/i) ? 'Target: /additional' : 'Target: / (Root)'}
                              </span>
                            )}

                            {/* Info Pernah Diunggah ke Ledger */}
                            {qItem.duplicateInfo?.matchedRecord && (
                              <span className="text-[10px] text-amber-800 font-semibold truncate">
                                • Pernah diunggah: {new Date(qItem.duplicateInfo.matchedRecord.uploadedAt).toLocaleDateString('id-ID')} ({qItem.duplicateInfo.matchedRecord.accountLabel})
                              </span>
                            )}

                            {/* Info Duplikat Intra-Queue */}
                            {qItem.duplicateInfo?.isQueueDuplicate && (
                              <span className="text-[10px] text-amber-800 font-bold truncate">
                                • Kembar dengan: {qItem.duplicateInfo.duplicateOfFilename}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="p-3 font-mono text-[11px]">
                        {qItem.file ? (
                          <span className="text-[#6b5344] font-bold">
                            {(qItem.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-black text-[10px]">
                            0.0 MB (Perlu File)
                          </span>
                        )}
                      </td>

                      {/* Duplicate Status Verification */}
                      <td className="p-3">
                        {!qItem.file ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-100 border border-stone-300 text-stone-700 text-[11px] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                            <span>Menunggu File Fisik</span>
                          </div>
                        ) : !qItem.hasValidMeta ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[11px] font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span title={qItem.metaError || 'Metadata belum lengkap atau gagal generate'}>
                              {qItem.metaError ? 'Gagal AI (Perlu Metadata)' : 'Belum Ada Metadata'}
                            </span>
                          </div>
                        ) : isDup ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="truncate max-w-xs sm:max-w-md" title={qItem.duplicateInfo?.warningMessage}>
                              {qItem.duplicateInfo?.isQueueDuplicate
                                ? `Kembar di antrean: ${qItem.duplicateInfo.duplicateOfFilename}`
                                : `Pernah diunggah ke [${qItem.duplicateInfo?.matchedRecord?.accountLabel}]`}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Bersih (Siap Unggah)</span>
                          </div>
                        )}
                      </td>

                      {/* Upload Status */}
                      <td className="p-3 text-right font-mono text-[11px]">
                        {!qItem.hasValidMeta && (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200 text-[10px]">
                              Perlu Metadata
                            </span>
                            {onNavigateToStudio && (
                              <button
                                type="button"
                                onClick={onNavigateToStudio}
                                className="text-[10px] text-[#ff6b35] hover:underline font-bold cursor-pointer"
                              >
                                Ke Studio &rarr;
                              </button>
                            )}
                          </div>
                        )}
                        {qItem.hasValidMeta && !qItem.file && qItem.status === 'pending' && (
                          <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Perlu File Asli
                          </span>
                        )}
                        {qItem.hasValidMeta && qItem.file && qItem.status === 'pending' && (
                          <span className="text-[#6b5344] font-bold">Antrean</span>
                        )}
                        {qItem.status === 'uploading' && (
                          <span className="text-[#ff6b35] font-black flex items-center justify-end gap-1">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Mengunggah...</span>
                          </span>
                        )}
                        {qItem.status === 'success' && (
                          <div className="flex flex-col items-end">
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Berhasil</span>
                            </span>
                            {qItem.metadataEmbedded && (
                              <span className="text-[10px] text-sky-800 font-semibold">
                                ✓ Metadata Tertanam
                              </span>
                            )}
                          </div>
                        )}
                        {qItem.status === 'skipped' && (
                          <span className="text-amber-700 font-bold flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Dilewati (Duplikat)</span>
                          </span>
                        )}
                        {qItem.status === 'error' && (
                          <span className="text-red-700 font-bold truncate block max-w-xs ml-auto" title={qItem.error}>
                            Gagal: {qItem.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Thumbnail Lightbox Modal */}
      {lightboxItem && (
        <div
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[8px_8px_0_#2c1810] max-w-2xl w-full max-h-[85vh] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b-2 border-[#2c1810] pb-2">
              <span className="font-bold text-xs text-[#2c1810] truncate max-w-md">
                {lightboxItem.filename}
              </span>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-[#2c1810] flex items-center justify-center border border-[#2c1810] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex items-center justify-center bg-stone-900 rounded-xl max-h-[60vh]">
              {lightboxItem.thumbDataUrl ? (
                <img
                  src={lightboxItem.thumbDataUrl}
                  alt={lightboxItem.filename}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-stone-400 text-xs">Preview tidak tersedia</span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-[#6b5344]">
              <span>Tipe: {lightboxItem.assetType.toUpperCase()}</span>
              <span>{(lightboxItem.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
