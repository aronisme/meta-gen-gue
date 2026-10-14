'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  Hash,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cleanKeywords, parseKeywords } from '@/lib/keywords';

export interface KeywordResearchViewProps {
  onSwitchToMetadata?: () => void;
}

const TRENDING_TOPICS = [
  { topic: 'Artificial Intelligence', tags: 'artificial intelligence, machine learning, deep learning, neural network, automation, robotics, algorithm, data analysis, future technology, digital transformation, cloud computing, cyber security, innovation, high tech, futuristic, business intelligence, generative ai, modern computer, smart software, analytics' },
  { topic: 'Green Renewable Energy', tags: 'renewable energy, solar panel, clean energy, photovoltaic, sustainability, ecology, environmental conservation, green technology, alternative power, electricity, sunny rooftop, eco friendly, zero emission, climate solution, solar cell, clean power generation, modern technician, sustainable future, blue sky, earth care' },
  { topic: 'Healthcare & Telemedicine', tags: 'healthcare, telemedicine, digital health, doctor, medical exam, stethoscope, tablet computer, modern clinic, patient care, medical technology, health professional, wellness, diagnosis, hospital, online consultation, female physician, sterile environment, clinical specialist, medical service, biotechnology' },
  { topic: 'Remote Work & Lifestyle', tags: 'remote work, work from home, digital nomad, modern workspace, laptop, freelance, video conference, business professional, coffee cup, wooden desk, home office, connectivity, productivity, casual lifestyle, indoor workplace, communication, online meeting, balanced life, entrepreneur, modern career' },
];

export function KeywordResearchView({ onSwitchToMetadata }: KeywordResearchViewProps) {
  const [query, setQuery] = useState('');
  const [keywords, setKeywords] = useState<string[]>(
    parseKeywords('stock photography, commercial asset, authentic lifestyle, creative concept, high resolution, marketing copy space, professional portfolio')
  );
  const [newTagInput, setNewTagInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate suggested tags based on query
  const handleSearch = (searchTerm?: string) => {
    const term = (searchTerm || query).trim().toLowerCase();
    if (!term) {
      toast.error('Masukkan topik atau kata kunci untuk riset.');
      return;
    }

    // Match or synthesize microstock tags
    const matched = TRENDING_TOPICS.find((t) => t.topic.toLowerCase().includes(term));
    let baseList: string[] = [];

    if (matched) {
      baseList = parseKeywords(matched.tags);
    } else {
      // General synthesis for any term
      baseList = [
        term,
        `${term} concept`,
        `${term} technology`,
        `${term} professional`,
        `${term} business`,
        'modern',
        'commercial',
        'authentic',
        'lifestyle',
        'high angle',
        'copy space',
        'horizontal',
        'full length',
        'daylight',
        'natural',
        'innovation',
        'people',
        'success',
        'abstract background',
        'creative composition',
      ];
    }

    const cleaned = cleanKeywords(baseList.join(', '), 40);
    setKeywords(parseKeywords(cleaned));
    toast.success(`Menemukan ${parseKeywords(cleaned).length} kata kunci relevan untuk "${term}"!`);
  };

  const handleAddCustomTag = () => {
    const tag = newTagInput.trim().toLowerCase();
    if (!tag) return;
    if (keywords.includes(tag)) {
      toast.info(`Kata kunci "${tag}" sudah ada di daftar.`);
      return;
    }
    setKeywords([...keywords, tag]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setKeywords(keywords.filter((t) => t !== tagToRemove));
  };

  const handleClearAll = () => {
    if (confirm('Kosongkan semua kata kunci?')) {
      setKeywords([]);
    }
  };

  const commaSeparated = useMemo(() => keywords.join(', '), [keywords]);

  const handleCopy = () => {
    if (!keywords.length) {
      toast.error('Belum ada kata kunci untuk disalin.');
      return;
    }
    void navigator.clipboard.writeText(commaSeparated);
    setCopied(true);
    toast.success(`${keywords.length} kata kunci disalin ke clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  // Optimal microstock tag count meter (30 - 50 keywords is ideal)
  const countStatus = useMemo(() => {
    const count = keywords.length;
    if (count < 20) return { label: 'Terlalu Sedikit (<20)', color: 'text-amber-700 bg-amber-50 border-amber-300' };
    if (count <= 50) return { label: 'Optimal (25-50 Tag)', color: 'text-emerald-800 bg-emerald-50 border-emerald-300' };
    return { label: 'Mendekati Batas Maksimal (>50)', color: 'text-red-800 bg-red-50 border-red-300' };
  }, [keywords.length]);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Search className="w-6 h-6 text-[#ff6b35]" />
              <span>Keyword Research & Trend Explorer</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[1px_1px_0_#2c1810]">
              SEO Microstock 2026
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Riset dan temukan kata kunci komersial dengan volume pencarian tinggi serta penyaring kata subjektif terlarang untuk Adobe Stock, Shutterstock, dan Freepik.
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

      {/* 2. Search & Niche Query Input Bar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[6px_6px_0_#2c1810] space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ketik topik atau niche microstock (misal: 'Solar energy', 'Artificial intelligence', 'Doctor clinic')..."
              className="pl-10 h-11 bg-white border-2 border-[#2c1810] text-sm font-bold shadow-[2px_2px_0_#2c1810]"
            />
          </div>
          <Button
            type="button"
            onClick={() => handleSearch()}
            className="w-full sm:w-auto h-11 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-6 cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 mr-1.5" />
            Eksplorasi Keyword
          </Button>
        </div>

        {/* Quick Trending Suggestions */}
        <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
          <span className="font-bold text-[#6b5344]">Tren Populer 2026:</span>
          {TRENDING_TOPICS.map((t) => (
            <button
              key={t.topic}
              type="button"
              onClick={() => {
                setQuery(t.topic);
                handleSearch(t.topic);
              }}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#fff5e6] text-[#2c1810] border border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all"
            >
              🔥 {t.topic}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Keyword Basket & Tag Cloud Area */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[6px_6px_0_#2c1810] space-y-4">
        {/* Toolbar Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#2c1810] gap-3">
          <div className="flex items-center gap-2.5">
            <Tag className="w-4 h-4 text-[#ff6b35]" />
            <h3 className="font-black text-sm text-[#2c1810]">
              Daftar Tag Microstock Terpilih ({keywords.length})
            </h3>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${countStatus.color}`}>
              {countStatus.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={keywords.length === 0}
              className="h-8 bg-white hover:bg-red-50 text-red-700 border border-[#2c1810] text-xs font-bold px-2.5 shadow-[1px_1px_0_#2c1810] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Hapus Semua
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              disabled={keywords.length === 0}
              className="h-8 bg-[#ff6b35] hover:bg-[#e55a2b] text-white border border-[#2c1810] text-xs font-black px-3.5 shadow-[2px_2px_0_#2c1810] cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Salin Semua Tag ({keywords.length})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Add Custom Tag Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Hash className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTag()}
              placeholder="Tambah kata kunci custom..."
              className="pl-8 h-8.5 bg-white border-2 border-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810]"
            />
          </div>
          <Button
            type="button"
            onClick={handleAddCustomTag}
            className="h-8.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] border-2 border-[#2c1810] font-black text-xs px-3 shadow-[1px_1px_0_#2c1810] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Tambah
          </Button>
        </div>

        {/* Tag Cloud Pills */}
        <div className="bg-white border-2 border-[#2c1810] rounded-xl p-4 shadow-[2px_2px_0_#2c1810] min-h-[140px] flex flex-wrap gap-2 items-start">
          {keywords.length === 0 ? (
            <div className="text-center w-full py-8 text-stone-400 text-xs">
              Belum ada kata kunci. Ketik topik di atas atau klik salah satu tren populer.
            </div>
          ) : (
            keywords.map((kw, idx) => (
              <span
                key={`${kw}-${idx}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#fff5e6] border border-[#2c1810] text-[#2c1810] text-xs font-bold shadow-[1px_1px_0_#2c1810] group"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(kw)}
                  className="w-3.5 h-3.5 text-stone-400 hover:text-red-600 rounded flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Text Preview Display */}
        {keywords.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-black text-[#2c1810]">
              Format Raw CSV (Comma-Separated):
            </Label>
            <div className="bg-stone-50 border border-stone-300 rounded-xl p-3 font-mono text-[11px] text-stone-700 leading-relaxed select-all max-h-24 overflow-y-auto">
              {commaSeparated}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
