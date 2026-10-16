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
import { getRandomCuratedIdeas, type InspirationIdea } from './inspirations';

export interface GeneratePromptsParams {
  mode: VCPAMode;
  brief: string;
  imageDataUrl?: string;
  visualDna?: VisualDNAProfile;
  settings: VCPASettings;
  provider?: Provider;
  model?: string;
  apiKey?: string;
  onProgressStep?: (step: string) => void;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3, backoffMs = 600): Promise<T> {
  let last: unknown;
  for (let t = 0; t < tries; t++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      if (t < tries - 1) await new Promise((r) => setTimeout(r, backoffMs * (t + 1)));
    }
  }
  throw last;
}

export async function executeVCPAGeneration(
  params: GeneratePromptsParams
): Promise<VCPAResult> {
  const { mode, brief, imageDataUrl, visualDna, settings, provider = 'gas-proxy', model = 'auto', onProgressStep } = params;
  const apiKey = params.apiKey || getApiKey(provider);

  // In Mode 2 (text_ideation), strictly clear image reference & visual DNA
  const effectiveImageDataUrl = mode === 'reference_to_prompt' ? imageDataUrl : undefined;
  const effectiveVisualDna = mode === 'reference_to_prompt' ? visualDna : undefined;

  onProgressStep?.(
    mode === 'reference_to_prompt'
      ? 'Menganalisis Visual DNA & Fitur Citra Referensi...'
      : 'Membedah Brief & Membangun Creative Space...'
  );

  const instruction = buildVCPAPromptInstruction({
    mode,
    brief,
    visualDna: effectiveVisualDna,
    settings,
  });

  let responseData: { visualDna?: VisualDNAProfile; prompts?: Array<Record<string, unknown>> } | null = null;

  try {
    onProgressStep?.(`Menghubungi AI Engine (${model === 'auto' ? 'Auto-Failover' : model})...`);
    const res = await withRetry(
      () =>
        fetch('/api/generate/prompt-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            brief,
            imageDataUrl: effectiveImageDataUrl,
            settings,
            apiKey: apiKey || undefined,
            provider,
            model,
            instruction,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const errText = await r.text();
            throw new Error(`HTTP ${r.status}: ${errText.slice(0, 200)}`);
          }
          return r;
        }),
      3,
      800
    );

    responseData = await res.json();
  } catch {
    // Fallback: If dedicated route encounters issues, call unified proxy directly
    onProgressStep?.('Menghubungkan via Fallback AI Proxy...');

    const fallbackUrl = provider === 'openai' ? '/api/generate/openai' : '/api/generate/proxy';
    const fallbackRes = await withRetry(
      () =>
        fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            model: model || 'auto',
            instruction,
            imageDataUrl: effectiveImageDataUrl,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const errBody = await r.text();
            throw new Error(`Fallback HTTP ${r.status}: ${errBody.slice(0, 150)}`);
          }
          return r;
        }),
      2,
      1000
    );

    const proxyData: Record<string, unknown> = await fallbackRes.json();
    const rawText =
      (typeof proxyData.output === 'string' && proxyData.output) ||
      (typeof proxyData.result === 'string' && proxyData.result) ||
      JSON.stringify(proxyData);
    responseData = extractJsonFromText(rawText) as {
      visualDna?: VisualDNAProfile;
      prompts?: Array<Record<string, unknown>>;
    };
  }

  if (!responseData || (!Array.isArray(responseData.prompts) && typeof responseData !== 'object')) {
    throw new Error('Format output AI tidak valid atau respons kosong.');
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
  model = 'auto',
  customApiKey?: string
): Promise<PromptCardItem> {
  const apiKey = customApiKey || getApiKey(provider);

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
  "rationale": "One concise sentence explaining visual thesis",
  "tags": ["fresh", "alternative"]
}`;

  const res = await withRetry(
    () =>
      fetch('/api/generate/prompt-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text_ideation',
          brief: `Alternative for ${cardToReplace.title}`,
          settings: { ...settings, count: 1 },
          apiKey: apiKey || undefined,
          provider,
          model,
          instruction,
        }),
      }).then(async (r) => {
        if (!r.ok) {
          const errText = await r.text();
          throw new Error(`HTTP ${r.status}: ${errText.slice(0, 150)}`);
        }
        return r;
      }),
    2,
    600
  );

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

export async function brainstormBriefIdeas(
  seedTopic?: string,
  count = 10,
  provider: Provider = 'gas-proxy',
  model = 'auto',
  customApiKey?: string
): Promise<InspirationIdea[]> {
  const apiKey = customApiKey || getApiKey(provider);
  const topicQuery = seedTopic?.trim();
  const safeCount = Math.max(3, Math.min(count, 30));

  const instruction = `You are a world-class creative director for commercial microstock photography.
TASK: Brainstorm ${safeCount} fresh, high-demand, high-commercial-value stock photography concept briefs ${
    topicQuery ? `specifically expanding and exploring unique angles of the topic: "${topicQuery}"` : 'based on currently trending visual themes in global advertising'
  }.

STRICT FORMAT REQUIREMENTS:
Output ONLY a JSON object with an "ideas" array containing exactly ${safeCount} items:
{
  "ideas": [
    {
      "title": "Short Catchy Indonesian Title (2-4 words, e.g. 'Pekerja Konstruksi Cerdas')",
      "category": "Broad Category (e.g. 'Bisnis & Karir' or 'Gaya Hidup')",
      "brief": "Rich English visual description for image generation describing subject, setting, natural lighting, candid mood, clean copy space (1-2 sentences)."
    }
  ]
}
Do NOT include markdown backticks or explanations. Output pure JSON only.`;

  try {
    const res = await withRetry(
      () =>
        fetch('/api/generate/prompt-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'text_ideation',
            brief: topicQuery || 'Commercial stock brainstorm',
            apiKey: apiKey || undefined,
            provider,
            model,
            instruction,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const errText = await r.text();
            throw new Error(`HTTP ${r.status}: ${errText.slice(0, 150)}`);
          }
          return r;
        }),
      2,
      600
    );

    const data = (await res.json()) as { ideas?: Array<Record<string, unknown>> } & Record<string, unknown>;
    const rawIdeas = Array.isArray(data.ideas) ? data.ideas : [];
    if (rawIdeas.length > 0) {
      return rawIdeas.map((item, idx) => ({
        id: `ai-idea-${nanoid()}`,
        title: (typeof item.title === 'string' && item.title) || `Ide AI #${idx + 1}`,
        brief:
          (typeof item.brief === 'string' && item.brief) ||
          'Modern high-commercial stock visual concept with authentic lighting and clean background.',
        category: (typeof item.category === 'string' && item.category) || 'Ide AI',
        isAiGenerated: true,
      }));
    }
  } catch (err) {
    console.warn('[Brainstorm AI Warning] Fallback to curated pool:', err);
  }

  // Graceful fallback to curated pool if AI call times out or errors
  return getRandomCuratedIdeas(safeCount).map((item) => ({ ...item, isAiGenerated: false }));
}

