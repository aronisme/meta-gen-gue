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
  // --- SPECIAL AGENT MODES ---
  agent_decide: '',
  smart_random: '',

  // --- 1. FOTOGRAFI (Photography Sub-styles) ---
  photo_commercial_lifestyle:
    'authentic commercial stock photography, candid real people, natural soft morning light, shot on Sony A7R V, 85mm f/1.4 lens, natural skin textures, 8k resolution, genuine emotion',
  photo_studio_isolated:
    'clean commercial studio product photography, isolated on pure neutral white background, professional softbox studio lighting, crisp razor-sharp focus, generous negative copy space, 8k resolution',
  photo_flatlay_knolling:
    'overhead 90-degree flatlay tabletop photography, organized knolling composition, clean aesthetic arrangement, soft diffused ambient daylight, ample negative copy space for typography, high resolution',
  photo_macro_texture:
    'extreme macro close-up photography, microscopic tactile textures and details, shallow depth of field, delicate rim lighting, crisp focal plane, 8k masterwork',
  photo_cinematic_narrative:
    'cinematic 4k still frame from dramatic film footage, anamorphic lens flare, rich shadows, arri alexa color grading, atmospheric depth, cinematic storytelling',
  photo_editorial_documentary:
    'authentic editorial documentary photography, spontaneous candid realism, natural available lighting, photojournalistic framing, true-to-life colors, Leica M11 lens',
  photo_interior_architecture:
    'modern architectural and interior photography, clean straight perspective lines, Japandi minimalist design, soft natural window sunbeam, balanced interior lighting, spacious composition',
  photo_drone_aerial:
    'dramatic top-down drone aerial photography, bird-eye perspective, geometric landscape patterns, high-altitude wide angle, sharp environmental details',

  // --- 2. ILUSTRASI & GRAFIS (Illustration & Graphics Sub-styles) ---
  vector_flat_isolated:
    'clean vector illustration, modern flat 2d graphic design, isolated on pure white background, crisp vector outlines, balanced modern color palette, microstock asset, scalable SVG aesthetics',
  vector_lineart_minimal:
    'minimalist vector line art illustration, continuous monoline drawing, subtle pastel color accents, modern aesthetic boho style, clean negative space, elegant graphic',
  render_3d_isometric:
    'clean 3d isometric render, 30-degree orthographic view, Blender Cycles, smooth plastic and matte ceramic materials, soft ambient occlusion, minimalist tech aesthetic',
  render_3d_clay_glass:
    'cute 3d claymorphism and frosted glassmorphism render, soft translucent glass reflections, smooth tactile clay shapes, vibrant pastel lighting, modern playful asset',
  art_watercolor_handdrawn:
    'hand-painted watercolor illustration, soft wet-on-wet paint washes, authentic textured cold-press cotton paper, delicate fluid brushstrokes, artisanal organic feel',
  art_vintage_engraving:
    'classic vintage engraving and woodcut illustration, detailed cross-hatching linework, antique copperplate printing aesthetic, timeless monochrome or sepia ink drawing',
  graphic_sticker_clipart:
    'die-cut graphic sticker design, thick clean white contour outline border, playful vibrant colors, soft subtle drop shadow, isolated clipart asset, print-ready',
  graphic_infographic_asset:
    'modern business infographic asset, clean structured visual diagram, sleek data visualization style, crisp geometric icons, high contrast professional corporate graphic',

  // --- LEGACY BACKWARDS COMPATIBILITY ---
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

export interface StyleSpecification {
  medium: string;
  requiredElements: string;
  forbiddenElements: string;
}

export const STYLE_SPECIFICATIONS: Record<string, StyleSpecification> = {
  // --- 1. FOTOGRAFI (Photography Sub-styles) ---
  photo_commercial_lifestyle: {
    medium: 'Authentic commercial stock photography',
    requiredElements: 'Real candid people, authentic emotions, natural available daylight or soft morning window light, natural skin textures, contextual environment matching the subject (e.g. modern office for work, kitchen for food, home for family, park/gym for fitness)',
    forbiddenElements: 'Fake plastic studio looks, stiff poses, repetitive unrequested beach or vacation clichés when unrelated to the subject',
  },
  photo_studio_isolated: {
    medium: 'Commercial studio product photography isolated on white',
    requiredElements: 'Subject strictly isolated on a clean, solid, neutral pure white background (#FFFFFF cutout-ready), professional studio softbox lighting, crisp sharp focus, generous negative copy space',
    forbiddenElements: 'ANY outdoor environments, rooms, offices, beaches, horizons, landscapes, walls, or decorative clutter',
  },
  photo_flatlay_knolling: {
    medium: 'Overhead flatlay tabletop knolling photography',
    requiredElements: 'Strictly 90-degree straight top-down overhead perspective, neat knolling or flatlay arrangement, clean textured tabletop surface (linen, marble, light wood, concrete, or solid color), ample negative copy space for designer typography',
    forbiddenElements: 'Eye-level perspective, horizontal horizons, outdoor landscapes, perspective keystoning',
  },
  photo_macro_texture: {
    medium: 'Extreme macro close-up photography',
    requiredElements: 'Microscopic surface details, tactile textures, crisp razor-sharp focal plane, delicate rim lighting, shallow depth of field bokeh',
    forbiddenElements: 'Wide-angle views, full-body portraits, distant scenery, broad room environments',
  },
  photo_cinematic_narrative: {
    medium: 'Cinematic 4K film still frame',
    requiredElements: 'Atmospheric storytelling, anamorphic lens flare, Arri Alexa color science, cinematic framing, rich shadows, and deep emotional mood',
    forbiddenElements: 'Flat flash lighting, sterile white cutouts, generic snapshots',
  },
  photo_editorial_documentary: {
    medium: 'Authentic photojournalistic documentary photography',
    requiredElements: 'Spontaneous candid realism, natural available ambient light only, Leica M11 lens perspective, photojournalistic framing, true-to-life colors',
    forbiddenElements: 'Staged commercial poses, artificial studio lighting, heavy retouching, isolated cutouts',
  },
  photo_interior_architecture: {
    medium: 'Modern architectural and interior photography',
    requiredElements: 'Clean straight vertical perspective lines, spacious architectural composition, balanced natural window sunlight and ambient interior lighting, Scandinavian/Japandi/modern architectural design',
    forbiddenElements: 'Macro close-ups, messy clutter, tilted perspective, outdoor beach landscapes',
  },
  photo_drone_aerial: {
    medium: 'High-altitude drone aerial photography',
    requiredElements: 'Top-down 90-degree bird-eye perspective, geometric environmental patterns, wide topographical overview, crisp high-resolution detail',
    forbiddenElements: 'Ground-level eye views, indoor ceilings, macro shots',
  },

  // --- 2. ILUSTRASI & GRAFIS (Illustration & Graphics Sub-styles) ---
  vector_flat_isolated: {
    medium: 'Clean 2D flat vector illustration (SVG / Microstock graphic asset)',
    requiredElements: 'Solid vector shapes, crisp clean outlines, modern flat color palette, strictly isolated on a pure white background, scalable graphic design asset',
    forbiddenElements: 'Photorealism, real human photos, camera lenses (Sony, 85mm), 3D shaders, realistic skin textures, photographic lighting or lens blur',
  },
  vector_lineart_minimal: {
    medium: 'Minimalist monoline vector line art illustration',
    requiredElements: 'Continuous fluid monoline contour drawing, delicate pastel color wash accents, clean negative space, modern aesthetic boho style',
    forbiddenElements: 'Photorealism, dense realistic photo textures, complex 3D renders, photographic lenses',
  },
  render_3d_isometric: {
    medium: '3D isometric orthographic render',
    requiredElements: 'Strictly 30-degree isometric orthographic camera angle, Blender Cycles / Octane render, smooth matte plastic and ceramic textures, clean ambient occlusion, tech/SaaS miniature aesthetic',
    forbiddenElements: 'Flat 2D lines, perspective camera distortion, photorealistic real-world camera shots',
  },
  render_3d_clay_glass: {
    medium: '3D claymorphism and frosted glassmorphism render',
    requiredElements: 'Tactile smooth clay 3D shapes, translucent frosted glass with soft reflections, playful rounded geometry, vibrant pastel studio lighting',
    forbiddenElements: 'Flat 2D graphics, realistic photographic grain, dark gritty textures',
  },
  art_watercolor_handdrawn: {
    medium: 'Authentic hand-painted watercolor illustration',
    requiredElements: 'Wet-on-wet paint washes, authentic textured cold-press cotton paper, delicate translucent fluid brushstrokes, artisanal organic feel',
    forbiddenElements: 'Sharp vector lines, digital 3D renders, photographic realism, glossy plastic surfaces',
  },
  art_vintage_engraving: {
    medium: 'Classical vintage engraving and woodcut illustration',
    requiredElements: 'Detailed cross-hatching and linework, antique copperplate printing aesthetic, timeless monochrome or sepia ink drawing, aged bookplate feel',
    forbiddenElements: 'Full-color photography, modern neon vectors, 3D renders, blurry gradients',
  },
  graphic_sticker_clipart: {
    medium: 'Die-cut graphic sticker design',
    requiredElements: 'Thick clean white contour outline border, bold vibrant colors, subtle soft drop shadow, isolated clipart graphic ready for print',
    forbiddenElements: 'Full-bleed photographic landscapes, realistic photo clutter, messy unbordered illustrations',
  },
  graphic_infographic_asset: {
    medium: 'Modern business infographic and data visualization graphic',
    requiredElements: 'Clean structured visual layout, crisp geometric icons and charts, sleek corporate data aesthetic, high contrast legible typography spaces',
    forbiddenElements: 'Loose painterly sketches, noisy realistic photo backgrounds, casual lifestyle photos',
  },

  // Legacy fallbacks
  photorealistic: {
    medium: 'Commercial stock photography',
    requiredElements: 'Sharp focus, natural textures, balanced lighting, high resolution',
    forbiddenElements: 'Watermarks, severe distortion',
  },
  '3d_render': {
    medium: '3D isometric render',
    requiredElements: 'Clean 3D render, smooth materials, ambient occlusion',
    forbiddenElements: 'Messy 2D drawings',
  },
  vector: {
    medium: 'Vector illustration',
    requiredElements: 'Clean vector lines, sharp edges, flat design',
    forbiddenElements: 'Photorealism',
  },
  cinematic: {
    medium: 'Cinematic 4K still frame',
    requiredElements: 'Atmospheric lighting, anamorphic flare, dramatic grading',
    forbiddenElements: 'Flat flash lighting',
  },
  editorial: {
    medium: 'High-end editorial design',
    requiredElements: 'Tactile art direction, sophisticated negative space',
    forbiddenElements: 'Cluttered stock clichés',
  },
};

export interface VisualDirectionMeta {
  id: string;
  category: 'photo' | 'illustration' | 'special';
  label: string;
  desc: string;
  badge: string;
}

export const VISUAL_DIRECTION_LIST: VisualDirectionMeta[] = [
  // Special Agent Modes
  {
    id: 'agent_decide',
    category: 'special',
    label: 'Agent Decide (Otomatis)',
    desc: 'AI menganalisis gambar dan otomatis memilih gaya paling bernilai komersial tinggi',
    badge: 'Smart Auto',
  },
  {
    id: 'smart_random',
    category: 'special',
    label: 'Smart Variety Pack',
    desc: 'Menyebarkan ragam sudut gaya berbeda di setiap kartu prompt (Mix Series)',
    badge: 'Multi-Style',
  },

  // 1. Fotografi
  {
    id: 'photo_commercial_lifestyle',
    category: 'photo',
    label: 'Commercial & Lifestyle',
    desc: 'Candid manusia autentik, pencahayaan alami, ramah komersial',
    badge: 'Bestseller',
  },
  {
    id: 'photo_studio_isolated',
    category: 'photo',
    label: 'Studio Product Isolated',
    desc: 'Subjek terisolasi di background putih/netral, softbox, copy space iklan',
    badge: 'Isolated',
  },
  {
    id: 'photo_flatlay_knolling',
    category: 'photo',
    label: 'Flatlay & Tabletop Knolling',
    desc: 'Sudut tegak lurus 90° overhead, rapi, ruang teks banner',
    badge: 'Copy Space',
  },
  {
    id: 'photo_macro_texture',
    category: 'photo',
    label: 'Macro & Extreme Close-Up',
    desc: 'Tekstur material tajam, tetesan air, detail mikro memukau',
    badge: 'Macro 8K',
  },
  {
    id: 'photo_cinematic_narrative',
    category: 'photo',
    label: 'Cinematic & Film Still',
    desc: 'Pencahayaan dramatis, anamorphic flare, suasana filmis',
    badge: 'Sinematik',
  },
  {
    id: 'photo_editorial_documentary',
    category: 'photo',
    label: 'Editorial & Street Candid',
    desc: 'Jurnalistik spontan, warna alami tanpa editan berlebihan',
    badge: 'Candid',
  },
  {
    id: 'photo_interior_architecture',
    category: 'photo',
    label: 'Interior & Arsitektur',
    desc: 'Garis lurus presisi, Japandi/Skandinavia, cahaya jendela luas',
    badge: 'Interior',
  },
  {
    id: 'photo_drone_aerial',
    category: 'photo',
    label: 'Drone & Aerial Top-Down',
    desc: 'Sudut pandang mata burung, geometri lanskap dan tata kota',
    badge: 'Aerial',
  },

  // 2. Ilustrasi & Grafis
  {
    id: 'vector_flat_isolated',
    category: 'illustration',
    label: 'Vector Flat - Isolated',
    desc: 'Tepi tajam, terisolasi latar putih murni, mudah di-cutout untuk desainer',
    badge: 'Vector SVG',
  },
  {
    id: 'vector_lineart_minimal',
    category: 'illustration',
    label: 'Line Art & Monoline',
    desc: 'Garis kontur bersih elegan, aksen pastel, modern boho',
    badge: 'Line Art',
  },
  {
    id: 'render_3d_isometric',
    category: 'illustration',
    label: '3D Isometric Render',
    desc: 'Sudut 30°, material matte halus, ikonik untuk tech & SaaS',
    badge: '3D Render',
  },
  {
    id: 'render_3d_clay_glass',
    category: 'illustration',
    label: '3D Clay & Glassmorphism',
    desc: 'Kaca buram transparan, gradien lembut, bentuk clay lucu',
    badge: 'Clay 3D',
  },
  {
    id: 'art_watercolor_handdrawn',
    category: 'illustration',
    label: 'Watercolor Cat Air',
    desc: 'Sapuan kuas cat air lembut, tekstur kertas basah, organik',
    badge: 'Artisan',
  },
  {
    id: 'art_vintage_engraving',
    category: 'illustration',
    label: 'Vintage Engraving & Woodcut',
    desc: 'Arsiran klasik tembaga/buku tua, gaya ukiran retro monokrom',
    badge: 'Vintage',
  },
  {
    id: 'graphic_sticker_clipart',
    category: 'illustration',
    label: 'Sticker & Clipart Pack',
    desc: 'Die-cut border putih tebal, warna cerah, siap cetak',
    badge: 'Sticker',
  },
  {
    id: 'graphic_infographic_asset',
    category: 'illustration',
    label: 'Infographic & Diagram',
    desc: 'Bagan visual terstruktur, ikon bisnis tajam, korporat',
    badge: 'Infografis',
  },
];

export function getVisualDirectionLabel(id: string): string {
  const found = VISUAL_DIRECTION_LIST.find((v) => v.id === id);
  if (found) return found.label;
  if (id === 'photorealistic') return 'Foto Komersial (Legacy)';
  if (id === '3d_render') return '3D Render (Legacy)';
  if (id === 'vector') return 'Vektor (Legacy)';
  if (id === 'cinematic') return 'Sinematik (Legacy)';
  if (id === 'editorial') return 'Editorial (Legacy)';
  return id || 'Auto';
}

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

/**
 * Safely converts raw AI output into a strictly typed, crash-proof VisualDNAProfile.
 * Ensures all array fields (observed, inferred, anchors, editableVariables, etc.)
 * are ALWAYS valid string[] arrays, even if the AI returned strings, objects, or nulls.
 */
export function normalizeVisualDna(raw: unknown): VisualDNAProfile | null {
  if (!raw || typeof raw !== 'object') return null;

  const toStrArray = (val: unknown): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val
        .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
        .filter(Boolean);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];
      if (trimmed.includes('\n') || trimmed.includes(',')) {
        return trimmed
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [trimmed];
    }
    if (typeof val === 'object') {
      return Object.values(val as Record<string, unknown>)
        .map((v) => String(v || '').trim())
        .filter(Boolean);
    }
    return [String(val)];
  };

  const obj = raw as Record<string, unknown>;

  // Normalize subject
  let subjectObj = { type: 'Subject', attributes: [] as string[] };
  if (obj.subject && typeof obj.subject === 'object') {
    const s = obj.subject as Record<string, unknown>;
    subjectObj = {
      type: typeof s.type === 'string' && s.type.trim() ? s.type.trim() : 'Subject',
      attributes: toStrArray(s.attributes),
    };
  } else if (typeof obj.subject === 'string' && obj.subject.trim()) {
    subjectObj = {
      type: obj.subject.trim(),
      attributes: [],
    };
  }

  // Handle editableVariables (supporting alternative key 'variables')
  const rawVariables = obj.editableVariables ?? obj.variables;

  // Normalize semanticProfile
  let semProfile: VisualDNAProfile['semanticProfile'] = undefined;
  if (obj.semanticProfile && typeof obj.semanticProfile === 'object') {
    const sp = obj.semanticProfile as Record<string, unknown>;
    semProfile = {
      coreTheme: typeof sp.coreTheme === 'string' ? sp.coreTheme.trim() : undefined,
      emotionTension: typeof sp.emotionTension === 'string' ? sp.emotionTension.trim() : undefined,
      metaphor: sp.metaphor ? toStrArray(sp.metaphor) : undefined,
      symbolism: sp.symbolism ? toStrArray(sp.symbolism) : undefined,
      evidence: sp.evidence ? toStrArray(sp.evidence) : undefined,
      ambiguity:
        sp.ambiguity === 'low' || sp.ambiguity === 'medium' || sp.ambiguity === 'high'
          ? sp.ambiguity
          : undefined,
    };
  }

  return {
    subject: subjectObj,
    observed: toStrArray(obj.observed),
    inferred: toStrArray(obj.inferred),
    anchors: toStrArray(obj.anchors),
    editableVariables: toStrArray(rawVariables),
    semanticProfile: semProfile,
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

  const twistsBlock =
    settings.selectedTwists && settings.selectedTwists.length > 0
      ? `\n=== USER SELECTED CREATIVE COMBINATIONS & TWISTS (MUST INTEGRATE) ===\n` +
        settings.selectedTwists.map((t, i) => `${i + 1}. ${t}`).join('\n') +
        `\nCRITICAL: Tastefully blend and harmonize these user-selected creative twists into the concepts generated for this reference image.\n`
      : '';

  const dirLabel = getVisualDirectionLabel(settings.visualDirection);
  const spec = STYLE_SPECIFICATIONS[settings.visualDirection] || STYLE_SPECIFICATIONS.photo_commercial_lifestyle;
  const dirSuffix = VISUAL_DIRECTION_SUFFIXES[settings.visualDirection] || '';

  const visualDirectionInstruction = `=== MANDATORY VISUAL STYLE DIRECTIVE (ABSOLUTE HIGHEST PRIORITY) ===
Chosen Visual Style: "${dirLabel}" (${settings.visualDirection})
Artistic Medium: ${spec.medium}
Required Visual Characteristics to Embody in Every Prompt:
- ${spec.requiredElements}

STRICTLY FORBIDDEN FOR THIS STYLE:
- ${spec.forbiddenElements}

Visual Direction Keywords Baseline: ${dirSuffix || settings.visualDirection}`;

  let contextIntro = '';
  if (mode === 'reference_to_prompt') {
    if (visualDna) {
      const safeDna = normalizeVisualDna(visualDna) || visualDna;
      const safeStr = (arr: unknown) =>
        Array.isArray(arr) ? arr.join(', ') : typeof arr === 'string' ? arr : '';

      contextIntro = `=== REFERENCE IMAGE VISUAL DNA (PREVIOUSLY ANALYZED) ===
Observed elements: ${safeStr(safeDna.observed)}
Inferred mood/atmosphere: ${safeStr(safeDna.inferred)}
Core anchors to respect: ${safeStr(safeDna.anchors)}
Editable creative variables: ${safeStr(safeDna.editableVariables)}
${safeDna.semanticProfile?.coreTheme ? `Core semantic theme: ${safeDna.semanticProfile.coreTheme}` : ''}
${safeDna.semanticProfile?.metaphor ? `Metaphors: ${safeStr(safeDna.semanticProfile.metaphor)}` : ''}

Similarity Level: ${settings.similarity}% (0 = wide creative exploration while preserving core essence; 100 = strict visual fidelity to subject and style).
Semantic Preservation Mode: ${settings.semanticMode}
STYLE TRANSFORMATION FOR REFERENCE IMAGE:
- Extract the core subject from the reference image, but RENDER IT STRICTLY in the user's chosen style: "${dirLabel}" (${spec.medium}).
- If the reference image has a background but the user selected an isolated style, isolate the subject on pure white!
${brief ? `User's Additional Creative Exploration / Focus Request: "${brief}"` : ''}
${twistsBlock}
${visualDirectionInstruction}`;
    } else {
      contextIntro = `=== ATTACHED REFERENCE IMAGE ANALYSIS & VISUAL DNA REMIX (MODE 1) ===
The user has attached an image as the primary visual reference (Anchor).
YOUR MANDATORY FIRST STEP:
Thoroughly examine the attached image pixels and extract its full Visual DNA into the "visualDna" output object:
1. "subject": Identify the primary physical subject (type, specific physical attributes, clothing/materials, posture).
2. "observed": Concrete visual elements observed directly in the image (textures, background setting, props, colors).
3. "inferred": Atmosphere, lighting quality, mood, color palette, and camera technique.
4. "anchors": The essential signature traits that MUST be preserved to maintain visual lineage with this reference.
5. "editableVariables": Key elements that can be tastefully transformed, remixed, or varied across the prompt batch.
6. "semanticProfile": Core commercial theme, symbolic metaphors, and emotion tension.

YOUR MANDATORY SECOND STEP:
Generate ${count} distinct commercial stock image prompt concepts grounded in the reference image's visual DNA.
${brief ? `User's Creative Direction / Exploration Focus: "${brief}"` : 'Deconstruct the reference image directly and generate diverse commercial microstock variations.'}
${twistsBlock}
Similarity Level: ${settings.similarity}% (${
        settings.similarity < 40
          ? 'Creative Departure: Retain only core mood/essence, freely explore new subjects, settings, and lighting'
          : settings.similarity > 75
          ? 'High Fidelity: Keep the primary subject, setting, and composition closely faithful to the reference image'
          : 'Balanced Remix: Preserve core visual anchors while varying perspective and narrative context in the chosen style'
      }).
Semantic Preservation Mode: ${
        settings.semanticMode === 'meaning_preservation'
          ? 'Meaning Preservation (Preserve the underlying concept, story, and metaphor)'
          : settings.semanticMode === 'visual_replication'
          ? 'Visual Replication (Replicate physical visual features, materials, and composition closely)'
          : 'Free Ideation (Creative exploration sparked by the reference image)'
      }.
STYLE TRANSFORMATION FOR REFERENCE IMAGE:
- Extract the core subject from the reference image, but RENDER IT STRICTLY in the user's chosen style: "${dirLabel}" (${spec.medium}).
- If the reference image is a photo and the user chose an illustration/vector/3D style, you MUST convert and reimagine that subject in the chosen medium!
- If the reference image has a background but the user selected an isolated style, isolate the subject on pure white!
- The user's chosen visual style takes total priority over the reference image's original medium.
${visualDirectionInstruction}`;
    }
  } else {
    contextIntro = `=== CREATIVE BRIEF (TEXT-ONLY IDEATION) ===
User Brief: "${brief || 'Versatile modern commercial concept'}"
Creative Focus: ${CREATIVE_FOCUS_LABELS[settings.creativeFocus] || settings.creativeFocus}
${twistsBlock}
${visualDirectionInstruction}`;
  }

  return `You are VCPA (Visual Concept Prompt Agent), an elite AI art director and prompt composer for commercial microstock and top-tier AI image generators (Midjourney, FLUX, SDXL).

${contextIntro}

TASK:
Generate EXACTLY ${count} conceptually DISTINCT, visually concrete, and diverse image generation prompt concepts strictly in the user's chosen visual style ("${dirLabel}").

STRICT DIVERSITY & QUALITY RULES:
1. STRICT ADHERENCE TO USER'S SELECTED VISUAL STYLE ("${dirLabel}") [CRITICAL HIGHEST PRIORITY]:
   - Every single prompt's 'rawBasePrompt' MUST naturally be conceived and written in the medium of "${spec.medium}".
   - ${spec.forbiddenElements ? `STRICTLY FORBIDDEN: ${spec.forbiddenElements}.` : ''}
   - If this is an Illustration, Vector, 3D Render, or Graphic style: DO NOT use photographic camera lenses (e.g. Sony A7R, 85mm f/1.4), photographic aperture, realistic human skin grain, or photographic lighting. Describe vector shapes, clean linework, isometric orthographic renders, clay/glass materials, or watercolor washes!
   - If this is an Isolated/Studio style (e.g. Studio Product Isolated, Vector Flat Isolated, Sticker): The subject MUST strictly be isolated on a pure white background with ample copy space. DO NOT create outdoor environments, landscapes, rooms, or beaches!
   - If this is Commercial Lifestyle: Contextualize the setting realistically to the subject (e.g. office for professionals, kitchen for food, home for living, park for sports). DO NOT default to beach scenes unless explicitly requested in the brief!
2. VISUAL SPECIFICITY & COPY SPACE: Every prompt must specify tangible physical subjects, distinct framing matching the style, material textures, and clean negative space for commercial copy and designer typography.
3. NO LAZY VARIATIONS: Each prompt within the chosen visual style must explore a distinct concept, variation, angle, or narrative angle.
4. COMMERCIALLY SAFE & USABLE: Strictly NO copyrighted brand names, recognizable trademarks, or celebrity likenesses.
5. PROMPT LANGUAGE: The 'rawBasePrompt' field MUST be in English for optimal image generation performance. Titles and rationales should be in ${settings.promptLanguage === 'id' ? 'Bahasa Indonesia' : 'English'}.
6. KEEP IT COMPACT: Keep 'rationale' strictly to 1 concise sentence (maximum 20 words) to prevent token truncation.

CRITICAL OUTPUT FORMAT:
You MUST return ONLY a valid, single, parseable JSON object matching this schema exactly. Do NOT include markdown code blocks, do not include backticks, do not include commentary before or after:

${
  mode === 'reference_to_prompt' && !visualDna
    ? `{
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
}`
    : `{
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
}`
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

/**
 * Export all prompts to RFC 4180 standard CSV format with UTF-8 BOM
 * for seamless compatibility with Microsoft Excel, Google Sheets, and Numbers.
 */
export function exportPromptsToCsv(
  prompts: PromptCardItem[],
  settings?: VCPASettings
): string {
  const escapeCsv = (str: string | undefined | null) => {
    if (!str) return '""';
    const clean = String(str).replace(/"/g, '""');
    return `"${clean}"`;
  };

  const headers = [
    'No',
    'Judul Konsep',
    'Prompt AI',
    'Negative Prompt',
    'Strategi Kreatif',
    'Engine',
    'Aspect Ratio',
    'Rationale',
    'Tags',
  ];

  const rows = prompts.map((p, idx) => {
    return [
      idx + 1,
      escapeCsv(p.title),
      escapeCsv(p.prompt),
      escapeCsv(p.negativePrompt || ''),
      escapeCsv(p.creativeStrategy || ''),
      escapeCsv(settings ? ENGINE_LABELS[settings.engine] : ''),
      escapeCsv(settings?.aspectRatio && settings.aspectRatio !== 'none' ? settings.aspectRatio : 'Bebas'),
      escapeCsv(p.rationale || ''),
      escapeCsv(Array.isArray(p.tags) ? p.tags.join(', ') : ''),
    ].join(',');
  });

  const bom = '\uFEFF';
  return bom + [headers.join(','), ...rows].join('\r\n');
}

/**
 * Export pure prompts line by line (queue format) for Midjourney batch bot or ComfyUI/SD batch queues.
 */
export function exportPromptsToQueueText(prompts: PromptCardItem[]): string {
  return prompts
    .map((p) => p.prompt.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Export only prompts that have not been copied yet.
 */
export function exportUncopiedPromptsToQueueText(prompts: PromptCardItem[]): string {
  return exportPromptsToQueueText(prompts.filter((p) => !p.isCopied));
}

