// app/api/ftp/test/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: 'Pengujian koneksi FTP via cloud dialihkan ke Local FTP Bridge. Silakan jalankan start-ftp-bridge.bat di komputer Anda.',
    },
    { status: 400 }
  );
}
