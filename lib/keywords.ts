// lib/keywords.ts

/**
 * Subjective and spammy adjectives that microstock agencies strictly prohibit.
 * Ref: Adobe Stock, Shutterstock, and Vecteezy Metadata Guidelines 2026.
 */
const BANNED_SUBJECTIVE_WORDS = new Set([
  'beautiful',
  'cute',
  'amazing',
  'awesome',
  'stunning',
  'best',
  'gorgeous',
  'perfect',
  'fantastic',
  'wonderful',
  'pretty',
  'cool',
  'unbelievable',
]);

export function parseKeywords(input: string): string[] {
  return (input || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Normalizes English plurals to simple singular form to detect near-duplicate keywords
 * (e.g., 'cats' vs 'cat', 'beaches' vs 'beach').
 */
function toSingularForm(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ies') && w.length > 4) {
    return w.slice(0, -3) + 'y';
  }
  if (w.endsWith('es') && w.length > 3 && (w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes') || w.endsWith('sses'))) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) {
    return w.slice(0, -1);
  }
  return w;
}

export interface CleanKeywordsOptions {
  filterSubjective?: boolean;
  maxRootWordRepetition?: number; // Caps how many times a single root word can appear across keyword phrases
}

export function cleanKeywords(
  input: string,
  targetCount: number,
  options?: CleanKeywordsOptions
): string {
  const filterSubjective = options?.filterSubjective ?? true;
  const maxRootWordRepetition = options?.maxRootWordRepetition ?? 3;

  const out: string[] = [];
  const seenExact = new Set<string>(); // case-insensitive dedupe
  const seenSingular = new Set<string>(); // plural dedupe for single-word keywords
  const rootWordCounts = new Map<string, number>(); // track repetitions across phrases

  for (const kw of parseKeywords(input)) {
    const lower = kw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!lower) continue;

    // 1. Filter banned subjective adjectives (e.g. 'beautiful', 'cute')
    if (filterSubjective && BANNED_SUBJECTIVE_WORDS.has(lower)) {
      continue;
    }

    // 2. Exact case-insensitive match check
    if (seenExact.has(lower)) {
      continue;
    }

    // 3. Simple plural deduplication for single words (e.g., skip 'cats' if 'cat' already seen)
    const isSingleWord = !lower.includes(' ');
    const singular = isSingleWord ? toSingularForm(lower) : lower;
    if (isSingleWord && (seenSingular.has(singular) || seenExact.has(singular))) {
      continue;
    }

    // 4. Repetitive spam pattern check (prevent 'car', 'car ride', 'car drive', 'car road')
    const words = lower.split(' ');
    let isSpammy = false;
    for (const w of words) {
      const stem = toSingularForm(w);
      const count = rootWordCounts.get(stem) || 0;
      if (count >= maxRootWordRepetition) {
        isSpammy = true;
        break;
      }
    }
    if (isSpammy) {
      continue;
    }

    // Register keyword and word occurrences
    seenExact.add(lower);
    if (isSingleWord) {
      seenSingular.add(singular);
    }
    for (const w of words) {
      const stem = toSingularForm(w);
      rootWordCounts.set(stem, (rootWordCounts.get(stem) || 0) + 1);
    }

    out.push(kw);
    if (out.length >= targetCount) break; // enforce exact count by truncation
  }

  return out.join(', ');
}
