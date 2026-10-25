export type EngineType = 'midjourney' | 'flux' | 'sdxl' | 'imagen3' | 'nanobanana';
export type AspectRatio = 'none' | '16:9' | '3:2' | '1:1' | '4:3' | '9:16';

export type VisualCategory = 'photo' | 'illustration' | 'agent_decide' | 'smart_random';

export type PhotoSubStyle =
  | 'photo_commercial_lifestyle'
  | 'photo_studio_isolated'
  | 'photo_flatlay_knolling'
  | 'photo_macro_texture'
  | 'photo_cinematic_narrative'
  | 'photo_editorial_documentary'
  | 'photo_interior_architecture'
  | 'photo_drone_aerial';

export type IllustrationSubStyle =
  | 'vector_flat_isolated'
  | 'vector_lineart_minimal'
  | 'render_3d_isometric'
  | 'render_3d_clay_glass'
  | 'art_watercolor_handdrawn'
  | 'art_vintage_engraving'
  | 'graphic_sticker_clipart'
  | 'graphic_infographic_asset';

export type VisualDirection =
  | 'agent_decide'
  | 'smart_random'
  | PhotoSubStyle
  | IllustrationSubStyle
  // Legacy backwards compatibility
  | 'photorealistic'
  | '3d_render'
  | 'vector'
  | 'cinematic'
  | 'editorial'
  | 'auto';

export interface ContextualTwistItem {
  id: string;
  label: string;
  category: string;
  modifierText: string;
  isSelected?: boolean;
}

export type CreativeFocus =
  | 'composition_lighting'
  | 'environment_props'
  | 'material_textures'
  | 'storytelling'
  | 'microstock_hero';
export type SemanticMode = 'visual_replication' | 'meaning_preservation' | 'symbolic_exploration' | 'free_ideation';
export type VCPAMode = 'reference_to_prompt' | 'text_ideation';

export interface VisualDNAProfile {
  subject: {
    type: string;
    attributes: string[];
  };
  observed: string[];
  inferred: string[];
  anchors: string[];
  editableVariables: string[];
  semanticProfile?: {
    coreTheme?: string;
    symbolism?: string[];
    metaphor?: string[];
    emotionTension?: string;
    evidence?: string[];
    ambiguity?: 'low' | 'medium' | 'high';
  };
}

export interface VCPASettings {
  count: number;
  similarity: number; // 0 to 100
  engine: EngineType;
  visualDirection: VisualDirection;
  aspectRatio: AspectRatio;
  creativeFocus: CreativeFocus;
  semanticMode: SemanticMode;
  commercialSafety: boolean;
  promptLanguage: 'en' | 'id';
  negativePrompt?: string;
  selectedTwists?: string[];
}

export interface PromptCardItem {
  id: string;
  ordinal: number;
  title: string;
  prompt: string;
  negativePrompt?: string;
  creativeStrategy: string;
  rationale?: string;
  meaningPreserved?: string[];
  tags: string[];
  isFavorite?: boolean;
  isEdited?: boolean;
  isCopied?: boolean;
  copiedAt?: number;
  rawBasePrompt?: string;
  createdAt?: number;
  batchId?: string;
  generatedImageUrl?: string;
  flowStatus?: 'idle' | 'pending' | 'generating' | 'completed' | 'error';
  variations?: FlowVariationItem[];
  selectedVariationIndex?: number;
  mediaToken?: string;
  mediaId?: string;
  qcStatus?: 'pending' | 'passed' | 'failed';
  qcDetails?: string;
}

export interface FlowVariationItem {
  letter: string;
  dataUrl: string;
  token?: string;
  mediaId?: string;
}

export interface PromptGenerationSession {
  id: string;
  userEmail: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: VCPAMode;
  prompts: PromptCardItem[];
  visualDna?: VisualDNAProfile;
  refImageFilename?: string;
  settings: VCPASettings;
}

export interface VCPAResult {
  jobId: string;
  mode: VCPAMode;
  visualDna?: VisualDNAProfile;
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  prompts: PromptCardItem[];
}

export type PromptQueueItemStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface PromptQueueItem {
  id: string;
  source: 'extension' | 'upload' | 'paste' | 'url';
  imageDataUrl: string;
  filename: string;
  addedAt: number;
  status: PromptQueueItemStatus;
  progressStep?: string;
  error?: string;
  completedAt?: number;
  generatedCount?: number;
  brief?: string;
}


