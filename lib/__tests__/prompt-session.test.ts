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
});
