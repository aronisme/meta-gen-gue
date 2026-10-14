# Current Project State

## Last Updated
2026-10-14 23:15

## Current Objective
MetaGen Creator Suite v1.0.0 live di Cloudflare Pages (https://meta-gen-gue.pages.dev) terintegrasi dengan MetaGen Local FTP Bridge di port 45678 untuk upload microstock skala besar tanpa batas payload/timeout, auto-start Windows permanen, dan background queue persistence.

## Completed Recently
- **Cloudflare Pages Deployment & Static Export Pipeline**:
  - Dideploy live ke `https://meta-gen-gue.pages.dev` via `scripts/build-pages.mjs` dan Cloudflare Wrangler.
- **Local FTP Bridge (Port 45678) & Credential Recovery**:
  - Server mandiri `ftp-bridge/server.mjs` (SFTP/FTP client, ExifTool embed, health endpoint, PNA/CORS).
  - Berhasil mengekstrak 6 akun FTP dari Edge LevelDB dan mensinkronisasikannya via `/api/ftp/profiles`.
- **Background Upload & Keep-Alive Tab Navigation**:
  - Navigasi tab di `app/page.tsx` diubah ke CSS `block`/`hidden` (komponen tidak di-unmount saat pindah tab).
  - Antrean upload di `FtpQueueView.tsx` tetap berjalan di latar belakang dengan indikator live di tab, side rail, dan floating pill.
- **Permanent Windows Auto-Start & Global CLI Tool**:
  - `ftp-bridge/run-hidden.vbs` & `install-autostart.bat` untuk eksekusi senyap di latar belakang tiap PC menyala.
  - Perintah global `metagen-bridge` (status, install, start, stop, uninstall) via `npm link`.
  - Installer 1-baris langsung dari GitHub: `irm https://raw.githubusercontent.com/aronisme/meta-gen-gue/main/install.ps1 | iex`.

## Currently Working On
- Sistem stabil dan aktif di latar belakang (port 45678, status ready).
- Menunggu kebutuhan penyesuaian atau fitur baru dari pengguna di sesi berikutnya.

## Remaining Tasks
- Pengujian batch upload gambar/video volume besar secara langsung ke akun contributor Adobe Stock / Dreamstime.
- Penambahan agensi FTP tambahan jika diperlukan di masa depan.

## Blockers / Errors
- None.

## Files Recently Changed
- `app/page.tsx`
- `components/FtpQueueView.tsx`
- `components/AppSideRail.tsx`
- `ftp-bridge/server.mjs`
- `ftp-bridge/cli.mjs`
- `ftp-bridge/run-hidden.vbs`
- `install.ps1`
- `install-autostart.bat`
- `uninstall-autostart.bat`
- `check-status.bat`
- `package.json`

## Next Recommended Step
- Akses `https://meta-gen-gue.pages.dev` untuk memproses metadata dan mengunggah aset microstock.
- Periksa status bridge kapan saja di terminal via perintah `metagen-bridge status`.
