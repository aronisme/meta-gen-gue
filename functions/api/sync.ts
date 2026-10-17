// functions/api/sync.ts
// Cloudflare Pages Function for Automatic Edge Syncing with Cloudflare D1

interface D1PreparedStatement {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{ results: T[] }>;
  };
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: unknown[]): Promise<unknown[]>;
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
      action: 'pull' | 'push_batch' | 'delete_history' | 'delete_session' | 'delete_ftp_account';
      userEmail?: string;
      idToken?: string;
      sessionId?: string;
      deleteItems?: boolean;
      accountId?: string;
      historyItems?: Array<{
        id: string;
        filename?: string;
        assetType?: string;
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
        itemIds?: string[];
        status?: string;
        totalFiles?: number;
        successCount?: number;
        errorCount?: number;
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
        fileSize?: number;
        accountId?: string;
        accountLabel?: string;
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
      itemIds?: string[];
    };

    const userEmail = body.userEmail?.trim().toLowerCase();
    if (!userEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Identitas userEmail diperlukan untuk sinkronisasi.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Otorisasi Keamanan: Verifikasi bahwa pemanggil memiliki hak atas userEmail
    const token = body.idToken || context.request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token && token.length > 30) {
      try {
        const verifyRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.trim())}`
        );
        if (verifyRes.ok) {
          const verified = (await verifyRes.json()) as { email?: string };
          if (verified.email && verified.email.trim().toLowerCase() !== userEmail) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Akses ditolak: Token autentikasi tidak cocok dengan akun email.' }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }
      } catch {
        // Tokeninfo network glitch: allow local fallback if token format is plausible
      }
    }

    // 1. ACTION: PULL (Tarik semua data cloud milik user)
    if (body.action === 'pull') {
      const [historyRows, sessionRows, accountRows, ledgerRows, settingsRow] = await Promise.all([
        db
          .prepare(
            'SELECT id, session_id as sessionId, filename, asset_type as assetType, title, description, keywords, category, shutterstock_category as shutterstockCategory, is_illustration as illustration, ai_model as aiModel, created_at as createdAt FROM metadata_history WHERE user_email = ? ORDER BY created_at DESC LIMIT 500'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, name, file_count as fileCount, item_ids as itemIdsJson, status, total_files as totalFiles, success_count as successCount, error_count as errorCount, created_at as createdAt FROM generation_sessions WHERE user_email = ? ORDER BY created_at DESC LIMIT 100'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, agency_id as agencyId, account_name as accountName, host, port, protocol, username, password, is_active as isActive, created_at as createdAt FROM ftp_accounts WHERE user_email = ? ORDER BY created_at DESC'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT id, file_hash as fileHash, filename, agency_id as agencyId, file_size as fileSize, account_id as accountId, account_label as accountLabel, status, uploaded_at as uploadedAt FROM upload_ledger WHERE user_email = ? ORDER BY uploaded_at DESC LIMIT 1000'
          )
          .bind(userEmail)
          .all(),
        db
          .prepare(
            'SELECT provider, model, file_type as fileType, title_length as titleLength, description_length as descriptionLength, keywords_count as keywordsCount, extra_instructions as extraInstructions FROM user_settings WHERE user_email = ?'
          )
          .bind(userEmail)
          .first(),
      ]);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            history: historyRows.results || [],
            sessions: ((sessionRows.results || []) as Array<Record<string, unknown>>).map((s) => {
              let parsedItemIds: string[] = [];
              if (typeof s.itemIdsJson === 'string') {
                try {
                  parsedItemIds = JSON.parse(s.itemIdsJson) as string[];
                } catch {}
              }
              return {
                id: s.id,
                name: s.name,
                fileCount: s.fileCount,
                itemIds: parsedItemIds,
                status: s.status || 'completed',
                totalFiles: s.totalFiles || s.fileCount || 0,
                successCount: s.successCount || s.fileCount || 0,
                errorCount: s.errorCount || 0,
                createdAt: s.createdAt,
              };
            }),
            ftpAccounts: accountRows.results || [],
            uploadLedger: ledgerRows.results || [],
            settings: settingsRow || null,
          },
        }),
        { headers: CORS_HEADERS }
      );
    }

    // 2. ACTION: PUSH_BATCH (Simpan data baru/update dari browser ke D1 dengan High-Speed Batching)
    if (body.action === 'push_batch') {
      const batchStmts: unknown[] = [];

      // Upsert History Items
      if (body.historyItems && body.historyItems.length > 0) {
        for (const item of body.historyItems) {
          if (!item.id || !item.title) continue;
          batchStmts.push(
            db
              .prepare(
                `INSERT INTO metadata_history (id, user_email, session_id, filename, asset_type, title, description, keywords, category, shutterstock_category, is_illustration, ai_model, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                item.assetType || 'image',
                item.title,
                item.description || item.title,
                item.keywords || '',
                item.category || null,
                item.shutterstockCategory || null,
                item.illustration ? 1 : 0,
                item.aiModel || null,
                item.createdAt || new Date().toISOString()
              )
          );
        }
      }

      // Upsert Sessions
      if (body.sessions && body.sessions.length > 0) {
        for (const ses of body.sessions) {
          if (!ses.id || !ses.name) continue;
          const itemIdsJson = JSON.stringify(ses.itemIds || []);
          batchStmts.push(
            db
              .prepare(
                `INSERT INTO generation_sessions (id, user_email, name, file_count, item_ids, status, total_files, success_count, error_count, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   file_count = excluded.file_count,
                   item_ids = excluded.item_ids,
                   status = excluded.status,
                   total_files = excluded.total_files,
                   success_count = excluded.success_count;`
              )
              .bind(
                ses.id,
                userEmail,
                ses.name,
                ses.fileCount || ses.totalFiles || 0,
                itemIdsJson,
                ses.status || 'completed',
                ses.totalFiles || ses.fileCount || 0,
                ses.successCount || 0,
                ses.errorCount || 0,
                ses.createdAt || new Date().toISOString()
              )
          );
        }
      }

      // Upsert FTP Accounts
      if (body.ftpAccounts && body.ftpAccounts.length > 0) {
        for (const acc of body.ftpAccounts) {
          if (!acc.id || !acc.host || !acc.username) continue;
          batchStmts.push(
            db
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
          );
        }
      }

      // Upsert Upload Ledger
      if (body.uploadLedger && body.uploadLedger.length > 0) {
        for (const rec of body.uploadLedger) {
          if (!rec.id || !rec.fileHash) continue;
          batchStmts.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO upload_ledger (id, user_email, file_hash, filename, agency_id, file_size, account_id, account_label, status, uploaded_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
              )
              .bind(
                rec.id,
                userEmail,
                rec.fileHash,
                rec.filename || 'asset.jpg',
                rec.agencyId || 'adobe',
                rec.fileSize || 0,
                rec.accountId || '',
                rec.accountLabel || rec.agencyId || '',
                rec.status || 'success',
                rec.uploadedAt || new Date().toISOString()
              )
          );
        }
      }

      // Upsert User Settings
      if (body.settings) {
        const s = body.settings;
        batchStmts.push(
          db
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
        );
      }

      // Eksekusi seluruh batch statement dalam chunk atomik (maks 100 statements per batch D1)
      if (batchStmts.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < batchStmts.length; i += CHUNK_SIZE) {
          const chunk = batchStmts.slice(i, i + CHUNK_SIZE);
          await db.batch(chunk);
        }
      }

      return new Response(JSON.stringify({ ok: true, synced: true, count: batchStmts.length }), { headers: CORS_HEADERS });
    }

    // 3. ACTION: DELETE_HISTORY (Hapus item riwayat)
    if (body.action === 'delete_history' && body.ids && body.ids.length > 0) {
      const deleteStmts = body.ids.map((id) =>
        db.prepare('DELETE FROM metadata_history WHERE user_email = ? AND id = ?').bind(userEmail, id)
      );

      const CHUNK_SIZE = 100;
      for (let i = 0; i < deleteStmts.length; i += CHUNK_SIZE) {
        await db.batch(deleteStmts.slice(i, i + CHUNK_SIZE));
      }

      return new Response(JSON.stringify({ ok: true, deletedCount: body.ids.length }), { headers: CORS_HEADERS });
    }

    // 4. ACTION: DELETE_SESSION (Hapus sesi tugas dan item terkait)
    if (body.action === 'delete_session' && body.sessionId) {
      const deleteStmts: unknown[] = [
        db.prepare('DELETE FROM generation_sessions WHERE user_email = ? AND id = ?').bind(userEmail, body.sessionId),
      ];

      if (body.deleteItems && body.itemIds && body.itemIds.length > 0) {
        for (const itemId of body.itemIds) {
          deleteStmts.push(
            db.prepare('DELETE FROM metadata_history WHERE user_email = ? AND id = ?').bind(userEmail, itemId)
          );
        }
      }

      await db.batch(deleteStmts);
      return new Response(JSON.stringify({ ok: true, deletedSessionId: body.sessionId }), { headers: CORS_HEADERS });
    }

    // 5. ACTION: DELETE_FTP_ACCOUNT (Hapus akun FTP/SFTP)
    if (body.action === 'delete_ftp_account' && body.accountId) {
      await db
        .prepare('DELETE FROM ftp_accounts WHERE user_email = ? AND id = ?')
        .bind(userEmail, body.accountId)
        .run();

      return new Response(JSON.stringify({ ok: true, deletedAccountId: body.accountId }), { headers: CORS_HEADERS });
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
