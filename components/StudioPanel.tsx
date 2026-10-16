'use client';

import { memo, useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Upload, Film } from 'lucide-react';
import type { FileType } from '@/lib/types';
import { isMediaFile, isVideoFile, validateVideoFile, MAX_VIDEO_DURATION_SECONDS } from '@/lib/video';
import { filterDuplicateFiles } from '@/lib/dedupe';
import { toast } from 'sonner';

interface StudioPanelProps {
  files: File[];
  busy: boolean;
  progress: number;
  statusText?: string;
  hasVideoFiles: boolean;
  onFilesChange: (files: File[]) => void;
  onGenerate: () => void;
  existingItemFilenames?: string[];
  model: string;
  onModelChange: (model: string) => void;
  gasProxyModels: string[];
  fileType: FileType;
  titleLength: number;
  descriptionLength: number;
  keywordsCount: number;
  extra: string;
  onFileTypeChange: (type: FileType) => void;
  onTitleLengthChange: (length: number) => void;
  onDescriptionLengthChange: (length: number) => void;
  onKeywordsCountChange: (count: number) => void;
  onExtraChange: (extra: string) => void;
}

const MODEL_LABELS: Record<string, string> = {
  auto: 'Auto: Tercepat & Auto-Failover',
  'gemini-2.5-flash': 'Google Gemini (gemini-2.5-flash)',
  'qwen/qwen3.8-27b': 'Groq (qwen/qwen3.8-27b)',
  'pixtral-12b-2409': 'Mistral AI (pixtral-12b-2409)',
  'mistralai/mistral-large-3-675b-instruct-2512': 'Nvidia NIM (mistral-large-3-675b)',
  'mistralai/ministral-14b': 'xKiro (ministral-14b)',
  'sensenova/sensenova-6.8-flash-lite': 'xKiro (sensenova-6.8-flash-lite)',
};

function StudioPanelComponent({
  files,
  busy,
  progress,
  statusText,
  hasVideoFiles,
  onFilesChange,
  onGenerate,
  existingItemFilenames,
  model,
  onModelChange,
  gasProxyModels,
  fileType,
  titleLength,
  descriptionLength,
  keywordsCount,
  extra,
  onFileTypeChange,
  onTitleLengthChange,
  onDescriptionLengthChange,
  onKeywordsCountChange,
  onExtraChange,
}: StudioPanelProps) {
  const fileInputId = useId();
  const [openSettings, setOpenSettings] = useState(false);
  const [openTagging, setOpenTagging] = useState(false);

  const models = gasProxyModels.length > 0 ? gasProxyModels : Object.keys(MODEL_LABELS);

  const addFiles = useCallback(
    async (newFiles: File[]) => {
      const validMedia = newFiles.filter(isMediaFile);
      if (!validMedia.length) return;

      // Jalankan filter anti-duplikat komprehensif (intra-batch, existing queue, dan item sesi aktif)
      const { acceptedFiles, rejectedDuplicates } = await filterDuplicateFiles(validMedia, {
        existingFiles: files,
        existingItemFilenames,
      });

      if (rejectedDuplicates.length > 0) {
        if (rejectedDuplicates.length === 1) {
          toast.warning(
            `File duplikat diabaikan: "${rejectedDuplicates[0].file.name}" (${rejectedDuplicates[0].description})`
          );
        } else {
          toast.warning(
            `${rejectedDuplicates.length} file duplikat diabaikan dari sesi ini agar tidak terunggah ganda.`
          );
        }
      }

      if (!acceptedFiles.length) return;

      onFilesChange([...files, ...acceptedFiles]);

      // Berikan info ramah jika video berdurasi lebih dari 30 detik
      for (const f of acceptedFiles) {
        if (isVideoFile(f)) {
          void validateVideoFile(f, MAX_VIDEO_DURATION_SECONDS).then((check) => {
            if (!check.valid && check.duration > MAX_VIDEO_DURATION_SECONDS) {
              toast.info(
                `Video "${f.name}" (${check.duration.toFixed(1)}s): Klip stok melebihi 30s. Analisis visual dibatasi pada 30 detik pertama.`
              );
            }
          });
        }
      }
    },
    [files, existingItemFilenames, onFilesChange]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void addFiles(Array.from(e.dataTransfer.files || []));
  };

  // Clipboard Paste (Ctrl+V) listener for Studio assets
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
          const f = item.getAsFile();
          if (f) {
            const cleanName =
              f.name === 'image.png' || f.name === 'blob' || !f.name
                ? new File([f], `Pasted_${Date.now().toString().slice(-6)}.png`, { type: f.type || 'image/png' })
                : f;
            pastedFiles.push(cleanName);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        void addFiles(pastedFiles);
        toast.success(`${pastedFiles.length} file dari clipboard (paste) berhasil ditambahkan!`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  const hasFiles = files.length > 0;

  return (
    <div className="bg-[#fffdf9] border-2 border-[#2c1810] shadow-[6px_6px_0_#2c1810] rounded-2xl p-4 sm:p-5 flex flex-col max-h-[calc(100vh-2.5rem)] lg:max-h-[calc(100vh-3rem)]">
      {/* Scrollable Upper Section for Inputs & Settings */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin">
        {/* 1. Upload Dropzone */}
        <div
          tabIndex={0}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (items) {
              const pasted: File[] = [];
              for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file' && (items[i].type.startsWith('image/') || items[i].type.startsWith('video/'))) {
                  const f = items[i].getAsFile();
                  if (f) pasted.push(f);
                }
              }
              if (pasted.length > 0) {
                e.preventDefault();
                void addFiles(pasted);
              }
            }
          }}
          className={`border-2 border-dashed border-[#2c1810] rounded-xl text-center bg-[#fff5e6]/60 transition-all hover:bg-[#fff5e6] focus:bg-[#fff5e6] focus:outline-none focus:ring-2 focus:ring-[#ff6b35] flex flex-col items-center justify-center cursor-pointer ${
            hasFiles ? 'p-3.5' : 'p-6'
          }`}
          onClick={() => document.getElementById(fileInputId)?.click()}
        >
          <input
            id={fileInputId}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <div
            className={`rounded-xl bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-[#ff6b35] ${
              hasFiles ? 'w-8 h-8 mb-1.5' : 'w-10 h-10 mb-2'
            }`}
          >
            <Upload className={hasFiles ? 'w-4 h-4' : 'w-5 h-5'} />
          </div>
          <p className="font-bold text-[#2c1810] text-sm">
            {hasFiles ? '+ Tambah Gambar / Video (atau Paste)' : 'Drag & Drop Gambar / Video, atau Paste (Ctrl+V)'}
          </p>
          <p className="text-xs text-[#6b5344] mt-0.5 font-medium">
            JPG, PNG, WEBP, MP4/MOV, atau screenshot clipboard
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-300 font-bold px-2 py-0.5 rounded-full mt-2">
            🛡️ Proteksi Anti-Duplikat Sesi Aktif
          </span>
        </div>

      {/* Selected files badge info */}
      {!!files.length && (
        <div className="bg-[#fff5e6] border-2 border-[#2c1810] rounded-xl p-3 shadow-[2px_2px_0_#2c1810] space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#2c1810]">
            <span>{files.length} file dipilih:</span>
            <button
              onClick={() => onFilesChange([])}
              className="text-[#6b5344] hover:text-[#ff6b35] underline font-semibold text-[11px] cursor-pointer"
            >
              Hapus Semua
            </button>
          </div>
          <ul className="divide-y divide-[#e8ddd4] max-h-24 overflow-y-auto text-xs text-[#2c1810]">
            {files.map((f, idx) => {
              const isVid = isVideoFile(f);
              return (
                <li key={`${f.name}-${idx}`} className="py-1 flex items-center justify-between gap-2">
                  <span className="truncate max-w-[200px] font-medium flex items-center gap-1.5">
                    {isVid && (
                      <span className="bg-[#ff6b35] text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-[1px_1px_0_#2c1810] flex items-center gap-0.5 shrink-0">
                        <Film className="w-2.5 h-2.5" />
                        VID ≤30s
                      </span>
                    )}
                    {f.name}
                  </span>
                  <span className="text-[10px] text-[#6b5344] font-mono shrink-0">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </li>
              );
            })}
          </ul>
          {hasVideoFiles && (
            <p className="text-[10px] text-[#ff6b35] font-bold bg-white p-1.5 rounded-lg border border-[#2c1810]">
              🎬 Video terdeteksi: 5 keyframe otomatis diekstrak untuk analisis video footage.
            </p>
          )}
        </div>
      )}

      {/* 2. AI Model Selection */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold uppercase tracking-wider text-[#2c1810]">
            AI Model
          </label>
        </div>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-bold h-11 shadow-[3px_3px_0_#2c1810] rounded-xl focus:ring-0">
            <SelectValue placeholder="Pilih Model AI">
              {MODEL_LABELS[model] || model}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl">
            {models.map((m) => (
              <SelectItem key={m} value={m} className="font-semibold focus:bg-[#fff5e6] focus:text-[#2c1810]">
                {MODEL_LABELS[m] || m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 3. Accordions matching Mockup: General Settings & Tagging Preferences */}
      <div className="space-y-2 pt-1">
        {/* Accordion 1: General Settings */}
        <div className="border-2 border-[#2c1810] rounded-xl overflow-hidden bg-white shadow-[2px_2px_0_#2c1810]">
          <button
            type="button"
            onClick={() => setOpenSettings(!openSettings)}
            className="w-full px-4 py-2.5 bg-[#fffdf9] hover:bg-[#fff5e6] flex items-center justify-between text-left font-bold text-xs uppercase tracking-wider text-[#2c1810] transition-colors cursor-pointer"
          >
            <span>General Settings</span>
            {openSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {openSettings && (
            <div className="p-3.5 space-y-3 border-t-2 border-[#2c1810] bg-[#fffdf9]">
              <div>
                <Label className="text-[11px] font-bold text-[#6b5344] mb-1 block">Tipe Asset</Label>
                <Select value={fileType} onValueChange={(v) => onFileTypeChange(v as FileType)}>
                  <SelectTrigger className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9 shadow-[1px_1px_0_#2c1810]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810]">
                    <SelectItem value="auto">Auto (Deteksi Otomatis)</SelectItem>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="illustration">Illustration</SelectItem>
                    <SelectItem value="vector">Vector</SelectItem>
                    <SelectItem value="icon">Icon</SelectItem>
                    <SelectItem value="transparent_png">Transparent PNG</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] font-bold text-[#6b5344] mb-1 block">Maks Judul (Char)</Label>
                  <Input
                    type="number"
                    min={20}
                    max={200}
                    value={titleLength}
                    onChange={(e) => onTitleLengthChange(parseInt(e.target.value || '120', 10))}
                    className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-[#6b5344] mb-1 block">Deskripsi (Kata)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={descriptionLength}
                    onChange={(e) => onDescriptionLengthChange(parseInt(e.target.value || '60', 10))}
                    className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accordion 2: Tagging Preferences */}
        <div className="border-2 border-[#2c1810] rounded-xl overflow-hidden bg-white shadow-[2px_2px_0_#2c1810]">
          <button
            type="button"
            onClick={() => setOpenTagging(!openTagging)}
            className="w-full px-4 py-2.5 bg-[#fffdf9] hover:bg-[#fff5e6] flex items-center justify-between text-left font-bold text-xs uppercase tracking-wider text-[#2c1810] transition-colors cursor-pointer"
          >
            <span>Tagging Preferences</span>
            {openTagging ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {openTagging && (
            <div className="p-3.5 space-y-3 border-t-2 border-[#2c1810] bg-[#fffdf9]">
              <div>
                <Label className="text-[11px] font-bold text-[#6b5344] mb-1 block">Target Keywords (5 - 50)</Label>
                <Input
                  type="number"
                  min={5}
                  max={50}
                  value={keywordsCount}
                  onChange={(e) => onKeywordsCountChange(parseInt(e.target.value || '35', 10))}
                  className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9"
                />
              </div>
              <div>
                <Label className="text-[11px] font-bold text-[#6b5344] mb-1 block">Instruksi Khusus (Opsional)</Label>
                <Textarea
                  rows={2}
                  value={extra}
                  onChange={(e) => onExtraChange(e.target.value)}
                  placeholder="Contoh: Fokus ke subjek utama..."
                  className="bg-white border-2 border-[#2c1810] text-[#2c1810] text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {/* End of Scrollable Upper Section */}
      </div>

      {/* 4. Pinned Bottom CTA Button & Live Progress */}
      <div className="shrink-0 pt-3 border-t-2 border-[#2c1810]/15 bg-[#fffdf9] mt-1 space-y-2">
        <Button
          disabled={!files.length || busy}
          onClick={onGenerate}
          className="w-full h-12 bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] hover:shadow-[2px_2px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-bold text-sm sm:text-base rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2 truncate px-1 w-full">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
              <span className="truncate">
                Memproses ({Math.round((progress / 100) * files.length) || 1}/{files.length})...
              </span>
            </span>
          ) : (
            `Generate Metadata (${files.length})`
          )}
        </Button>

        {busy && (
          <div className="space-y-1.5 pt-0.5">
            <div className="w-full h-3 bg-[#fff5e6] border-2 border-[#2c1810] rounded-full overflow-hidden p-0.5 shadow-[2px_2px_0_#2c1810]">
              <div
                className="h-full bg-[#ff6b35] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold text-[#6b5344] gap-2">
              <span className="truncate flex-1 min-w-0" title={statusText || `Progress: ${Math.round(progress)}%`}>
                {statusText || `Progress: ${Math.round(progress)}%`}
              </span>
              <span className="shrink-0 font-mono text-[10px] bg-[#fff5e6] px-1.5 py-0.5 rounded border border-[#2c1810]">
                {Math.round((progress / 100) * files.length)} / {files.length} Selesai
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const StudioPanel = memo(StudioPanelComponent);
