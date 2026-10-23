export type QcDecision = 'BLOCK' | 'REVIEW' | 'READY';

export type QcCheckStatus = 'PASS' | 'FAIL' | 'REVIEW' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type QcSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type QcSourceClass = 'official_adobe' | 'internal_heuristic' | 'research_background' | 'unknown';

export type QcEvidenceType =
  | 'metadata_measurement'
  | 'crop'
  | 'bounding_box'
  | 'ocr_text'
  | 'model_observation'
  | 'user_confirmation'
  | 'document'
  | 'none';

export interface QcRegion {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  width: number; // 0..1 normalized
  height: number; // 0..1 normalized
}

export interface QcCheckFinding {
  check_id: string;
  rule_id?: string | null;
  status: QcCheckStatus;
  severity: QcSeverity;
  confidence?: number | null;
  confidence_calibrated?: boolean;
  source_class: QcSourceClass;
  source_ids?: string[];
  evidence_type?: QcEvidenceType;
  region?: QcRegion | null;
  observation: string;
  why_it_matters?: string;
  suggested_action?: string;
  requires_human_review: boolean;
  user_dismissed?: boolean;
  user_confirmed?: boolean;
  user_notes?: string;
}

export interface TechnicalMetrics {
  format: 'JPEG' | 'PNG' | 'WEBP' | 'OTHER';
  width_px: number;
  height_px: number;
  megapixels: number;
  file_size_bytes: number;
  icc_profile?: string | null;
  has_alpha?: boolean | null;
  alpha_bounding_box?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  checks_run: string[];
  passes_hard_tech: boolean;
  fail_reasons: string[];
}

export interface QcReport {
  schema_version: string;
  asset_id: string;
  file_name: string;
  asset_type: 'photo_jpeg' | 'transparent_png' | 'vector' | 'video' | 'unknown';
  decision: QcDecision;
  decision_summary: string;
  technical: TechnicalMetrics;
  checks: QcCheckFinding[];
  provenance: {
    is_generative_ai: boolean | 'unknown';
    tool_name?: string | null;
    model_name?: string | null;
    prompt_available?: boolean;
    license_status?: 'valid' | 'unknown' | 'invalid';
    people_property_status?: 'real' | 'fictional' | 'unknown';
    model_release_status?: 'attached' | 'needed' | 'unknown' | 'not_applicable';
    property_release_status?: 'attached' | 'needed' | 'unknown' | 'not_applicable';
  };
  metadata_review?: {
    title?: string | null;
    keywords?: string[];
    claims_to_verify?: string[];
    suspected_prohibited_terms?: string[];
  };
  limitations: string[];
  policy_version: string;
  reviewed_at: string;
  model_used?: string;
  provider_used?: string;
}

export interface QcBatchItem {
  id: string;
  file?: File;
  filename: string;
  dataUrl?: string;
  filePath?: string;
  status: 'queued' | 'preflight' | 'inspecting' | 'completed' | 'error';
  report?: QcReport;
  error?: string;
  isFromCache?: boolean;
}
