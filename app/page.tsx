'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History as HistoryIcon, Key, RefreshCw, Sparkles, UploadCloud, Zap } from 'lucide-react';
import { nanoid } from 'nanoid/non-secure';

import { StudioPanel } from '@/components/StudioPanel';
import { ResultsCard } from '@/components/ResultsCard';
import { HistoryCard } from '@/components/HistoryCard';
import { FtpQueueView } from '@/components/FtpQueueView';
import { FtpAccountsView } from '@/components/FtpAccountsView';
import { AppSideRail, type AppModuleId } from '@/components/AppSideRail';
import { PromptGeneratorView } from '@/components/PromptGeneratorView';
import { KeywordResearchView } from '@/components/KeywordResearchView';
import { loadFtpProfiles } from '@/lib/ftp/store';

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
  loadSessions,
  deleteSession,
  loadSessionItems,
} from '@/lib/store';
import type { FileType, GenerationSession, ItemMetaBox, MetaOutput, Provider } from '@/lib/types';

/* ---------- constants ---------- */
const GAS_PROXY_MODELS = [
  'auto',
  'gemini-2.5-flash',
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
1. **Title & Description Guidelines:**
   - **Title:** Create a concise, commercially appealing video title around ${titleLength} characters (maximum 70 characters). Crucial: DO NOT use any commas in the title (Adobe Stock CSV strictly forbids commas in title). Synthesize the main subject, continuous action, and setting across the footage (e.g., 'Woman walking in sunny park while holding smartphone').
   - **Description:** Write a factual, detailed description around ${descriptionLength} words detailing the complete progression of action from beginning to end, camera motion (e.g., static, panning, tracking, aerial, slow motion), lighting, and setting.
   - **Keyword Best Practices:** Generate exactly ${keywordsCount} comma-separated, SEO-friendly keywords. In addition to primary subjects and setting, include video-specific motion keywords (e.g., action verbs, walking, running, panning, movement, footage, 4k, slow motion, aerial, timelapse, tracking shot). The first 10 keywords MUST be the most direct visual subjects and actions.

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

  return `You are a professional stock photography metadata generator. Analyze the provided image and generate metadata for a stock photo agency.

**File Type:** ${fileTypeSpec}.

**Instructions:**
1. **General Guidelines for Titles and Keywords**
   - **Title:** Create a concise, descriptive, and commercially appealing title around ${titleLength} characters (maximum 70 characters). Crucial: DO NOT use any commas in the title (Adobe Stock CSV strictly forbids commas in title). Capitalize only the first word and proper nouns. Avoid brand or people's names.
   - **Description:** Write a detailed, factual description around ${descriptionLength} words. Capitalize only the first word and proper nouns.
   - **Keyword Best Practices:** Use singular nouns. Use factual adjectives (color, texture) and avoid subjective ones (cute, beautiful). Generate exactly ${keywordsCount} comma-separated, SEO-friendly keywords. The first 10 keywords MUST be the most direct, observable visual subjects.

2. **Guidelines for People**
   - **Representation:** Describe subjects accurately. Include gender, age, and ethnicity/race if known.
   - **Details:** Identify activities (e.g., run, jump), roles (e.g., mother, colleague), and expressions (e.g., smile). Be inclusive and factual.

3. **Guidelines for Other Asset Categories**
   - **Objects:** Use specific singular nouns (e.g., armchair). Describe patterns, colors, and arrangements.
   - **Animals:** Use specific species names. Include number, gender, or age if relevant.
   - **Places:** Describe the setting (urban, rural, season, weather).
   - **Plants & Flowers:** Use specific names (e.g., marigold). Describe appearance (blooming, dewy) and parts (petal, stem).
   - **Food & Drinks:** Use specific singular nouns (e.g., pizza). Describe taste, texture, or cultural significance.
   - **Illustrations & Vectors:** If the asset is an illustration, vector, 3D render, or graphic, describe the style and set "illustration": true in the output JSON. If it is a real photo, set "illustration": false.
   - **Transparent Backgrounds:** If the asset has a transparent background (especially for cutouts or isolated graphics), include keywords like "transparent background", "cutout", and "isolated".

4. **Microstock Category Assignment:**
   - **Adobe Stock Category ("category"):** Choose the single most accurate numeric code (1 to 21):
     1=Animals, 2=Buildings and Architecture, 3=Business, 4=Drinks, 5=The Environment, 6=States of Mind, 7=Food, 8=Graphic Resources, 9=Hobbies and Leisure, 10=Industry, 11=Landscape, 12=Lifestyle, 13=People, 14=Plants and Flowers, 15=Culture and Religion, 16=Science, 17=Social Issues, 18=Sports, 19=Technology, 20=Transport, 21=Travel.
   - **Shutterstock Category ("shutterstockCategory"):** Choose the most accurate category name:
     Abstract, Animals/Wildlife, Arts, Backgrounds/Textures, Beauty/Fashion, Buildings/Landmarks, Business/Finance, Celebrities, Education, Food and Drink, Healthcare/Medical, Holidays, Industrial, Interiors, Miscellaneous, Nature, Objects, Parks/Outdoor, People, Religion, Science, Signs/Symbols, Sports/Recreation, Technology, Transportation, Vintage.

${extra ? `**Additional Instructions:** ${extra}` : ''}

**Output Format:**
Provide the output in strict JSON format. Do not include any text before or after the JSON object. The JSON object must have keys: "title", "description", "keywords", "category" (number 1-21 as string), "shutterstockCategory" (name as string), and "illustration" (boolean).

Example JSON output:
{
  "title": "Minimalist modern desk setup with laptop and plant",
  "description": "Aerial view of a clean modern workplace with laptop, notebook, and coffee mug on a wooden table.",
  "keywords": "desk, laptop, workplace, computer, office, table, wooden, coffee, notebook, technology",
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

function isValidMeta(x: unknown): x is MetaOutput {
  const obj = x as Partial<MetaOutput> | null;
  return !!obj && typeof obj.title === 'string' && typeof obj.description === 'string' && typeof obj.keywords === 'string';
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
  const [titleLength, setTitleLength] = useState(70);
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
  const [activeModule, setActiveModule] = useState<AppModuleId>('metadata');

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

  // Sync count of FTP profiles
  useEffect(() => {
    void loadFtpProfiles().then((p) => setFtpProfilesCount(p.length));
  }, [tab]);

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
  }, []);

  // Update API key when provider changes
  useEffect(() => {
    setApiKey(getApiKey(provider));
    const currentModels = GAS_PROXY_MODELS;
    if (!currentModels.includes(model)) {
      setModel(currentModels[0]);
    }
  }, [provider, model]);

  // Save settings when they change
  useEffect(() => {
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
        await deleteSession(sessionId, true);
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

      try {
        let dataUrl: string;
        let videoDuration: number | undefined;
        let videoKeyframes: string[] | undefined;

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
          dataUrl = extracted.thumbDataUrl;
          videoDuration = extracted.duration;
          videoKeyframes = extracted.frames;
          setStatusText(`Menganalisis video dengan AI (${file.name})...`);
          setProgress((prev) => Math.max(prev, 55));
        } else {
          setStatusText(`Mengoptimasi gambar: ${file.name}...`);
          const resized = await resizeImageToMax1024(file);
          dataUrl = resized.dataUrl;
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
          imageDataUrl: dataUrl,
          imageDataUrls: videoKeyframes
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
        if (!isValidMeta(parsed)) throw new Error('Model returned invalid JSON shape.');

        const parsedMeta = parsed as unknown as Record<string, unknown>;
        const detectedIllustration =
          typeof parsedMeta.illustration === 'boolean'
            ? parsedMeta.illustration
            : fileType === 'illustration' || fileType === 'vector';

        const fixed: MetaOutput = {
          title: parsed.title,
          description: parsed.description,
          keywords: cleanKeywords(parsed.keywords, keywordsCount),
          category: typeof parsedMeta.category === 'string' ? parsedMeta.category.trim() : undefined,
          shutterstockCategory:
            typeof parsedMeta.shutterstockCategory === 'string'
              ? parsedMeta.shutterstockCategory.trim()
              : undefined,
          illustration: detectedIllustration,
          aiGenerated: true,
          aiModel: (parsedMeta.aiModel as string) || (model === 'auto' ? 'Auto (GAS Proxy)' : model),
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
          thumbDataUrl: dataUrl,
          videoDuration,
          videoKeyframes: isVideo ? videoKeyframes : undefined,
          meta: fixed,
        };
        await saveHistoryItem(box);
        return box;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const box: ItemMetaBox = {
          id: nanoid(),
          sessionId: activeSessionId,
          filename: file.name,
          fileType: isVideo ? 'video' : (fileType === 'auto' ? 'photo' : fileType),
          assetType: isVideo ? 'video' : 'image',
          status: 'error',
          createdAt: Date.now(),
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
    if (!it?.thumbDataUrl && !it?.videoDataUrl) return;
    setBusy(true);
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
      const dataUrl = it.thumbDataUrl || it.videoDataUrl!;

      const body = {
        apiKey,
        model,
        instruction: instr,
        instructionHash,
        imageDataUrl: dataUrl,
        imageDataUrls: it.videoKeyframes
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
      if (!isValidMeta(parsed)) throw new Error('Model returned invalid JSON shape.');
      const fixed: MetaOutput = {
        title: parsed.title,
        description: parsed.description,
        keywords: cleanKeywords(parsed.keywords, keywordsCount),
      };
      const updated: ItemMetaBox = { ...it, meta: fixed, error: undefined };
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      await saveHistoryItem(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, error: msg } : i)));
    } finally {
      setBusy(false);
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
    await refreshHistory();
  }

  async function handleBulkDelete(ids: string[]) {
    await deleteHistoryItems(ids);
    await refreshHistory();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fffaf0] text-[#2c1810]">
      {/* Primary Side Rail Navigation (left vertical icon strip) */}
      <AppSideRail
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isUploadingInBackground={uploadProgressState.isUploading && activeModule !== 'metadata'}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1536px] mx-auto p-4 md:p-6 lg:p-8 space-y-6 w-full">
        {/* Module 1: Metadata Generator & Multi-FTP Suite */}
        <div className={activeModule === 'metadata' ? 'space-y-6' : 'hidden'}>
          {/* Sleek Editorial Header Bar */}
          <div className="bg-white border-2 border-[#2c1810] shadow-[5px_5px_0_#2c1810] rounded-2xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] flex items-center justify-center text-white">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#2c1810]">
                  MetaGen Studio
                </h1>
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
            </div>
          </div>

          {/* 1. Studio View */}
          <div className={tab === 'generate' ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Unified Studio Control Panel */}
              <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-6">
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
          <PromptGeneratorView onSwitchToMetadata={() => setActiveModule('metadata')} />
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
      </main>
    </div>
  );
}

