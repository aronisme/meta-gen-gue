'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { History as HistoryIcon, Home, Key, LogOut, RefreshCw, Sparkles, UploadCloud, Zap } from 'lucide-react';
import { nanoid } from 'nanoid/non-secure';

import { StudioPanel } from '@/components/StudioPanel';
import { ResultsCard } from '@/components/ResultsCard';
import { HistoryCard } from '@/components/HistoryCard';
import { FtpQueueView } from '@/components/FtpQueueView';
import { FtpAccountsView } from '@/components/FtpAccountsView';
import { AppSideRail, type AppModuleId } from '@/components/AppSideRail';
import { PromptGeneratorView } from '@/components/PromptGeneratorView';
import { KeywordResearchView } from '@/components/KeywordResearchView';
import { LandingBerandaView } from '@/components/LandingBerandaView';
import { GoogleAuthModal } from '@/components/GoogleAuthModal';
import { loadFtpProfiles } from '@/lib/ftp/store';
import type { AuthUser } from '@/lib/auth/types';
import { clearStoredUser, getStoredUser, onAuthChange, refreshUserStatus, saveStoredUser } from '@/lib/auth/store';
import { runInitialSilentSync, syncDeleteHistoryItems, syncDeleteSession, SYNC_COMPLETED_EVENT } from '@/lib/sync/engine';

import { resizeImageToMax1024 } from '@/lib/resize';
import { extractVideoKeyframes, isVideoFile } from '@/lib/video';
import { sha256 } from '@/lib/hash';
import { cleanKeywords, parseKeywords } from '@/lib/keywords';
import { filterDuplicateFiles } from '@/lib/dedupe';
import { toast } from 'sonner';
import {
  saveHistoryItem,
  loadHistory,
  deleteHistoryItem,
  deleteHistoryItems,
  getApiKey,
  saveSettings,
  loadSettings,
  saveSession,
  getSession,
  loadSessions,
  deleteSession,
  loadSessionItems,
} from '@/lib/store';
import type { FileType, GenerationSession, ItemMetaBox, MetaOutput, Provider } from '@/lib/types';

/* ---------- constants ---------- */
const GAS_PROXY_MODELS = [
  'auto',
  'gemini-2.5-flash',
  'deepseek-v4.1-flash:free',
  'mimo-v2.6-flash:free',
  'google/gemini-2.0-flash-001',
  'openrouter/auto',
  'qwen/qwen3.8-27b',
  'pixtral-12b-2409',
  'mistralai/mistral-large-3-675b-instruct-2512',
  'mistralai/ministral-14b',
  'sensenova/sensenova-6.8-flash-lite',
];

/* ---------- instruction text ---------- */
function defaultInstruction(opts: {
  fileType: FileType;
  titleLength: number;
  descriptionLength: number;
  keywordsCount: number;
  extra: string;
  isVideo?: boolean;
}) {
  const { fileType, titleLength, descriptionLength, keywordsCount, extra, isVideo } = opts;

  if (isVideo) {
    return `You are a professional stock video and footage metadata generator for global stock agencies (Shutterstock Footage, Adobe Stock Video, Pond5, Getty Images).
Analyze the provided sequence of chronological keyframes captured across the duration of this stock video footage (from start to finish).

**Asset Type:** Stock Video / Footage (${fileType === 'auto' ? 'Auto-detect action' : fileType}).

**Instructions for Video Metadata:**
1. **Title & Description Guidelines (Dynamic Best-Seller Architecture):**
   - **Title:** Create a highly searchable, commercially appealing video title around ${titleLength} characters (target 80-150 characters, maximum 160 characters).
     * STRUCTURE & PUNCTUATION: Use 1 or 2 natural, grammatically complete sentences separated ONLY by periods (.) — STRICTLY NO COMMAS in the title (Adobe Stock CSV strictly forbids commas in title).
     * FRONT-LOADING: Put the most vital 3-4 words first (primary subject + dynamic action, e.g., 'Business team meeting in modern office.').
     * MOTION & CONTEXT: Weave in camera movement, lighting, and natural synonyms smoothly across the sentence(s).
     * DYNAMIC COMMERCIAL CLOSERS (STRICT ANTI-REPETITION RULE): DO NOT repeatedly write 'Concept for...'. Use diverse commercial framings tailored to the footage:
       - Representation: "Representing teamwork and modern corporate leadership."
       - Utility & Media: "Ideal for business presentation and documentary broadcast.", "Suitable for marketing campaign and website background."
       - Spatial & Compositional: "Cinematic 4k slow motion footage with copy space for text."
       - Direct action flow: Or simply describe the complete progression without any forced concept phrase if the action is self-explanatory.
     * CAPITALIZATION: Capitalize only the first word of each sentence and proper nouns. Avoid brand or trademark names.
   - **Description:** Write a factual, detailed description around ${descriptionLength} words detailing the complete progression of action from beginning to end, camera motion (e.g., static, panning, tracking, aerial, slow motion), lighting, and setting.
   - **Keyword Best Practices (Title-Keyword Convergence):** Generate a rich list of exactly ${keywordsCount} comma-separated, SEO-friendly keywords without stopping early.
     * The first 10 keywords MUST converge directly with the title, containing all core subject, action, and context terms used in the title.
     * Include motion keywords (e.g., action verbs, walking, running, panning, movement, footage, 4k, slow motion, aerial, timelapse, tracking shot).

2. **Guidelines for People & Action in Video:**
   - Identify activities as dynamic processes (e.g., running, gesturing, smiling, typing). Include gender, age group, and emotion if relevant.

3. **Guidelines for Objects, Nature & Aerials:**
   - Describe motion patterns (e.g., traffic moving, waves crashing, clouds drifting).

4. **Microstock Category Assignment:**
   - Adobe Stock Category ("category"): Choose code 1 to 21 (e.g. 19=Technology, 12=Lifestyle, 11=Landscape, 20=Transport, etc.).
   - Shutterstock Category ("shutterstockCategory"): Choose the official category name.
   - "illustration": false (unless it is an animation / motion graphic clip).

${extra ? `**Additional Instructions:** ${extra}` : ''}

**Output Format:**
Strict JSON format: {"title": "...", "description": "...", "keywords": "...", "category": "19", "shutterstockCategory": "Technology", "illustration": false}`;
  }

  const fileTypeSpec =
    fileType === 'auto'
      ? 'Auto-detect (determine whether the image is a photo, illustration, vector, 3D render, icon, or transparent graphic based on image content)'
      : fileType;

  return `You are a professional stock photography metadata generator for top microstock platforms (Adobe Stock, Shutterstock, Freepik, Vecteezy). Analyze the provided image and generate metadata following the empirical Universal Best-Seller Metadata Architecture.

**File Type:** ${fileTypeSpec}.

**Instructions:**
1. **Title Guidelines (Dynamic Universal Best-Seller Architecture):**
   - **Length:** Generate a title around ${titleLength} characters (optimal range 90-150 characters, maximum 160 characters).
   - **STRICT NO COMMAS:** DO NOT use any commas in the title. Adobe Stock CSV strictly forbids commas in the title field. Separate clauses or sentences using periods (.) only.
   - **Front-Loading (Algorithmic Priority):** The very first 3-4 words MUST be the primary visual subject and core keyword phrase (e.g., "Fresh organic sushi roll", "Modern data center server rack", "Portrait of confident doctor", "Solar farm wind turbines").
   - **Flexible Organic Sentence Flow:** Compose 1 to 2 natural, expressive sentences separated by periods (.):
     * Sentence 1 (Core Subject & Primary Action/State): [Front-loaded core subject] + [Primary action, state, or setting].
     * Sentence 2 (Context, Synonyms & Intent): Natural high-search-volume synonyms, mood, lighting, or buyer intent.
   - **CRITICAL ANTI-REPETITION RULE (Diversified Commercial Intent):**
     * DO NOT lock into a repetitive formula! NEVER begin the last phrase with "Concept for..." on every single asset.
     * Choose the most natural framing from these diverse options:
       1. **Representation & Metaphor:** "Representing [modern teamwork / healthy living / sustainable growth]...", "A representation of [corporate innovation]...", "Symbolizing [freedom / success / peacefulness]..."
       2. **Commercial Utility & Format:** "Ideal for [website banner / restaurant menu / editorial article]...", "Designed for [marketing brochure / social media advertising]...", "Perfect for [fintech promotion / healthcare campaign]..."
       3. **Composition & Spatial Intent:** "...with copy space for advertising text.", "...isolated on white background with clipping path.", "...flat lay overhead view."
       4. **Pure Organic Visual Flow (No Concept Needed):** For self-evident subjects like food, nature, landscapes, animals, vectors, and portraits, you DO NOT need any concept phrase at all! A vivid, detail-rich description with natural synonyms is often the highest-converting title (e.g., "Artisanal sourdough bread loaf on rustic wooden cutting board with scattered flour.").
   - **Capitalization & Brand Safety:** Capitalize only the first letter of each sentence and proper nouns. Strictly avoid trademarked names, logos, or celebrity names.

2. **Description Guidelines:**
   - Write a detailed, factual description around ${descriptionLength} words expanding on the visual narrative, color palette, lighting, angle, and atmosphere. Capitalize only the first word and proper nouns.

3. **Keyword Guidelines (Title-Keyword Convergence):**
   - Use singular nouns and factual adjectives.
   - Generate a rich, comprehensive list of exactly ${keywordsCount} comma-separated, SEO-friendly keywords without stopping early.
   - **Convergence Rule:** The first 5 to 10 keywords MUST strictly converge with the title, containing every primary keyword and synonym present in the title's sentences.
   - Follow with secondary contextual keywords: visual elements, background, composition (e.g., copy space, close up, flat lay), lighting, mood, concept, and commercial domain.

4. **Category-Specific Guidance (Universal across all 21 Stock Categories):**
   - **People & Lifestyle:** Identify activities, roles (mother, student, engineer), demographics, and emotional expression. Be respectful and objective.
   - **Objects, Food & Architecture:** Use specific nouns (e.g., espresso, sourdough bread, minimalist kitchen). Describe textures, materials, and angles.
   - **Nature, Animals & Landscapes:** Use exact species or geographical features (e.g., golden retriever, tropical palm tree, alpine mountain lake).
   - **Graphic Resources, AI & Vectors:** If the asset is an illustration, vector, 3D render, icon, or generative AI image, explicitly note the style (e.g., "3d render", "vector illustration", "generative ai") and set "illustration": true. Set "illustration": false for authentic photographs.
   - **Isolated & Transparent Backgrounds:** If the subject has an isolated or transparent background, include "isolated on white", "transparent background", "cutout", or "clipping path".

5. **Microstock Category Assignment:**
   - **Adobe Stock Category ("category"):** Choose the single most accurate numeric code (1 to 21):
     1=Animals, 2=Buildings and Architecture, 3=Business, 4=Drinks, 5=The Environment, 6=States of Mind, 7=Food, 8=Graphic Resources, 9=Hobbies and Leisure, 10=Industry, 11=Landscape, 12=Lifestyle, 13=People, 14=Plants and Flowers, 15=Culture and Religion, 16=Science, 17=Social Issues, 18=Sports, 19=Technology, 20=Transport, 21=Travel.
   - **Shutterstock Category ("shutterstockCategory"):** Choose the most accurate category name:
     Abstract, Animals/Wildlife, Arts, Backgrounds/Textures, Beauty/Fashion, Buildings/Landmarks, Business/Finance, Celebrities, Education, Food and Drink, Healthcare/Medical, Holidays, Industrial, Interiors, Miscellaneous, Nature, Objects, Parks/Outdoor, People, Religion, Science, Signs/Symbols, Sports/Recreation, Technology, Transportation, Vintage.

${extra ? `**Additional Instructions:** ${extra}` : ''}

**Output Format:**
Provide the output in strict JSON format. Do not include any text before or after the JSON object. The JSON object must have keys: "title", "description", "keywords", "category" (number 1-21 as string), "shutterstockCategory" (name as string), and "illustration" (boolean).

Example JSON output:
{
  "title": "Minimalist modern desk setup with laptop. Clean home office workspace with potted plant and coffee cup representing remote work productivity.",
  "description": "Aerial view of a clean modern workplace with laptop computer, ceramic coffee mug, notebook, and succulent potted plant on an oak wooden table in natural morning sunlight.",
  "keywords": "desk, laptop, home office, workspace, computer, modern desk, remote work, freelance, productivity, table, coffee cup, houseplant, wooden desk, copy space, minimal, overhead view, business, technology",
  "category": "19",
  "shutterstockCategory": "Technology",
  "illustration": false
}`;
}

/* ---------- helpers ---------- */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3, backoffMs = 600): Promise<T> {
  let last: unknown;
  for (let t = 0; t < tries; t++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      if (t < tries - 1) await sleep(backoffMs * (t + 1));
    }
  }
  throw last;
}

function normalizeMeta(raw: unknown): MetaOutput | null {
  if (!raw) return null;

  let obj: Record<string, unknown> | null = null;

  // 1. If string, parse or extract JSON substring
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const s = trimmed.indexOf('{');
      const e = trimmed.lastIndexOf('}');
      if (s >= 0 && e > s) {
        try {
          const slice = trimmed.slice(s, e + 1);
          obj = JSON.parse(slice) as Record<string, unknown>;
        } catch {
          try {
            const repaired = trimmed
              .slice(s, e + 1)
              .replace(/,\s*([\]\}])/g, '$1')
              .replace(/[\u0000-\u001F]+/g, ' ');
            obj = JSON.parse(repaired) as Record<string, unknown>;
          } catch {}
        }
      }
    }
  } else if (Array.isArray(raw)) {
    const firstObj = raw.find((x) => x && typeof x === 'object');
    if (firstObj) obj = firstObj as Record<string, unknown>;
  } else if (typeof raw === 'object' && raw !== null) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) return null;

  // 2. Unwrap nested container wrappers if present
  const unwrappers = ['data', 'metadata', 'result', 'response', 'output', 'content', 'item', 'asset', 'choices'];
  for (const k of unwrappers) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      obj = obj[k] as Record<string, unknown>;
    } else if (Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0) {
      const first = (obj[k] as unknown[])[0];
      if (first && typeof first === 'object') {
        const choiceMsg = (first as Record<string, unknown>).message;
        if (choiceMsg && typeof choiceMsg === 'object' && (choiceMsg as Record<string, unknown>).content) {
          const contentStr = String((choiceMsg as Record<string, unknown>).content);
          try {
            const parsedContent = JSON.parse(contentStr);
            if (parsedContent && typeof parsedContent === 'object') {
              obj = parsedContent as Record<string, unknown>;
            }
          } catch {}
        } else {
          obj = first as Record<string, unknown>;
        }
      }
    }
  }

  // 3. Case-insensitive key lookup helper
  const getField = (keys: string[]): unknown => {
    if (!obj) return undefined;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
      const foundKey = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
      if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') {
        return obj[foundKey];
      }
    }
    return undefined;
  };

  const rawTitle = getField(['title', 'name', 'headline', 'image_title', 'caption', 'title_en', 'photo_title', 'subject']);
  const rawDesc = getField(['description', 'desc', 'caption', 'summary', 'details', 'about', 'text']);
  const rawKeywords = getField(['keywords', 'tags', 'keyword_list', 'tag_list', 'labels', 'key_words', 'keyword', 'tag']);

  let title = '';
  if (typeof rawTitle === 'string') {
    title = rawTitle.trim();
  } else if (typeof rawTitle === 'object' && rawTitle !== null) {
    const rec = rawTitle as Record<string, unknown>;
    title = String(rec.text || rec.value || rec.title || '').trim();
  }

  let description = '';
  if (typeof rawDesc === 'string') {
    description = rawDesc.trim();
  } else if (typeof rawDesc === 'object' && rawDesc !== null) {
    const rec = rawDesc as Record<string, unknown>;
    description = String(rec.text || rec.value || rec.desc || '').trim();
  }

  let keywords = '';
  if (Array.isArray(rawKeywords)) {
    keywords = rawKeywords
      .map((k) => {
        if (typeof k === 'string') return k.trim();
        if (typeof k === 'object' && k !== null) {
          const rec = k as Record<string, unknown>;
          return String(rec.keyword || rec.tag || rec.name || rec.value || '').trim();
        }
        return String(k).trim();
      })
      .filter(Boolean)
      .join(', ');
  } else if (typeof rawKeywords === 'string') {
    keywords = rawKeywords.trim();
  }

  // 4. Intelligent resilient fallbacks:
  if (!title && description) {
    title = description.split(/[.\n]/)[0].trim().slice(0, 150);
  }
  if (!description && title) {
    description = title;
  }
  if (!keywords && (title || description)) {
    const combined = `${title} ${description}`.toLowerCase();
    const words = combined.match(/[a-zA-Z]{3,}/g) || [];
    keywords = Array.from(new Set(words)).slice(0, 25).join(', ');
  }

  if (!title || !keywords) return null;

  const rawCat = getField(['category', 'category_id', 'adobeCategory', 'adobe_category']);
  const rawShutterCat = getField(['shutterstockCategory', 'shutterstock_category', 'shutterCategory']);
  const rawIllus = getField(['illustration', 'is_illustration', 'vector']);
  const rawModel = getField(['aiModel', 'model']);

  return {
    title,
    description: description || title,
    keywords,
    category: typeof rawCat === 'string' || typeof rawCat === 'number' ? String(rawCat).trim() : undefined,
    shutterstockCategory: typeof rawShutterCat === 'string' ? rawShutterCat.trim() : undefined,
    illustration: typeof rawIllus === 'boolean' ? rawIllus : undefined,
    aiGenerated: true,
    aiModel: typeof rawModel === 'string' ? rawModel : undefined,
  };
}

async function pLimit<T>(
  concurrency: number,
  tasks: Array<() => Promise<T>>,
  onUpdate?: (ret: Array<T | undefined>) => void
): Promise<T[]> {
  const ret: Array<T | undefined> = new Array(tasks.length);
  let next = 0;
  let active = 0;
  return new Promise<T[]>((resolve) => {
    const run = () => {
      while (active < concurrency && next < tasks.length) {
        const idx = next++;
        active++;
        tasks[idx]()
          .then((r) => {
            ret[idx] = r;
            onUpdate?.(ret);
          })
          .finally(() => {
            active--;
            if (next === tasks.length && active === 0) resolve(ret as T[]);
            else run();
          });
      }
    };
    run();
  });
}

/* ============================== PAGE ============================== */
export default function App() {
  // Provider & API key state - Default to GAS AI Proxy
  const [provider, setProvider] = useState<Provider>('gas-proxy');
  const [model, setModel] = useState(GAS_PROXY_MODELS[0]);
  const [apiKey, setApiKey] = useState('');

  // Settings state
  const [fileType, setFileType] = useState<FileType>('auto');
  const [titleLength, setTitleLength] = useState(120);
  const [descriptionLength, setDescriptionLength] = useState(60);
  const [keywordsCount, setKeywordsCount] = useState(35);
  const [extra, setExtra] = useState('');

  // Files & generation state
  const [files, setFiles] = useState<File[]>([]);
  const [sessionFiles, setSessionFiles] = useState<File[]>([]);
  const [items, setItems] = useState<ItemMetaBox[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  // Session state
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<GenerationSession | null>(null);

  // Top-level App Module state (Side Rail)
  const [activeModule, setActiveModule] = useState<AppModuleId>('beranda');

  // Tab & history state
  const [tab, setTab] = useState<'generate' | 'history' | 'upload' | 'accounts'>('generate');
  const [histPage, setHistPage] = useState(0);
  const pageSize = 100;
  const [hist, setHist] = useState<{ items: ItemMetaBox[]; total: number }>({ items: [], total: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ftpProfilesCount, setFtpProfilesCount] = useState<number>(0);

  // Background upload state shared with FtpQueueView
  const [uploadProgressState, setUploadProgressState] = useState<{
    isUploading: boolean;
    completedCount: number;
    totalCount: number;
    currentFilename?: string;
    speed?: string;
  }>({
    isUploading: false,
    completedCount: 0,
    totalCount: 0,
  });

  // Google Auth & User state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isSettingsInitialized = useRef(false);

  // Logout handler with comprehensive state sanitization
  const handleLogout = useCallback(() => {
    clearStoredUser();
    setCurrentUser(null);
    setItems([]);
    setFiles([]);
    setSessions([]);
    setCurrentSession(null);
    setHist({ items: [], total: 0 });
    setSelectedIds(new Set());
    setFtpProfilesCount(0);
    setActiveModule('beranda');
    toast.success('Anda telah berhasil keluar dari akun Google.');
  }, []);

  // Sync count of FTP profiles
  useEffect(() => {
    void loadFtpProfiles().then((p) => setFtpProfilesCount(p.length));
  }, [tab]);

  // Sync Google Auth session on mount and background refresh + Cloud Auto-Sync
  useEffect(() => {
    const initialUser = getStoredUser();
    if (initialUser) {
      setCurrentUser(initialUser);
      // Pengguna yang sudah login langsung diarahkan ke Studio
      setActiveModule('metadata');
      void runInitialSilentSync(initialUser.email);
    } else {
      // Pengguna baru/tamu disambut oleh Halaman Beranda
      setActiveModule('beranda');
      setItems([]);
      setFiles([]);
      setSessions([]);
      setCurrentSession(null);
      setHist({ items: [], total: 0 });
      setFtpProfilesCount(0);
    }

    const unsub = onAuthChange((user) => {
      setCurrentUser(user);
      if (user) {
        // Setelah login berhasil, langsung masuk ke Studio & jalankan silent sync
        setActiveModule('metadata');
        void refreshHistory();
        void loadSessions().then(setSessions);
        void loadFtpProfiles().then((p) => setFtpProfilesCount(p.length));
        void runInitialSilentSync(user.email);
      } else {
        // Saat logout, kembali ke Beranda & bersihkan data layar secara menyeluruh
        setActiveModule('beranda');
        setItems([]);
        setFiles([]);
        setSessions([]);
        setCurrentSession(null);
        setHist({ items: [], total: 0 });
        setSelectedIds(new Set());
        setFtpProfilesCount(0);
      }
    });

    // Reaktif saat cloud data selesai disinkronkan ke IndexedDB
    const handleSyncComplete = () => {
      void refreshHistory();
      void loadSessions().then(setSessions);
      void loadFtpProfiles().then((p) => setFtpProfilesCount(p.length));
      const latestSettings = loadSettings();
      if (latestSettings) {
        setModel(GAS_PROXY_MODELS.includes(latestSettings.model) ? latestSettings.model : GAS_PROXY_MODELS[0]);
        setFileType(latestSettings.fileType);
        setTitleLength(latestSettings.titleLength);
        setDescriptionLength(latestSettings.descriptionLength);
        setKeywordsCount(latestSettings.keywordsCount);
        setExtra(latestSettings.extraInstructions);
      }
    };
    window.addEventListener(SYNC_COMPLETED_EVENT, handleSyncComplete);

    void refreshUserStatus().then((updated) => {
      if (updated) {
        setCurrentUser(updated);
        void runInitialSilentSync(updated.email);
      }
    });

    return () => {
      unsub();
      window.removeEventListener(SYNC_COMPLETED_EVENT, handleSyncComplete);
    };
  }, []);

  // Load saved settings on mount
  useEffect(() => {
    const saved = loadSettings();
    if (saved) {
      setProvider('gas-proxy');
      setModel(GAS_PROXY_MODELS.includes(saved.model) ? saved.model : GAS_PROXY_MODELS[0]);
      setFileType(saved.fileType);
      setTitleLength(saved.titleLength);
      setDescriptionLength(saved.descriptionLength);
      setKeywordsCount(saved.keywordsCount);
      setExtra(saved.extraInstructions);
    }
    setApiKey(getApiKey('gas-proxy'));
    isSettingsInitialized.current = true;
  }, []);

  // Update API key when provider changes
  useEffect(() => {
    setApiKey(getApiKey(provider));
    const currentModels = GAS_PROXY_MODELS;
    if (!currentModels.includes(model)) {
      setModel(currentModels[0]);
    }
  }, [provider, model]);

  // Save settings when they change (only after initial load to avoid overwriting cloud settings)
  useEffect(() => {
    if (!isSettingsInitialized.current) return;
    saveSettings({
      provider,
      model,
      fileType,
      titleLength,
      descriptionLength,
      keywordsCount,
      extraInstructions: extra,
    });
  }, [provider, model, fileType, titleLength, descriptionLength, keywordsCount, extra]);

  // Refresh history and sessions
  const refreshHistory = useCallback(async () => {
    const [h, sList] = await Promise.all([
      loadHistory(histPage, pageSize),
      loadSessions(),
    ]);
    setHist(h);
    setSessions(sList);
    setSelectedIds(new Set());
  }, [histPage]);

  // Refresh history on mount and tab switch so Riwayat count is always accurate
  useEffect(() => {
    void refreshHistory();
  }, [tab, refreshHistory]);

  // Session handlers
  const handleNewSession = useCallback(() => {
    setItems([]);
    setFiles([]);
    setSessionFiles([]);
    setCurrentSession(null);
    setProgress(0);
  }, []);

  const handleLoadSession = useCallback(async (session: GenerationSession) => {
    const loadedItems = await loadSessionItems(session.itemIds);
    setItems(loadedItems);
    setCurrentSession(session);
    setFiles([]);
    setSessionFiles([]);
    setTab('generate');
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (confirm('Hapus sesi tugas ini dan semua file di dalamnya dari riwayat?')) {
        const session = await getSession(sessionId);
        const itemIds = session?.itemIds;
        await deleteSession(sessionId, true);
        void syncDeleteSession(sessionId, itemIds);
        await refreshHistory();
        if (currentSession?.id === sessionId) {
          setCurrentSession(null);
          setItems([]);
        }
      }
    },
    [refreshHistory, currentSession]
  );

  // Check if any files are videos
  const hasVideoFiles = useMemo(
    () => files.some(isVideoFile),
    [files]
  );

  // Session title rename handler
  const handleUpdateSessionTitle = useCallback(
    async (newTitle: string) => {
      if (!currentSession || !newTitle.trim()) return;
      const updated: GenerationSession = {
        ...currentSession,
        title: newTitle.trim(),
        updatedAt: Date.now(),
      };
      setCurrentSession(updated);
      await saveSession(updated);
    },
    [currentSession]
  );

  // Generation handler (Akumulatif seperti dokumen kerja Office)
  async function runGeneration() {
    if (!files.length) return;

    // Safety filter duplikat terhadap item yang sudah selesai
    const { acceptedFiles, rejectedDuplicates } = await filterDuplicateFiles(files, {
      existingItemFilenames: items.map((it) => it.filename),
    });

    if (rejectedDuplicates.length > 0) {
      toast.warning(
        `${rejectedDuplicates.length} file diabaikan karena sudah ada di sesi tugas ini.`
      );
      setFiles(acceptedFiles);
    }

    if (!acceptedFiles.length) {
      toast.info('Semua file terpilih sudah pernah digenerate dalam sesi ini.');
      return;
    }

    if (currentUser?.status === 'blocked') {
      toast.error('Akun Anda dinonaktifkan oleh administrator.');
      return;
    }
    if (currentUser && currentUser.status !== 'active' && currentUser.role !== 'admin') {
      toast.warning(`Akun ${currentUser.email} sedang menunggu persetujuan whitelist.`);
    }
    if (currentUser && currentUser.role !== 'admin' && currentUser.remainingQuota <= 0) {
      toast.error('Kuota harian Anda telah habis (0 generasi tersisa). Kuota akan di-reset otomatis besok.');
      setShowAuthModal(true);
      return;
    }

    setBusy(true);
    setProgress(0);
    setStatusText('Memulai proses...');

    // Pertahankan file fisik di memori sesi aktif agar langsung siap untuk FTP upload
    const currentBatchFiles = [...acceptedFiles];
    setSessionFiles((prev) => {
      const map = new Map<string, File>();
      for (const f of prev) map.set(f.name.toLowerCase(), f);
      for (const f of currentBatchFiles) map.set(f.name.toLowerCase(), f);
      return Array.from(map.values());
    });

    const baseItems = items; // Pertahankan item yang sudah ada di sesi tugas saat ini!
    const activeSessionId = currentSession?.id || nanoid();
    const sessionDateStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const activeSession: GenerationSession = currentSession || {
      id: activeSessionId,
      title: `Sesi Tugas (${baseItems.length + acceptedFiles.length} Item - ${sessionDateStr})`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'running',
      settings: {
        provider,
        model,
        fileType,
        titleLength,
        descriptionLength,
        keywordsCount,
        extraInstructions: extra,
      },
      itemIds: baseItems.map((it) => it.id),
      totalFiles: baseItems.length + acceptedFiles.length,
      successCount: baseItems.filter((it) => !it.error).length,
      errorCount: baseItems.filter((it) => !!it.error).length,
    };
    setCurrentSession({ ...activeSession, status: 'running' });
    await saveSession({ ...activeSession, status: 'running' });

    const instr = defaultInstruction({ fileType, titleLength, descriptionLength, keywordsCount, extra });
    const instructionHash = await sha256(instr);

    const genOne = async (file: File): Promise<ItemMetaBox> => {
      const isVideo = isVideoFile(file);
      let capturedDataUrl: string | undefined;
      let capturedDuration: number | undefined;
      let capturedKeyframes: string[] | undefined;

      try {
        if (isVideo) {
          setStatusText(`Mengekstrak frame video: ${file.name}...`);
          // Ekstrak 5 frame kunci dari video untuk vision multimodal (maks 640px)
          const extracted = await extractVideoKeyframes(
            file,
            5,
            640,
            undefined,
            (curr, tot) => {
              setStatusText(`Frame ${curr}/${tot} diekstrak (${file.name})`);
              setProgress((prev) => Math.max(prev, Math.round((curr / tot) * 45)));
            }
          );
          capturedDataUrl = extracted.thumbDataUrl;
          capturedDuration = extracted.duration;
          capturedKeyframes = extracted.frames;
          setStatusText(`Menganalisis video dengan AI (${file.name})...`);
          setProgress((prev) => Math.max(prev, 55));
        } else {
          setStatusText(`Mengoptimasi gambar: ${file.name}...`);
          const resized = await resizeImageToMax1024(file);
          capturedDataUrl = resized.dataUrl;
          setStatusText(`Menganalisis gambar dengan AI (${file.name})...`);
          setProgress((prev) => Math.max(prev, 40));
        }

        const effectiveInstr = isVideo
          ? defaultInstruction({ fileType, titleLength, descriptionLength, keywordsCount, extra, isVideo: true })
          : instr;
        const effectiveHash = isVideo ? await sha256(effectiveInstr) : instructionHash;

        const body = {
          apiKey,
          model,
          instruction: effectiveInstr,
          instructionHash: effectiveHash,
          imageDataUrl: capturedDataUrl,
          imageDataUrls: capturedKeyframes,
          userEmail: currentUser?.email,
          googleIdToken: currentUser?.idToken,
        };
        const url = provider === 'openai'
          ? '/api/generate/openai'
          : '/api/generate/proxy';

        const res = await withRetry(
          () =>
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }).then(async (r) => {
              if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
              return r;
            }),
          3,
          600
        );

        const parsed: unknown = await res.json();
        const normalized = normalizeMeta(parsed);
        if (!normalized) throw new Error('Model returned invalid JSON shape.');

        // Update kuota pengguna secara reaktif dan instan di antarmuka
        const quotaInfo = (parsed as { userQuota?: { dailyQuota?: number; usageCount?: number; remainingQuota?: number } })?.userQuota;
        if (quotaInfo && currentUser) {
          setCurrentUser((prev) => {
            if (!prev) return null;
            const updated: AuthUser = {
              ...prev,
              dailyQuota: quotaInfo.dailyQuota ?? prev.dailyQuota,
              usageCount: quotaInfo.usageCount ?? prev.usageCount,
              remainingQuota: quotaInfo.remainingQuota ?? prev.remainingQuota,
            };
            saveStoredUser(updated);
            return updated;
          });
        } else if (currentUser && currentUser.role !== 'admin') {
          setCurrentUser((prev) => {
            if (!prev) return null;
            const nextUsage = (prev.usageCount || 0) + 1;
            const updated: AuthUser = {
              ...prev,
              usageCount: nextUsage,
              remainingQuota: Math.max(0, prev.dailyQuota - nextUsage),
            };
            saveStoredUser(updated);
            return updated;
          });
        }

        const detectedIllustration =
          typeof normalized.illustration === 'boolean'
            ? normalized.illustration
            : fileType === 'illustration' || fileType === 'vector';

        const fixed: MetaOutput = {
          title: normalized.title,
          description: normalized.description,
          keywords: cleanKeywords(normalized.keywords, keywordsCount),
          category: normalized.category,
          shutterstockCategory: normalized.shutterstockCategory,
          illustration: detectedIllustration,
          aiGenerated: true,
          aiModel: normalized.aiModel || (model === 'auto' ? 'Auto (GAS Proxy)' : model),
        };

        const resolvedFileType: FileType = isVideo
          ? 'video'
          : fileType === 'auto'
            ? (detectedIllustration ? 'illustration' : 'photo')
            : fileType;

        const box: ItemMetaBox = {
          id: nanoid(),
          sessionId: activeSessionId,
          filename: file.name,
          fileType: resolvedFileType,
          assetType: isVideo ? 'video' : 'image',
          status: 'success',
          createdAt: Date.now(),
          thumbDataUrl: capturedDataUrl,
          videoDuration: capturedDuration,
          videoKeyframes: isVideo ? capturedKeyframes : undefined,
          meta: fixed,
        };
        await saveHistoryItem(box);
        return box;
      } catch (err: unknown) {
        // Fallback: If image thumbnail wasn't captured, try reading file directly as DataURL
        if (!capturedDataUrl && !isVideo) {
          try {
            capturedDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => resolve('');
              reader.readAsDataURL(file);
            });
          } catch {}
        }

        const msg = err instanceof Error ? err.message : String(err);
        const box: ItemMetaBox = {
          id: nanoid(),
          sessionId: activeSessionId,
          filename: file.name,
          fileType: isVideo ? 'video' : (fileType === 'auto' ? 'photo' : fileType),
          assetType: isVideo ? 'video' : 'image',
          status: 'error',
          createdAt: Date.now(),
          thumbDataUrl: capturedDataUrl,
          videoDuration: capturedDuration,
          videoKeyframes: isVideo ? capturedKeyframes : undefined,
          error: msg,
        };
        await saveHistoryItem(box);
        return box;
      }
    };

    const tasks = acceptedFiles.map((f) => () => genOne(f));
    const results = await pLimit<ItemMetaBox>(4, tasks, (ret) => {
      const done = ret.filter(Boolean).length;
      setProgress(Math.round((done / acceptedFiles.length) * 100));
      const newlyDone = ret.filter(Boolean) as ItemMetaBox[];
      setItems([...baseItems, ...newlyDone]);
    });

    const newlyCompleted = results.filter(Boolean);
    const allSessionItems = [...baseItems, ...newlyCompleted];
    setItems(allSessionItems);

    const successCount = allSessionItems.filter((it) => !it.error).length;
    const errorCount = allSessionItems.filter((it) => !!it.error).length;
    const finalSession: GenerationSession = {
      ...activeSession,
      title: activeSession.title.includes('(')
        ? `Sesi Tugas (${allSessionItems.length} Item - ${sessionDateStr})`
        : activeSession.title,
      status: errorCount > 0 ? (successCount > 0 ? 'partial' : 'cancelled') : 'completed',
      updatedAt: Date.now(),
      itemIds: allSessionItems.map((it) => it.id),
      totalFiles: allSessionItems.length,
      successCount,
      errorCount,
    };
    setCurrentSession(finalSession);
    await saveSession(finalSession);
    await refreshHistory();
    void refreshUserStatus();

    setBusy(false);
    setStatusText('');
    setFiles([]);
  }

  /* ----- item helpers ----- */
  function patchItemMeta(id: string, patch: Partial<MetaOutput>) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, meta: { ...(it.meta || { title: '', description: '', keywords: '' }), ...patch } } : it
      )
    );
  }

  async function saveEdits(id: string) {
    const it = items.find((x) => x.id === id);
    if (it) await saveHistoryItem(it);
  }

  async function tidyKeywords(id: string) {
    const it = items.find((x) => x.id === id);
    if (!it?.meta) return;
    const cleaned = cleanKeywords(it.meta.keywords, keywordsCount);
    const next = { ...it, meta: { ...(it.meta as MetaOutput), keywords: cleaned } };
    setItems((prev) => prev.map((i) => (i.id === id ? next : i)));
    await saveHistoryItem(next);
  }

  function onChipDrop(itemId: string, from: number, to: number) {
    const it = items.find((x) => x.id === itemId);
    if (!it?.meta) return;
    const arr = parseKeywords(it.meta.keywords);
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    patchItemMeta(itemId, { keywords: arr.join(', ') });
  }

  async function regenerate(id: string) {
    const it = items.find((x) => x.id === id);
    if (!it) return;

    let dataUrl = it.thumbDataUrl || it.videoDataUrl;
    // Fallback: search files or sessionFiles if thumbnail was missing
    if (!dataUrl) {
      const matchFile = files.find((f) => f.name === it.filename) || sessionFiles.find((f) => f.name === it.filename);
      if (matchFile) {
        if (isVideoFile(matchFile)) {
          const extracted = await extractVideoKeyframes(matchFile, 5, 640);
          dataUrl = extracted.thumbDataUrl;
          it.thumbDataUrl = extracted.thumbDataUrl;
          it.videoDuration = extracted.duration;
          it.videoKeyframes = extracted.frames;
        } else {
          const resized = await resizeImageToMax1024(matchFile);
          dataUrl = resized.dataUrl;
          it.thumbDataUrl = resized.dataUrl;
        }
      }
    }

    if (!dataUrl) {
      toast.error(`File '${it.filename}' tidak memiliki data visual untuk diproses ulang. Silakan pilih kembali file ini di panel upload.`);
      return;
    }

    if (currentUser?.status === 'blocked') {
      toast.error('Akun Anda dinonaktifkan oleh administrator.');
      return;
    }
    if (currentUser && currentUser.role !== 'admin' && currentUser.remainingQuota <= 0) {
      toast.error('Kuota harian Anda telah habis. Kuota akan di-reset besok.');
      setShowAuthModal(true);
      return;
    }

    setBusy(true);
    setStatusText(`Memproses ulang metadata: ${it.filename}...`);
    // Clear error & set status to generating
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, error: undefined, status: 'generating' } : i))
    );

    try {
      const isVideo = it.assetType === 'video';
      const instr = defaultInstruction({
        fileType: it.fileType,
        titleLength,
        descriptionLength,
        keywordsCount,
        extra,
        isVideo,
      });
      const instructionHash = await sha256(instr);

      const body = {
        apiKey,
        model,
        instruction: instr,
        instructionHash,
        imageDataUrl: dataUrl,
        imageDataUrls: it.videoKeyframes,
        userEmail: currentUser?.email,
        googleIdToken: currentUser?.idToken,
      };
      const url = provider === 'openai'
        ? '/api/generate/openai'
        : '/api/generate/proxy';

      const res = await withRetry(
        () =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
            return r;
          }),
        3,
        600
      );

      const parsed: unknown = await res.json();
      const normalized = normalizeMeta(parsed);
      if (!normalized) throw new Error('Model returned invalid JSON shape.');

      const detectedIllustration =
        typeof normalized.illustration === 'boolean'
          ? normalized.illustration
          : it.fileType === 'illustration' || it.fileType === 'vector';

      const fixed: MetaOutput = {
        title: normalized.title,
        description: normalized.description,
        keywords: cleanKeywords(normalized.keywords, keywordsCount),
        category: normalized.category ?? it.meta?.category,
        shutterstockCategory: normalized.shutterstockCategory ?? it.meta?.shutterstockCategory,
        illustration: detectedIllustration,
        aiGenerated: true,
        aiModel: normalized.aiModel || (model === 'auto' ? 'Auto (GAS Proxy)' : model),
      };
      const updated: ItemMetaBox = {
        ...it,
        thumbDataUrl: dataUrl,
        meta: fixed,
        error: undefined,
        status: 'success'
      };
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      await saveHistoryItem(updated);
      toast.success(`Metadata untuk ${it.filename} berhasil digenerate!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, error: msg, status: 'error' } : i)));
      toast.error(`Gagal memproses ulang ${it.filename}: ${msg}`);
    } finally {
      setBusy(false);
      setStatusText('');
    }
  }

  /* ----- history handlers ----- */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelectable = hist.items.filter((i) => !i.error);
    const allSelected = selectedIds.size === allSelectable.length && selectedIds.size > 0;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allSelectable.map((i) => i.id)));
    }
  }

  async function handleDeleteHistoryItem(id: string) {
    await deleteHistoryItem(id);
    void syncDeleteHistoryItems([id]);
    await refreshHistory();
  }

  async function handleBulkDelete(ids: string[]) {
    await deleteHistoryItems(ids);
    void syncDeleteHistoryItems(ids);
    await refreshHistory();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fffaf0] text-[#2c1810]">
      {/* Primary Side Rail Navigation (left vertical icon strip) */}
      <AppSideRail
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isUploadingInBackground={uploadProgressState.isUploading && activeModule !== 'metadata'}
        currentUser={currentUser}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1536px] mx-auto p-4 md:p-6 lg:p-8 space-y-6 w-full">
        {/* Module 0: Beranda & Pengenalan Platform */}
        <div className={activeModule === 'beranda' ? 'block' : 'hidden'}>
          <LandingBerandaView
            currentUser={currentUser}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onNavigateToStudio={() => setActiveModule('metadata')}
            onNavigateToPromptGen={() => setActiveModule('prompt-gen')}
            onNavigateToKeywords={() => setActiveModule('keyword-research')}
          />
        </div>

        {/* Module 1: Metadata Generator & Multi-FTP Suite */}
        <div className={activeModule === 'metadata' ? 'space-y-6' : 'hidden'}>
          {/* Sleek Editorial Header Bar */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveModule('beranda')}
                className="w-10 h-10 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
                title="Ke Halaman Beranda"
              >
                <Zap className="w-5 h-5 fill-current" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#2c1810]">
                    MetaGen Studio
                  </h1>
                  <button
                    type="button"
                    onClick={() => setActiveModule('beranda')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6b5344] hover:text-[#2c1810] px-2 py-0.5 rounded-md hover:bg-[#fff5e6] transition-colors cursor-pointer"
                    title="Buka Halaman Beranda"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Beranda</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation Tabs in Top Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex p-1 rounded-xl bg-[#fff5e6] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] text-[#2c1810]">
                <button
                  onClick={() => setTab('generate')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    tab === 'generate'
                      ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810] border-2 border-[#2c1810]'
                      : 'text-[#2c1810] hover:bg-[#ffebd1]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Studio</span>
                </button>
                <button
                  onClick={() => setTab('history')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    tab === 'history'
                      ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810] border-2 border-[#2c1810]'
                      : 'text-[#2c1810] hover:bg-[#ffebd1]'
                  }`}
                >
                  <HistoryIcon className="w-3.5 h-3.5" />
                  <span>Riwayat ({hist.total})</span>
                </button>
                <button
                  onClick={() => setTab('upload')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer relative ${
                    tab === 'upload'
                      ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810] border-2 border-[#2c1810]'
                      : uploadProgressState.isUploading
                      ? 'bg-[#ffe4d6] text-[#ff6b35] border-2 border-[#ff6b35] animate-pulse shadow-[2px_2px_0_#ff6b35]'
                      : 'text-[#2c1810] hover:bg-[#ffebd1]'
                  }`}
                >
                  {uploadProgressState.isUploading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#ff6b35]" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {uploadProgressState.isUploading
                      ? `Mengunggah (${uploadProgressState.completedCount}/${uploadProgressState.totalCount})`
                      : `Antrean Upload (${items.length})`}
                  </span>
                  {uploadProgressState.isUploading && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute -top-1 -right-1" />
                  )}
                </button>
                <button
                  onClick={() => setTab('accounts')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    tab === 'accounts'
                      ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810] border-2 border-[#2c1810]'
                      : 'text-[#2c1810] hover:bg-[#ffebd1]'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Kelola Akun ({ftpProfilesCount})</span>
                </button>
              </div>

              {/* Google Auth Quick Status Button */}
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] bg-white hover:bg-[#fff5e6] text-xs font-bold transition-all cursor-pointer"
                title={
                  currentUser
                    ? `${currentUser.name} (${currentUser.email}) - Sisa Kuota: ${currentUser.remainingQuota}`
                    : 'Masuk dengan Akun Google (Whitelist & Kuota)'
                }
              >
                {currentUser?.picture ? (
                  <img
                    src={currentUser.picture}
                    alt={currentUser.name}
                    className="w-4 h-4 rounded-full object-cover border border-[#2c1810]"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                )}
                <span className="hidden sm:inline text-[11px]">
                  {currentUser
                    ? `${currentUser.name.split(' ')[0]} (${currentUser.remainingQuota} AI)`
                    : 'Sign in Google'}
                </span>
                {currentUser && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentUser.status === 'active'
                        ? 'bg-emerald-500'
                        : currentUser.status === 'pending'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                )}
              </button>

              {/* Dedicated Logout Button when logged in */}
              {currentUser && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] bg-[#fff5e6] hover:bg-[#ffe5e0] text-rose-800 hover:text-rose-900 text-xs font-bold transition-all cursor-pointer"
                  title="Keluar dari Akun Google"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Keluar</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. Studio View */}
          <div className={tab === 'generate' ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Unified Studio Control Panel */}
              <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-4 xl:top-6 lg:self-start lg:max-h-[calc(100vh-2rem)] flex flex-col">
                <StudioPanel
                  files={files}
                  busy={busy}
                  progress={progress}
                  statusText={statusText}
                  hasVideoFiles={hasVideoFiles}
                  onFilesChange={setFiles}
                  onGenerate={runGeneration}
                  existingItemFilenames={items.map((it) => it.filename)}
                  model={model}
                  onModelChange={setModel}
                  gasProxyModels={GAS_PROXY_MODELS}
                  fileType={fileType}
                  titleLength={titleLength}
                  descriptionLength={descriptionLength}
                  keywordsCount={keywordsCount}
                  extra={extra}
                  onFileTypeChange={setFileType}
                  onTitleLengthChange={setTitleLength}
                  onDescriptionLengthChange={setDescriptionLength}
                  onKeywordsCountChange={setKeywordsCount}
                  onExtraChange={setExtra}
                />
              </div>

              {/* Right Column: Studio Live Output, Quick Edit & CSV Export */}
              <div className="lg:col-span-8 xl:col-span-9 min-w-0">
                <ResultsCard
                  items={items}
                  onPatchMeta={patchItemMeta}
                  onSave={saveEdits}
                  onTidy={tidyKeywords}
                  onRegenerate={regenerate}
                  onChipDrop={onChipDrop}
                  onNewSession={handleNewSession}
                  sessionTitle={currentSession?.title}
                  onUpdateSessionTitle={handleUpdateSessionTitle}
                  onOpenFtpUpload={() => setTab('upload')}
                />
              </div>
            </div>
          </div>

          {/* 2. History View */}
          <div className={tab === 'history' ? 'block' : 'hidden'}>
            <HistoryCard
              items={hist.items}
              total={hist.total}
              page={histPage}
              pageSize={pageSize}
              selectedIds={selectedIds}
              onPageChange={setHistPage}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onDelete={handleDeleteHistoryItem}
              onBulkDelete={handleBulkDelete}
              editable
              onPatchMeta={patchItemMeta}
              onSave={saveEdits}
              onRegenerate={regenerate}
              onChipDrop={onChipDrop}
              sessions={sessions}
              onLoadSession={handleLoadSession}
              onDeleteSession={handleDeleteSession}
            />
          </div>

          {/* 3. Dedicated Full-Page Upload Queue View (Stays mounted during tab switches) */}
          <div className={tab === 'upload' ? 'block' : 'hidden'}>
            <FtpQueueView
              items={items}
              files={sessionFiles.length > 0 ? sessionFiles : files}
              onFilesAttached={(newFiles) => {
                setSessionFiles((prev) => {
                  const map = new Map<string, File>();
                  for (const f of prev) map.set(f.name.toLowerCase(), f);
                  for (const f of newFiles) map.set(f.name.toLowerCase(), f);
                  return Array.from(map.values());
                });
              }}
              onNavigateToAccounts={() => setTab('accounts')}
              onNavigateToStudio={() => setTab('generate')}
              onUploadStateChange={setUploadProgressState}
            />
          </div>

          {/* 4. Dedicated Full-Page Accounts & Ledger View */}
          <div className={tab === 'accounts' ? 'block' : 'hidden'}>
            <FtpAccountsView
              onNavigateToQueue={() => setTab('upload')}
              onProfilesChange={(pList) => setFtpProfilesCount(pList.length)}
            />
          </div>
        </div>

        {/* Module 2: AI Stock Prompt Generator */}
        <div className={activeModule === 'prompt-gen' ? 'block' : 'hidden'}>
          <PromptGeneratorView
            onSwitchToMetadata={() => setActiveModule('metadata')}
            onSendImageToMetadata={(file) => {
              setFiles((prev) => [...prev, file]);
              setActiveModule('metadata');
              toast.success(`Gambar "${file.name}" ditambahkan ke Metadata Studio!`, {
                description: 'File siap dianalisis untuk menghasilkan judul, deskripsi, dan keyword stock.',
              });
            }}
          />
        </div>

        {/* Module 3: Microstock Keyword Research */}
        <div className={activeModule === 'keyword-research' ? 'block' : 'hidden'}>
          <KeywordResearchView onSwitchToMetadata={() => setActiveModule('metadata')} />
        </div>

        {/* Floating Background Upload Toast Pill */}
        {uploadProgressState.isUploading && (tab !== 'upload' || activeModule !== 'metadata') && (
          <div
            onClick={() => {
              setActiveModule('metadata');
              setTab('upload');
            }}
            role="button"
            tabIndex={0}
            className="fixed bottom-5 right-5 z-50 bg-[#2c1810] text-white px-4 py-3 rounded-2xl border-2 border-white shadow-[5px_5px_0_#ff6b35] flex items-center gap-3 cursor-pointer hover:scale-105 transition-all select-none animate-bounce"
            title="Klik untuk membuka Antrean Upload"
          >
            <div className="w-8 h-8 rounded-xl bg-[#ff6b35] flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            </div>
            <div className="text-xs">
              <div className="font-black flex items-center gap-2">
                <span>Unggahan Berjalan di Latar</span>
                <span className="bg-[#ff6b35] text-white px-1.5 py-0.2 rounded text-[10px]">
                  {uploadProgressState.completedCount}/{uploadProgressState.totalCount} Selesai
                </span>
              </div>
              <div className="text-[11px] text-stone-300 font-medium truncate max-w-[200px]">
                {uploadProgressState.currentFilename || 'Sedang memproses...'}
              </div>
            </div>
            <span className="text-[10px] bg-white text-[#2c1810] font-black uppercase px-2 py-1 rounded-lg border border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
              Buka
            </span>
          </div>
        )}

        {/* Google Auth & Whitelist Modal */}
        <GoogleAuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          currentUser={currentUser}
          onUserChange={setCurrentUser}
        />
      </main>
    </div>
  );
}

