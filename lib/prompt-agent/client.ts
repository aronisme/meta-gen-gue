import { nanoid } from 'nanoid';
import {
  buildVCPAPromptInstruction,
  extractJsonFromText,
  formatPromptForEngine,
  normalizeVisualDna,
  parseAndFormatPromptCards,
} from './engine';
import type {
  ContextualTwistItem,
  PromptCardItem,
  VCPAMode,
  VCPAResult,
  VCPASettings,
  VisualDNAProfile,
} from './types';
import { getApiKey } from '@/lib/store';
import { getStoredUser } from '@/lib/auth/store';
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
            userEmail: getStoredUser()?.email,
            googleIdToken: getStoredUser()?.idToken,
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
            userEmail: getStoredUser()?.email,
            googleIdToken: getStoredUser()?.idToken,
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
  const normalizedDna = responseData.visualDna
    ? normalizeVisualDna(responseData.visualDna)
    : undefined;

  return {
    jobId: nanoid(),
    mode,
    visualDna: normalizedDna || undefined,
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
Ensure unique camera angle, lighting, and composition. If human subjects are naturally featured, ensure photogenic, attractive, and warm commercial appeal respecting the intended demographic (do not force humans if absent).

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

export const FALLBACK_STOCK_TWISTS: ContextualTwistItem[] = [
  {
    id: 'twist-flatlay',
    label: 'Flatlay & Copy Space',
    category: 'Sudut & Framing',
    modifierText: 'Overhead 90-degree flatlay tabletop composition with generous negative copy space for designer typography',
  },
  {
    id: 'twist-isolated',
    label: 'Studio Isolated on White',
    category: 'Setting & Iklan',
    modifierText: 'Clean commercial studio shot isolated on pure neutral white background with softbox lighting and soft contact shadow',
  },
  {
    id: 'twist-golden-hour',
    label: 'Golden Hour Rim Light',
    category: 'Pencahayaan',
    modifierText: 'Warm golden hour rim lighting, soft ambient sun flare, rich natural depth of field and warm color temperature',
  },
  {
    id: 'twist-macro',
    label: 'Macro Detail & Tekstur',
    category: 'Sudut & Framing',
    modifierText: 'Extreme macro close-up showcasing tactile surface textures, crisp focal plane, delicate natural lighting highlights',
  },
  {
    id: 'twist-lifestyle-candid',
    label: 'Candid Lifestyle Moment',
    category: 'Emosi & Narasi',
    modifierText: 'Authentic candid lifestyle interaction, genuine human touch, modern contemporary setting with soft daylight',
  },
  {
    id: 'twist-cinematic-night',
    label: 'Sinematik Blue Hour',
    category: 'Pencahayaan',
    modifierText: 'Atmospheric blue hour twilight, subtle warm tungsten accent lighting, high dynamic range cinematic color grading',
  },
  {
    id: 'twist-editorial-minimal',
    label: 'Minimalist Editorial',
    category: 'Komposisi',
    modifierText: 'Sophisticated minimalist art direction, architectural negative space, muted refined color palette, museum quality',
  },
  {
    id: 'twist-hero-banner',
    label: 'Hero Advertising Banner',
    category: 'Komersial',
    modifierText: 'Wide panoramic commercial advertising composition with intentional clean side space reserved for corporate headline',
  },
];

export async function generateContextualTwists(params: {
  imageDataUrl?: string;
  visualDna?: VisualDNAProfile;
  currentBrief?: string;
  count?: number;
  provider?: Provider;
  model?: string;
  customApiKey?: string;
}): Promise<ContextualTwistItem[]> {
  const {
    imageDataUrl,
    visualDna,
    currentBrief,
    count = 6,
    provider = 'gas-proxy',
    model = 'auto',
    customApiKey,
  } = params;

  const apiKey = customApiKey || getApiKey(provider);
  const safeCount = Math.max(4, Math.min(count, 12));

  let dnaContext = '';
  if (visualDna) {
    const safeDna = normalizeVisualDna(visualDna) || visualDna;
    dnaContext = `Visual elements detected in image:
- Subject: ${safeDna.subject?.type || 'Subject'} (${(safeDna.subject?.attributes || []).join(', ')})
- Observed: ${(safeDna.observed || []).slice(0, 5).join(', ')}
- Core anchors: ${(safeDna.anchors || []).slice(0, 4).join(', ')}
- Theme: ${safeDna.semanticProfile?.coreTheme || ''}`;
  }

  const instruction = `You are a world-class creative director for commercial microstock photography and illustrations (Adobe Stock, Freepik).
The user has attached an image reference to create commercial prompt variations.

${dnaContext}
${currentBrief ? `User's current focus: "${currentBrief}"` : ''}

TASK:
Brainstorm EXACTLY ${safeCount} DISTINCT, highly commercial creative angles / scene twists specifically designed to be COMBINED with this reference image.
Each twist should give the user an exciting new variation to shoot or generate without breaking the core subject!

Explore diverse categories:
1. Lighting & Atmosphere (e.g. "Golden Hour Rim Light", "Blue Hour Twilight", "Softbox Studio Glow")
2. Camera & Framing (e.g. "Flatlay Overhead 90°", "Extreme Macro Texture", "Wide Environmental Hero")
3. Setting & Story (e.g. "Minimalist Scandinavian Interior", "Urban Commute Street", "Outdoor Nature Morning")
4. Commercial Purpose (e.g. "Hero Shot Copy Space", "Product Packaging Banner", "Candid Social Lifestyle")

FORMAT REQUIREMENTS:
Return ONLY a valid JSON object matching this schema exactly (no markdown backticks, no extra text):
{
  "twists": [
    {
      "id": "twist-1",
      "label": "Short Catchy Label (2-4 words in Indonesian, e.g. 'Flatlay & Copy Space' or 'Pagi Hangat di Kafe')",
      "category": "Sudut / Pencahayaan / Setting / Komersial",
      "modifierText": "Rich concrete English prompt phrase (1 concise sentence) describing this specific visual twist"
    }
  ]
}`;

  try {
    const res = await withRetry(
      () =>
        fetch('/api/generate/prompt-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: imageDataUrl ? 'reference_to_prompt' : 'text_ideation',
            brief: currentBrief || 'Brainstorm contextual visual twists',
            imageDataUrl: imageDataUrl || undefined,
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
      700
    );

    const data = (await res.json()) as { twists?: Array<Record<string, unknown>> } & Record<string, unknown>;
    const rawTwists = Array.isArray(data.twists) ? data.twists : [];

    if (rawTwists.length > 0) {
      return rawTwists.map((it, idx) => ({
        id: (typeof it.id === 'string' && it.id) || `twist-${nanoid()}`,
        label: (typeof it.label === 'string' && it.label) || `Opsi Twist #${idx + 1}`,
        category: (typeof it.category === 'string' && it.category) || 'Variasi Kreatif',
        modifierText:
          (typeof it.modifierText === 'string' && it.modifierText) ||
          'Complementary commercial scene variation with clean lighting and balanced composition',
        isSelected: false,
      }));
    }
  } catch (err) {
    console.warn('[Contextual Twists Error] Falling back to default stock twists:', err);
  }

  // Resilient fallback: Return curated stock twists
  return FALLBACK_STOCK_TWISTS.slice(0, safeCount).map((t) => ({ ...t, id: `twist-${nanoid()}` }));
}


