'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderOpen,
  Key,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

import type {
  FtpAccountProfile,
  FtpProtocol,
  MicrostockAgencyId,
  UploadLedgerRecord,
} from '@/lib/types';
import {
  AGENCY_PRESETS,
  clearUploadLedger,
  deleteFtpProfile,
  getActiveFtpProfileId,
  loadFtpProfiles,
  loadUploadLedger,
  sanitizeFtpHost,
  saveFtpProfile,
  setActiveFtpProfileId,
} from '@/lib/ftp/store';
import { useFtpBridgeStatus, getFtpApiUrl } from '@/lib/ftp/bridge-client';
import { FtpBridgeStatusBanner } from '@/components/FtpBridgeStatusBanner';

export interface FtpAccountsViewProps {
  onNavigateToQueue?: () => void;
  onProfilesChange?: (profiles: FtpAccountProfile[]) => void;
}

export function FtpAccountsView({ onNavigateToQueue, onProfilesChange }: FtpAccountsViewProps) {
  const [activeTab, setActiveTab] = useState<'accounts' | 'ledger'>('accounts');
  const {
    status: bridgeStatus,
    isChecking: isCheckingBridge,
    checkStatus: refreshBridgeStatus,
  } = useFtpBridgeStatus();

  // Accounts state
  const [profiles, setProfiles] = useState<FtpAccountProfile[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form state
  const [formAgency, setFormAgency] = useState<MicrostockAgencyId>('adobe');
  const [formLabel, setFormLabel] = useState('');
  const [formHost, setFormHost] = useState(AGENCY_PRESETS.adobe.host);
  const [formPort, setFormPort] = useState(22);
  const [formProtocol, setFormProtocol] = useState<FtpProtocol>('sftp');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Testing per-card connection state
  const [testingCardId, setTestingCardId] = useState<string | null>(null);

  // Ledger state
  const [ledger, setLedger] = useState<UploadLedgerRecord[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAgencyFilter, setLedgerAgencyFilter] = useState<string>('all');

  const refreshData = useCallback(async () => {
    const loadedProfiles = await loadFtpProfiles();
    setProfiles(loadedProfiles);
    onProfilesChange?.(loadedProfiles);

    const activeId = await getActiveFtpProfileId();
    if (activeId && loadedProfiles.some((p) => p.id === activeId)) {
      setActiveAccountId(activeId);
    } else if (loadedProfiles.length > 0) {
      setActiveAccountId(loadedProfiles[0].id);
      await setActiveFtpProfileId(loadedProfiles[0].id);
    }

    const loadedLedger = await loadUploadLedger();
    setLedger(loadedLedger);
  }, [onProfilesChange]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Handle Preset Select
  const handleAgencyPresetSelect = (agency: MicrostockAgencyId) => {
    setFormAgency(agency);
    const preset = AGENCY_PRESETS[agency];
    if (preset) {
      setFormHost(preset.host);
      setFormPort(preset.port);
      setFormProtocol(preset.protocol);
      if (!formLabel || Object.values(AGENCY_PRESETS).some((p) => p.name === formLabel)) {
        setFormLabel(preset.name);
      }
    }
  };

  const handleStartAdd = (presetAgency?: MicrostockAgencyId) => {
    const agency = presetAgency || 'adobe';
    const preset = AGENCY_PRESETS[agency];
    setEditingAccountId(null);
    setFormAgency(agency);
    setFormLabel(preset.name);
    setFormHost(preset.host);
    setFormPort(preset.port);
    setFormProtocol(preset.protocol);
    setFormUsername('');
    setFormPassword('');
    setTestResult(null);
    setIsAddingAccount(true);
  };

  const handleEditAccount = (p: FtpAccountProfile) => {
    setEditingAccountId(p.id);
    setFormAgency(p.agencyId);
    setFormLabel(p.accountLabel);
    setFormHost(p.host);
    setFormPort(p.port);
    setFormProtocol(p.protocol);
    setFormUsername(p.username);
    setFormPassword(p.password);
    setTestResult(null);
    setIsAddingAccount(true);
  };

  const handleDeleteAccount = async (id: string, label: string) => {
    if (confirm(`Hapus akun FTP "${label}"?`)) {
      await deleteFtpProfile(id);
      toast.info(`Akun "${label}" berhasil dihapus.`);
      await refreshData();
    }
  };

  const handleSetDefaultAccount = async (id: string, label: string) => {
    setActiveAccountId(id);
    await setActiveFtpProfileId(id);
    toast.success(`Akun default aktif diubah ke: "${label}"`);
  };

  // Test Connection
  const handleTestConnection = async (hostArg?: string, portArg?: number, protoArg?: FtpProtocol, userArg?: string, passArg?: string) => {
    const host = hostArg || formHost;
    const port = portArg || formPort;
    const protocol = protoArg || formProtocol;
    const username = userArg || formUsername;
    const password = passArg || formPassword;

    if (!host || !username || !password) {
      toast.error('Lengkapi Host, Username, dan Password sebelum menguji koneksi.');
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    const cleanHost = sanitizeFtpHost(host);
    if (!hostArg && cleanHost !== formHost) {
      setFormHost(cleanHost);
    }

    try {
      const testUrl = getFtpApiUrl('test', bridgeStatus);
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: cleanHost,
          port,
          protocol,
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: msg });
      toast.error(`Koneksi gagal: ${msg}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // Test per-card connection
  const handleTestCardConnection = async (p: FtpAccountProfile) => {
    setTestingCardId(p.id);
    try {
      const testUrl = getFtpApiUrl('test', bridgeStatus);
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: p.host,
          port: p.port,
          protocol: p.protocol,
          username: p.username,
          password: p.password,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`[${p.accountLabel}] ${data.message}`);
      } else {
        toast.error(`[${p.accountLabel}] ${data.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`[${p.accountLabel}] Gagal: ${msg}`);
    } finally {
      setTestingCardId(null);
    }
  };

  // Save Account Profile
  const handleSaveAccount = async () => {
    if (!formLabel.trim()) {
      toast.error('Beri label untuk akun ini (misal: "Adobe Stock - Akun Utama").');
      return;
    }

    const cleanHost = sanitizeFtpHost(formHost);
    if (cleanHost !== formHost) {
      setFormHost(cleanHost);
    }

    if (!cleanHost || !formUsername.trim() || !formPassword.trim()) {
      toast.error('Host, Username, dan Password wajib diisi.');
      return;
    }

    try {
      const saved = await saveFtpProfile({
        id: editingAccountId || undefined,
        agencyId: formAgency,
        accountLabel: formLabel.trim(),
        host: cleanHost,
        port: formPort,
        protocol: formProtocol,
        username: formUsername.trim(),
        password: formPassword.trim(),
      });

      toast.success(`Akun "${saved.accountLabel}" berhasil disimpan.`);
      await refreshData();
      setActiveAccountId(saved.id);
      setIsAddingAccount(false);
      setEditingAccountId(null);
    } catch {
      toast.error('Gagal menyimpan akun.');
    }
  };

  // Clear upload ledger
  const handleClearLedger = async () => {
    if (confirm('Hapus seluruh riwayat upload ledger? Audit verifikasi duplikat lokal akan dikosongkan.')) {
      await clearUploadLedger();
      toast.info('Riwayat upload ledger dibersihkan.');
      await refreshData();
    }
  };

  // Filtered ledger
  const filteredLedger = ledger.filter((rec) => {
    const matchesSearch =
      rec.filename.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      rec.accountLabel.toLowerCase().includes(ledgerSearch.toLowerCase());
    const matchesAgency = ledgerAgencyFilter === 'all' || rec.agencyId === ledgerAgencyFilter;
    return matchesSearch && matchesAgency;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Key className="w-6 h-6 text-amber-600" />
              <span>Kelola Akun Microstock (FTP / SFTP)</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-xs font-black px-2.5 py-0.5 rounded-full shadow-[1px_1px_0_#2c1810]">
              {profiles.length} Akun
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Atur kredensial akun agensi (Adobe Stock, Shutterstock, Dreamstime, Freepik, Vecteezy, Pond5) secara aman di penyimpanan lokal browser.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {!isAddingAccount && (
            <Button
              type="button"
              onClick={() => handleStartAdd()}
              className="h-9.5 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Tambah Akun Baru
            </Button>
          )}

          {onNavigateToQueue && (
            <Button
              type="button"
              variant="outline"
              onClick={onNavigateToQueue}
              className="h-9.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 mr-1.5 text-[#ff6b35]" />
              Lihat Antrean Upload
            </Button>
          )}
        </div>
      </div>

      {/* Local FTP Bridge Status Banner */}
      <FtpBridgeStatusBanner
        status={bridgeStatus}
        isChecking={isCheckingBridge}
        onRefresh={refreshBridgeStatus}
      />

      {/* 2. Sub-Tabs Bar: Daftar Akun vs Riwayat Ledger */}
      <div className="flex items-center gap-2 border-b-2 border-[#2c1810] pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('accounts');
            setIsAddingAccount(false);
          }}
          className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'accounts'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'bg-white text-[#2c1810] border-2 border-[#2c1810] hover:bg-[#fff5e6]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Daftar Akun ({profiles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('ledger');
            setIsAddingAccount(false);
          }}
          className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'ledger'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'bg-white text-[#2c1810] border-2 border-[#2c1810] hover:bg-[#fff5e6]'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Riwayat Audit Ledger ({ledger.length})</span>
        </button>
      </div>

      {/* 3. TAB 1: ACCOUNTS */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          {/* Quick Preset Add Buttons */}
          {!isAddingAccount && (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-xl p-3 shadow-[2px_2px_0_#2c1810] flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#6b5344] mr-1">Preset Agensi Cepat:</span>
              {(['adobe', 'shutterstock', 'dreamstime', 'freepik', 'vecteezy', 'pond5'] as MicrostockAgencyId[]).map(
                (agency) => {
                  const preset = AGENCY_PRESETS[agency];
                  return (
                    <button
                      key={agency}
                      type="button"
                      onClick={() => handleStartAdd(agency)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810] flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.badgeColor }} />
                      <span>+ {preset.name}</span>
                    </button>
                  );
                }
              )}
            </div>
          )}

          {/* Form Add / Edit */}
          {isAddingAccount ? (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-6 shadow-[6px_6px_0_#2c1810] space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between border-b-2 border-[#2c1810] pb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-600" />
                  <h3 className="font-black text-lg text-[#2c1810]">
                    {editingAccountId ? 'Edit Kredensial Akun FTP' : 'Tambah Akun FTP / SFTP Baru'}
                  </h3>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingAccount(false)}
                  className="h-8 w-8 p-0 text-[#6b5344] hover:text-[#2c1810] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Preset Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-[#2c1810]">Pilih Preset Agensi</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {(Object.keys(AGENCY_PRESETS) as MicrostockAgencyId[]).map((agId) => {
                    const preset = AGENCY_PRESETS[agId];
                    const isSelected = formAgency === agId;
                    return (
                      <button
                        key={agId}
                        type="button"
                        onClick={() => handleAgencyPresetSelect(agId)}
                        className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                            : 'bg-white border-stone-200 hover:border-stone-400 font-semibold'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full mb-1.5" style={{ backgroundColor: preset.badgeColor }} />
                        <span className="text-xs text-[#2c1810] truncate">{preset.name}</span>
                        <span className="text-[10px] uppercase font-mono text-stone-500">{preset.protocol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-[#2c1810]">Label Akun (Nama Tampilan)</Label>
                  <Input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder='Contoh: "Adobe Stock - Portofolio Utama"'
                    className="border-2 border-[#2c1810] font-bold text-xs h-9 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-[#2c1810]">Host Server FTP / SFTP</Label>
                  <Input
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    onBlur={() => setFormHost(sanitizeFtpHost(formHost))}
                    placeholder="Contoh: sftp.contributor.adobestock.com"
                    className="border-2 border-[#2c1810] font-mono text-xs h-9 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-black text-[#2c1810]">Port</Label>
                    <Input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(parseInt(e.target.value, 10) || 21)}
                      className="border-2 border-[#2c1810] font-mono text-xs h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-black text-[#2c1810]">Protokol</Label>
                    <Select value={formProtocol} onValueChange={(val: FtpProtocol) => setFormProtocol(val)}>
                      <SelectTrigger className="border-2 border-[#2c1810] font-bold text-xs h-9 bg-white uppercase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-2 border-[#2c1810]">
                        <SelectItem value="sftp" className="text-xs font-bold">SFTP (SSH Port 22)</SelectItem>
                        <SelectItem value="ftp" className="text-xs font-bold">FTP (Standard Port 21)</SelectItem>
                        <SelectItem value="ftps" className="text-xs font-bold">FTPS (FTP over TLS/SSL)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-[#2c1810]">Username / User ID</Label>
                  <Input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Username akun agensi"
                    className="border-2 border-[#2c1810] font-bold text-xs h-9 bg-white"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-black text-[#2c1810]">Password / Token Kredensial</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Password FTP atau token khusus agensi"
                      className="border-2 border-[#2c1810] font-mono text-xs h-9 bg-white pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-[#2c1810] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Helper Note for Selected Agency */}
              {AGENCY_PRESETS[formAgency]?.helperNote && (
                <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>{AGENCY_PRESETS[formAgency].helperNote}</p>
                </div>
              )}

              {/* Test Result Feedback */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl border-2 flex items-center gap-2 text-xs font-bold ${
                    testResult.ok
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                      : 'bg-red-50 border-red-400 text-red-950'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-between pt-3 border-t-2 border-[#2c1810] flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleTestConnection()}
                  disabled={testingConnection}
                  className="border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] text-[#2c1810] font-black text-xs h-9 px-4 cursor-pointer shadow-[2px_2px_0_#2c1810]"
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Menguji...
                    </>
                  ) : (
                    <>
                      <Server className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      Uji Koneksi Server
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsAddingAccount(false)}
                    className="font-bold text-xs cursor-pointer text-[#6b5344]"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveAccount}
                    className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] h-9 px-5 cursor-pointer"
                  >
                    Simpan Akun
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Accounts Cards Grid */
            <div>
              {profiles.length === 0 ? (
                <div className="bg-[#fffdf9] border-2 border-dashed border-[#2c1810] rounded-2xl p-10 text-center shadow-[4px_4px_0_#2c1810] space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-amber-600">
                    <Key className="w-7 h-7" />
                  </div>
                  <h3 className="font-black text-base text-[#2c1810]">Belum Ada Akun Terdaftar</h3>
                  <p className="text-xs text-[#6b5344] max-w-sm mx-auto">
                    Tambahkan akun FTP/SFTP agensi microstock Anda untuk mengunggah otomatis file gambar & video.
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleStartAdd()}
                    className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 py-2 cursor-pointer mt-2"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Tambah Akun Pertama
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {profiles.map((p) => {
                    const preset = AGENCY_PRESETS[p.agencyId];
                    const isActive = activeAccountId === p.id;
                    const isTesting = testingCardId === p.id;

                    return (
                      <div
                        key={p.id}
                        className={`bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] transition-all flex flex-col justify-between ${
                          isActive ? 'ring-2 ring-[#ff6b35] bg-[#fffaf5]' : ''
                        }`}
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex items-center justify-between pb-3 border-b-2 border-[#2c1810] gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: preset?.badgeColor || '#ff6b35' }}
                              />
                              <span className="font-black text-sm text-[#2c1810] truncate" title={p.accountLabel}>
                                {p.accountLabel}
                              </span>
                            </div>
                            <span className="text-[10px] uppercase font-mono font-black bg-[#fff5e6] border border-[#2c1810] px-1.5 py-0.5 rounded shadow-[1px_1px_0_#2c1810]">
                              {p.protocol}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="py-3 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[#6b5344] font-medium">Agensi:</span>
                              <span className="font-bold text-[#2c1810]">{preset?.name || p.agencyId}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#6b5344] font-medium">Host:</span>
                              <span className="font-mono text-[#2c1810] text-[11px] truncate max-w-[160px]" title={p.host}>
                                {p.host}:{p.port}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#6b5344] font-medium">Username:</span>
                              <span className="font-mono text-[#2c1810] text-[11px] truncate max-w-[160px]" title={p.username}>
                                {p.username}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-3 border-t-2 border-[#2c1810] flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-400 px-2 py-1 rounded-md">
                                <Check className="w-3 h-3" />
                                <span>Akun Aktif</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultAccount(p.id, p.accountLabel)}
                                className="text-[10px] font-bold text-[#6b5344] hover:text-[#2c1810] underline cursor-pointer"
                              >
                                Jadikan Aktif
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleTestCardConnection(p)}
                              disabled={isTesting}
                              className="h-7 text-[10px] font-black border border-[#2c1810] bg-white hover:bg-[#fff5e6] px-2 shadow-[1px_1px_0_#2c1810] cursor-pointer"
                              title="Uji koneksi login FTP"
                            >
                              {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Tes'}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditAccount(p)}
                              className="h-7 text-[10px] font-black border border-[#2c1810] bg-white hover:bg-[#fff5e6] px-2 shadow-[1px_1px_0_#2c1810] cursor-pointer"
                            >
                              Edit
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteAccount(p.id, p.accountLabel)}
                              className="h-7 text-[10px] text-red-600 hover:bg-red-50 hover:text-red-800 px-2 cursor-pointer"
                              title="Hapus akun"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 2: AUDIT LEDGER */}
      {activeTab === 'ledger' && (
        <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[6px_6px_0_#2c1810] overflow-hidden space-y-0">
          {/* Ledger Filter Bar */}
          <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Cari file atau akun..."
                  className="pl-8 h-8.5 bg-white border-2 border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810]"
                />
              </div>

              <Select value={ledgerAgencyFilter} onValueChange={setLedgerAgencyFilter}>
                <SelectTrigger className="h-8.5 w-36 bg-white border-2 border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810]">
                  <SelectValue placeholder="Agensi" />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-[#2c1810]">
                  <SelectItem value="all" className="text-xs font-bold">Semua Agensi</SelectItem>
                  {(Object.keys(AGENCY_PRESETS) as MicrostockAgencyId[]).map((ag) => (
                    <SelectItem key={ag} value={ag} className="text-xs font-bold">
                      {AGENCY_PRESETS[ag].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#6b5344]">
                {filteredLedger.length} Record Riwayat
              </span>
              {ledger.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearLedger}
                  className="h-8 bg-white hover:bg-red-50 text-red-700 border-2 border-[#2c1810] font-black text-xs px-3 shadow-[1px_1px_0_#2c1810] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Kosongkan Riwayat
                </Button>
              )}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#fff5e6] border-b-2 border-[#2c1810] text-[#2c1810] font-black uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="p-3">File Asset</th>
                  <th className="p-3">Target Akun & Agensi</th>
                  <th className="p-3 w-32">Ukuran</th>
                  <th className="p-3 w-40">Waktu Unggah</th>
                  <th className="p-3 w-28 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ddd4] font-medium bg-white">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#6b5344]">
                      Belum ada catatan riwayat upload. File yang berhasil diunggah akan otomatis tercatat di sini untuk audit anti-duplikasi.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((rec) => (
                    <tr key={rec.id} className="hover:bg-[#fffdf9] transition-colors">
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-xs text-[#2c1810] truncate max-w-sm sm:max-w-md" title={rec.filename}>
                            {rec.filename}
                          </span>
                          {rec.remotePath && (
                            <span className="font-mono text-[10px] text-stone-500 truncate" title={rec.remotePath}>
                              Remote: {rec.remotePath}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-[#2c1810]">{rec.accountLabel}</span>
                          <span className="text-[10px] bg-stone-100 border border-stone-300 px-1 py-0.2 rounded font-mono uppercase text-stone-700">
                            {rec.agencyId}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-[#6b5344]">
                        {(rec.fileSize / (1024 * 1024)).toFixed(1)} MB
                      </td>
                      <td className="p-3 text-[11px] text-[#6b5344] font-mono">
                        {new Date(rec.uploadedAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Sukses</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
