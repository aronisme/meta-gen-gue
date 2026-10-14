import { describe, it, expect } from 'vitest';
import {
  isVideoFile,
  isImageFile,
  isMediaFile,
  MAX_VIDEO_DURATION_SECONDS,
  validateVideoFile,
} from '../video';

describe('video utilities', () => {
  it('should enforce MAX_VIDEO_DURATION_SECONDS as 30', () => {
    expect(MAX_VIDEO_DURATION_SECONDS).toBe(30);
  });

  describe('file type detection', () => {
    it('should identify video files correctly', () => {
      const mp4File = new File([''], 'sample.mp4', { type: 'video/mp4' });
      const movFile = new File([''], 'clip.mov', { type: 'video/quicktime' });
      const webmFile = new File([''], 'recording.webm', { type: 'video/webm' });
      const jpgFile = new File([''], 'photo.jpg', { type: 'image/jpeg' });

      expect(isVideoFile(mp4File)).toBe(true);
      expect(isVideoFile(movFile)).toBe(true);
      expect(isVideoFile(webmFile)).toBe(true);
      expect(isVideoFile(jpgFile)).toBe(false);
    });

    it('should identify image files correctly', () => {
      const jpgFile = new File([''], 'photo.jpg', { type: 'image/jpeg' });
      const pngFile = new File([''], 'graphic.png', { type: 'image/png' });
      const mp4File = new File([''], 'clip.mp4', { type: 'video/mp4' });

      expect(isImageFile(jpgFile)).toBe(true);
      expect(isImageFile(pngFile)).toBe(true);
      expect(isImageFile(mp4File)).toBe(false);
    });

    it('should recognize both image and video as valid media files', () => {
      const jpgFile = new File([''], 'photo.jpg', { type: 'image/jpeg' });
      const mp4File = new File([''], 'clip.mp4', { type: 'video/mp4' });
      const pdfFile = new File([''], 'doc.pdf', { type: 'application/pdf' });

      expect(isMediaFile(jpgFile)).toBe(true);
      expect(isMediaFile(mp4File)).toBe(true);
      expect(isMediaFile(pdfFile)).toBe(false);
    });
  });

  describe('validateVideoFile', () => {
    it('should immediately validate non-video media without duration errors', async () => {
      const jpgFile = new File([''], 'photo.jpg', { type: 'image/jpeg' });
      const res = await validateVideoFile(jpgFile);
      expect(res.valid).toBe(true);
      expect(res.duration).toBe(0);
      expect(res.error).toBeUndefined();
    });

    it('should handle video files within duration limit', async () => {
      const mp4File = new File([''], 'sample.mp4', { type: 'video/mp4' });
      // When getVideoDuration resolves to duration <= 30
      const res = await validateVideoFile(mp4File, 30);
      expect(res.valid).toBe(true);
    });
  });
});
