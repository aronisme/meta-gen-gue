/**
 * Utility for extracting keyframe images from video files in the browser.
 * Extracts representative frames across video duration for multimodal AI vision analysis.
 */

export function isVideoFile(f: File): boolean {
  return (
    (typeof f.type === 'string' && f.type.startsWith('video/')) ||
    /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(f.name)
  );
}

export function isImageFile(f: File): boolean {
  return (
    (typeof f.type === 'string' && f.type.startsWith('image/')) ||
    /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(f.name)
  );
}

export function isMediaFile(f: File): boolean {
  return isImageFile(f) || isVideoFile(f);
}

/**
 * Batas maksimum durasi video untuk analisis metadata (dalam detik).
 * Standar klip stock footage & optimasi vision extraction.
 */
export const MAX_VIDEO_DURATION_SECONDS = 30;

/**
 * Membaca durasi video secara asinkron dari File di peramban dengan fail-safe timeout.
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      return resolve(0);
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    if (document.body) {
      document.body.appendChild(video);
    }

    const blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;
    try { video.load(); } catch {}

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(blobUrl);
      video.removeAttribute('src');
      try { video.load(); } catch {}
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };

    // Fail-safe 3.0s agar tidak pernah menggantung jika browser lambat
    const timer = setTimeout(() => {
      cleanup();
      resolve(0);
    }, 3000);

    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = video.duration;
      cleanup();
      resolve(isNaN(d) || !isFinite(d) ? 0 : d);
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(0);
    };
  });
}

/**
 * Memvalidasi apakah file video berada dalam batas durasi yang diizinkan.
 */
export async function validateVideoFile(
  file: File,
  maxSeconds = MAX_VIDEO_DURATION_SECONDS
): Promise<{ valid: boolean; duration: number; error?: string }> {
  if (!isVideoFile(file)) {
    return { valid: true, duration: 0 };
  }
  const duration = await getVideoDuration(file);
  if (duration > maxSeconds) {
    return {
      valid: false,
      duration,
      error: `Video "${file.name}" berdurasi ${duration.toFixed(1)} detik (melebihi batas rekomendasi ${maxSeconds} detik).`,
    };
  }
  return { valid: true, duration };
}

export interface VideoExtractionResult {
  duration: number;
  frames: string[]; // Base64 data URLs of keyframes
  thumbDataUrl: string; // The primary representative thumbnail
  timePoints?: number[]; // Timestamps in seconds
}

export type VideoFrameProgressCallback = (current: number, total: number) => void;

export async function extractVideoKeyframes(
  file: File,
  targetFrameCount = 5,
  maxDimension = 640,
  maxDuration = MAX_VIDEO_DURATION_SECONDS,
  onProgress?: VideoFrameProgressCallback
): Promise<VideoExtractionResult> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('Ekstraksi video hanya didukung di lingkungan browser.'));
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    // Pasang sementara di DOM off-screen agar pipeline decoding Chromium aktif
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    if (document.body) {
      document.body.appendChild(video);
    }

    const blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;
    try { video.load(); } catch {}

    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(blobUrl);
      video.removeAttribute('src');
      try { video.load(); } catch {}
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };

    // Fail-safe global 25 detik agar tidak pernah menggantung tanpa henti
    const globalTimer = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error(`Timeout ekstraksi video "${file.name}": Browser membutuhkan waktu terlalu lama untuk memproses klip.`));
      }
    }, 25000);

    video.onerror = () => {
      clearTimeout(globalTimer);
      cleanup();
      reject(new Error(`Gagal memuat file video "${file.name}". Format atau codec video mungkin tidak didukung peramban ini.`));
    };

    video.onloadedmetadata = async () => {
      try {
        // Tunggu hingga data frame pertama terbuffer di browser jika diperlukan (maks 1500ms)
        if (video.readyState < 2) {
          await new Promise<void>((res) => {
            const onReady = () => {
              video.removeEventListener('loadeddata', onReady);
              video.removeEventListener('canplay', onReady);
              res();
            };
            video.addEventListener('loadeddata', onReady);
            video.addEventListener('canplay', onReady);
            setTimeout(res, 1500);
          });
        }

        let duration = video.duration;
        if (!duration || isNaN(duration) || !isFinite(duration)) {
          duration = 5; // fallback durasi jika metadata stream tidak lengkap
        }

        // Terapkan batasan durasi untuk sampling temporal (default 30 detik)
        const sampleDuration = Math.min(duration, maxDuration);
        const count = Math.max(2, Math.min(6, targetFrameCount));

        // Tentukan titik temporal ekstraksi merata sepanjang rentang analisis
        // (contoh 5 frame: 10%, 30%, 50%, 70%, 90%)
        const percentageStep = 0.8 / (count - 1 || 1);
        const timePoints: number[] = [];
        for (let i = 0; i < count; i++) {
          const pct = 0.1 + i * percentageStep;
          timePoints.push(Math.min(Math.max(0.05, sampleDuration - 0.1), Math.max(0.05, pct * sampleDuration)));
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context tidak didukung di browser ini.');
        }

        // Tentukan resolusi optimal frame (maksimal 640px pada sisi terpanjang untuk efisiensi AI)
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 360;
        if (w > maxDimension || h > maxDimension) {
          if (w >= h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        canvas.width = Math.max(w, 1);
        canvas.height = Math.max(h, 1);

        const frames: string[] = [];

        // Fungsi bantu seek yang handal dan anti-gantung:
        // Menunggu event 'seeked' dan jeda kecil untuk buffer GPU tanpa requestVideoFrameCallback
        // (requestVideoFrameCallback menggantung pada elemen video yang tersembunyi/tidak diputar)
        const seekTo = (time: number): Promise<void> => {
          return new Promise((res) => {
            let done = false;
            const complete = () => {
              if (done) return;
              done = true;
              clearTimeout(timeoutId);
              video.removeEventListener('seeked', onSeeked);
              video.removeEventListener('error', onErr);
              // Beri jeda 40ms agar GPU buffer terisi frame terkini sebelum canvas draw
              setTimeout(res, 40);
            };

            const onSeeked = () => complete();
            const onErr = () => complete();

            // Fail-safe jika event seeked tidak dipicu browser (maks 1500ms)
            const timeoutId = setTimeout(complete, 1500);

            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onErr, { once: true });

            try {
              video.currentTime = Math.max(0.01, Math.min(time, duration - 0.05));
            } catch {
              complete();
            }
          });
        };

        for (let i = 0; i < timePoints.length; i++) {
          const t = timePoints[i];
          await seekTo(t);

          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } catch (drawErr) {
            console.warn('[Video Extraction] Gagal draw frame ke canvas:', drawErr);
          }

          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          frames.push(frameDataUrl);
          onProgress?.(i + 1, timePoints.length);
          console.log(`[Video Extraction] Frame ${i + 1}/${timePoints.length} t=${t.toFixed(2)}s captured (${Math.round(frameDataUrl.length / 1024)} KB)`);
        }

        clearTimeout(globalTimer);
        cleanup();

        // Jika karena alasan browser tidak ada frame yang berhasil di-capture, buat fallback frame
        if (frames.length === 0) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.75));
        }

        // Thumbnail utama: frame tengah (50%)
        const midIndex = Math.floor(frames.length / 2);
        const thumbDataUrl = frames[midIndex] || frames[0] || '';

        resolve({
          duration,
          frames,
          thumbDataUrl,
          timePoints,
        });
      } catch (err) {
        clearTimeout(globalTimer);
        cleanup();
        reject(err);
      }
    };
  });
}
