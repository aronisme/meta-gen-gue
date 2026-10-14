/**
 * Sistem Anti-Duplikat Multitahap Meta-Gen.
 * Mencegah file kembar/duplikat terunggah dalam satu sesi generate dan antrean FTP.
 */

export interface ExistingItemRef {
  name: string;
  size?: number;
  stem?: string;
  fingerprint?: string;
  visualHash?: string | null;
}

export interface DuplicateRejection {
  file: File;
  duplicateOf: string;
  reason: 'exact_name' | 'exact_hash' | 'visual_hash' | 'stem_and_size';
  description: string;
}

export interface DedupeFilterResult {
  acceptedFiles: File[];
  rejectedDuplicates: DuplicateRejection[];
}

export interface DuplicateMatch {
  isDuplicate: boolean;
  duplicateOf: string;
  reason: 'exact_name' | 'exact_hash' | 'visual_hash' | 'stem_and_size';
  description: string;
}

/**
 * Menormalkan nama file untuk mengekstrak "stem" (akar judul).
 * Menghilangkan ekstensi, penanda salinan (Copy, (1)), dan pola timestamp
 * hasil render/export AI (misal: _20261011224436, _2026-10-11-224436, dll).
 */
export function normalizeFileStem(filename: string): string {
  if (!filename) return '';

  // 1. Ambil nama tanpa ekstensi
  const lastDot = filename.lastIndexOf('.');
  let stem = lastDot !== -1 ? filename.slice(0, lastDot) : filename;

  // 2. Normalisasi karakter & huruf kecil
  stem = stem.trim().toLowerCase();

  // 3. Hapus pola penanda salinan sistem operasi:
  // - " - copy", " copy", " - copy (1)"
  stem = stem.replace(/[\s_-]+copy(\s*\(\d+\))?$/i, '');
  // - Angka dalam kurung: "(1)", " (2)"
  stem = stem.replace(/[\s_-]*\(\d+\)$/, '');
  // - Timestamp numerik panjang (YYYYMMDDHHMMSS atau epoch ms/sec, 8 hingga 14 digit):
  // Contoh: _20261011224436 atau -1790695578328
  stem = stem.replace(/[_-]\d{8,14}$/, '');
  // - Tanggal dengan pemisah: _2026-10-11-224436, _2026_10_11_22_44_36, _2026-10-11
  stem = stem.replace(/[_-]\d{4}[-_]\d{2}[-_]\d{2}([-_]\d{2,6})?$/, '');
  // - Suffix nomor serial / versi sederhana di akhir: _1, -01, _v2
  stem = stem.replace(/[_-]v?\d{1,3}$/, '');

  return stem.trim();
}

/**
 * Membaca Blob / File menjadi ArrayBuffer dengan kompatibilitas browser & JSDOM/Node.
 */
export async function readBlobAsArrayBuffer(blob: Blob | File): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Menghasilkan hash SHA-256 unik dari konten file.
 * Menggunakan chunk sampling cepat untuk file besar (>16MB) agar browser
 * tidak kehabisan RAM atau freeze.
 */
export async function computeFileFingerprint(file: File): Promise<string> {
  const size = file.size;

  // Jika file <= 16MB (sebagian besar foto/vektor), hash seluruh konten
  if (size <= 16 * 1024 * 1024) {
    const buffer = await readBlobAsArrayBuffer(file);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  }

  // Untuk video/file besar (>16MB), sampling 4MB awal + tengah + akhir
  const chunkSize = 4 * 1024 * 1024;
  const midPoint = Math.floor(size / 2);

  const headSlice = file.slice(0, chunkSize);
  const midSlice = file.slice(midPoint, midPoint + chunkSize);
  const tailSlice = file.slice(size - chunkSize, size);

  const [headBuf, midBuf, tailBuf] = await Promise.all([
    readBlobAsArrayBuffer(headSlice),
    readBlobAsArrayBuffer(midSlice),
    readBlobAsArrayBuffer(tailSlice),
  ]);

  const sizeBuf = new TextEncoder().encode(`size:${size}`);
  const combined = new Uint8Array(
    headBuf.byteLength + midBuf.byteLength + tailBuf.byteLength + sizeBuf.byteLength
  );
  let offset = 0;
  combined.set(new Uint8Array(headBuf), offset);
  offset += headBuf.byteLength;
  combined.set(new Uint8Array(midBuf), offset);
  offset += midBuf.byteLength;
  combined.set(new Uint8Array(tailBuf), offset);
  offset += tailBuf.byteLength;
  combined.set(sizeBuf, offset);

  const digest = await crypto.subtle.digest('SHA-256', combined);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Menghitung perbedaan Hamming distance antara dua string heksadesimal.
 */
export function hammingDistanceHex(hex1: string, hex2: string): number {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hex1.length; i++) {
    const v1 = parseInt(hex1[i], 16);
    const v2 = parseInt(hex2[i], 16);
    let xor = v1 ^ v2;
    while (xor > 0) {
      if (xor & 1) dist++;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * Menghitung hash visual perseptual sederhana (16x16 grayscale aHash) untuk gambar.
 * Berguna mendeteksi foto identik yang diexport ulang dengan sedikit perbedaan byte EXIF.
 * Berjalan aman di browser via Canvas; mengembalikan null jika di luar browser atau bukan gambar.
 */
export async function computeVisualHash(file: File): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  // Di lingkungan JSDOM / Node headless tanpa canvas engine nyata
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
    return null;
  }
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
    return null;
  }

  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(null);
      }, 500);

      img.onload = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        try {
          const canvas = document.createElement('canvas');
          const size = 16;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const imgData = ctx.getImageData(0, 0, size, size);
          const pixels = imgData.data;

          const grays: number[] = [];
          let sum = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
            grays.push(gray);
            sum += gray;
          }
          const avg = sum / grays.length;

          let hex = '';
          for (let i = 0; i < grays.length; i += 4) {
            let nibble = 0;
            for (let b = 0; b < 4; b++) {
              if (grays[i + b] >= avg) {
                nibble |= 1 << (3 - b);
              }
            }
            hex += nibble.toString(16);
          }
          resolve(hex);
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Memeriksa apakah satu file kandidat merupakan duplikat dari salah satu file di daftar pembanding.
 */
export function matchDuplicateFile(
  candidate: {
    name: string;
    size: number;
    stem: string;
    fingerprint?: string;
    visualHash?: string | null;
  },
  existingList: ExistingItemRef[]
): DuplicateMatch | null {
  const candLowerName = candidate.name.trim().toLowerCase();

  for (const ex of existingList) {
    const exLowerName = ex.name.trim().toLowerCase();

    // 1. Cek kesamaan nama persis
    if (candLowerName === exLowerName) {
      return {
        isDuplicate: true,
        duplicateOf: ex.name,
        reason: 'exact_name',
        description: `Nama file "${candidate.name}" persis sama dengan "${ex.name}" yang sudah ada.`,
      };
    }

    // 2. Cek kesamaan hash SHA-256 (isi binary file identik 100%)
    if (candidate.fingerprint && ex.fingerprint && candidate.fingerprint === ex.fingerprint) {
      return {
        isDuplicate: true,
        duplicateOf: ex.name,
        reason: 'exact_hash',
        description: `Konten file "${candidate.name}" identik (SHA-256) dengan "${ex.name}".`,
      };
    }

    // 3. Cek kesamaan visual hash perseptual (gambar kembar / render ulang)
    if (
      candidate.visualHash &&
      ex.visualHash &&
      hammingDistanceHex(candidate.visualHash, ex.visualHash) <= 2
    ) {
      return {
        isDuplicate: true,
        duplicateOf: ex.name,
        reason: 'visual_hash',
        description: `Visual gambar "${candidate.name}" terdeteksi kembar identik dengan "${ex.name}".`,
      };
    }

    // 4. Cek kesamaan stem dan ukuran file identik (atau selisih EXIF <= 2KB)
    // Sangat efektif untuk: Name_2K_20261011224436.jpg vs Name_2K_20261011213958.jpg
    const exStem = ex.stem || normalizeFileStem(ex.name);
    if (candidate.stem && exStem && candidate.stem === exStem && ex.size !== undefined) {
      const sizeDelta = Math.abs(candidate.size - ex.size);
      if (sizeDelta <= 2048) {
        return {
          isDuplicate: true,
          duplicateOf: ex.name,
          reason: 'stem_and_size',
          description: `File "${candidate.name}" memiliki nama dasar dan ukuran (${(candidate.size / (1024 * 1024)).toFixed(1)} MB) yang identik dengan "${ex.name}".`,
        };
      }
    }
  }

  return null;
}

/**
 * Menyaring daftar file yang baru diunggah / dipilih:
 * 1. Mencegah duplikasi di antara batch file baru itu sendiri.
 * 2. Mencegah duplikasi terhadap file yang sudah antre di Studio (`existingFiles`).
 * 3. Mencegah duplikasi terhadap item yang sudah selesai digenerate pada sesi aktif (`existingItemFilenames`).
 */
export async function filterDuplicateFiles(
  incomingFiles: File[],
  options?: {
    existingFiles?: File[];
    existingItemFilenames?: string[];
  }
): Promise<DedupeFilterResult> {
  const existingRefs: ExistingItemRef[] = [];

  // Masukkan item sesi aktif yang sudah digenerate
  if (options?.existingItemFilenames) {
    for (const name of options.existingItemFilenames) {
      existingRefs.push({
        name,
        stem: normalizeFileStem(name),
      });
    }
  }

  // Masukkan file yang sudah ada di antrean unggah Studio
  if (options?.existingFiles) {
    for (const f of options.existingFiles) {
      existingRefs.push({
        name: f.name,
        size: f.size,
        stem: normalizeFileStem(f.name),
      });
    }
  }

  const acceptedFiles: File[] = [];
  const rejectedDuplicates: DuplicateRejection[] = [];

  // Kumpulan referensi yang terus bertambah selama penyaringan batch baru
  const activeTracker: ExistingItemRef[] = [...existingRefs];

  for (const file of incomingFiles) {
    const stem = normalizeFileStem(file.name);
    let fingerprint: string | undefined;
    let visualHash: string | null = null;

    // Cek awal cepat (nama persis atau stem + size jika ada)
    const quickMatch = matchDuplicateFile(
      {
        name: file.name,
        size: file.size,
        stem,
      },
      activeTracker
    );

    if (quickMatch) {
      rejectedDuplicates.push({
        file,
        duplicateOf: quickMatch.duplicateOf,
        reason: quickMatch.reason,
        description: quickMatch.description,
      });
      continue;
    }

    // Jika belum match secara cepat, hitung fingerprint SHA-256
    try {
      fingerprint = await computeFileFingerprint(file);
    } catch {
      // Abaikan error hash
    }

    // Cek gambar visual hash jika file berupa gambar
    if (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name)) {
      try {
        visualHash = await computeVisualHash(file);
      } catch {
        // Abaikan error visual hash
      }
    }

    const deepMatch = matchDuplicateFile(
      {
        name: file.name,
        size: file.size,
        stem,
        fingerprint,
        visualHash,
      },
      activeTracker
    );

    if (deepMatch) {
      rejectedDuplicates.push({
        file,
        duplicateOf: deepMatch.duplicateOf,
        reason: deepMatch.reason,
        description: deepMatch.description,
      });
      continue;
    }

    // File lolos verifikasi: tambahkan ke accepted dan tracker
    acceptedFiles.push(file);
    activeTracker.push({
      name: file.name,
      size: file.size,
      stem,
      fingerprint,
      visualHash,
    });
  }

  return { acceptedFiles, rejectedDuplicates };
}
