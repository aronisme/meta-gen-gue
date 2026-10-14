#!/usr/bin/env node

/**
 * MetaGen Local FTP Bridge CLI
 * Tool baris perintah global untuk mengelola backend FTP lokal MetaGen.
 *
 * Perintah:
 *   metagen-bridge              - Cek status atau jalankan bridge
 *   metagen-bridge start        - Jalankan bridge di foreground (dengan log live)
 *   metagen-bridge install      - Pasang auto-start permanen di latar belakang (tiap PC nyala)
 *   metagen-bridge uninstall    - Hapus auto-start permanen
 *   metagen-bridge status       - Cek apakah bridge sedang aktif di port 45678
 *   metagen-bridge stop         - Hentikan bridge yang sedang berjalan
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

const PORT = 45678;
const STARTUP_DIR = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup'
);
const VBS_TARGET = path.join(STARTUP_DIR, 'MetaGen-FTP-Bridge.vbs');

const args = process.argv.slice(2);
const command = (args[0] || '').toLowerCase();

// Helper ANSI colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

async function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, data: parsed });
        } catch {
          resolve({ ok: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
}

function stopRunningProcess() {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue; if ($conn) { $pidToKill = $conn.OwningProcess | Select-Object -Unique; Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue; $pidToKill }"`
    ).toString().trim();
    return output;
  } catch {
    return null;
  }
}

async function handleStatus() {
  const health = await checkHealth();
  if (health.ok) {
    const uptime = health.data?.uptimeSec || 0;
    const mins = Math.floor(uptime / 60);
    const secs = uptime % 60;
    console.log(`
${c.green}${c.bright}● MetaGen Local FTP Bridge AKTIF${c.reset}
  ${c.gray}Status:${c.reset}     Ready di port ${c.cyan}${PORT}${c.reset}
  ${c.gray}Uptime:${c.reset}     ${mins} menit ${secs} detik
  ${c.gray}Health:${c.reset}     http://127.0.0.1:${PORT}/health
  ${c.gray}Auto-Start:${c.reset} ${fs.existsSync(VBS_TARGET) ? c.green + 'Terpasang di Startup Windows' + c.reset : c.yellow + 'Belum dipasang (opsional: metagen-bridge install)' + c.reset}
`);
  } else {
    console.log(`
${c.red}${c.bright}○ MetaGen Local FTP Bridge TIDAK AKTIF (Offline)${c.reset}
  Port ${PORT} belum mendengarkan.
  - Untuk menjalankan:  ${c.cyan}metagen-bridge start${c.reset}
  - Untuk auto-start:   ${c.cyan}metagen-bridge install${c.reset}
`);
  }
}

async function handleInstall() {
  console.log(`\n${c.cyan}Memasang MetaGen FTP Bridge ke Startup Windows...${c.reset}`);

  const vbsContent = [
    `' MetaGen Local FTP Bridge - AutoStart Runner`,
    `Set WshShell = CreateObject("WScript.Shell")`,
    `WshShell.CurrentDirectory = "${rootDir.replace(/\\/g, '\\\\')}"`,
    `WshShell.Run "node ftp-bridge/server.mjs", 0, False`,
  ].join('\r\n');

  try {
    fs.mkdirSync(STARTUP_DIR, { recursive: true });
    fs.writeFileSync(VBS_TARGET, vbsContent, 'utf-8');
    console.log(`${c.green}✔ File auto-start berhasil dibuat di:${c.reset}`);
    console.log(`  ${VBS_TARGET}`);

    // Cek apakah sudah running
    const health = await checkHealth();
    if (!health.ok) {
      console.log(`${c.yellow}Memulai proses di latar belakang sekarang...${c.reset}`);
      execSync(`wscript.exe "${VBS_TARGET}"`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log(`
${c.green}${c.bright}================================================================${c.reset}
  ${c.green}✔ BERHASIL DIPASANG SECARA PERMANEN!${c.reset}
  Bridge akan otomatis aktif di latar belakang setiap PC dinyalakan.
  Web app ${c.cyan}https://meta-gen-gue.pages.dev${c.reset} sudah siap dipakai.
${c.green}${c.bright}================================================================${c.reset}
`);
  } catch (err) {
    console.error(`${c.red}Gagal memasang auto-start: ${err.message}${c.reset}`);
  }
}

async function handleUninstall() {
  console.log(`\n${c.yellow}Menghapus auto-start MetaGen FTP Bridge...${c.reset}`);

  if (fs.existsSync(VBS_TARGET)) {
    try {
      fs.unlinkSync(VBS_TARGET);
      console.log(`${c.green}✔ File auto-start berhasil dihapus dari Startup Windows.${c.reset}`);
    } catch (err) {
      console.error(`${c.red}Gagal menghapus file VBS: ${err.message}${c.reset}`);
    }
  } else {
    console.log(`${c.gray}File auto-start tidak ditemukan di Startup Windows.${c.reset}`);
  }

  const pid = stopRunningProcess();
  if (pid) {
    console.log(`${c.green}✔ Proses Bridge (PID: ${pid}) telah dihentikan.${c.reset}`);
  } else {
    console.log(`${c.gray}Tidak ada proses Bridge yang berjalan.${c.reset}`);
  }

  console.log(`\n${c.green}Selesai. Auto-start telah dinonaktifkan.${c.reset}\n`);
}

async function handleStop() {
  console.log(`${c.yellow}Menghentikan MetaGen FTP Bridge...${c.reset}`);
  const pid = stopRunningProcess();
  if (pid) {
    console.log(`${c.green}✔ Bridge (PID ${pid}) berhasil dihentikan.${c.reset}`);
  } else {
    console.log(`${c.gray}Bridge memang sedang tidak berjalan.${c.reset}`);
  }
}

async function main() {
  switch (command) {
    case 'start':
    case 'run': {
      // Jalankan server di foreground
      const serverPath = path.join(__dirname, 'server.mjs');
      await import(`file://${serverPath.replace(/\\/g, '/')}`);
      break;
    }

    case 'install':
    case 'autostart':
    case 'enable':
      await handleInstall();
      break;

    case 'uninstall':
    case 'disable':
    case 'remove':
      await handleUninstall();
      break;

    case 'stop':
    case 'kill':
      await handleStop();
      break;

    case 'status':
      await handleStatus();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
${c.bright}MetaGen Local FTP Bridge CLI${c.reset}

${c.yellow}Penggunaan:${c.reset}
  metagen-bridge [perintah]

${c.yellow}Daftar Perintah:${c.reset}
  ${c.green}install${c.reset}      Pasang auto-start permanen (otomatis aktif saat Windows dinyalakan)
  ${c.green}status${c.reset}       Cek status koneksi dan port 45678
  ${c.green}start${c.reset}        Jalankan bridge di terminal dengan log live
  ${c.green}stop${c.reset}         Hentikan proses bridge yang sedang berjalan
  ${c.green}uninstall${c.reset}    Hapus auto-start permanen dari Windows
  ${c.green}help${c.reset}         Tampilkan panduan bantuan ini
`);
      break;

    default: {
      // Jika dipanggil tanpa argumen: cek status
      const health = await checkHealth();
      if (health.ok) {
        await handleStatus();
      } else {
        // Tawarkan petunjuk praktis
        console.log(`
${c.bright}🚀 MetaGen Local FTP Bridge CLI${c.reset}

  ${c.yellow}Perintah cepat:${c.reset}
    metagen-bridge install    -> Pasang auto-start permanen (rekomendasi)
    metagen-bridge start      -> Jalankan di terminal saat ini
    metagen-bridge status     -> Cek status port & koneksi
    metagen-bridge stop       -> Matikan bridge
`);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
