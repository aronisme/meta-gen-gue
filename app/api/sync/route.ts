// app/api/sync/route.ts
// Local Development Fallback for Sync API

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action || 'pull';

    if (action === 'pull') {
      return NextResponse.json({
        ok: true,
        data: {
          history: [],
          sessions: [],
          ftpAccounts: [],
          uploadLedger: [],
          settings: null,
        },
      });
    }

    return NextResponse.json({ ok: true, synced: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
