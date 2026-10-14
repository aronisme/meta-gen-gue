import { describe, it, expect } from 'vitest';
import {
  normalizeFileStem,
  computeFileFingerprint,
  hammingDistanceHex,
  matchDuplicateFile,
  filterDuplicateFiles,
} from '@/lib/dedupe';

describe('normalizeFileStem', () => {
  it('strips long numeric timestamps from AI rendered exports', () => {
    const nameA = 'Man_aligning_framed_photograph_2K_20261011224436.jpg';
    const nameB = 'Man_aligning_framed_photograph_2K_20261011213958.jpg';

    expect(normalizeFileStem(nameA)).toBe('man_aligning_framed_photograph_2k');
    expect(normalizeFileStem(nameB)).toBe('man_aligning_framed_photograph_2k');
    expect(normalizeFileStem(nameA)).toBe(normalizeFileStem(nameB));
  });

  it('strips copy and duplicate suffixes', () => {
    expect(normalizeFileStem('portrait_smiling_woman (1).png')).toBe('portrait_smiling_woman');
    expect(normalizeFileStem('portrait_smiling_woman - copy.png')).toBe('portrait_smiling_woman');
    expect(normalizeFileStem('portrait_smiling_woman_v2.png')).toBe('portrait_smiling_woman');
  });

  it('preserves meaningful descriptive filenames without timestamp suffixes', () => {
    expect(normalizeFileStem('tropical_beach_sunset.jpg')).toBe('tropical_beach_sunset');
  });
});

describe('computeFileFingerprint', () => {
  it('computes deterministic SHA-256 hash for files with identical content', async () => {
    const fileA = new File(['Same image data here'], 'file_a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['Same image data here'], 'file_b.jpg', { type: 'image/jpeg' });

    const hashA = await computeFileFingerprint(fileA);
    const hashB = await computeFileFingerprint(fileB);

    expect(hashA).toBe(hashB);
    expect(hashA.length).toBe(64);
  });

  it('computes different SHA-256 hash for files with different content', async () => {
    const fileA = new File(['Content alpha'], 'file_a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['Content beta'], 'file_b.jpg', { type: 'image/jpeg' });

    const hashA = await computeFileFingerprint(fileA);
    const hashB = await computeFileFingerprint(fileB);

    expect(hashA).not.toBe(hashB);
  });
});

describe('hammingDistanceHex', () => {
  it('calculates bit differences accurately', () => {
    expect(hammingDistanceHex('0', '0')).toBe(0);
    expect(hammingDistanceHex('0', '1')).toBe(1);
    expect(hammingDistanceHex('0', '3')).toBe(2);
    expect(hammingDistanceHex('00', '11')).toBe(2);
  });
});

describe('matchDuplicateFile', () => {
  it('detects exact filename duplicate', () => {
    const candidate = {
      name: 'sunset.jpg',
      size: 1000,
      stem: 'sunset',
    };
    const existing = [{ name: 'sunset.jpg', size: 1000, stem: 'sunset' }];

    const match = matchDuplicateFile(candidate, existing);
    expect(match).not.toBeNull();
    expect(match?.reason).toBe('exact_name');
  });

  it('detects stem and size match for files with different timestamps', () => {
    const candidate = {
      name: 'Man_aligning_framed_photograph_2K_20261011224436.jpg',
      size: 2800000,
      stem: normalizeFileStem('Man_aligning_framed_photograph_2K_20261011224436.jpg'),
    };
    const existing = [
      {
        name: 'Man_aligning_framed_photograph_2K_20261011213958.jpg',
        size: 2800000,
        stem: normalizeFileStem('Man_aligning_framed_photograph_2K_20261011213958.jpg'),
      },
    ];

    const match = matchDuplicateFile(candidate, existing);
    expect(match).not.toBeNull();
    expect(match?.reason).toBe('stem_and_size');
    expect(match?.duplicateOf).toBe('Man_aligning_framed_photograph_2K_20261011213958.jpg');
  });
});

describe('filterDuplicateFiles', () => {
  it('filters out intra-batch duplicates and keeps only unique files', async () => {
    const fileA = new File(['image content A'], 'Man_aligning_framed_photograph_2K_20261011224436.jpg', {
      type: 'image/jpeg',
    });
    const fileB = new File(['image content A'], 'Man_aligning_framed_photograph_2K_20261011213958.jpg', {
      type: 'image/jpeg',
    });
    const fileC = new File(['different content C'], 'other_unique_image.jpg', {
      type: 'image/jpeg',
    });

    const result = await filterDuplicateFiles([fileA, fileB, fileC]);

    expect(result.acceptedFiles.length).toBe(2);
    expect(result.acceptedFiles[0].name).toBe('Man_aligning_framed_photograph_2K_20261011224436.jpg');
    expect(result.acceptedFiles[1].name).toBe('other_unique_image.jpg');

    expect(result.rejectedDuplicates.length).toBe(1);
    expect(result.rejectedDuplicates[0].file.name).toBe('Man_aligning_framed_photograph_2K_20261011213958.jpg');
  });

  it('filters out files that were already generated in existing session', async () => {
    const fileNew = new File(['test data'], 'forest_path.jpg', { type: 'image/jpeg' });
    const fileAlreadyInSession = new File(['test data'], 'mountain_view.jpg', { type: 'image/jpeg' });

    const result = await filterDuplicateFiles([fileNew, fileAlreadyInSession], {
      existingItemFilenames: ['mountain_view.jpg'],
    });

    expect(result.acceptedFiles.length).toBe(1);
    expect(result.acceptedFiles[0].name).toBe('forest_path.jpg');
    expect(result.rejectedDuplicates.length).toBe(1);
    expect(result.rejectedDuplicates[0].file.name).toBe('mountain_view.jpg');
  });
});
