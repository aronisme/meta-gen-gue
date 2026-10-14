'use client';

import { useState } from 'react';
import {
  Compass,
  FileSpreadsheet,
  HelpCircle,
  ImagePlus,
  PenTool,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Wand2,
  Zap,
} from 'lucide-react';

export type AppModuleId = 'metadata' | 'prompt-gen' | 'keyword-research';

export interface AppSideRailProps {
  activeModule: AppModuleId;
  onModuleChange: (mod: AppModuleId) => void;
}

interface NavItem {
  id: AppModuleId;
  label: string;
  tagline: string;
  icon: typeof Sparkles;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'metadata',
    label: 'Metadata Generator',
    tagline: 'AI Metadata & Multi-FTP Sync',
    icon: Sparkles,
  },
  {
    id: 'prompt-gen',
    label: 'Prompt Img Generator',
    tagline: 'Midjourney, FLUX & SD Stock Prompts',
    icon: Wand2,
    badge: 'Baru',
  },
  {
    id: 'keyword-research',
    label: 'Keyword Research',
    tagline: 'Tren Mikrostock & Tag Explorer',
    icon: Search,
    badge: 'Baru',
  },
];

export function AppSideRail({ activeModule, onModuleChange }: AppSideRailProps) {
  const [hoveredItem, setHoveredItem] = useState<AppModuleId | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      {/* Desktop / Tablet Vertical Side Rail (Narrow Strip) */}
      <aside className="w-16 shrink-0 bg-white border-r-2 border-[#2c1810] flex flex-col items-center justify-between py-4 select-none z-30 sticky top-0 h-screen hidden md:flex">
        {/* Top: Logo & Main Navigation Icons */}
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Brand Icon */}
          <button
            type="button"
            onClick={() => onModuleChange('metadata')}
            className="w-10 h-10 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer group"
            title="MetaGen Suite"
          >
            <Zap className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
          </button>

          <div className="w-8 h-px bg-stone-200" />

          {/* Module Icons List */}
          <nav className="flex flex-col items-center gap-3 w-full px-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;

              return (
                <div key={item.id} className="relative flex items-center justify-center w-full">
                  <button
                    type="button"
                    onClick={() => onModuleChange(item.id)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-[#fff5e6] text-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                        : 'text-[#6b5344] hover:bg-[#fff5e6] hover:text-[#2c1810]'
                    }`}
                    aria-label={item.label}
                  >
                    <Icon className="w-5 h-5" />

                    {/* Active Left Indicator Dot/Pill */}
                    {isActive && (
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#ff6b35] rounded-r-full" />
                    )}

                    {/* New Feature Small Badge */}
                    {item.badge && !isActive && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#ff6b35] border border-white rounded-full" />
                    )}
                  </button>

                  {/* Floating Tooltip with Clean Arrow */}
                  {hoveredItem === item.id && (
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none whitespace-nowrap bg-[#2c1810] text-[#fff5e6] border border-[#2c1810] shadow-[3px_3px_0_#ff6b35] rounded-xl px-3 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-150">
                      <div className="font-black flex items-center gap-1.5">
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] bg-[#ff6b35] text-white px-1 py-0.2 rounded font-mono">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-300 font-normal">{item.tagline}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Info / Help & User Avatar */}
        <div className="flex flex-col items-center gap-4 w-full px-2">
          {/* Help Button */}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="w-10 h-10 rounded-xl text-stone-500 hover:text-[#2c1810] hover:bg-[#fff5e6] flex items-center justify-center transition-colors cursor-pointer"
            title="Panduan & Informasi Alat"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Yellow User Avatar Circle (seperti di screenshot) */}
          <div
            className="w-10 h-10 rounded-full bg-[#f59e0b] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-[#2c1810] cursor-pointer hover:scale-105 transition-transform"
            title="Profil Pengguna / Local Contributor Workspace"
          >
            <User className="w-5 h-5 fill-current" />
          </div>
        </div>
      </aside>

      {/* Mobile Top/Bottom Bar for Small Screens */}
      <div className="md:hidden bg-white border-b-2 border-[#2c1810] px-3 py-2 flex items-center justify-between sticky top-0 z-40 shadow-[0_2px_0_#2c1810]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#ff6b35] border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] flex items-center justify-center text-white">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <span className="font-black text-sm text-[#2c1810]">MetaGen</span>
        </div>

        {/* Mobile Module Switcher Pills */}
        <div className="flex items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModuleChange(item.id)}
                className={`p-1.5 rounded-lg border flex items-center gap-1 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#fff5e6] text-[#ff6b35] border-[#2c1810] shadow-[1px_1px_0_#2c1810]'
                    : 'bg-white text-[#6b5344] border-stone-200'
                }`}
                title={item.label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="w-7 h-7 rounded-full bg-[#f59e0b] border-2 border-[#2c1810] flex items-center justify-center text-[#2c1810]">
          <User className="w-3.5 h-3.5 fill-current" />
        </div>
      </div>

      {/* Help & Info Modal */}
      {showHelpModal && (
        <div
          onClick={() => setShowHelpModal(false)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-6 shadow-[8px_8px_0_#2c1810] max-w-lg w-full space-y-4"
          >
            <div className="flex items-center justify-between border-b-2 border-[#2c1810] pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#ff6b35] fill-current" />
                <h3 className="font-black text-lg text-[#2c1810]">MetaGen Creator Suite</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="text-stone-500 hover:text-[#2c1810] cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#6b5344] leading-relaxed">
              <p>
                MetaGen adalah platform kerja terpadu untuk kreator dan kontributor microstock komersial (Adobe Stock, Shutterstock, Freepik, Vecteezy, Dreamstime, Pond5).
              </p>
              <div className="space-y-2 pt-1">
                <div className="p-2.5 rounded-xl bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                  <span className="font-black text-[#2c1810] block mb-0.5">1. Metadata Generator</span>
                  Analisis visual gambar & video AI, pembuatan judul/deskripsi/keyword, serta auto-embed IPTC & XMP ke file JPG/PNG via FTP.
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                  <span className="font-black text-[#2c1810] block mb-0.5">2. Prompt Img Generator</span>
                  Pembuat prompt visual khusus stock photography (komposisi, pencahayaan, lensa, copy space) untuk Midjourney, FLUX, & SD.
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                  <span className="font-black text-[#2c1810] block mb-0.5">3. Keyword Research</span>
                  Pencari dan pemeriksa kata kunci microstock populer, clustering topik, dan penyaring kata subjektif terlarang.
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs px-4 py-2 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
