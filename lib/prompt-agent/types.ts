export type EngineType = 'midjourney' | 'flux' | 'sdxl' | 'imagen3' | 'nanobanana';
export type AspectRatio = 'none' | '16:9' | '3:2' | '1:1' | '4:3' | '9:16';
export type VisualDirection = 'photorealistic' | '3d_render' | 'vector' | 'cinematic' | 'editorial' | 'auto';
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
  rawBasePrompt?: string;
  createdAt?: number;
  batchId?: string;
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


