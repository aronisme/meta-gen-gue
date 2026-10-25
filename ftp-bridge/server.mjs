// ftp-bridge/server.mjs
/**
 * MetaGen Local FTP Bridge
 * Server backend lokal independen untuk pengunggahan file microstock via FTP/SFTP.
 * Berjalan di port 45678 untuk melayani web app MetaGen (Cloudflare Pages atau Local).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { embedMetadataInFile } from './embed.mjs';
import { getExifToolStatus, embedMetadataSmart } from './exiftool-wrapper.mjs';

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
 * Mencari path file lokal di disk secara cerdas:
 * 1. Path absolut yang ada
 * 2. Di dalam folder Downloads/MetaGen_Flow (termasuk seluruh subfolder sesi)
 * 3. Di dalam Downloads, Desktop, dan Pictures
 */
function resolveLocalFilePath(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Jika path absolut dan file ada di disk
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    try {
      if (fs.statSync(trimmed).isFile()) return trimmed;
    } catch {}
  }

  const filename = path.basename(trimmed);
  const userHome = os.homedir();

  // 2. Cari di dalam folder Downloads/MetaGen_Flow (dan subfoldernya)
  const flowRootDir = path.join(userHome, 'Downloads', 'MetaGen_Flow');
  if (fs.existsSync(flowRootDir)) {
    try {
      const direct = path.join(flowRootDir, filename);
      if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

      const entries = fs.readdirSync(flowRootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(flowRootDir, entry.name, filename);
          if (fs.existsSync(subPath) && fs.statSync(subPath).isFile()) return subPath;
        }
      }
    } catch {}
  }

  // 3. Cari di Downloads
  const dlPath = path.join(userHome, 'Downloads', filename);
  if (fs.existsSync(dlPath) && fs.statSync(dlPath).isFile()) return dlPath;

  // 4. Cari di Desktop
  const deskPath = path.join(userHome, 'Desktop', filename);
  if (fs.existsSync(deskPath) && fs.statSync(deskPath).isFile()) return deskPath;

  // 5. Cari di Pictures
  const picsPath = path.join(userHome, 'Pictures', filename);
  if (fs.existsSync(picsPath) && fs.statSync(picsPath).isFile()) return picsPath;

  return null;
}

/**
 * Menyelesaikan path direktori tujuan pemindahan/penyalinan file (QC Passed)
 */
function resolveTargetDirectory(inputTarget) {
  const userHome = os.homedir();
  if (!inputTarget || typeof inputTarget !== 'string' || inputTarget.trim() === '') {
    return path.join(userHome, 'Downloads', 'MetaGen_QC_Passed');
  }

  const trimmed = inputTarget.trim();
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  // Jika nama folder relatif (misal "MetaGen_QC_Passed" atau "Adobe_Stock_Ready")
  return path.join(userHome, 'Downloads', trimmed);
}

/**
 * Pindahkan atau salin file fisik lokal dengan penanganan lintas partisi (cross-device EXDEV)
 */
function moveOrCopyLocalFile(sourcePath, destPath, operation = 'move') {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (operation === 'copy') {
    fs.copyFileSync(sourcePath, destPath);
    return;
  }

  // Operasi MOVE
  try {
    fs.renameSync(sourcePath, destPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    } else {
      throw err;
    }
  }
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

// Map pelacak progres byte transfer aktif per uploadId
const activeTransfers = new Map();

/**
 * Mengunggah file buffer ke FTP/SFTP dengan dukungan Persistent Session Pool, Concurrency Slot, & Real-Time Byte Tracking
 */
async function uploadFileToFtp(profile, buffer, remoteFilename, slotIndex = 0, uploadId = null) {
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

  const totalBytes = buffer.length;
  let lastLogTime = Date.now();

  const reportProgress = (transferred) => {
    const pct = Math.min(99, Math.round((transferred / totalBytes) * 100));
    const elapsed = Math.max(0.2, (Date.now() - start) / 1000);
    const speedKBs = transferred / 1024 / elapsed;
    const speedStr = speedKBs > 1024 ? `${(speedKBs / 1024).toFixed(1)} MB/s` : `${Math.round(speedKBs)} KB/s`;

    if (uploadId) {
      activeTransfers.set(uploadId, {
        uploadId,
        filename: cleanFilename,
        bytesUploaded: transferred,
        totalBytes,
        percent: pct,
        speed: speedStr,
        slotIndex,
        phase: 'remote-transfer',
        lastUpdate: Date.now(),
      });
    }

    if (Date.now() - lastLogTime > 2500) {
      lastLogTime = Date.now();
      log(
        'TRANSFER',
        `[Slot #${slotIndex}] ${cleanFilename}: ${pct}% (${(transferred / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB @ ${speedStr})`,
        c.cyan
      );
    }
  };

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

          // Transfer data buffer ke remote path dengan stream progress tracking
          const { Transform } = await import('stream');
          let sftpTransferred = 0;
          const progressStream = new Transform({
            transform(chunk, encoding, callback) {
              sftpTransferred += chunk.length;
              reportProgress(sftpTransferred);
              callback(null, chunk);
            },
          });

          const sourceStream = Readable.from(buffer);
          sourceStream.pipe(progressStream);

          await entry.client.put(progressStream, remotePath, {
            writeStreamOptions: {
              highWaterMark: 64 * 1024,
            },
          });

          if (uploadId) {
            activeTransfers.set(uploadId, {
              uploadId,
              filename: cleanFilename,
              bytesUploaded: totalBytes,
              totalBytes,
              percent: 100,
              speed: 'Selesai',
              slotIndex,
              phase: 'completed',
              lastUpdate: Date.now(),
            });
            setTimeout(() => activeTransfers.delete(uploadId), 15000);
          }

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

          entry.client.trackProgress((info) => {
            reportProgress(info.bytes);
          });
          const stream = Readable.from(buffer);
          await entry.client.uploadFrom(stream, cleanFilename);
          entry.client.trackProgress(); // unregister

          if (uploadId) {
            activeTransfers.set(uploadId, {
              uploadId,
              filename: cleanFilename,
              bytesUploaded: totalBytes,
              totalBytes,
              percent: 100,
              speed: 'Selesai',
              slotIndex,
              phase: 'completed',
              lastUpdate: Date.now(),
            });
            setTimeout(() => activeTransfers.delete(uploadId), 15000);
          }

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

  // 1. Health check & status endpoint
  if (
    req.method === 'GET' &&
    (pathname === '/' ||
      pathname === '/health' ||
      pathname === '/api/health' ||
      pathname === '/status' ||
      pathname === '/api/status')
  ) {
    const exifStatus = getExifToolStatus();
    const healthData = {
      ok: true,
      service: 'metagen-ftp-bridge',
      version: '1.2.0',
      port: PORT,
      status: 'ready',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: Date.now(),
      exiftool: {
        available: exifStatus.available,
        version: exifStatus.version,
        engine: exifStatus.engine,
        supportedFormats: exifStatus.supportedFormats,
      },
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
      const filePath = formData.get('filePath');
      const configStr = formData.get('config');
      const remoteFilename =
        formData.get('remoteFilename') || file?.name || (filePath ? path.basename(filePath) : '');
      const metadataStr = formData.get('metadata');
      const shouldEmbed = formData.get('embedMetadata') !== 'false';

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

      let buffer;
      let effectiveFilePath = null;

      if (file && typeof file.arrayBuffer === 'function') {
        const arrayBuf = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (filePath && typeof filePath === 'string' && filePath.trim()) {
        effectiveFilePath = resolveLocalFilePath(filePath.trim());
        if (!effectiveFilePath || !fs.existsSync(effectiveFilePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: `File fisik tidak ditemukan di disk lokal: ${filePath}`,
            })
          );
          return;
        }
        buffer = await fs.promises.readFile(effectiveFilePath);
        log(
          'UPLOAD',
          `[Slot #${slotIndex}] Membaca file langsung dari disk: ${effectiveFilePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
          c.cyan
        );
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Tidak ada file fisik atau path lokal yang dikirim untuk diunggah.',
          })
        );
        return;
      }

      let isEmbedded = false;
      let embeddedFormat = null;
      let metadataEngine = 'none';

      if (shouldEmbed && metadataStr) {
        try {
          const metadata = JSON.parse(metadataStr);
          const ext = (path.extname(remoteFilename || '') || '').toLowerCase();
          const embedRes = await embedMetadataSmart(buffer, remoteFilename, metadata);
          if (embedRes && embedRes.ok && embedRes.buffer) {
            buffer = Buffer.from(embedRes.buffer);
            isEmbedded = Boolean(embedRes.embedded);
            metadataEngine = embedRes.engine || 'unknown';
            embeddedFormat = ext.replace('.', '').toUpperCase();
            if (isEmbedded) {
              log(
                'EMBED',
                `[Slot #${slotIndex}] Metadata disematkan ke ${remoteFilename} via ${metadataEngine.toUpperCase()} (${embeddedFormat}): "${(metadata.title || '').slice(0, 30)}..."`,
                c.magenta
              );
            } else if (embedRes.warning) {
              log('EMBED NOTICE', `[Slot #${slotIndex}] ${embedRes.warning}`, c.yellow);
            }
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

      const uploadId = formData.get('uploadId') || null;

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
        slotIndex,
        uploadId
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
          metadataEngine,
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

  // 3.5 Progress Query endpoint (Polling real-time transfer stats per uploadId)
  if (req.method === 'GET' && (pathname === '/api/ftp/progress' || pathname === '/progress')) {
    const qId = url.searchParams.get('id');
    if (!qId) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, activeTransfers: Array.from(activeTransfers.values()) }));
      return;
    }
    const item = activeTransfers.get(qId) || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, progress: item }));
    return;
  }

  // 4. Standalone Metadata Embed endpoint (Lossless ExifTool / JS injection tanpa upload)
  if (req.method === 'POST' && (pathname === '/api/metadata/embed' || pathname === '/embed')) {
    try {
      const webReq = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req,
        duplex: 'half',
      });

      const formData = await webReq.formData();
      const file = formData.get('file');
      const filename = formData.get('filename') || file?.name || 'asset.jpg';
      const metadataStr = formData.get('metadata');

      if (!file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Tidak ada file yang dikirim.' }));
        return;
      }

      let metadata = {};
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch {}
      }

      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const embedRes = await embedMetadataSmart(buffer, filename, metadata);

      if (!embedRes.ok && embedRes.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: embedRes.error }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'X-Metadata-Engine': embedRes.engine || 'unknown',
        'X-Metadata-Embedded': String(Boolean(embedRes.embedded)),
      });
      res.end(embedRes.buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  // 5. Local Asset Discovery: Pindai Folder Unduhan Google Flow (Downloads/MetaGen_Flow)
  if (req.method === 'GET' && (pathname === '/api/local/scan-flow-downloads' || pathname === '/scan-flow-downloads')) {
    try {
      const flowRootDir = path.join(os.homedir(), 'Downloads', 'MetaGen_Flow');

      if (!fs.existsSync(flowRootDir)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, flowRootDir, sessions: [], files: [] }));
        return;
      }

      const reqSession = url.searchParams.get('sessionFolder')?.trim();
      const entries = fs.readdirSync(flowRootDir, { withFileTypes: true });
      const sessionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const targetSessions = reqSession && sessionDirs.includes(reqSession)
        ? [reqSession]
        : sessionDirs;

      const sessionsSummary = [];
      const discoveredFiles = [];

      for (const sName of sessionDirs) {
        const sPath = path.join(flowRootDir, sName);
        let sFiles = [];
        try {
          sFiles = fs.readdirSync(sPath, { withFileTypes: true })
            .filter((f) => f.isFile() && /\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(f.name));
        } catch {}

        sessionsSummary.push({
          sessionFolder: sName,
          count: sFiles.length,
          mtime: fs.statSync(sPath).mtimeMs,
        });

        // Kumpulkan detail file jika termasuk target
        if (targetSessions.includes(sName)) {
          for (const f of sFiles) {
            const fPath = path.join(sPath, f.name);
            const stat = fs.statSync(fPath);
            const is2K = f.name.includes('_2K_') || f.name.toLowerCase().includes('2k');
            const is4K = f.name.includes('_4K_') || f.name.toLowerCase().includes('4k');

            discoveredFiles.push({
              filename: f.name,
              fullPath: fPath,
              sessionFolder: sName,
              sizeBytes: stat.size,
              lastModified: stat.mtimeMs,
              resolutionTag: is4K ? '4K' : is2K ? '2K' : '1K',
              streamUrl: `http://127.0.0.1:${PORT}/api/local/file?path=${encodeURIComponent(fPath)}`,
            });
          }
        }
      }

      // Urutkan file: yang terbaru di paling atas
      discoveredFiles.sort((a, b) => b.lastModified - a.lastModified);
      sessionsSummary.sort((a, b) => b.mtime - a.mtime);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        flowRootDir,
        sessions: sessionsSummary,
        files: discoveredFiles,
      }));
    } catch (err) {
      log('LOCAL_SCAN', `Gagal memindai unduhan Flow: ${err.message}`, c.red);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 6. Local Media Streamer: Sajikan file langsung ke browser UI (<img> / fetch blob)
  if (req.method === 'GET' && (pathname === '/api/local/file' || pathname === '/local-file')) {
    const rawPath = url.searchParams.get('path');
    if (!rawPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Parameter path wajib disertakan.' }));
      return;
    }

    try {
      const targetPath = path.resolve(rawPath);
      const userHome = os.homedir();

      // Keamanan path traversal: Pastikan path berada dalam ruang folder pengguna
      if (!targetPath.toLowerCase().startsWith(userHome.toLowerCase())) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Akses ditolak: Path di luar direktori pengguna.' }));
        return;
      }

      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'File tidak ditemukan di disk lokal.' }));
        return;
      }

      const stat = fs.statSync(targetPath);
      const ext = path.extname(targetPath).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';

      // Dukungan HTTP Range header (berguna untuk scrubbing video/audio)
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(targetPath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(targetPath).pipe(res);
      }
    } catch (err) {
      log('LOCAL_FILE', `Gagal streaming file lokal: ${err.message}`, c.red);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 6.5. Local File Resolver: Temukan path absolut file berdasarkan nama atau path parsial
  if (req.method === 'GET' && (pathname === '/api/local/find-file' || pathname === '/find-file')) {
    const filename = url.searchParams.get('filename') || url.searchParams.get('name') || url.searchParams.get('path');
    if (!filename) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Parameter filename wajib disertakan.' }));
      return;
    }

    try {
      const resolved = resolveLocalFilePath(filename);
      if (resolved && fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            found: true,
            fullPath: resolved,
            filename: path.basename(resolved),
            sizeBytes: stat.size,
            lastModified: stat.mtimeMs,
          })
        );
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, found: false }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 7. QC Passed Organizer: Pindahkan atau salin file yang lolos QC ke folder tujuan lokal
  if (req.method === 'POST' && (pathname === '/api/local/organize-qc' || pathname === '/organize-qc' || pathname === '/api/local/move-qc-passed')) {
    const contentType = req.headers['content-type'] || '';

    // A. Multipart Form-Data (jika browser mengirim file fisik secara langsung)
    if (contentType.includes('multipart/form-data')) {
      try {
        const webReq = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: req,
          duplex: 'half',
        });

        const formData = await webReq.formData();
        const file = formData.get('file');
        const filename = formData.get('filename') || file?.name || 'asset.jpg';
        const targetFolder = formData.get('targetFolder') || 'MetaGen_QC_Passed';
        const resolvedTargetDir = resolveTargetDirectory(targetFolder);

        if (!fs.existsSync(resolvedTargetDir)) {
          fs.mkdirSync(resolvedTargetDir, { recursive: true });
        }

        if (!file) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Tidak ada file fisik yang dikirim.' }));
          return;
        }

        const destPath = path.join(resolvedTargetDir, filename);
        const arrayBuf = await file.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(arrayBuf));

        log('QC ORGANIZE', `File "${filename}" berhasil disimpan ke: ${destPath}`, c.green);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          targetDir: resolvedTargetDir,
          destPath,
          filename,
        }));
      } catch (err) {
        log('QC ORGANIZE ERROR', err.message, c.red);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // B. JSON Body: Pindahkan/Salin file yang sudah ada di disk lokal
    let bodyText = '';
    req.on('data', (chunk) => { bodyText += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyText || '{}');
        const targetFolder = body.targetFolder || 'MetaGen_QC_Passed';
        const operation = body.operation === 'copy' ? 'copy' : 'move'; // default move
        const items = Array.isArray(body.items) ? body.items : [];

        if (items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Daftar file (items) kosong.' }));
          return;
        }

        const resolvedTargetDir = resolveTargetDirectory(targetFolder);
        if (!fs.existsSync(resolvedTargetDir)) {
          fs.mkdirSync(resolvedTargetDir, { recursive: true });
        }

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const item of items) {
          const filename = typeof item === 'string' ? item : item.filename;
          const explicitPath = typeof item === 'object' ? item.filePath : null;

          // Cari path file lokal di disk
          let sourcePath = null;
          if (explicitPath && fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
            sourcePath = explicitPath;
          } else {
            sourcePath = resolveLocalFilePath(filename);
          }

          if (!sourcePath) {
            results.push({
              filename,
              success: false,
              error: 'File fisik tidak ditemukan di disk lokal (Downloads, Desktop, Pictures, Flow).',
            });
            failCount++;
            continue;
          }

          try {
            const destPath = path.join(resolvedTargetDir, path.basename(sourcePath));
            moveOrCopyLocalFile(sourcePath, destPath, operation);
            results.push({
              filename,
              success: true,
              sourcePath,
              destPath,
              operation,
            });
            successCount++;
          } catch (fileErr) {
            results.push({
              filename,
              success: false,
              error: fileErr.message,
            });
            failCount++;
          }
        }

        log(
          'QC ORGANIZE',
          `Selesai: ${successCount} file berhasil di-${operation} ke "${resolvedTargetDir}" (${failCount} gagal/tidak ditemukan).`,
          c.green
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          operation,
          targetDir: resolvedTargetDir,
          total: items.length,
          successCount,
          failCount,
          results,
        }));
      } catch (err) {
        log('QC ORGANIZE ERROR', err.message, c.red);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 8. Open Folder in Explorer endpoint
  if (req.method === 'POST' && (pathname === '/api/local/open-folder' || pathname === '/open-folder')) {
    let bodyText = '';
    req.on('data', (chunk) => { bodyText += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyText || '{}');
        const folderPath = resolveTargetDirectory(body.folderPath || body.targetFolder || 'MetaGen_QC_Passed');

        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const isWin = process.platform === 'win32';
        if (isWin) {
          exec(`explorer "${folderPath}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${folderPath}"`);
        } else {
          exec(`xdg-open "${folderPath}"`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, folderPath }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
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
  const exifStatus = getExifToolStatus();
  const exifDisplay = exifStatus.available
    ? `${c.green}● Ready (v${exifStatus.version}) - Full Image, Vector, & Video Support${c.reset}`
    : `${c.yellow}○ Fallback Engine (Native JS Buffer untuk JPG/PNG saja)${c.reset}`;

  console.log(`
${c.cyan}================================================================${c.reset}
  ${c.bright}${c.green}🚀 MetaGen Local FTP Bridge v1.2.0 (ExifTool Edition) is running!${c.reset}
${c.cyan}================================================================${c.reset}
  ${c.bright}Port:${c.reset}        ${PORT}
  ${c.bright}Local URL:${c.reset}   http://127.0.0.1:${PORT}
  ${c.bright}Health:${c.reset}      http://127.0.0.1:${PORT}/health
  ${c.bright}Status:${c.reset}      ${c.green}● Ready & Listening with Keep-Alive Session Pool${c.reset}
  ${c.bright}Exif Engine:${c.reset} ${exifDisplay}

  ${c.yellow}💡 Info:${c.reset}
  - Biarkan jendela terminal ini tetap terbuka saat mengunggah file.
  - Sesi koneksi SFTP/FTPS dipertahankan (Keep-Alive) untuk kecepatan maksimal.
  - Mendukung transfer multi-worker (paralel 2-3 stream) tanpa reconnect berulang.
  - Metadata IPTC/XMP/QuickTime disematkan langsung sebelum file terunggah.
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
