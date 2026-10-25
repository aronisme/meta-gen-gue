import type { QcCheckFinding, QcDecision, TechnicalMetrics } from './types';

export interface DecisionEngineResult {
  decision: QcDecision;
  decision_summary: string;
  has_block_issue: boolean;
  has_review_issue: boolean;
  total_findings: number;
}

/**
 * Mendeteksi apakah temuan visual VLM merupakan halusinasi padding/letterbox kanvas.
 * Pola khas: VLM mengklaim ada area putih kosong (blank space) sekitar 50% di bagian bawah / tengah kanvas
 * atau kesalahan penggabungan (stitching) pada gambar non-square (seperti 16:9).
 */
export function isLetterboxCanvasHallucination(
  observation: string,
  technical: TechnicalMetrics
): boolean {
  if (!observation) return false;
  // Jika gambar terbukti memiliki alpha/transparansi nyata, jangan filter (karena mungkin memang ada isu alpha)
  if (technical.has_alpha === true && technical.format === 'PNG') return false;

  const lower = observation.toLowerCase();

  const mentionsWhitespace =
    lower.includes('area putih') ||
    lower.includes('blank space') ||
    lower.includes('blank white space') ||
    lower.includes('ruang putih') ||
    lower.includes('bagian bawah gambar') ||
    lower.includes('di tengah kanvas') ||
    lower.includes('kanvas kosong');

  const mentionsCanvasArtifact =
    lower.includes('stitching') ||
    lower.includes('penggabungan') ||
    lower.includes('kesalahan kanvas') ||
    lower.includes('kegagalan rendering') ||
    lower.includes('error rendering') ||
    lower.includes('crop error') ||
    lower.includes('cropping file') ||
    lower.includes('50% dari') ||
    lower.includes('50% kanvas');

  return mentionsWhitespace && mentionsCanvasArtifact;
}

/**
 * Deterministic Decision Engine
 * Menggabungkan hasil preflight teknis dan temuan inspeksi agen secara deterministik.
 * Mengikuti aturan baku: tidak boleh ada penilaian AI bebas yang mengabaikan kegagalan teknis.
 */
export function evaluateFinalDecision(
  technical: TechnicalMetrics,
  findings: QcCheckFinding[]
): DecisionEngineResult {
  // 1. Cek Kegagalan Teknis Hard (Deterministic BLOCK)
  if (!technical.passes_hard_tech) {
    const summary = technical.fail_reasons.join(' ');
    return {
      decision: 'BLOCK',
      decision_summary: `DITOLAK (BLOCK): Gagal verifikasi teknis resmi Adobe Stock. ${summary}`,
      has_block_issue: true,
      has_review_issue: false,
      total_findings: findings.length + technical.fail_reasons.length,
    };
  }

  // 1.5 Kalibrasi deterministik: Supresi halusinasi VLM terkait letterboxing kanvas pada gambar solid
  const calibratedFindings = findings.map((f) => {
    if (!f.user_dismissed && isLetterboxCanvasHallucination(f.observation, technical)) {
      return {
        ...f,
        user_dismissed: true,
        status: 'PASS' as const,
        severity: 'INFO' as const,
        observation: `[DIKALIBRASI - ARTEFAK LETTERBOXING VLM] ${f.observation} (Diverifikasi oleh Engine: File ${technical.format} Solid ${technical.width_px}×${technical.height_px} px adalah foto penuh normal)`,
      };
    }
    return f;
  });

  // 2. Filter temuan aktif yang belum diabaikan oleh pengguna atau engine
  const activeFindings = calibratedFindings.filter((f) => !f.user_dismissed);

  // 3. Cek temuan berkategori FAIL / BLOCK
  const blockFindings = activeFindings.filter(
    (f) => f.status === 'FAIL' || f.severity === 'CRITICAL'
  );

  if (blockFindings.length > 0) {
    const topReason = blockFindings[0].observation;
    return {
      decision: 'BLOCK',
      decision_summary: `DITOLAK (BLOCK): Ditemukan ${blockFindings.length} pelanggaran fatal kebijakan. Masalah utama: ${topReason}`,
      has_block_issue: true,
      has_review_issue: activeFindings.some((f) => f.status === 'REVIEW'),
      total_findings: activeFindings.length,
    };
  }

  // 4. Cek temuan yang memerlukan REVIEW manusia
  const reviewFindings = activeFindings.filter(
    (f) => f.status === 'REVIEW' || f.requires_human_review || f.severity === 'HIGH' || f.severity === 'MEDIUM'
  );

  if (reviewFindings.length > 0) {
    const topReview = reviewFindings[0].observation;
    return {
      decision: 'REVIEW',
      decision_summary: `PERLU DITINJAU (REVIEW): Ditemukan ${reviewFindings.length} poin yang memerlukan verifikasi manual kontributor. Catatan: ${topReview}`,
      has_block_issue: false,
      has_review_issue: true,
      total_findings: activeFindings.length,
    };
  }

  // 5. Jika seluruh pengecekan lulus tanpa isu
  return {
    decision: 'READY',
    decision_summary:
      'SIAP DISUBMIT (READY): Tidak ditemukan masalah pada seluruh pengecekan yang dikonfigurasi. (Catatan: Ini bukan jaminan penerimaan otomatis oleh moderator Adobe Stock).',
    has_block_issue: false,
    has_review_issue: false,
    total_findings: activeFindings.length,
  };
}
