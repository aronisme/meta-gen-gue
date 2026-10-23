import { NextRequest } from 'next/server';

export const runtime = 'edge';

const PROXY_CLUSTERS = [
  {
    name: 'Cluster-1',
    url:
      process.env.GAS_PROXY_URL_1 ||
      process.env.GAS_PROXY_URL ||
      'https://script.google.com/macros/s/AKfycbz0TfjsTcaMF6WvXqf8SIfHCHVqkHQjB8I8O5l_zfKmoqeqDdh0IyHvg0PJlg8kWzXKwA/exec',
    token:
      process.env.GAS_PROXY_TOKEN_1 ||
      process.env.GAS_PROXY_TOKEN ||
      'sk-gas-default-token133',
  },
  {
    name: 'Cluster-2',
    url:
      process.env.GAS_PROXY_URL_2 ||
      'https://script.google.com/macros/s/AKfycbyxgrWSWQGMYBwbn4mjR_0VaXa6DdkGHmbC3YUJ7cWByxdZ-uJXk76iCYzV1826syjGxA/exec',
    token:
      process.env.GAS_PROXY_TOKEN_2 ||
      'gas_live_8b84dd959b764b4296669602',
  },
];

const EXPECTED_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '61908502532-85bvlf6i8safupsefop9n3hflbodrthe.apps.googleusercontent.com';

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  sub?: string;
  error_description?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, action = 'google_login', email } = body as {
      idToken?: string;
      action?: string;
      email?: string;
    };

    if (action === 'get_user_status') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'Missing email parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Query GAS proxy cluster for user status
      for (const cluster of PROXY_CLUSTERS) {
        try {
          const resp = await fetch(cluster.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_user_status', email }),
          });
          if (resp.ok) {
            const data = await resp.json();
            return new Response(JSON.stringify(data), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch (e) {
          console.warn(`[Auth API] ${cluster.name} status check failed:`, e);
        }
      }

      return new Response(JSON.stringify({ ok: false, error: 'Database proxy tidak dapat dihubungi' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!idToken) {
      return new Response(JSON.stringify({ error: 'Missing Google idToken' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Verifikasi langsung dengan Google TokenInfo endpoint untuk validasi otentikasi awal
    let googlePayload: GoogleTokenInfo | null = null;
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (verifyRes.ok) {
        googlePayload = (await verifyRes.json()) as GoogleTokenInfo;
      }
    } catch (err) {
      console.warn('[Auth API] Google tokeninfo verification error:', err);
    }

    if (!googlePayload || !googlePayload.email) {
      return new Response(JSON.stringify({ error: 'Token Google tidak valid atau sudah kadaluwarsa' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (EXPECTED_CLIENT_ID && googlePayload.aud !== EXPECTED_CLIENT_ID) {
      return new Response(JSON.stringify({ error: 'Client ID tidak sesuai dengan aplikasi ini' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Kirim ke GAS Proxy Cluster untuk sinkronisasi dengan tab Users di Google Sheets
    const errors: string[] = [];
    for (const cluster of PROXY_CLUSTERS) {
      try {
        const gasResp = await fetch(cluster.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'google_login',
            idToken,
            email: googlePayload.email,
            name: googlePayload.name,
            picture: googlePayload.picture,
          }),
        });

        if (gasResp.ok) {
          const gasData = (await gasResp.json()) as Record<string, unknown>;
          return new Response(JSON.stringify(gasData), {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          const errText = await gasResp.text();
          errors.push(`${cluster.name}: HTTP ${gasResp.status} - ${errText.slice(0, 100)}`);
        }
      } catch (clusterErr) {
        errors.push(`${cluster.name}: ${clusterErr instanceof Error ? clusterErr.message : String(clusterErr)}`);
      }
    }

    // Fallback darurat: Jika kedua cluster GAS lambat merespons, kembalikan profil terverifikasi sementara
    console.warn('[Auth API] GAS sync failed, returning local verified profile fallback. Errors:', errors);
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          email: googlePayload.email.toLowerCase(),
          name: googlePayload.name || googlePayload.email,
          picture: googlePayload.picture || '',
          role: 'user',
          status: 'active',
          dailyQuota: 100,
          usageCount: 0,
          remainingQuota: 100,
          lastLogin: new Date().toISOString(),
          isOfflineFallback: true,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Auth API] Internal error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
