'use client';

import { memo, useEffect, useState } from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCw,
  Save,
  Wand2,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  X,
  Maximize2,
  Camera,
  Video,
  PenTool,
} from 'lucide-react';
import { parseKeywords } from '@/lib/keywords';
import { ADOBE_STOCK_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from '@/lib/categories';
import type { ItemMetaBox, MetaOutput } from '@/lib/types';

interface MetadataItemProps {
  item: ItemMetaBox;
  editable?: boolean;
  selectable?: boolean;
  selected?: boolean;
  forceFoldKeywords?: boolean;
  onSelect?: (id: string) => void;
  onPatchMeta?: (id: string, patch: Partial<MetaOutput>) => void;
  onSave?: (id: string) => void;
  onTidy?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onChipDrop?: (itemId: string, from: number, to: number) => void;
}

function MetadataItemComponent({
  item,
  editable = false,
  selectable = false,
  selected = false,
  forceFoldKeywords,
  onSelect,
  onPatchMeta,
  onSave,
  onTidy,
  onRegenerate,
  onDelete,
  onChipDrop,
}: MetadataItemProps) {
  const [newKw, setNewKw] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [isKeywordsFolded, setIsKeywordsFolded] = useState<boolean>(true);

  // Sinkronkan state lipatan saat parent mengubah toggle global
  useEffect(() => {
    if (forceFoldKeywords !== undefined) {
      setIsKeywordsFolded(forceFoldKeywords);
    }
  }, [forceFoldKeywords]);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text || '');
  };

  const addKeyword = () => {
    const kw = newKw.trim();
    if (!kw || !onPatchMeta) return;
    const arr = parseKeywords(item.meta?.keywords || '');
    const lower = new Set(arr.map((s) => s.toLowerCase()));
    if (lower.has(kw.toLowerCase())) {
      setNewKw('');
      return;
    }
    arr.push(kw);
    onPatchMeta(item.id, { keywords: arr.join(', ') });
    setNewKw('');
  };

  const removeKeyword = (idx: number) => {
    if (!onPatchMeta) return;
    const arr = parseKeywords(item.meta?.keywords || '');
    const next = arr.filter((_, i) => i !== idx).join(', ');
    onPatchMeta(item.id, { keywords: next });
  };

  const isVideo = item.assetType === 'video';

  return (
    <div
      className={`rounded-xl border-2 border-[#2c1810] overflow-hidden bg-white shadow-[4px_4px_0_#2c1810] transition-all ${
        selected ? 'ring-4 ring-[#ff6b35]' : ''
      }`}
    >
      {/* Header with enlarged thumbnail */}
      <div className="flex gap-4 p-3.5 sm:p-4 items-start bg-[#fff5e6] border-b-2 border-[#2c1810]">
        {selectable && onSelect && (
          <button
            className="p-1.5 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer shrink-0 mt-1"
            onClick={() => onSelect(item.id)}
            aria-pressed={selected}
            aria-label={selected ? 'Deselect item' : 'Select item'}
          >
            {selected ? <CheckSquare className="w-4 h-4 text-[#ff6b35]" /> : <Square className="w-4 h-4" />}
          </button>
        )}

        {/* Enlarged Thumbnail Preview with Lightbox Trigger */}
        <div
          className="w-28 h-28 sm:w-36 sm:h-36 bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] rounded-xl overflow-hidden flex items-center justify-center shrink-0 relative group cursor-pointer"
          onClick={() => {
            setActivePreviewImage(null);
            if (item.thumbDataUrl || item.videoDataUrl) setPreviewOpen(true);
          }}
          title="Klik untuk memperbesar preview"
        >
          {isVideo && item.videoDataUrl ? (
            <video
              src={item.videoDataUrl}
              className="object-cover w-full h-full"
              muted
              playsInline
              loop
            />
          ) : item.thumbDataUrl ? (
            <Image
              alt={item.filename}
              src={item.thumbDataUrl}
              width={160}
              height={160}
              className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
              unoptimized
            />
          ) : (
            <span className="text-xs text-[#6b5344]">No preview</span>
          )}

          {(item.thumbDataUrl || item.videoDataUrl) && (
            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Maximize2 className="w-5 h-5 drop-shadow" />
            </div>
          )}
        </div>

        {/* Item Info beside Thumbnail */}
        <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch gap-2">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="font-extrabold text-[#2c1810] text-sm sm:text-base leading-snug line-clamp-2" title={item.filename}>
                {item.filename}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.error && (
                  <Badge className="bg-[#fce8e6] text-[#c5221f] border-2 border-[#2c1810] font-bold shadow-[1px_1px_0_#2c1810]">
                    Error
                  </Badge>
                )}
                {item.error && onRegenerate && (
                  <button
                    className="px-2 py-1 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[1.5px_1.5px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-extrabold shrink-0"
                    onClick={() => onRegenerate(item.id)}
                    aria-label="Coba lagi"
                    title="Coba hasilkan ulang metadata untuk file ini (Retry)"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#ff6b35]" />
                    <span>Coba Lagi</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    className="p-1.5 rounded-lg bg-white hover:bg-[#fee2e2] text-[#2c1810] border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                    onClick={() => onDelete(item.id)}
                    aria-label="Delete item"
                    title="Hapus Item"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#2c1810] text-[11px] font-bold text-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                {isVideo ? (
                  <>
                    <Video className="w-3 h-3 text-[#ff6b35]" />
                    <span>Video</span>
                  </>
                ) : item.fileType === 'illustration' || item.meta?.illustration ? (
                  <>
                    <PenTool className="w-3 h-3 text-[#ff6b35]" />
                    <span>Illustration</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3 h-3 text-[#ff6b35]" />
                    <span>Photo</span>
                  </>
                )}
              </span>

              {isVideo ? (
                <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" title="Untuk video footage, metadata diekspor via CSV Pendamping agar stream video aman tanpa re-encoding">
                  📄 CSV Companion
                </span>
              ) : item.filename.toLowerCase().endsWith('.png') ? (
                <span className="text-[10px] bg-purple-50 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" title="Format PNG: Metadata otomatis disuntikkan ke chunk iTXt (Adobe XMP)">
                  🏷️ PNG: XMP Ready
                </span>
              ) : (
                <span className="text-[10px] bg-sky-50 text-sky-900 border border-sky-300 px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" title="Format JPEG: Metadata otomatis disuntikkan ke segmen IPTC-IIM Photoshop & Adobe XMP">
                  🏷️ JPG: IPTC & XMP Ready
                </span>
              )}

              {item.filePath && (
                <span
                  className="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-400 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 cursor-help shadow-[1px_1px_0_#2c1810]"
                  title={`Path Asli di Komputer:\n${item.filePath}\n\nSiap langsung diunggah via Local FTP Bridge tanpa pilih ulang file.`}
                >
                  📁 Siap di Disk
                </span>
              )}

              {(item.promptText || item.meta?.aiPrompt) && (
                <span
                  className="text-[10px] bg-amber-50 text-amber-900 border border-amber-400 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 cursor-help shadow-[1px_1px_0_#2c1810]"
                  title={`Prompt Asli dari Prompt Generator:\n"${item.promptText || item.meta?.aiPrompt}"`}
                >
                  ⚡ Prompt Asli
                </span>
              )}

              {item.meta?.category && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#fff5e6] border border-[#2c1810] font-bold text-[#6b5344]">
                  Kat: {ADOBE_STOCK_CATEGORIES.find((c) => c.code === item.meta?.category)?.name || item.meta.category}
                </span>
              )}
            </div>

            {/* Keyframe filmstrip for video */}
            {isVideo && item.videoKeyframes && item.videoKeyframes.length > 0 && (
              <div className="pt-1">
                <div className="text-[10px] font-extrabold text-[#6b5344] uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>{item.videoKeyframes.length} Frame Kunci Dianalisis:</span>
                  <span className="text-[9px] font-medium text-[#ff6b35]">Klik frame untuk perbesar</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {item.videoKeyframes.map((kf, kfIdx) => {
                    const pct = Math.round((kfIdx / (item.videoKeyframes!.length - 1 || 1)) * 100);
                    return (
                      <button
                        type="button"
                        key={kfIdx}
                        className="group/kf relative w-10 h-10 rounded-lg border-2 border-[#2c1810] overflow-hidden bg-black shrink-0 cursor-pointer shadow-[1px_1px_0_#2c1810] hover:scale-105 hover:border-[#ff6b35] transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePreviewImage(kf);
                          setPreviewOpen(true);
                        }}
                        title={`Frame ${kfIdx + 1} (~${pct}% durasi) - Klik untuk perbesar`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={kf} alt={`Frame ${kfIdx + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-[#2c1810]/85 text-[8px] font-bold text-white px-0.5 rounded-tl font-mono">
                          {pct}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-[#6b5344] font-medium flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-[#e8ddd4]/60">
            <span>
              {new Date(item.createdAt).toLocaleString()}
              {isVideo && item.videoDuration && ` • ${Math.round(item.videoDuration)}s`}
            </span>
            {(item.thumbDataUrl || item.videoDataUrl) && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="text-[11px] font-bold text-[#ff6b35] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Perbesar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3.5 text-[#2c1810]">
        {item.error ? (
          <div className="space-y-3">
            <div className="bg-[#fef2f2] border-2 border-[#fca5a5] p-3.5 rounded-xl shadow-[2px_2px_0_#ef4444] space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-extrabold text-xs uppercase tracking-wider text-[#991b1b] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
                    Gagal Menghasilkan Metadata
                  </div>
                  <p className="text-xs text-[#b91c1c] font-semibold leading-relaxed font-mono whitespace-pre-wrap break-words">
                    {item.error}
                  </p>
                </div>
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(item.id)}
                    className="px-3 py-1.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] rounded-lg font-black text-xs shadow-[2px_2px_0_#2c1810] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    title="Coba hasilkan ulang metadata untuk file ini (Retry)"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#ff6b35]" />
                    <span>Coba Lagi (Retry)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : editable ? (
          <>
            {/* Title (editable) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#6b5344] shrink-0">Title</span>
                  {item.meta?.title && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#2c1810] shadow-[1px_1px_0_#2c1810] shrink-0 ${
                        item.meta.title.length > 200
                          ? 'bg-[#feefc3] text-[#b06000]'
                          : 'bg-[#fff5e6] text-[#2c1810]'
                      }`}
                    >
                      {item.meta.title.length}/200 chars
                    </span>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    className="p-1.5 rounded bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all cursor-pointer"
                    onClick={() => copy(item.meta?.title || '')}
                    aria-label="Copy title"
                    title="Copy title"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {onSave && (
                    <button
                      className="p-1.5 rounded bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all cursor-pointer"
                      onClick={() => onSave(item.id)}
                      aria-label="Save edits"
                      title="Save edits"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      className="p-1.5 rounded bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all cursor-pointer"
                      onClick={() => onRegenerate(item.id)}
                      aria-label="Regenerate metadata"
                      title="Regenerate metadata"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <Input
                className="w-full bg-white border-2 border-[#2c1810] text-[#2c1810] font-bold shadow-[2px_2px_0_#2c1810] h-9 text-xs"
                value={item.meta?.title || ''}
                onChange={(e) => onPatchMeta?.(item.id, { title: e.target.value })}
                placeholder="Judul stock..."
              />
            </div>

            {/* Description (editable) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#6b5344]">Description</span>
                  {item.meta?.description && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                      {item.meta.description.trim().split(/\s+/).filter(Boolean).length} kata
                    </span>
                  )}
                </div>
                <button
                  className="p-1.5 rounded bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all cursor-pointer"
                  onClick={() => copy(item.meta?.description || '')}
                  aria-label="Copy description"
                  title="Copy description"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <Textarea
                rows={2}
                className="w-full bg-white border-2 border-[#2c1810] text-[#2c1810] font-normal shadow-[2px_2px_0_#2c1810] text-xs resize-y"
                value={item.meta?.description || ''}
                onChange={(e) => onPatchMeta?.(item.id, { description: e.target.value })}
                placeholder="Deskripsi detail..."
              />
            </div>

            {/* Agency Categories & Releases */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1 min-w-0">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#6b5344] block truncate">
                  Adobe Category
                </span>
                <Select
                  value={item.meta?.category || 'none'}
                  onValueChange={(value) =>
                    onPatchMeta?.(item.id, { category: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9 text-xs shadow-[2px_2px_0_#2c1810]">
                    <SelectValue placeholder="Pilih Kategori Adobe" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[4px_4px_0_#2c1810] max-h-64">
                    <SelectItem value="none">None</SelectItem>
                    {ADOBE_STOCK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.code} value={cat.code}>
                        {cat.code}. {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-0">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#6b5344] block truncate">
                  Shutterstock Category
                </span>
                <Select
                  value={item.meta?.shutterstockCategory || 'none'}
                  onValueChange={(value) =>
                    onPatchMeta?.(item.id, { shutterstockCategory: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9 text-xs shadow-[2px_2px_0_#2c1810]">
                    <SelectValue placeholder="Pilih Kategori Shutterstock" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[4px_4px_0_#2c1810] max-h-64">
                    <SelectItem value="none">None</SelectItem>
                    {SHUTTERSTOCK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.code} value={cat.code}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-0 sm:col-span-2 lg:col-span-1">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#6b5344] block truncate">
                  Releases
                </span>
                <Input
                  className="w-full min-w-0 bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-9 text-xs shadow-[2px_2px_0_#2c1810]"
                  value={item.meta?.releases || ''}
                  onChange={(e) => onPatchMeta?.(item.id, { releases: e.target.value })}
                  placeholder="Model/property release..."
                />
              </div>
            </div>

            {/* Keywords (chips + add box with accordion fold) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#6b5344]">Keywords</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                    {parseKeywords(item.meta?.keywords || '').length} keywords
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsKeywordsFolded(!isKeywordsFolded)}
                    className="text-xs font-bold text-[#ff6b35] hover:text-[#e55a2b] flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-lg border border-[#2c1810] shadow-[1px_1px_0_#2c1810] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all"
                    title={isKeywordsFolded ? 'Buka lipatan kata kunci kartu ini' : 'Lipat kata kunci kartu ini'}
                  >
                    <span>{isKeywordsFolded ? `Buka (${parseKeywords(item.meta?.keywords || '').length})` : 'Lipat'}</span>
                    {isKeywordsFolded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="shrink-0 flex gap-1.5">
                  {onTidy && (
                    <button
                      className="p-1.5 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                      onClick={() => onTidy(item.id)}
                      aria-label="Tidy keywords"
                      title="Rapikan & hapus duplikat keywords"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-[#ff6b35]" />
                    </button>
                  )}
                  <button
                    className="p-1.5 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                    onClick={() => copy(item.meta?.keywords || '')}
                    aria-label="Copy keywords"
                    title="Salin seluruh kata kunci"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Folded Mode: Compact top 8 keywords + expand pill */}
              {isKeywordsFolded ? (
                <div className="bg-[#fffdf9] p-2 rounded-xl border border-[#2c1810]/20 flex flex-wrap gap-1.5 items-center">
                  {parseKeywords(item.meta?.keywords || '').slice(0, 8).map((kw, idx) => (
                    <span
                      key={`${kw}-${idx}`}
                      className="px-2.5 py-0.5 rounded-full border border-[#2c1810] bg-[#fff5e6] text-[#2c1810] font-semibold text-xs shadow-[1px_1px_0_#2c1810]"
                    >
                      {kw}
                    </span>
                  ))}
                  {parseKeywords(item.meta?.keywords || '').length > 8 && (
                    <button
                      type="button"
                      onClick={() => setIsKeywordsFolded(false)}
                      className="px-2.5 py-0.5 rounded-full border-2 border-dashed border-[#ff6b35] bg-[#fff5e6] text-[#ff6b35] font-extrabold text-xs hover:bg-[#ffe0b2] transition-colors cursor-pointer flex items-center gap-1 shadow-[1px_1px_0_#ff6b35]"
                      title="Klik untuk membuka semua keyword"
                    >
                      <span>+{parseKeywords(item.meta?.keywords || '').length - 8} lainnya...</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  )}
                  {parseKeywords(item.meta?.keywords || '').length === 0 && (
                    <span className="text-xs text-[#6b5344] italic">Belum ada keywords. Tekan Buka untuk menambah.</span>
                  )}
                </div>
              ) : (
                /* Unfolded Mode: Full Draggable Chips & Add Box */
                <div className="space-y-2 animate-in fade-in duration-150">
                  <div className="flex flex-wrap gap-1.5">
                    {parseKeywords(item.meta?.keywords || '').map((kw, idx) => (
                      <span
                        key={`${kw}-${idx}`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                          onChipDrop?.(item.id, from, idx);
                        }}
                        className="px-3 py-1 rounded-full border-2 border-[#2c1810] bg-[#fff5e6] text-[#2c1810] font-bold text-xs shadow-[1.5px_1.5px_0_#2c1810] hover:shadow-[0.5px_0.5px_0_#2c1810] hover:translate-x-[1px] hover:translate-y-[1px] cursor-move select-none inline-flex items-center gap-1.5 transition-all"
                      >
                        <span>{kw}</span>
                        <button
                          className="ml-1 font-bold text-[#6b5344] hover:text-[#ff6b35] cursor-pointer inline-flex items-center"
                          onClick={() => removeKeyword(idx)}
                          type="button"
                          aria-label={`Remove ${kw}`}
                        >
                          <X className="w-3 h-3 hover:text-red-600" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add keyword input */}
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      placeholder="Tambah kata kunci..."
                      value={newKw}
                      onChange={(e) => setNewKw(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      className="h-9 flex-1 min-w-[140px] max-w-xs bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold text-xs shadow-[2px_2px_0_#2c1810]"
                    />
                    <button
                      onClick={addKeyword}
                      className="h-9 w-9 bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] font-bold rounded-lg flex items-center justify-center transition-all cursor-pointer"
                      aria-label="Add keyword"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Read-only view */
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-bold min-w-[70px] text-xs uppercase text-[#6b5344]">Title:</span>
              <span className="flex-1 text-[#2c1810] font-semibold">{item.meta?.title}</span>
              <button
                className="p-1 rounded bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]"
                onClick={() => copy(item.meta?.title || '')}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold min-w-[70px] text-xs uppercase text-[#6b5344]">Desc:</span>
              <span className="flex-1 text-[#2c1810]">{item.meta?.description}</span>
              <button
                className="p-1 rounded bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]"
                onClick={() => copy(item.meta?.description || '')}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold min-w-[70px] text-xs uppercase text-[#6b5344]">Keywords:</span>
              <div className="flex-1 text-xs">
                {isKeywordsFolded && parseKeywords(item.meta?.keywords || '').length > 8 ? (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span>{parseKeywords(item.meta?.keywords || '').slice(0, 8).join(', ')}</span>
                    <button
                      type="button"
                      onClick={() => setIsKeywordsFolded(false)}
                      className="text-[11px] font-bold text-[#ff6b35] underline ml-1 cursor-pointer"
                    >
                      +{parseKeywords(item.meta?.keywords || '').length - 8} lainnya...
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="break-words">{item.meta?.keywords}</span>
                    {parseKeywords(item.meta?.keywords || '').length > 8 && (
                      <button
                        type="button"
                        onClick={() => setIsKeywordsFolded(true)}
                        className="text-[11px] font-bold text-[#6b5344] underline ml-1 cursor-pointer"
                      >
                        (Lipat)
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                className="p-1 rounded bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810] shrink-0"
                onClick={() => copy(item.meta?.keywords || '')}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Preview Modal */}
      {previewOpen && (item.thumbDataUrl || item.videoDataUrl) && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white border-2 border-[#2c1810] shadow-[8px_8px_0_#2c1810] rounded-2xl overflow-hidden p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-[#2c1810] pb-2">
              <span className="font-black text-[#2c1810] text-sm truncate max-w-md">
                {item.filename}
              </span>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1 rounded-lg bg-[#fff5e6] hover:bg-[#ffe3cf] text-[#2c1810] border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                aria-label="Tutup preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center bg-[#f7f5f0] rounded-xl border-2 border-[#2c1810] overflow-hidden max-h-[70vh]">
              {activePreviewImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={activePreviewImage}
                  alt={item.filename}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : isVideo && item.videoDataUrl ? (
                <video
                  src={item.videoDataUrl}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : item.thumbDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.thumbDataUrl}
                  alt={item.filename}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : null}
            </div>

            {/* Filmstrip selector in Lightbox */}
            {isVideo && item.videoKeyframes && item.videoKeyframes.length > 0 && (
              <div className="flex items-center justify-center gap-2 pt-2 border-t-2 border-[#e8ddd4] overflow-x-auto">
                <span className="text-[11px] font-bold text-[#6b5344] shrink-0">Frame Kunci:</span>
                {item.videoKeyframes.map((kf, kfIdx) => {
                  const pct = Math.round((kfIdx / (item.videoKeyframes!.length - 1 || 1)) * 100);
                  const isCurrent = activePreviewImage === kf;
                  return (
                    <button
                      type="button"
                      key={kfIdx}
                      onClick={() => setActivePreviewImage(kf)}
                      className={`relative w-12 h-12 rounded-lg border-2 border-[#2c1810] overflow-hidden shrink-0 cursor-pointer transition-all ${
                        isCurrent
                          ? 'ring-2 ring-[#ff6b35] scale-105 shadow-[2px_2px_0_#2c1810]'
                          : 'opacity-70 hover:opacity-100 hover:border-[#ff6b35]'
                      }`}
                      title={`Frame ${kfIdx + 1} (~${pct}% durasi)`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={kf} alt={`Frame ${kfIdx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 bg-[#2c1810]/85 text-[8px] font-bold text-white px-0.5 rounded-tl font-mono">
                        {pct}%
                      </span>
                    </button>
                  );
                })}
                {item.videoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setActivePreviewImage(null)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[#2c1810] cursor-pointer transition-all ${
                      !activePreviewImage
                        ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810]'
                        : 'bg-white text-[#2c1810] hover:bg-[#fff5e6]'
                    }`}
                  >
                    Putar Video Asli
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const MetadataItem = memo(MetadataItemComponent);
