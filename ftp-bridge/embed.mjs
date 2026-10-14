// ftp-bridge/embed.mjs
/**
 * Standar Industri IPTC Photo Metadata & Adobe XMP Lossless Injector
 * Menyematkan Title, Description, dan Keywords langsung ke dalam biner file
 * JPEG (APP1 XMP & APP13 Photoshop IPTC-IIM) dan PNG (iTXt chunk XML:com.adobe.xmp).
 *
 * Kompatibel 100% dengan Adobe Stock, Shutterstock, Freepik, dan ExifTool.
 */

export function buildXmpPacket(meta) {
  const title = (meta.title || '').trim();
  const description = (meta.description || '').trim();
  const rawKeywords = Array.isArray(meta.keywords)
    ? meta.keywords
    : (meta.keywords || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

  const escapeXml = (unsafe) => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const escapedTitle = escapeXml(title);
  const escapedDescription = escapeXml(description);
  const escapedKeywords = rawKeywords
    .map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`)
    .join('\n        ');

  const isAi = Boolean(meta.aiGenerated);
  const digitalSourceType = isAi
    ? '\n      <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
    : '';

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 2026/01/01-00:00:00">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapedTitle}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapedDescription}</rdf:li>
        </rdf:Alt>
      </dc:description>
      <dc:subject>
        <rdf:Bag>
        ${escapedKeywords}
        </rdf:Bag>
      </dc:subject>
      <photoshop:Headline>${escapedTitle}</photoshop:Headline>
      ${meta.author ? `<photoshop:Credit>${escapeXml(meta.author)}</photoshop:Credit>` : ''}
      ${digitalSourceType}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export function buildIptcIimBlock(meta) {
  const title = (meta.title || '').trim();
  const description = (meta.description || '').trim();
  const rawKeywords = Array.isArray(meta.keywords)
    ? meta.keywords
    : (meta.keywords || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

  const chunks = [];

  function addIptcTag(record, dataset, text) {
    if (!text) return;
    const valBuf = Buffer.from(text, 'utf-8');
    const header = Buffer.alloc(5);
    header[0] = 0x1c;
    header[1] = record;
    header[2] = dataset;
    header.writeUInt16BE(valBuf.length, 3);
    chunks.push(header, valBuf);
  }

  // 1. Coded Character Set (UTF-8 declaration: ESC % G)
  chunks.push(Buffer.from([0x1c, 0x01, 0x5a, 0x00, 0x03, 0x1b, 0x25, 0x47]));

  // 2. ObjectName / Title (2:05)
  if (title) addIptcTag(2, 5, title);

  // 3. Caption-Abstract / Description (2:120)
  if (description) addIptcTag(2, 120, description);

  // 4. Keywords (2:25)
  for (const kw of rawKeywords) {
    addIptcTag(2, 25, kw);
  }

  // 5. By-line / Author (2:80)
  if (meta.author) addIptcTag(2, 80, meta.author);

  // 6. Copyright Notice (2:116)
  if (meta.copyright) addIptcTag(2, 116, meta.copyright);

  const iptcData = Buffer.concat(chunks);

  // Bungkus dalam Photoshop 3.0 8BIM IPTC-NAA resource block
  const bimHeader = Buffer.alloc(12);
  bimHeader.write('8BIM', 0, 'ascii');
  bimHeader.writeUInt16BE(0x0404, 4);
  bimHeader.writeUInt16BE(0x0000, 6);
  bimHeader.writeUInt32BE(iptcData.length, 8);

  const pad = iptcData.length % 2 !== 0 ? Buffer.from([0x00]) : Buffer.alloc(0);

  return Buffer.concat([bimHeader, iptcData, pad]);
}

export function embedMetadataInJpeg(jpegBuffer, meta) {
  if (jpegBuffer.length < 4 || jpegBuffer[0] !== 0xff || jpegBuffer[1] !== 0xd8) {
    return jpegBuffer;
  }

  const xmpString = buildXmpPacket(meta);
  const xmpPayload = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'utf-8'),
    Buffer.from(xmpString, 'utf-8'),
  ]);
  const app1Segment = Buffer.alloc(4 + xmpPayload.length);
  app1Segment[0] = 0xff;
  app1Segment[1] = 0xe1;
  app1Segment.writeUInt16BE(2 + xmpPayload.length, 2);
  xmpPayload.copy(app1Segment, 4);

  const iptcPayload = buildIptcIimBlock(meta);
  const psHeader = Buffer.from('Photoshop 3.0\0', 'utf-8');
  const app13Payload = Buffer.concat([psHeader, iptcPayload]);
  const app13Segment = Buffer.alloc(4 + app13Payload.length);
  app13Segment[0] = 0xff;
  app13Segment[1] = 0xed;
  app13Segment.writeUInt16BE(2 + app13Payload.length, 2);
  app13Payload.copy(app13Segment, 4);

  let offset = 2;
  const segmentsBefore = [jpegBuffer.slice(0, 2)];
  const segmentsAfter = [];

  let inserted = false;

  while (offset < jpegBuffer.length - 1) {
    if (jpegBuffer[offset] !== 0xff) {
      break;
    }

    const marker = jpegBuffer[offset + 1];

    if (marker === 0xd9 || marker === 0xda) {
      if (!inserted) {
        segmentsBefore.push(app1Segment, app13Segment);
        inserted = true;
      }
      segmentsAfter.push(jpegBuffer.slice(offset));
      break;
    }

    const length = jpegBuffer.readUInt16BE(offset + 2);
    const nextOffset = offset + 2 + length;

    if (marker === 0xe0) {
      segmentsBefore.push(jpegBuffer.slice(offset, nextOffset));
      if (!inserted) {
        segmentsBefore.push(app1Segment, app13Segment);
        inserted = true;
      }
    } else if (marker === 0xe1) {
      const payloadStart = offset + 4;
      const headerStr = jpegBuffer
        .slice(payloadStart, Math.min(nextOffset, payloadStart + 29))
        .toString('utf-8');
      if (headerStr.startsWith('http://ns.adobe.com/xap/1.0/')) {
        // Discard old XMP
      } else {
        if (!inserted) {
          segmentsBefore.push(app1Segment, app13Segment);
          inserted = true;
        }
        segmentsBefore.push(jpegBuffer.slice(offset, nextOffset));
      }
    } else if (marker === 0xed) {
      // Discard old APP13 IPTC
    } else {
      if (!inserted) {
        segmentsBefore.push(app1Segment, app13Segment);
        inserted = true;
      }
      segmentsAfter.push(jpegBuffer.slice(offset, nextOffset));
    }

    offset = nextOffset;
  }

  if (!inserted) {
    segmentsBefore.push(app1Segment, app13Segment);
  }

  return Buffer.concat([...segmentsBefore, ...segmentsAfter]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function embedMetadataInPng(pngBuffer, meta) {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (pngBuffer.length < 8 || !pngBuffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    return pngBuffer;
  }

  const xmpString = buildXmpPacket(meta);

  const keyword = Buffer.from('XML:com.adobe.xmp\0', 'utf-8');
  const flags = Buffer.from([0x00, 0x00]);
  const langTag = Buffer.from('\0', 'utf-8');
  const transKeyword = Buffer.from('\0', 'utf-8');
  const textPayload = Buffer.from(xmpString, 'utf-8');

  const itxtData = Buffer.concat([keyword, flags, langTag, transKeyword, textPayload]);
  const chunkType = Buffer.from('iTXt', 'ascii');

  const chunkCrc = crc32(Buffer.concat([chunkType, itxtData]));

  const itxtChunk = Buffer.alloc(12 + itxtData.length);
  itxtChunk.writeUInt32BE(itxtData.length, 0);
  chunkType.copy(itxtChunk, 4);
  itxtData.copy(itxtChunk, 8);
  itxtChunk.writeUInt32BE(chunkCrc, 8 + itxtData.length);

  const chunks = [pngBuffer.slice(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const chunkTotalLen = 12 + length;
    if (offset + chunkTotalLen > pngBuffer.length) break;

    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    const chunkData = pngBuffer.slice(offset + 8, offset + 8 + length);

    if (type === 'iTXt' && chunkData.slice(0, 18).toString('utf-8').startsWith('XML:com.adobe.xmp')) {
      offset += chunkTotalLen;
      continue;
    }

    chunks.push(pngBuffer.slice(offset, offset + chunkTotalLen));

    if (type === 'IHDR' && !inserted) {
      chunks.push(itxtChunk);
      inserted = true;
    }

    offset += chunkTotalLen;
  }

  if (!inserted) {
    return Buffer.concat([pngBuffer.slice(0, 8), itxtChunk, pngBuffer.slice(8)]);
  }

  return Buffer.concat(chunks);
}

export function embedMetadataInFile(fileBuffer, filename, meta) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (ext === '.jpg' || ext === '.jpeg') {
    return embedMetadataInJpeg(fileBuffer, meta);
  }
  if (ext === '.png') {
    return embedMetadataInPng(fileBuffer, meta);
  }
  return fileBuffer;
}
