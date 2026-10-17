// Cloudflare Pages Function: /api/auth/google with Cloudflare D1 Native SQL Database

interface D1PreparedStatement {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{ results: T[] }>;
  };
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB?: D1Database;
  metagen_db?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  NEXT_PUBLIC_GOOGLE_CLIENT_ID?: string;
  GAS_PROXY_URL_1?: string;
  GAS_PROXY_URL_2?: string;
  GAS_PROXY_URL?: string;
  [key: string]: unknown;
}

interface D1UserRow {
  email: string;
  name: string;
  picture?: string | null;
  role: 'admin' | 'member' | 'user';
  status: 'active' | 'pending' | 'blocked';
  daily_quota: number;
  usage_count: number;
  quota_reset_date?: string | null;
  last_login?: string | null;
  created_at?: string | null;
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  sub?: string;
}

/**
 * Mengembalikan string tanggal 'YYYY-MM-DD' dalam zona waktu Indonesia (Asia/Jakarta / WIB)
 * Menjamin kuota ter-reset tepat jam 00:00 tengah malam waktu lokal.
 */
function getWibDateString(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const env = context.env || {};
  const db = env.DB || env.metagen_db;

  const EXPECTED_CLIENT_ID =
    env.GOOGLE_CLIENT_ID ||
    env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '61908502532-85bvlf6i8safupsefop9n3hflbodrthe.apps.googleusercontent.com';

  const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = (await context.request.json()) as {
      idToken?: string;
      action?: string;
      email?: string;
    };

    const { idToken, action = 'google_login', email } = body;

    // ══════════════════════════════════════════════════════════════
    // ACTION 1: GET USER STATUS & QUOTA
    // ══════════════════════════════════════════════════════════════
    if (action === 'get_user_status') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'Missing email parameter' }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Prioritas 1: Baca langsung dari Cloudflare D1 (latensi ~0.4ms)
      if (db) {
        try {
          const row = await db
            .prepare('SELECT * FROM users WHERE email = ?')
            .bind(cleanEmail)
            .first<D1UserRow>();

          if (row) {
            const now = new Date();
            const todayWib = getWibDateString(now);
            let currentUsage = row.usage_count || 0;
            let dateChanged = false;

            // Reset otomatis kuota harian jika tanggal lokal (Asia/Jakarta) telah berganti
            if (row.quota_reset_date) {
              if (row.quota_reset_date !== todayWib) {
                currentUsage = 0;
                dateChanged = true;
              }
            } else if (row.last_login) {
              const lastWib = getWibDateString(new Date(row.last_login));
              if (lastWib !== todayWib) {
                currentUsage = 0;
                dateChanged = true;
              }
            }

            if (dateChanged) {
              await db
                .prepare('UPDATE users SET usage_count = 0, quota_reset_date = ? WHERE email = ?')
                .bind(todayWib, cleanEmail)
                .run();
            }

            const dailyQuota = row.daily_quota || 100;
            const remaining = Math.max(0, dailyQuota - currentUsage);

            return new Response(
              JSON.stringify({
                ok: true,
                user: {
                  email: row.email,
                  name: row.name,
                  picture: row.picture || '',
                  role: row.role || 'user',
                  status: row.status || 'active',
                  dailyQuota,
                  usageCount: currentUsage,
                  remainingQuota: remaining,
                  lastLogin: row.last_login || '',
                  createdAt: row.created_at || '',
                },
                engine: 'Cloudflare D1 (Edge)',
              }),
              { headers: CORS_HEADERS }
            );
          }
        } catch (dbErr) {
          console.warn('[D1 Auth] D1 query error on get_user_status:', dbErr);
        }
      }

      // Fallback: Jika D1 belum menemukan atau belum terikat, cek fallback profil default
      return new Response(
        JSON.stringify({
          ok: true,
          user: {
            email: cleanEmail,
            name: cleanEmail.split('@')[0],
            role: 'user',
            status: 'active',
            dailyQuota: 100,
            usageCount: 0,
            remainingQuota: 100,
          },
        }),
        { headers: CORS_HEADERS }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION 2: GOOGLE SIGN-IN & TOKEN VERIFICATION
    // ══════════════════════════════════════════════════════════════
    if (!idToken) {
      return new Response(JSON.stringify({ error: 'Missing Google idToken' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // 1. Verifikasi tanda tangan token Google via official tokeninfo endpoint
    let googlePayload: GoogleTokenInfo | null = null;
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`
      );
      if (verifyRes.ok) {
        googlePayload = (await verifyRes.json()) as GoogleTokenInfo;
      }
    } catch (e) {
      console.warn('[Google Auth] Tokeninfo verification fetch error:', e);
    }

    if (!googlePayload || !googlePayload.email) {
      return new Response(JSON.stringify({ error: 'Token Google tidak valid atau sudah kadaluwarsa' }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    if (EXPECTED_CLIENT_ID && googlePayload.aud !== EXPECTED_CLIENT_ID) {
      return new Response(JSON.stringify({ error: 'Client ID tidak sesuai dengan aplikasi ini' }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    const userEmail = googlePayload.email.trim().toLowerCase();
    const userName = googlePayload.name || userEmail.split('@')[0];
    const userPicture = googlePayload.picture || '';

    // 2. Simpan dan perbarui profil ke Cloudflare D1
    if (db) {
      try {
        // Buat tabel otomatis jika belum ada (self-healing)
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY COLLATE NOCASE,
            name TEXT NOT NULL,
            picture TEXT,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            daily_quota INTEGER DEFAULT 100,
            usage_count INTEGER DEFAULT 0,
            quota_reset_date TEXT,
            last_login TEXT,
            created_at TEXT
          );
        `).bind().run();

        // Cari user yang sudah ada
        const existing = await db
          .prepare('SELECT * FROM users WHERE email = ?')
          .bind(userEmail)
          .first<D1UserRow>();

        const now = new Date();
        const nowIso = now.toISOString();
        const todayWib = getWibDateString(now);

        if (existing) {
          // Reset kuota otomatis jika tanggal lokal WIB (Asia/Jakarta) telah berganti
          let currentUsage = existing.usage_count || 0;
          if (existing.quota_reset_date) {
            if (existing.quota_reset_date !== todayWib) {
              currentUsage = 0;
            }
          } else if (existing.last_login) {
            const lastWib = getWibDateString(new Date(existing.last_login));
            if (lastWib !== todayWib) {
              currentUsage = 0;
            }
          }

          // Perbarui nama, foto, waktu login terakhir, quota_reset_date, dan kuota reset
          await db
            .prepare(`
              UPDATE users
              SET name = ?, picture = ?, last_login = ?, usage_count = ?, quota_reset_date = ?
              WHERE email = ?
            `)
            .bind(userName, userPicture, nowIso, currentUsage, todayWib, userEmail)
            .run();

          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                email: userEmail,
                name: userName,
                picture: userPicture,
                role: existing.role || 'user',
                status: existing.status || 'active',
                dailyQuota: existing.daily_quota || 100,
                usageCount: currentUsage,
                remainingQuota: Math.max(0, (existing.daily_quota || 100) - currentUsage),
                lastLogin: nowIso,
              },
              engine: 'Cloudflare D1 (Edge)',
            }),
            { headers: CORS_HEADERS }
          );
        } else {
          // Pengguna baru: Cek apakah user pertama atau email admin
          const totalUsers = await db
            .prepare('SELECT count(*) as count FROM users')
            .bind()
            .first<{ count: number }>();

          const isFirstUser = !totalUsers || totalUsers.count === 0;
          const isAdmin = isFirstUser || userEmail.includes('adobestpro') || userEmail.includes('aronisme');

          const initialRole = isAdmin ? 'admin' : 'user';
          const initialStatus = 'active'; // Default active agar langsung siap pakai
          const initialQuota = isAdmin ? 1000 : 100;

          await db
            .prepare(`
              INSERT INTO users (email, name, picture, role, status, daily_quota, usage_count, quota_reset_date, last_login, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            `)
            .bind(userEmail, userName, userPicture, initialRole, initialStatus, initialQuota, todayWib, nowIso, nowIso)
            .run();

          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                email: userEmail,
                name: userName,
                picture: userPicture,
                role: initialRole,
                status: initialStatus,
                dailyQuota: initialQuota,
                usageCount: 0,
                remainingQuota: initialQuota,
                lastLogin: nowIso,
              },
              engine: 'Cloudflare D1 (Edge - New User Created)',
            }),
            { headers: CORS_HEADERS }
          );
        }
      } catch (d1Err) {
        console.warn('[D1 Auth] D1 execution error, falling back to verified token payload:', d1Err);
      }
    }

    // 3. Fallback jika D1 sementara tidak terjangkau
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          email: userEmail,
          name: userName,
          picture: userPicture,
          role: 'user',
          status: 'active',
          dailyQuota: 100,
          usageCount: 0,
          remainingQuota: 100,
          lastLogin: new Date().toISOString(),
          isOfflineFallback: true,
        },
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
