// lib/ftp/bridge-client.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_BRIDGE_PORT = 45678;
export const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;
export const BRIDGE_URL_STORAGE_KEY = 'metagen_ftp_bridge_url_v1';

export type BridgeEndpointType = 'local-bridge' | 'same-origin' | 'none';

export interface BridgeExifStatus {
  available: boolean;
  version?: string | null;
  engine?: string;
  supportedFormats?: string[];
}

export interface BridgeHealthStatus {
  isAvailable: boolean;
  endpointType: BridgeEndpointType;
  baseUrl: string;
  version?: string;
  message: string;
  exiftool?: BridgeExifStatus;
}

/**
 * Mengambil URL bridge tersimpan di localStorage atau default 127.0.0.1:45678
 */
export function getStoredBridgeUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_BRIDGE_URL;
  try {
    return localStorage.getItem(BRIDGE_URL_STORAGE_KEY) || DEFAULT_BRIDGE_URL;
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
}

/**
 * Menyimpan konfigurasi kustom URL bridge
 */
export function setStoredBridgeUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BRIDGE_URL_STORAGE_KEY, url.trim().replace(/\/+$/, ''));
  } catch {}
}

/**
 * Memeriksa apakah Local FTP Bridge (port 45678) aktif,
 * atau apakah saat ini sedang berjalan di localhost (Dev Server / Electron).
 */
export async function checkBridgeHealth(targetUrl?: string | unknown): Promise<BridgeHealthStatus> {
  const urlCandidate = typeof targetUrl === 'string' && targetUrl.trim() ? targetUrl : getStoredBridgeUrl();
  const bridgeUrl = (typeof urlCandidate === 'string' && urlCandidate.trim() ? urlCandidate : DEFAULT_BRIDGE_URL)
    .trim()
    .replace(/\/+$/, '');

  // 1. Coba ping Local FTP Bridge
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${bridgeUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && (data.service === 'metagen-ftp-bridge' || data.ok)) {
        return {
          isAvailable: true,
          endpointType: 'local-bridge',
          baseUrl: bridgeUrl,
          version: data.version || '1.0.0',
          message: `Local FTP Bridge terhubung di port ${bridgeUrl.split(':').pop() || '45678'}`,
          exiftool: data.exiftool,
        };
      }
    }
  } catch {
    // Bridge port 45678 belum running atau request diblokir
  }

  // 2. Fallback: jika web app sendiri sedang dibuka di localhost/127.0.0.1 (Next.js Dev / Electron desktop)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalHost) {
      return {
        isAvailable: true,
        endpointType: 'same-origin',
        baseUrl: '',
        message: 'Server Next.js Lokal (Localhost) aktif',
      };
    }
  }

  // 3. Jika diakses dari Cloudflare Pages / Vercel / remote domain dan bridge lokal mati
  return {
    isAvailable: false,
    endpointType: 'none',
    baseUrl: '',
    message: 'Backend FTP lokal belum terdeteksi. Silakan jalankan start-ftp-bridge.bat.',
  };
}

/**
 * Mengembalikan URL endpoint FTP yang efektif (mengarahkan ke bridge atau same-origin).
 */
export function getFtpApiUrl(action: 'test' | 'upload' | 'disconnect-all' | 'progress', status: BridgeHealthStatus): string {
  if (status.endpointType === 'local-bridge' && status.baseUrl) {
    return `${status.baseUrl}/api/ftp/${action}`;
  }
  return `/api/ftp/${action}`;
}

/**
 * Hook React untuk memantau status Local FTP Bridge
 */
export function useFtpBridgeStatus() {
  const [status, setStatus] = useState<BridgeHealthStatus>({
    isAvailable: false,
    endpointType: 'none',
    baseUrl: DEFAULT_BRIDGE_URL,
    message: 'Memeriksa status backend FTP lokal...',
  });
  const [isChecking, setIsChecking] = useState<boolean>(true);

  const checkStatus = useCallback(async (customUrl?: unknown) => {
    setIsChecking(true);
    try {
      const urlStr = typeof customUrl === 'string' && customUrl.trim() ? customUrl.trim() : undefined;
      const result = await checkBridgeHealth(urlStr);
      setStatus(result);
      return result;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();

    // Auto re-check status setiap 20 detik jika offline, atau 60 detik jika online
    const intervalTime = status.isAvailable ? 60000 : 20000;
    const interval = setInterval(() => {
      checkStatus();
    }, intervalTime);

    return () => clearInterval(interval);
  }, [checkStatus, status.isAvailable]);

  return {
    status,
    isChecking,
    checkStatus,
    bridgeUrl: status.baseUrl || getStoredBridgeUrl(),
  };
}
