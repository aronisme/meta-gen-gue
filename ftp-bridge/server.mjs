// ftp-bridge/server.mjs
/**
 * MetaGen Local FTP Bridge
 * Server backend lokal independen untuk pengunggahan file microstock via FTP/SFTP.
 * Berjalan di port 45678 untuk melayani web app MetaGen (Cloudflare Pages atau Local).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { embedMetadataInFile } from './embed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '45678', 10);
const HOST = '0.0.0.0'; // Dengarkan di semua interface lokal (127.0.0.1 & localhost)

// ANSI color codes untuk terminal
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

function log(tag, message, color = c.cyan) {
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  console.log(`${c.gray}[${time}]${c.reset} ${color}${c.bright}[${tag}]${c.reset} ${message}`);
}

/**
 * Membersihkan hostname dari sftp://, ftp://, port dsb.
 */
function sanitizeFtpHost(rawHost) {
  if (!rawHost) return '';
  let host = String(rawHost).trim();
  host = host.replace(/^[a-zA-Z0-9]+:\/\//, '');
  host = host.split('/')[0];
  host = host.split(':')[0];
  return host.trim();
}

/**
 * Menentukan remote subfolder (misal khusus Dreamstime /video)
 */
function getAgencyRemoteFolder(filename, agencyId, host) {
  const cleanFilename = filename.replace(/^[/\\]+/, '');
  const ext = (cleanFilename.slice(cleanFilename.lastIndexOf('.')) || '').toLowerCase();

  const isDreamstime =
    agencyId === 'dreamstime' || (Boolean(host) && host.toLowerCase().includes('dreamstime.com'));

  if (isDreamstime) {
    if (['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'].includes(ext)) {
      return { remoteDir: '/video', remotePath: `/video/${cleanFilename}`, cleanFilename };
    }
    if (['.ai', '.eps', '.cdr', '.svg', '.raw', '.cr2', '.nef', '.arw', '.dng'].includes(ext)) {
      return { remoteDir: '/additional', remotePath: `/additional/${cleanFilename}`, cleanFilename };
    }
    if (['.wav', '.flac', '.mp3', '.aac', '.aiff'].includes(ext)) {
      return { remoteDir: '/audio', remotePath: `/audio/${cleanFilename}`, cleanFilename };
    }
    return { remoteDir: '/', remotePath: `/${cleanFilename}`, cleanFilename };
  }

  return { remoteDir: '/', remotePath: `/${cleanFilename}`, cleanFilename };
}

/**
 * Menguji koneksi FTP/SFTP
 */
async function testFtpConnection(profile) {
  const start = Date.now();
  const host = sanitizeFtpHost(profile.host);
  const port = Number(profile.port) || (profile.protocol === 'sftp' ? 22 : 21);
  const protocol = profile.protocol || 'sftp';
  const username = (profile.username || '').trim();
  const password = profile.password || '';

  if (!host) {
    return { ok: false, message: 'Alamat host server tidak boleh kosong.' };
  }
  if (!username) {
    return { ok: false, message: 'Username kontributor tidak boleh kosong.' };
  }

  if (protocol === 'sftp') {
    const Client = (await import('ssh2-sftp-client')).default;
    const sftp = new Client();

    try {
      await sftp.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 20000,
        retries: 2,
        keepaliveInterval: 10000,
        keepaliveCountMax: 5,
        algorithms: {
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
          ],
        },
      });

      await sftp.cwd();
      await sftp.end();

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message: `Koneksi SFTP berhasil terhubung ke ${host}:${port} (${latencyMs}ms). Kredensial valid.`,
        latencyMs,
      };
    } catch (err) {
      try { await sftp.end(); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Gagal tersambung ke SFTP (${host}:${port}): ${msg}`,
      };
    }
  } else {
    const ftp = await import('basic-ftp');
    const client = new ftp.Client(20000);

    try {
      await client.access({
        host,
        port,
        user: username,
        password,
        secure: protocol === 'ftps',
        secureOptions: { rejectUnauthorized: false },
      });

      await client.pwd();
      client.close();

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message: `Koneksi ${protocol.toUpperCase()} berhasil terhubung ke ${host}:${port} (${latencyMs}ms). Kredensial valid.`,
        latencyMs,
      };
    } catch (err) {
      client.close();
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Gagal tersambung ke ${protocol.toUpperCase()} (${host}:${port}): ${msg}`,
      };
    }
  }
}

/**
 * Simple Mutex Lock untuk mencegah bentrok transfer paralel di slot koneksi yang sama.
 */
class SlotMutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }
  async acquire() {
    if (!this._locked) {
      this._locked = true;
      return () => this._release();
    }
    return new Promise((resolve) => {
      this._queue.push(resolve);
    }).then(() => () => this._release());
  }
  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
    }
  }
}

/**
 * Connection Session Pool untuk Keep-Alive SFTP & FTPS
 */
const sessionPool = new Map();
const IDLE_TIMEOUT_MS = 60000; // 60 detik idle timeout sebelum koneksi ditutup otomatis

function getSessionPoolKey(profile, slotIndex = 0) {
  const host = sanitizeFtpHost(profile.host);
  const port = Number(profile.port) || (profile.protocol === 'sftp' ? 22 : 21);
  const protocol = profile.protocol || 'sftp';
  const username = (profile.username || '').trim();
  return `${protocol}://${username}@${host}:${port}#slot_${slotIndex}`;
}

async function closePoolEntry(poolKey) {
  const entry = sessionPool.get(poolKey);
  if (!entry) return;
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  entry.connected = false;
  const client = entry.client;
  entry.client = null;
  sessionPool.delete(poolKey);

  if (client) {
    try {
      if (entry.protocol === 'sftp') {
        await client.end();
      } else {
        client.close();
      }
    } catch {}
  }
  log('POOL-CLOSE', `Sesi koneksi ${poolKey} ditutup (idle/cleanup).`, c.gray);
}

async function closeAllPoolSessions() {
  const keys = Array.from(sessionPool.keys());
  for (const k of keys) {
    await closePoolEntry(k);
  }
}

/**
 * Mengunggah file buffer ke FTP/SFTP dengan dukungan Persistent Session Pool & Concurrency Slot
 */
async function uploadFileToFtp(profile, buffer, remoteFilename, slotIndex = 0) {
  const start = Date.now();
  const host = sanitizeFtpHost(profile.host);
  const port = Number(profile.port) || (profile.protocol === 'sftp' ? 22 : 21);
  const protocol = profile.protocol || 'sftp';
  const username = (profile.username || '').trim();
  const password = profile.password || '';

  const { remoteDir, remotePath, cleanFilename } = getAgencyRemoteFolder(
    remoteFilename,
    profile.agencyId,
    host
  );

  const poolKey = getSessionPoolKey(profile, slotIndex);
  let entry = sessionPool.get(poolKey);
  if (!entry) {
    entry = {
      mutex: new SlotMutex(),
      client: null,
      protocol,
      connected: false,
      idleTimer: null,
      createdDirs: new Set(),
    };
    sessionPool.set(poolKey, entry);
  }

  // Lindungi eksekusi dengan slot mutex
  const releaseLock = await entry.mutex.acquire();

  // Reset idle timer saat ada upload aktif
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  try {
    if (protocol === 'sftp') {
      const Client = (await import('ssh2-sftp-client')).default;
      const sftpConfig = {
        host,
        port,
        username,
        password,
        readyTimeout: 40000,
        retries: 2,
        retry_factor: 2,
        retry_minTimeout: 2000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 5,
        algorithms: {
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
          ],
        },
      };

      const maxAttempts = 2;
      let lastErr = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Buka koneksi baru jika belum terhubung atau terputus
          if (!entry.client || !entry.connected) {
            log(
              'SFTP-CONN',
              `[Slot #${slotIndex}] Membuka sesi SFTP baru ke ${host}:${port}...`,
              c.cyan
            );
            const client = new Client();
            client.on('error', (err) => {
              log('SFTP-ERR', `[Slot #${slotIndex}] Socket error: ${err.message}`, c.yellow);
              entry.connected = false;
            });
            client.on('end', () => {
              entry.connected = false;
            });
            client.on('close', () => {
              entry.connected = false;
            });

            await client.connect(sftpConfig);
            entry.client = client;
            entry.connected = true;
            entry.createdDirs = new Set();
            log('SFTP-CONN OK', `[Slot #${slotIndex}] Sesi SFTP terotentikasi & siap digunakan.`, c.green);
          } else {
            log(
              'SFTP-REUSE',
              `[Slot #${slotIndex}] Menggunakan kembali sesi aktif SFTP (hemat ~1.5s handshake)`,
              c.green
            );
          }

          if (remoteDir !== '/' && !entry.createdDirs.has(remoteDir)) {
            try {
              await entry.client.mkdir(remoteDir, true);
              entry.createdDirs.add(remoteDir);
            } catch {
              entry.createdDirs.add(remoteDir);
            }
          }

          // Transfer data buffer ke remote path dengan stream buffer teroptimasi 64KB
          await entry.client.put(buffer, remotePath, {
            writeStreamOptions: {
              highWaterMark: 64 * 1024,
            },
          });

          // Jadwalkan idle timeout (60 detik) untuk menutup koneksi jika tidak ada aktivitas lanjutan
          entry.idleTimer = setTimeout(() => {
            void closePoolEntry(poolKey);
          }, IDLE_TIMEOUT_MS);

          const durationMs = Date.now() - start;
          return {
            ok: true,
            remotePath,
            bytesUploaded: buffer.length,
            durationMs,
            slotIndex,
          };
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          log(
            'SFTP-ERR',
            `[Slot #${slotIndex}] Kesalahan upload (attempt ${attempt}/${maxAttempts}): ${msg}`,
            c.yellow
          );

          // Bersihkan client yang rusak
          if (entry.client) {
            try {
              await entry.client.end();
            } catch {}
            entry.client = null;
          }
          entry.connected = false;

          if (attempt < maxAttempts) {
            log(
              'SFTP-RETRY',
              `[Slot #${slotIndex}] Mencoba menghubungkan ulang otomatis...`,
              c.yellow
            );
            await new Promise((res) => setTimeout(res, 1000));
            continue;
          }
        }
      }

      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      return {
        ok: false,
        remotePath,
        bytesUploaded: 0,
        durationMs: Date.now() - start,
        error: `SFTP upload gagal: ${msg}`,
        slotIndex,
      };
    } else {
      // FTP / FTPS via basic-ftp
      const ftp = await import('basic-ftp');
      const maxAttempts = 2;
      let lastErr = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (!entry.client || entry.client.closed || !entry.connected) {
            log(
              'FTP-CONN',
              `[Slot #${slotIndex}] Membuka sesi ${protocol.toUpperCase()} baru ke ${host}:${port}...`,
              c.cyan
            );
            const client = new ftp.Client(35000);
            await client.access({
              host,
              port,
              user: username,
              password,
              secure: protocol === 'ftps',
              secureOptions: { rejectUnauthorized: false },
            });
            entry.client = client;
            entry.connected = true;
            entry.createdDirs = new Set();
            log('FTP-CONN OK', `[Slot #${slotIndex}] Sesi ${protocol.toUpperCase()} terhubung.`, c.green);
          } else {
            log(
              'FTP-REUSE',
              `[Slot #${slotIndex}] Menggunakan kembali sesi aktif ${protocol.toUpperCase()} (hemat ~1.5s)`,
              c.green
            );
          }

          if (!entry.currentDir) entry.currentDir = '/';
          if (entry.currentDir !== remoteDir) {
            if (remoteDir !== '/') {
              try {
                await entry.client.ensureDir(remoteDir);
              } catch {
                try {
                  await entry.client.cd(remoteDir);
                } catch {}
              }
            } else {
              try {
                await entry.client.cd('/');
              } catch {}
            }
            entry.currentDir = remoteDir;
          }

          const stream = Readable.from(buffer);
          await entry.client.uploadFrom(stream, cleanFilename);

          // Jadwalkan idle timeout
          entry.idleTimer = setTimeout(() => {
            void closePoolEntry(poolKey);
          }, IDLE_TIMEOUT_MS);

          const durationMs = Date.now() - start;
          return {
            ok: true,
            remotePath,
            bytesUploaded: buffer.length,
            durationMs,
            slotIndex,
          };
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          log(
            'FTP-ERR',
            `[Slot #${slotIndex}] Kesalahan ${protocol.toUpperCase()} (attempt ${attempt}/${maxAttempts}): ${msg}`,
            c.yellow
          );

          if (entry.client) {
            try {
              entry.client.close();
            } catch {}
            entry.client = null;
          }
          entry.connected = false;

          if (attempt < maxAttempts) {
            log(
              'FTP-RETRY',
              `[Slot #${slotIndex}] Mencoba menghubungkan ulang ${protocol.toUpperCase()}...`,
              c.yellow
            );
            await new Promise((res) => setTimeout(res, 1000));
            continue;
          }
        }
      }

      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      return {
        ok: false,
        remotePath,
        bytesUploaded: 0,
        durationMs: Date.now() - start,
        error: `${protocol.toUpperCase()} upload gagal: ${msg}`,
        slotIndex,
      };
    }
  } finally {
    releaseLock();
  }
}

// Handler request HTTP
const server = http.createServer(async (req, res) => {
  // Atur header CORS dan Private Network Access (PNA)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  // Handle Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // 1. Health check endpoint
  if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/api/health')) {
    const healthData = {
      ok: true,
      service: 'metagen-ftp-bridge',
      version: '1.0.0',
      port: PORT,
      status: 'ready',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: Date.now(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthData));
    return;
  }

  // 1.5 Profiles persistence endpoint (Syncs accounts across domains/origins with user-level isolation)
  if (pathname === '/api/ftp/profiles' || pathname === '/profiles') {
    const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

    if (req.method === 'GET') {
      try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
          const content = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
          const allProfiles = JSON.parse(content || '[]');
          const reqUserEmail = url.searchParams.get('userEmail')?.trim().toLowerCase();

          if (reqUserEmail) {
            // Filter hanya profil yang secara spesifik dimiliki oleh userEmail
            const filtered = allProfiles.filter((p) => {
              const pEmail = p.userEmail?.trim().toLowerCase();
              if (pEmail) return pEmail === reqUserEmail;
              // Profil legacy tanpa email hanya dikembalikan jika peminta adalah admin utama
              return reqUserEmail === 'sr7aron@gmail.com';
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
          } else {
            // Jika tanpa identitas userEmail, kembalikan daftar kosong demi keamanan multi-tenant
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
          }
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
      return;
    }

    if (req.method === 'POST') {
      let bodyText = '';
      req.on('data', (chunk) => { bodyText += chunk; });
      req.on('end', () => {
        try {
          const incoming = JSON.parse(bodyText || '[]');
          const reqUserEmail = url.searchParams.get('userEmail')?.trim().toLowerCase();

          let existing = [];
          if (fs.existsSync(ACCOUNTS_FILE)) {
            try {
              existing = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8') || '[]');
            } catch {}
          }

          let updatedList;
          if (reqUserEmail) {
            const taggedIncoming = incoming.map((item) => ({ ...item, userEmail: reqUserEmail }));
            const others = existing.filter((item) => {
              const itemEmail = item.userEmail?.trim().toLowerCase();
              return itemEmail && itemEmail !== reqUserEmail;
            });
            updatedList = [...others, ...taggedIncoming];
          } else {
            updatedList = incoming;
          }

          fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(updatedList, null, 2), 'utf-8');
          log('PROFILES', `Menyimpan ${updatedList.length} profil akun FTP ke accounts.json (User: ${reqUserEmail || 'all'})`, c.green);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, count: updatedList.length }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      });
      return;
    }
  }

  // 2. Test FTP Connection endpoint
  if (req.method === 'POST' && (pathname === '/api/ftp/test' || pathname === '/test')) {
    let bodyText = '';
    req.on('data', (chunk) => {
      bodyText += chunk;
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyText || '{}');
        log('TEST', `Menguji koneksi ke ${body.host}:${body.port || 22} (${body.username})...`, c.yellow);

        const result = await testFtpConnection({
          host: body.host,
          port: Number(body.port) || (body.protocol === 'sftp' ? 22 : 21),
          protocol: body.protocol || 'sftp',
          username: body.username,
          password: body.password,
        });

        if (result.ok) {
          log('TEST OK', result.message, c.green);
          res.writeHead(200, { 'Content-Type': 'application/json' });
        } else {
          log('TEST FAIL', result.message, c.red);
          res.writeHead(400, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify(result));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('TEST ERROR', msg, c.red);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: `Server bridge error: ${msg}` }));
      }
    });
    return;
  }

  // 2.5 Disconnect All Sessions endpoint (Membersihkan sesi aktif di pool saat antrean selesai/dibatalkan)
  if (req.method === 'POST' && (pathname === '/api/ftp/disconnect-all' || pathname === '/disconnect-all')) {
    try {
      await closeAllPoolSessions();
      log('POOL', 'Semua sesi koneksi pool FTP/SFTP berhasil dibersihkan.', c.green);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Semua koneksi sesi pool berhasil ditutup.' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  // 3. Upload File endpoint
  if (req.method === 'POST' && (pathname === '/api/ftp/upload' || pathname === '/upload')) {
    try {
      // Gunakan native Web Request untuk mengurai multipart form data
      const webReq = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req,
        duplex: 'half',
      });

      const formData = await webReq.formData();
      const file = formData.get('file');
      const configStr = formData.get('config');
      const remoteFilename = formData.get('remoteFilename') || file?.name || '';
      const metadataStr = formData.get('metadata');
      const shouldEmbed = formData.get('embedMetadata') !== 'false';

      if (!file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Tidak ada file yang dikirim untuk diunggah.' }));
        return;
      }

      if (!configStr) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Konfigurasi akun FTP/SFTP tidak ditemukan.' }));
        return;
      }

      let config;
      try {
        config = JSON.parse(configStr);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Format konfigurasi akun FTP tidak valid.' }));
        return;
      }

      const slotIndex = Number(config.slotIndex) || 0;

      const arrayBuf = await file.arrayBuffer();
      let buffer = Buffer.from(arrayBuf);

      let isEmbedded = false;
      let embeddedFormat = null;

      if (shouldEmbed && metadataStr) {
        try {
          const metadata = JSON.parse(metadataStr);
          const ext = remoteFilename.toLowerCase().slice(remoteFilename.lastIndexOf('.'));
          if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
            const originalLen = buffer.length;
            buffer = Buffer.from(embedMetadataInFile(buffer, remoteFilename, metadata));
            isEmbedded = buffer.length !== originalLen;
            embeddedFormat = ext.replace('.', '').toUpperCase();
            log(
              'EMBED',
              `[Slot #${slotIndex}] Metadata disematkan ke ${remoteFilename} (${embeddedFormat}): "${(metadata.title || '').slice(0, 30)}..."`,
              c.magenta
            );
          }
        } catch (embedErr) {
          log('EMBED WARN', `[Slot #${slotIndex}] Gagal menyematkan metadata, mengunggah file original: ${embedErr}`, c.yellow);
        }
      }

      const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
      log(
        'UPLOAD',
        `[Slot #${slotIndex}] Mengunggah "${remoteFilename}" (${sizeMb} MB) ke ${config.protocol || 'sftp'}://${config.host}:${config.port || 22}...`,
        c.cyan
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
        remoteFilename,
        slotIndex
      );

      if (!result.ok) {
        log('UPLOAD FAIL', `[Slot #${slotIndex}] Gagal mengunggah ${remoteFilename}: ${result.error}`, c.red);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      const speedSec = (result.durationMs / 1000).toFixed(1);
      const speedMBs = (buffer.length / (1024 * 1024) / Math.max(0.1, result.durationMs / 1000)).toFixed(1);
      log(
        'UPLOAD OK',
        `[Slot #${slotIndex}] Sukses: "${remoteFilename}" terkirim ke ${result.remotePath} (${speedSec}s @ ${speedMBs} MB/s)`,
        c.green
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ...result,
          metadataEmbedded: isEmbedded,
          embeddedFormat,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('UPLOAD ERROR', msg, c.red);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Bridge upload error: ${msg}` }));
    }
    return;
  }

  // Route not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: `Endpoint tidak ditemukan: ${pathname}` }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log('INFO', `Port ${PORT} sudah digunakan oleh proses lain (mungkin bridge sudah aktif di latar belakang).`, c.yellow);
    process.exit(0);
  } else {
    log('ERROR', `Server bridge error: ${err.message}`, c.red);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`
${c.cyan}================================================================${c.reset}
  ${c.bright}${c.green}🚀 MetaGen Local FTP Bridge v1.1.0 (Session Pool Edition) is running!${c.reset}
${c.cyan}================================================================${c.reset}
  ${c.bright}Port:${c.reset}        ${PORT}
  ${c.bright}Local URL:${c.reset}   http://127.0.0.1:${PORT}
  ${c.bright}Health:${c.reset}      http://127.0.0.1:${PORT}/health
  ${c.bright}Status:${c.reset}      ${c.green}● Ready & Listening with Keep-Alive Session Pool${c.reset}

  ${c.yellow}💡 Info:${c.reset}
  - Biarkan jendela terminal ini tetap terbuka saat mengunggah file.
  - Sesi koneksi SFTP/FTPS dipertahankan (Keep-Alive) untuk kecepatan maksimal.
  - Mendukung transfer multi-worker (paralel 2-3 stream) tanpa reconnect berulang.
${c.cyan}================================================================${c.reset}
`);
});

// Tangani shutdown graceful
process.on('SIGINT', async () => {
  log('STOP', 'Menghentikan MetaGen Local FTP Bridge...', c.yellow);
  await closeAllPoolSessions();
  server.close(() => {
    log('STOP', 'Bridge dihentikan.', c.gray);
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await closeAllPoolSessions();
  server.close(() => {
    process.exit(0);
  });
});
