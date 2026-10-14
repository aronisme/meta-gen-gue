'use client';

import { memo, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Download, Search, CheckSquare, Square, Trash2, History, FolderOpen, Layers } from 'lucide-react';
import { MetadataItem } from '@/components/MetadataItem';
import { downloadAgencyCSV, type Agency } from '@/lib/csv';
import type { ItemMetaBox, MetaOutput, GenerationSession } from '@/lib/types';

interface HistoryCardProps {
  items: ItemMetaBox[];
  total: number;
  page: number;
  pageSize: number;
  selectedIds: Set<string>;
  onPageChange: (page: number) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onPatchMeta?: (id: string, patch: Partial<MetaOutput>) => void;
  onSave?: (id: string) => void;
  onChipDrop?: (itemId: string, from: number, to: number) => void;
  editable?: boolean;
  sessions?: GenerationSession[];
  onLoadSession?: (session: GenerationSession) => void;
  onDeleteSession?: (sessionId: string) => void;
}

const AGENCIES: { key: Agency; label: string }[] = [
  { key: 'adobe', label: 'Adobe' },
  { key: 'shutterstock', label: 'Shutterstock' },
  { key: 'vecteezy', label: 'Vecteezy' },
  { key: 'freepik', label: 'Freepik (Magnific)' },
  { key: 'dreamstime', label: 'Dreamstime' },
];

function HistoryCardComponent({
  items,
  total,
  page,
  pageSize,
  selectedIds,
  onPageChange,
  onToggleSelect,
  onToggleSelectAll,
  onDelete,
  onBulkDelete,
  onPatchMeta,
  onSave,
  onChipDrop,
  editable = false,
  sessions = [],
  onLoadSession,
  onDeleteSession,
}: HistoryCardProps) {
  const [historyMode, setHistoryMode] = useState<'sessions' | 'files'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');

  const totalPages = Math.ceil(total / pageSize);
  const selectedCount = selectedIds.size;
  const allSelectable = items.filter((i) => !i.error);
  const allSelected = selectedCount > 0 && selectedCount === allSelectable.length;

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.settings.model.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (it) =>
        it.filename.toLowerCase().includes(q) ||
        it.meta?.title?.toLowerCase().includes(q) ||
        it.meta?.keywords?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected item(s)?`)) {
      onBulkDelete(Array.from(selectedIds));
    }
  };

  return (
    <div className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl overflow-hidden">
      <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#ff6b35]" />
              <span className="font-bold text-[#2c1810] text-lg">Riwayat Metadata</span>
            </div>

            {/* Mode switch: Sesi Tugas vs Semua File */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
              <button
                type="button"
                onClick={() => setHistoryMode('sessions')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  historyMode === 'sessions'
                    ? 'bg-[#ff6b35] text-white shadow-[1px_1px_0_#2c1810]'
                    : 'text-[#2c1810] hover:bg-[#fff5e6]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Per Sesi Tugas ({sessions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setHistoryMode('files')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  historyMode === 'files'
                    ? 'bg-[#ff6b35] text-white shadow-[1px_1px_0_#2c1810]'
                    : 'text-[#2c1810] hover:bg-[#fff5e6]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Semua File ({total})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b5344]" />
              <Input
                placeholder={historyMode === 'sessions' ? 'Cari sesi tugas / model...' : 'Cari file/judul/keyword...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-52 sm:w-60 h-9 bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[2px_2px_0_#2c1810] text-xs font-medium"
              />
            </div>

            {/* File selection controls (only shown in files mode) */}
            {historyMode === 'files' && (
              <>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs cursor-pointer transition-all"
                  onClick={onToggleSelectAll}
                >
                  {allSelected ? <CheckSquare className="w-4 h-4 text-[#ff6b35]" /> : <Square className="w-4 h-4" />}
                  <span>{allSelected ? 'Batal Semua' : 'Pilih Semua'}</span>
                </button>
                {selectedCount > 0 && (
                  <span className="text-xs font-bold text-[#6b5344] px-1">
                    {selectedCount} dipilih
                  </span>
                )}
                {selectedCount > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#fee2e2] hover:bg-[#fca5a5] text-red-700 border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Terpilih</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {historyMode === 'sessions' ? (
          /* Sesi Tugas View */
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className="bg-[#fffdf9] border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[#2c1810] text-sm sm:text-base">
                      {session.title}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        session.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-500'
                          : session.status === 'partial'
                            ? 'bg-amber-100 text-amber-800 border-amber-500'
                            : 'bg-blue-100 text-blue-800 border-blue-500'
                      }`}
                    >
                      {session.status === 'completed'
                        ? 'Selesai 100%'
                        : session.status === 'partial'
                          ? 'Selesai Sebagian'
                          : session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-[#6b5344] flex-wrap font-medium">
                    <span>
                      {new Date(session.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>•</span>
                    <span>
                      {session.totalFiles} Item ({session.successCount} berhasil
                      {session.errorCount > 0 ? `, ${session.errorCount} gagal` : ''})
                    </span>
                    <span>•</span>
                    <span className="font-mono bg-[#fff5e6] px-1.5 py-0.5 rounded border border-[#2c1810]/20 text-[11px]">
                      {session.settings.model}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {onLoadSession && (
                    <button
                      type="button"
                      onClick={() => onLoadSession(session)}
                      className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810]
                                 shadow-[2px_2px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810]
                                 hover:translate-x-[1px] hover:translate-y-[1px]
                                 font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
                      title="Buka sesi tugas ini di Studio untuk diedit atau diekspor"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Buka Sesi Tugas</span>
                    </button>
                  )}
                  {onDeleteSession && (
                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      className="bg-[#fee2e2] hover:bg-[#fca5a5] text-red-700 border-2 border-[#2c1810]
                                 shadow-[2px_2px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810]
                                 hover:translate-x-[1px] hover:translate-y-[1px]
                                 font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
                      title="Hapus sesi tugas dan file terkait"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredSessions.length === 0 && searchQuery && (
              <div className="text-center text-[#6b5344] py-8 font-medium">
                Tidak ada sesi tugas yang cocok dengan kata kunci &quot;{searchQuery}&quot;.
              </div>
            )}

            {filteredSessions.length === 0 && !searchQuery && (
              <div className="text-center text-[#6b5344] py-12 font-medium bg-[#fffdf9] border-2 border-dashed border-[#2c1810]/40 rounded-xl space-y-2">
                <FolderOpen className="w-8 h-8 text-[#ff6b35] mx-auto opacity-70" />
                <p className="font-bold text-[#2c1810]">Belum ada riwayat sesi tugas.</p>
                <p className="text-xs text-[#6b5344]">Setiap kali Anda menekan Generate Metadata, sesi tugas baru akan otomatis tercatat di sini.</p>
              </div>
            )}
          </div>
        ) : (
          /* Semua File Individual View */
          <>
            {/* Export buttons */}
            <div className="flex gap-2 flex-wrap">
              {AGENCIES.map(({ key, label }) => (
                <div key={key} className="flex gap-1">
                  <button
                    className="bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
                    onClick={() => downloadAgencyCSV(key, items)}
                  >
                    <Download className="w-3 h-3 text-[#ff6b35]" />
                    <span>Halaman Ini → {label}</span>
                  </button>
                  <button
                    disabled={!selectedItems.length}
                    className="bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-bold text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => downloadAgencyCSV(key, selectedItems)}
                  >
                    <span>Terpilih ({selectedItems.length}) → {label}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Items grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <MetadataItem
                  key={item.id}
                  item={item}
                  editable={editable}
                  selectable
                  selected={selectedIds.has(item.id)}
                  onSelect={onToggleSelect}
                  onDelete={onDelete}
                  onPatchMeta={onPatchMeta}
                  onSave={onSave}
                  onChipDrop={onChipDrop}
                />
              ))}
            </div>

            {filteredItems.length === 0 && searchQuery && (
              <div className="text-center text-[#6b5344] py-8 font-medium">
                Tidak ada item riwayat yang cocok dengan kata kunci &quot;{searchQuery}&quot;.
              </div>
            )}

            {filteredItems.length === 0 && !searchQuery && (
              <div className="text-center text-[#6b5344] py-8 font-medium">
                Belum ada riwayat tersimpan.
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && !searchQuery && (
              <div className="flex justify-center gap-2 pt-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => onPageChange(i)}
                    className={`w-8 h-8 rounded-lg border-2 border-[#2c1810] font-bold text-xs shadow-[2px_2px_0_#2c1810] transition-all cursor-pointer ${
                      i === page
                        ? 'bg-[#ff6b35] text-white shadow-none translate-x-[2px] translate-y-[2px]'
                        : 'bg-white hover:bg-[#fff5e6] text-[#2c1810]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const HistoryCard = memo(HistoryCardComponent);

