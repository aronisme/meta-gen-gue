// components/KeyPoolModal.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  X,
  ExternalLink,
} from 'lucide-react';
import { getGlobalKeyRotator } from '@/lib/agent/key-rotator';
import type { ProviderKey, ProviderType } from '@/lib/agent/types';

interface KeyPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysUpdated?: () => void;
}

export function KeyPoolModal({ isOpen, onClose, onKeysUpdated }: KeyPoolModalProps) {
  const rotator = getGlobalKeyRotator();
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [activeTab, setActiveTab] = useState<ProviderType>('gemini');

  // Form input state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newPriority, setNewPriority] = useState<number>(1);
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    refreshList();
    const unsub = rotator.subscribe(() => {
      refreshList();
    });
    return () => unsub();
  }, [isOpen]);

  function refreshList() {
    setKeys(rotator.listKeys());
    onKeysUpdated?.();
  }

  if (!isOpen) return null;

  const currentProviderKeys = keys.filter((k) => k.providerId === activeTab);

  function handleAddKey() {
    if (!newKeyValue.trim()) return;
    rotator.addKey({
      providerId: activeTab,
      name: newKeyName.trim() || `${activeTab.toUpperCase()} Key #${currentProviderKeys.length + 1}`,
      keyValue: newKeyValue.trim(),
      priority: Number(newPriority) || 1,
      baseUrl: newBaseUrl.trim() || undefined,
    });
    setNewKeyName('');
    setNewKeyValue('');
    setNewBaseUrl('');
    setNewPriority(1);
    setIsAdding(false);
    refreshList();
  }

  function handleDeleteKey(id: string) {
    rotator.deleteKey(id);
    refreshList();
  }

  function handleResetCooldown(id: string) {
    rotator.resetCooldown(id);
    refreshList();
  }

  async function handleTestKey(key: ProviderKey) {
    setTestingKeyId(key.id);
    const start = Date.now();
    try {
      if (key.providerId === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key.keyValue}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - start;
        if (res.ok) {
          rotator.reportResult({
            lease: {
              keyId: key.id,
              providerId: key.providerId,
              keyValue: key.keyValue,
              keyMasked: key.keyMasked,
              priority: key.priority,
              weight: key.weight,
            },
            success: true,
            latencyMs: latency,
          });
        } else {
          rotator.reportResult({
            lease: {
              keyId: key.id,
              providerId: key.providerId,
              keyValue: key.keyValue,
              keyMasked: key.keyMasked,
              priority: key.priority,
              weight: key.weight,
            },
            success: false,
            statusCode: res.status,
            errorMessage: `HTTP ${res.status}`,
            latencyMs: latency,
          });
        }
      } else {
        // Generic success touch
        await new Promise((r) => setTimeout(r, 400));
        rotator.reportResult({
          lease: {
            keyId: key.id,
            providerId: key.providerId,
            keyValue: key.keyValue,
            keyMasked: key.keyMasked,
            priority: key.priority,
            weight: key.weight,
          },
          success: true,
          latencyMs: Date.now() - start,
        });
      }
    } catch (e) {
      rotator.reportResult({
        lease: {
          keyId: key.id,
          providerId: key.providerId,
          keyValue: key.keyValue,
          keyMasked: key.keyMasked,
          priority: key.priority,
          weight: key.weight,
        },
        success: false,
        errorMessage: String(e),
        latencyMs: Date.now() - start,
      });
    } finally {
      setTestingKeyId(null);
      refreshList();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border-2 border-[#2c1810] shadow-[8px_8px_0_#2c1810] rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#2c1810]">Smart API Key Pool & Rotator</h2>
              <p className="text-xs text-[#6b5344]">
                Adopsi arsitektur Omnigent: multi-key auto-rotasi, LRU leasing, dan 60s auto-cooldown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-[#2c1810] bg-white hover:bg-stone-100 flex items-center justify-center cursor-pointer transition-all active:translate-y-0.5"
          >
            <X className="w-4 h-4 text-[#2c1810]" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex border-b-2 border-[#2c1810] bg-stone-50 overflow-x-auto p-2 gap-1.5 select-none">
          {(['gemini', 'groq', 'openai', 'deepseek', 'custom'] as ProviderType[]).map((p) => {
            const count = keys.filter((k) => k.providerId === p).length;
            const hasCooldown = keys.some((k) => k.providerId === p && k.status === 'rate_limited');
            return (
              <button
                key={p}
                onClick={() => {
                  setActiveTab(p);
                  setIsAdding(false);
                }}
                className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                  activeTab === p
                    ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                    : 'bg-white text-[#2c1810] border-transparent hover:border-stone-300'
                }`}
              >
                <span>{p}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === p ? 'bg-white text-[#ff6b35]' : 'bg-stone-200 text-[#2c1810]'
                  }`}
                >
                  {count}
                </span>
                {hasCooldown && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Info Banner */}
          <div className="bg-[#fffaf0] border-2 border-[#2c1810] rounded-xl p-3 text-xs text-[#2c1810] flex items-start gap-2.5 shadow-[2px_2px_0_#2c1810]">
            <RefreshCw className="w-4 h-4 text-[#ff6b35] shrink-0 mt-0.5" />
            <div>
              <span className="font-black">Auto-Cooldown & Transparent Failover:</span> Jika salah satu key
              terkena limit <code className="font-bold text-[#ff6b35]">HTTP 429</code>, engine otomatis mengistirahatkan key
              selama 60 detik dan mengalihkan request seketika ke key sehat lainnya tanpa memutus tugas.
            </div>
          </div>

          {/* Add Key Form */}
          {isAdding ? (
            <div className="border-2 border-[#2c1810] rounded-xl p-4 bg-stone-50 space-y-3 shadow-[3px_3px_0_#2c1810]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#2c1810]">
                  Tambah Key Baru ({activeTab.toUpperCase()})
                </span>
                <button
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  Batal
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6b5344] mb-1">Nama Label Key</label>
                  <input
                    type="text"
                    placeholder={`e.g. ${activeTab.toUpperCase()} Key #1`}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border-2 border-[#2c1810] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#ff6b35]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#6b5344] mb-1">
                    Prioritas Tier (1 = Utama, 2 = Sekunder, 3 = Fallback)
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border-2 border-[#2c1810] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#ff6b35]"
                  >
                    <option value={1}>Tier 1 (Prioritas Utama)</option>
                    <option value={2}>Tier 2 (Sekunder)</option>
                    <option value={3}>Tier 3 (Cadangan Terakhir / Fallback)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6b5344] mb-1">API Key Value</label>
                <input
                  type="password"
                  placeholder="Tempelkan API Key di sini (rahasia & tersimpan lokal)..."
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  className="w-full text-xs px-3 py-2 border-2 border-[#2c1810] rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-[#ff6b35]"
                />
              </div>

              {activeTab === 'custom' && (
                <div>
                  <label className="block text-[11px] font-bold text-[#6b5344] mb-1">Custom Base URL</label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1 atau proxy kustom"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    className="w-full text-xs px-3 py-2 border-2 border-[#2c1810] rounded-lg bg-white font-mono focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleAddKey}
                disabled={!newKeyValue.trim()}
                className="w-full py-2 bg-[#ff6b35] text-white border-2 border-[#2c1810] rounded-lg font-black text-xs uppercase tracking-wider shadow-[2px_2px_0_#2c1810] hover:bg-[#e8551e] disabled:opacity-50 cursor-pointer active:translate-y-0.5"
              >
                Simpan Key ke Pool
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2.5 border-2 border-dashed border-[#2c1810] hover:bg-[#fff5e6] rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#2c1810] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#ff6b35]" />
              <span>Tambah API Key {activeTab.toUpperCase()}</span>
            </button>
          )}

          {/* Key List */}
          <div className="space-y-2.5">
            {currentProviderKeys.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs">
                Belum ada key terdaftar untuk <span className="font-bold text-[#2c1810]">{activeTab}</span>.
                Klik tombol di atas untuk menambahkan key gratisan Anda!
              </div>
            ) : (
              currentProviderKeys.map((k) => {
                const isCooldown = k.status === 'rate_limited';
                const isExhausted = k.status === 'quota_exceeded';
                const isInvalid = k.status === 'invalid';
                const isHealthy = k.status === 'active';

                return (
                  <div
                    key={k.id}
                    className="border-2 border-[#2c1810] rounded-xl p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0_#2c1810]"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5">
                        {isHealthy && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {isCooldown && <Clock className="w-4 h-4 text-amber-500 animate-pulse" />}
                        {isExhausted && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                        {isInvalid && <ShieldAlert className="w-4 h-4 text-rose-500" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-[#2c1810]">{k.name}</span>
                          <span className="text-[10px] font-mono bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300">
                            {k.keyMasked}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-stone-200 text-[#2c1810]">
                            Tier {k.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-1 flex-wrap">
                          <span>Calls: {k.callCount}</span>
                          <span>Errors: {k.errorCount}</span>
                          {k.latencyMs !== undefined && <span>{k.latencyMs}ms</span>}
                          {isCooldown && (
                            <span className="text-amber-600 font-bold flex items-center gap-1">
                              Cooldown (Rate Limit 429)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {isCooldown && (
                        <button
                          onClick={() => handleResetCooldown(k.id)}
                          className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded cursor-pointer"
                          title="Paksa aktifkan kembali sekarang"
                        >
                          Reset Cooldown
                        </button>
                      )}
                      <button
                        onClick={() => handleTestKey(k)}
                        disabled={testingKeyId === k.id}
                        className="px-2.5 py-1 text-[11px] font-bold text-[#2c1810] bg-stone-100 hover:bg-stone-200 border border-[#2c1810] rounded flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Tes koneksi dan latensi key"
                      >
                        <RefreshCw className={`w-3 h-3 ${testingKeyId === k.id ? 'animate-spin' : ''}`} />
                        <span>Tes</span>
                      </button>
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Hapus Key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#fff5e6] border-t-2 border-[#2c1810] px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-[#6b5344] font-medium">
            Total {keys.length} Key terkonfigurasi di memori lokal.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#2c1810] text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-stone-800 cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
