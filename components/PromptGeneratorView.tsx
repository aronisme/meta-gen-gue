'use client';

import { useId, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Layers,
  Lightbulb,
  Maximize2,
  Palette,
  PenTool,
  RefreshCw,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export interface PromptGeneratorViewProps {
  onSwitchToMetadata?: () => void;
}

type MediumType = 'photo' | 'vector' | '3d' | 'cutout' | 'cinematic';
type EngineType = 'midjourney' | 'flux' | 'sdxl';
type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:2';

const MEDIUM_PRESETS: Record<MediumType, { name: string; suffix: string }> = {
  photo: {
    name: 'Foto Komersial (Stock Photo)',
    suffix: 'authentic commercial stock photography, candid expression, shot on Sony A7R V, 85mm f/1.4 lens, natural skin textures, 8k resolution',
  },
  vector: {
    name: 'Vektor / Ilustrasi Flat',
    suffix: 'clean vector illustration style, sharp edges, flat design, modern color palette, microstock asset, scalable graphic, high contrast',
  },
  '3d': {
    name: '3D Isometric Render',
    suffix: 'clean 3d isometric render, Blender Cycles, smooth plastic and clay materials, soft ambient occlusion, cute minimalist geometric shapes',
  },
  cutout: {
    name: 'Objek Terisolasi (White Cutout)',
    suffix: 'isolated on pure white background, studio product photography, clean drop shadow, commercial cutout asset, empty negative space',
  },
  cinematic: {
    name: 'Sinematik 4K Footage Still',
    suffix: 'cinematic 4k still frame from video footage, anamorphic lens flare, motion blur, arri alexa color science, dramatic film grading',
  },
};

const LIGHTING_PRESETS = [
  { id: 'softbox', label: 'Studio Softbox', desc: 'soft studio diffused lighting, no harsh shadows' },
  { id: 'golden', label: 'Golden Hour', desc: 'warm golden hour sunlight, soft lens flare, dusk glow' },
  { id: 'rim', label: 'Dramatic Rim Light', desc: 'dramatic rim lighting, edge glow, deep contrast' },
  { id: 'highkey', label: 'Commercial High-Key', desc: 'bright high-key commercial lighting, cheerful and clean' },
  { id: 'moody', label: 'Moody Ambient', desc: 'moody atmospheric indoor lighting, soft bokeh lights' },
];

const COMPOSITION_PRESETS = [
  { id: 'copyspace-right', label: 'Ruang Kosong Kanan', desc: 'ample copy space on the right side for text overlay' },
  { id: 'copyspace-left', label: 'Ruang Kosong Kiri', desc: 'ample copy space on the left side for text overlay' },
  { id: 'center', label: 'Subjek Terpusat', desc: 'centered symmetrical composition, commercial hero shot' },
  { id: 'flatlay', label: 'Top-Down Flat Lay', desc: 'top-down bird eye view, flat lay arrangement on surface' },
  { id: 'macro', label: 'Macro Close-Up', desc: 'extreme macro close-up, sharp fine details and textures' },
];

const QUICK_INSPIRATION_TEMPLATES = [
  {
    title: 'Pekerja Profesional & Teknologi',
    subject: 'Young Asian female data scientist smiling while analyzing holographic financial data charts in modern glass office',
  },
  {
    title: 'Gaya Hidup & Kebugaran Sehat',
    subject: 'Athletic man stretching outdoors in sunny city park during morning jog, holding reusable stainless steel water bottle',
  },
  {
    title: 'Energi Terbarukan Ramah Lingkungan',
    subject: 'Technician in safety helmet and reflective vest inspecting solar panel arrays on rooftop against clear blue sky',
  },
  {
    title: 'Kuliner & Makanan Segar',
    subject: 'Artisanal sourdough bread with rosemary and olive oil on rustic wooden cutting board, bakery background',
  },
];

export function PromptGeneratorView({ onSwitchToMetadata }: PromptGeneratorViewProps) {
  const [subject, setSubject] = useState('');
  const [medium, setMedium] = useState<MediumType>('photo');
  const [engine, setEngine] = useState<EngineType>('midjourney');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedLighting, setSelectedLighting] = useState<string>('softbox');
  const [selectedComposition, setSelectedComposition] = useState<string>('copyspace-right');
  const [includeNegativeKeywords, setIncludeNegativeKeywords] = useState(true);
  const [copied, setCopied] = useState(false);

  // Generate Prompt String
  const generatedPrompt = useMemo(() => {
    const cleanSubject = subject.trim() || 'Modern workspace with laptop, coffee mug, and green houseplant on wooden desk';
    const mediumSuffix = MEDIUM_PRESETS[medium].suffix;
    const lightingSuffix = LIGHTING_PRESETS.find((l) => l.id === selectedLighting)?.desc || '';
    const compSuffix = COMPOSITION_PRESETS.find((c) => c.id === selectedComposition)?.desc || '';

    const basePrompt = `${cleanSubject}, ${mediumSuffix}, ${lightingSuffix}, ${compSuffix}`;

    if (engine === 'midjourney') {
      const arFlag = `--ar ${aspectRatio}`;
      const qualityFlags = '--style raw --v 6.1';
      const noFlag = includeNegativeKeywords ? '--no watermark, text, logos, blurry, deformed hands, extra fingers' : '';
      return `${basePrompt} ${arFlag} ${qualityFlags} ${noFlag}`.trim();
    }

    if (engine === 'flux') {
      const negativePart = includeNegativeKeywords
        ? ' Highly commercial stock aesthetics, devoid of any unwanted watermark, brand trademarks, or text artifacts.'
        : '';
      return `${basePrompt}, aspect ratio ${aspectRatio}.${negativePart}`.trim();
    }

    // SDXL
    const sdNegative = includeNegativeKeywords
      ? '\nNegative prompt: watermark, signature, text, username, blurry, distorted, low quality, deformed hands'
      : '';
    return `${basePrompt}, highly detailed stock asset, masterwork, 8k${sdNegative}`.trim();
  }, [subject, medium, engine, aspectRatio, selectedLighting, selectedComposition, includeNegativeKeywords]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success('Prompt berhasil disalin ke clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyTemplate = (tmpl: { subject: string }) => {
    setSubject(tmpl.subject);
    toast.info(`Template "${tmpl.subject.slice(0, 30)}..." diterapkan.`);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-[#ff6b35]" />
              <span>Prompt Img Generator (Microstock AI)</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[1px_1px_0_#2c1810]">
              Midjourney • FLUX • SDXL
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Rancang prompt gambar AI komersial dengan parameter komposisi stock photography (copy space, pencahayaan, bebas watermark) yang siap diterima agensi microstock.
          </p>
        </div>

        {onSwitchToMetadata && (
          <Button
            type="button"
            variant="outline"
            onClick={onSwitchToMetadata}
            className="h-9.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 cursor-pointer self-start md:self-auto"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-[#ff6b35]" />
            Buka Metadata Studio
          </Button>
        )}
      </div>

      {/* 2. Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Generator Controls (7 Cols on LG) */}
        <div className="lg:col-span-7 bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[6px_6px_0_#2c1810] space-y-5">
          {/* Quick Inspiration Templates */}
          <div>
            <Label className="text-xs font-black uppercase text-[#2c1810] flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
              <span>Inspirasi Subjek Komersial Cepat:</span>
            </Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_INSPIRATION_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.title}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all truncate max-w-xs"
                >
                  ⚡ {tmpl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Subject / Action Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-[#2c1810]">
              Subjek Utama, Aksi & Latar Belakang (Bahasa Inggris atau Indonesia)
            </Label>
            <Textarea
              rows={3}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Contoh: Young confident female architect pointing at blueprint blueprints on conference table with colleagues in bright modern loft office..."
              className="border-2 border-[#2c1810] font-medium text-xs bg-white resize-none shadow-[2px_2px_0_#2c1810]"
            />
          </div>

          {/* Medium / Asset Style */}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-[#2c1810]">Tipe Aset & Gaya Media</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(MEDIUM_PRESETS) as MediumType[]).map((mId) => {
                const info = MEDIUM_PRESETS[mId];
                const isSelected = medium === mId;
                return (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => setMedium(mId)}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                        : 'bg-white border-stone-200 hover:border-stone-400 font-semibold'
                    }`}
                  >
                    <span className="text-xs text-[#2c1810] block">{info.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lighting Presets */}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-[#2c1810] flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Gaya Pencahayaan (Lighting)</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LIGHTING_PRESETS.map((light) => {
                const isSelected = selectedLighting === light.id;
                return (
                  <button
                    key={light.id}
                    type="button"
                    onClick={() => setSelectedLighting(light.id)}
                    className={`p-2 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                        : 'bg-white border-stone-200 hover:border-stone-400 font-semibold'
                    }`}
                  >
                    <span className="text-xs text-[#2c1810] block">{light.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Composition & Copy Space */}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-[#2c1810] flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#ff6b35]" />
              <span>Komposisi Stok & Copy Space (Ruang Teks)</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COMPOSITION_PRESETS.map((comp) => {
                const isSelected = selectedComposition === comp.id;
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => setSelectedComposition(comp.id)}
                    className={`p-2 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                        : 'bg-white border-stone-200 hover:border-stone-400 font-semibold'
                    }`}
                  >
                    <span className="text-xs text-[#2c1810] block">{comp.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Engine & Aspect Ratio Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Target AI Engine */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#2c1810]">Format Sintaks AI Engine</Label>
              <div className="flex items-center gap-1.5">
                {(['midjourney', 'flux', 'sdxl'] as EngineType[]).map((eng) => (
                  <button
                    key={eng}
                    type="button"
                    onClick={() => setEngine(eng)}
                    className={`flex-1 py-1.5 px-2 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all uppercase ${
                      engine === eng
                        ? 'bg-[#2c1810] text-white border-[#2c1810] shadow-[2px_2px_0_#ff6b35]'
                        : 'bg-white text-[#2c1810] border-stone-300 hover:bg-[#fff5e6]'
                    }`}
                  >
                    {eng === 'midjourney' ? 'Midjourney' : eng === 'flux' ? 'FLUX.1' : 'SDXL'}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#2c1810]">Aspect Ratio (Proporsi Gambar)</Label>
              <div className="flex items-center gap-1.5">
                {(['16:9', '3:2', '1:1', '4:3', '9:16'] as AspectRatio[]).map((ar) => (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => setAspectRatio(ar)}
                    className={`flex-1 py-1.5 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all ${
                      aspectRatio === ar
                        ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[1px_1px_0_#2c1810]'
                        : 'bg-white text-[#2c1810] border-stone-300 hover:bg-[#fff5e6]'
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Generated Prompt Preview & Copy Action (5 Cols on LG) */}
        <div className="lg:col-span-5 bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[6px_6px_0_#2c1810] space-y-4 lg:sticky lg:top-6">
          <div className="flex items-center justify-between border-b-2 border-[#2c1810] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ff6b35]" />
              <h3 className="font-black text-sm text-[#2c1810]">Hasil Prompt AI Siap Generate</h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-[#fff5e6] border border-[#2c1810] px-2 py-0.5 rounded">
              {engine.toUpperCase()} • {aspectRatio}
            </span>
          </div>

          {/* Generated Text Area Display */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-xl p-4 shadow-[3px_3px_0_#2c1810] font-mono text-xs text-[#2c1810] leading-relaxed select-all min-h-[220px] max-h-[360px] overflow-y-auto whitespace-pre-wrap">
            {generatedPrompt}
          </div>

          {/* Commercial Safety Feature Pill */}
          <div className="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between gap-2 text-xs">
            <span className="text-emerald-950 font-bold">
              🛡️ Anti-Watermark & Safe Commercial Modifier Aktif
            </span>
            <input
              type="checkbox"
              checked={includeNegativeKeywords}
              onChange={(e) => setIncludeNegativeKeywords(e.target.checked)}
              className="w-4 h-4 accent-[#ff6b35] rounded cursor-pointer"
            />
          </div>

          {/* Copy Button */}
          <Button
            type="button"
            onClick={handleCopy}
            className="w-full h-11 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-sm border-2 border-[#2c1810] shadow-[3px_3px_0_#2c1810] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"
          >
            {copied ? (
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                <span>Tersalin ke Clipboard!</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Copy className="w-5 h-5" />
                <span>Salin Prompt ({engine.toUpperCase()})</span>
              </span>
            )}
          </Button>

          {/* Guidance Tips */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-[#6b5344] space-y-1">
            <span className="font-bold text-[#2c1810] block">Tips Kontributor Microstock:</span>
            <p>
              Gunakan prompt ini langsung di Discord Midjourney, Web UI FLUX, atau generator favorit Anda. Gambar yang dihasilkan akan memiliki pencahayaan alami komersial dan ruang teks bersih sehingga mudah diterima review agensi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
