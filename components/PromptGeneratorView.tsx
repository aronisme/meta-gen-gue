'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  History,
  ImageIcon,
  Layers,
  Lightbulb,
  Loader2,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { resizeImageToMax1024 } from '@/lib/resize';
import {
  CREATIVE_FOCUS_LABELS,
  ENGINE_LABELS,
  exportPromptsToCsv,
  exportPromptsToJson,
  exportPromptsToQueueText,
  exportPromptsToText,
  formatPromptForEngine,
  normalizeVisualDna,
} from '@/lib/prompt-agent/engine';
import {
  brainstormBriefIdeas,
  executeVCPAGeneration,
  regenerateSinglePromptCard,
} from '@/lib/prompt-agent/client';
import {
  createNewPromptSession,
  DEFAULT_VCPA_SETTINGS,
  loadActivePromptSession,
  saveActivePromptSession,
  savePromptSession,
} from '@/lib/prompt-agent/store';
import { PromptSessionModal } from '@/components/PromptSessionModal';
import { getRandomCuratedIdeas, type InspirationIdea } from '@/lib/prompt-agent/inspirations';
import type {
  AspectRatio,
  CreativeFocus,
  EngineType,
  PromptCardItem,
  PromptGenerationSession,
  PromptQueueItem,
  SemanticMode,
  VCPAMode,
  VCPASettings,
  VisualDirection,
  VisualDNAProfile,
} from '@/lib/prompt-agent/types';

export interface PromptGeneratorViewProps {
  onSwitchToMetadata?: () => void;
  onSendImageToMetadata?: (file: File) => void;
}

const STORAGE_KEY_PROMPTS = 'vcpa_prompts_v1';
const STORAGE_KEY_SETTINGS = 'vcpa_settings_v1';
const STORAGE_KEY_DNA = 'vcpa_dna_v1';

function safeFormatList(val: unknown, fallback = ''): string {
  if (Array.isArray(val)) {
    const valid = val
      .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
      .filter(Boolean);
    return valid.length > 0 ? valid.join(', ') : fallback;
  }
  if (typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  return fallback;
}

async function copyToClipboardSafe(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  }
  return false;
}

const VISUAL_DIRECTION_OPTIONS: Array<{ id: VisualDirection; label: string; desc: string }> = [
  { id: 'photorealistic', label: 'Foto Komersial (Stock Photo)', desc: 'Sony A7R V, 85mm f/1.4, tekstur natural 8K' },
  { id: 'editorial', label: 'Editorial & High Fashion', desc: 'Pencahayaan terkontrol, estetika majalah premium' },
  { id: '3d_render', label: '3D Render & Clay', desc: 'Blender Cycles, ambient occlusion halus, modern' },
  { id: 'vector', label: 'Vektor & Flat Design', desc: 'Scalable graphic, tepi tajam, palet modern' },
  { id: 'cinematic', label: 'Sinematik 4K Still', desc: 'Anamorphic lens flare, film color grading' },
];

const ENGINE_ITEMS: Array<{ id: EngineType; label: string; badge: string }> = [
  { id: 'midjourney', label: 'Midjourney v6.1', badge: '--v 6.1' },
  { id: 'flux', label: 'FLUX.1', badge: 'Black Forest' },
  { id: 'imagen3', label: 'Google Imagen 3 / Flow', badge: 'Google Studio' },
  { id: 'nanobanana', label: 'Google Nano Banana', badge: 'High-Speed' },
  { id: 'sdxl', label: 'Stable Diffusion XL', badge: 'SDXL' },
];

const ASPECT_RATIO_ITEMS: Array<{ id: AspectRatio; label: string; desc: string }> = [
  { id: 'none', label: 'Bebas', desc: 'Tanpa batasan rasio' },
  { id: '16:9', label: '16:9', desc: 'Lanskap Lebar' },
  { id: '3:2', label: '3:2', desc: 'DSLR Standar' },
  { id: '1:1', label: '1:1', desc: 'Square Persegi' },
  { id: '4:3', label: '4:3', desc: 'Klasik' },
  { id: '9:16', label: '9:16', desc: 'Vertikal Story' },
];

export function PromptGeneratorView({ onSwitchToMetadata, onSendImageToMetadata }: PromptGeneratorViewProps) {
  // 1. Session & History State
  const [session, setSession] = useState<PromptGenerationSession>(() => createNewPromptSession());
  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [titleInput, setTitleInput] = useState<string>('');

  // 2. Generation Mode: reference_to_prompt vs text_ideation
  const [mode, setMode] = useState<VCPAMode>('reference_to_prompt');

  // 3. Input Reference State
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [refImageDataUrl, setRefImageDataUrl] = useState<string>('');
  const [brief, setBrief] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 4. Settings State
  const [settings, setSettings] = useState<VCPASettings>({ ...DEFAULT_VCPA_SETTINGS });

  // 5. Fold / Accordion States for Left Side Panel
  const [foldedSections, setFoldedSections] = useState<{
    input: boolean;
    engine: boolean;
    visual: boolean;
    safety: boolean;
  }>({
    input: false,
    engine: false,
    visual: false,
    safety: true,
  });

  const toggleFold = (key: keyof typeof foldedSections) => {
    setFoldedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 6. Output & Visual DNA State
  const [visualDna, setVisualDna] = useState<VisualDNAProfile | null>(null);
  const [isDnaExpanded, setIsDnaExpanded] = useState<boolean>(true);
  const [prompts, setPrompts] = useState<PromptCardItem[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [generatingFlowCardId, setGeneratingFlowCardId] = useState<string | null>(null);
  const [flowQueueCardIds, setFlowQueueCardIds] = useState<string[]>([]);
  const [flowBatchLimit, setFlowBatchLimit] = useState<number>(5);
  const [flowOutputCount, setFlowOutputCount] = useState<'x1' | 'x2' | 'x3' | 'x4'>('x1');
  const [copiedAgentBatch, setCopiedAgentBatch] = useState<boolean>(false);
  const [isFlowMassDownloading, setIsFlowMassDownloading] = useState<boolean>(false);
  const [flowMassDownloadProgress, setFlowMassDownloadProgress] = useState<{
    current: number;
    total: number;
    saved: number;
  }>({ current: 0, total: 0, saved: 0 });
  const [flowDownloadResolution, setFlowDownloadResolution] = useState<'2K' | '4K' | '1K'>('2K');

  // 7. Inspirations & Brainstorm
  const [inspirations, setInspirations] = useState<InspirationIdea[]>(() => getRandomCuratedIdeas(10));
  const [isBrainstorming, setIsBrainstorming] = useState<boolean>(false);
  const [isBrainstormOpen, setIsBrainstormOpen] = useState<boolean>(false);
  const [brainstormTopic, setBrainstormTopic] = useState<string>('');
  const [brainstormCount, setBrainstormCount] = useState<number>(10);

  // 8. Automated Multi-Image Queue System State
  const [queue, setQueue] = useState<PromptQueueItem[]>([]);
  const [isQueuePaused, setIsQueuePaused] = useState<boolean>(false);
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState<boolean>(true);
  const activeProcessingRef = useRef<boolean>(false);
  const processedPayloadIdsRef = useRef<Set<string>>(new Set());

  // Restore active session from IndexedDB on initial render
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const active = await loadActivePromptSession();
        if (active && isMounted) {
          setSession(active);
          setPrompts(active.prompts || []);
          if (active.settings) {
            setSettings(active.settings);
          }
          if (active.visualDna) {
            setVisualDna(normalizeVisualDna(active.visualDna));
          }
          if (active.mode) {
            setMode(active.mode);
          }
        } else if (isMounted) {
          const legacyPrompts = localStorage.getItem(STORAGE_KEY_PROMPTS);
          if (legacyPrompts) {
            try {
              const parsed = JSON.parse(legacyPrompts);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const fresh = createNewPromptSession();
                fresh.prompts = parsed;
                setSession(fresh);
                setPrompts(parsed);
                void savePromptSession(fresh);
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to load active prompt session:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync state changes to localStorage backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROMPTS, JSON.stringify(prompts));
    } catch {}
  }, [prompts]);

  useEffect(() => {
    try {
      if (visualDna) {
        localStorage.setItem(STORAGE_KEY_DNA, JSON.stringify(visualDna));
      } else {
        localStorage.removeItem(STORAGE_KEY_DNA);
      }
    } catch {}
  }, [visualDna]);

  // Handle Session Title Editing
  const handleStartEditTitle = () => {
    setTitleInput(session.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== session.title) {
      const updated: PromptGenerationSession = {
        ...session,
        title: trimmed,
        updatedAt: Date.now(),
      };
      setSession(updated);
      void savePromptSession(updated);
      toast.success('Nama sesi diperbarui.');
    }
    setIsEditingTitle(false);
  };

  // Start a fresh session
  const handleNewSession = async () => {
    if (prompts.length > 0) {
      await savePromptSession({
        ...session,
        prompts,
        settings,
        visualDna: visualDna || undefined,
        mode,
        updatedAt: Date.now(),
      });
    }
    const fresh = createNewPromptSession();
    setSession(fresh);
    setPrompts([]);
    setVisualDna(null);
    setRefImageFile(null);
    setRefImageDataUrl('');
    setBrief('');
    await saveActivePromptSession(fresh);
    toast.success('Sesi baru dimulai. Workspace telah dibersihkan.');
  };

  // Load selected session from history modal
  const handleSelectSession = (selected: PromptGenerationSession) => {
    setSession(selected);
    setPrompts(selected.prompts || []);
    if (selected.settings) setSettings(selected.settings);
    if (selected.visualDna) setVisualDna(normalizeVisualDna(selected.visualDna));
    else setVisualDna(null);
    if (selected.mode) setMode(selected.mode);
    void saveActivePromptSession(selected);
    toast.success(`Sesi "${selected.title}" dimuat (${selected.prompts?.length || 0} prompt).`);
  };

  // -------------------------------------------------------------
  // AUTOMATED QUEUE WORKER ENGINE
  // -------------------------------------------------------------

  // Helper: Enqueue one or multiple images
  const enqueueImages = (
    items: Array<{
      dataUrl: string;
      filename: string;
      source: 'extension' | 'upload' | 'paste' | 'url';
      sourceUrl?: string;
      brief?: string;
      id?: string;
    }>
  ) => {
    if (!items || items.length === 0) return;

    const timestamp = Date.now();
    const newQueueItems: PromptQueueItem[] = items.map((it, idx) => ({
      id: it.id || `q_${timestamp}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      source: it.source,
      imageDataUrl: it.dataUrl,
      filename: it.filename,
      addedAt: timestamp + idx,
      status: 'pending',
      brief: it.brief,
    }));

    setQueue((prev) => {
      // Prevent duplicates: filter out any item that is already active (pending or processing)
      const activeUrls = new Set(
        prev
          .filter((q) => q.status === 'pending' || q.status === 'processing')
          .map((q) => q.imageDataUrl)
      );

      const uniqueNewItems: PromptQueueItem[] = [];
      for (const item of newQueueItems) {
        if (!activeUrls.has(item.imageDataUrl)) {
          activeUrls.add(item.imageDataUrl);
          uniqueNewItems.push(item);
        }
      }

      if (uniqueNewItems.length === 0) return prev;
      return [...prev, ...uniqueNewItems];
    });

    if (mode !== 'reference_to_prompt') setMode('reference_to_prompt');
    setIsQueueDrawerOpen(true);
  };

  // Continuous FIFO Queue Worker Loop
  useEffect(() => {
    if (activeProcessingRef.current || isQueuePaused) return;

    const nextPending = queue.find((q) => q.status === 'pending');
    if (!nextPending) return;

    activeProcessingRef.current = true;

    void (async () => {
      // Mark as processing
      setQueue((prev) =>
        prev.map((q) =>
          q.id === nextPending.id
            ? { ...q, status: 'processing', progressStep: 'Menganalisis Visual DNA...' }
            : q
        )
      );

      setRefImageDataUrl(nextPending.imageDataUrl);
      setBusy(true);

      try {
        const result = await executeVCPAGeneration({
          mode: 'reference_to_prompt',
          brief: nextPending.brief || brief || '',
          imageDataUrl: nextPending.imageDataUrl,
          settings,
          provider: 'gas-proxy',
          model: 'auto',
          onProgressStep: (step) => {
            setProgressStep(step);
            setQueue((prev) =>
              prev.map((q) => (q.id === nextPending.id ? { ...q, progressStep: step } : q))
            );
          },
        });

        const now = Date.now();
        const newBatch: PromptCardItem[] = result.prompts.map((p, idx) => ({
          ...p,
          createdAt: now + idx,
          batchId: result.jobId,
        }));

        // AUTO-ADD: Prepend to the top of active session!
        setPrompts((prev) => {
          const updated = [...newBatch, ...prev];
          void savePromptSession({
            ...session,
            prompts: updated,
            visualDna: result.visualDna || undefined,
            settings,
            mode: 'reference_to_prompt',
            updatedAt: Date.now(),
          });
          return updated;
        });

        if (result.visualDna) {
          setVisualDna(normalizeVisualDna(result.visualDna));
        }

        setQueue((prev) =>
          prev.map((q) =>
            q.id === nextPending.id
              ? {
                  ...q,
                  status: 'completed',
                  completedAt: Date.now(),
                  generatedCount: result.completedCount,
                  progressStep: 'Selesai',
                }
              : q
          )
        );

        toast.success(
          `Antrean [${nextPending.filename}]: ${result.completedCount} prompt berhasil di-generate!`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === nextPending.id ? { ...q, status: 'error', error: msg, progressStep: 'Gagal' } : q
          )
        );
        toast.error(`Antrean [${nextPending.filename}] gagal: ${msg}`);
      } finally {
        activeProcessingRef.current = false;
        setBusy(false);
        setProgressStep('');
      }
    })();
  }, [queue, isQueuePaused, brief, settings, session]);

  // Listener for Browser Extension & External URL Actions
  useEffect(() => {
    // 1. Listen for window postMessage from Chrome Extension
    type ExtensionIncomingItem = {
      id?: string;
      imageDataUrl?: string;
      sourceUrl?: string;
      filename?: string;
    };

    const handleIncomingPayload = (payload: unknown) => {
      if (!payload) return;

      if (Array.isArray(payload)) {
        const validItems: Array<{
          dataUrl: string;
          filename: string;
          source: 'extension';
          sourceUrl?: string;
          id?: string;
        }> = [];

        for (const p of payload as ExtensionIncomingItem[]) {
          if (!p || (!p.imageDataUrl && !p.sourceUrl)) continue;
          if (p.id && processedPayloadIdsRef.current.has(p.id)) continue;
          if (p.id) processedPayloadIdsRef.current.add(p.id);

          validItems.push({
            dataUrl: (p.imageDataUrl || p.sourceUrl) as string,
            filename: p.filename || `Web_Batch_${Date.now().toString().slice(-4)}.jpg`,
            source: 'extension',
            sourceUrl: p.sourceUrl,
            id: p.id,
          });
        }

        if (validItems.length > 0) {
          enqueueImages(validItems);
          toast.success(`${validItems.length} gambar dari ekstensi browser dimasukkan ke antrean!`);
        }
      } else {
        const p = payload as ExtensionIncomingItem;
        if (p?.imageDataUrl || p?.sourceUrl) {
          if (p.id && processedPayloadIdsRef.current.has(p.id)) {
            return; // Duplicate payload ID ignored
          }
          if (p.id) processedPayloadIdsRef.current.add(p.id);

          const effectiveDataUrl = (p.imageDataUrl || p.sourceUrl) as string;
          enqueueImages([
            {
              dataUrl: effectiveDataUrl,
              filename: p.filename || `Web_Image_${Date.now().toString().slice(-4)}.jpg`,
              source: 'extension',
              sourceUrl: p.sourceUrl,
              id: p.id,
            },
          ]);
          toast.success('Gambar dari ekstensi browser berhasil masuk ke antrean generator!');
        }
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'METAGEN_ENQUEUE_PROMPT_IMAGE') {
        handleIncomingPayload(event.data.payload);
      }
      if (event.data?.type === 'METAGEN_FLOW_QUEUE_UPDATE') {
        const qInfo = event.data.payload;
        setGeneratingFlowCardId(qInfo?.activeCardId || null);
        setFlowQueueCardIds(qInfo?.queuedCardIds || []);
      }
      if (event.data?.type === 'METAGEN_FLOW_CARD_DISCOVERED') {
        const disc = event.data.payload;
        if (disc?.cardId && disc?.imageDataUrl) {
          setPrompts((prev) =>
            prev.map((c) =>
              c.id === disc.cardId && !c.generatedImageUrl
                ? {
                    ...c,
                    generatedImageUrl: disc.imageDataUrl,
                    variations: [{ letter: 'A', dataUrl: disc.imageDataUrl, token: disc.token }],
                    selectedVariationIndex: 0,
                    flowStatus: 'completed',
                  }
                : c
            )
          );
          toast.success(`✓ Gambar adegan #${disc.ordinal || ''} terhubung dari Google Flow!`);
        }
      }
      if (event.data?.type === 'METAGEN_FLOW_GEN_RESULT') {
        const payload = event.data.payload;

        // Support for Agent Batch Multi-Scene payload with multiple results
        if (payload?.success && payload?.isAgentBatch && Array.isArray(payload?.results) && payload.results.length > 0) {
          const resultsMap = new Map<string, any>(payload.results.map((r: any) => [r.cardId, r]));
          const finishedIds = new Set(payload.results.map((r: any) => r.cardId));

          setGeneratingFlowCardId((prev) => (prev && finishedIds.has(prev) ? null : prev));
          setFlowQueueCardIds((prev) => prev.filter((id) => !finishedIds.has(id)));

          setPrompts((prev) =>
            prev.map((c) => {
              const res = resultsMap.get(c.id);
              if (res) {
                const variations = res.variations || (res.imageDataUrl ? [{ letter: 'A', dataUrl: res.imageDataUrl, token: res.token }] : []);
                return {
                  ...c,
                  generatedImageUrl: res.imageDataUrl || c.generatedImageUrl,
                  variations: variations,
                  selectedVariationIndex: 0,
                  flowStatus: 'completed',
                };
              }
              return c;
            })
          );

          toast.success(`✓ ${payload.results.length} adegan Google Flow Agent berhasil dimuat!`, {
            description: 'Setiap kartu adegan telah diperbarui dengan gambar masing-masing.',
          });
          return;
        }

        // Standard Single-Prompt handling
        setGeneratingFlowCardId((prev) => (prev === payload?.cardId ? null : prev));
        setFlowQueueCardIds((prev) => prev.filter((id) => id !== payload?.cardId));
        if (payload?.success && (payload?.imageDataUrl || payload?.variations?.length)) {
          const variations = payload.variations || (payload.imageDataUrl ? [{ letter: 'A', dataUrl: payload.imageDataUrl, token: payload.token }] : []);
          setPrompts((prev) =>
            prev.map((c) =>
              c.id === payload.cardId
                ? {
                    ...c,
                    generatedImageUrl: payload.imageDataUrl,
                    variations: variations,
                    selectedVariationIndex: 0,
                    flowStatus: 'completed',
                  }
                : c
            )
          );
          const varCount = variations.length;
          toast.success(`✓ ${varCount > 1 ? `${varCount} variasi gambar` : 'Gambar'} Google Flow siap!`, {
            description: varCount > 1
              ? `Semua ${varCount} variasi gambar (A, B, C...) dapat dipratinjau langsung di kartu prompt.`
              : 'Hasil render siap dipratinjau langsung di kartu prompt.',
          });
        } else if (payload?.error) {
          toast.error(`Google Flow: ${payload.error}`);
        }
      }

      if (event.data?.type === 'METAGEN_FLOW_MASS_DOWNLOAD_PROGRESS') {
        const p = event.data.payload;
        if (p) {
          setFlowMassDownloadProgress({
            current: p.current || 0,
            total: p.total || 0,
            saved: p.saved || 0,
          });
        }
      }

      if (event.data?.type === 'METAGEN_FLOW_MASS_DOWNLOAD_RESPONSE') {
        const res = event.data.payload;
        setIsFlowMassDownloading(false);
        if (res?.success) {
          toast.success(
            `✓ Unduh Massal Selesai! Berhasil menyimpan ${res.saved} aset 2K ke Downloads/MetaGen_Flow.`
          );
        } else if (res?.error) {
          toast.error(`Gagal unduh massal: ${res.error}`);
        }
      }
    };

    window.addEventListener('message', handleWindowMessage);

    // 2. Check URL query parameters for ?action=enqueue_prompt&imgUrl=...
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get('action');
      const imgUrl = urlParams.get('imgUrl') || urlParams.get('img');
      if (action === 'enqueue_prompt' && imgUrl) {
        enqueueImages([
          {
            dataUrl: imgUrl,
            filename: `URL_Image_${Date.now().toString().slice(-4)}.jpg`,
            source: 'url',
            sourceUrl: imgUrl,
          },
        ]);
        toast.info('Gambar dari tautan eksternal dimasukkan ke antrean.');
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {}

    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);

  // Queue Actions
  const handleRemoveQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
    toast.info('Item dihapus dari antrean.');
  };

  const handleClearCompletedQueue = () => {
    setQueue((prev) => prev.filter((q) => q.status === 'pending' || q.status === 'processing'));
    toast.info('Riwayat antrean selesai dibersihkan.');
  };

  const handleCancelPendingQueue = () => {
    setQueue((prev) => prev.filter((q) => q.status !== 'pending'));
    toast.info('Seluruh antrean pending dibatalkan.');
  };

  // Inspiration handlers
  const handleShuffleInspirations = () => {
    const currentIds = inspirations.map((i) => i.id);
    const nextIdeas = getRandomCuratedIdeas(brainstormCount, currentIds);
    setInspirations(nextIdeas);
    toast.info(`${nextIdeas.length} ide baru dimuat dari katalog inspirasi.`);
  };

  const handleBrainstormIdeas = async (customTopic?: string, targetCount = brainstormCount) => {
    setIsBrainstorming(true);
    const activeTopic = (customTopic !== undefined ? customTopic : brainstormTopic).trim() || brief.trim();
    const countToGenerate = targetCount || 10;

    const toastId = toast.loading(
      activeTopic
        ? `Merancang ${countToGenerate} ide AI sesuai topik "${activeTopic.slice(0, 24)}..."`
        : `Merancang ${countToGenerate} ide microstock tren baru via AI...`
    );

    try {
      const newIdeas = await brainstormBriefIdeas(activeTopic || undefined, countToGenerate, 'gas-proxy', 'auto');
      setInspirations(newIdeas);
      toast.success(
        activeTopic
          ? `${newIdeas.length} ide AI bertema "${activeTopic.slice(0, 20)}..." siap digunakan!`
          : `${newIdeas.length} ide segar dari AI siap digunakan!`,
        { id: toastId }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Gagal merancang ide: ${msg}`, { id: toastId });
    } finally {
      setIsBrainstorming(false);
    }
  };

  // Handle Multi-file Drop / Selection
  const handleSelectMultipleImages = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) {
      toast.error('File yang dipilih bukan format gambar yang valid.');
      return;
    }

    // If single file and queue is idle, also set immediate preview
    if (fileArray.length === 1 && queue.length === 0 && !busy) {
      const single = fileArray[0];
      const effectiveFile =
        single.name === 'image.png' || single.name === 'blob' || !single.name
          ? new File([single], `Pasted_Ref_${Date.now().toString().slice(-6)}.png`, {
              type: single.type || 'image/png',
            })
          : single;

      setRefImageFile(effectiveFile);
      setVisualDna(null);
      const resized = await resizeImageToMax1024(effectiveFile);
      setRefImageDataUrl(resized.dataUrl);
      toast.success(`Gambar referensi dimuat: ${effectiveFile.name}`);
      return;
    }

    const toastId = toast.loading(`Memproses ${fileArray.length} gambar untuk antrean...`);
    const newItems: Array<{ dataUrl: string; filename: string; source: 'upload' }> = [];

    for (let i = 0; i < fileArray.length; i++) {
      const f = fileArray[i];
      try {
        const resized = await resizeImageToMax1024(f);
        newItems.push({
          dataUrl: resized.dataUrl,
          filename: f.name,
          source: 'upload',
        });
      } catch (err) {
        console.warn('Gagal memproses gambar:', f.name, err);
      }
    }

    if (newItems.length > 0) {
      enqueueImages(newItems);
      toast.success(`${newItems.length} gambar berhasil masuk antrean generator!`, { id: toastId });
    } else {
      toast.error('Gagal memuat gambar ke antrean.', { id: toastId });
    }
  };

  // Global Clipboard Paste Listener (Ctrl+V) for Image References
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let imageFile: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          imageFile = item.getAsFile();
          break;
        }
      }

      if (imageFile) {
        e.preventDefault();
        if (mode !== 'reference_to_prompt') {
          setMode('reference_to_prompt');
          toast.info('Beralih ke Mode 1 (Dengan Image Reference)');
        }
        void handleSelectMultipleImages([imageFile]);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [mode, queue, busy]);

  const handleClearImage = () => {
    setRefImageFile(null);
    setRefImageDataUrl('');
    setVisualDna(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Main Manual Generate Action (routes to queue or executes direct)
  const handleGenerate = async () => {
    if (mode === 'reference_to_prompt' && !refImageDataUrl) {
      toast.error('Silakan unggah gambar referensi terlebih dahulu.');
      return;
    }
    if (mode === 'text_ideation' && !brief.trim()) {
      toast.error('Silakan isi arahan ide / brief konsep terlebih dahulu.');
      return;
    }

    // In Reference Mode: If queue has other items, enqueue this reference image so it respects the queue line!
    if (mode === 'reference_to_prompt' && (queue.length > 0 || busy)) {
      enqueueImages([
        {
          dataUrl: refImageDataUrl,
          filename: refImageFile?.name || `Manual_Ref_${Date.now().toString().slice(-4)}.jpg`,
          source: 'upload',
        },
      ]);
      toast.info('Gambar dimasukkan ke antrean generator.');
      return;
    }

    setBusy(true);
    setProgressStep('Mempersiapkan pipeline AI...');

    try {
      const result = await executeVCPAGeneration({
        mode,
        brief,
        imageDataUrl: mode === 'reference_to_prompt' ? (refImageDataUrl || undefined) : undefined,
        visualDna: mode === 'reference_to_prompt' ? (visualDna || undefined) : undefined,
        settings,
        provider: 'gas-proxy',
        model: 'auto',
        onProgressStep: (step) => setProgressStep(step),
      });

      const now = Date.now();
      const newBatch: PromptCardItem[] = result.prompts.map((p, idx) => ({
        ...p,
        createdAt: now + idx,
        batchId: result.jobId,
      }));

      // AUTO-ADD: PREPEND KE PALING ATAS
      const updatedPrompts = [...newBatch, ...prompts];
      setPrompts(updatedPrompts);

      let updatedDna: VisualDNAProfile | undefined = visualDna
        ? normalizeVisualDna(visualDna) || undefined
        : undefined;

      if (mode === 'reference_to_prompt' && result.visualDna) {
        const safeDna = normalizeVisualDna(result.visualDna);
        setVisualDna(safeDna);
        updatedDna = safeDna || undefined;
      } else if (mode === 'text_ideation') {
        setVisualDna(null);
        updatedDna = undefined;
      }

      const updatedSession: PromptGenerationSession = {
        ...session,
        prompts: updatedPrompts,
        visualDna: updatedDna,
        settings,
        mode,
        updatedAt: Date.now(),
      };
      setSession(updatedSession);
      void savePromptSession(updatedSession);

      // Record image to VCPA Queue completed history
      if (mode === 'reference_to_prompt' && refImageDataUrl) {
        setQueue((prev) => {
          const exists = prev.some((q) => q.imageDataUrl === refImageDataUrl);
          if (exists) {
            return prev.map((q) =>
              q.imageDataUrl === refImageDataUrl
                ? {
                    ...q,
                    status: 'completed',
                    completedAt: now,
                    generatedCount: (q.generatedCount || 0) + result.completedCount,
                  }
                : q
            );
          }
          return [
            ...prev,
            {
              id: `manual_${now}`,
              source: 'upload',
              imageDataUrl: refImageDataUrl,
              filename: refImageFile?.name || `Ref_${Date.now().toString().slice(-4)}.jpg`,
              addedAt: now,
              status: 'completed',
              completedAt: now,
              generatedCount: result.completedCount,
              progressStep: 'Selesai',
            },
          ];
        });
        setIsQueueDrawerOpen(true);
      }

      toast.success(
        `Berhasil menambahkan ${result.completedCount} konsep baru! Total di sesi: ${updatedPrompts.length} prompt.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Gagal menghasilkan prompt: ${msg}`);
    } finally {
      setBusy(false);
      setProgressStep('');
    }
  };

  // Re-generate single card in place
  const handleRegenerateCard = async (card: PromptCardItem) => {
    setRegeneratingId(card.id);
    try {
      const newCard = await regenerateSinglePromptCard(
        card,
        prompts,
        settings,
        visualDna || undefined,
        'gas-proxy',
        'auto'
      );
      const updated = prompts.map((c) => (c.id === card.id ? { ...newCard, createdAt: card.createdAt } : c));
      setPrompts(updated);
      const updatedSession: PromptGenerationSession = {
        ...session,
        prompts: updated,
        updatedAt: Date.now(),
      };
      setSession(updatedSession);
      void savePromptSession(updatedSession);
      toast.success(`Konsep #${card.ordinal} diperbarui!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Gagal regenerasi: ${msg}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  // Delete single card from active session
  const handleDeleteCard = (cardId: string) => {
    const updated = prompts.filter((c) => c.id !== cardId);
    setPrompts(updated);
    const updatedSession: PromptGenerationSession = {
      ...session,
      prompts: updated,
      updatedAt: Date.now(),
    };
    setSession(updatedSession);
    void savePromptSession(updatedSession);
    toast.info('Konsep prompt dihapus dari sesi.');
  };

  // Toggle Favorite
  const handleToggleFavorite = (cardId: string) => {
    const updated = prompts.map((c) => (c.id === cardId ? { ...c, isFavorite: !c.isFavorite } : c));
    setPrompts(updated);
    void savePromptSession({
      ...session,
      prompts: updated,
      updatedAt: Date.now(),
    });
  };

  // Edit card prompt text directly
  const handlePromptTextChange = (cardId: string, newText: string) => {
    const updated = prompts.map((c) =>
      c.id === cardId ? { ...c, prompt: newText, rawBasePrompt: newText, isEdited: true } : c
    );
    setPrompts(updated);
    void savePromptSession({
      ...session,
      prompts: updated,
      updatedAt: Date.now(),
    });
  };

  // Edit card concept title
  const handleCardTitleChange = (cardId: string, newTitle: string) => {
    const updated = prompts.map((c) =>
      c.id === cardId ? { ...c, title: newTitle } : c
    );
    setPrompts(updated);
    void savePromptSession({
      ...session,
      prompts: updated,
      updatedAt: Date.now(),
    });
  };

  // Re-apply engine syntax when user changes engine
  const handleEngineChange = (newEngine: EngineType) => {
    setSettings((prev) => ({ ...prev, engine: newEngine }));
    if (prompts.length > 0) {
      const updated = prompts.map((card) => {
        const formatted = formatPromptForEngine(card.rawBasePrompt || card.prompt, {
          ...settings,
          engine: newEngine,
        });
        return {
          ...card,
          prompt: formatted.prompt,
          negativePrompt: formatted.negativePrompt,
        };
      });
      setPrompts(updated);
      void savePromptSession({
        ...session,
        prompts: updated,
        settings: { ...settings, engine: newEngine },
        updatedAt: Date.now(),
      });
      toast.info(`Format sintaks diperbarui ke ${ENGINE_LABELS[newEngine]}`);
    }
  };

  // Re-apply aspect ratio
  const handleAspectRatioChange = (newAr: AspectRatio) => {
    setSettings((prev) => ({ ...prev, aspectRatio: newAr }));
    if (prompts.length > 0) {
      const updated = prompts.map((card) => {
        const formatted = formatPromptForEngine(card.rawBasePrompt || card.prompt, {
          ...settings,
          aspectRatio: newAr,
        });
        return {
          ...card,
          prompt: formatted.prompt,
        };
      });
      setPrompts(updated);
      void savePromptSession({
        ...session,
        prompts: updated,
        settings: { ...settings, aspectRatio: newAr },
        updatedAt: Date.now(),
      });
    }
  };

  // Copy Single Prompt
  const handleCopyCard = (card: PromptCardItem) => {
    void navigator.clipboard.writeText(card.prompt);
    setCopiedId(card.id);
    toast.success(`Prompt #${card.ordinal} disalin!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate Single Image on Google Flow via Extension
  const handleGenerateImageWithFlow = (card: PromptCardItem) => {
    setGeneratingFlowCardId(card.id);
    window.postMessage(
      {
        type: 'METAGEN_TRIGGER_FLOW_GEN',
        payload: {
          cardId: card.id,
          ordinal: card.ordinal,
          title: card.title,
          prompt: card.prompt,
          ratio: settings.aspectRatio || '16:9',
          outputCount: flowOutputCount || 'x1',
          model: settings.engine === 'nanobanana' ? 'Nano Banana 2' : 'Imagen 3',
        },
      },
      '*'
    );
    toast.info(`Mengirim prompt #${card.ordinal} (${flowOutputCount || 'x1'}) ke Google Flow...`, {
      description: 'Ekstensi sedang mengarahkan input ke tab Google Flow.',
      duration: 5000,
    });
  };

  // Generate Prompts in Safe Chunks via Google Flow Extension Queue (Rate-Limit Protected)
  const handleGenerateBatchFlow = (overrideLimit?: number) => {
    const unrenderedPrompts = prompts.filter((p) => !p.generatedImageUrl);
    if (unrenderedPrompts.length === 0) {
      toast.info('Semua prompt pada sesi ini sudah memiliki gambar hasil render.');
      return;
    }

    const limit = overrideLimit || flowBatchLimit;
    const targetCards = unrenderedPrompts.slice(0, limit);
    const remainingCount = unrenderedPrompts.length - targetCards.length;

    targetCards.forEach((card) => {
      window.postMessage(
        {
          type: 'METAGEN_TRIGGER_FLOW_GEN',
          payload: {
            cardId: card.id,
            ordinal: card.ordinal,
            title: card.title,
            prompt: card.prompt,
            ratio: settings.aspectRatio || '16:9',
            outputCount: flowOutputCount || 'x1',
            model: settings.engine === 'nanobanana' ? 'Nano Banana 2' : 'Imagen 3',
          },
        },
        '*'
      );
    });

    toast.success(
      `⚡ Batch Berjalan: ${targetCards.length} prompt (${flowOutputCount}) dimasukkan ke antrean Google Flow!`,
      {
        description:
          remainingCount > 0
            ? `Sisa ${remainingCount} prompt belum dirender dapat dijalankan pada batch berikutnya agar aman.`
            : 'Seluruh prompt yang belum memiliki gambar sedang diproses berurutan.',
        duration: 5000,
      }
    );
  };

  // Copy formatted batch instruction for Google Flow Agent Mode (max 3-5 scenes)
  const handleCopyFlowAgentBatch = async () => {
    if (prompts.length === 0) {
      toast.info('Belum ada prompt pada sesi ini.');
      return;
    }

    const unrenderedPrompts = prompts.filter((p) => !p.generatedImageUrl);
    const candidatePrompts = unrenderedPrompts.length > 0 ? unrenderedPrompts : prompts;
    const limit = Math.min(flowBatchLimit, 5); // Flow Agent works best with 3-5 scenes
    const targetCards = candidatePrompts.slice(0, limit);
    const aspect = settings.aspectRatio && settings.aspectRatio !== 'none' ? settings.aspectRatio : '16:9';
    const outputCount = flowOutputCount || 'x1';

    // Embed Aspect Ratio and Output Count directly into each scene prompt for Agent Mode
    const scenesText = targetCards
      .map(
        (c, i) =>
          `Scene ${i + 1} (${c.title || `Concept #${c.ordinal}`}):\n[Generate ${outputCount} image(s), Aspect Ratio: ${aspect}]\n${c.prompt.trim()}`
      )
      .join('\n\n');

    const agentPrompt = `Act in Agent Mode. I have ${targetCards.length} commercial microstock visual concepts. Batch generate an image for each scene sequentially in ${aspect} aspect ratio with ${outputCount} output(s) each, keeping commercial stock photography quality:\n\n${scenesText}\n\nExecute and generate all ${targetCards.length} scenes now on the canvas.`;

    const copied = await copyToClipboardSafe(agentPrompt);
    setCopiedAgentBatch(true);
    setTimeout(() => setCopiedAgentBatch(false), 2500);

    // Register active agent scenes with extension so manual copy-paste also gets tracked and tagged accurately
    window.postMessage(
      {
        type: 'METAGEN_REGISTER_AGENT_SCENES',
        payload: {
          scenes: targetCards.map((c, i) => ({
            cardId: c.id,
            ordinal: c.ordinal,
            title: c.title,
            prompt: c.prompt,
            sceneIndex: i + 1,
          })),
        },
      },
      '*'
    );

    // 3. Directly dispatch generation to Google Flow tab via extension (Zero Extra Clicks!)
    const targetCardIds = targetCards.map((c) => c.id);
    setFlowQueueCardIds((prev) => Array.from(new Set([...prev, ...targetCardIds])));
    setGeneratingFlowCardId(targetCards[0].id);

    window.postMessage(
      {
        type: 'METAGEN_TRIGGER_FLOW_GEN',
        payload: {
          cardId: targetCards[0].id,
          ordinal: targetCards[0].ordinal,
          title: `Flow Agent Batch (${targetCards.length} Scenes)`,
          prompt: agentPrompt,
          ratio: aspect,
          outputCount: outputCount,
          model: settings.engine === 'nanobanana' ? 'Nano Banana 2' : 'Imagen 3',
          isAgentBatch: true,
          scenes: targetCards.map((c, i) => ({
            cardId: c.id,
            ordinal: c.ordinal,
            title: c.title,
            prompt: c.prompt,
            sceneIndex: i + 1,
          })),
        },
      },
      '*'
    );

    toast.success(`⚡ Mengirim Agent Batch (${targetCards.length} adegan, ${outputCount}) langsung ke Google Flow!`, {
      description: 'Master prompt tersalin ke clipboard dan proses pembuatan otomatis dimulai di Google Flow.',
      duration: 5000,
    });
  };

  // Trigger 2K/4K Mass Downloader on Google Flow
  const handleTriggerFlowMassDownload = () => {
    setIsFlowMassDownloading(true);
    setFlowMassDownloadProgress({ current: 0, total: 0, saved: 0 });

    const cleanFolder = session.title?.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'Session';
    const resPayload =
      flowDownloadResolution === '2K'
        ? '2K, 1080p'
        : flowDownloadResolution === '4K'
        ? '4K, 1080p'
        : '1K, original, 1080p';

    // Sertakan daftar target adegan dari tracking Meta-Gen Studio
    const sessionTargets = prompts.map((p) => {
      const activeVar = p.variations?.[p.selectedVariationIndex || 0] || p.variations?.[0];
      return {
        cardId: p.id,
        ordinal: p.ordinal,
        title: p.title || '',
        token: activeVar?.token || p.mediaToken || '',
        mediaId: activeVar?.mediaId || p.mediaId || '',
        hasImage: !!p.generatedImageUrl,
      };
    });

    window.postMessage(
      {
        type: 'METAGEN_TRIGGER_FLOW_MASS_DOWNLOAD',
        payload: {
          resolution: resPayload,
          batchDelaySeconds: 2,
          skipDownloaded: true,
          targetCards: sessionTargets,
        },
        folder: `MetaGen_Flow/${cleanFolder}`,
      },
      '*'
    );

    toast.info(`⚡ Memulai Mass Downloader ${flowDownloadResolution} di Google Flow...`, {
      description: `Menggunakan sistem tracking internal Meta-Gen (${sessionTargets.length} adegan) tanpa skroll mentok.`,
      duration: 5000,
    });
  };

  const handleStopFlowMassDownload = () => {
    window.postMessage({ type: 'METAGEN_STOP_FLOW_MASS_DOWNLOAD' }, '*');
    setIsFlowMassDownloading(false);
    toast.info('Pengunduhan massal Google Flow dihentikan.');
  };

  // Push generated image into Metadata Studio queue
  const handleSendCardImageToMetadata = (card: PromptCardItem) => {
    if (!card.generatedImageUrl) return;
    try {
      const arr = card.generatedImageUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const cleanTitle = (card.title || 'Flow_Image').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 24);
      const filename = `${cleanTitle}_${card.id.slice(0, 6)}.${ext}`;
      const file = new File([u8arr], filename, { type: mime });

      if (onSendImageToMetadata) {
        onSendImageToMetadata(file);
      } else if (onSwitchToMetadata) {
        onSwitchToMetadata();
        toast.info('Beralih ke tab Metadata Studio.');
      }
    } catch {
      toast.error('Gagal menyiapkan file gambar untuk Metadata Studio.');
    }
  };

  // Download generated image directly
  const handleDownloadCardImage = (card: PromptCardItem) => {
    if (!card.generatedImageUrl) return;
    const a = document.createElement('a');
    a.href = card.generatedImageUrl;
    const cleanTitle = (card.title || 'Flow_Image').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 20);
    const varLetter = card.variations && card.variations.length > 1
      ? `_Var_${card.variations[card.selectedVariationIndex || 0]?.letter || 'A'}`
      : '';
    a.download = `${cleanTitle}${varLetter}_${card.id.slice(0, 6)}.jpg`;
    a.click();
    toast.success('Gambar berhasil diunduh ke komputer!');
  };

  // Switch selected variation preview on prompt card
  const handleSelectCardVariation = (cardId: string, index: number) => {
    setPrompts((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const currentVariations = c.variations || [];
        const chosen = currentVariations[index];
        return {
          ...c,
          selectedVariationIndex: index,
          generatedImageUrl: chosen?.dataUrl || c.generatedImageUrl,
        };
      })
    );
  };

  // Download all variations of a prompt card
  const handleDownloadAllCardVariations = (card: PromptCardItem) => {
    if (!card.variations || card.variations.length === 0) return;
    card.variations.forEach((v, idx) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = v.dataUrl;
        const cleanTitle = (card.title || 'Flow_Image').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 20);
        a.download = `${cleanTitle}_Var_${v.letter}_${card.id.slice(0, 4)}.jpg`;
        a.click();
      }, idx * 250);
    });
    toast.success(`Mengunduh semua (${card.variations.length}) variasi gambar...`);
  };

  // Copy All Prompts
  const handleCopyAll = async () => {
    if (prompts.length === 0) return;
    const txt = exportPromptsToQueueText(prompts);
    await copyToClipboardSafe(txt);
    setCopiedAll(true);
    toast.success(`Semua (${prompts.length}) prompt disalin ke clipboard!`);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Bulk Export: CSV Tabular (Excel / Sheets compatible with UTF-8 BOM)
  const handleExportCsv = () => {
    if (prompts.length === 0) return;
    const csv = exportPromptsToCsv(prompts, settings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = session.title.replace(/[^a-zA-Z0-9_\-]/g, '_');
    a.download = `${cleanTitle || 'prompts'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`File CSV (${prompts.length} prompt) berhasil diunduh!`);
  };

  // Bulk Export: Queue TXT (Line-by-line ready for Midjourney / SD / ComfyUI)
  const handleExportQueueTxt = () => {
    if (prompts.length === 0) return;
    const txt = exportPromptsToQueueText(prompts);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt_queue_${settings.engine}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Queue file TXT berhasil diunduh!');
  };

  // Bulk Export: Full TXT Document
  const handleExportTxt = () => {
    if (prompts.length === 0) return;
    const txt = exportPromptsToText(prompts, settings);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcpa_prompts_${settings.engine}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File TXT lengkap berhasil diunduh!');
  };

  // Bulk Export: JSON Session Archive
  const handleExportJson = () => {
    if (prompts.length === 0) return;
    const json = exportPromptsToJson(prompts, settings, visualDna || undefined);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcpa_prompts_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('File JSON sesi berhasil diunduh!');
  };

  // Clear workspace canvas with confirmation
  const handleClearAll = () => {
    if (prompts.length === 0) return;
    if (confirm('Bersihkan semua prompt dari canvas kerja saat ini? Riwayat sesi tetap tersimpan.')) {
      setPrompts([]);
      void savePromptSession({
        ...session,
        prompts: [],
        updatedAt: Date.now(),
      });
      toast.info('Daftar prompt pada canvas dibersihkan.');
    }
  };

  const pendingQueueCount = queue.filter((q) => q.status === 'pending').length;
  const processingQueueItem = queue.find((q) => q.status === 'processing');
  const completedQueueCount = queue.filter((q) => q.status === 'completed').length;
  const completedQueueItems = queue.filter((q) => q.status === 'completed');

  return (
    <div className="space-y-6">
      {/* 1. Top Header Banner */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-5 shadow-[4px_4px_0_#2c1810] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-[#2c1810] flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-[#ff6b35]" />
              <span>Visual Concept Prompt Agent (VCPA)</span>
            </h2>
            <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-[1px_1px_0_#2c1810]">
              Creative Intelligence v1.0
            </span>
            <span className="bg-[#ff6b35] text-white border-2 border-[#2c1810] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-[1px_1px_0_#2c1810]">
              <Sparkles className="w-3 h-3 text-amber-200" />
              <span>Total Sesi: {prompts.length} Prompt</span>
            </span>
            {queue.length > 0 && (
              <span className="bg-[#fff5e6] border-2 border-[#2c1810] text-[#2c1810] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-[1px_1px_0_#2c1810] animate-pulse">
                <Layers className="w-3 h-3 text-[#ff6b35]" />
                <span>Antrean Aktif ({queue.filter((q) => q.status === 'pending' || q.status === 'processing').length})</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#6b5344] mt-1 font-medium">
            Rancang ide visual komersial berbasis analisis referensi gambar atau brief bebas. Mendukung pengiriman gambar via klik kanan ekstensi browser dengan sistem antrean otomatis.
          </p>
        </div>

        {onSwitchToMetadata && (
          <Button
            type="button"
            variant="outline"
            onClick={onSwitchToMetadata}
            className="h-9.5 bg-white hover:bg-[#fff5e6] text-[#2c1810] font-bold text-xs border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-4 cursor-pointer self-start md:self-auto shrink-0"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-[#ff6b35]" />
            Buka Metadata Studio
          </Button>
        )}
      </div>

      {/* 2. Mode Selector Pill Bar */}
      <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-xl p-1.5 shadow-[3px_3px_0_#2c1810] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('reference_to_prompt')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            mode === 'reference_to_prompt'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'text-[#6b5344] hover:bg-[#fff5e6]'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-[#ff6b35]" />
          <span>Mode 1: Dengan Image Reference (Visual DNA & Antrean Gambar)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('text_ideation');
            setVisualDna(null);
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            mode === 'text_ideation'
              ? 'bg-[#2c1810] text-white shadow-[2px_2px_0_#ff6b35]'
              : 'text-[#6b5344] hover:bg-[#fff5e6]'
          }`}
        >
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span>Mode 2: Tanpa Reference (Creative Brief Ideation)</span>
        </button>
      </div>

      {/* 3. Main Workspace Grid (Left Panel 5 cols, Right Panel 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Creator Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#6b5344]">
              Panel Pengaturan Generator
            </span>
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setIsQueueDrawerOpen((v) => !v)}
                className="text-[11px] font-black text-[#ff6b35] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Lihat Antrean ({queue.length})</span>
              </button>
            )}
          </div>

          {/* CARD 1: Input Konsep & Acuan (Foldable) */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleFold('input')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#fff5e6]/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                {mode === 'reference_to_prompt' ? (
                  <Camera className="w-4 h-4 text-[#ff6b35]" />
                ) : (
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                )}
                <div>
                  <span className="text-xs font-black uppercase text-[#2c1810] block">
                    {mode === 'reference_to_prompt' ? '1. Gambar Referensi & Brief' : '1. Arahan Ide & Brief'}
                  </span>
                  <span className="text-[10px] text-[#6b5344] font-medium block">
                    {mode === 'reference_to_prompt'
                      ? refImageFile ? `${refImageFile.name.slice(0, 24)}...` : 'Unggah satu / banyak gambar acuan'
                      : brief ? `${brief.slice(0, 30)}...` : 'Tuliskan ide konsep'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#2c1810] bg-[#fff5e6] text-[#2c1810]">
                  {mode === 'reference_to_prompt' ? 'Mode 1' : 'Mode 2'}
                </span>
                {foldedSections.input ? (
                  <ChevronDown className="w-4 h-4 text-[#2c1810]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[#2c1810]" />
                )}
              </div>
            </button>

            {!foldedSections.input && (
              <div className="p-4 pt-0 space-y-3.5 border-t border-stone-200/80 mt-1">
                {/* Mode 1: Reference dropzone with Multi-Image Support */}
                {mode === 'reference_to_prompt' && (
                  <div className="space-y-2 pt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-black uppercase text-[#2c1810] flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>Gambar Referensi Visual (Anchor)</span>
                      </Label>
                      {refImageDataUrl && (
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      )}
                    </div>

                    {refImageDataUrl ? (
                      <div className="relative rounded-xl border-2 border-[#2c1810] overflow-hidden bg-stone-100 p-2 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={refImageDataUrl}
                          alt="Reference preview"
                          className="w-20 h-20 object-cover rounded-lg border border-[#2c1810] shrink-0"
                        />
                        <div className="text-xs text-[#2c1810] space-y-1 min-w-0 flex-1">
                          <p className="font-bold truncate">{refImageFile?.name || 'Active Reference'}</p>
                          <p className="text-[11px] text-[#6b5344]">
                            {refImageFile ? `${(refImageFile.size / 1024).toFixed(0)} KB` : 'Siap dianalisis'}
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-[11px] font-black text-[#ff6b35] hover:underline cursor-pointer block"
                            >
                              Ganti / Tambah Banyak
                            </button>
                            {queue.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setIsQueueDrawerOpen((v) => !v)}
                                className="text-[11px] font-bold text-[#2c1810] hover:underline cursor-pointer"
                              >
                                Antrean ({queue.length})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer.files?.length) {
                            void handleSelectMultipleImages(e.dataTransfer.files);
                          }
                        }}
                        className="border-2 border-dashed border-[#2c1810] rounded-xl p-5 text-center bg-white hover:bg-[#fff5e6] focus:bg-[#fff5e6] focus:outline-none focus:ring-2 focus:ring-[#ff6b35] transition-colors cursor-pointer group space-y-2"
                      >
                        <div className="w-9 h-9 rounded-full bg-[#fff5e6] border border-[#2c1810] mx-auto flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Upload className="w-4 h-4 text-[#ff6b35]" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-[#2c1810]">
                            Seret 1 atau banyak gambar ke sini, klik, atau Paste (Ctrl+V)
                          </p>
                          <p className="text-[10px] text-[#6b5344] mt-0.5">
                            Bisa pilih banyak gambar sekaligus atau klik kanan via Ekstensi Browser
                          </p>
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          void handleSelectMultipleImages(e.target.files);
                        }
                      }}
                    />
                  </div>
                )}

                {/* Brief & Inspiration Controls */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black uppercase text-[#2c1810]">
                      {mode === 'reference_to_prompt' ? 'Brief Tambahan (Opsional)' : 'Brief Konsep / Arahan Ide'}
                    </Label>
                    <span className="text-[10px] text-stone-500 font-semibold">
                      {mode === 'reference_to_prompt' ? 'Remix Anchor' : 'Mandatori'}
                    </span>
                  </div>

                  <Textarea
                    rows={3}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={
                      mode === 'reference_to_prompt'
                        ? 'Contoh: Ubah suasana menjadi senja keemasan dengan nuansa futuristik modern...'
                        : 'Contoh: Indonesian coffee shop barista preparing latte art, warm morning light, commercial stock photography...'
                    }
                    className="text-xs bg-white border-2 border-[#2c1810] rounded-xl focus:border-[#ff6b35] placeholder:text-stone-400 font-medium"
                  />

                  {/* Inspirasi Ide Komersial Toolbar */}
                  <div className="pt-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-[#2c1810] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>Inspirasi Ide Komersial</span>
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleShuffleInspirations}
                          className="h-6 px-2 rounded-md border border-[#2c1810] bg-white hover:bg-[#fff5e6] text-[#2c1810] text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-[1px_1px_0_#2c1810]"
                          title="Acak inspirasi katalog"
                        >
                          <Shuffle className="w-3 h-3 text-[#ff6b35]" />
                          <span>Acak</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsBrainstormOpen((v) => !v)}
                          className="h-6 px-2 rounded-md border border-[#2c1810] bg-[#fff5e6] hover:bg-amber-100 text-[#2c1810] text-[10px] font-black flex items-center gap-1 cursor-pointer shadow-[1px_1px_0_#2c1810]"
                        >
                          <Wand2 className="w-3 h-3 text-[#ff6b35]" />
                          <span>Rancang AI</span>
                          {isBrainstormOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* AI Brainstorm Input Drawer */}
                    {isBrainstormOpen && (
                      <div className="p-2.5 rounded-xl border-2 border-[#2c1810] bg-[#fff5e6] space-y-2 shadow-[2px_2px_0_#2c1810]">
                        <div className="text-[11px] font-black text-[#2c1810] flex items-center justify-between">
                          <span>Generator Ide Tema Microstock</span>
                          <span className="text-[10px] font-bold text-[#ff6b35]">AI Assistant</span>
                        </div>
                        <Input
                          value={brainstormTopic}
                          onChange={(e) => setBrainstormTopic(e.target.value)}
                          placeholder="Ketik topik (e.g. ramadhan, sustainable eco, tech ai) atau kosongkan..."
                          className="h-8 text-xs bg-white border border-[#2c1810] rounded-lg"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-[#2c1810]">
                            <span>Jumlah:</span>
                            {[5, 10, 20].map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => setBrainstormCount(cnt)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black border cursor-pointer ${
                                  brainstormCount === cnt
                                    ? 'bg-[#2c1810] text-white border-[#2c1810]'
                                    : 'bg-white text-stone-700 border-stone-300'
                                }`}
                              >
                                {cnt}
                              </button>
                            ))}
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            disabled={isBrainstorming}
                            onClick={() => handleBrainstormIdeas(brainstormTopic, brainstormCount)}
                            className="h-7.5 px-3 text-[11px] font-black bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                          >
                            {isBrainstorming ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                <span>Merancang {brainstormCount} Ide...</span>
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-3 h-3 mr-1" />
                                <span>Rancang {brainstormCount} Ide via AI</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Inspirations Pills List */}
                    <div className="flex flex-wrap gap-1.5">
                      {inspirations.map((idea) => (
                        <div
                          key={idea.id}
                          className={`inline-flex items-center rounded-lg border border-[#2c1810] text-[11px] font-bold shadow-[1px_1px_0_#2c1810] transition-all overflow-hidden ${
                            idea.isAiGenerated
                              ? 'bg-gradient-to-r from-[#fff5e6] to-[#fff0e0] border-[#ff6b35]'
                              : 'bg-white hover:bg-[#fff5e6]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setBrief(idea.brief);
                              toast.success(`Inspirasi "${idea.title}" diterapkan ke brief.`);
                            }}
                            title={idea.brief}
                            className="px-2 py-1 text-[#2c1810] cursor-pointer flex items-center gap-1 text-left"
                          >
                            {idea.isAiGenerated ? (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[#ff6b35] text-white font-black leading-none">
                                AI
                              </span>
                            ) : (
                              <span className="text-[#ff6b35]">⚡</span>
                            )}
                            <span>{idea.title}</span>
                          </button>

                          {brief.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                setBrief((prev) => `${prev.trim()}, ${idea.brief}`);
                                toast.info(`Ditambahkan ke brief: "${idea.title}"`);
                              }}
                              title="Tambahkan ke akhir brief saat ini"
                              className="px-1.5 py-1 border-l border-[#2c1810]/30 text-[#6b5344] hover:text-[#ff6b35] hover:bg-[#ffe0cc] cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CARD 2: Engine AI & Parameter Sintaks (Foldable) */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleFold('engine')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#fff5e6]/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-[#ff6b35]" />
                <div>
                  <span className="text-xs font-black uppercase text-[#2c1810] block">
                    2. Engine AI & Parameter Sintaks
                  </span>
                  <span className="text-[10px] text-[#6b5344] font-medium block">
                    {ENGINE_LABELS[settings.engine]} · {settings.aspectRatio === 'none' ? 'Bebas Rasio' : settings.aspectRatio} · {settings.count} Prompt
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#2c1810] bg-[#fff5e6] text-[#2c1810]">
                  {settings.count} Batch
                </span>
                {foldedSections.engine ? (
                  <ChevronDown className="w-4 h-4 text-[#2c1810]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[#2c1810]" />
                )}
              </div>
            </button>

            {!foldedSections.engine && (
              <div className="p-4 pt-0 space-y-4 border-t border-stone-200/80 mt-1">
                {/* Engine Selector */}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black text-[#2c1810]">Pilih Engine Target AI</Label>
                    <span className="text-[10px] font-bold text-[#6b5344]">Sintaks Otomatis</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {ENGINE_ITEMS.map((eng) => (
                      <button
                        key={eng.id}
                        type="button"
                        onClick={() => handleEngineChange(eng.id)}
                        className={`py-2 px-2.5 rounded-xl border-2 text-left text-xs font-black cursor-pointer transition-all flex items-center justify-between ${
                          settings.engine === eng.id
                            ? 'bg-[#2c1810] text-white border-[#2c1810] shadow-[2px_2px_0_#ff6b35]'
                            : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                        }`}
                      >
                        <span className="truncate">{eng.label}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ml-1.5 shrink-0 ${
                            settings.engine === eng.id
                              ? 'bg-[#ff6b35] text-white border-white/40'
                              : 'bg-stone-100 text-stone-600 border-stone-300'
                          }`}
                        >
                          {eng.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black text-[#2c1810]">Proporsi (Aspect Ratio)</Label>
                    <span className="text-[10px] font-bold text-[#6b5344]">
                      {settings.aspectRatio === 'none' ? 'Bebas (Tanpa Rasio)' : `Rasio ${settings.aspectRatio}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                    {ASPECT_RATIO_ITEMS.map((arItem) => (
                      <button
                        key={arItem.id}
                        type="button"
                        onClick={() => handleAspectRatioChange(arItem.id)}
                        title={arItem.desc}
                        className={`py-1.5 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all ${
                          settings.aspectRatio === arItem.id
                            ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[1px_1px_0_#2c1810]'
                            : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                        }`}
                      >
                        {arItem.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Count Pills */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black text-[#2c1810]">Jumlah Prompt per Generasi</Label>
                    <span className="text-[11px] font-black text-[#ff6b35] bg-[#fff5e6] px-2 py-0.5 rounded border border-[#2c1810]">
                      {settings.count} Prompt
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[1, 2, 3, 5, 10, 20].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, count: cnt }))}
                        className={`py-1.5 rounded-lg border-2 text-center text-xs font-black cursor-pointer transition-all ${
                          settings.count === cnt
                            ? 'bg-[#ff6b35] text-white border-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                            : 'bg-white text-[#2c1810] border-stone-200 hover:bg-[#fff5e6]'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Similarity Slider (Visible in Reference Mode) */}
                {mode === 'reference_to_prompt' && (
                  <div className="space-y-1.5 p-3 bg-stone-50 border-2 border-stone-200 rounded-xl">
                    <div className="flex items-center justify-between text-xs font-black text-[#2c1810]">
                      <span>Tingkat Kemiripan (Similarity)</span>
                      <span className="text-[#ff6b35]">{settings.similarity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={settings.similarity}
                      onChange={(e) => setSettings((s) => ({ ...s, similarity: Number(e.target.value) }))}
                      className="w-full accent-[#ff6b35] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[#6b5344] font-semibold">
                      <span>0% (Eksplorasi Liar)</span>
                      <span>50% (Seimbang)</span>
                      <span>100% (Sangat Mirip)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CARD 3: Arah Visual & Sumbu Kreatif (Foldable) */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleFold('visual')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#fff5e6]/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Palette className="w-4 h-4 text-[#ff6b35]" />
                <div>
                  <span className="text-xs font-black uppercase text-[#2c1810] block">
                    3. Gaya Visual & Sumbu Fokus
                  </span>
                  <span className="text-[10px] text-[#6b5344] font-medium block">
                    {VISUAL_DIRECTION_OPTIONS.find((v) => v.id === settings.visualDirection)?.label || settings.visualDirection}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#2c1810] bg-[#fff5e6] text-[#2c1810]">
                  {settings.visualDirection}
                </span>
                {foldedSections.visual ? (
                  <ChevronDown className="w-4 h-4 text-[#2c1810]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[#2c1810]" />
                )}
              </div>
            </button>

            {!foldedSections.visual && (
              <div className="p-4 pt-0 space-y-4 border-t border-stone-200/80 mt-1">
                {/* Visual Direction / Style */}
                <div className="space-y-1.5 pt-3">
                  <Label className="text-xs font-black text-[#2c1810]">Gaya Visual Utama</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {VISUAL_DIRECTION_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, visualDirection: opt.id }))}
                        className={`p-2 rounded-lg border-2 text-left transition-all cursor-pointer ${
                          settings.visualDirection === opt.id
                            ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black'
                            : 'bg-white border-stone-200 hover:border-stone-400 font-semibold text-stone-700'
                        }`}
                      >
                        <span className="text-xs text-[#2c1810] block">{opt.label}</span>
                        <span className="text-[10px] text-stone-500 font-normal block truncate">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Creative Focus */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-[#2c1810]">Sumbu Fokus Kreatif (Axis)</Label>
                  <div className="grid grid-cols-1 gap-1">
                    {(Object.keys(CREATIVE_FOCUS_LABELS) as CreativeFocus[]).map((fId) => (
                      <button
                        key={fId}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, creativeFocus: fId }))}
                        className={`py-1.5 px-2.5 rounded-lg border-2 text-left text-xs transition-all cursor-pointer ${
                          settings.creativeFocus === fId
                            ? 'bg-[#fff5e6] border-[#2c1810] shadow-[2px_2px_0_#2c1810] font-black text-[#2c1810]'
                            : 'bg-white border-stone-200 hover:bg-stone-50 font-medium text-stone-700'
                        }`}
                      >
                        {CREATIVE_FOCUS_LABELS[fId]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CARD 4: Detail Kreatif & Keamanan (Foldable) */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleFold('safety')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#fff5e6]/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <div>
                  <span className="text-xs font-black uppercase text-[#2c1810] block">
                    4. Preservasi Semantik & Safety
                  </span>
                  <span className="text-[10px] text-[#6b5344] font-medium block">
                    {settings.commercialSafety ? '🛡️ Commercial Guardrails Aktif' : 'Standard'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#2c1810] bg-[#fff5e6] text-[#2c1810]">
                  {settings.semanticMode === 'meaning_preservation' ? 'Makna' : settings.semanticMode === 'visual_replication' ? 'Visual' : 'Bebas'}
                </span>
                {foldedSections.safety ? (
                  <ChevronDown className="w-4 h-4 text-[#2c1810]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[#2c1810]" />
                )}
              </div>
            </button>

            {!foldedSections.safety && (
              <div className="p-4 pt-0 space-y-3.5 border-t border-stone-200/80 mt-1">
                {/* Semantic Preservation Mode */}
                <div className="space-y-1.5 pt-3">
                  <Label className="text-xs font-black text-[#2c1810]">Mode Preservasi Semantik</Label>
                  <div className={`grid gap-1.5 ${mode === 'reference_to_prompt' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {[
                      { id: 'meaning_preservation', label: 'Makna / Tema', desc: 'Jaga pesan' },
                      ...(mode === 'reference_to_prompt'
                        ? [{ id: 'visual_replication', label: 'Ciri Visual', desc: 'Jaga bentuk' }]
                        : []),
                      { id: 'free_ideation', label: 'Ideasi Bebas', desc: 'Eksplorasi total' },
                    ].map((sm) => (
                      <button
                        key={sm.id}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, semanticMode: sm.id as SemanticMode }))}
                        className={`p-1.5 rounded-lg border-2 text-center transition-all cursor-pointer ${
                          settings.semanticMode === sm.id
                            ? 'bg-[#2c1810] text-white border-[#2c1810] shadow-[1px_1px_0_#ff6b35] font-black'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-[#fff5e6] font-semibold'
                        }`}
                      >
                        <span className="text-[11px] block">{sm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Commercial Safety Guardrail */}
                <div className="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-emerald-950 font-bold text-[11px] leading-tight">
                      🛡️ Microstock Commercial Guardrails (Copy Space & Bebas Trademark)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.commercialSafety}
                    onChange={(e) => setSettings((s) => ({ ...s, commercialSafety: e.target.checked }))}
                    className="w-4 h-4 accent-[#ff6b35] rounded cursor-pointer shrink-0"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Primary Generate Action Button */}
          <Button
            type="button"
            disabled={busy && queue.length === 0}
            onClick={handleGenerate}
            className="w-full h-12 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-black text-sm border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{progressStep || 'Memproses Visual Concept Agent...'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Wand2 className="w-5 h-5" />
                <span>
                  Hasilkan {settings.count} Prompt Konseptual ({settings.engine.toUpperCase()})
                </span>
              </span>
            )}
          </Button>
        </div>

        {/* Right Column: Output & Visual DNA Feed & Queue Manager (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* A. AUTOMATED QUEUE MANAGER PANEL */}
          {queue.length > 0 && (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#ff6b35]" />
                  <div>
                    <h3 className="font-black text-xs sm:text-sm text-[#2c1810] flex items-center gap-2">
                      <span>Antrean Generator Gambar (VCPA Queue)</span>
                      {processingQueueItem && (
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      )}
                    </h3>
                    <p className="text-[11px] text-[#6b5344]">
                      {pendingQueueCount > 0
                        ? `${pendingQueueCount} gambar menunggu diproses secara beruntun.`
                        : 'Semua gambar dalam antrean telah selesai diproses.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Pause / Resume Button */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsQueuePaused((v) => !v);
                      toast.info(isQueuePaused ? 'Antrean dilanjutkan.' : 'Antrean dijeda.');
                    }}
                    className="h-7 px-2 text-[11px] font-black border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810]"
                  >
                    {isQueuePaused ? (
                      <>
                        <Play className="w-3 h-3 mr-1 text-emerald-600" />
                        <span>Lanjutkan</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 mr-1 text-amber-600" />
                        <span>Jeda</span>
                      </>
                    )}
                  </Button>

                  {/* Clear Completed */}
                  {completedQueueCount > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleClearCompletedQueue}
                      className="h-7 px-2 text-[11px] font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810]"
                      title="Bersihkan antrean yang telah selesai"
                    >
                      <Check className="w-3 h-3 mr-1 text-emerald-600" />
                      <span>Selesai ({completedQueueCount})</span>
                    </Button>
                  )}

                  {/* Cancel Pending */}
                  {pendingQueueCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCancelPendingQueue}
                      className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-rose-50 text-[11px] font-bold cursor-pointer"
                      title="Batalkan antrean yang belum berjalan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Drawer Collapse Button */}
                  <button
                    type="button"
                    onClick={() => setIsQueueDrawerOpen((v) => !v)}
                    className="p-1 rounded text-stone-500 hover:text-[#2c1810] cursor-pointer ml-1"
                  >
                    {isQueueDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Highlight Total Prompt Sesi Ini */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-[#fff5e6] via-amber-50 to-[#fff5e6] border-2 border-[#ff6b35] shadow-[2px_2px_0_#2c1810] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#ff6b35] border border-[#2c1810] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase text-[#ff6b35] tracking-wider truncate">
                      Highlight Akumulasi Sesi
                    </div>
                    <div className="text-[11px] font-bold text-[#6b5344] truncate">
                      Total prompt yang tergenerate & tersimpan dalam sesi kerja aktif
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-[#ff6b35] text-white px-3 py-1.5 rounded-xl border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] shrink-0">
                  <span className="text-lg sm:text-xl font-black leading-none">{prompts.length}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide">Prompt</span>
                </div>
              </div>

              {/* Queue Items Drawer */}
              {isQueueDrawerOpen && (
                <div className="pt-2 border-t border-stone-200 space-y-3">
                  {/* 1. Currently Processing Item */}
                  {processingQueueItem && (
                    <div className="p-2.5 rounded-xl border-2 border-[#ff6b35] bg-[#fff5e6] flex items-center justify-between gap-3 shadow-[2px_2px_0_#2c1810]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={processingQueueItem.imageDataUrl}
                          alt="Processing"
                          className="w-12 h-12 object-cover rounded-lg border border-[#2c1810] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black bg-[#ff6b35] text-white px-1.5 py-0.2 rounded uppercase">
                              Sedang Proses
                            </span>
                            <span className="text-xs font-black text-[#2c1810] truncate">
                              {processingQueueItem.filename}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#ff6b35] font-bold flex items-center gap-1 mt-0.5">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>{processingQueueItem.progressStep || 'Memproses Visual Concept Agent...'}</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#6b5344] font-semibold shrink-0">
                        {processingQueueItem.source === 'extension' ? '🌐 Ekstensi' : '📁 Upload'}
                      </span>
                    </div>
                  )}

                  {/* 2. Pending Items List */}
                  {pendingQueueCount > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase text-[#6b5344] tracking-wide block">
                        Menunggu Giliran ({pendingQueueCount}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {queue
                          .filter((q) => q.status === 'pending')
                          .map((item, idx) => (
                            <div
                              key={item.id}
                              className="p-2 rounded-lg border border-stone-300 bg-white flex items-center justify-between gap-2 shadow-[1px_1px_0_#2c1810]"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-black text-stone-500 bg-stone-100 px-1 rounded">
                                  #{idx + 1}
                                </span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.imageDataUrl}
                                  alt="Pending"
                                  className="w-8 h-8 object-cover rounded border border-stone-200 shrink-0"
                                />
                                <span className="text-[11px] font-bold text-[#2c1810] truncate">
                                  {item.filename}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveQueueItem(item.id)}
                                className="text-stone-400 hover:text-red-600 p-1 cursor-pointer shrink-0"
                                title="Batalkan item ini"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Riwayat Gambar Selesai (Completed Images History Thumbnails) */}
                  {completedQueueCount > 0 && (
                    <div className="pt-2 border-t border-stone-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-[#2c1810] tracking-wide flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Riwayat Gambar Selesai ({completedQueueCount})</span>
                        </span>
                        <span className="text-[10px] font-bold text-[#6b5344]">
                          Total {completedQueueItems.reduce((acc, it) => acc + (it.generatedCount || 0), 0)} prompt dihasilkan
                        </span>
                      </div>

                      {/* Horizontal Scrollable Thumbnail Strip */}
                      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                        {completedQueueItems.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="group relative flex-shrink-0 w-24 bg-white border-2 border-[#2c1810] rounded-xl p-1.5 shadow-[2px_2px_0_#2c1810] hover:shadow-[3px_3px_0_#ff6b35] hover:-translate-y-0.5 transition-all cursor-pointer"
                            title={`${item.filename} (Klik untuk jadikan acuan aktif)`}
                            onClick={() => {
                              setRefImageDataUrl(item.imageDataUrl);
                              toast.info(`Gambar "${item.filename}" dimuat sebagai referensi visual aktif.`);
                            }}
                          >
                            <div className="relative w-full h-20 rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.imageDataUrl}
                                alt={item.filename}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <span className="absolute bottom-1 right-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                                +{item.generatedCount || settings.count}P
                              </span>
                              <span className="absolute top-1 left-1 bg-[#2c1810]/80 text-white text-[9px] font-bold px-1 rounded flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-[#2c1810] truncate mt-1 text-center" title={item.filename}>
                              {item.filename}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* B. Visual DNA Profile Inspector (Only in Mode 1 with active image) */}
          {mode === 'reference_to_prompt' && visualDna && (
            <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl shadow-[4px_4px_0_#2c1810] overflow-hidden">
              <button
                type="button"
                onClick={() => setIsDnaExpanded((v) => !v)}
                className="w-full p-4 flex items-center justify-between bg-[#fff5e6] border-b-2 border-[#2c1810] font-black text-xs text-[#2c1810] cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#ff6b35]" />
                  <span>Visual DNA Profile (Hasil Analisis Citra Referensi)</span>
                </div>
                {isDnaExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isDnaExpanded && (
                <div className="p-4 space-y-3 text-xs bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                      <span className="font-black text-[#2c1810] block text-[11px] uppercase tracking-wide">
                        🔍 Observed (Fakta Visual):
                      </span>
                      <p className="text-[#6b5344] leading-relaxed">
                        {safeFormatList(visualDna.observed, 'Subjek teramati')}
                      </p>
                    </div>

                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                      <span className="font-black text-[#2c1810] block text-[11px] uppercase tracking-wide">
                        💭 Inferred (Suasana & Tafsir):
                      </span>
                      <p className="text-[#6b5344] leading-relaxed">
                        {safeFormatList(visualDna.inferred, 'Suasana komersial')}
                      </p>
                    </div>

                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <span className="font-black text-amber-950 block text-[11px] uppercase tracking-wide">
                        ⚓ Anchors (Elemen yang Dijaga):
                      </span>
                      <p className="text-amber-900 leading-relaxed">
                        {safeFormatList(visualDna.anchors, 'Subjek utama')}
                      </p>
                    </div>

                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                      <span className="font-black text-blue-950 block text-[11px] uppercase tracking-wide">
                        🔄 Variables (Variabel yang Diubah):
                      </span>
                      <p className="text-blue-900 leading-relaxed">
                        {safeFormatList(visualDna.editableVariables, 'Komposisi, sudut kamera, pencahayaan')}
                      </p>
                    </div>
                  </div>

                  {visualDna.semanticProfile?.coreTheme && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950">
                      <span className="font-black block text-[11px] uppercase tracking-wide mb-0.5">
                        💡 Tema & Pesan Konseptual:
                      </span>
                      <p className="font-medium text-xs">
                        {visualDna.semanticProfile.coreTheme}
                        {visualDna.semanticProfile.metaphor &&
                          ` (Metafora: ${safeFormatList(visualDna.semanticProfile.metaphor, '')})`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* C. Active Session Control & Bulk Actions Header */}
          <div className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Session Title & Metadata */}
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#ff6b35] bg-[#fff5e6] border border-[#2c1810] px-2 py-0.5 rounded-md">
                    ⚡ Auto-Add Sesi Aktif
                  </span>

                  {/* Highlight Jumlah Prompt Keseluruhan Sesi */}
                  <span className="text-xs font-black text-white bg-[#ff6b35] border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] px-2.5 py-1 rounded-lg flex items-center gap-1.5 animate-in fade-in">
                    <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                    <span>TOTAL SESI:</span>
                    <span className="bg-white text-[#ff6b35] px-1.5 py-0.5 rounded font-black text-xs leading-none">
                      {prompts.length}
                    </span>
                    <span>PROMPT</span>
                  </span>

                  <span className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-2 py-0.5 rounded-md">
                    {ENGINE_LABELS[settings.engine]}
                  </span>
                </div>

                {/* Inline Editable Title */}
                {isEditingTitle ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Input
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') setIsEditingTitle(false);
                      }}
                      autoFocus
                      className="h-8 text-xs font-black bg-white border-2 border-[#2c1810] rounded-lg max-w-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveTitle}
                      className="h-8 px-2.5 text-xs font-black bg-[#2c1810] text-white border-2 border-[#2c1810] cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Simpan
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditingTitle(false)}
                      className="h-8 px-2 text-xs text-stone-600 cursor-pointer"
                    >
                      Batal
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group pt-0.5">
                    <h3 className="font-black text-sm sm:text-base text-[#2c1810] truncate">
                      {session.title}
                    </h3>
                    <button
                      type="button"
                      onClick={handleStartEditTitle}
                      className="p-1 rounded text-stone-400 hover:text-[#2c1810] hover:bg-stone-100 transition-colors cursor-pointer"
                      title="Ubah nama sesi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-[#6b5344]">
                  Setiap prompt baru otomatis ditambahkan ke sesi ini. Prompt terbaru muncul paling atas.
                </p>
              </div>

              {/* Session Top Actions: + Sesi Baru, Riwayat Sesi & Antrean */}
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                {queue.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={queue.some((q) => q.status === 'processing') ? 'default' : 'outline'}
                    onClick={() => setIsQueueDrawerOpen((v) => !v)}
                    className={`h-8.5 px-3 text-xs font-black border-2 border-[#2c1810] cursor-pointer transition-all ${
                      queue.some((q) => q.status === 'processing')
                        ? 'bg-[#ff6b35] text-white shadow-[2px_2px_0_#2c1810]'
                        : 'bg-white hover:bg-[#fff5e6] text-[#2c1810] shadow-[2px_2px_0_#2c1810]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    <span>Antrean ({queue.filter((q) => q.status === 'pending' || q.status === 'processing').length})</span>
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsSessionModalOpen(true)}
                  className="h-8.5 px-3 text-xs font-black border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  <History className="w-3.5 h-3.5 mr-1.5 text-[#ff6b35]" />
                  <span>Riwayat Sesi</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleNewSession}
                  className="h-8.5 px-3 text-xs font-black bg-[#ff6b35] hover:bg-[#e55a2b] text-white border-2 border-[#2c1810] shadow-[2px_2px_0_#2c1810] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>Sesi Baru</span>
                </Button>
              </div>
            </div>

            {/* Bulk Export & Action Toolbar */}
            {prompts.length > 0 && (
              <div className="pt-2.5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-[#6b5344]">
                  Unduh Sekaligus Semua:
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-7.5 px-2.5 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                    title="Unduh seluruh prompt dalam format CSV tabel (Excel/Google Sheets)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                    <span>CSV (Excel)</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportQueueTxt}
                    className="h-7.5 px-2.5 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                    title="Unduh teks antrean baris per baris siap render"
                  >
                    <Download className="w-3.5 h-3.5 mr-1 text-[#ff6b35]" />
                    <span>Queue TXT</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportTxt}
                    className="h-7.5 px-2 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                    title="Unduh dokumen TXT lengkap dengan strategi & rationale"
                  >
                    <span>TXT Lengkap</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAll}
                    className="h-7.5 px-2.5 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                    title="Salin seluruh prompt sekaligus ke clipboard"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    <span>{copiedAll ? 'Tersalin!' : 'Salin Semua'}</span>
                  </Button>

                  {/* Flow Batch Generation with Safety Limit Controls */}
                  <div className="flex items-center gap-1 bg-[#fff5e6] p-0.5 rounded-lg border-2 border-[#2c1810] shadow-[1px_1px_0_#2c1810]">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGenerateBatchFlow()}
                      disabled={prompts.every((p) => p.generatedImageUrl)}
                      className="h-6.5 px-2.5 text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white cursor-pointer disabled:opacity-50"
                      title={`Antrekan batch aman (maksimal ${flowBatchLimit} prompt) ke Google Flow`}
                    >
                      <Sparkles className="w-3 h-3 mr-1 text-yellow-200" />
                      <span>
                        ⚡ Gen Batch ({Math.min(prompts.filter((p) => !p.generatedImageUrl).length, flowBatchLimit)}
                        {prompts.filter((p) => !p.generatedImageUrl).length > flowBatchLimit
                          ? `/${prompts.filter((p) => !p.generatedImageUrl).length}`
                          : ''})
                      </span>
                    </Button>

                    {/* Batch Limit Selector */}
                    <div
                      className="flex items-center gap-0.5 px-1 text-[10px] font-bold text-stone-600"
                      title="Batas maksimal prompt per kirim agar tidak terkena limit atau membebani Google Flow"
                    >
                      <span className="text-[9px] uppercase tracking-tight text-stone-500">Max:</span>
                      {[3, 5, 8].map((limitOption) => (
                        <button
                          key={limitOption}
                          type="button"
                          onClick={() => setFlowBatchLimit(limitOption)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-all ${
                            flowBatchLimit === limitOption
                              ? 'bg-[#2c1810] text-white'
                              : 'bg-white hover:bg-amber-100 text-[#2c1810] border border-stone-300'
                          }`}
                        >
                          {limitOption}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Flow Output Variations Selector (x1 to x4 - Google Flow Limit) */}
                  <div
                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#f5f0ff] rounded-lg border-2 border-purple-800 shadow-[1px_1px_0_#2c1810]"
                    title="Jumlah hasil generate per prompt di Google Flow (x1 hingga x4 variasi)"
                  >
                    <span className="text-[9px] uppercase font-black text-purple-900 tracking-tight">Out:</span>
                    {(['x1', 'x2', 'x3', 'x4'] as const).map((outOption) => (
                      <button
                        key={outOption}
                        type="button"
                        onClick={() => setFlowOutputCount(outOption)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-all ${
                          flowOutputCount === outOption
                            ? 'bg-purple-900 text-white shadow-xs'
                            : 'bg-white hover:bg-purple-100 text-purple-900 border border-purple-300'
                        }`}
                      >
                        {outOption}
                      </button>
                    ))}
                  </div>

                  {/* Flow Agent Master Prompt Copy & Trigger */}
                  {(() => {
                    const unrendered = prompts.filter((p) => !p.generatedImageUrl);
                    const candidates = unrendered.length > 0 ? unrendered : prompts;
                    const batchCount = Math.min(candidates.length, Math.min(flowBatchLimit, 5));
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyFlowAgentBatch}
                        disabled={prompts.length === 0}
                        className={`h-7.5 px-2 text-xs font-bold border-2 border-purple-800 shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all disabled:opacity-50 ${
                          copiedAgentBatch
                            ? 'bg-purple-200 text-purple-950 font-black'
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-900'
                        }`}
                        title={`Kirim instruksi batch berstruktur langsung ke Google Flow Agent (maksimal ${Math.min(flowBatchLimit, 5)} adegan, ${flowOutputCount} variasi)`}
                      >
                        {copiedAgentBatch ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                            <span>Mengirim ({batchCount})</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5 mr-1 text-purple-700" />
                            <span>Agent Batch ({batchCount})</span>
                          </>
                        )}
                      </Button>
                    );
                  })()}

                  {/* Flow Download Resolution Selector */}
                  <div
                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#eefbf4] rounded-lg border-2 border-emerald-800 shadow-[1px_1px_0_#2c1810]"
                    title="Pilih resolusi unduhan massal galeri Google Flow (2K Upscaled, 4K Ultra HD, atau 1K Original)"
                  >
                    <span className="text-[9px] uppercase font-black text-emerald-900 tracking-tight">Res:</span>
                    {(['2K', '4K', '1K'] as const).map((rOption) => (
                      <button
                        key={rOption}
                        type="button"
                        onClick={() => setFlowDownloadResolution(rOption)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-all ${
                          flowDownloadResolution === rOption
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        {rOption}
                      </button>
                    ))}
                  </div>

                  {/* Flow 2K/4K/1K Mass Downloader */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={isFlowMassDownloading ? handleStopFlowMassDownload : handleTriggerFlowMassDownload}
                    className={`h-7.5 px-2 text-xs font-bold border-2 border-emerald-800 shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all ${
                      isFlowMassDownloading
                        ? 'bg-emerald-100 text-emerald-950 hover:bg-red-50 hover:text-red-700 hover:border-red-600'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                    }`}
                    title={
                      isFlowMassDownloading
                        ? 'Klik untuk menghentikan unduh massal'
                        : `Unduh seluruh aset visual galeri Google Flow dalam resolusi ${flowDownloadResolution}`
                    }
                  >
                    {isFlowMassDownloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-emerald-700" />
                        <span>
                          {flowMassDownloadProgress.total > 0
                            ? `Unduh (${flowMassDownloadProgress.current}/${flowMassDownloadProgress.total})`
                            : 'Memindai...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                        <span>Unduh {flowDownloadResolution}</span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportJson}
                    className="h-7.5 px-2 text-xs font-bold border-2 border-[#2c1810] bg-white hover:bg-[#fff5e6] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                    title="Unduh arsip JSON lengkap sesi"
                  >
                    <span>JSON</span>
                  </Button>

                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-stone-400 hover:text-red-600 font-bold ml-1 cursor-pointer"
                  >
                    Bersihkan
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* D. Prompt Cards Feed */}
          {prompts.length === 0 ? (
            <div className="bg-[#fffdf9] border-2 border-dashed border-[#2c1810] rounded-2xl p-10 text-center shadow-[4px_4px_0_#2c1810] space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#fff5e6] border-2 border-[#2c1810] mx-auto flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-[#ff6b35]" />
              </div>
              <div>
                <h4 className="font-black text-sm text-[#2c1810]">Belum Ada Prompt Dihasilkan</h4>
                <p className="text-xs text-[#6b5344] max-w-sm mx-auto mt-1">
                  Pilih gambar referensi, seret banyak gambar ke antrean, atau klik kanan gambar di web menggunakan ekstensi browser untuk memulai eksplorasi AI.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {prompts.map((card, index) => {
                const isRegenerating = regeneratingId === card.id;
                const isCopied = copiedId === card.id;
                const isLatestBatch = index === 0;

                return (
                  <div
                    key={card.id}
                    className="bg-[#fffdf9] border-2 border-[#2c1810] rounded-2xl p-4 shadow-[4px_4px_0_#2c1810] space-y-3 transition-all hover:shadow-[5px_5px_0_#2c1810]"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b-2 border-stone-200 pb-2.5 gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-black text-xs text-[#2c1810] bg-[#fff5e6] border border-[#2c1810] px-2 py-0.5 rounded">
                          #{String(prompts.length - index).padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) => handleCardTitleChange(card.id, e.target.value)}
                          className="font-black text-sm text-[#2c1810] bg-transparent border-b border-transparent hover:border-stone-300 focus:border-[#ff6b35] focus:outline-none px-1 rounded truncate max-w-[200px] sm:max-w-xs"
                        />
                        <span className="bg-stone-100 border border-stone-300 text-stone-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {card.creativeStrategy}
                        </span>
                        {isLatestBatch && (
                          <span className="bg-emerald-100 border border-emerald-400 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
                            Terbaru
                          </span>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(card.id)}
                          className={`p-1.5 rounded-md border cursor-pointer transition-all ${
                            card.isFavorite
                              ? 'bg-amber-100 border-amber-400 text-amber-600'
                              : 'bg-white border-stone-200 hover:bg-stone-100 text-stone-400'
                          }`}
                          title="Tandai favorit"
                        >
                          <Star className={`w-3.5 h-3.5 ${card.isFavorite ? 'fill-amber-500' : ''}`} />
                        </button>

                        <button
                          type="button"
                          disabled={isRegenerating}
                          onClick={() => handleRegenerateCard(card)}
                          className="p-1.5 rounded-md bg-white hover:bg-[#fff5e6] border border-stone-200 text-[#2c1810] cursor-pointer transition-all disabled:opacity-50"
                          title="Regenerasi konsep ini saja"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin text-[#ff6b35]' : ''}`} />
                        </button>

                        {(() => {
                          const isCurrentlyGenerating = generatingFlowCardId === card.id;
                          const queueIdx = flowQueueCardIds.indexOf(card.id);
                          const isQueued = queueIdx >= 0 && !isCurrentlyGenerating;
                          const queueNumber = queueIdx + 1;

                          return (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isCurrentlyGenerating || isQueued}
                              onClick={() => handleGenerateImageWithFlow(card)}
                              className={`h-7 px-2.5 font-bold text-xs border border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer transition-all ${
                                isCurrentlyGenerating
                                  ? 'bg-amber-600 text-white'
                                  : isQueued
                                  ? 'bg-amber-100 text-amber-900 border-amber-500'
                                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
                              }`}
                              title={
                                isCurrentlyGenerating
                                  ? 'Sedang merender di Google Flow...'
                                  : isQueued
                                  ? `Dalam antrean Google Flow (Urutan ke-${queueNumber})`
                                  : 'Generate gambar langsung di Google Flow menggunakan prompt ini'
                              }
                            >
                              {isCurrentlyGenerating ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span className="ml-1">Gen Flow...</span>
                                </>
                              ) : isQueued ? (
                                <>
                                  <Clock className="w-3.5 h-3.5 animate-pulse text-amber-700" />
                                  <span className="ml-1">Antrean #{queueNumber}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                                  <span className="ml-1">Gen Img</span>
                                </>
                              )}
                            </Button>
                          );
                        })()}

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleCopyCard(card)}
                          className="h-7 px-2.5 bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-bold text-xs border border-[#2c1810] shadow-[1px_1px_0_#2c1810] cursor-pointer"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="ml-1">{isCopied ? 'Tersalin' : 'Salin'}</span>
                        </Button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="p-1.5 rounded-md bg-white hover:bg-rose-50 border border-stone-200 text-stone-400 hover:text-red-600 cursor-pointer transition-all ml-0.5"
                          title="Hapus konsep ini dari sesi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Prompt Textarea Display (Inline Editable) */}
                    <div className="space-y-1">
                      <Textarea
                        rows={3}
                        value={card.prompt}
                        onChange={(e) => handlePromptTextChange(card.id, e.target.value)}
                        className="font-mono text-xs text-[#2c1810] leading-relaxed bg-white border-2 border-stone-300 rounded-xl resize-y"
                      />
                      {card.isEdited && (
                        <span className="text-[10px] text-amber-700 font-bold block">
                          ✎ Prompt telah diedit manual
                        </span>
                      )}
                    </div>

                    {/* Generated Flow Image Preview */}
                    {card.generatedImageUrl && (
                      <div className="p-3 bg-gradient-to-r from-amber-50/80 to-orange-50/80 border-2 border-amber-300 rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-950 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            Hasil Render Google Flow
                            {card.variations && card.variations.length > 1 && (
                              <span className="text-[#ff6b35] font-black">
                                (Variasi {card.variations[card.selectedVariationIndex || 0]?.letter || 'A'})
                              </span>
                            )}:
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                            {card.variations && card.variations.length > 1
                              ? `✓ ${card.variations.length} Variasi Siap`
                              : '✓ Siap'}
                          </span>
                        </div>

                        {/* Large Preview */}
                        <div className="relative group rounded-lg overflow-hidden border border-amber-200 bg-black/5 aspect-video flex items-center justify-center max-h-60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.generatedImageUrl}
                            alt={card.title}
                            className="w-full h-full object-contain"
                          />
                        </div>

                        {/* Multi-Variation Selector Strip (if > 1 variation, max 4) */}
                        {card.variations && card.variations.length > 1 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-stone-600 block">
                                Variasi Hasil Render ({card.variations.length} gambar):
                              </span>
                              <span className="text-[9px] text-[#ff6b35] font-bold">
                                Klik untuk melihat / memilih
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {card.variations.map((v, vIdx) => {
                                const isSelected = (card.selectedVariationIndex ?? 0) === vIdx;
                                return (
                                  <button
                                    key={vIdx}
                                    type="button"
                                    onClick={() => handleSelectCardVariation(card.id, vIdx)}
                                    className={`relative p-1 rounded-lg border text-left cursor-pointer transition-all flex items-center gap-2 ${
                                      isSelected
                                        ? 'bg-amber-100/90 border-[#ff6b35] shadow-[0_0_0_1.5px_#ff6b35]'
                                        : 'bg-white hover:bg-stone-50 border-stone-200'
                                    }`}
                                  >
                                    <div className="w-9 h-9 rounded overflow-hidden shrink-0 bg-stone-100 border border-stone-200">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={v.dataUrl}
                                        alt={`Variasi ${v.letter}`}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] font-black text-[#2c1810] flex items-center gap-1">
                                        <span>Var {v.letter}</span>
                                        {isSelected && <Check className="w-3 h-3 text-[#ff6b35]" />}
                                      </div>
                                      <span className="text-[9px] text-stone-500 block">
                                        {isSelected ? 'Aktif' : 'Pilih'}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSendCardImageToMetadata(card)}
                            className="flex-1 h-7 text-xs bg-[#ff6b35] hover:bg-[#e55a2b] text-white font-bold cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            Kirim {card.variations && card.variations.length > 1 ? `Var (${card.variations[card.selectedVariationIndex || 0]?.letter || 'A'})` : ''} ke Metadata
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadCardImage(card)}
                            className="h-7 text-xs border-stone-300 hover:bg-stone-100 text-[#2c1810] cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Unduh {card.variations && card.variations.length > 1 ? `(${card.variations[card.selectedVariationIndex || 0]?.letter || 'A'})` : ''}
                          </Button>
                          {card.variations && card.variations.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadAllCardVariations(card)}
                              className="h-7 text-xs border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold cursor-pointer"
                              title="Unduh seluruh variasi gambar dari prompt ini"
                            >
                              <Download className="w-3.5 h-3.5 mr-1 text-amber-700" />
                              Unduh Semua ({card.variations.length})
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Negative Prompt (SDXL Mode) */}
                    {card.negativePrompt && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl font-mono text-[11px] text-rose-950 space-y-0.5">
                        <span className="font-bold text-rose-800 block text-[10px] uppercase">
                          Negative Prompt:
                        </span>
                        <p className="select-all">{card.negativePrompt}</p>
                      </div>
                    )}

                    {/* Rationale & Tags */}
                    {card.rationale && (
                      <div className="text-[11px] text-[#6b5344] bg-[#fffdf9] p-2 rounded-lg border border-stone-200 leading-normal">
                        <span className="font-bold text-[#2c1810]">Konsep Rationale: </span>
                        {card.rationale}
                      </div>
                    )}

                    {card.tags && card.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {card.tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200 font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Prompt Session Modal */}
      <PromptSessionModal
        open={isSessionModalOpen}
        activeSessionId={session.id}
        onClose={() => setIsSessionModalOpen(false)}
        onSelectSession={handleSelectSession}
      />
    </div>
  );
}
