# Current Project State

## Last Updated
2026-10-16 17:22

## Current Objective
Penyempurnaan performa batch upload FTP/SFTP dengan Keep-Alive Session Pool, Controlled Multi-Worker Concurrency, dan validasi operasional lintas agensi microstock.

## Completed Recently
- **Optimasi Batch Upload FTP/SFTP**:
  - Implementasi **Persistent Connection Session Pool** di `ftp-bridge/server.mjs`:
    - Keep-Alive sesi aktif SFTP (`ssh2-sftp-client`) & FTPS (`basic-ftp`) tanpa handshake berulang.
    - Slot-based Concurrency dengan `SlotMutex` untuk mencegah konflik transfer pada slot yang sama.
    - Idle timer TTL (60 detik) untuk pembersihan otomatis sesi yang tidak aktif.
    - Penanganan auto-reconnect dan retry jika terjadi koneksi terputus/stale di tengah jalan.
    - Endpoint pembersih `/api/ftp/disconnect-all` dan penanganan shutdown `SIGINT`/`SIGTERM`.
  - Implementasi **Controlled Concurrency & Multi-Worker** di `components/FtpQueueView.tsx`:
    - Worker pool paralel (1x Serial, 2x Optimal, 3x Turbo) dengan selektor UI di toolbar.
    - Pembatalan serentak melalui `activeAbortControllersRef` (Map per file) dan update badge aktif.
    - Pemangkasan inter-file pacing delay dari 800ms menjadi 50ms per worker.
    - Sinkronisasi tipe endpoint `disconnect-all` di `lib/ftp/bridge-client.ts`.
  - Verifikasi: 77 unit tests lolos hijau (`pnpm test:run`), TypeScript check lolos (`tsc --noEmit`).

## Currently Working On
- Benchmarking & pengujian operasional upload riil ke akun microstock (Adobe Stock / Shutterstock).

## Remaining Tasks
- [x] **Persistent Session Pool di Bridge**: Selesai diimplementasikan di `ftp-bridge/server.mjs`.
- [x] **Controlled Parallel Concurrency di UI**: Selesai diimplementasikan di `components/FtpQueueView.tsx`.
- [ ] **Benchmarking Riil**: Uji kecepatan batch upload 10–20 file ke server agensi dengan perbandingan profil 1x vs 2x.

## Blockers / Errors
- None. Seluruh test lolos, lint bersih, dan server bridge lokal v1.1.0 siap dijalankan.

## Files Recently Changed
- `ftp-bridge/server.mjs`
- `components/FtpQueueView.tsx`
- `lib/ftp/bridge-client.ts`

## Next Recommended Step
Lakukan uji coba batch upload langsung ke server agensi atau uji coba simulasi menggunakan `start-ftp-bridge.bat` dan periksa log terminal bridge untuk melihat aktivasi `SFTP-REUSE` dan `Slot #0 / Slot #1`.
