import { describe, it, expect } from 'vitest';
import { evaluateFinalDecision } from '@/lib/qc/decision-engine';
import { scanTextForWatchlistMatches, findRuleById } from '@/lib/qc/rulebook-data';
import type { TechnicalMetrics, QcCheckFinding } from '@/lib/qc/types';

describe('Adobe Stock QC Decision Engine', () => {
  const baseTechnical: TechnicalMetrics = {
    format: 'JPEG',
    width_px: 4000,
    height_px: 3000,
    megapixels: 12.0,
    file_size_bytes: 5 * 1024 * 1024,
    icc_profile: 'sRGB',
    has_alpha: false,
    checks_run: ['dimensions', 'megapixels', 'file_size', 'format'],
    passes_hard_tech: true,
    fail_reasons: [],
  };

  it('harus BLOCK jika preflight teknis deterministik gagal (< 4 MP)', () => {
    const failedTech: TechnicalMetrics = {
      ...baseTechnical,
      megapixels: 2.5,
      passes_hard_tech: false,
      fail_reasons: ['Resolusi gambar 2.5 MP di bawah batas minimum resmi Adobe Stock (Minimal 4.0 MP).'],
    };

    const res = evaluateFinalDecision(failedTech, []);
    expect(res.decision).toBe('BLOCK');
    expect(res.has_block_issue).toBe(true);
    expect(res.decision_summary).toContain('DITOLAK (BLOCK)');
  });

  it('harus BLOCK jika terdapat temuan status FAIL atau severity CRITICAL', () => {
    const findings: QcCheckFinding[] = [
      {
        check_id: 'VQ-ANATOMY-HANDS',
        status: 'FAIL',
        severity: 'CRITICAL',
        source_class: 'official_adobe',
        observation: 'Jari tangan berjumlah 7 dan melebur parah ke objek.',
        requires_human_review: false,
      },
    ];

    const res = evaluateFinalDecision(baseTechnical, findings);
    expect(res.decision).toBe('BLOCK');
    expect(res.has_block_issue).toBe(true);
  });

  it('harus REVIEW jika terdapat temuan status REVIEW atau severity HIGH', () => {
    const findings: QcCheckFinding[] = [
      {
        check_id: 'IP_RESTRICTION_KR-003',
        status: 'REVIEW',
        severity: 'HIGH',
        source_class: 'official_adobe',
        observation: 'Terdeteksi indikasi merk Adidas.',
        requires_human_review: true,
      },
    ];

    const res = evaluateFinalDecision(baseTechnical, findings);
    expect(res.decision).toBe('REVIEW');
    expect(res.has_review_issue).toBe(true);
  });

  it('harus READY jika seluruh pengujian lulus dan tidak ada temuan aktif', () => {
    const res = evaluateFinalDecision(baseTechnical, []);
    expect(res.decision).toBe('READY');
    expect(res.has_block_issue).toBe(false);
    expect(res.has_review_issue).toBe(false);
  });

  it('harus menjadi READY jika temuan REVIEW diabaikan (dismissed) oleh pengguna', () => {
    const findings: QcCheckFinding[] = [
      {
        check_id: 'VQ-FOCUS-SHARPNESS',
        status: 'REVIEW',
        severity: 'MEDIUM',
        source_class: 'internal_heuristic',
        observation: 'Latar belakang tampak buram (apakah bokeh disengaja?).',
        requires_human_review: true,
        user_dismissed: true, // Pengguna mengabaikan karena ini efek bokeh artistik
      },
    ];

    const res = evaluateFinalDecision(baseTechnical, findings);
    expect(res.decision).toBe('READY');
  });

  it('harus mengabaikan (kalibrasi) halusinasi VLM terkait area putih kosong letterboxing pada gambar 16:9 solid', () => {
    const widescreenTech: TechnicalMetrics = {
      ...baseTechnical,
      width_px: 2752,
      height_px: 1536,
      megapixels: 4.23,
      format: 'JPEG',
      has_alpha: false,
      passes_hard_tech: true,
      fail_reasons: [],
    };

    const hallucinatedFindings: QcCheckFinding[] = [
      {
        check_id: 'VQ-COMPOSITION',
        status: 'FAIL',
        severity: 'CRITICAL',
        source_class: 'official_adobe',
        observation:
          'Bagian bawah gambar (sekitar 50% dari total tinggi) terisi oleh area putih kosong yang masif, yang tampaknya merupakan artefak dari proses penggabungan (stitching) atau kesalahan kanvas.',
        requires_human_review: false,
      },
    ];

    const res = evaluateFinalDecision(widescreenTech, hallucinatedFindings);
    expect(res.decision).toBe('READY');
    expect(res.has_block_issue).toBe(false);
  });
});

describe('Known Restrictions Watchlist & Rulebook Lookup', () => {
  it('dapat menemukan aturan resmi berdasarkan ID', () => {
    const rule = findRuleById('AS-PHOTO-TECH-001');
    expect(rule).toBeDefined();
    expect(rule?.domain).toBe('technical_photo');
    expect(rule?.severity).toBe('BLOCK_IF_CONFIRMED');
  });

  it('mendeteksi entitas terlarang dari watchlist (contoh: Adidas / Absolut Vodka)', () => {
    const textWithBrand = 'A young man wearing three-stripe adidas sportswear in the street';
    const matches = scanTextForWatchlistMatches(textWithBrand);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.item.id === 'KR-003')).toBe(true);
  });
});

describe('QC Cache Key Computation & Memory Matching', () => {
  it('menghasilkan key berbasis path jika filePath tersedia', async () => {
    const { computeQcFileKey } = await import('@/lib/qc/cache');
    const key = computeQcFileKey(undefined, 'image_01.jpg', 'C:\\Photos\\Project\\image_01.jpg');
    expect(key).toBe('path::c:\\photos\\project\\image_01.jpg::0::0');
  });

  it('menghasilkan key berbasis file name jika filePath tidak tersedia', async () => {
    const { computeQcFileKey } = await import('@/lib/qc/cache');
    const mockFile = new File(['dummy content'], 'sunset_beach.png', { type: 'image/png' });
    const key = computeQcFileKey(mockFile);
    expect(key).toContain('file::sunset_beach.png::');
  });

  it('menghasilkan name-only key secara konsisten', async () => {
    const { computeQcNameOnlyKey } = await import('@/lib/qc/cache');
    expect(computeQcNameOnlyKey('MyPhoto.JPG')).toBe('name::myphoto.jpg');
  });
});
