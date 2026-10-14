import { NextRequest, NextResponse } from 'next/server';
import { testFtpConnection } from '@/lib/ftp/client';
import type { FtpAccountProfile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<FtpAccountProfile>;

    if (!body.host || !body.username || !body.password) {
      return NextResponse.json(
        { ok: false, message: 'Host, username, dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const result = await testFtpConnection({
      host: body.host,
      port: Number(body.port) || (body.protocol === 'sftp' ? 22 : 21),
      protocol: body.protocol || 'sftp',
      username: body.username,
      password: body.password,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FTP test route error:', msg);
    return NextResponse.json(
      { ok: false, message: `Server error saat menguji koneksi: ${msg}` },
      { status: 500 }
    );
  }
}
