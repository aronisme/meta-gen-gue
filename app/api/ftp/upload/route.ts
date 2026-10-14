import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToFtp } from '@/lib/ftp/client';
import { embedMetadataInFile, type EmbedMetadata } from '@/lib/metadata/embed';
import type { FtpAccountProfile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Izinkan hingga 5 menit untuk upload video footage besar

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const configStr = formData.get('config') as string | null;
    const remoteFilename = (formData.get('remoteFilename') as string) || file?.name || '';
    const metadataStr = formData.get('metadata') as string | null;
    const shouldEmbed = formData.get('embedMetadata') !== 'false';

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'Tidak ada file yang dikirim untuk diunggah.' },
        { status: 400 }
      );
    }

    if (!configStr) {
      return NextResponse.json(
        { ok: false, error: 'Konfigurasi akun FTP/SFTP tidak ditemukan.' },
        { status: 400 }
      );
    }

    let config: Partial<FtpAccountProfile>;
    try {
      config = JSON.parse(configStr);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Format konfigurasi akun FTP tidak valid.' },
        { status: 400 }
      );
    }

    if (!config.host || !config.username || !config.password) {
      return NextResponse.json(
        { ok: false, error: 'Host, username, dan password wajib diisi.' },
        { status: 400 }
      );
    }

    // Ubah stream file menjadi buffer
    const arrayBuf = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuf) as Buffer;

    let isEmbedded = false;
    let embeddedFormat: string | null = null;

    if (shouldEmbed && metadataStr) {
      try {
        const metadata: EmbedMetadata = JSON.parse(metadataStr);
        const ext = remoteFilename.toLowerCase().slice(remoteFilename.lastIndexOf('.'));
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          const originalLen = buffer.length;
          buffer = Buffer.from(embedMetadataInFile(buffer, remoteFilename, metadata));
          isEmbedded = buffer.length !== originalLen;
          embeddedFormat = ext.replace('.', '').toUpperCase();
          console.log(
            `[FTP Upload] Metadata otomatis disematkan ke ${remoteFilename} (${embeddedFormat}): "${metadata.title?.slice(0, 30)}..."`
          );
        }
      } catch (embedErr) {
        console.warn('[FTP Upload] Gagal menyematkan metadata, mengunggah file original:', embedErr);
      }
    }

    console.log(
      `[FTP Upload] Mengirim "${remoteFilename}" (${(buffer.length / (1024 * 1024)).toFixed(1)} MB, embedded=${isEmbedded}) ke ${config.protocol || 'sftp'}://${config.host}:${config.port || 22}`
    );

    const result = await uploadFileToFtp(
      {
        host: config.host,
        port: Number(config.port) || (config.protocol === 'sftp' ? 22 : 21),
        protocol: config.protocol || 'sftp',
        username: config.username,
        password: config.password,
        agencyId: config.agencyId,
      },
      buffer,
      remoteFilename
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(
      {
        ...result,
        metadataEmbedded: isEmbedded,
        embeddedFormat,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FTP upload route error:', msg);
    return NextResponse.json(
      { ok: false, error: `Server error saat mengunggah: ${msg}` },
      { status: 500 }
    );
  }
}
