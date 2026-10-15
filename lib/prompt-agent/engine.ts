import { nanoid } from 'nanoid';
import type {
  EngineType,
  PromptCardItem,
  VCPAMode,
  VCPASettings,
  VisualDNAProfile,
} from './types';

export const ENGINE_LABELS: Record<EngineType, string> = {
  midjourney: 'Midjourney v6.1',
  flux: 'FLUX.1 (Black Forest Labs)',
  sdxl: 'Stable Diffusion XL (SDXL)',
  imagen3: 'Google Imagen 3 / Flow',
  nanobanana: 'Google Nano Banana',
};

export const VISUAL_DIRECTION_SUFFIXES: Record<string, string> = {
  photorealistic:
    'authentic commercial stock photography, shot on Sony A7R V, 85mm f/1.4 lens, natural skin textures, 8k resolution, crisp focus',
  '3d_render':
    'clean 3d isometric render, Blender Cycles, smooth plastic and matte ceramic materials, soft ambient occlusion, minimalist geometric shapes',
  vector:
    'clean vector illustration style, sharp edges, flat design, modern balanced color palette, microstock asset, scalable graphic, high contrast',
  cinematic:
    'cinematic 4k still frame from video footage, anamorphic lens flare, motion blur, arri alexa color science, dramatic film grading',
  editorial:
    'high-end editorial design, tactile art direction, sophisticated negative space, museum quality, refined color contrast',
  auto: '',
};

export const CREATIVE_FOCUS_LABELS: Record<string, string> = {
  composition_lighting: 'Komposisi & Pencahayaan Komersial',
  environment_props: 'Lingkungan, Setting & Properti',
  material_textures: 'Material, Tekstur & Permukaan',
  storytelling: 'Storytelling, Emosi & Narasi Tersirat',
  microstock_hero: 'Microstock Hero Shot (Copy Space & Bersih)',
};

export function formatPromptForEngine(
  basePrompt: string,
  settings: Pick<VCPASettings, 'engine' | 'aspectRatio' | 'commercialSafety' | 'visualDirection'>
): { prompt: string; negativePrompt?: string } {
  const cleanBase = basePrompt.trim().replace(/\s+/g, ' ').replace(/,$/, '');
  const styleSuffix = VISUAL_DIRECTION_SUFFIXES[settings.visualDirection] || '';
  const combined = styleSuffix && !cleanBase.toLowerCase().includes(styleSuffix.slice(0, 20).toLowerCase())
    ? `${cleanBase}, ${styleSuffix}`
    : cleanBase;

  const hasAr = settings.aspectRatio && settings.aspectRatio !== 'none';

  if (settings.engine === 'midjourney') {
    const arFlag = hasAr ? `--ar ${settings.aspectRatio}` : '';
    const qualityFlags = '--style raw --v 6.1';
    const noFlag = settings.commercialSafety
      ? '--no watermark, text, logo, signature, blurry, deformed hands, extra fingers'
      : '';
    const finalPrompt = `${combined} ${arFlag} ${qualityFlags} ${noFlag}`.trim().replace(/\s+/g, ' ');
    return { prompt: finalPrompt };
  }

  if (settings.engine === 'flux') {
    const arText = hasAr ? `, aspect ratio ${settings.aspectRatio}.` : '.';
    const safetyNote = settings.commercialSafety
      ? ' Commercial microstock aesthetics, strictly devoid of any unwanted watermark, brand trademarks, logos, or text artifacts.'
      : '';
    const finalPrompt = `${combined}${arText}${safetyNote}`
      .trim()
      .replace(/\s+/g, ' ');
    return { prompt: finalPrompt };
  }

  if (settings.engine === 'imagen3') {
    // Google Imagen 3 / Flow: natural prose, studio fidelity, clean commercial composition
    const arText = hasAr ? `, ${settings.aspectRatio} composition framing` : '';
    const safetyNote = settings.commercialSafety
      ? ' Clean commercial composition, free from watermarks, logos, or unwanted text artifacts.'
      : '';
    const finalPrompt = `${combined}${arText}. High dynamic range, natural studio lighting, authentic material textures.${safetyNote}`
      .trim()
      .replace(/\s+/g, ' ');
    return { prompt: finalPrompt };
  }

  if (settings.engine === 'nanobanana') {
    // Google Nano Banana: high-speed generation, crisp subject separation, vibrant commercial fidelity
    const arText = hasAr ? `, aspect ratio ${settings.aspectRatio}` : '';
    const safetyNote = settings.commercialSafety
      ? ' Clean stock aesthetics, no watermark, pristine presentation.'
      : '';
    const finalPrompt = `${combined}${arText}, crisp subject separation, vibrant commercial fidelity.${safetyNote}`
      .trim()
      .replace(/\s+/g, ' ');
    return { prompt: finalPrompt };
  }

  // SDXL
  const sdNegative = settings.commercialSafety
    ? 'watermark, signature, text, logo, username, blurry, distorted, low quality, deformed hands, extra limbs, grain'
    : '';
  const finalPrompt = `${combined}, highly detailed commercial stock asset, masterwork, 8k resolution`
    .trim()
    .replace(/\s+/g, ' ');
  return {
    prompt: finalPrompt,
    negativePrompt: sdNegative || undefined,
  };
}

export function buildVCPAPromptInstruction(params: {
  mode: VCPAMode;
  brief: string;
  visualDna?: VisualDNAProfile;
  settings: VCPASettings;
}): string {
  const { mode, brief, visualDna, settings } = params;
  const count = Math.min(Math.max(settings.count, 1), 50);

  let contextIntro = '';
  if (mode === 'reference_to_prompt' && visualDna) {
    contextIntro = `=== REFERENCE IMAGE VISUAL DNA ===
Observed elements: ${visualDna.observed.join(', ')}
Inferred mood/atmosphere: ${visualDna.inferred.join(', ')}
Core anchors to respect: ${visualDna.anchors.join(', ')}
Editable creative variables: ${visualDna.editableVariables.join(', ')}
${visualDna.semanticProfile?.coreTheme ? `Core semantic theme: ${visualDna.semanticProfile.coreTheme}` : ''}
${visualDna.semanticProfile?.metaphor ? `Metaphors: ${visualDna.semanticProfile.metaphor.join(', ')}` : ''}

Similarity Level: ${settings.similarity}% (0 = wide creative exploration while preserving core essence; 100 = strict visual fidelity to subject and style).
Semantic Preservation Mode: ${settings.semanticMode}`;
  } else {
    contextIntro = `=== CREATIVE BRIEF (TEXT-ONLY IDEATION) ===
User Brief: "${brief || 'Versatile modern commercial concept'}"
Creative Focus: ${CREATIVE_FOCUS_LABELS[settings.creativeFocus] || settings.creativeFocus}
Visual Direction: ${settings.visualDirection}`;
  }

  return `You are VCPA (Visual Concept Prompt Agent), an elite AI art director and prompt composer for commercial microstock and top-tier AI image generators (Midjourney, FLUX, SDXL).

${contextIntro}

TASK:
Generate EXACTLY ${count} conceptually DISTINCT, visually concrete, and diverse image generation prompt concepts.

STRICT DIVERSITY & QUALITY RULES:
1. NO LAZY VARIATIONS: Do NOT simply swap synonyms or change background colors. Each prompt MUST explore a distinct creative axis (composition/camera angle, lighting mood, surrounding environment, tactile materials, or narrative tension).
2. VISUAL SPECIFICITY: Every prompt must specify tangible physical subjects, distinct camera framing (e.g. overhead flatlay, dramatic low-angle, extreme macro, wide environmental hero), lighting (e.g. golden hour rim light, soft diffused studio softbox, atmospheric chiaroscuro), materials/textures, and clean copy space for designers.
3. COMMERCIALLY SAFE & USABLE: Strictly NO copyrighted brand names, recognizable trademarks, or celebrity likenesses. Include natural negative space suitable for advertising copy.
4. PROMPT LANGUAGE: The 'rawBasePrompt' field MUST be in English for optimal image generation performance. Titles and rationales should be in ${settings.promptLanguage === 'id' ? 'Bahasa Indonesia' : 'English'}.
5. KEEP IT COMPACT: Keep 'rationale' strictly to 1 concise sentence (maximum 20 words) to prevent token truncation.

CRITICAL OUTPUT FORMAT:
You MUST return ONLY a valid, single, parseable JSON object matching this schema exactly. Do NOT include markdown code blocks, do not include backticks, do not include commentary before or after:

{
  "visualDna": {
    "subject": { "type": "...", "attributes": ["..."] },
    "observed": ["..."],
    "inferred": ["..."],
    "anchors": ["..."],
    "editableVariables": ["..."],
    "semanticProfile": {
      "coreTheme": "...",
      "metaphor": ["..."],
      "emotionTension": "..."
    }
  },
  "prompts": [
    {
      "ordinal": 1,
      "title": "Short evocative title (max 5 words)",
      "creativeStrategy": "One of: Controlled Variation | Concept Expansion | Symbolic Exploration | Editorial Hero | Macro Texture",
      "rawBasePrompt": "Full detailed base prompt with subject, camera, lighting, textures, and composition",
      "rationale": "1 short sentence explaining visual thesis",
      "tags": ["composition", "lighting", "subject"]
    }
  ]
}`;
}

export function extractJsonFromText(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // continue to substring extraction
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(slice) as Record<string, unknown>;
    } catch {
      const repaired = slice.replace(/,\s*([\]\}])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ');
      try {
        return JSON.parse(repaired) as Record<string, unknown>;
      } catch {
        // continue to truncation recovery
      }
    }
  }

  // Robust truncation recovery: if tokens cut off mid-array, close to the last valid object
  const lastObjEnd = cleaned.lastIndexOf('}');
  if (lastObjEnd > 0) {
    const fromIdx = start >= 0 ? start : 0;
    const candidate = cleaned.slice(fromIdx, lastObjEnd + 1) + '\n  ]\n}';
    try {
      const recovered = JSON.parse(candidate);
      if (recovered && typeof recovered === 'object') return recovered as Record<string, unknown>;
    } catch {
      // try regex below
    }
  }

  // Regex fallback to extract individual completed prompt items
  const promptRegex = /\{\s*"ordinal"[\s\S]*?\}(?=\s*[,\]])/g;
  const matches = cleaned.match(promptRegex);
  if (matches && matches.length > 0) {
    const parsedPrompts: Array<Record<string, unknown>> = [];
    for (const m of matches) {
      try {
        parsedPrompts.push(JSON.parse(m));
      } catch {
        // skip malformed single item
      }
    }
    if (parsedPrompts.length > 0) {
      return { prompts: parsedPrompts };
    }
  }

  throw new Error('Model did not return valid JSON');
}

export function parseAndFormatPromptCards(
  rawResults: Array<{
    ordinal?: number;
    title?: string;
    creativeStrategy?: string;
    rawBasePrompt?: string;
    prompt?: string;
    rationale?: string;
    tags?: string[];
  }>,
  settings: VCPASettings
): PromptCardItem[] {
  return rawResults.map((item, index) => {
    const base = item.rawBasePrompt || item.prompt || 'Modern commercial concept';
    const formatted = formatPromptForEngine(base, settings);
    return {
      id: nanoid(),
      ordinal: item.ordinal || index + 1,
      title: item.title || `Konsep #${index + 1}`,
      rawBasePrompt: base,
      prompt: formatted.prompt,
      negativePrompt: formatted.negativePrompt,
      creativeStrategy: item.creativeStrategy || 'Concept Expansion',
      rationale: item.rationale || 'Variasi visual terarah dengan parameter komersial seimbang.',
      tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : ['Commercial', 'Stock AI'],
      isFavorite: false,
      isEdited: false,
    };
  });
}

export function exportPromptsToText(prompts: PromptCardItem[], settings: VCPASettings): string {
  const header = `=== VISUAL CONCEPT PROMPT AGENT (VCPA) EXPORT ===
Engine: ${ENGINE_LABELS[settings.engine]}
Aspect Ratio: ${settings.aspectRatio}
Total Prompts: ${prompts.length}
Generated: ${new Date().toLocaleString()}
==================================================\n\n`;

  const body = prompts
    .map((p, idx) => {
      const parts = [
        `#${String(idx + 1).padStart(2, '0')} — ${p.title} [${p.creativeStrategy}]`,
        `Prompt:`,
        p.prompt,
      ];
      if (p.negativePrompt) {
        parts.push(`Negative Prompt:\n${p.negativePrompt}`);
      }
      if (p.rationale) {
        parts.push(`Rationale: ${p.rationale}`);
      }
      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  return header + body;
}

export function exportPromptsToJson(
  prompts: PromptCardItem[],
  settings: VCPASettings,
  visualDna?: VisualDNAProfile
): string {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    settings: {
      engine: settings.engine,
      aspectRatio: settings.aspectRatio,
      similarity: settings.similarity,
      visualDirection: settings.visualDirection,
      creativeFocus: settings.creativeFocus,
      semanticMode: settings.semanticMode,
    },
    visualDna: visualDna || null,
    totalPrompts: prompts.length,
    prompts: prompts.map((p) => ({
      ordinal: p.ordinal,
      title: p.title,
      strategy: p.creativeStrategy,
      prompt: p.prompt,
      negativePrompt: p.negativePrompt || null,
      rationale: p.rationale,
      tags: p.tags,
      isFavorite: Boolean(p.isFavorite),
    })),
  };

  return JSON.stringify(exportPayload, null, 2);
}
