'use client';

import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import type { Provider } from '@/lib/types';

interface ProviderCardProps {
  model: string;
  gasProxyModels?: string[];
  onModelChange: (model: string) => void;
  // Optional props for backward compatibility
  provider?: string;
  apiKey?: string;
  openaiModels?: string[];
  geminiModels?: string[];
  onProviderChange?: (provider: Provider) => void;
  onApiKeyChange?: (key: string) => void;
  onSaveApiKey?: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  auto: 'Auto: Tercepat & Auto-Failover (Direkomendasikan)',
  'gemini-2.5-flash': 'Google Gemini (gemini-2.5-flash - Paling Stabil)',
  'deepseek-v4.1-flash:free': 'TokenHarbor (DeepSeek V4.1 Flash - Vision)',
  'mimo-v2.6-flash:free': 'TokenHarbor (MiMo V2.6 Flash - Vision)',
  'google/gemini-2.0-flash-001': 'OpenRouter (Gemini 2.0 Flash - Vision)',
  'openrouter/auto': 'OpenRouter (Auto Router)',
  'qwen/qwen3.8-27b': 'Groq (qwen/qwen3.8-27b - Ultra Cepat)',
  'pixtral-12b-2409': 'Mistral AI (pixtral-12b-2409 - Vision)',
  'mistralai/mistral-large-3-675b-instruct-2512': 'Nvidia NIM (mistral-large-3-675b)',
  'mistralai/ministral-14b': 'xKiro (ministral-14b)',
  'sensenova/sensenova-6.8-flash-lite': 'xKiro (sensenova-6.8-flash-lite)',
};

function ProviderCardComponent({
  model,
  gasProxyModels = [],
  onModelChange,
}: ProviderCardProps) {
  const models = gasProxyModels.length > 0 ? gasProxyModels : Object.keys(MODEL_LABELS);

  return (
    <div className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl overflow-hidden">
      <div className="bg-[#fff5e6] border-b-2 border-[#2c1810] px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 font-bold text-[#2c1810] text-sm">
          <Sparkles className="w-4 h-4 text-[#ff6b35]" />
          <span>Target AI Model</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        <Label className="text-xs uppercase tracking-wider font-bold text-[#6b5344]">Pilih Model AI</Label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-11 shadow-[2px_2px_0_#2c1810] focus:ring-0 focus:outline-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[4px_4px_0_#2c1810]">
            {models.map((m) => (
              <SelectItem key={m} value={m} className="font-medium focus:bg-[#fff5e6] focus:text-[#2c1810]">
                {MODEL_LABELS[m] || m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#6b5344] leading-relaxed pt-1">
          Cluster 1 & 2 bergantian otomatis di server. Jika salah satu kuota limit atau error, sistem otomatis failover seketika tanpa gagal.
        </p>
      </div>
    </div>
  );
}

export const ProviderCard = memo(ProviderCardComponent);

