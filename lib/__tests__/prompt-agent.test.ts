import { describe, it, expect } from 'vitest';
import {
  formatPromptForEngine,
  extractJsonFromText,
  parseAndFormatPromptCards,
  exportPromptsToText,
  exportPromptsToJson,
  buildVCPAPromptInstruction,
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

  it('formats prompt correctly for Google Imagen 3 / Flow and Google Nano Banana', () => {
    const imagenSettings: VCPASettings = { ...baseSettings, engine: 'imagen3' };
    const resImagen = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', imagenSettings);
    expect(resImagen.prompt).toContain('High dynamic range');
    expect(resImagen.prompt).toContain('16:9 composition framing');

    const bananaSettings: VCPASettings = { ...baseSettings, engine: 'nanobanana' };
    const resBanana = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', bananaSettings);
    expect(resBanana.prompt).toContain('crisp subject separation');
    expect(resBanana.prompt).toContain('aspect ratio 16:9');
  });

  it('omits aspect ratio when aspectRatio is none', () => {
    const freeSettings: VCPASettings = { ...baseSettings, aspectRatio: 'none', engine: 'midjourney' };
    const res = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', freeSettings);
    expect(res.prompt).not.toContain('--ar');

    const freeFlux: VCPASettings = { ...baseSettings, aspectRatio: 'none', engine: 'flux' };
    const resFlux = formatPromptForEngine('A sleek luxury perfume bottle on wet dark slate', freeFlux);
    expect(resFlux.prompt).not.toContain('aspect ratio');
  });

  it('resiliently extracts JSON from messy markdown model response', () => {
    const messyOutput = `Here is your concept:\n\`\`\`json\n{\n  "title": "Quiet Confidence",\n  "prompts": []\n}\n\`\`\`\nHope this helps!`;
    const parsed = extractJsonFromText(messyOutput);
    expect(parsed).toHaveProperty('title', 'Quiet Confidence');
  });

  it('recovers complete prompt items from truncated LLM response', () => {
    const truncatedOutput = `{"visualDna": {"observed": ["coffee"]}, "prompts": [{"ordinal": 1, "title": "First", "prompt": "Prompt 1"}, {"ordinal": 2, "title": "Cutoff", "rationale": "Incom`;
    const parsed = extractJsonFromText(truncatedOutput);
    expect(parsed).toHaveProperty('prompts');
    const prompts = parsed.prompts as Array<{ ordinal: number; title: string }>;
    expect(prompts).toHaveLength(1);
    expect(prompts[0].title).toBe('First');
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

  it('provides diverse curated inspirations with shuffle functionality', async () => {
    const { getRandomCuratedIdeas, CURATED_INSPIRATION_POOL } = await import('../prompt-agent/inspirations');
    expect(CURATED_INSPIRATION_POOL.length).toBeGreaterThanOrEqual(20);

    const ideas = getRandomCuratedIdeas(5);
    expect(ideas).toHaveLength(5);
    ideas.forEach((item) => {
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('brief');
      expect(item.brief.length).toBeGreaterThan(15);
    });

    const excludedIds = ideas.map((i) => i.id);
    const nextIdeas = getRandomCuratedIdeas(5, excludedIds);
    expect(nextIdeas).toHaveLength(5);
    // At least some should be distinct when pool is large
    const overlap = nextIdeas.filter((n) => excludedIds.includes(n.id));
    expect(overlap.length).toBeLessThan(5);

    // Default count is now 10
    const defaultBatch = getRandomCuratedIdeas();
    expect(defaultBatch).toHaveLength(10);
    expect(CURATED_INSPIRATION_POOL.length).toBeGreaterThanOrEqual(30);
  });

  it('generates clean Mode 2 instructions without demanding visualDna', () => {
    const mode2Instruction = buildVCPAPromptInstruction({
      mode: 'text_ideation',
      brief: 'Kuliner tradisional rendang daging sapi',
      settings: baseSettings,
    });

    expect(mode2Instruction).toContain('=== CREATIVE BRIEF (TEXT-ONLY IDEATION) ===');
    expect(mode2Instruction).toContain('User Brief: "Kuliner tradisional rendang daging sapi"');
    // Mode 2 must NOT force visualDna object in schema
    expect(mode2Instruction).not.toContain('"visualDna": {');
    expect(mode2Instruction).toContain('"prompts": [');

    const mode1Instruction = buildVCPAPromptInstruction({
      mode: 'reference_to_prompt',
      brief: 'Explore lighting',
      settings: baseSettings,
    });
    // Mode 1 initial step must require visualDna
    expect(mode1Instruction).toContain('"visualDna": {');
    expect(mode1Instruction).toContain('"prompts": [');
  });

  it('preserves and isolates per-item settings snapshot for queued image references', () => {
    const livePanelSettings: VCPASettings = {
      count: 5,
      similarity: 80,
      engine: 'midjourney',
      visualDirection: 'photo_commercial_lifestyle',
      aspectRatio: '16:9',
      creativeFocus: 'lighting',
      semanticMode: 'meaning_preservation',
      commercialSafety: true,
      promptLanguage: 'en',
      selectedTwists: ['warm golden catchlights'],
    };

    // Item 1 is enqueued with snapshot of current settings
    const queuedItem1: {
      id: string;
      filename: string;
      settings: VCPASettings;
    } = {
      id: 'q1',
      filename: 'fashion_model.jpg',
      settings: {
        ...livePanelSettings,
        selectedTwists: livePanelSettings.selectedTwists ? [...livePanelSettings.selectedTwists] : undefined,
      },
    };

    // User subsequently modifies panel settings for the next image
    livePanelSettings.engine = 'flux';
    livePanelSettings.count = 1;
    livePanelSettings.aspectRatio = '1:1';
    livePanelSettings.visualDirection = 'illustration_vector';
    livePanelSettings.selectedTwists = ['minimalist vector lines'];

    // Item 2 is enqueued with the new panel settings
    const queuedItem2: {
      id: string;
      filename: string;
      settings: VCPASettings;
    } = {
      id: 'q2',
      filename: 'food_flatlay.jpg',
      settings: {
        ...livePanelSettings,
        selectedTwists: livePanelSettings.selectedTwists ? [...livePanelSettings.selectedTwists] : undefined,
      },
    };

    // Item 1 must retain its original snapshot settings
    expect(queuedItem1.settings.engine).toBe('midjourney');
    expect(queuedItem1.settings.count).toBe(5);
    expect(queuedItem1.settings.aspectRatio).toBe('16:9');
    expect(queuedItem1.settings.visualDirection).toBe('photo_commercial_lifestyle');
    expect(queuedItem1.settings.selectedTwists).toEqual(['warm golden catchlights']);

    // Item 2 must use its own distinct settings
    expect(queuedItem2.settings.engine).toBe('flux');
    expect(queuedItem2.settings.count).toBe(1);
    expect(queuedItem2.settings.aspectRatio).toBe('1:1');
    expect(queuedItem2.settings.visualDirection).toBe('illustration_vector');
    expect(queuedItem2.settings.selectedTwists).toEqual(['minimalist vector lines']);
  });

  it('generates faithful adaptive directives when visualDirection is agent_decide (Ikut Img Ref)', async () => {
    const { VISUAL_DIRECTION_LIST } = await import('../prompt-agent/engine');
    const item = VISUAL_DIRECTION_LIST.find((v) => v.id === 'agent_decide');
    expect(item).toBeDefined();
    expect(item?.category).toBe('ref_adaptive');
    expect(item?.label).toContain('Ikut Gambar Referensi');

    const adaptiveSettings: VCPASettings = {
      ...baseSettings,
      visualDirection: 'agent_decide',
    };

    const instruction = buildVCPAPromptInstruction({
      mode: 'reference_to_prompt',
      brief: '',
      settings: adaptiveSettings,
    });

    expect(instruction).toContain('ADAPTIVE - FOLLOW REFERENCE IMAGE');
    expect(instruction).toContain('ADAPTIVE MEDIUM FIDELITY');
    expect(instruction).toContain('Do NOT convert photos to illustrations or illustrations to photos');
  });

  it('mandates demographic, age, ethnicity, and facial feature deconstruction when human subjects are present', () => {
    const instruction = buildVCPAPromptInstruction({
      mode: 'reference_to_prompt',
      brief: '',
      settings: baseSettings,
    });

    expect(instruction).toContain('perceived ethnicity/heritage');
    expect(instruction).toContain('DEMOGRAPHIC, AGE, RACE & FACIAL FIDELITY (MANDATORY INCLUSION)');
    expect(instruction).toContain('DO NOT omit ethnicity or write vague descriptions');
  });
});

