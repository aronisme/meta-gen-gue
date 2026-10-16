'use client';

import { memo, useCallback, useEffect, useId } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FolderOpen, Upload, Zap } from 'lucide-react';
import type { Provider } from '@/lib/types';
import { isMediaFile, isVideoFile, validateVideoFile, MAX_VIDEO_DURATION_SECONDS } from '@/lib/video';
import { filterDuplicateFiles } from '@/lib/dedupe';
import { toast } from 'sonner';

interface UploadCardProps {
  files: File[];
  busy: boolean;
  progress: number;
  statusText?: string;
  provider: Provider;
  hasVideoFiles: boolean;
  onFilesChange: (files: File[]) => void;
  onGenerate: () => void;
  existingItemFilenames?: string[];
}

function FilePicker({ onPick }: { onPick: (files: File[]) => void }) {
  const id = useId();
  return (
    <div className="inline-flex items-center gap-2">
      <input
        id={id}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        multiple
        className="sr-only"
        onChange={(e) => {
          onPick(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                   bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810]
                   shadow-[3px_3px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px]
                   transition-all font-bold text-sm"
      >
        Pilih Gambar / Video
      </label>
    </div>
  );
}

function UploadCardComponent({
  files,
  busy,
  progress,
  statusText,
  provider,
  hasVideoFiles,
  onFilesChange,
  onGenerate,
  existingItemFilenames,
}: UploadCardProps) {
  const addFiles = useCallback(
    async (newFiles: File[]) => {
      const validMedia = newFiles.filter(isMediaFile);
      if (!validMedia.length) return;

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
            `${rejectedDuplicates.length} file duplikat diabaikan agar tidak terunggah ganda.`
          );
        }
      }

      if (!acceptedFiles.length) return;

      onFilesChange([...files, ...acceptedFiles]);

      for (const f of acceptedFiles) {
        if (isVideoFile(f)) {
          void validateVideoFile(f, MAX_VIDEO_DURATION_SECONDS).then((check) => {
            if (!check.valid && check.duration > MAX_VIDEO_DURATION_SECONDS) {
              toast.info(
                `Video "${f.name}" (${check.duration.toFixed(1)}s): Klip > 30s. Analisis frame dibatasi pada 30 detik pertama.`
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

  // Clipboard Paste (Ctrl+V) listener
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

  const showVideoWarning = hasVideoFiles && provider !== 'gemini';

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl overflow-hidden"
    >
      <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-[#2c1810] text-sm flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[#ff6b35]" />
          <span>Upload Asset Studio</span>
        </h3>
        {!!files.length && (
          <button
            onClick={() => onFilesChange([])}
            className="text-xs font-bold text-[#6b5344] hover:text-[#ff6b35] underline cursor-pointer"
          >
            Hapus Semua ({files.length})
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Dropzone */}
        <div
          tabIndex={0}
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
          className="border-2 border-dashed border-[#2c1810] rounded-xl p-6 text-center bg-[#fff5e6]/60 transition-all hover:bg-[#fff5e6] focus:bg-[#fff5e6] focus:outline-none focus:ring-2 focus:ring-[#ff6b35]"
        >
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-[#ff6b35]">
            <Upload className="w-5 h-5" />
          </div>
          <p className="font-bold text-[#2c1810] text-sm">Drag & drop gambar atau video ke sini, atau Paste (Ctrl+V)</p>
          <p className="text-xs text-[#6b5344] mt-1 mb-3">Format didukung: JPG, PNG, WEBP, MP4/MOV, screenshot clipboard</p>
          <FilePicker onPick={addFiles} />
        </div>

        {/* Selected files preview count */}
        {!!files.length && (
          <div className="space-y-1.5 bg-[#fffdf9] border-2 border-[#2c1810] p-3 rounded-lg shadow-[2px_2px_0_#2c1810]">
            <div className="flex items-center justify-between text-xs font-bold text-[#2c1810]">
              <span>Antrean File ({files.length}):</span>
              <span className="text-[#6b5344] font-normal">
                {(files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB total
              </span>
            </div>
            <ul className="divide-y divide-[#e8ddd4] max-h-32 overflow-y-auto text-xs text-[#2c1810]">
              {files.map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="py-1 flex items-center justify-between gap-2">
                  <span className="truncate max-w-[220px] font-medium">{f.name}</span>
                  <span className="text-[10px] text-[#6b5344] shrink-0 font-mono">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showVideoWarning && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#fff5e6] border border-[#2c1810] text-xs text-[#6b5344]">
            <AlertTriangle className="w-4 h-4 text-[#ff6b35] shrink-0" />
            <span>File video terdeteksi. Provider GAS Proxy / Gemini disarankan untuk analisis keyframe tercepat.</span>
          </div>
        )}

        {/* Generate CTA Button */}
        <div className="space-y-2 pt-1">
          <Button
            disabled={!files.length || busy}
            onClick={onGenerate}
            className="w-full h-12 bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] hover:shadow-[2px_2px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-bold text-base rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Memproses Metadata...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 fill-current" />
                <span>Generate Metadata</span>
              </span>
            )}
          </Button>

          {busy && (
            <div className="space-y-1">
              <div className="w-full h-3 bg-[#fff5e6] border-2 border-[#2c1810] rounded-full overflow-hidden p-0.5 shadow-[2px_2px_0_#2c1810]">
                <div
                  className="h-full bg-[#ff6b35] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-[#6b5344] gap-2">
                <span className="truncate max-w-[200px]" title={statusText || `Progress: ${Math.round(progress)}%`}>
                  {statusText || `Progress: ${Math.round(progress)}%`}
                </span>
                <span className="shrink-0 font-mono">
                  {Math.round((progress / 100) * files.length)} / {files.length} Selesai
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const UploadCard = memo(UploadCardComponent);
