// lib/csv.ts
import { toast } from 'sonner';
import type { ItemMetaBox } from './types';

export type Agency = 'adobe' | 'shutterstock' | 'vecteezy' | 'freepik' | 'dreamstime';

export interface CSVExportOptions {
  vecteezyFtpMode?: boolean; // If true, strips file extensions for Vecteezy FTP upload
}

function csvEscape(val: string): string {
  const s = (val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function toDelimited(headers: string[], rows: Record<string, string>[], delimiter = ','): string {
  const headerLine = headers.join(delimiter);
  const lines = rows.map((r) => headers.map((h) => csvEscape(r[h] ?? '')).join(delimiter));
  // CRLF as most marketplaces expect
  return [headerLine, ...lines].join('\r\n');
}

/**
 * Sanitizes title for Adobe Stock:
 * - Adobe CSV spec strictly forbids commas in title.
 * - Max safe length is 160 characters (Adobe Stock portal hard limit is 200 characters).
 */
function sanitizeAdobeTitle(title: string): string {
  const noComma = (title ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (noComma.length > 160) {
    return noComma.slice(0, 160).trim();
  }
  return noComma;
}

/**
 * Sanitizes category for Adobe Stock:
 * - Adobe CSV requires a numeric ID from 1 to 21.
 * - If category is not a valid number 1-21, return empty string so Adobe auto-detects or doesn't reject.
 */
function sanitizeAdobeCategory(cat: string | undefined): string {
  if (!cat) return '';
  const trimmed = cat.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 21) {
    return String(num);
  }
  return '';
}

/**
 * Generates agency-compliant CSV string for the given agency and items.
 */
export function generateAgencyCSV(
  agency: Agency,
  items: ItemMetaBox[],
  options?: CSVExportOptions
): string {
  let headers: string[];
  let rows: Record<string, string>[];
  let delimiter = ',';

  // Filter out items without metadata or with errors so we don't produce invalid empty rows
  // which causes marketplace portals (like Adobe Stock) to reject the entire CSV upload.
  const validItems = items.filter(
    (it) => !it.error && it.meta && Boolean(it.meta.title?.trim() || it.meta.keywords?.trim())
  );

  switch (agency) {
    // Official Adobe header: Filename,Title,Keywords,Category,Releases
    case 'adobe':
      headers = ['Filename', 'Title', 'Keywords', 'Category', 'Releases'];
      rows = validItems.map((it) => ({
        Filename: it.filename,
        Title: sanitizeAdobeTitle(it.meta?.title ?? ''),
        Keywords: it.meta?.keywords ?? '',
        Category: sanitizeAdobeCategory(it.meta?.category),
        Releases: (it.meta?.releases ?? '').slice(0, 30),
      }));
      break;

    // Official Shutterstock header (columns A to G in order):
    // Filename, Description, Keywords, Categories, Illustration, Mature Content, Editorial
    case 'shutterstock':
      headers = [
        'Filename',
        'Description',
        'Keywords',
        'Categories',
        'Illustration',
        'Mature Content',
        'Editorial',
      ];
      rows = validItems.map((it) => {
        const isIllustration =
          it.meta?.illustration ?? (it.fileType === 'illustration' || it.fileType === 'vector');
        const categories = it.meta?.shutterstockCategory || it.meta?.category || '';
        return {
          Filename: it.filename,
          Description: it.meta?.description || it.meta?.title || '',
          Keywords: it.meta?.keywords ?? '',
          Categories: categories,
          Illustration: isIllustration ? 'Yes' : 'No',
          'Mature Content': it.meta?.matureContent ? 'Yes' : 'No',
          Editorial: it.meta?.editorial ? 'Yes' : 'No',
        };
      });
      break;

    // Official Vecteezy header: Filename,Title,Description,Keywords,License (+ Id if present)
    case 'vecteezy': {
      const hasId = validItems.some((it) => Boolean(it.meta?.vecteezyId));
      headers = hasId
        ? ['Id', 'Filename', 'Title', 'Description', 'Keywords', 'License']
        : ['Filename', 'Title', 'Description', 'Keywords', 'License'];

      rows = validItems.map((it) => {
        const fname = options?.vecteezyFtpMode
          ? it.filename.replace(/\.[^/.]+$/, '')
          : it.filename;
        const row: Record<string, string> = {
          Filename: fname,
          Title: it.meta?.title ?? '',
          Description: it.meta?.description ?? '',
          Keywords: (it.meta?.keywords ?? '').replace(/,\s+/g, ','),
          License: it.meta?.license ?? 'pro',
        };
        if (hasId) {
          row['Id'] = it.meta?.vecteezyId ?? '';
        }
        return row;
      });
      break;
    }

    // Official Freepik / Magnific Contributor header:
    // Delimiter MUST be semicolon ';', keywords inside are comma ','
    // Header: File name;Title;Keywords;Prompt;Model
    case 'freepik': {
      delimiter = ';';
      headers = ['File name', 'Title', 'Keywords', 'Prompt', 'Model'];
      rows = validItems.map((it) => {
        let kw = (it.meta?.keywords ?? '').replace(/,\s+/g, ',');
        // Auto-tag AI content if flagged or AI prompt is present
        if (it.meta?.aiGenerated && !kw.includes('_ai_generated')) {
          kw = kw ? `${kw},_ai_generated` : '_ai_generated';
        }
        return {
          'File name': it.filename,
          Title: it.meta?.title ?? '',
          Keywords: kw,
          Prompt: it.meta?.aiPrompt ?? '',
          Model: it.meta?.aiModel ?? '',
        };
      });
      break;
    }

    // Dreamstime header (Official Dreamstime template)
    case 'dreamstime':
      headers = ['Filename', 'Title', 'Description', 'Keywords'];
      rows = validItems.map((it) => ({
        Filename: it.filename,
        Title: it.meta?.title ?? '',
        Description: it.meta?.description ?? '',
        Keywords: (it.meta?.keywords ?? '').replace(/,\s+/g, ','),
      }));
      break;
  }

  return toDelimited(headers, rows, delimiter);
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadAgencyCSV(
  agency: Agency,
  items: ItemMetaBox[],
  options?: CSVExportOptions
) {
  const validItems = items.filter(
    (it) => !it.error && it.meta && Boolean(it.meta.title?.trim() || it.meta.keywords?.trim())
  );
  const skippedCount = items.length - validItems.length;

  if (validItems.length === 0) {
    if (typeof window !== 'undefined') {
      toast.error('Tidak ada item dengan metadata lengkap untuk diekspor ke CSV.');
    }
    return;
  }

  if (skippedCount > 0 && typeof window !== 'undefined') {
    toast.warning(
      `${skippedCount} file tanpa metadata dilewati dari CSV agar upload ke agensi tidak ditolak.`
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const csv = generateAgencyCSV(agency, validItems, options);
  download(`${agency}-metadata-${stamp}.csv`, csv);
}
