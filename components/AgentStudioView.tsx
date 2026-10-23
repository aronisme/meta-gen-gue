// components/AgentStudioView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Wand2,
  Send,
  Key,
  RefreshCw,
  Terminal,
  Activity,
  Mic,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AgentExecutor } from '@/lib/agent/executor';
import { getGlobalKeyRotator } from '@/lib/agent/key-rotator';
import { AGENT_SKILLS, getSkillById } from '@/lib/agent/skills';
import type {
  AgentActivityLog,
  AgentMessage,
  ProviderType,
} from '@/lib/agent/types';
import { KeyPoolModal } from './KeyPoolModal';

interface AgentStudioViewProps {
  onSwitchToMetadata?: () => void;
  onSwitchToPromptGen?: () => void;
  onSwitchToQc?: () => void;
}

const LOCAL_BRIDGE_URL = 'http://127.0.0.1:45678';

export function AgentStudioView({
  onSwitchToMetadata,
  onSwitchToPromptGen,
  onSwitchToQc,
}: AgentStudioViewProps) {
  const rotator = getGlobalKeyRotator();
  const [activeSkillId, setActiveSkillId] = useState<string>('general-coworker');
  const [activeProvider, setActiveProvider] = useState<ProviderType>('gemini');
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome_1',
      role: 'assistant',
      content: `Selamat datang di **MetaGen Omnigent Live AI Agent**! 🧠\n\nSaya adalah rekan kerja otonom Anda untuk memproduksi, mengaudit kualitas, memberi metadata, dan mendistribusikan karya mikrostock ke seluruh agensi. Pilih keahlian di sisi kiri atau ketikkan instruksi langsung di bawah.`,
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [activities, setActivities] = useState<AgentActivityLog[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<{ online: boolean; details?: unknown }>({
    online: false,
  });
  const [expandedReasoningMap, setExpandedReasoningMap] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const executorRef = useRef<AgentExecutor | null>(null);

  // Initialize Executor
  useEffect(() => {
    executorRef.current = new AgentExecutor(activeSkillId, activeProvider);
  }, [activeSkillId, activeProvider]);

  // Periodic bridge check
  useEffect(() => {
    checkBridge();
    const interval = setInterval(checkBridge, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  async function checkBridge() {
    try {
      const res = await fetch(`${LOCAL_BRIDGE_URL}/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const json = await res.json();
        setBridgeStatus({ online: true, details: json });
      } else {
        setBridgeStatus({ online: false });
      }
    } catch {
      setBridgeStatus({ online: false });
    }
  }

  function handleSendPrompt(customText?: string) {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isBusy) return;

    const userMsg: AgentMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsBusy(true);

    const exec = executorRef.current || new AgentExecutor(activeSkillId, activeProvider);

    exec
      .runTurn(userMsg.content, messages, {
        onActivity: (act) => {
          setActivities((prev) => [act, ...prev.slice(0, 40)]);
        },
        onToolStart: (tc) => {
          setActivities((prev) => [
            {
              id: `tc_${Date.now()}`,
              timestamp: Date.now(),
              level: 'info',
              type: 'tool',
              title: `Mengeksekusi ${tc.name}`,
            },
            ...prev,
          ]);
        },
      })
      .then((assistantMsg) => {
        setMessages((prev) => [...prev, assistantMsg]);
        // Auto-expand reasoning for this message
        setExpandedReasoningMap((prev) => ({ ...prev, [assistantMsg.id]: true }));
      })
      .catch((err) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Terjadi kendala saat mengeksekusi instruksi: ${String(err)}`,
            timestamp: Date.now(),
          },
        ]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  }

  function toggleReasoning(msgId: string) {
    setExpandedReasoningMap((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  }

  const activeSkill = getSkillById(activeSkillId);
  const activeKeysCount = rotator.listKeys(activeProvider).filter((k) => k.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Editorial Header Bar */}
      <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#2c1810]">
                Omnigent Live AI Agent
              </h1>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#ff6b35] text-white border border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                Autonomous Coworker
              </span>
            </div>
            <p className="text-xs text-[#6b5344] font-medium hidden sm:block">
              Pusat kendali agen otonom: eksekusi tool, memori sesi, dan auto-rotasi API multi-provider
            </p>
          </div>
        </div>

        {/* Top Actions: Provider Pill & Key Pool Modal */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] bg-[#fff5e6] hover:bg-[#ffebd1] text-xs font-bold text-[#2c1810] transition-all cursor-pointer"
            title="Kelola pool API Key dan rotasi cerdas"
          >
            <Key className="w-3.5 h-3.5 text-[#ff6b35]" />
            <span>Key Pool ({activeKeysCount} Aktif)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMessages([
                {
                  id: `welcome_${Date.now()}`,
                  role: 'assistant',
                  content: `Sesi dibersihkan. Saya siap menerima tugas microstock baru!`,
                  timestamp: Date.now(),
                },
              ]);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-[#2c1810] bg-white hover:bg-stone-100 text-xs font-bold text-stone-600 transition-all cursor-pointer"
            title="Reset percakapan dan mulai sesi baru"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Sesi Baru</span>
          </button>
        </div>
      </div>

      {/* 3-Column Arena Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (3 cols): Playbook Skills & Session Memory */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-stone-100">
              <span className="text-xs font-black uppercase tracking-wider text-[#2c1810] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-[#ff6b35]" />
                Playbook Skills
              </span>
              <span className="text-[10px] text-stone-400 font-bold">5 Mode</span>
            </div>

            <div className="space-y-2">
              {AGENT_SKILLS.map((s) => {
                const isSelected = s.id === activeSkillId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSkillId(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[3px_3px_0_#2c1810]'
                        : 'bg-stone-50 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#2c1810]">{s.name}</span>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-[#ff6b35]" />}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 line-clamp-2 leading-tight">
                      {s.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Chips / Quick Actions */}
          <div className="bg-white border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-[#2c1810] block">
              Pintasan Perintah Cepat
            </span>
            <div className="space-y-1.5">
              {[
                'Pindai folder render 2K di Downloads/MetaGen_Flow',
                'Cek kepatuhan teknis QC Adobe Stock untuk file terakhir',
                'Buat 3 variasi prompt commercial modern coffee shop',
                'Periksa status koneksi Local Bridge dan sistem',
              ].map((cmd, i) => (
                <button
                  key={i}
                  disabled={isBusy}
                  onClick={() => handleSendPrompt(cmd)}
                  className="w-full text-left text-[11px] font-medium p-2 rounded-lg bg-stone-50 hover:bg-[#fff5e6] border border-stone-200 hover:border-[#2c1810] text-stone-700 hover:text-[#2c1810] transition-colors cursor-pointer disabled:opacity-50"
                >
                  ⚡ {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center Column (6 cols): Interactive Agent Workspace */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border-2 border-[#2c1810] rounded-2xl shadow-[5px_5px_0_#2c1810] flex flex-col h-[650px] overflow-hidden">
            {/* Chat Messages Transcript */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#fffdfa]">
              {messages.map((m) => {
                const isAssistant = m.role === 'assistant';
                const hasReasoning = Boolean(m.reasoning);
                const isReasoningOpen = Boolean(expandedReasoningMap[m.id]);

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-xs border-2 shadow-[2px_2px_0_#2c1810] space-y-2 ${
                        isAssistant
                          ? 'bg-white border-[#2c1810] text-[#2c1810]'
                          : 'bg-[#ff6b35] border-[#2c1810] text-white'
                      }`}
                    >
                      {/* Optional Chain of Thought / Reasoning Box */}
                      {hasReasoning && (
                        <div className="border border-stone-200 rounded-lg overflow-hidden bg-stone-50 text-stone-700">
                          <button
                            type="button"
                            onClick={() => toggleReasoning(m.id)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold text-stone-500 hover:bg-stone-100 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Bot className="w-3.5 h-3.5 text-[#ff6b35]" />
                              Reasoning / Chain-of-Thought
                            </span>
                            {isReasoningOpen ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isReasoningOpen && (
                            <div className="p-2.5 text-[11px] font-mono whitespace-pre-wrap border-t border-stone-200 bg-stone-100/50 text-stone-600">
                              {m.reasoning}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tool Call Tags if present */}
                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="space-y-1">
                          {m.toolCalls.map((tc) => (
                            <div
                              key={tc.id}
                              className="text-[10px] font-mono px-2 py-1 rounded bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] flex items-center justify-between"
                            >
                              <span className="font-bold">⚡ Tool: {tc.name}</span>
                              <span
                                className={`font-black uppercase ${
                                  tc.status === 'success'
                                    ? 'text-emerald-700'
                                    : tc.status === 'pending_confirmation'
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {tc.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                    <span className="text-[10px] text-stone-400 mt-1 px-1">
                      {new Date(m.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}

              {/* Busy Thinking Indicator */}
              {isBusy && (
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35] bg-[#fff5e6] border-2 border-[#2c1810] p-3 rounded-2xl max-w-[280px] shadow-[2px_2px_0_#2c1810] animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Omnigent sedang bernalar & mengeksekusi...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Composer */}
            <div className="p-3 border-t-2 border-[#2c1810] bg-white space-y-2">
              <div className="relative flex items-center gap-2">
                <textarea
                  rows={2}
                  value={inputText}
                  disabled={isBusy}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  placeholder={`Bicara atau perintahkan ${activeSkill.name}... (Enter untuk kirim)`}
                  className="w-full text-xs p-2.5 pr-20 border-2 border-[#2c1810] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#ff6b35] bg-stone-50"
                />

                <div className="absolute right-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(
                        'Pindai folder Downloads/MetaGen_Flow dan periksa kelayakan QC file terakhir.'
                      );
                    }}
                    className="p-1.5 text-stone-400 hover:text-[#ff6b35] transition-colors rounded cursor-pointer"
                    title="Isi contoh instruksi"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!inputText.trim() || isBusy}
                    onClick={() => handleSendPrompt()}
                    className="w-8 h-8 rounded-lg bg-[#ff6b35] border-2 border-[#2c1810] flex items-center justify-center text-white disabled:opacity-40 cursor-pointer shadow-[1px_1px_0_#2c1810] active:translate-y-0.5 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (3 cols): Live Activity & Telemetry Monitor */}
        <div className="lg:col-span-3 space-y-4">
          {/* Bridge Status Card */}
          <div className="bg-white border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-stone-100">
              <span className="text-xs font-black uppercase tracking-wider text-[#2c1810] flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#ff6b35]" />
                Local Bridge (:45678)
              </span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  bridgeStatus.online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
            </div>

            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Status Server:</span>
                <span className="font-bold">{bridgeStatus.online ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">ExifTool Engine:</span>
                <span className="font-bold">{bridgeStatus.online ? 'Siap' : 'Menunggu'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">FTP Multi-Upload:</span>
                <span className="font-bold">{bridgeStatus.online ? 'Aktif' : 'Standby'}</span>
              </div>
            </div>

            <button
              onClick={checkBridge}
              className="w-full py-1.5 text-xs font-bold border border-[#2c1810] rounded-lg bg-stone-50 hover:bg-[#fff5e6] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3 text-[#ff6b35]" />
              <span>Tes Koneksi Bridge</span>
            </button>
          </div>

          {/* Live Activity Stream */}
          <div className="bg-white border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-stone-100">
              <span className="text-xs font-black uppercase tracking-wider text-[#2c1810] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#ff6b35]" />
                Live Activity Journal
              </span>
              <span className="text-[10px] text-stone-400 font-bold">{activities.length} Event</span>
            </div>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <div className="text-center py-6 text-stone-400 text-xs">
                  Belum ada aktivitas. Perintahkan agen untuk melihat telemetri.
                </div>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-2 rounded-lg bg-stone-50 border border-stone-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#2c1810] truncate max-w-[170px]">
                        {act.title}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {new Date(act.timestamp).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    {act.details && (
                      <p className="text-[11px] text-stone-500 font-mono truncate">{act.details}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Key Pool Management Modal */}
      <KeyPoolModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onKeysUpdated={() => {
          // Trigger re-render of key counts
        }}
      />
    </div>
  );
}
