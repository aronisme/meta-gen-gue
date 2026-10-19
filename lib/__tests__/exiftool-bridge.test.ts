import { describe, it, expect } from 'vitest';
import {
  EXIFTOOL_SUPPORTED_EXTS,
  VIDEO_EXTS,
  findExifTool,
  getExifToolStatus,
  embedMetadataSmart,
} from '../../ftp-bridge/exiftool-wrapper.mjs';

describe('ExifTool Bridge & Fallback Engine', () => {
  const sampleMeta = {
    title: 'Modern Architecture in Tokyo',
    description: 'Futuristic glass skyscraper under blue sky in Shinjuku business district.',
    keywords: ['tokyo', 'architecture', 'skyscraper', 'japan', 'modern'],
    aiGenerated: true,
    author: 'MetaGen Artist',
    copyright: '© 2026 MetaGen',
  };

  it('defines recognized microstock formats properly', () => {
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.jpg')).toBe(true);
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.png')).toBe(true);
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.eps')).toBe(true);
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.svg')).toBe(true);
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.mp4')).toBe(true);
    expect(EXIFTOOL_SUPPORTED_EXTS.has('.mov')).toBe(true);

    expect(VIDEO_EXTS.has('.mp4')).toBe(true);
    expect(VIDEO_EXTS.has('.mov')).toBe(true);
    expect(VIDEO_EXTS.has('.jpg')).toBe(false);
  });

  it('reports exiftool status object with engine fallback info', () => {
    const status = getExifToolStatus();
    expect(typeof status.available).toBe('boolean');
    expect(Array.isArray(status.supportedFormats)).toBe(true);
    if (!status.available) {
      expect(status.engine).toBe('js-buffer');
    } else {
      expect(status.engine).toBe('exiftool');
      expect(typeof status.version).toBe('string');
    }
  });

  it('embedMetadataSmart performs transparent JS fallback for JPEG', async () => {
    // Minimal valid JPEG
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const dqt = Buffer.from([0xff, 0xdb, 0x00, 0x05, 0x00, 0x01, 0x02]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
    const imageData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const eoi = Buffer.from([0xff, 0xd9]);

    const minimalJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app0,
      dqt,
      sos,
      imageData,
      eoi,
    ]);

    const res = await embedMetadataSmart(minimalJpeg, 'test-photo.jpg', sampleMeta);
    expect(res.ok).toBe(true);
    expect(res.buffer).toBeDefined();
    expect(res.buffer.length).toBeGreaterThan(minimalJpeg.length);
    expect(['exiftool', 'js-buffer']).toContain(res.engine);

    // Biner harus mengandung teks metadata
    const str = res.buffer.toString('binary');
    expect(str).toContain('Modern Architecture in Tokyo');
  });

  it('embedMetadataSmart handles video gracefully with warning when ExifTool is offline', async () => {
    const status = getExifToolStatus();
    if (!status.available) {
      const dummyVideo = Buffer.from('dummy video container bytes');
      const res = await embedMetadataSmart(dummyVideo, 'motion.mp4', sampleMeta);

      expect(res.ok).toBe(true);
      expect(res.engine).toBe('unsupported-without-exiftool');
      expect(res.warning).toContain('ExifTool');
      // Buffer tidak dirusak
      expect(res.buffer.toString()).toBe('dummy video container bytes');
    }
  });
});
