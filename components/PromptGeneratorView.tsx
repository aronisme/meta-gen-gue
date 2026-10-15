'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  ImageIcon,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { resizeImageToMax1024 } from '@/lib/resize';
import {
  CREATIVE_FOCUS_LABELS,
  ENGINE_LABELS,
  exportPromptsToJson,
  exportPromptsToText,
  formatPromptForEngine,
} from '@/lib/prompt-agent/engine';
import { executeVCPAGeneration, regenerateSinglePromptCard } from '@/lib/prompt-agent/client';
import type {
  AspectRatio,
  CreativeFocus,
  EngineType,
  PromptCardItem,
  SemanticMode,
  VCPAMode,
  VCPASettings,
  VisualDirection,
  VisualDNAProfile,
} from '@/lib/prompt-agent/types';
import type { Provider } from '@/lib/types';

export interface PromptGeneratorViewProps {
  onSwitchToMetadata?: () => void;
  model?: string;
  onModelChange?: (model: string) => void;
  gasProxyModels?: string[];
  provider?: Provider;
  apiKey?: string;
}

const MODEL_LABELS: Record<string, string> = {
  auto: 'Auto: Tercepat & Auto-Failover',
  'gemini-2.5-flash': 'Google Gemini (gemini-2.5-flash)',
  'qwen/qwen3.8-27b': 'Groq (qwen/qwen3.8-27b)',
  'pixtral-12b-2409': 'Mistral AI (pixtral-12b-2409)',
  'mistralai/mistral-large-3-675b-instruct-2512': 'Nvidia NIM (mistral-large-3-675b)',
  'mistralai/ministral-14b': 'xKiro (ministral-14b)',
  'sensenova/sensenova-6.8-flash-lite': 'xKiro (sensenova-6.8-flash-lite)',
};

const STORAGE_KEY_PROMPTS = 'vcpa_prompts_v1';
const STORAGE_KEY_SETTINGS = 'vcpa_settings_v1';
const STORAGE_KEY_DNA = 'vcpa_dna_v1';

const QUICK_INSPIRATION_TEMPLATES = [
  {
    title: 'Pekerja Profesional & AI',
    brief: 'Asian female data scientist collaborating with futuristic holographic analytics in a bright glass modern office, candid smile, commercial lifestyle',
  },
  {
    title: 'Energi Hijau Terbarukan',
    brief: 'Engineers in clean safety gear inspecting solar panel fields and wind turbines under dramatic sunset clouds, sustainable technology',
  },
  {
    title: 'Produk Mewah Minimalis',
    brief: 'Luxury organic skincare glass bottle on wet volcanic stone with gentle water ripples, dramatic side lighting, negative space',
  },
  {
    title: 'Kuliner & Artisan Kopi',
    brief: 'Barista pouring hot water over fresh artisanal coffee filter, steam rising in rustic cafe morning light, macro bean textures',
  },
  {
    title: 'Kesehatan & Gaya Hidup',
    brief: 'Young man stretching in lush morning city park, natural sunlight flare, authentic candid athleticism, clean background',
  },
];

const VISUAL_DIRECTION_OPTIONS: Array<{ id: VisualDirection; label: string; desc: string }> = [
  { id: 'photorealistic', label: 'Foto Komersial (Stock Photo)', desc: 'Sony A7R V, 85mm f/1.4, tekstur natural 8K' },
  { id: 'editorial', label: 'Editorial & High Fashion', desc: 'Pencahayaan terkontrol, estetika majalah premium' },
  { id: '3d_render', label: '3D Render & Clay', desc: 'Blender Cycles, ambient occlusion halus, modern' },
  { id: 'vector', label: 'Vektor & Flat Design', desc: 'Scalable graphic, tepi tajam, palet modern' },
  { id: 'cinematic', label: 'Sinematik 4K Still', desc: 'Anamorphic lens flare, film color grading' },
];

export function PromptGeneratorView({
  onSwitchToMetadata,
  model = 'auto',
  onModelChange,
  gasProxyModels = [],
  provider = 'gas-proxy',
  apiKey,
}: PromptGeneratorViewProps) {
  const models = gasProxyModels.length > 0 ? gasProxyModels : Object.keys(MODEL_LABELS);
  // 1. Generation Mode: reference_to_prompt vs text_ideation
  const [mode, setMode] = useState<VCPAMode>('reference_to_prompt');

  // 2. Input Reference State
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [refImageDataUrl, setRefImageDataUrl] = useState<string>('');
  const [brief, setBrief] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. Settings State
  const [settings, setSettings] = useState<VCPASettings>({
    count: 5,
    similarity: 60,
    engine: 'midjourney',
    visualDirection: 'photorealistic',
    aspectRatio: '16:9',
    creativeFocus: 'composition_lighting',
    semanticMode: 'meaning_preservation',
    commercialSafety: true,
    promptLanguage: 'en',
  });

  // 4. Output & Visual DNA State
  const [visualDna, setVisualDna] = useState<VisualDNAProfile | null>(null);
  const [isDnaExpanded, setIsDnaExpanded] = useState<boolean>(true);
  const [prompts, setPrompts] = useState<PromptCardItem[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  // Restore saved state from localStorage on initial render
  useEffect(() => {
    try {
      const savedPrompts = localStorage.getItem(STORAGE_KEY_PROMPTS);
      if (savedPrompts) {
        setPrompts(JSON.parse(savedPrompts));
      }
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(savedSettings) }));
      }
      const savedDna = localStorage.getItem(STORAGE_KEY_DNA);
      if (savedDna) {
        setVisualDna(JSON.parse(savedDna));
      }
    } catch {
      // ignore storage parse errors
    }
  }, []);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore storage error
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROMPTS, JSON.stringify(prompts));
    } catch {
      // ignore storage error
    }
  }, [prompts]);

  useEffect(() => {
    try {
      if (visualDna) {
        localStorage.setItem(STORAGE_KEY_DNA, JSON.stringify(visualDna));
      } else {
        localStorage.removeItem(STORAGE_KEY_DNA);
      }
    } catch {
      // ignore storage error
    }
  }, [visualDna]);

  // Handle Image Selection
  const handleSelectImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('File yang dipilih bukan gambar.');
      return;
    }
    try {
      setRefImageFile(file);
      const resized = await resizeImageToMax1024(file);
      setRefImageDataUrl(resized.dataUrl);
      toast.success(`Gambar referensi dimuat: ${file.name}`);
    } catch {
      toast.error('Gagal memproses gambar referensi.');
    }
  };

  const handleClearImage = () => {
    setRefImageFile(null);
    setRefImageDataUrl('');
    setVisualDna(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Main Generation Handler
  const handleGenerate = async () => {
    if (mode === 'reference_to_prompt' && !refImageDataUrl) {
      toast.error('Silakan unggah gambar referensi terlebih dahulu.');
      return;
    }
    if (mode === 'text_ideation' && !brief.trim()) {
      toast.error('Silakan isi arahan ide / brief konsep terlebih dahulu.');
      return;
    }

    setBusy(true);
    setProgressStep('Mempersiapkan pipeline AI...');

    try {
      const result = await executeVCPAGeneration({
        mode,
        brief,
        imageDataUrl: refImageDataUrl || undefined,
        settings,
        provider,
        model,
        apiKey,
        onProgressStep: (step) => setProgressStep(step),
      });

      setPrompts(result.prompts);
      if (result.visualDna) {
        setVisualDna(result.visualDna);
      }
      toast.success(`Berhasil menghasilkan ${result.completedCount} konsep prompt!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Gagal menghasilkan prompt: ${msg}`);
    } finally {
      setBusy(false);
      setProgressStep('');
    }
  };

  // Re-generate single card
  const handleRegenerateCard = async (card: PromptCardItem) => {
    setRegeneratingId(card.id);
    try {
      const newCard = await regenerateSinglePromptCard(
        card,
        prompts,
        settings,
        visualDna || undefined,
        provider,
        model,
        apiKey
      );
      setPrompts((prev) => prev.map((c) => (c.id === card.id ? newCard : c)));
      toast.success(`Konsep #${card.ordinal} diperbarui!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Gagal regenerasi: ${msg}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = (cardId: string) => {
    setPrompts((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isFavorite: !c.isFavorite } : c))
    );
  };

  // Edit card prompt text directly
  const handlePromptTextChange = (cardId: string, newText: string) => {
    setPrompts((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, prompt: newText, isEdited: true } : c))
    );
  };

  // Re-apply engine syntax when user changes engine or AR on existing batch
  const handleEngineChange = (newEngine: EngineType) => {
    setSettings((prev) => ({ ...prev, engine: newEngine }));
    if (prompts.length > 0) {
      setPrompts((prev) =>
        prev.map((card) => {
          const formatted = formatPromptForEngine(card.rawBasePrompt || card.prompt, {
            ...settings,
            engine: newEngine,
          });
          return {
            ...card,
            prompt: formatted.prompt,
            negativePrompt: formatted.negativePrompt,
          };
        })
      );
      toast.info(`Format sintaks diperbarui ke ${ENGINE_LABELS[newEngine]}`);
    }
  };

  const handleAspectRatioChange = (newAr: AspectRatio) => {
    setSettings((prev) => ({ ...prev, aspectRatio: newAr }));
    if (prompts.length > 0) {
      setPrompts((prev) =>
        prev.map((card) => {
          const formatted = formatPromptForEngine(card.rawBasePrompt || card.prompt, {
            ...settings,
            aspectRatio: newAr,
          });
          return {
            ...card,
            prompt: formatted.prompt,
          };
        })
      );
    }
  };

  // Copy Single Prompt
  const handleCopyCard = (card: PromptCardItem) => {
    void navigator.clipboard.writeText(card.prompt);
    setCopiedId(card.id);
    toast.success(`Prompt #${card.ordinal} disalin!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy All Prompts
  const handleCopyAll = () => {
    if (prompts.length === 0) return;
    const txt = exportPromptsToText(prompts, settings);
    void navigator.clipboard.writeText(txt);
    setCopiedAll(true);
    toast.success('Semua prompt berhasil disalin!');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Export TXT
  const handleExportTxt = () => {
    if (prompts.length === 0) return;
    const txt = exportPromptsToText(prompts, settings);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcpa_prompts_${settings.engine}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File TXT berhasil diunduh!');
  };

  // Export JSON
  const handleExportJson = () => {
    if (prompts.length === 0) return;
    const json = exportPromptsToJson(prompts, settings, visualDna || undefined);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcpa_prompts_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File JSON berhasil diunduh!');
  };

  // Clear all prompts
  const handleClearAll = () => {
    setPrompts([]);
    toast.info('Daftar prompt dibersihkan.');
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Header Banner */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-[#ff6b35]" />
              <span>Visual Concept Prompt Agent (VCPA)</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-[1px_1px_0_#2c1810]">
              Creative Intelligence v1.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Rancang ide visual komersial berbasis analisis referensi gambar atau brief bebas. Menghasilkan batch prompt beragam secara konseptual dengan anchor yang terjaga.
          </p>
        </div>

        {onSwitchToMetadata && (
          <Button
            type="button"
            variant="outline"
            onClick={onSwitchToMetadata}
            className="h-9.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 cursor-pointer self-start md:self-auto shrink-0"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-[#ff6b35]" />
            Buka Metadata Studio
          </Button>
        )}
      </div>

      {/* 2. Mode Selector Pill Bar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-xl p-1.5 shadow-[3px_3px_0_#2c1810] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('reference_to_prompt')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            mode === 'reference_to_prompt'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'text-[#6b5344] hover:bg-[#fff5e6]'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-[#ff6b35]" />
          <span>Mode 1: Dengan Image Reference (Visual DNA Remix)</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('text_ideation')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            mode === 'text_ideation'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'text-[#6b5344] hover:bg-[#fff5e6]'
          }`}
        >
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span>Mode 2: Tanpa Reference (Creative Brief Ideation)</span>
        </button>
      </div>

      {/* 3. Main Workspace Grid (Left Panel 5 cols, Right Panel 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Creator Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* AI Engine & Model Selector Card (Synced with Studio) */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase text-[#2c1810] flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#ff6b35]" />
                <span>Mesin AI (Sama dengan Studio Metadata)</span>
              </Label>
              <span className="text-[10px] font-black bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] px-2 py-0.5 rounded-full shadow-[1px_1px_0_#2c1810]">
                {provider === 'openai' ? 'OpenAI Direct' : 'GAS Proxy v3.1'}
              </span>
            </div>

            <Select value={model || 'auto'} onValueChange={onModelChange}>
              <SelectTrigger className="w-full bg-white border-2 border-[#2c1810] rounded-xl h-10 font-bold text-xs text-[#2c1810] shadow-[2px_2px_0_#2c1810]">
                <SelectValue placeholder="Pilih Model AI" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl">
                {models.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs font-bold py-2 cursor-pointer">
                    {MODEL_LABELS[m] || m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between text-[11px] text-[#6b5344] font-medium pt-0.5">
              <span>Failover: 2 Cluster Aktif</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Online & Terhubung
              </span>
            </div>
          </div>

          {/* A. Reference Image Dropzone (Active in Reference Mode) */}
          {mode === 'reference_to_prompt' && (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black uppercase text-[#2c1810] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#ff6b35]" />
                  <span>Gambar Referensi Visual (Anchor)</span>
                </Label>
                {refImageDataUrl && (
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                )}
              </div>

              {refImageDataUrl ? (
                <div className="relative rounded-xl border-2 border-[#2c1810] overflow-hidden bg-stone-100 p-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={refImageDataUrl}
                    alt="Reference preview"
                    className="w-20 h-20 object-cover rounded-lg border border-[#2c1810] shrink-0"
                  />
                  <div className="text-xs text-[#2c1810] space-y-1 min-w-0 flex-1">
                    <p className="font-bold truncate">{refImageFile?.name || 'Reference Image'}</p>
                    <p className="text-[11px] text-[#6b5344]">
                      {refImageFile ? `${(refImageFile.size / 1024).toFixed(0)} KB` : 'Siap dianalisis'}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-black text-[#ff6b35] hover:underline cursor-pointer block"
                    >
                      Ganti Gambar
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleSelectImage(f);
                  }}
                  className="border-2 border-dashed border-[#2c1810] rounded-xl p-6 text-center bg-white hover:bg-[#fff5e6] transition-colors cursor-pointer group space-y-2"
                >
                  <div className="w-10 h-10 rounded-full bg-[#fff5e6] border border-[#2c1810] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5 text-[#ff6b35]" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#2c1810]">
                      Seret gambar ke sini atau klik untuk memilih
                    </p>
                    <p className="text-[11px] text-[#6b5344] mt-0.5">
                      JPG, PNG, WEBP (otomatis dioptimasi ke 1024px)
                    </p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSelectImage(f);
                }}
              />
            </div>
          )}

          {/* B. Subject / Creative Brief Input */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
            <Label className="text-xs font-black uppercase text-[#2c1810] flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {mode === 'reference_to_prompt'
                  ? 'Instruksi Tambahan / Fokus Eksplorasi (Opsional)'
                  : 'Brief Konsep Utama (Subjek, Setting, Aksi)'}
              </span>
            </Label>
            <Textarea
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={
                mode === 'reference_to_prompt'
                  ? 'Contoh: Kembangkan konsep dengan pencahayaan golden hour, ubah sudut pandang ke low-angle hero shot, pertahankan nuansa kemewahan minimalis...'
                  : 'Contoh: Pekerja konstruksi wanita muda memegang blueprint di atas gedung pencakar langit modern berlatar langit senja cerah...'
              }
              className="border-2 border-[#2c1810] font-medium text-xs bg-white resize-none shadow-[2px_2px_0_#2c1810]"
            />

            {/* Quick Template Pills */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-[#6b5344] block">Inspirasi Cepat:</span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_INSPIRATION_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.title}
                    type="button"
                    onClick={() => {
                      setBrief(tmpl.brief);
                      toast.info(`Inspirasi "${tmpl.title}" diterapkan.`);
                    }}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] text-[11px] font-bold shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all"
                  >
                    ⚡ {tmpl.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* C. Generation Parameters Controls */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-4">
            {/* Target Engine & Aspect Ratio */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-[#2c1810]">Engine AI</Label>
                <div className="flex flex-col gap-1">
                  {(['midjourney', 'flux', 'sdxl'] as EngineType[]).map((eng) => (
                    <button
                      key={eng}
                      type="button"
                      onClick={() => handleEngineChange(eng)}
                      className={`py-1.5 px-2 rounded-lg border-2 text-left text-xs font-black cursor-pointer transition-all ${
                        settings.engine === eng
                          ? 'bg-[#2c1810] text-white border-[#2c1810] shadow-[2px_2px_0_#ff6b35]'
                          : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                      }`}
                    >
                      {eng === 'midjourney' ? 'Midjourney v6.1' : eng === 'flux' ? 'FLUX.1' : 'SDXL'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-black text-[#2c1810]">Proporsi (Ratio)</Label>
                <div className="grid grid-cols-2 gap-1">
                  {(['16:9', '3:2', '1:1', '4:3', '9:16'] as AspectRatio[]).map((ar) => (
                    <button
                      key={ar}
                      type="button"
                      onClick={() => handleAspectRatioChange(ar)}
                      className={`py-1.5 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all ${
                        settings.aspectRatio === ar
                          ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[1px_1px_0_#2c1810]'
                          : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prompt Count Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black text-[#2c1810]">Jumlah Prompt per Generasi</Label>
                <span className="text-[11px] font-black text-[#ff6b35] bg-[#fff5e6] px-2 py-0.5 rounded border border-[#2c1810]">
                  {settings.count} Prompt
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 5, 10, 20].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, count: cnt }))}
                    className={`py-1.5 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all ${
                      settings.count === cnt
                        ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                        : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Similarity Slider (Visible in Reference Mode) */}
            {mode === 'reference_to_prompt' && (
              <div className="space-y-1.5 p-3 bg-stone-50 border-2 border-stone-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-black text-[#2c1810]">
                  <span>Tingkat Kemiripan (Similarity)</span>
                  <span className="text-[#ff6b35]">{settings.similarity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.similarity}
                  onChange={(e) => setSettings((s) => ({ ...s, similarity: Number(e.target.value) }))}
                  className="w-full accent-[#ff6b35] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#6b5344] font-semibold">
                  <span>0% (Eksplorasi Liar)</span>
                  <span>50% (Seimbang)</span>
                  <span>100% (Sangat Mirip)</span>
                </div>
              </div>
            )}

            {/* Visual Direction / Style */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#2c1810]">Gaya Visual Utama</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {VISUAL_DIRECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, visualDirection: opt.id }))}
                    className={`p-2 rounded-lg border-2 text-left transition-all cursor-pointer ${
                      settings.visualDirection === opt.id
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                        : 'bg-white border-stone-200 hover:border-stone-400 font-semibold text-stone-700'
                    }`}
                  >
                    <span className="text-xs text-[#2c1810] block">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Creative Focus */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#2c1810]">Sumbu Fokus Kreatif (Axis)</Label>
              <div className="grid grid-cols-1 gap-1">
                {(Object.keys(CREATIVE_FOCUS_LABELS) as CreativeFocus[]).map((fId) => (
                  <button
                    key={fId}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, creativeFocus: fId }))}
                    className={`py-1.5 px-2.5 rounded-lg border-2 text-left text-xs transition-all cursor-pointer ${
                      settings.creativeFocus === fId
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-[#2c1810]'
                        : 'bg-white border-stone-200 hover:bg-stone-50 font-medium text-stone-700'
                    }`}
                  >
                    {CREATIVE_FOCUS_LABELS[fId]}
                  </button>
                ))}
              </div>
            </div>

            {/* Semantic Preservation Mode */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#2c1810]">Mode Preservasi Semantik</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'meaning_preservation', label: 'Makna / Tema', desc: 'Jaga pesan' },
                  { id: 'visual_replication', label: 'Ciri Visual', desc: 'Jaga bentuk' },
                  { id: 'free_ideation', label: 'Ideasi Bebas', desc: 'Eksplorasi total' },
                ].map((sm) => (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, semanticMode: sm.id as SemanticMode }))}
                    className={`p-1.5 rounded-lg border-2 text-center transition-all cursor-pointer ${
                      settings.semanticMode === sm.id
                        ? 'bg-[#2c1810] text-white border-[#2c1810] shadow-[1px_1px_0_#ff6b35] font-black'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-[#fff5e6] font-semibold'
                    }`}
                  >
                    <span className="text-[11px] block">{sm.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Commercial Safety Guardrail */}
            <div className="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-emerald-950 font-bold">
                  🛡️ Microstock Commercial Guardrails (Copy Space & Bebas Trademark)
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.commercialSafety}
                onChange={(e) => setSettings((s) => ({ ...s, commercialSafety: e.target.checked }))}
                className="w-4 h-4 accent-[#ff6b35] rounded cursor-pointer"
              />
            </div>
          </div>

          {/* D. Primary Generate Action Button */}
          <Button
            type="button"
            disabled={busy}
            onClick={handleGenerate}
            className="w-full h-12 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-sm border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{progressStep || 'Memproses Visual Concept Agent...'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Wand2 className="w-5 h-5" />
                <span>
                  Hasilkan {settings.count} Prompt Konseptual ({settings.engine.toUpperCase()})
                </span>
              </span>
            )}
          </Button>
        </div>

        {/* Right Column: Output & Visual DNA Feed (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* A. Visual DNA Profile Inspector (When available) */}
          {visualDna && (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
              <button
                type="button"
                onClick={() => setIsDnaExpanded((v) => !v)}
                className="w-full p-4 flex items-center justify-between bg-[#fff5e6] border-b-2 border-[#2c1810] font-black text-xs text-[#2c1810] cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#ff6b35]" />
                  <span>Visual DNA Profile (Hasil Analisis Citra Referensi)</span>
                </div>
                {isDnaExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isDnaExpanded && (
                <div className="p-4 space-y-3 text-xs bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                      <span className="font-black text-[#2c1810] block text-[11px] uppercase tracking-wide">
                        🔍 Observed (Fakta Visual):
                      </span>
                      <p className="text-[#6b5344] leading-relaxed">
                        {visualDna.observed.join(', ') || 'Subjek teramati'}
                      </p>
                    </div>

                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                      <span className="font-black text-[#2c1810] block text-[11px] uppercase tracking-wide">
                        💭 Inferred (Suasana & Tafsir):
                      </span>
                      <p className="text-[#6b5344] leading-relaxed">
                        {visualDna.inferred.join(', ') || 'Suasana komersial'}
                      </p>
                    </div>

                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <span className="font-black text-amber-950 block text-[11px] uppercase tracking-wide">
                        ⚓ Anchors (Elemen yang Dijaga):
                      </span>
                      <p className="text-amber-900 leading-relaxed">
                        {visualDna.anchors.join(', ') || 'Subjek utama'}
                      </p>
                    </div>

                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                      <span className="font-black text-blue-950 block text-[11px] uppercase tracking-wide">
                        🔄 Variables (Variabel yang Diubah):
                      </span>
                      <p className="text-blue-900 leading-relaxed">
                        {visualDna.editableVariables.join(', ') || 'Komposisi, sudut kamera, pencahayaan'}
                      </p>
                    </div>
                  </div>

                  {visualDna.semanticProfile?.coreTheme && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950">
                      <span className="font-black block text-[11px] uppercase tracking-wide mb-0.5">
                        💡 Tema & Pesan Konseptual:
                      </span>
                      <p className="font-medium text-xs">
                        {visualDna.semanticProfile.coreTheme}
                        {visualDna.semanticProfile.metaphor &&
                          ` (Metafora: ${visualDna.semanticProfile.metaphor.join(', ')})`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* B. Results Toolbar Header */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ff6b35]" />
              <h3 className="font-black text-sm text-[#2c1810]">
                Hasil Prompt Konseptual ({prompts.length} Siap Pakai)
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {prompts.length > 0 && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAll}
                    className="h-8 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] cursor-pointer shadow-[1px_1px_0_#2c1810]"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    <span>{copiedAll ? 'Tersalin!' : 'Salin Semua'}</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportTxt}
                    className="h-8 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] cursor-pointer shadow-[1px_1px_0_#2c1810]"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    <span>TXT</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportJson}
                    className="h-8 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] cursor-pointer shadow-[1px_1px_0_#2c1810]"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    <span>JSON</span>
                  </Button>

                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs text-stone-500 hover:text-red-600 font-bold ml-1 cursor-pointer"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          {/* C. Prompt Cards Feed */}
          {prompts.length === 0 ? (
            <div className="bg-[#fffdf9] border-2 border-dashed border-[#2c1810] rounded-2xl p-10 text-center shadow-[4px_4px_0_#2c1810] space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#fff5e6] border-2 border-[#2c1810] mx-auto flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-[#ff6b35]" />
              </div>
              <div>
                <h4 className="font-black text-sm text-[#2c1810]">Belum Ada Prompt Dihasilkan</h4>
                <p className="text-xs text-[#6b5344] max-w-sm mx-auto mt-1">
                  Pilih gambar referensi atau masukkan brief di panel kiri, lalu klik &quot;Hasilkan Prompt Konseptual&quot; untuk memulai eksplorasi AI.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {prompts.map((card) => {
                const isRegenerating = regeneratingId === card.id;
                const isCopied = copiedId === card.id;

                return (
                  <div
                    key={card.id}
                    className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3 transition-all hover:shadow-[5px_5px_0_#2c1810]"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b-2 border-stone-200 pb-2.5 gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-black text-xs text-[#2c1810] bg-[#fff5e6] border border-[#2c1810] px-2 py-0.5 rounded">
                          #{String(card.ordinal).padStart(2, '0')}
                        </span>
                        <h4 className="font-black text-sm text-[#2c1810] truncate">{card.title}</h4>
                        <span className="bg-stone-100 border border-stone-300 text-stone-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {card.creativeStrategy}
                        </span>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(card.id)}
                          className={`p-1.5 rounded-md border cursor-pointer transition-all ${
                            card.isFavorite
                              ? 'bg-amber-100 border-amber-400 text-amber-600'
                              : 'bg-white border-stone-200 hover:bg-stone-100 text-stone-400'
                          }`}
                          title="Tandai favorit"
                        >
                          <Star className={`w-3.5 h-3.5 ${card.isFavorite ? 'fill-amber-500' : ''}`} />
                        </button>

                        <button
                          type="button"
                          disabled={isRegenerating}
                          onClick={() => handleRegenerateCard(card)}
                          className="p-1.5 rounded-md bg-white hover:bg-[#fff5e6] border border-stone-200 text-[#2c1810] cursor-pointer transition-all disabled:opacity-50"
                          title="Regenerasi konsep ini saja"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin text-[#ff6b35]' : ''}`} />
                        </button>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleCopyCard(card)}
                          className="h-7 px-2.5 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-bold text-xs border border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="ml-1">{isCopied ? 'Tersalin' : 'Salin'}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Prompt Textarea Display (Inline Editable) */}
                    <div className="space-y-1">
                      <Textarea
                        rows={3}
                        value={card.prompt}
                        onChange={(e) => handlePromptTextChange(card.id, e.target.value)}
                        className="font-mono text-xs text-[#2c1810] leading-relaxed bg-white border-2 border-stone-300 rounded-xl resize-y"
                      />
                      {card.isEdited && (
                        <span className="text-[10px] text-amber-700 font-bold block">
                          ✎ Prompt telah diedit manual
                        </span>
                      )}
                    </div>

                    {/* Negative Prompt (SDXL Mode) */}
                    {card.negativePrompt && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl font-mono text-[11px] text-rose-950 space-y-0.5">
                        <span className="font-bold text-rose-800 block text-[10px] uppercase">
                          Negative Prompt:
                        </span>
                        <p className="select-all">{card.negativePrompt}</p>
                      </div>
                    )}

                    {/* Rationale & Tags */}
                    {card.rationale && (
                      <div className="text-[11px] text-[#6b5344] bg-[#fffdf9] p-2 rounded-lg border border-stone-200 leading-normal">
                        <span className="font-bold text-[#2c1810]">Konsep Rationale: </span>
                        {card.rationale}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
