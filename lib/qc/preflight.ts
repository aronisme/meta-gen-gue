import type { TechnicalMetrics } from './types';

export const ADOBE_HARD_LIMITS = {
  MIN_MEGAPIXELS: 4.0,
  MAX_MEGAPIXELS: 100.0,
  MAX_FILE_SIZE_BYTES: 45 * 1024 * 1024, // 45 MB
};

/**
 * Deteksi format gambar asli berdasarkan magic bytes atau tipe file
 */
export function detectImageFormat(file: File): 'JPEG' | 'PNG' | 'WEBP' | 'OTHER' {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'JPEG';
  }
  if (type === 'image/png' || name.endsWith('.png')) {
    return 'PNG';
  }
  if (type === 'image/webp' || name.endsWith('.webp')) {
    return 'WEBP';
  }
  return 'OTHER';
}

/**
 * Validasi Preflight Teknis Deterministik secara instan di browser/client
 */
export async function runDeterministicPreflight(
  file: File,
  targetAssetType: 'photo_jpeg' | 'transparent_png' | 'auto' = 'auto'
): Promise<TechnicalMetrics> {
  const format = detectImageFormat(file);
  const fileSize = file.size;
  const failReasons: string[] = [];
  const checksRun: string[] = ['file_size', 'format', 'dimensions', 'megapixels'];

  // Baca dimensi gambar via Image element di browser
  const { width, height, hasAlpha, alphaBoundingBox } = await inspectImageData(file, format);
  const megapixels = Number(((width * height) / 1_000_000).toFixed(2));

  // 1. Evaluasi Megapixels
  if (megapixels < ADOBE_HARD_LIMITS.MIN_MEGAPIXELS) {
    failReasons.push(
      `Resolusi gambar ${megapixels} MP di bawah batas minimum resmi Adobe Stock (Minimal 4.0 MP).`
    );
  } else if (megapixels > ADOBE_HARD_LIMITS.MAX_MEGAPIXELS) {
    failReasons.push(
      `Resolusi gambar ${megapixels} MP melebihi batas maksimum resmi Adobe Stock (Maksimal 100.0 MP).`
    );
  }

  // 2. Evaluasi Ukuran File
  if (fileSize > ADOBE_HARD_LIMITS.MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);
    failReasons.push(
      `Ukuran file ${sizeMb} MB melebihi batas maksimum unggahan Adobe Stock (Maksimal 45 MB).`
    );
  }

  // 3. Evaluasi Khusus Format & Transparansi PNG
  const effectiveType = targetAssetType === 'auto'
    ? (format === 'PNG' ? 'transparent_png' : 'photo_jpeg')
    : targetAssetType;

  if (effectiveType === 'transparent_png') {
    checksRun.push('png_alpha_transparency');
    if (format !== 'PNG') {
      failReasons.push(`Aset ditargetkan sebagai PNG Transparan, namun file bertipe ${format}.`);
    } else if (hasAlpha === false) {
      failReasons.push(
        'Aset PNG transparan tidak memiliki channel transparansi (gambar 100% opak/solid). Adobe mewajibkan true transparent background.'
      );
    }
  } else if (effectiveType === 'photo_jpeg') {
    if (format !== 'JPEG') {
      // JPEG requirement warning (Adobe accepts PNG as illustration/isolated, but photo submissions must be JPEG)
      if (format === 'WEBP') {
        failReasons.push('Adobe Stock tidak menerima format WEBP secara langsung untuk foto/ilustrasi.');
      }
    }
  }

  const passesHardTech = failReasons.length === 0;

  return {
    format,
    width_px: width,
    height_px: height,
    megapixels,
    file_size_bytes: fileSize,
    icc_profile: 'sRGB', // Default web sRGB standard
    has_alpha: hasAlpha,
    alpha_bounding_box: alphaBoundingBox,
    checks_run: checksRun,
    passes_hard_tech: passesHardTech,
    fail_reasons: failReasons,
  };
}

/**
 * Ekstraksi dimensi dan pengecekan alpha pixel sample menggunakan HTMLCanvasElement
 */
function inspectImageData(
  file: File,
  format: 'JPEG' | 'PNG' | 'WEBP' | 'OTHER'
): Promise<{
  width: number;
  height: number;
  hasAlpha: boolean | null;
  alphaBoundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      // Fallback jika dipanggil di server tanpa canvas
      resolve({ width: 0, height: 0, hasAlpha: null, alphaBoundingBox: null });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      let hasAlpha: boolean | null = null;
      let alphaBoundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

      if (format === 'PNG') {
        try {
          // Sampel transparansi menggunakan canvas kecil resolusi max 400px untuk performa super cepat
          const sampleScale = Math.min(1, 400 / Math.max(width, height));
          const sampleW = Math.max(1, Math.round(width * sampleScale));
          const sampleH = Math.max(1, Math.round(height * sampleScale));

          const canvas = document.createElement('canvas');
          canvas.width = sampleW;
          canvas.height = sampleH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            ctx.drawImage(img, 0, 0, sampleW, sampleH);
            const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;

            let transparentPixels = 0;
            let minX = sampleW, minY = sampleH, maxX = 0, maxY = 0;

            for (let y = 0; y < sampleH; y++) {
              for (let x = 0; x < sampleW; x++) {
                const idx = (y * sampleW + x) * 4;
                const alpha = imgData[idx + 3];

                if (alpha < 250) {
                  transparentPixels++;
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }

            // Jika setidaknya 1% dari gambar memiliki transparansi
            const totalPixels = sampleW * sampleH;
            hasAlpha = transparentPixels > totalPixels * 0.01;

            if (hasAlpha && maxX >= minX && maxY >= minY) {
              alphaBoundingBox = {
                minX: Number((minX / sampleW).toFixed(3)),
                minY: Number((minY / sampleH).toFixed(3)),
                maxX: Number((maxX / sampleW).toFixed(3)),
                maxY: Number((maxY / sampleH).toFixed(3)),
              };
            }
          }
        } catch {
          hasAlpha = null;
        }
      }

      URL.revokeObjectURL(objectUrl);
      resolve({ width, height, hasAlpha, alphaBoundingBox });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: 0, height: 0, hasAlpha: null, alphaBoundingBox: null });
    };

    img.src = objectUrl;
  });
}
