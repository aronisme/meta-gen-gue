// app/api/ftp/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Pengunggahan file FTP via cloud dialihkan ke Local FTP Bridge. Silakan jalankan start-ftp-bridge.bat di komputer Anda agar file terunggah tanpa batas kuota.',
    },
    { status: 400 }
  );
}
