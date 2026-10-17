'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  Download,
  FolderOpen,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  loadPromptSessions,
  deletePromptSession,
} from '@/lib/prompt-agent/store';
import { exportPromptsToCsv, ENGINE_LABELS } from '@/lib/prompt-agent/engine';
import type { PromptGenerationSession } from '@/lib/prompt-agent/types';

export interface PromptSessionModalProps {
  open: boolean;
  activeSessionId?: string;
  onClose: () => void;
  onSelectSession: (session: PromptGenerationSession) => void;
}

export function PromptSessionModal({
  open,
  activeSessionId,
  onClose,
  onSelectSession,
}: PromptSessionModalProps) {
  const [sessions, setSessions] = useState<PromptGenerationSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const list = await loadPromptSessions();
      setSessions(list);
    } catch {
      toast.error('Gagal memuat riwayat sesi prompt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchSessions();
    }
  }, [open]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchEngine = s.settings?.engine?.toLowerCase().includes(q);
      const matchPrompt = s.prompts?.some(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.prompt?.toLowerCase().includes(q) ||
          p.creativeStrategy?.toLowerCase().includes(q)
      );
      return matchTitle || matchEngine || matchPrompt;
    });
  }, [sessions, searchQuery]);

  const handleDeleteSession = async (e: React.MouseEvent, session: PromptGenerationSession) => {
    e.stopPropagation();
    if (!confirm(`Hapus sesi "${session.title}" (${session.prompts.length} prompt)?`)) {
      return;
    }
    setDeletingId(session.id);
    try {
      await deletePromptSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      toast.success('Sesi berhasil dihapus.');
    } catch {
      toast.error('Gagal menghapus sesi.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadCsv = (e: React.MouseEvent, session: PromptGenerationSession) => {
    e.stopPropagation();
    if (!session.prompts || session.prompts.length === 0) {
      toast.info('Sesi ini belum memiliki prompt untuk diunduh.');
      return;
    }
    const csv = exportPromptsToCsv(session.prompts, session.settings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = session.title.replace(/[^a-zA-Z0-9_\-]/g, '_');
    a.download = `${cleanTitle || 'prompts'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV ${session.prompts.length} prompt berhasil diunduh!`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-[6px_6px_0_#2c1810] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b-2 border-[#2c1810] bg-[#fff5e6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2c1810] text-white flex items-center justify-center shadow-[2px_2px_0_#ff6b35]">
              <Sparkles className="w-4 h-4 text-[#ff6b35]" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-[#2c1810]">
                Riwayat Sesi Prompt VCPA
              </h3>
              <p className="text-[11px] text-[#6b5344] font-medium">
                Pilih sesi untuk melanjutkan kurasi atau unduh prompt sekaligus.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-[#2c1810] bg-white hover:bg-stone-100 flex items-center justify-center text-[#2c1810] cursor-pointer shadow-[2px_2px_0_#2c1810] transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-stone-200 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari sesi berdasarkan judul, engine, atau teks prompt..."
              className="pl-9 h-9.5 text-xs bg-[#fffdf9] border-2 border-[#2c1810] rounded-xl focus:ring-0 focus:border-[#ff6b35]"
            />
          </div>
        </div>

        {/* Sessions List Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#ff6b35]" />
              <p className="text-xs font-bold text-[#6b5344]">Memuat arsip sesi...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs font-black text-[#2c1810]">
                {searchQuery ? 'Tidak ada sesi yang cocok dengan pencarian.' : 'Belum ada riwayat sesi prompt tersimpan.'}
              </p>
              <p className="text-[11px] text-[#6b5344]">
                Setiap kali Anda men-generate prompt, sesi akan tersimpan secara otomatis.
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const promptCount = session.prompts?.length || 0;
              const dateStr = new Date(session.updatedAt || session.createdAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const engineLabel = session.settings?.engine
                ? ENGINE_LABELS[session.settings.engine] || session.settings.engine
                : 'Midjourney v6.1';

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session);
                    onClose();
                  }}
                  className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer space-y-2 text-left ${
                    isActive
                      ? 'bg-[#fff5e6] border-[#ff6b35] shadow-[3px_3px_0_#2c1810]'
                      : 'bg-white hover:bg-[#fffdf9] border-[#2c1810] shadow-[2px_2px_0_#2c1810] hover:shadow-[3px_3px_0_#2c1810]'
                  }`}
                >
                  {/* Session Header Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h4 className="font-black text-xs sm:text-sm text-[#2c1810] truncate">
                        {session.title}
                      </h4>
                      {isActive && (
                        <span className="bg-[#ff6b35] text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Sesi Aktif
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleDownloadCsv(e, session)}
                        className="h-7 px-2 text-[11px] font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810]"
                        title="Unduh CSV untuk sesi ini"
                      >
                        <Download className="w-3 h-3 mr-1 text-[#ff6b35]" />
                        <span>CSV</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onSelectSession(session);
                          onClose();
                        }}
                        className="h-7 px-2.5 text-[11px] font-black bg-[#2c1810] hover:bg-[#4a2e22] text-white border-2 border-[#2c1810] shadow-[1px_1px_0_#ff6b35]"
                      >
                        <FolderOpen className="w-3 h-3 mr-1 text-[#ff6b35]" />
                        <span>Buka</span>
                      </Button>

                      <button
                        type="button"
                        disabled={deletingId === session.id}
                        onClick={(e) => handleDeleteSession(e, session)}
                        className="p-1 rounded-md text-stone-400 hover:text-red-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer disabled:opacity-50"
                        title="Hapus sesi ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex items-center gap-2 text-[10px] text-[#6b5344] font-medium flex-wrap">
                    <span className="bg-stone-100 border border-stone-300 text-stone-800 font-bold px-1.5 py-0.5 rounded">
                      {promptCount} Prompt
                    </span>
                    <span className="bg-[#fff5e6] border border-amber-300 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                      {engineLabel}
                    </span>
                    {session.settings?.aspectRatio && session.settings.aspectRatio !== 'none' && (
                      <span className="bg-stone-100 border border-stone-300 text-stone-700 px-1.5 py-0.5 rounded">
                        Rasio {session.settings.aspectRatio}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-stone-500 ml-auto">
                      <Calendar className="w-3 h-3" />
                      <span>{dateStr}</span>
                    </span>
                  </div>

                  {/* Top Prompt Snippet Preview */}
                  {session.prompts && session.prompts.length > 0 && (
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-2 text-[11px] text-[#6b5344] line-clamp-2 font-mono">
                      <span className="font-bold text-[#2c1810]">Top Concept: </span>
                      {session.prompts[0]?.prompt || session.prompts[0]?.title}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t-2 border-[#2c1810] bg-[#fffdf9] flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-8.5 px-4 text-xs font-black border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] bg-white hover:bg-stone-100 cursor-pointer"
          >
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
