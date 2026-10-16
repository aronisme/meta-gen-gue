// functions/api/sync.ts
// Cloudflare Pages Function for Automatic Edge Syncing with Cloudflare D1

interface D1Database {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      all: <T>() => Promise<{ results: T[] }>;
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
  batch: (statements: unknown[]) => Promise<unknown[]>;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context: { request: Request; env: Record<string, unknown> }): Promise<Response> {
  try {
    const db = (context.env.DB || context.env.metagen_db) as D1Database | undefined;
    if (!db || typeof db.prepare !== 'function') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Database D1 tidak terikat pada lingkungan Cloudflare.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const body = (await context.request.json()) as {
      action: 'pull' | 'push_batch' | 'delete_history';
      userEmail?: string;
      historyItems?: Array<{
        id: string;
        filename?: string;
        title?: string;
        description?: string;
        keywords?: string;
        category?: string;
        shutterstockCategory?: string;
        illustration?: boolean;
        aiModel?: string;
        createdAt?: string;
        sessionId?: string;
      }>;
      sessions?: Array<{
        id: string;
        name: string;
        fileCount?: number;
        createdAt: string;
      }>;
      ftpAccounts?: Array<{
        id: string;
        agencyId: string;
        accountName: string;
        host: string;
        port?: number;
        protocol?: string;
        username: string;
        password?: string;
        isActive?: boolean;
        createdAt?: string;
      }>;
      uploadLedger?: Array<{
        id: string;
        fileHash: string;
        filename: string;
        agencyId: string;
        status?: string;
        uploadedAt: string;
      }>;
      settings?: {
        provider?: string;
        model?: string;
        fileType?: string;
        titleLength?: number;
        descriptionLength?: number;
        keywordsCount?: number;
        extraInstructions?: string;
      };
      ids?: string[];
    };

    const userEmail = body.userEmail?.trim().toLowerCase();
    if (!userEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Identitas userEmail diperlukan untuk sinkronisasi.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. ACTION: PULL (Tarik semua data cloud milik user)
    if (body.action === 'pull') {
      const [historyRows, sessionRows, accountRows, ledgerRows, settingsRow] = await Promise.all([
        db
          .prepare(
            'SELECT id, session_id as sessionId, filename, title, description, keywords, category, shutterstock_category as shutterstockCategory, is_illustration as illustration, ai_model as aiModel, created_at as createdAt FROM metadata_history WHERE LOWER(user_email) = ? ORDER BY created_at DESC LIMIT 500'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, name, file_count as fileCount, created_at as createdAt FROM generation_sessions WHERE LOWER(user_email) = ? ORDER BY created_at DESC LIMIT 100'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, agency_id as agencyId, account_name as accountName, host, port, protocol, username, password, is_active as isActive, created_at as createdAt FROM ftp_accounts WHERE LOWER(user_email) = ? ORDER BY created_at DESC'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, file_hash as fileHash, filename, agency_id as agencyId, status, uploaded_at as uploadedAt FROM upload_ledger WHERE LOWER(user_email) = ? ORDER BY uploaded_at DESC LIMIT 1000'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT provider, model, file_type as fileType, title_length as titleLength, description_length as descriptionLength, keywords_count as keywordsCount, extra_instructions as extraInstructions FROM user_settings WHERE LOWER(user_email) = ?'
          )
          .bind(userEmail)
          .first(),
      ]);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            history: historyRows.results || [],
            sessions: sessionRows.results || [],
            ftpAccounts: accountRows.results || [],
            uploadLedger: ledgerRows.results || [],
            settings: settingsRow || null,
          },
        }),
        { headers: CORS_HEADERS }
      );
    }

    // 2. ACTION: PUSH_BATCH (Simpan data baru/update dari browser ke D1)
    if (body.action === 'push_batch') {
      // Upsert History Items
      if (body.historyItems && body.historyItems.length > 0) {
        for (const item of body.historyItems) {
          if (!item.id || !item.title) continue;
          await db
            .prepare(
              `INSERT INTO metadata_history (id, user_email, session_id, filename, title, description, keywords, category, shutterstock_category, is_illustration, ai_model, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 description = excluded.description,
                 keywords = excluded.keywords,
                 category = excluded.category,
                 shutterstock_category = excluded.shutterstock_category,
                 is_illustration = excluded.is_illustration;`
            )
            .bind(
              item.id,
              userEmail,
              item.sessionId || null,
              item.filename || 'asset.jpg',
              item.title,
              item.description || item.title,
              item.keywords || '',
              item.category || null,
              item.shutterstockCategory || null,
              item.illustration ? 1 : 0,
              item.aiModel || null,
              item.createdAt || new Date().toISOString()
            )
            .run();
        }
      }

      // Upsert Sessions
      if (body.sessions && body.sessions.length > 0) {
        for (const ses of body.sessions) {
          if (!ses.id || !ses.name) continue;
          await db
            .prepare(
              `INSERT INTO generation_sessions (id, user_email, name, file_count, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 file_count = excluded.file_count;`
            )
            .bind(ses.id, userEmail, ses.name, ses.fileCount || 0, ses.createdAt || new Date().toISOString())
            .run();
        }
      }

      // Upsert FTP Accounts
      if (body.ftpAccounts && body.ftpAccounts.length > 0) {
        for (const acc of body.ftpAccounts) {
          if (!acc.id || !acc.host || !acc.username) continue;
          await db
            .prepare(
              `INSERT INTO ftp_accounts (id, user_email, agency_id, account_name, host, port, protocol, username, password, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 agency_id = excluded.agency_id,
                 account_name = excluded.account_name,
                 host = excluded.host,
                 port = excluded.port,
                 protocol = excluded.protocol,
                 username = excluded.username,
                 password = excluded.password,
                 is_active = excluded.is_active;`
            )
            .bind(
              acc.id,
              userEmail,
              acc.agencyId || 'other',
              acc.accountName || acc.username,
              acc.host,
              acc.port || 22,
              acc.protocol || 'sftp',
              acc.username,
              acc.password || '',
              acc.isActive !== false ? 1 : 0,
              acc.createdAt || new Date().toISOString()
            )
            .run();
        }
      }

      // Upsert Upload Ledger
      if (body.uploadLedger && body.uploadLedger.length > 0) {
        for (const rec of body.uploadLedger) {
          if (!rec.id || !rec.fileHash) continue;
          await db
            .prepare(
              `INSERT OR IGNORE INTO upload_ledger (id, user_email, file_hash, filename, agency_id, status, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?);`
            )
            .bind(
              rec.id,
              userEmail,
              rec.fileHash,
              rec.filename || 'asset.jpg',
              rec.agencyId || 'adobe',
              rec.status || 'success',
              rec.uploadedAt || new Date().toISOString()
            )
            .run();
        }
      }

      // Upsert User Settings
      if (body.settings) {
        const s = body.settings;
        await db
          .prepare(
            `INSERT INTO user_settings (user_email, provider, model, file_type, title_length, description_length, keywords_count, extra_instructions, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(user_email) DO UPDATE SET
               provider = excluded.provider,
               model = excluded.model,
               file_type = excluded.file_type,
               title_length = excluded.title_length,
               description_length = excluded.description_length,
               keywords_count = excluded.keywords_count,
               extra_instructions = excluded.extra_instructions,
               updated_at = datetime('now');`
          )
          .bind(
            userEmail,
            s.provider || 'gas-proxy',
            s.model || 'gemini-2.5-flash',
            s.fileType || 'auto',
            s.titleLength || 120,
            s.descriptionLength || 60,
            s.keywordsCount || 35,
            s.extraInstructions || ''
          )
          .run();
      }

      return new Response(JSON.stringify({ ok: true, synced: true }), { headers: CORS_HEADERS });
    }

    // 3. ACTION: DELETE_HISTORY
    if (body.action === 'delete_history' && body.ids && body.ids.length > 0) {
      for (const id of body.ids) {
        await db
          .prepare('DELETE FROM metadata_history WHERE LOWER(user_email) = ? AND id = ?')
          .bind(userEmail, id)
          .run();
      }
      return new Response(JSON.stringify({ ok: true, deletedCount: body.ids.length }), { headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Aksi sinkronisasi tidak valid.' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Cloudflare D1 Sync Error]:', err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
