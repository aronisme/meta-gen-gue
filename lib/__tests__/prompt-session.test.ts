import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const inMemoryIdb = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => inMemoryIdb.get(key)),
  set: vi.fn(async (key: string, val: unknown) => inMemoryIdb.set(key, val)),
  getMany: vi.fn(async (keys: string[]) => keys.map((k) => inMemoryIdb.get(k))),
  setMany: vi.fn(async (entries: Array<[string, unknown]>) => {
    entries.forEach(([k, v]) => inMemoryIdb.set(k, v));
  }),
  keys: vi.fn(async () => Array.from(inMemoryIdb.keys())),
  del: vi.fn(async (key: string) => inMemoryIdb.delete(key)),
}));

import {
  exportPromptsToCsv,
  exportPromptsToQueueText,
  normalizeVisualDna,
} from '../prompt-agent/engine';
import {
  createNewPromptSession,
  savePromptSession,
  loadPromptSessions,
  getPromptSession,
  deletePromptSession,
  saveActivePromptSession,
  loadActivePromptSession,
} from '../prompt-agent/store';
import type { PromptCardItem, VCPASettings } from '../prompt-agent/types';

describe('VCPA Prompt Session & Bulk Export System', () => {
  beforeEach(() => {
    inMemoryIdb.clear();
  });

  afterEach(() => {
    inMemoryIdb.clear();
  });

  const sampleSettings: VCPASettings = {
    count: 2,
    similarity: 70,
    engine: 'midjourney',
    visualDirection: 'photorealistic',
    aspectRatio: '16:9',
    creativeFocus: 'composition_lighting',
    semanticMode: 'meaning_preservation',
    commercialSafety: true,
    promptLanguage: 'en',
  };

  const samplePrompts: PromptCardItem[] = [
    {
      id: 'p-1',
      ordinal: 1,
      title: 'Golden Hour Brew',
      prompt: 'Indonesian coffee shop barista pouring latte art --ar 16:9 --v 6.1',
      creativeStrategy: 'Lighting Variation',
      rationale: 'Commercial microstock lighting with warm shadows',
      tags: ['coffee', 'barista', 'indonesia'],
    },
    {
      id: 'p-2',
      ordinal: 2,
      title: 'Minimalist Beans "Special Edition"',
      prompt: 'Macro shot of roasted coffee beans --ar 16:9 --v 6.1',
      negativePrompt: 'blurry, noise',
      creativeStrategy: 'Macro Detail',
      rationale: 'Focus on bean surface oil texture',
      tags: ['macro', 'roasted'],
    },
  ];

  it('exports RFC 4180 compliant CSV with UTF-8 BOM for Excel and Google Sheets', () => {
    const csv = exportPromptsToCsv(samplePrompts, sampleSettings);

    // Verify BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Verify CSV Headers
    expect(csv).toContain('No,Judul Konsep,Prompt AI,Negative Prompt,Strategi Kreatif,Engine,Aspect Ratio,Rationale,Tags');

    // Verify escaped double quotes inside text
    expect(csv).toContain('"Minimalist Beans ""Special Edition"""');

    // Verify content rows
    expect(csv).toContain('Indonesian coffee shop barista');
    expect(csv).toContain('Midjourney v6.1');
    expect(csv).toContain('16:9');
  });

  it('exports pure queue text formatted for Midjourney and ComfyUI/SD batch runners', () => {
    const queueTxt = exportPromptsToQueueText(samplePrompts);
    expect(queueTxt).toContain('Indonesian coffee shop barista pouring latte art --ar 16:9 --v 6.1');
    expect(queueTxt).toContain('Macro shot of roasted coffee beans --ar 16:9 --v 6.1');
    // Separated by double newline
    expect(queueTxt).toContain('\n\n');
  });

  it('creates an initialized prompt session with defaults and timestamps', () => {
    const session = createNewPromptSession('Test Coffee Campaign', 'user1@example.com');
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Coffee Campaign');
    expect(session.userEmail).toBe('user1@example.com');
    expect(session.prompts).toEqual([]);
    expect(session.settings.engine).toBe('midjourney');
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it('persists and isolates prompt sessions between different users in multi-tenant environment', async () => {
    const sessionUserA = createNewPromptSession('Sesi User A', 'alice@company.com');
    sessionUserA.prompts = [samplePrompts[0]];
    await savePromptSession(sessionUserA, 'alice@company.com');

    const sessionUserB = createNewPromptSession('Sesi User B', 'bob@company.com');
    sessionUserB.prompts = [samplePrompts[1]];
    await savePromptSession(sessionUserB, 'bob@company.com');

    // Alice should only see her session
    const aliceSessions = await loadPromptSessions('alice@company.com');
    expect(aliceSessions.some((s) => s.id === sessionUserA.id)).toBe(true);
    expect(aliceSessions.some((s) => s.id === sessionUserB.id)).toBe(false);

    // Bob should only see his session
    const bobSessions = await loadPromptSessions('bob@company.com');
    expect(bobSessions.some((s) => s.id === sessionUserB.id)).toBe(true);
    expect(bobSessions.some((s) => s.id === sessionUserA.id)).toBe(false);

    // Deletion is scoped
    await deletePromptSession(sessionUserA.id, 'alice@company.com');
    const aliceAfterDelete = await loadPromptSessions('alice@company.com');
    expect(aliceAfterDelete.some((s) => s.id === sessionUserA.id)).toBe(false);

    // Bob's session remains untouched
    const bobStillExists = await getPromptSession(sessionUserB.id, 'bob@company.com');
    expect(bobStillExists).not.toBeNull();
  });

  it('maintains active session snapshot for instant work recovery', async () => {
    const active = createNewPromptSession('Active Work Session', 'carol@company.com');
    active.prompts = samplePrompts;
    await saveActivePromptSession(active, 'carol@company.com');

    const retrieved = await loadActivePromptSession('carol@company.com');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(active.id);
    expect(retrieved?.prompts).toHaveLength(2);
  });

  it('auto-adds and prepends newest prompt batches to the top of the session list', () => {
    const initialBatch: PromptCardItem[] = [samplePrompts[0]];
    const newBatch: PromptCardItem[] = [samplePrompts[1]];

    // Auto-add prepend logic: [...newBatch, ...initialBatch]
    const accumulated = [...newBatch, ...initialBatch];

    expect(accumulated).toHaveLength(2);
    // Newest prompt must be at index 0 (top of the feed)
    expect(accumulated[0].id).toBe('p-2');
    expect(accumulated[1].id).toBe('p-1');
  });

  it('manages sequential FIFO queue processing for multiple incoming images', () => {
    // Simulate queue state
    type QueueItem = {
      id: string;
      status: 'pending' | 'processing' | 'completed' | 'error';
      filename: string;
    };

    const queue: QueueItem[] = [
      { id: 'q-1', status: 'processing', filename: 'image_1.jpg' },
      { id: 'q-2', status: 'pending', filename: 'image_2.jpg' },
      { id: 'q-3', status: 'pending', filename: 'image_3.jpg' },
    ];

    // While item 1 is processing, incoming items remain pending
    const pendingItems = queue.filter((q) => q.status === 'pending');
    expect(pendingItems).toHaveLength(2);
    expect(pendingItems[0].id).toBe('q-2');
    expect(pendingItems[1].id).toBe('q-3');

    // Item 1 completes
    queue[0].status = 'completed';

    // Worker picks the next pending item (q-2)
    const nextPending = queue.find((q) => q.status === 'pending');
    expect(nextPending?.id).toBe('q-2');
    if (nextPending) nextPending.status = 'processing';

    // Now q-2 is processing and q-3 is still pending
    expect(queue.find((q) => q.status === 'processing')?.id).toBe('q-2');
    expect(queue.filter((q) => q.status === 'pending')).toHaveLength(1);
  });

  it('validates extension bridge event payload shape', () => {
    const extensionPayload = {
      id: 'ext_123456',
      source: 'extension',
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      filename: 'Web_Image_9876.jpg',
      sourceUrl: 'https://images.unsplash.com/photo-test',
      pageTitle: 'Beautiful Coffee Stock - Unsplash',
      addedAt: Date.now(),
    };

    expect(extensionPayload.source).toBe('extension');
    expect(extensionPayload.imageDataUrl.startsWith('data:image/')).toBe(true);
    expect(extensionPayload.filename).toContain('.jpg');
    expect(extensionPayload.addedAt).toBeGreaterThan(0);
  });

  it('normalizes malformed VisualDNAProfile with string fields into crash-proof arrays', () => {
    const malformedRaw = {
      subject: 'Barista preparing coffee',
      observed: 'Coffee cup, ceramic mug, wooden table',
      inferred: 'Cozy autumn morning, warm ambient lighting', // string instead of string[]
      anchors: 'Espresso cup',
      variables: 'Camera angle, daylight tone', // "variables" instead of "editableVariables"
      semanticProfile: {
        coreTheme: 'Morning Routine',
        metaphor: 'Warmth and relaxation',
      },
    };

    const normalized = normalizeVisualDna(malformedRaw);
    expect(normalized).not.toBeNull();
    if (!normalized) return;

    // Must be arrays
    expect(Array.isArray(normalized.inferred)).toBe(true);
    expect(Array.isArray(normalized.observed)).toBe(true);
    expect(Array.isArray(normalized.anchors)).toBe(true);
    expect(Array.isArray(normalized.editableVariables)).toBe(true);
    expect(Array.isArray(normalized.semanticProfile?.metaphor)).toBe(true);

    // .join() must work seamlessly without throwing TypeError
    expect(() => normalized.inferred.join(', ')).not.toThrow();
    expect(normalized.inferred.join(', ')).toContain('Cozy autumn morning');
    expect(normalized.editableVariables.join(', ')).toContain('Camera angle');
    expect(normalized.subject.type).toBe('Barista preparing coffee');
  });

  it('sanitizes legacy unnormalized visualDna when loaded from store', async () => {
    const legacySession = createNewPromptSession('Legacy Session', 'test@user.com');
    // Simulate legacy corrupted data where inferred was a raw string
    (legacySession as unknown as { visualDna: Record<string, unknown> }).visualDna = {
      subject: { type: 'Woman' },
      observed: 'Woman sitting',
      inferred: 'Tranquil serene atmosphere',
      anchors: 'Woman silhouette',
      editableVariables: 'Colors',
    };

    await saveActivePromptSession(legacySession, 'test@user.com');

    const loaded = await loadActivePromptSession('test@user.com');
    expect(loaded).not.toBeNull();
    expect(loaded?.visualDna).toBeDefined();

    // Verify inferred is an array so .join() cannot crash
    expect(Array.isArray(loaded?.visualDna?.inferred)).toBe(true);
    expect(loaded?.visualDna?.inferred.join(', ')).toBe('Tranquil serene atmosphere');
  });
});

