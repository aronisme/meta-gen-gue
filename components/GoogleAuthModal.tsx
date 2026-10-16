'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '@/lib/auth/types';
import { clearStoredUser, loginWithGoogleIdToken, refreshUserStatus } from '@/lib/auth/store';

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '61908502532-85bvlf6i8safupsefop9n3hflbodrthe.apps.googleusercontent.com';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onUserChange?: (user: AuthUser | null) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
              locale?: string;
            }
          ) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

export function GoogleAuthModal({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
}: GoogleAuthModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load Google Identity Services SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
      setGsiLoaded(true);
      return;
    }

    const scriptId = 'google-gsi-client-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setGsiLoaded(true);
      };
      script.onerror = () => {
        console.warn('GSI script failed to load. Ad blocker might be blocking accounts.google.com');
      };
      document.body.appendChild(script);
    } else {
      script.addEventListener('load', () => setGsiLoaded(true));
    }
  }, []);

  // Initialize and render Google Sign-In button
  useEffect(() => {
    if (!isOpen || !gsiLoaded || currentUser || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response?.credential) {
            toast.error('Gagal menerima kredensial dari Google');
            return;
          }

          setIsVerifying(true);
          toast.loading('Memverifikasi akun Google & status whitelist...', { id: 'auth-verify' });

          try {
            const result = await loginWithGoogleIdToken(response.credential);
            toast.dismiss('auth-verify');

            if (result.ok && result.user) {
              onUserChange?.(result.user);
              if (result.user.status === 'pending') {
                toast.warning(`Akun ${result.user.email} terdaftar dan menunggu aktivasi whitelist.`);
              } else if (result.user.status === 'blocked') {
                toast.error('Akun Anda dinonaktifkan oleh administrator.');
              } else {
                toast.success(`Selamat datang, ${result.user.name || result.user.email}!`);
              }
            } else {
              toast.error(result.error || result.message || 'Verifikasi login gagal.');
            }
          } catch (err) {
            toast.dismiss('auth-verify');
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Terjadi kesalahan otentikasi: ${msg}`);
          } finally {
            setIsVerifying(false);
          }
        },
      });

      if (googleBtnContainerRef.current) {
        googleBtnContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
          locale: 'id',
        });
      }
    } catch (e) {
      console.warn('Error initializing Google One-Tap/Button:', e);
    }
  }, [isOpen, gsiLoaded, currentUser, onUserChange]);

  const handleLogout = () => {
    clearStoredUser();
    onUserChange?.(null);
    toast.success('Anda telah berhasil keluar dari akun.');
    onClose();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const updated = await refreshUserStatus();
      if (updated) {
        onUserChange?.(updated);
        toast.success(`Status kuota diperbarui: ${updated.remainingQuota} generasi tersisa.`);
      }
    } catch {
      toast.error('Gagal memperbarui status pengguna.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  const quotaPercent = currentUser?.dailyQuota
    ? Math.min(100, Math.round(((currentUser.usageCount || 0) / currentUser.dailyQuota) * 100))
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#fffdfa] border-2 border-[#2c1810] rounded-2xl p-6 shadow-[6px_6px_0_#2c1810] max-w-md w-full space-y-5 text-[#2c1810] select-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-[#2c1810] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ff6b35] border border-[#2c1810] shadow-[1px_1px_0_#2c1810] flex items-center justify-center text-white">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="font-black text-base md:text-lg tracking-tight">
                {currentUser ? 'Profil & Status Kuota' : 'Masuk Akun Google'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[#fff5e6] flex items-center justify-center text-stone-600 hover:text-[#2c1810] transition-colors cursor-pointer"
            aria-label="Tutup jendela modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {currentUser ? (
          /* State 1: User Logged In */
          <div className="space-y-4">
            {/* User Info Card */}
            <div className="p-4 rounded-xl bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center gap-3.5">
              {currentUser.picture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name}
                  className="w-13 h-13 rounded-full border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] object-cover"
                />
              ) : (
                <div className="w-13 h-13 rounded-full bg-[#f59e0b] border-2 border-[#2c1810] flex items-center justify-center text-[#2c1810]">
                  <User className="w-6 h-6 fill-current" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-black text-sm truncate text-[#2c1810]">
                  {currentUser.name || 'Pengguna'}
                </div>
                <div className="text-xs text-stone-600 truncate">{currentUser.email}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {/* Role Badge */}
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md border border-[#2c1810] bg-[#fff5e6] text-[#ff6b35]">
                    {currentUser.role === 'admin' ? '👑 Admin' : currentUser.role === 'member' ? '⭐ Tim Member' : 'User'}
                  </span>
                  {/* Status Badge */}
                  {currentUser.status === 'active' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-700 bg-emerald-50 text-emerald-800 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Aktif (Whitelist)
                    </span>
                  ) : currentUser.status === 'pending' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-600 bg-amber-50 text-amber-800 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Menunggu Approval
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-rose-700 bg-rose-50 text-rose-800 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-600" />
                      Diblokir
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quota Usage Meter */}
            <div className="p-4 rounded-xl bg-white border border-[#2c1810] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#6b5344]">Pemakaian Kuota Harian</span>
                <span className="font-black text-[#2c1810]">
                  {currentUser.usageCount || 0} / {currentUser.dailyQuota} generasi
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full h-3 bg-stone-100 rounded-full border border-[#2c1810] overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    quotaPercent >= 90
                      ? 'bg-rose-500'
                      : quotaPercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-[#ff6b35]'
                  }`}
                  style={{ width: `${Math.max(4, quotaPercent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-500 pt-0.5">
                <span>Sisa: <strong className="text-[#2c1810]">{currentUser.remainingQuota}</strong> generasi</span>
                <span>Reset otomatis tiap hari (00:00)</span>
              </div>
            </div>

            {/* Pending Whitelist Notice */}
            {currentUser.status === 'pending' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-400 text-xs text-amber-900 flex items-start gap-2 leading-relaxed">
                <Clock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <strong>Menunggu Konfirmasi Admin:</strong> Akun Anda telah dicatat di database Google Sheets. Hubungi admin untuk mengaktifkan status whitelist Anda.
                </div>
              </div>
            )}

            {/* Actions Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex-1 py-2 px-3 rounded-xl border border-[#2c1810] bg-white hover:bg-[#fff5e6] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#ff6b35]' : ''}`} />
                <span>Segarkan Kuota</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="py-2 px-3.5 rounded-xl border border-rose-800 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        ) : (
          /* State 2: User Logged Out */
          <div className="space-y-4">
            <div className="text-xs text-[#6b5344] leading-relaxed">
              Masuk menggunakan akun Google Anda untuk mendapatkan akses AI visual generator, kuota harian otomatis, dan sinkronisasi preferensi kerja.
            </div>

            {/* Official Google Sign-In Container */}
            <div className="flex flex-col items-center justify-center py-3 bg-stone-50 rounded-xl border border-dashed border-[#2c1810]/30 min-h-[70px]">
              {isVerifying ? (
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35] animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi akun Google...</span>
                </div>
              ) : gsiLoaded ? (
                <div ref={googleBtnContainerRef} className="flex justify-center" />
              ) : (
                <div className="text-xs text-stone-500 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyiapkan Google Sign-In...</span>
                </div>
              )}
            </div>

            {/* Whitelist System Transparency Information */}
            <div className="p-3.5 rounded-xl bg-[#fff5e6] border border-[#2c1810] space-y-1.5 text-xs text-[#6b5344]">
              <div className="font-black text-[#2c1810] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#ff6b35]" />
                <span>Sistem Whitelist & Kuota Otomatis</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                <li>Email otomatis didaftarkan ke basis data Google Sheets saat pertama login.</li>
                <li>Administrator dapat memberikan kuota harian khusus atau akses tak terbatas.</li>
                <li>Nol pelacakan data pribadi; token diverifikasi langsung dengan server resmi Google.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Modal Footer Note */}
        <div className="text-[10px] text-center text-stone-400 border-t border-stone-200 pt-2.5">
          OAuth 2.0 Client ID: <code className="font-mono text-[9px]">{GOOGLE_CLIENT_ID.slice(0, 20)}...</code>
        </div>
      </div>
    </div>
  );
}
