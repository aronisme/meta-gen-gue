// ftp-bridge/exiftool-wrapper.mjs
/**
 * ExifTool Engine & Fallback Wrapper for MetaGen Local FTP Bridge
 * Menyediakan penyematan metadata lossless untuk gambar (JPEG, PNG, TIFF, WebP, PSD),
 * vektor (EPS, SVG), dan video footage (MP4, MOV, M4V) menggunakan Phil Harvey's ExifTool.
 *
 * Jika ExifTool tidak tersedia di sistem, wrapper secara transparan melakukan fallback
 * ke JavaScript/Buffer native injector (embed.mjs) untuk format JPEG dan PNG.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { embedMetadataInFile as fallbackEmbedJs } from './embed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Format file yang didukung oleh ExifTool dalam ekosistem microstock MetaGen
export const EXIFTOOL_SUPPORTED_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
  '.psd',
  '.eps',
  '.svg',
  '.mp4',
  '.mov',
  '.m4v',
]);

export const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v']);

let cachedDetection = null;

/**
 * Mencari path binary ExifTool di sistem (env, folder lokal, Windows Program Files, atau PATH)
 */
export function findExifTool() {
  if (cachedDetection && cachedDetection.path) {
    if (fs.existsSync(cachedDetection.path)) {
      return cachedDetection.path;
    }
  }

  // 1. Cek environment variable EXIFTOOL_PATH
  if (process.env.EXIFTOOL_PATH && fs.existsSync(process.env.EXIFTOOL_PATH)) {
    return process.env.EXIFTOOL_PATH;
  }

  // 2. Cek lokal di folder bin/ bridge
  const localCandidates = [
    path.join(__dirname, 'bin', 'exiftool.exe'),
    path.join(__dirname, 'bin', 'exiftool'),
    path.join(__dirname, '..', 'bin', 'exiftool.exe'),
    path.join(__dirname, '..', 'bin', 'exiftool'),
  ];
  for (const cand of localCandidates) {
    if (fs.existsSync(cand)) return cand;
  }

  // 3. Cek direktori instalasi umum di Windows (Winget, Choco, Scoop, Program Files)
  if (process.platform === 'win32') {
    const winCandidates = [
      'C:\\Program Files\\exiftool\\exiftool.exe',
      'C:\\Program Files (x86)\\exiftool\\exiftool.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'exiftool', 'exiftool.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'exiftool.exe'),
      path.join(process.env.USERPROFILE || '', 'exiftool', 'exiftool.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\exiftool.exe',
      path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'exiftool.exe'),
    ];
    for (const cand of winCandidates) {
      if (cand && fs.existsSync(cand)) return cand;
    }
  }

  // 4. Cek PATH sistem via where (Windows) atau which (Unix)
  try {
    const cmd = process.platform === 'win32' ? 'where.exe exiftool' : 'which exiftool';
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' });
    const firstLine = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {}

  return null;
}

/**
 * Mendapatkan status ketersediaan ExifTool beserta versinya
 */
export function getExifToolStatus(forceRefresh = false) {
  if (cachedDetection && !forceRefresh) {
    return cachedDetection;
  }

  const binPath = findExifTool();
  if (!binPath) {
    cachedDetection = {
      available: false,
      path: null,
      version: null,
      engine: 'js-buffer',
      supportedFormats: ['.jpg', '.jpeg', '.png'],
    };
    return cachedDetection;
  }

  try {
    const verOut = execSync(`"${binPath}" -ver`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    cachedDetection = {
      available: true,
      path: binPath,
      version: verOut,
      engine: 'exiftool',
      supportedFormats: Array.from(EXIFTOOL_SUPPORTED_EXTS),
    };
  } catch (err) {
    cachedDetection = {
      available: false,
      path: binPath,
      version: null,
      engine: 'js-buffer',
      error: String(err),
      supportedFormats: ['.jpg', '.jpeg', '.png'],
    };
  }

  return cachedDetection;
}

/**
 * Menyematkan metadata ke dalam buffer file menggunakan ExifTool.
 * Menggunakan argfile untuk keamanan escaping karakter, tanda kutip, dan UTF-8 penuh.
 */
export async function embedWithExifTool(fileBuffer, filename, meta) {
  const status = getExifToolStatus();
  if (!status.available || !status.path) {
    throw new Error('ExifTool tidak tersedia di sistem');
  }

  const cleanFilename = path.basename(filename || 'asset.jpg');
  const ext = (path.extname(cleanFilename) || '').toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);

  const tempPrefix = `metagen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempFilePath = path.join(os.tmpdir(), `${tempPrefix}_${cleanFilename}`);
  const tempArgPath = path.join(os.tmpdir(), `${tempPrefix}_args.txt`);

  const title = (meta.title || '').trim();
  const description = (meta.description || '').trim();
  const rawKeywords = Array.isArray(meta.keywords)
    ? meta.keywords
    : (meta.keywords || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
  const author = (meta.author || '').trim();
  const copyright = (meta.copyright || '').trim();
  const isAi = Boolean(meta.aiGenerated);

  const argLines = [
    '-overwrite_original',
    '-charset',
    'IPTC=UTF8',
    '-charset',
    'filename=UTF8',
    '-codedcharacterset=utf8',
  ];

  if (title) {
    argLines.push(`-XMP-dc:Title=${title}`);
    argLines.push(`-XMP-photoshop:Headline=${title}`);
    argLines.push(`-IPTC:ObjectName=${title}`);
    if (isVideo) {
      argLines.push(`-QuickTime:DisplayName=${title}`);
      argLines.push(`-QuickTime:Title=${title}`);
      argLines.push(`-Keys:DisplayName=${title}`);
    }
  }

  if (description) {
    argLines.push(`-XMP-dc:Description=${description}`);
    argLines.push(`-IPTC:Caption-Abstract=${description}`);
    if (isVideo) {
      argLines.push(`-QuickTime:Description=${description}`);
      argLines.push(`-Keys:Description=${description}`);
    }
  }

  if (rawKeywords.length > 0) {
    argLines.push('-XMP-dc:Subject=');
    argLines.push('-IPTC:Keywords=');
    for (const kw of rawKeywords) {
      argLines.push(`-XMP-dc:Subject+=${kw}`);
      argLines.push(`-IPTC:Keywords+=${kw}`);
    }
    if (isVideo) {
      argLines.push('-QuickTime:Keywords=');
      argLines.push('-Keys:Keywords=');
      for (const kw of rawKeywords) {
        argLines.push(`-QuickTime:Keywords+=${kw}`);
        argLines.push(`-Keys:Keywords+=${kw}`);
      }
    }
  }

  if (isAi) {
    argLines.push(
      '-XMP-iptcExt:DigitalSourceType=http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
    );
  }

  if (author) {
    argLines.push(`-XMP-photoshop:Credit=${author}`);
    argLines.push(`-XMP-dc:creator=${author}`);
    argLines.push(`-IPTC:By-line=${author}`);
  }

  if (copyright) {
    argLines.push(`-XMP-dc:rights=${copyright}`);
    argLines.push(`-IPTC:CopyrightNotice=${copyright}`);
  }

  try {
    await fs.promises.writeFile(tempFilePath, fileBuffer);
    await fs.promises.writeFile(tempArgPath, argLines.join('\n'), 'utf-8');

    await new Promise((resolve, reject) => {
      execFile(
        status.path,
        ['-@', tempArgPath, tempFilePath],
        { timeout: 45000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(`ExifTool error: ${error.message} - ${stderr || stdout}`));
          }
          resolve({ stdout, stderr });
        }
      );
    });

    const modifiedBuffer = await fs.promises.readFile(tempFilePath);
    return {
      ok: true,
      buffer: modifiedBuffer,
      engine: 'exiftool',
      embedded: true,
    };
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
    } catch {}
    try {
      if (fs.existsSync(tempArgPath)) await fs.promises.unlink(tempArgPath);
    } catch {}
  }
}

/**
 * Universal Smart Dispatcher:
 * Otomatis memilih engine terbaik (ExifTool jika ada, fallback ke embed.mjs JS Buffer untuk JPG/PNG).
 */
export async function embedMetadataSmart(fileBuffer, filename, meta) {
  const ext = (path.extname(filename || '') || '').toLowerCase();
  const status = getExifToolStatus();

  // 1. Coba gunakan ExifTool jika tersedia dan format didukung
  if (status.available && EXIFTOOL_SUPPORTED_EXTS.has(ext)) {
    try {
      const res = await embedWithExifTool(fileBuffer, filename, meta);
      return res;
    } catch (err) {
      console.warn(`[EXIFTOOL WARN] Gagal embed dengan ExifTool (${filename}): ${err.message}. Mencoba fallback JS...`);
    }
  }

  // 2. Fallback Engine: JavaScript native Buffer (embed.mjs) untuk JPG dan PNG
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    try {
      const originalLen = fileBuffer.length;
      const modified = fallbackEmbedJs(fileBuffer, filename, meta);
      const isEmbedded = modified.length !== originalLen;
      return {
        ok: true,
        buffer: modified,
        engine: 'js-buffer',
        embedded: isEmbedded,
      };
    } catch (err) {
      console.warn(`[EMBED WARN] Fallback JS embed gagal: ${err.message}`);
      return {
        ok: false,
        buffer: fileBuffer,
        engine: 'failed',
        embedded: false,
        error: String(err),
      };
    }
  }

  // 3. Format lain (seperti Video / Vektor) jika ExifTool belum terpasang
  return {
    ok: true,
    buffer: fileBuffer,
    engine: 'unsupported-without-exiftool',
    embedded: false,
    warning: `Penyematan metadata ke ${ext.toUpperCase() || 'format ini'} membutuhkan ExifTool. File tetap diproses.`,
  };
}
