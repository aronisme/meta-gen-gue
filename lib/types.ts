export type FileType = 'auto' | 'photo' | 'illustration' | 'vector' | 'icon' | 'transparent_png' | 'video';
export type AssetType = 'image' | 'video';
export type Provider = 'gas-proxy' | 'openai' | 'gemini';

export interface GenSettings {
  provider: Provider;
  model: string;
  fileType: FileType;
  titleLength: number;           // characters
  descriptionLength: number;     // words
  keywordsCount: number;         // exact count
  extraInstructions: string;
}

export interface MetaOutput {
  title: string;
  description: string;
  keywords: string; // comma-separated
  category?: string;   // Adobe Stock category (numeric code 1-21 or label)
  releases?: string;   // Adobe Stock releases
  shutterstockCategory?: string; // Shutterstock 1st category (official name)
  shutterstockCategory2?: string; // Shutterstock 2nd category (optional)
  illustration?: boolean;
  matureContent?: boolean;
  editorial?: boolean;
  license?: 'pro' | 'free' | 'editorial';
  aiGenerated?: boolean;
  aiPrompt?: string;
  aiModel?: string;
  vecteezyId?: string; // ID from Vecteezy Add Data CSV if present
}

export type SessionStatus = 'draft' | 'running' | 'paused' | 'completed' | 'partial' | 'cancelled';

export interface GenerationSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  settings: GenSettings;
  itemIds: string[];
  totalFiles: number;
  successCount: number;
  errorCount: number;
  exportedAgencies?: string[];
}

export interface ItemMetaBox {
  id: string;
  sessionId?: string;
  filename: string;
  fileType: FileType;
  assetType: AssetType;
  createdAt: number;
  status?: 'queued' | 'preparing' | 'generating' | 'success' | 'error';
  thumbDataUrl?: string; // added after generation
  videoDataUrl?: string; // for video files
  videoDuration?: number; // in seconds
  videoKeyframes?: string[]; // sampled keyframe data URLs
  meta?: MetaOutput;
  error?: string;
}

/* ---------- FTP & Multi-Account Distribution Types ---------- */
export type FtpProtocol = 'sftp' | 'ftp' | 'ftps';
export type MicrostockAgencyId =
  | 'adobe'
  | 'shutterstock'
  | 'vecteezy'
  | 'freepik'
  | 'dreamstime'
  | 'pond5'
  | 'custom';

export interface FtpAccountProfile {
  id: string;                    // UUID unik akun
  agencyId: MicrostockAgencyId;  // Target agensi (adobe, shutterstock, dll)
  accountLabel: string;          // Label kustom (misal: "Adobe Stock - Footage Utama")
  host: string;                  // sftp.contributor.adobestock.com
  port: number;                  // 22 (SFTP) atau 21 (FTP)
  protocol: FtpProtocol;         // sftp | ftp | ftps
  username: string;              // Username kontributor
  password: string;              // Password khusus SFTP / FTP
  createdAt: number;
  lastUsedAt?: number;
}

export interface UploadLedgerRecord {
  id: string;                    // UUID record
  assetHash: string;             // SHA-256 fingerprint isi file
  filename: string;              // Nama file saat diunggah
  fileSize: number;              // Ukuran file dalam bytes
  agencyId: MicrostockAgencyId;  // Agensi tujuan
  accountId: string;             // ID akun yang menerima unggahan
  accountLabel: string;          // Label akun saat diunggah
  uploadedAt: number;            // Timestamp sukses unggah
  status: 'success' | 'failed';
  remotePath?: string;           // Path file di server remote
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  isQueueDuplicate?: boolean;
  duplicateOfFilename?: string;
  matchedRecord?: UploadLedgerRecord;
  warningMessage?: string;
}

export interface FtpQueueItem {
  id: string;
  itemId: string;                // ID ItemMetaBox di sesi
  file: File;
  filename: string;
  fileSize: number;
  assetType: AssetType;
  status: 'pending' | 'checking' | 'uploading' | 'success' | 'skipped' | 'error';
  progress: number;              // 0 - 100%
  speedBytesPerSec?: number;
  error?: string;
  duplicateInfo?: DuplicateCheckResult;
}

