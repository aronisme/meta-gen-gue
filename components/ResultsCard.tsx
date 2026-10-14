'use client';

import { memo, useState } from 'react';
import { Download, Edit2, FolderPlus, LayoutGrid, LayoutList, Sparkles, UploadCloud } from 'lucide-react';
import { MetadataItem } from '@/components/MetadataItem';
import { downloadAgencyCSV, type Agency } from '@/lib/csv';
import type { ItemMetaBox, MetaOutput } from '@/lib/types';

interface ResultsCardProps {
  items: ItemMetaBox[];
  onPatchMeta: (id: string, patch: Partial<MetaOutput>) => void;
  onSave: (id: string) => void;
  onTidy: (id: string) => void;
  onRegenerate: (id: string) => void;
  onChipDrop: (itemId: string, from: number, to: number) => void;
  onNewSession?: () => void;
  sessionTitle?: string;
  onUpdateSessionTitle?: (title: string) => void;
  onOpenFtpUpload?: () => void;
}

const AGENCIES: { key: Agency; label: string; ftpMode?: boolean }[] = [
  { key: 'adobe', label: 'Adobe Stock CSV' },
  { key: 'shutterstock', label: 'Shutterstock CSV' },
  { key: 'vecteezy', label: 'Vecteezy CSV' },
  { key: 'vecteezy', label: 'Vecteezy (FTP)', ftpMode: true },
  { key: 'freepik', label: 'Freepik CSV' },
  { key: 'dreamstime', label: 'Dreamstime CSV' },
];

function ResultsCardComponent({
  items,
  onPatchMeta,
  onSave,
  onTidy,
  onRegenerate,
  onChipDrop,
  onNewSession,
  sessionTitle,
  onUpdateSessionTitle,
  onOpenFtpUpload,
}: ResultsCardProps) {
  const [viewMode, setViewMode] = useState<'auto' | '1col' | '2col'>('auto');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const handleStartEditTitle = () => {
    setTitleInput(sessionTitle || '');
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (titleInput.trim() && onUpdateSessionTitle) {
      onUpdateSessionTitle(titleInput.trim());
    }
    setIsEditingTitle(false);
  };

  const gridClass =
    viewMode === '1col'
      ? 'grid-cols-1'
      : viewMode === '2col'
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 xl:grid-cols-2';

  return (
    <div className="space-y-4">
      {/* Permanent Top CSV Export Bar matching Mockup */}
      {/* Permanent Top CSV Export & Session Toolbar */}
      <div className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-2xl p-4 sm:p-4.5 space-y-3">
        {/* Row 1: Session Info, New Session Action & Layout Switcher */}
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {sessionTitle ? (
              isEditingTitle ? (
                <input
                  type="text"
                  autoFocus
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  className="bg-white border-2 border-[#2c1810] text-[11px] font-bold text-[#2c1810] px-2.5 py-1 rounded-lg shadow-[1px_1px_0_#2c1810] w-56 outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditTitle}
                  className="bg-[#fff5e6] hover:bg-[#ffe0b2] border-2 border-[#2c1810] text-xs font-bold text-[#2c1810] px-3 py-1 rounded-full shadow-[2px_2px_0_#2c1810] max-w-[220px] sm:max-w-[320px] truncate flex items-center gap-1.5 cursor-pointer transition-all"
                  title="Klik untuk mengubah nama sesi tugas ini"
                >
                  <span className="truncate">{sessionTitle}</span>
                  <Edit2 className="w-3 h-3 shrink-0 text-[#ff6b35]" />
                </button>
              )
            ) : (
              <span className="text-sm font-black text-[#2c1810] tracking-tight">Studio Output</span>
            )}

            {items.length > 0 && (
              <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-xs font-extrabold text-[#2c1810] px-2.5 py-0.5 rounded-full shadow-[1px_1px_0_#2c1810]">
                {items.length} item
              </span>
            )}

            {/* Tombol + Sesi Tugas Baru: diletakkan di samping nama sesi tugas */}
            {onNewSession && items.length > 0 && (
              <button
                type="button"
                onClick={onNewSession}
                className="bg-[#fff5e6] hover:bg-[#ffe0b2] text-[#2c1810] border-2 border-[#2c1810]
                           shadow-[2px_2px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810]
                           hover:translate-x-[1px] hover:translate-y-[1px]
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none
                           font-bold text-xs py-1 px-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                title="Bersihkan kanvas dan mulai sesi tugas baru"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#ff6b35]" />
                <span>+ Sesi Tugas Baru</span>
              </button>
            )}
          </div>

          {/* View mode toggle on the right */}
          <div className="flex items-center gap-1 bg-[#fff5e6] p-1 rounded-xl border-2 border-[#2c1810]">
            <button
              type="button"
              onClick={() => setViewMode('auto')}
              className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'auto'
                  ? 'bg-[#ff6b35] text-white shadow-[1px_1px_0_#2c1810]'
                  : 'text-[#2c1810] hover:bg-white/60'
              }`}
              title="Responsif Otomatis"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setViewMode('1col')}
              className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                viewMode === '1col'
                  ? 'bg-[#ff6b35] text-white shadow-[1px_1px_0_#2c1810]'
                  : 'text-[#2c1810] hover:bg-white/60'
              }`}
              title="Tampilan 1 Kolom Penuh"
              aria-label="Tampilan 1 Kolom"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">1 Kolom</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2col')}
              className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                viewMode === '2col'
                  ? 'bg-[#ff6b35] text-white shadow-[1px_1px_0_#2c1810]'
                  : 'text-[#2c1810] hover:bg-white/60'
              }`}
              title="Tampilan 2 Kolom Grid"
              aria-label="Tampilan 2 Kolom"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">2 Kolom</span>
            </button>
          </div>
        </div>

        {/* Separator Line */}
        <div className="border-t-2 border-[#2c1810]/10" />

        {/* Row 2: Pure Agency CSV Export Buttons & Direct FTP/SFTP Upload */}
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#2c1810] shrink-0">
              <Download className="w-4 h-4 text-[#ff6b35]" />
              <span>CSV Export:</span>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              {AGENCIES.map(({ key, label, ftpMode }) => (
                <button
                  key={`${key}-${ftpMode ? 'ftp' : 'std'}`}
                  type="button"
                  disabled={items.length === 0}
                  className="bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810]
                             shadow-[3px_3px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810]
                             hover:translate-x-[2px] hover:translate-y-[2px]
                             active:translate-x-[3px] active:translate-y-[3px] active:shadow-none
                             font-bold text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                  onClick={() =>
                    downloadAgencyCSV(
                      key,
                      items,
                      ftpMode ? { vecteezyFtpMode: true } : undefined
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5 text-[#ff6b35]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Prominent Direct FTP / SFTP Upload Button */}
          {onOpenFtpUpload && (
            <button
              type="button"
              disabled={items.length === 0}
              onClick={onOpenFtpUpload}
              className="bg-[#ff6b35] hover:bg-[#e85a25] text-white border-2 border-[#2c1810]
                         shadow-[3px_3px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810]
                         hover:translate-x-[2px] hover:translate-y-[2px]
                         active:translate-x-[3px] active:translate-y-[3px] active:shadow-none
                         font-extrabold text-xs py-1.5 px-4 rounded-xl flex items-center gap-2 transition-all cursor-pointer
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none shrink-0"
              title="Upload file langsung ke Adobe Stock & agensi microstock via FTP/SFTP dengan proteksi anti-duplicate"
            >
              <UploadCloud className="w-4 h-4 text-white" />
              <span>FTP / SFTP Upload</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Area */}
      {items.length === 0 ? (
        <div className="bg-white border-2 border-[#2c1810] shadow-[6px_6px_0_#2c1810] rounded-2xl p-8 sm:p-14 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#fff5e6] border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] flex items-center justify-center text-[#ff6b35]">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-xl font-bold text-[#2c1810]">Studio Metadata Siap</h3>
            <p className="text-sm text-[#6b5344] leading-relaxed">
              Drop gambar atau video di panel kiri lalu tekan <strong>Generate Metadata</strong>. Hasil judul, deskripsi, kategori, dan kata kunci SEO akan muncul langsung di sini.
            </p>
          </div>
        </div>
      ) : (
        <div className={`grid ${gridClass} gap-4`}>
          {items.map((item) => (
            <MetadataItem
              key={item.id}
              item={item}
              editable
              onPatchMeta={onPatchMeta}
              onSave={onSave}
              onTidy={onTidy}
              onRegenerate={onRegenerate}
              onChipDrop={onChipDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const ResultsCard = memo(ResultsCardComponent);


