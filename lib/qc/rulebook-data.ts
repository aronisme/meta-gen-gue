import rulebookJson from './data/adobe_stock_rulebook.json';
import watchlistJson from './data/known_restrictions_watchlist.json';
import taxonomyJson from './data/visual_qc_taxonomy.json';

export interface RulebookRule {
  id: string;
  domain: string;
  rule_type: string;
  severity: string;
  automation?: string;
  condition?: Record<string, unknown>;
  statement: string;
  agent_action?: string;
  decision?: string;
  human_confirmation_required?: boolean;
  source_ids?: string[];
}

export interface WatchlistItem {
  id: string;
  name: string;
  match_type: string;
  scope: string;
  match_hints: string[];
  action: string;
  source_id: string;
}

export interface VisualQcCheck {
  id: string;
  category: string;
  applies_to: string[];
  look_for: string[];
  recommended_method: string[];
  evidence_required: string;
  decision: string;
  official_basis: string;
  source_ids: string[];
  caveats?: string[];
}

export const ADOBE_STOCK_RULES: RulebookRule[] = (rulebookJson as { rules: RulebookRule[] }).rules || [];
export const KNOWN_RESTRICTIONS: WatchlistItem[] = (watchlistJson as { items: WatchlistItem[] }).items || [];
export const VISUAL_QC_CHECKS: VisualQcCheck[] = (taxonomyJson as { checks: VisualQcCheck[] }).checks || [];

export function findRuleById(id: string): RulebookRule | undefined {
  return ADOBE_STOCK_RULES.find((r) => r.id.toLowerCase() === id.toLowerCase());
}

export function searchWatchlist(term: string): WatchlistItem[] {
  if (!term || term.trim().length < 2) return [];
  const normalized = term.toLowerCase().trim();

  return KNOWN_RESTRICTIONS.filter((item) => {
    if (item.name.toLowerCase().includes(normalized)) return true;
    return item.match_hints.some((hint) => hint.toLowerCase().includes(normalized));
  });
}

const GENERIC_WATCHLIST_WORDS = new Set([
  'bottle',
  'design',
  'logo',
  'statuette',
  'trailer',
  'check',
  'pattern',
  'distinctive',
  'three-stripe',
  'product',
  'style',
]);

export function scanTextForWatchlistMatches(text: string): { item: WatchlistItem; matchedTerm: string }[] {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const matches: { item: WatchlistItem; matchedTerm: string }[] = [];

  for (const item of KNOWN_RESTRICTIONS) {
    // 1. Direct full name match
    if (lowerText.includes(item.name.toLowerCase())) {
      matches.push({ item, matchedTerm: item.name });
      continue;
    }

    // 2. Slash-separated brand tokens (misal: "Nike/Jordan/Swoosh/Just Do It")
    const slashParts = item.name.split('/').map((s) => s.trim().toLowerCase());
    let matchedSlash = false;
    for (const part of slashParts) {
      if (part.length >= 3 && lowerText.includes(part)) {
        matches.push({ item, matchedTerm: part });
        matchedSlash = true;
        break;
      }
    }
    if (matchedSlash) continue;

    // 3. Significant brand words (misal: "Adidas", "Absolut", "Burberry", "Oscar")
    const words = item.name
      .toLowerCase()
      .split(/[\s/,\-]+/)
      .filter((w) => w.length >= 4 && !GENERIC_WATCHLIST_WORDS.has(w));

    let matchedWord = false;
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(lowerText)) {
        matches.push({ item, matchedTerm: word });
        matchedWord = true;
        break;
      }
    }
    if (matchedWord) continue;

    // 4. Hints check
    for (const hint of item.match_hints) {
      if (hint.length > 5 && lowerText.includes(hint.toLowerCase())) {
        matches.push({ item, matchedTerm: hint });
        break;
      }
    }
  }

  return matches;
}
