// components/FtpBridgeStatusBanner.tsx
'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Laptop,
  RefreshCw,
  Server,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { BridgeHealthStatus } from '@/lib/ftp/bridge-client';

interface FtpBridgeStatusBannerProps {
  status: BridgeHealthStatus;
  isChecking: boolean;
  onRefresh: () => void;
  compact?: boolean;
}

export function FtpBridgeStatusBanner({
  status,
  isChecking,
  onRefresh,
  compact = false,
}: FtpBridgeStatusBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('pnpm bridge');
    setCopied(true);
    toast.success('Perintah "pnpm bridge" berhasil disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  // 1. Tampilan Compact (misalnya untuk header modal atau sudut atas view)
  if (compact) {
    if (status.endpointType === 'local-bridge') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Laptop className="w-3.5 h-3.5" />
          <span>Local Bridge Aktif ({status.baseUrl.replace(/^https?:\/\//, '')})</span>
          <button
            onClick={onRefresh}
            disabled={isChecking}
            title="Cek ulang koneksi bridge"
            className="hover:text-emerald-300 ml-1 transition-transform active:rotate-180"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      );
    }

    if (status.endpointType === 'same-origin') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <Server className="w-3.5 h-3.5" />
          <span>Server Lokal Aktif (Localhost)</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
        <WifiOff className="w-3.5 h-3.5" />
        <span>Local Bridge Offline</span>
        <button
          onClick={onRefresh}
          disabled={isChecking}
          className="hover:text-amber-300 ml-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Mengecek...' : 'Cek'}
        </button>
      </div>
    );
  }

  // 2. Tampilan Banner Lengkap jika Terhubung (Local Bridge)
  if (status.endpointType === 'local-bridge') {
    return (
      <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-neutral-900/60 p-4 text-emerald-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-inner">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-semibold text-emerald-300 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Local FTP Bridge Terhubung ({status.baseUrl})
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  v{status.version || '1.0.0'}
                </span>
              </div>
              <p className="text-xs text-emerald-400/80 mt-0.5">
                Koneksi lokal siap. File footage &amp; batch gambar akan dikirim langsung dari komputer Anda ke server microstock tanpa batas 100MB Cloudflare.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={isChecking}
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 text-xs shrink-0 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Mengecek...' : 'Cek Status'}
          </Button>
        </div>
      </div>
    );
  }

  // 3. Tampilan Banner jika di Lingkungan Localhost (Next.js Dev / Desktop)
  if (status.endpointType === 'same-origin') {
    return (
      <div className="rounded-xl border border-blue-500/25 bg-blue-950/20 p-3.5 text-blue-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs text-blue-300">
              <strong className="font-semibold text-blue-200">Server Lokal Aktif:</strong> Aplikasi dijalankan di lingkungan lokal ({typeof window !== 'undefined' ? window.location.host : 'localhost'}). Fitur FTP menggunakan server bawaan.
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isChecking}
            className="text-blue-400 hover:bg-blue-500/15 text-xs h-7 px-2 shrink-0"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Cek
          </Button>
        </div>
      </div>
    );
  }

  // 4. Tampilan Banner Peringatan jika Bridge Offline (Diakses dari Cloudflare / Web)
  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/50 via-neutral-900/80 to-neutral-950 p-5 text-amber-100 shadow-xl">
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
              Backend FTP Lokal Belum Berjalan
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Aksi Diperlukan
              </span>
            </h4>
            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
              Karena aplikasi MetaGen diakses secara online dari cloud (Cloudflare/Web), pengiriman file FTP ke microstock membutuhkan aplikasi pendamping di laptop/PC lokal Anda agar tidak terhalang batas 100MB dan timeout Cloudflare.
            </p>
          </div>

          {/* Panduan Langkah Aktivasi */}
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800 p-3 space-y-2 text-xs">
            <div className="font-medium text-neutral-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              Cara Menjalankan Local FTP Bridge di Komputer Anda:
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 pl-1">
              <li>
                Buka folder proyek MetaGen di komputer Anda (misal: <code className="text-amber-300 font-mono">c:\App Tools\meta-gen-gue</code>).
              </li>
              <li>
                Klik ganda file <code className="text-emerald-400 font-bold font-mono">start-ftp-bridge.bat</code> (atau jalankan perintah di bawah via terminal).
              </li>
              <li>
                Biarkan jendela terminal tetap terbuka, lalu klik tombol <strong className="text-neutral-200">&quot;Cek Koneksi Ulang&quot;</strong> di bawah.
              </li>
            </ol>

            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 px-2.5 py-1.5 rounded bg-black/60 border border-neutral-800 text-neutral-200 font-mono text-[11px] select-all">
                pnpm bridge
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyCommand}
                className="h-7 text-xs border-neutral-700 hover:bg-neutral-800 text-neutral-300"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copied ? 'Tersalin' : 'Salin'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={onRefresh}
              disabled={isChecking}
              className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs h-8 px-4 shadow-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Memeriksa Bridge...' : 'Cek Koneksi Ulang'}
            </Button>
            <span className="text-[11px] text-neutral-400">
              Port target: <span className="font-mono text-neutral-300">127.0.0.1:45678</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
