// lib/ftp/client.ts
import { Readable } from 'stream';
import type { FtpAccountProfile, MicrostockAgencyId } from '@/lib/types';
import { sanitizeFtpHost } from '@/lib/ftp/store';

export interface FtpConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface FtpUploadResult {
  ok: boolean;
  remotePath: string;
  bytesUploaded: number;
  durationMs: number;
  error?: string;
}

/**
 * Menentukan direktori dan path remote berdasarkan agensi microstock dan ekstensi file.
 * Contoh khusus Dreamstime (instruksi resmi):
 * - Video (.mp4, .mov, dll.) -> folder /video
 * - Vektor / RAW (.ai, .eps, .cdr, .svg, dll.) -> folder /additional
 * - Audio (.wav, .flac, dll.) -> folder /audio
 * - Gambar / raster (.jpg, .jpeg, .png) -> folder root (/)
 */
export function getAgencyRemoteFolder(
  filename: string,
  agencyId?: MicrostockAgencyId | string,
  host?: string
): { remoteDir: string; remotePath: string; cleanFilename: string } {
  const cleanFilename = filename.replace(/^[/\\]+/, '');
  const ext = (cleanFilename.slice(cleanFilename.lastIndexOf('.')) || '').toLowerCase();

  const isDreamstime =
    agencyId === 'dreamstime' || (Boolean(host) && host!.toLowerCase().includes('dreamstime.com'));

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

  // Agensi lain (Adobe, Shutterstock, Vecteezy, Freepik, Pond5): root (/)
  return { remoteDir: '/', remotePath: `/${cleanFilename}`, cleanFilename };
}

/**
 * Menguji koneksi dan keabsahan kredensial ke server SFTP atau FTP target.
 */
export async function testFtpConnection(
  profile: Pick<FtpAccountProfile, 'host' | 'port' | 'protocol' | 'username' | 'password'>
): Promise<FtpConnectionTestResult> {
  const start = Date.now();
  const host = sanitizeFtpHost(profile.host);
  const port = Number(profile.port) || (profile.protocol === 'sftp' ? 22 : 21);
  const protocol = profile.protocol || 'sftp';
  const username = profile.username.trim();
  const password = profile.password;

  if (!host) {
    return { ok: false, message: 'Alamat host server tidak boleh kosong.' };
  }
  if (!username) {
    return { ok: false, message: 'Username kontributor tidak boleh kosong.' };
  }

  if (protocol === 'sftp') {
    // Gunakan ssh2-sftp-client untuk SFTP (SSH Port 22)
    const Client = (await import('ssh2-sftp-client')).default;
    const sftp = new Client();

    try {
      await sftp.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 20000,
        retries: 1,
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

      // Uji coba baca direktori root
      await sftp.cwd();
      await sftp.end();

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message: `Koneksi SFTP berhasil terhubung ke ${host}:${port} (${latencyMs}ms). Kredensial valid.`,
        latencyMs,
      };
    } catch (err: unknown) {
      try { await sftp.end(); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Gagal tersambung ke SFTP (${host}:${port}): ${msg}`,
      };
    }
  } else {
    // Gunakan basic-ftp untuk FTP / FTPS (Port 21)
    const ftp = await import('basic-ftp');
    const client = new ftp.Client(20000);

    try {
      await client.access({
        host,
        port,
        user: username,
        password,
        secure: protocol === 'ftps',
        secureOptions: { rejectUnauthorized: false }, // Fleksibel untuk server agensi dengan cert chain
      });

      await client.pwd();
      client.close();

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message: `Koneksi ${protocol.toUpperCase()} berhasil terhubung ke ${host}:${port} (${latencyMs}ms). Kredensial valid.`,
        latencyMs,
      };
    } catch (err: unknown) {
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
 * Mengunggah buffer data file langsung ke server SFTP atau FTP target.
 * Secara otomatis memetakan subfolder agensi (seperti /video atau /additional pada Dreamstime).
 */
export async function uploadFileToFtp(
  profile: Pick<FtpAccountProfile, 'host' | 'port' | 'protocol' | 'username' | 'password'> & {
    agencyId?: MicrostockAgencyId | string;
  },
  buffer: Buffer,
  remoteFilename: string
): Promise<FtpUploadResult> {
  const start = Date.now();
  const host = sanitizeFtpHost(profile.host);
  const port = Number(profile.port) || (profile.protocol === 'sftp' ? 22 : 21);
  const protocol = profile.protocol || 'sftp';
  const username = profile.username.trim();
  const password = profile.password;

  // Auto-routing folder target (misal /video untuk file video di Dreamstime)
  const { remoteDir, remotePath, cleanFilename } = getAgencyRemoteFolder(
    remoteFilename,
    profile.agencyId,
    host
  );

  if (protocol === 'sftp') {
    const Client = (await import('ssh2-sftp-client')).default;
    const sftp = new Client();

    try {
      await sftp.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 30000,
        retries: 2,
        retry_factor: 2,
        retry_minTimeout: 2000,
      });

      if (remoteDir !== '/') {
        try {
          await sftp.mkdir(remoteDir, true);
        } catch {
          // Abaikan jika folder sudah ada atau izin mkdir dibatasi
        }
      }

      // Upload buffer langsung via memory stream
      await sftp.put(buffer, remotePath);
      await sftp.end();

      const durationMs = Date.now() - start;
      return {
        ok: true,
        remotePath,
        bytesUploaded: buffer.length,
        durationMs,
      };
    } catch (err: unknown) {
      try { await sftp.end(); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        remotePath,
        bytesUploaded: 0,
        durationMs: Date.now() - start,
        error: `SFTP upload gagal: ${msg}`,
      };
    }
  } else {
    const ftp = await import('basic-ftp');
    const client = new ftp.Client(30000);

    try {
      await client.access({
        host,
        port,
        user: username,
        password,
        secure: protocol === 'ftps',
        secureOptions: { rejectUnauthorized: false },
      });

      if (remoteDir !== '/') {
        try {
          await client.ensureDir(remoteDir);
        } catch (dirErr) {
          try {
            await client.cd(remoteDir);
          } catch {
            console.warn(`[FTP Client] Tidak dapat berpindah ke folder ${remoteDir}:`, dirErr);
          }
        }
      }

      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, cleanFilename);
      client.close();

      const durationMs = Date.now() - start;
      return {
        ok: true,
        remotePath,
        bytesUploaded: buffer.length,
        durationMs,
      };
    } catch (err: unknown) {
      client.close();
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        remotePath,
        bytesUploaded: 0,
        durationMs: Date.now() - start,
        error: `${protocol.toUpperCase()} upload gagal: ${msg}`,
      };
    }
  }
}

