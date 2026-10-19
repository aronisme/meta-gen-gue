import { describe, it, expect } from 'vitest';
import {
  AGENCY_PRESETS,
  checkDuplicateAsset,
  computeFileFingerprint,
  sanitizeFtpHost,
} from '../ftp/store';
import { getAgencyRemoteFolder } from '../ftp/client';
import { checkBridgeHealth } from '../ftp/bridge-client';
import type { UploadLedgerRecord } from '../types';

describe('Microstock Multi-Account FTP Engine & Anti-Duplicate Verification', () => {
  describe('sanitizeFtpHost host cleaning', () => {
    it('strips sftp:// prefix copied from Adobe Stock portal', () => {
      expect(sanitizeFtpHost('sftp://sftp.contributor.adobestock.com')).toBe('sftp.contributor.adobestock.com');
    });

    it('strips ftp:// and ftps:// prefixes', () => {
      expect(sanitizeFtpHost('ftp://ftp.vecteezy.com')).toBe('ftp.vecteezy.com');
      expect(sanitizeFtpHost('ftps://ftp.freepik.com/')).toBe('ftp.freepik.com');
    });

    it('strips trailing slashes, paths, and port numbers', () => {
      expect(sanitizeFtpHost('sftp.contributor.adobestock.com:22')).toBe('sftp.contributor.adobestock.com');
      expect(sanitizeFtpHost('sftp://sftp.contributor.adobestock.com:22/upload/')).toBe('sftp.contributor.adobestock.com');
    });

    it('preserves clean host and handles whitespace', () => {
      expect(sanitizeFtpHost('  sftp.contributor.adobestock.com  ')).toBe('sftp.contributor.adobestock.com');
      expect(sanitizeFtpHost('')).toBe('');
    });
  });

  describe('AGENCY_PRESETS configuration', () => {
    it('configures Adobe Stock for SFTP port 22', () => {
      const adobe = AGENCY_PRESETS.adobe;
      expect(adobe).toBeDefined();
      expect(adobe.host).toBe('sftp.contributor.adobestock.com');
      expect(adobe.port).toBe(22);
      expect(adobe.protocol).toBe('sftp');
    });

    it('configures Shutterstock for SFTP port 22', () => {
      const ss = AGENCY_PRESETS.shutterstock;
      expect(ss).toBeDefined();
      expect(ss.host).toBe('sftp.shutterstock.com');
      expect(ss.port).toBe(22);
      expect(ss.protocol).toBe('sftp');
    });

    it('configures Vecteezy, Freepik, Dreamstime, and Pond5 presets properly', () => {
      expect(AGENCY_PRESETS.vecteezy.host).toBe('ftp.vecteezy.com');
      expect(AGENCY_PRESETS.vecteezy.port).toBe(21);

      expect(AGENCY_PRESETS.freepik.host).toBe('ftp.freepik.com');
      expect(AGENCY_PRESETS.dreamstime.host).toBe('upload.dreamstime.com');
      expect(AGENCY_PRESETS.pond5.host).toBe('ftp.pond5.com');
    });
  });

  describe('checkDuplicateAsset Anti-Duplicate System', () => {
    const mockLedger: UploadLedgerRecord[] = [
      {
        id: 'rec-1',
        assetHash: 'hash-abc-12345',
        filename: 'sunset_tropical_4k.mp4',
        fileSizeBytes: 52428800,
        agencyId: 'adobe',
        accountId: 'acc-adobe-1',
        accountLabel: 'Adobe Stock Footage Main',
        uploadedAt: new Date('2026-05-10T10:00:00Z').getTime(),
        remotePath: '/sunset_tropical_4k.mp4',
        status: 'success',
      },
      {
        id: 'rec-2',
        assetHash: 'hash-def-67890',
        filename: 'city_hyperlapse.mp4',
        fileSizeBytes: 31457280,
        agencyId: 'shutterstock',
        accountId: 'acc-ss-1',
        accountLabel: 'SS Studio A',
        uploadedAt: new Date('2026-06-01T12:00:00Z').getTime(),
        remotePath: '/city_hyperlapse.mp4',
        status: 'success',
      },
      {
        id: 'rec-3',
        assetHash: 'hash-fail-99999',
        filename: 'failed_asset.mp4',
        fileSizeBytes: 10485760,
        agencyId: 'adobe',
        accountId: 'acc-adobe-2',
        accountLabel: 'Adobe Stock Secondary',
        uploadedAt: new Date('2026-06-02T12:00:00Z').getTime(),
        remotePath: '/failed_asset.mp4',
        status: 'failed',
      },
    ];

    it('returns not duplicate when ledger is empty', () => {
      const result = checkDuplicateAsset('unique_file.mp4', 'hash-unique', 'adobe', []);
      expect(result.isDuplicate).toBe(false);
      expect(result.matchedRecord).toBeUndefined();
    });

    it('detects duplicate across different accounts within the same agency by exact hash', () => {
      // Trying to upload sunset_tropical_4k.mp4 to a secondary Adobe account
      const result = checkDuplicateAsset(
        'renamed_sunset.mp4',
        'hash-abc-12345',
        'adobe',
        mockLedger
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchedRecord?.accountId).toBe('acc-adobe-1');
      expect(result.warningMessage).toContain('Adobe Stock Footage Main');
      expect(result.warningMessage).toContain('sunset_tropical_4k.mp4');
    });

    it('detects duplicate by exact filename within the same agency even if hash differs', () => {
      const result = checkDuplicateAsset(
        'sunset_tropical_4k.mp4',
        'different-hash-content',
        'adobe',
        mockLedger
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.warningMessage).toContain('Nama file "sunset_tropical_4k.mp4"');
      expect(result.matchedRecord?.accountId).toBe('acc-adobe-1');
    });

    it('allows uploading the same asset to a DIFFERENT agency (cross-agency multi-distribution)', () => {
      // The same video uploaded to Adobe is valid and allowed on Shutterstock
      const result = checkDuplicateAsset(
        'sunset_tropical_4k.mp4',
        'hash-abc-12345',
        'vecteezy',
        mockLedger
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.matchedRecord).toBeUndefined();
    });

    it('ignores failed upload ledger records', () => {
      // rec-3 status is 'failed', so it should not block re-uploading
      const result = checkDuplicateAsset(
        'failed_asset.mp4',
        'hash-fail-99999',
        'adobe',
        mockLedger
      );

      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('computeFileFingerprint', () => {
    it('produces a valid 64-character SHA-256 hex string for a file', async () => {
      const content = 'Test video or photo bytes for hashing';
      const file = new File([content], 'sample.jpg', { type: 'image/jpeg' });

      const hash = await computeFileFingerprint(file);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);

      // Deterministic check: hashing again produces the identical fingerprint
      const hashAgain = await computeFileFingerprint(file);
      expect(hashAgain).toBe(hash);
    });
  });

  describe('getAgencyRemoteFolder Auto-Folder Routing', () => {
    it('routes video files to /video on Dreamstime', () => {
      const resMp4 = getAgencyRemoteFolder('sunset_timelapse.mp4', 'dreamstime');
      expect(resMp4.remoteDir).toBe('/video');
      expect(resMp4.remotePath).toBe('/video/sunset_timelapse.mp4');

      const resMov = getAgencyRemoteFolder('aerial_drone.mov', undefined, 'upload.dreamstime.com');
      expect(resMov.remoteDir).toBe('/video');
      expect(resMov.remotePath).toBe('/video/aerial_drone.mov');
    });

    it('routes vector and RAW files to /additional on Dreamstime', () => {
      const resEps = getAgencyRemoteFolder('vintage_badge.eps', 'dreamstime');
      expect(resEps.remoteDir).toBe('/additional');
      expect(resEps.remotePath).toBe('/additional/vintage_badge.eps');

      const resAi = getAgencyRemoteFolder('icon_set.ai', 'dreamstime');
      expect(resAi.remoteDir).toBe('/additional');
      expect(resAi.remotePath).toBe('/additional/icon_set.ai');
    });

    it('routes audio files to /audio on Dreamstime', () => {
      const resWav = getAgencyRemoteFolder('ambient_sound.wav', 'dreamstime');
      expect(resWav.remoteDir).toBe('/audio');
      expect(resWav.remotePath).toBe('/audio/ambient_sound.wav');
    });

    it('routes standard photos/rasters to root (/) on Dreamstime', () => {
      const resJpg = getAgencyRemoteFolder('mountain_lake.jpg', 'dreamstime');
      expect(resJpg.remoteDir).toBe('/');
      expect(resJpg.remotePath).toBe('/mountain_lake.jpg');

      const resPng = getAgencyRemoteFolder('transparent_flower.png', 'dreamstime');
      expect(resPng.remoteDir).toBe('/');
      expect(resPng.remotePath).toBe('/transparent_flower.png');
    });

    it('routes all files to root (/) for other agencies (Adobe, Shutterstock, Vecteezy)', () => {
      const resAdobeVideo = getAgencyRemoteFolder('city_traffic.mp4', 'adobe');
      expect(resAdobeVideo.remoteDir).toBe('/');
      expect(resAdobeVideo.remotePath).toBe('/city_traffic.mp4');

      const resShutterstockVector = getAgencyRemoteFolder('graphic.eps', 'shutterstock');
      expect(resShutterstockVector.remoteDir).toBe('/');
      expect(resShutterstockVector.remotePath).toBe('/graphic.eps');
    });
  });

  describe('checkBridgeHealth defensive URL handling', () => {
    it('handles SyntheticEvent object without throwing TypeError', async () => {
      // Mensimulasikan pemanggilan onClick={onRefresh} di mana React meneruskan objek SyntheticEvent
      const mockEvent = { nativeEvent: {}, target: {}, currentTarget: {}, type: 'click' };
      const res = await checkBridgeHealth(mockEvent as unknown as string);
      expect(res).toBeDefined();
      expect(typeof res.isAvailable).toBe('boolean');
    });

    it('handles undefined and empty string properly without throwing', async () => {
      const res1 = await checkBridgeHealth(undefined);
      expect(res1).toBeDefined();

      const res2 = await checkBridgeHealth('');
      expect(res2).toBeDefined();
    });
  });
});
