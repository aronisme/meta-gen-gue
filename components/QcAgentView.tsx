'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FolderOpen,
  HelpCircle,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { resizeImageToMax1024 } from '@/lib/resize';
import { runDeterministicPreflight } from '@/lib/qc/preflight';
import type { QcBatchItem, QcDecision, QcReport } from '@/lib/qc/types';
import { QcStatusBadge } from '@/components/QcStatusBadge';
import {
  findCachedQcRecord,
  saveQcCacheRecord,
  removeQcCacheRecord,
  computeQcFileKey,
} from '@/lib/qc/cache';

interface QcAgentViewProps {
  onSwitchToMetadata?: () => void;
  onSendItemsToMetadata?: (files: File[]) => void;
  onSendItemsToUpload?: (items: QcBatchItem[]) => void;
  studioFiles?: File[];
  gasProxyModels?: string[];
}

export function QcAgentView({
  onSwitchToMetadata,
  onSendItemsToMetadata,
  onSendItemsToUpload,
  studioFiles = [],
  gasProxyModels = [
    'auto',
    'gemini-2.5-flash',
    'deepseek-v4.1-flash:free',
    'qwen/qwen3.8-27b',
    'pixtral-12b-2409',
    'google/gemini-2.0-flash-001',
    'mistralai/mistral-large-3-675b-instruct-2512',
  ],
}: QcAgentViewProps) {
  const [items, setItems] = useState<QcBatchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QcBatchItem | null>(null);
  const [filterDecision, setFilterDecision] = useState<QcDecision | 'ALL'>('ALL');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [targetAssetType, setTargetAssetType] = useState<'auto' | 'photo_jpeg' | 'transparent_png'>('auto');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(true);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [thumbnailSize, setThumbnailSize] = useState<'normal' | 'large' | 'xlarge'>('large');

  // Dropzone file intake dengan Restorasi Otomatis dari Memori QC
  const handleFilesAdded = useCallback(async (newFiles: File[]) => {
    const validFiles = newFiles.filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.name.toLowerCase().endsWith('.jpg') ||
        f.name.toLowerCase().endsWith('.jpeg') ||
        f.name.toLowerCase().endsWith('.png') ||
        f.name.toLowerCase().endsWith('.webp')
    );

    if (validFiles.length === 0) {
      toast.warning('Pilih file gambar valid (JPEG atau PNG).');
      return;
    }

    let restoredCount = 0;
    const newBatchItems: QcBatchItem[] = await Promise.all(
      validFiles.map(async (file) => {
        const filePath = (file as unknown as { path?: string })?.path || undefined;
        const cached = await findCachedQcRecord(file, file.name, filePath);

        if (cached && cached.report) {
          restoredCount++;
          return {
            id: `qc_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            file,
            filename: file.name,
            filePath: filePath || cached.filePath,
            dataUrl: URL.createObjectURL(file),
            status: 'completed' as const,
            report: cached.report,
            isFromCache: true,
          };
        }

        return {
          id: `qc_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          filename: file.name,
          filePath,
          dataUrl: URL.createObjectURL(file),
          status: 'queued' as const,
        };
      })
    );

    setItems((prev) => {
      const existingNames = new Set(prev.map((it) => it.filename.toLowerCase()));
      const filtered = newBatchItems.filter((it) => !existingNames.has(it.filename.toLowerCase()));
      return [...prev, ...filtered];
    });

    if (restoredCount > 0) {
      toast.success(
        `${validFiles.length} file ditambahkan (${restoredCount} file langsung dipulihkan dari memori QC sebelumnya).`
      );
    } else {
      toast.success(`${validFiles.length} file ditambahkan ke antrean QC.`);
    }
  }, []);

  // Tarik file yang ada di Studio Metadata
  const handleImportFromStudio = useCallback(() => {
    if (studioFiles.length === 0) {
      toast.info('Tidak ada gambar aktif di Metadata Studio.');
      return;
    }
    handleFilesAdded(studioFiles);
  }, [studioFiles, handleFilesAdded]);

  // Jalankan Audit QC Penuh (Konkuren / Paralel, SKIP yang sudah pernah di-QC)
  const runBatchAudit = useCallback(
    async (forceAll = false) => {
      if (items.length === 0) {
        toast.warning('Antrean QC masih kosong. Tambahkan gambar terlebih dahulu.');
        return;
      }

      // Filter indeks item yang belum pernah di-QC (skip yang sudah ada report, kecuali jika forceAll)
      const itemsToAuditIndices: number[] = [];
      items.forEach((item, index) => {
        if (forceAll || item.status !== 'completed' || !item.report) {
          itemsToAuditIndices.push(index);
        }
      });

      if (itemsToAuditIndices.length === 0) {
        toast.info(
          `Semua ${items.length} file sudah pernah di-QC dan tersimpan di memori. Tidak ada file baru yang perlu diaudit. Klik tombol "QC Ulang" pada kartu jika ingin mengaudit kembali.`
        );
        return;
      }

      const skippedCount = items.length - itemsToAuditIndices.length;
      if (skippedCount > 0) {
        toast.info(
          `🛡️ ${skippedCount} file yang sudah pernah di-QC dilewati otomatis. Mengaudit ${itemsToAuditIndices.length} file baru...`
        );
      }

      setIsAuditing(true);
      setAuditProgress(0);

      const updatedItems = [...items];
      const totalToProcess = itemsToAuditIndices.length;
      let completedCount = 0;
      let nextQueuePointer = 0;

      const processSingleItem = async (targetItemIndex: number) => {
        const current = updatedItems[targetItemIndex];
        if (!current.file) {
          completedCount++;
          return;
        }

        try {
          // Step 1: Preflight Lokal Deterministik
          current.status = 'preflight';
          setItems([...updatedItems]);

          const technical = await runDeterministicPreflight(current.file, targetAssetType);

          // Resize untuk VLM (Maks 1024px)
          const resized = await resizeImageToMax1024(current.file);
          current.dataUrl = resized.dataUrl;

          // Step 2: Inspeksi VLM via GAS Proxy API Route
          current.status = 'inspecting';
          setItems([...updatedItems]);

          const res = await fetch('/api/qc/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageDataUrl: resized.dataUrl,
              filename: current.filename,
              assetType: targetAssetType,
              model: selectedModel,
              technical,
            }),
          });

          if (!res.ok) {
            throw new Error((await res.text()) || `Gagal inspeksi HTTP ${res.status}`);
          }

          const report: QcReport = await res.json();
          current.report = report;
          current.status = 'completed';
          current.isFromCache = false;

          // Simpan ke Cache Persisten IndexedDB agar diingat selamanya
          await saveQcCacheRecord({
            key: computeQcFileKey(current.file, current.filename, current.filePath),
            filename: current.filename,
            filePath: current.filePath,
            fileSize: current.file.size,
            lastModified: current.file.lastModified,
            report,
            auditedAt: Date.now(),
          });
        } catch (err) {
          current.status = 'error';
          current.error = err instanceof Error ? err.message : 'Kegagalan proses QC';
        } finally {
          completedCount++;
          setAuditProgress(Math.round((completedCount / totalToProcess) * 100));
          setItems([...updatedItems]);
        }
      };

      // Concurrency Worker Pool (default 3 concurrent workers)
      const workerCount = Math.max(1, Math.min(concurrency, totalToProcess));
      const workers = Array.from({ length: workerCount }, async () => {
        while (nextQueuePointer < totalToProcess) {
          const itemIdx = itemsToAuditIndices[nextQueuePointer++];
          await processSingleItem(itemIdx);
        }
      });

      await Promise.all(workers);

      setIsAuditing(false);
      toast.success(`Audit QC selesai untuk ${totalToProcess} aset (${workerCount}x paralel)!`);
    },
    [items, targetAssetType, selectedModel, concurrency]
  );

  // Jalankan QC Ulang Khusus untuk 1 Item Tertentu (Abaikan Cache)
  const handleReAuditItem = useCallback(
    async (itemId: string) => {
      if (isAuditing) return;

      const targetIdx = items.findIndex((it) => it.id === itemId);
      if (targetIdx === -1) return;
      const target = items[targetIdx];
      const targetFile = target.file;
      if (!targetFile) return;

      toast.info(`Mengaudit ulang ${target.filename}...`);

      // Hapus dari cache lama agar fresh inspection
      await removeQcCacheRecord(targetFile, target.filename, target.filePath);

      const updated = [...items];
      const current = updated[targetIdx];

      try {
        current.status = 'preflight';
        current.isFromCache = false;
        setItems([...updated]);

        const technical = await runDeterministicPreflight(targetFile, targetAssetType);
        const resized = await resizeImageToMax1024(targetFile);
        current.dataUrl = resized.dataUrl;

        current.status = 'inspecting';
        setItems([...updated]);

        const res = await fetch('/api/qc/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: resized.dataUrl,
            filename: current.filename,
            assetType: targetAssetType,
            model: selectedModel,
            technical,
          }),
        });

        if (!res.ok) {
          throw new Error((await res.text()) || `Gagal inspeksi HTTP ${res.status}`);
        }

        const report: QcReport = await res.json();
        current.report = report;
        current.status = 'completed';

        // Simpan ke cache baru
        await saveQcCacheRecord({
          key: computeQcFileKey(targetFile, current.filename, current.filePath),
          filename: current.filename,
          filePath: current.filePath,
          fileSize: targetFile.size,
          lastModified: targetFile.lastModified,
          report,
          auditedAt: Date.now(),
        });

        if (selectedItem?.id === current.id) {
          setSelectedItem({ ...current });
        }

        toast.success(`QC Ulang selesai untuk ${current.filename}!`);
      } catch (err) {
        current.status = 'error';
        current.error = err instanceof Error ? err.message : 'Gagal audit ulang';
        toast.error(`Gagal QC Ulang: ${current.error}`);
      } finally {
        setItems([...updated]);
      }
    },
    [items, isAuditing, targetAssetType, selectedModel, selectedItem]
  );

  // Toggle user dismiss untuk temuan tertentu
  const handleToggleDismissFinding = useCallback(
    (findingCheckId: string) => {
      if (!selectedItem || !selectedItem.report) return;

      const updatedChecks = selectedItem.report.checks.map((c) => {
        if (c.check_id === findingCheckId) {
          return { ...c, user_dismissed: !c.user_dismissed };
        }
        return c;
      });

      // Evaluasi ulang keputusan
      const hasBlock = updatedChecks.some(
        (c) => !c.user_dismissed && (c.status === 'FAIL' || c.severity === 'CRITICAL')
      );
      const hasReview = updatedChecks.some(
        (c) => !c.user_dismissed && (c.status === 'REVIEW' || c.severity === 'HIGH' || c.severity === 'MEDIUM')
      );

      let newDecision: QcDecision = 'READY';
      if (!selectedItem.report.technical.passes_hard_tech || hasBlock) {
        newDecision = 'BLOCK';
      } else if (hasReview) {
        newDecision = 'REVIEW';
      }

      const updatedReport: QcReport = {
        ...selectedItem.report,
        checks: updatedChecks,
        decision: newDecision,
      };

      const updatedItem: QcBatchItem = {
        ...selectedItem,
        report: updatedReport,
      };

      setSelectedItem(updatedItem);
      setItems((prev) => prev.map((it) => (it.id === updatedItem.id ? updatedItem : it)));
      toast.info('Status temuan diperbarui.');
    },
    [selectedItem]
  );

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterDecision !== 'ALL') {
        const itemDecision = item.report?.decision || 'UNCHECKED';
        if (itemDecision !== filterDecision) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return item.filename.toLowerCase().includes(query);
      }
      return true;
    });
  }, [items, filterDecision, searchQuery]);

  // Statistik Ringkasan
  const stats = useMemo(() => {
    const ready = items.filter((it) => it.report?.decision === 'READY').length;
    const review = items.filter((it) => it.report?.decision === 'REVIEW').length;
    const block = items.filter((it) => it.report?.decision === 'BLOCK').length;
    const pending = items.filter((it) => !it.report).length;
    return { ready, review, block, pending, total: items.length };
  }, [items]);

  // Export JSON Report
  const handleExportJson = useCallback(() => {
    const reports = items.map((it) => it.report).filter(Boolean);
    if (reports.length === 0) {
      toast.warning('Belum ada laporan QC yang siap diekspor.');
      return;
    }
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adobe_stock_qc_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan JSON berhasil diunduh.');
  }, [items]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16">
      {/* 1. Header & Kendali Utama */}
      <div className="bg-white rounded-2xl border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#ff6b35] text-white flex items-center justify-center border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810]">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-black text-[#2c1810] tracking-tight">
              Adobe Stock QC Inspector
            </h1>
            <span className="text-[10px] bg-[#fff5e6] text-[#ff6b35] border-2 border-[#2c1810] font-black uppercase px-2 py-0.5 rounded-lg shadow-[1px_1px_0_#2c1810]">
              GAS Proxy VLM
            </span>
            {onSwitchToMetadata && (
              <button
                type="button"
                onClick={onSwitchToMetadata}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6b5344] hover:text-[#2c1810] px-2.5 py-1 rounded-lg hover:bg-[#fff5e6] transition-colors cursor-pointer border border-[#2c1810]/30 ml-2"
                title="Kembali ke Studio Metadata"
              >
                <span>Studio Metadata</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-xs text-[#6b5344] font-medium mt-1">
            Asisten kendali mutu pra-submit otomatis: validasi teknis (4–100 MP, sRGB, ≤45MB), deteksi cacat anatomi AI, teks/merk liar, dan kepatuhan kebijakan.
          </p>
        </div>

        {/* Model, Concurrency, Thumbnail Size & Target Asset Type Selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#6b5344] uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#ff6b35] fill-current" />
              <span>Kecepatan Audit</span>
            </label>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={isAuditing}
              className="h-9 px-3 text-xs font-bold rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[2px_2px_0_#2c1810] focus:outline-none cursor-pointer"
            >
              <option value={1}>1 Gambar / Waktu (Serial)</option>
              <option value={2}>2 Gambar Bersamaan</option>
              <option value={3}>3 Gambar Bersamaan (Default ⚡ 3x Cepat)</option>
              <option value={4}>4 Gambar Bersamaan (Turbo)</option>
              <option value={5}>5 Gambar Bersamaan (Maksimal)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#6b5344] uppercase tracking-wider flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-[#ff6b35]" />
              <span>Ukuran Thumbnail</span>
            </label>
            <select
              value={thumbnailSize}
              onChange={(e) => setThumbnailSize(e.target.value as 'normal' | 'large' | 'xlarge')}
              className="h-9 px-3 text-xs font-bold rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[2px_2px_0_#2c1810] focus:outline-none cursor-pointer"
            >
              <option value="normal">Sedang (96px)</option>
              <option value="large">Besar (128px - Default ✨)</option>
              <option value="xlarge">Ekstra Besar (160px 🔍)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#6b5344] uppercase tracking-wider">
              Model VLM (GAS Proxy)
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isAuditing}
              className="h-9 px-3 text-xs font-bold rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[2px_2px_0_#2c1810] focus:outline-none cursor-pointer"
            >
              {gasProxyModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#6b5344] uppercase tracking-wider">
              Tipe Aset Target
            </label>
            <select
              value={targetAssetType}
              onChange={(e) => setTargetAssetType(e.target.value as 'auto' | 'photo_jpeg' | 'transparent_png')}
              disabled={isAuditing}
              className="h-9 px-3 text-xs font-bold rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[2px_2px_0_#2c1810] focus:outline-none cursor-pointer"
            >
              <option value="auto">Deteksi Otomatis</option>
              <option value="photo_jpeg">Foto / JPEG (Solid)</option>
              <option value="transparent_png">PNG Transparan</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Panduan Ringkas Cara Kerja di UI */}
      <div className="bg-white rounded-2xl border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="w-full px-5 py-3 bg-[#fff5e6] flex items-center justify-between text-left font-black text-xs uppercase tracking-wider text-[#2c1810] cursor-pointer hover:bg-[#ffe8cc] transition-colors"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#ff6b35]" />
            <span>Cara Kerja QC Inspector (3 Langkah Cepat)</span>
          </div>
          <span className="text-[11px] font-bold text-[#6b5344]">
            {showHowItWorks ? 'Sembunyikan ▲' : 'Lihat Penjelasan ▼'}
          </span>
        </button>

        {showHowItWorks && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-t-2 border-[#2c1810] bg-[#fffdf9]">
            {/* Step 1 */}
            <div className="p-4 rounded-xl border-2 border-[#2c1810]/20 bg-white shadow-[2px_2px_0_#2c1810] space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#fff5e6] text-[#ff6b35] font-black text-xs flex items-center justify-center border-2 border-[#2c1810]">
                  1
                </span>
                <h3 className="font-black text-xs text-[#2c1810]">Preflight Teknis Lokal</h3>
              </div>
              <p className="text-[11px] text-[#6b5344] leading-relaxed">
                Memeriksa syarat mutlak resmi Adobe Stock: resolusi <strong>4.0–100 MP</strong>, batas ukuran <strong>≤45 MB</strong>, sRGB, dan true alpha untuk PNG secara instan di browser tanpa membuang kuota token.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl border-2 border-[#2c1810]/20 bg-white shadow-[2px_2px_0_#2c1810] space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#fff5e6] text-[#ff6b35] font-black text-xs flex items-center justify-center border-2 border-[#2c1810]">
                  2
                </span>
                <h3 className="font-black text-xs text-[#2c1810]">Audit Visual & Kebijakan VLM</h3>
              </div>
              <p className="text-[11px] text-[#6b5344] leading-relaxed">
                Model VLM GAS Proxy (Gemini, DeepSeek, Qwen, dll.) memeriksa cacat anatomi AI (jari/tangan/mata), artefak geometri, teks liar, dan mencocokkan merk dagang terlarang (Nike, Adidas, Absolut, dll.).
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl border-2 border-[#2c1810]/20 bg-white shadow-[2px_2px_0_#2c1810] space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#fff5e6] text-[#ff6b35] font-black text-xs flex items-center justify-center border-2 border-[#2c1810]">
                  3
                </span>
                <h3 className="font-black text-xs text-[#2c1810]">Keputusan & Proteksi FTP</h3>
              </div>
              <p className="text-[11px] text-[#6b5344] leading-relaxed">
                Hasil: <strong className="text-emerald-700">READY</strong> (Lolos), <strong className="text-amber-700">REVIEW</strong> (Cek Manual), atau <strong className="text-rose-700">BLOCK</strong> (Ditolak). Di Antrean FTP, Proteksi Adobe otomatis menahan file yang melanggar agar akun terhindar dari penalti moderasi.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Ringkasan Status & Aksi Cepat */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div
          onClick={() => setFilterDecision('ALL')}
          className={`p-4 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all ${
            filterDecision === 'ALL' ? 'bg-[#2c1810] text-white' : 'bg-white text-[#2c1810] hover:bg-[#fff5e6]'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Total Aset</div>
          <div className="text-2xl font-black mt-1">{stats.total}</div>
        </div>

        <div
          onClick={() => setFilterDecision('READY')}
          className={`p-4 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all ${
            filterDecision === 'READY' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Lolos (READY)</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black mt-1">{stats.ready}</div>
        </div>

        <div
          onClick={() => setFilterDecision('REVIEW')}
          className={`p-4 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all ${
            filterDecision === 'REVIEW' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Perlu Cek (REVIEW)</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black mt-1">{stats.review}</div>
        </div>

        <div
          onClick={() => setFilterDecision('BLOCK')}
          className={`p-4 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all ${
            filterDecision === 'BLOCK' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-900 hover:bg-rose-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Ditolak (BLOCK)</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black mt-1">{stats.block}</div>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 p-4 rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] shadow-[2px_2px_0_#2c1810] flex flex-col justify-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b5344]">Belum Di-QC</div>
          <div className="text-2xl font-black text-[#2c1810] mt-1">{stats.pending}</div>
        </div>
      </div>

      {/* 3. Dropzone & Tindakan Batch */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Tombol Impor File */}
          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#2c1810] font-black text-xs uppercase tracking-wider border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#fff5e6] transition-all cursor-pointer">
            <FolderOpen className="w-4 h-4 text-[#ff6b35]" />
            <span>Pilih File Gambar</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(Array.from(e.target.files));
              }}
              className="hidden"
            />
          </label>

          {/* Tombol Tarik dari Studio Metadata */}
          {studioFiles.length > 0 && (
            <button
              type="button"
              onClick={handleImportFromStudio}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#fff5e6] text-[#ff6b35] font-black text-xs uppercase tracking-wider border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#ffebd1] transition-all cursor-pointer"
              title="Muat gambar yang saat ini sedang aktif di Studio Metadata"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ambil dari Studio ({studioFiles.length})</span>
            </button>
          )}

          {/* Ekspor JSON */}
          {items.some((it) => !!it.report) && (
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[#6b5344] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#fff5e6] transition-all cursor-pointer"
              title="Ekspor Laporan Lengkap JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor JSON</span>
            </button>
          )}
        </div>

        {/* Tombol Eksekusi Audit Masal */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => runBatchAudit(false)}
            disabled={isAuditing || items.length === 0}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-black text-xs uppercase tracking-wider border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] transition-all cursor-pointer ${
              isAuditing || items.length === 0
                ? 'bg-stone-400 cursor-not-allowed opacity-75'
                : 'bg-[#ff6b35] hover:bg-[#ff5517] hover:translate-x-[1px] hover:translate-y-[1px]'
            }`}
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Mengaudit ({auditProgress}%)...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                <span>Mulai Audit QC ({items.length} Aset)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. Daftar Item QC Grid / Table */}
      <div className="bg-white rounded-2xl border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] overflow-hidden">
        {/* Table Top Bar */}
        <div className="p-4 border-b-2 border-[#2c1810] bg-[#fff5e6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[#2c1810] uppercase tracking-wider">
              Daftar Aset ({filteredItems.length} dari {items.length})
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#6b5344] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs font-medium bg-white rounded-xl border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] focus:outline-none"
            />
          </div>
        </div>

        {/* Content Area */}
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <ShieldCheck className="w-12 h-12 text-stone-300" />
            <p className="text-sm font-bold text-[#6b5344]">Belum ada aset dalam antrean.</p>
            <p className="text-xs text-stone-400 max-w-sm">
              Klik &quot;Pilih File Gambar&quot; atau &quot;Ambil dari Studio&quot; untuk memulai audit mutu Adobe Stock.
            </p>
          </div>
        ) : (
          <div className="divide-y-2 divide-stone-200">
            {filteredItems.map((item) => {
              const rep = item.report;
              const decision = rep?.decision;
              const tech = rep?.technical;

              const thumbClasses = {
                normal: 'w-20 h-20 sm:w-24 sm:h-24',
                large: 'w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36',
                xlarge: 'w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48',
              }[thumbnailSize];

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 hover:bg-[#fffcf7] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Thumbnail & File Name */}
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    <div
                      onClick={() => setSelectedItem(item)}
                      className={`${thumbClasses} rounded-2xl border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] overflow-hidden bg-[radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:8px_8px] bg-stone-100 shrink-0 flex items-center justify-center relative cursor-pointer group transition-all`}
                      title="Klik untuk lihat detail & bukti temuan"
                    >
                      {item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.filename}
                          className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <span className="text-xs font-black text-stone-400 uppercase">
                          {item.filename.split('.').pop()}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Eye className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <div className="font-black text-sm text-[#2c1810] truncate max-w-sm md:max-w-lg">
                        {item.filename}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#6b5344] font-medium flex-wrap">
                        {tech && (
                          <>
                            <span className="bg-stone-100 px-2 py-0.5 rounded-lg border border-stone-300 font-bold">
                              {tech.width_px} × {tech.height_px} ({tech.megapixels} MP)
                            </span>
                            <span className="bg-stone-100 px-2 py-0.5 rounded-lg border border-stone-300 font-bold">
                              {(tech.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                            {tech.has_alpha && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-300 font-black">
                                Alpha PNG
                              </span>
                            )}
                          </>
                        )}
                        {!tech && item.file && (
                          <span className="text-stone-400 font-bold">
                            {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        )}
                      </div>

                      {rep?.decision_summary && (
                        <p className="text-xs text-[#2c1810] line-clamp-2 font-medium">
                          {rep.decision_summary}
                        </p>
                      )}

                      {/* Preview Top Findings */}
                      {rep?.checks && rep.checks.length > 0 && (
                        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                          {rep.checks.slice(0, 3).map((chk) => (
                            <span
                              key={chk.check_id}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                chk.status === 'FAIL' || chk.severity === 'CRITICAL'
                                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                                  : chk.status === 'REVIEW' || chk.severity === 'HIGH'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              }`}
                            >
                              {chk.observation.length > 40 ? chk.observation.slice(0, 38) + '...' : chk.observation}
                            </span>
                          ))}
                          {rep.checks.length > 3 && (
                            <span className="text-[10px] font-bold text-stone-500">
                              +{rep.checks.length - 3} lainnya
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status & Action */}
                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                    {item.status === 'preflight' && (
                      <span className="text-xs font-bold text-blue-600 animate-pulse">
                        Preflight Teknis...
                      </span>
                    )}
                    {item.status === 'inspecting' && (
                      <span className="text-xs font-bold text-[#ff6b35] animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Inspeksi VLM...</span>
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-xs font-bold text-rose-600">Error audit</span>
                    )}
                    {item.status === 'queued' && (
                      <span className="text-xs font-bold text-stone-400">Dalam Antrean</span>
                    )}

                    {item.isFromCache && (
                      <span
                        className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1 shadow-xs"
                        title="Hasil QC dipulihkan dari memori (dilewati otomatis saat audit masal)"
                      >
                        <span>💾 Tersimpan</span>
                      </span>
                    )}

                    {rep && <QcStatusBadge decision={decision} size="sm" />}

                    {rep && (
                      <button
                        type="button"
                        onClick={() => handleReAuditItem(item.id)}
                        disabled={isAuditing}
                        className="px-2.5 py-1.5 rounded-xl bg-white text-[#6b5344] hover:text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#fff5e6] transition-all flex items-center gap-1 cursor-pointer"
                        title="Audit ulang file ini (abaikan memori cache)"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">QC Ulang</span>
                      </button>
                    )}

                    {rep && (
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="px-3 py-1.5 rounded-xl bg-white text-[#2c1810] font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#fff5e6] transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail & Bukti</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Direct Handoff Actions Bar */}
      {items.some((it) => it.report?.decision === 'READY') && (
        <div className="p-4 rounded-2xl border-2 border-[#2c1810] bg-emerald-50 shadow-[3px_3px_0_#065f46] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <div className="text-xs text-emerald-900 font-bold">
              Tersedia <strong>{stats.ready} aset lolos QC (READY)</strong> yang siap diproses lebih lanjut!
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onSendItemsToMetadata && (
              <button
                type="button"
                onClick={() => {
                  const readyFiles = items
                    .filter((it) => it.report?.decision === 'READY' && it.file)
                    .map((it) => it.file as File);
                  onSendItemsToMetadata(readyFiles);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-900 font-black text-xs uppercase tracking-wider border-2 border-emerald-700 shadow-[2px_2px_0_#065f46] hover:bg-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Kirim ke Studio Metadata</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {onSendItemsToUpload && (
              <button
                type="button"
                onClick={() => {
                  const readyBatch = items.filter((it) => it.report?.decision === 'READY');
                  onSendItemsToUpload(readyBatch);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-emerald-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Kirim ke Antrean FTP</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. Modal / Drawer Detail Bukti Temuan (Evidence Viewer) */}
      {selectedItem && selectedItem.report && (
        <div className="fixed inset-0 z-50 bg-[#2c1810]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-[#2c1810] shadow-[6px_6px_0_#2c1810] max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b-2 border-[#2c1810] bg-[#fff5e6] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <QcStatusBadge decision={selectedItem.report.decision} size="sm" />
                {selectedItem.isFromCache && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300">
                    💾 Tersimpan
                  </span>
                )}
                <span className="font-black text-sm text-[#2c1810] truncate">
                  {selectedItem.filename}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleReAuditItem(selectedItem.id)}
                  disabled={isAuditing}
                  className="px-3 py-1.5 rounded-xl bg-white text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:bg-[#fff5e6] transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Audit ulang file ini secara fresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>QC Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="w-8 h-8 rounded-xl border-2 border-[#2c1810] bg-white flex items-center justify-center hover:bg-[#ffe4d6] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-[#2c1810]" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Decision Summary Banner */}
              <div
                className={`p-4 rounded-xl border-2 border-[#2c1810] text-xs font-bold leading-relaxed ${
                  selectedItem.report.decision === 'READY'
                    ? 'bg-emerald-50 text-emerald-900'
                    : selectedItem.report.decision === 'REVIEW'
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-rose-50 text-rose-900'
                }`}
              >
                {selectedItem.report.decision_summary}
              </div>

              {/* Grid: Preview & Technical Info */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Visual Preview */}
                <div className="md:col-span-5 relative rounded-2xl border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] overflow-hidden bg-stone-100 flex items-center justify-center">
                  {selectedItem.dataUrl ? (
                    <img
                      src={selectedItem.dataUrl}
                      alt={selectedItem.filename}
                      className="w-full max-h-72 object-contain"
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-xs text-stone-400">
                      Preview tidak tersedia
                    </div>
                  )}
                </div>

                {/* Technical Specs */}
                <div className="md:col-span-7 bg-[#fffcf7] p-4 rounded-2xl border-2 border-[#2c1810]">
                  <h4 className="text-xs font-black text-[#2c1810] uppercase tracking-wider mb-2">
                    Spesifikasi Teknis Resmi Adobe Stock
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-[10px] text-stone-500 font-bold block">Dimensi</span>
                      <span className="font-bold text-[#2c1810]">
                        {selectedItem.report.technical.width_px} × {selectedItem.report.technical.height_px} px
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-[10px] text-stone-500 font-bold block">Megapixels (Min 4 MP)</span>
                      <span
                        className={`font-black ${
                          selectedItem.report.technical.megapixels >= 4.0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {selectedItem.report.technical.megapixels} MP
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-[10px] text-stone-500 font-bold block">Ukuran File (Maks 45 MB)</span>
                      <span className="font-bold text-[#2c1810]">
                        {(selectedItem.report.technical.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-[10px] text-stone-500 font-bold block">Format & Alpha</span>
                      <span className="font-bold text-[#2c1810]">
                        {selectedItem.report.technical.format}
                        {selectedItem.report.technical.has_alpha ? ' (Transparan)' : ' (Solid)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Temuan Audit (Findings List) */}
              <div>
                <h4 className="text-xs font-black text-[#2c1810] uppercase tracking-wider mb-3">
                  Temuan Inspeksi & Kebijakan ({selectedItem.report.checks.length} Poin)
                </h4>

                {selectedItem.report.checks.length === 0 ? (
                  <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium">
                    Tidak ditemukan isu cacat visual atau pelanggaran kebijakan pada gambar ini.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedItem.report.checks.map((check) => {
                      const isDismissed = check.user_dismissed;

                      return (
                        <div
                          key={check.check_id}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            isDismissed
                              ? 'bg-stone-100 border-stone-300 opacity-60'
                              : check.severity === 'CRITICAL'
                              ? 'bg-rose-50 border-rose-600'
                              : check.severity === 'HIGH' || check.severity === 'MEDIUM'
                              ? 'bg-amber-50 border-amber-500'
                              : 'bg-white border-[#2c1810]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-stone-200 text-[#2c1810]">
                                  {check.check_id}
                                </span>
                                {check.rule_id && (
                                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#fff5e6] text-[#ff6b35] border border-[#ff6b35]">
                                    {check.rule_id}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold uppercase text-stone-500">
                                  {check.source_class}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-[#2c1810] mt-2">
                                {check.observation}
                              </p>
                              {check.why_it_matters && (
                                <p className="text-[11px] text-[#6b5344] mt-1">
                                  <strong>Dampak Adobe Stock:</strong> {check.why_it_matters}
                                </p>
                              )}
                              {check.suggested_action && (
                                <p className="text-[11px] text-stone-600 mt-1 italic">
                                  Saran: {check.suggested_action}
                                </p>
                              )}
                            </div>

                            {/* Tombol Abaikan / False Positive */}
                            <button
                              type="button"
                              onClick={() => handleToggleDismissFinding(check.check_id)}
                              className={`shrink-0 px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border-2 transition-all cursor-pointer ${
                                isDismissed
                                  ? 'bg-emerald-600 text-white border-emerald-800'
                                  : 'bg-white text-stone-700 border-stone-400 hover:bg-stone-100'
                              }`}
                            >
                              {isDismissed ? 'Diabaikan (Loloskan)' : 'Abaikan Temuan'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Disclaimer Batasan */}
              <div className="p-3 bg-stone-100 rounded-xl text-[10px] text-stone-500 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Pernyataan Kepatuhan:</strong> Status READY mengindikasikan bahwa gambar memenuhi seluruh pengujian yang dikonfigurasi saat ini. Adobe Stock menerapkan proses moderasi manusia dan otomatis privat tersendiri.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
