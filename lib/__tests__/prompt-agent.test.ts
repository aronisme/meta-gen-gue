import { describe, it, expect } from 'vitest';
import {
  formatPromptForEngine,
  extractJsonFromText,
  parseAndFormatPromptCards,
  exportPromptsToText,
  exportPromptsToJson,
} from '../prompt-agent/engine';
import type { VCPASettings } from '../prompt-agent/types';

describe('VCPA Engine Utilities', () => {
  const baseSettings: VCPASettings = {
    count: 5,
    similarity: 60,
    engine: 'midjourney',
    visualDirection: 'photorealistic',
    aspectRatio: '16:9',
    creativeFocus: 'composition_lighting',
    semanticMode: 'meaning_preservation',
    commercialSafety: true,
    promptLanguage: 'en',
  };

  it('formats prompt correctly for Midjourney v6.1', () => {
    const res = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', baseSettings);
    expect(res.prompt).toContain('--ar 16:9');
    expect(res.prompt).toContain('--style raw --v 6.1');
    expect(res.prompt).toContain('--no watermark, text, logo');
    expect(res.negativePrompt).toBeUndefined();
  });

  it('formats prompt correctly for FLUX.1', () => {
    const fluxSettings: VCPASettings = { ...baseSettings, engine: 'flux' };
    const res = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', fluxSettings);
    expect(res.prompt).toContain('aspect ratio 16:9');
    expect(res.prompt).toContain('Commercial microstock aesthetics');
    expect(res.negativePrompt).toBeUndefined();
  });

  it('formats prompt correctly for SDXL with separated negative prompt', () => {
    const sdxlSettings: VCPASettings = { ...baseSettings, engine: 'sdxl' };
    const res = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', sdxlSettings);
    expect(res.prompt).toContain('masterwork, 8k resolution');
    expect(res.negativePrompt).toBeDefined();
    expect(res.negativePrompt).toContain('watermark');
  });

  it('resiliently extracts JSON from messy markdown model response', () => {
    const messyOutput = `Here is your concept:\n\`\`\`json\n{\n  "title": "Quiet Confidence",\n  "prompts": []\n}\n\`\`\`\nHope this helps!`;
    const parsed = extractJsonFromText(messyOutput);
    expect(parsed).toHaveProperty('title', 'Quiet Confidence');
  });

  it('parses raw results into interactive PromptCardItems', () => {
    const rawItems = [
      {
        ordinal: 1,
        title: 'Architectural Stillness',
        creativeStrategy: 'Concept Expansion',
        rawBasePrompt: 'A perfume bottle standing tall on a concrete plinth in afternoon sun',
        rationale: 'Uses sharp geometric shadows to evoke luxury.',
        tags: ['architecture', 'luxury'],
      },
    ];

    const cards = parseAndFormatPromptCards(rawItems, baseSettings);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Architectural Stillness');
    expect(cards[0].prompt).toContain('--v 6.1');
    expect(cards[0].tags).toEqual(['architecture', 'luxury']);
  });

  it('exports prompts to clean text and JSON', () => {
    const cards = parseAndFormatPromptCards(
      [
        {
          ordinal: 1,
          title: 'Architectural Stillness',
          rawBasePrompt: 'A perfume bottle on concrete',
        },
      ],
      baseSettings
    );

    const txt = exportPromptsToText(cards, baseSettings);
    expect(txt).toContain('VISUAL CONCEPT PROMPT AGENT (VCPA) EXPORT');
    expect(txt).toContain('#01 — Architectural Stillness');

    const jsonStr = exportPromptsToJson(cards, baseSettings);
    const json = JSON.parse(jsonStr);
    expect(json.totalPrompts).toBe(1);
    expect(json.prompts[0].title).toBe('Architectural Stillness');
  });
});
