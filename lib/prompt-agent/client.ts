import { nanoid } from 'nanoid';
import {
  buildVCPAPromptInstruction,
  extractJsonFromText,
  formatPromptForEngine,
  parseAndFormatPromptCards,
} from './engine';
import type {
  PromptCardItem,
  VCPAMode,
  VCPAResult,
  VCPASettings,
  VisualDNAProfile,
} from './types';
import { getApiKey } from '@/lib/store';
import type { Provider } from '@/lib/types';

export interface GeneratePromptsParams {
  mode: VCPAMode;
  brief: string;
  imageDataUrl?: string;
  settings: VCPASettings;
  provider?: Provider;
  model?: string;
  onProgressStep?: (step: string) => void;
}

export async function executeVCPAGeneration(
  params: GeneratePromptsParams
): Promise<VCPAResult> {
  const { mode, brief, imageDataUrl, settings, provider = 'gas-proxy', model = 'auto', onProgressStep } = params;
  const apiKey = getApiKey(provider);

  onProgressStep?.(
    mode === 'reference_to_prompt'
      ? 'Menganalisis Visual DNA & Fitur Referensi...'
      : 'Membedah Brief & Membangun Creative Space...'
  );

  const instruction = buildVCPAPromptInstruction({
    mode,
    brief,
    settings,
  });

  // Call /api/generate/prompt-agent with fallback to proxy
  let responseData: { visualDna?: VisualDNAProfile; prompts?: Array<Record<string, unknown>> } | null = null;

  try {
    const res = await fetch('/api/generate/prompt-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        brief,
        imageDataUrl,
        settings,
        apiKey,
        provider,
        model,
        instruction,
      }),
    });

    if (res.ok) {
      responseData = await res.json();
    } else {
      throw new Error(`Endpoint returned HTTP ${res.status}`);
    }
  } catch {
    // Fallback: If custom endpoint route fails or is offline, try direct call via standard proxy
    onProgressStep?.('Menghubungkan ke GAS AI Proxy (Direct Fallback)...');
    
    const proxyPayload: Record<string, unknown> = {
      model: model === 'auto' ? 'gemini-2.5-flash' : model,
      instruction,
    };
    if (imageDataUrl) {
      proxyPayload.imageDataUrl = imageDataUrl;
    }

    // Call standard proxy
    const proxyRes = await fetch('/api/generate/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload),
    });

    if (!proxyRes.ok) {
      throw new Error('Gagal menghubungi AI Provider. Periksa koneksi atau kuota API.');
    }

    const proxyData: Record<string, unknown> = await proxyRes.json();
    // Some proxies return { output: string } or { result: string } or raw json
    const rawText = (typeof proxyData.output === 'string' && proxyData.output) ||
      (typeof proxyData.result === 'string' && proxyData.result) ||
      JSON.stringify(proxyData);
    responseData = extractJsonFromText(rawText) as {
      visualDna?: VisualDNAProfile;
      prompts?: Array<Record<string, unknown>>;
    };
  }

  if (!responseData || (!Array.isArray(responseData.prompts) && typeof responseData !== 'object')) {
    throw new Error('Format output AI tidak valid.');
  }

  onProgressStep?.('Memformat sintaks prompt untuk ' + settings.engine.toUpperCase() + '...');

  const rawPrompts = Array.isArray(responseData.prompts) ? responseData.prompts : [];
  const formattedCards = parseAndFormatPromptCards(rawPrompts, settings);

  return {
    jobId: nanoid(),
    mode,
    visualDna: responseData.visualDna,
    requestedCount: settings.count,
    completedCount: formattedCards.length,
    failedCount: Math.max(0, settings.count - formattedCards.length),
    prompts: formattedCards,
  };
}

export async function regenerateSinglePromptCard(
  cardToReplace: PromptCardItem,
  existingCards: PromptCardItem[],
  settings: VCPASettings,
  visualDna?: VisualDNAProfile,
  provider: Provider = 'gas-proxy',
  model = 'auto'
): Promise<PromptCardItem> {
  const apiKey = getApiKey(provider);

  const existingTitles = existingCards
    .filter((c) => c.id !== cardToReplace.id)
    .map((c) => c.title)
    .join(', ');

  const instruction = `You are VCPA. The user wants to regenerate concept #${cardToReplace.ordinal}: "${cardToReplace.title}".
Existing concepts in the batch: [${existingTitles}].

TASK:
Provide a FRESH, high-impact alternative commercial prompt concept that does NOT repeat any of the existing concepts.
Ensure unique camera angle, lighting, and composition.

Output ONLY a JSON object:
{
  "ordinal": ${cardToReplace.ordinal},
  "title": "Fresh Title",
  "creativeStrategy": "Concept Expansion",
  "rawBasePrompt": "Full detailed base prompt in English...",
  "rationale": "Why this alternative was created...",
  "tags": ["fresh", "alternative"]
}`;

  const res = await fetch('/api/generate/prompt-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'text_ideation',
      brief: `Alternative for ${cardToReplace.title}`,
      settings: { ...settings, count: 1 },
      apiKey,
      provider,
      model,
      instruction,
    }),
  });

  if (!res.ok) {
    throw new Error('Gagal meregenerasi kartu.');
  }

  const data = (await res.json()) as { prompts?: Array<Record<string, unknown>> } & Record<string, unknown>;
  const rawItem = Array.isArray(data.prompts) && data.prompts[0] ? data.prompts[0] : data;
  const basePrompt =
    (typeof rawItem.rawBasePrompt === 'string' && rawItem.rawBasePrompt) ||
    (typeof rawItem.prompt === 'string' && rawItem.prompt) ||
    'Alternative commercial stock concept';
  const formatted = formatPromptForEngine(basePrompt, settings);

  return {
    ...cardToReplace,
    title: (typeof rawItem.title === 'string' && rawItem.title) || `Konsep Baru #${cardToReplace.ordinal}`,
    rawBasePrompt: basePrompt,
    prompt: formatted.prompt,
    negativePrompt: formatted.negativePrompt,
    creativeStrategy:
      (typeof rawItem.creativeStrategy === 'string' && rawItem.creativeStrategy) || 'Regenerated Variant',
    rationale:
      (typeof rawItem.rationale === 'string' && rawItem.rationale) ||
      'Konsep alternatif baru dengan sudut pandang berbeda.',
    isEdited: false,
  };
}
