import { describe, it, expect } from 'vitest';
import {
  buildXmpPacket,
  buildIptcIimBlock,
  embedMetadataInJpeg,
  embedMetadataInPng,
  embedMetadataInFile,
  type EmbedMetadata,
} from '../metadata/embed';

describe('Metadata Embedding System', () => {
  const sampleMeta: EmbedMetadata = {
    title: 'Majestic Tropical Waterfall in Bali',
    description: 'Beautiful waterfall deep in tropical rainforest in Ubud Bali with lush green foliage.',
    keywords: ['waterfall', 'bali', 'nature', 'tropical', 'indonesia'],
    aiGenerated: false,
    author: 'Aron Microstock',
    copyright: '© 2026 Aron. All rights reserved.',
  };

  it('builds valid XMP packet containing title, description, and keywords', () => {
    const xmp = buildXmpPacket(sampleMeta);
    expect(xmp).toContain('<dc:title>');
    expect(xmp).toContain('Majestic Tropical Waterfall in Bali');
    expect(xmp).toContain('<dc:description>');
    expect(xmp).toContain('Beautiful waterfall deep in tropical rainforest');
    expect(xmp).toContain('<rdf:li>waterfall</rdf:li>');
    expect(xmp).toContain('<rdf:li>bali</rdf:li>');
    expect(xmp).toContain('<photoshop:Credit>Aron Microstock</photoshop:Credit>');
    expect(xmp).toContain('<?xpacket end="w"?>');
  });

  it('handles AI generated flag correctly in XMP', () => {
    const aiMeta: EmbedMetadata = {
      ...sampleMeta,
      aiGenerated: true,
    };
    const xmp = buildXmpPacket(aiMeta);
    expect(xmp).toContain('trainedAlgorithmicMedia');
  });

  it('builds IPTC-IIM Photoshop 8BIM block', () => {
    const iptcBuf = buildIptcIimBlock(sampleMeta);
    expect(iptcBuf.slice(0, 4).toString('ascii')).toBe('8BIM');
    expect(iptcBuf.readUInt16BE(4)).toBe(0x0404); // IPTC-NAA
    expect(iptcBuf.includes(Buffer.from('Majestic Tropical Waterfall in Bali'))).toBe(true);
    expect(iptcBuf.includes(Buffer.from('waterfall'))).toBe(true);
  });

  it('embeds IPTC and XMP into a valid JPEG buffer', () => {
    // Buat minimal valid JPEG: SOI (FF D8) + APP0 (JFIF) + DQT + SOS + EOI
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const dqt = Buffer.from([0xff, 0xdb, 0x00, 0x05, 0x00, 0x01, 0x02]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
    const imageData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const eoi = Buffer.from([0xff, 0xd9]);

    const minimalJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]), // SOI
      app0,
      dqt,
      sos,
      imageData,
      eoi,
    ]);

    const result = embedMetadataInJpeg(minimalJpeg, sampleMeta);

    // Pastikan diawali dengan SOI
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);

    // Pastikan mengandung string XMP dan IPTC
    const resultStr = result.toString('binary');
    expect(resultStr).toContain('http://ns.adobe.com/xap/1.0/');
    expect(resultStr).toContain('Majestic Tropical Waterfall in Bali');
    expect(resultStr).toContain('8BIM');

    // Pastikan EOI tetap ada di akhir
    expect(result[result.length - 2]).toBe(0xff);
    expect(result[result.length - 1]).toBe(0xd9);
  });

  it('embeds XMP iTXt chunk into a valid PNG buffer', () => {
    // Minimal PNG: Signature (8 bytes) + IHDR (25 bytes) + IEND (12 bytes)
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR: 13 bytes data length = 00 00 00 0D, 'IHDR', 13 bytes data, 4 bytes crc
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write('IHDR', 4, 'ascii');
    ihdr.writeUInt32BE(100, 8); // width
    ihdr.writeUInt32BE(100, 12); // height
    ihdr[16] = 8; // bit depth
    ihdr[17] = 6; // color type RGBA
    // IEND chunk
    const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

    const minimalPng = Buffer.concat([pngSignature, ihdr, iend]);

    const result = embedMetadataInPng(minimalPng, sampleMeta);

    // Pastikan signature tetap valid
    expect(result.slice(0, 8).equals(pngSignature)).toBe(true);

    // Pastikan ada chunk iTXt dengan XMP
    const resultStr = result.toString('utf-8');
    expect(resultStr).toContain('XML:com.adobe.xmp');
    expect(resultStr).toContain('Majestic Tropical Waterfall in Bali');
  });

  it('embedMetadataInFile dispatches accurately according to file extension', () => {
    const dummy = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // Fake JPEG
    const embeddedJpeg = embedMetadataInFile(dummy, 'photo.jpg', sampleMeta);
    expect(embeddedJpeg.length).toBeGreaterThan(dummy.length);

    // Unknown extension or video returns buffer intact
    const dummyVideo = Buffer.from('fake mp4 video bytes');
    const same = embedMetadataInFile(dummyVideo, 'clip.mp4', sampleMeta);
    expect(same).toBe(dummyVideo);
  });
});
