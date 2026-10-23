'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Wand2,
  Zap,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth/types';

interface LandingBerandaViewProps {
  currentUser: AuthUser | null;
  onOpenAuthModal: () => void;
  onNavigateToStudio: () => void;
  onNavigateToPromptGen: () => void;
  onNavigateToKeywords: () => void;
  onNavigateToQc?: () => void;
  onNavigateToAgent?: () => void;
}

export function LandingBerandaView({
  currentUser,
  onOpenAuthModal,
  onNavigateToStudio,
  onNavigateToPromptGen,
  onNavigateToKeywords,
  onNavigateToQc,
  onNavigateToAgent,
}: LandingBerandaViewProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Hero Section */}
      <section className="bg-white border-2 border-[#2c1810] shadow-[6px_6px_0_#2c1810] rounded-3xl p-6 sm:p-10 md:p-12 relative overflow-hidden">
        {/* Subtle decorative corner badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#fff5e6] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] text-xs font-black uppercase tracking-wider text-[#2c1810] mb-6">
          <Zap className="w-3.5 h-3.5 fill-[#ff6b35] text-[#ff6b35]" />
          <span>MetaGen Studio Suite: Edisi Microstock 2026</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2c1810] leading-tight tracking-tight">
              Otomasi Metadata & Prompter Microstock Berkecepatan Tinggi
            </h1>

            <p className="text-base sm:text-lg text-[#6b5344] leading-relaxed font-medium">
              Tinggalkan pengetikan judul dan tag manual berjam-jam. MetaGen menganalisis gambar dan video
              secara batch, menyusun metadata komersial berkonvergensi tinggi, dan mengekspor CSV resmi untuk
              Adobe Stock, Shutterstock, Freepik, Vecteezy, dan Dreamstime.
            </p>

            {/* Status Auth Callout & Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              {currentUser ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={onNavigateToStudio}
                    className="h-13 px-6 rounded-2xl bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-extrabold text-base border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] hover:shadow-[2px_2px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <span>Masuk ke Studio Kerja</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="h-13 px-5 rounded-2xl bg-[#fff5e6] hover:bg-[#ffe8cc] text-[#2c1810] font-bold text-sm border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Status: {currentUser.remainingQuota} Kuota Tersisa</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="h-13 px-6 rounded-2xl bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-extrabold text-base border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] hover:shadow-[2px_2px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <User className="w-5 h-5" />
                    <span>Masuk dengan Google (1-Klik)</span>
                  </button>

                  <button
                    type="button"
                    onClick={onNavigateToStudio}
                    className="h-13 px-5 rounded-2xl bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-sm border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] hover:shadow-[1px_1px_0_#2c1810] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Coba Demo Studio (Tanpa Login)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Honest Trust Badges */}
            <div className="pt-2 flex items-center gap-4 text-xs font-bold text-[#6b5344] flex-wrap">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                100 Generasi Gratis per Hari
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Cloudflare D1 Edge Database
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Dukungan Penuh Local FTP Bridge
              </span>
            </div>
          </div>

          {/* Interactive Feature Teaser Card */}
          <div className="lg:col-span-5">
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[5px_5px_0_#2c1810] space-y-4">
              <div className="flex items-center justify-between border-b-2 border-[#2c1810]/15 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#2c1810] text-[#fff5e6] flex items-center justify-center font-black text-xs">
                    AI
                  </div>
                  <span className="font-black text-xs uppercase tracking-wider text-[#2c1810]">
                    Universal Best-Seller Architecture
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Ready to Export
                </span>
              </div>

              {/* Sample Output Preview Box */}
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#6b5344] mb-1">
                    Judul (Front-Loaded & Bebas Koma untuk Adobe Stock)
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-[#2c1810] font-medium text-[#2c1810] leading-snug">
                    Minimalist modern desk setup with laptop. Clean home office workspace with potted plant and ceramic mug representing remote work productivity.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase text-[#6b5344] mb-1">
                      Kategori Adobe
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-[#2c1810] font-bold text-[#2c1810]">
                      19: Technology
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-extrabold uppercase text-[#6b5344] mb-1">
                      Kategori Shutterstock
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-[#2c1810] font-bold text-[#2c1810]">
                      Technology / Interiors
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold uppercase text-[#6b5344] mb-1">
                    Kata Kunci SEO (35 Tag Terkonvergensi)
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-[#2c1810] text-[11px] text-[#6b5344] font-medium leading-relaxed max-h-16 overflow-y-auto">
                    desk, laptop, home office, workspace, computer, modern desk, remote work, freelance, productivity, coffee cup, houseplant, wooden desk, copy space, minimal, overhead view...
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-[#6b5344] font-semibold border-t border-stone-200">
                <span>Ekspor Format:</span>
                <span className="font-bold text-[#2c1810]">Adobe, Shutter, Vecteezy, Freepik, Dreamstime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Modul Suite Utama */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-black text-[#2c1810] tracking-tight">
              Empat Modul Produktivitas Dalam Satu Tempat
            </h2>
            <p className="text-sm text-[#6b5344] font-medium">
              Alat terintegrasi untuk mempercepat siklus pembuatan konten dari konsep visual hingga distribusi agensi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Metadata Generator */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-[#2c1810]">Metadata Generator</h3>
              <p className="text-xs text-[#6b5344] leading-relaxed font-medium">
                Ekstraksi batch visual gambar dan video. Hasilkan judul bebas koma yang patuh standar kurator,
                deskripsi natural, serta 20 hingga 50 kata kunci relevan secara instan.
              </p>
              <ul className="text-xs text-[#2c1810] font-semibold space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Ekspor 5 format CSV agensi
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Ekstraksi frame video lokal di browser
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Integrasi Local FTP/SFTP Bridge
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={onNavigateToStudio}
              className="w-full py-2.5 rounded-xl bg-[#fff5e6] hover:bg-[#ffebd1] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Buka Metadata Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Visual Concept Prompt Agent */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#2c1810] border-2 border-[#2c1810] shadow-[2px_2px_0_#ff6b35] flex items-center justify-center text-[#ff6b35]">
                <Wand2 className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[#2c1810]">Prompt Img Generator</h3>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#ff6b35] text-white">
                  VCPA
                </span>
              </div>
              <p className="text-xs text-[#6b5344] leading-relaxed font-medium">
                Agen pembangun prompt gambar untuk Midjourney v6, FLUX.1 Schnell/Dev, dan SDXL.
                Lengkap dengan mode reverse-engineering dari gambar referensi atau ideasi teks bebas.
              </p>
              <ul className="text-xs text-[#2c1810] font-semibold space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Mode 1: Dekonstruksi gaya referensi
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Mode 2: Ideasi konsep kustom bebas
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Paste langsung clipboard (Ctrl+V)
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={onNavigateToPromptGen}
              className="w-full py-2.5 rounded-xl bg-[#fff5e6] hover:bg-[#ffebd1] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Buka VCPA Generator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Keyword Research */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500 border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-[#2c1810]">Keyword Research</h3>
              <p className="text-xs text-[#6b5344] leading-relaxed font-medium">
                Riset kata kunci mikrostock populer. Analisis kata kunci dengan volume pencarian tinggi
                untuk memaksimalkan impresi dan penjualan portofolio Anda di pasar global.
              </p>
              <ul className="text-xs text-[#2c1810] font-semibold space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Peta kata kunci sinonim
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Filter komersial tanpa trademark
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Ekspor daftar tag sekali klik
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={onNavigateToKeywords}
              className="w-full py-2.5 rounded-xl bg-[#fff5e6] hover:bg-[#ffebd1] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Buka Keyword Research</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 4: Adobe Stock QC Inspector */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[#2c1810]">QC Inspector</h3>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-700 text-white">
                  Adobe Gate
                </span>
              </div>
              <p className="text-xs text-[#6b5344] leading-relaxed font-medium">
                Asisten kendali mutu pra-submit otomatis berbasis Vision Language Models (VLM). Deteksi dini resolusi &lt; 4MP, cacat jari AI, teks/merk liar, dan lindungi akun di antrean FTP.
              </p>
              <ul className="text-xs text-[#2c1810] font-semibold space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Preflight teknis instan &lt;5ms
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Deteksi Known Restrictions
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Proteksi otomatis antrean upload FTP
                </li>
              </ul>
            </div>
            {onNavigateToQc && (
              <button
                type="button"
                onClick={onNavigateToQc}
                className="w-full py-2.5 rounded-xl bg-[#fff5e6] hover:bg-[#ffebd1] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <span>Buka QC Inspector</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. Cara Kerja Sistem Autentikasi & Kuota D1 */}
      <section className="bg-[#fffdf9] border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-3xl p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-[#2c1810] tracking-tight">
            Transparansi Kuota & Keamanan Akun
          </h2>
          <p className="text-sm text-[#6b5344] font-medium">
            Tanpa langganan tersembunyi. Didukung oleh database serverless Cloudflare D1 di Singapura.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-[#2c1810] rounded-xl p-4 shadow-[2px_2px_0_#2c1810] space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[#ff6b35]">
              <Clock className="w-4 h-4" />
              <span>Reset Harian 00:00</span>
            </div>
            <p className="text-xs text-[#6b5344] font-medium leading-relaxed">
              Setiap pengguna Google terverifikasi menerima 100 kuota generasi setiap hari.
              Kuota otomatis di-reset saat pergantian tanggal tanpa perlu klaim manual.
            </p>
          </div>

          <div className="bg-white border-2 border-[#2c1810] rounded-xl p-4 shadow-[2px_2px_0_#2c1810] space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-600">
              <Database className="w-4 h-4" />
              <span>Latensi Edge 0.28 ms</span>
            </div>
            <p className="text-xs text-[#6b5344] font-medium leading-relaxed">
              Validasi kuota dan identitas dilakukan langsung di Cloudflare Edge datacenter Singapura
              dalam sekejap, sehingga proses generate terasa instan dan bebas lag.
            </p>
          </div>

          <div className="bg-white border-2 border-[#2c1810] rounded-xl p-4 shadow-[2px_2px_0_#2c1810] space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-600">
              <ShieldCheck className="w-4 h-4" />
              <span>Proteksi Sesi & Logout</span>
            </div>
            <p className="text-xs text-[#6b5344] font-medium leading-relaxed">
              Sesi login disimpan aman di peramban Anda. Anda dapat keluar kapan saja dengan satu klik
              untuk menjaga keamanan akun di komputer bersama.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Tanya Jawab Praktis (FAQ) */}
      <section className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-3xl p-6 sm:p-8 space-y-5">
        <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] tracking-tight">
          Pertanyaan Umum Kontributor
        </h2>

        <div className="space-y-3">
          {[
            {
              q: 'Apakah judul yang dihasilkan benar-benar bebas dari tanda koma?',
              a: 'Ya. Adobe Stock menolak file CSV jika kolom judul memiliki tanda koma. Algoritma MetaGen secara ketat menggunakan titik untuk memisahkan klausa subjek dan konteks komersial.',
            },
            {
              q: 'Bagaimana cara mengirim file langsung ke Adobe Stock atau agensi lain?',
              a: 'Gunakan modul Antrean Upload yang terhubung ke Local FTP Bridge. Anda dapat menjalankan skrip bridge di komputer lokal (pnpm bridge) untuk mengunggah ratusan gigabyte tanpa batas ukuran peramban.',
            },
            {
              q: 'Bagaimana jika kuota harian saya habis?',
              a: 'Kuota 100 generasi Anda akan terisi kembali secara otomatis pada pukul 00:00 setiap malam. Anda juga dapat menghubungi admin (adobestpro@gmail.com) jika memerlukan penyesuaian kuota khusus untuk portofolio skala besar.',
            },
          ].map((item, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={item.q}
                className="border-2 border-[#2c1810] rounded-xl overflow-hidden bg-[#fffdf9] transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-4 py-3.5 text-left font-bold text-sm text-[#2c1810] flex items-center justify-between gap-3 cursor-pointer hover:bg-[#fff5e6] transition-colors"
                >
                  <span>{item.q}</span>
                  <span className="text-base font-black text-[#ff6b35]">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-[#6b5344] font-medium leading-relaxed border-t border-stone-200">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Bottom Call to Action */}
      <section className="bg-[#2c1810] text-[#fffaf0] rounded-3xl p-8 sm:p-10 border-2 border-[#2c1810] shadow-[6px_6px_0_#ff6b35] flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Siap Mempercepat Unggahan Portofolio Anda?
          </h2>
          <p className="text-xs sm:text-sm text-stone-300 font-medium max-w-xl">
            Buka studio sekarang dan rasakan kemudahan mengelola ribuan aset stok dalam hitungan menit.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-center">
          <button
            type="button"
            onClick={onNavigateToStudio}
            className="h-12 px-6 rounded-xl bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-extrabold text-sm border-2 border-white shadow-[3px_3px_0_white] hover:shadow-[1px_1px_0_white] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Buka Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {!currentUser && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="h-12 px-5 rounded-xl bg-white hover:bg-stone-100 text-[#2c1810] font-extrabold text-sm border-2 border-white shadow-[3px_3px_0_#ff6b35] hover:shadow-[1px_1px_0_#ff6b35] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Masuk Google</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
