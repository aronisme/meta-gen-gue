# Current Project State

## Last Updated
2026-10-16 18:36

## Current Objective
Penerapan Universal Best-Seller Metadata Architecture (Pilihan 1: Seamless Engine Upgrade) mengadopsi riset empiris top-seller Adobe Stock ke dalam mesin AI metadata generator tanpa mengubah UI atau merusak fitur yang sudah ada.

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
  - Verifikasi: Pengujian riil ke Adobe Stock SFTP membuktikan `[SFTP-REUSE]` aktif pada slot #0 & #1 tanpa re-handshake.

- **Universal Best-Seller Metadata Architecture (Pilihan 1 - Engine Upgrade)**:
  - **Peningkatan Kapasitas & Batas Karakter Judul**:
    - `lib/csv.ts`: Memperbarui fungsi sanitasi `sanitizeAdobeTitle` dari batas lama 70 karakter menjadi 160 karakter (sesuai best practice 12-27 kata; portal Adobe Stock mengizinkan hingga 200 karakter).
    - `lib/__tests__/csv.test.ts`: Memperbarui unit test untuk memverifikasi pemotongan batas 160 karakter.
    - `components/MetadataItem.tsx`: Mengubah threshold peringatan dan badge dari `/70 chars` menjadi `/200 chars` (hanya memberi warning jika `> 200`).
    - `components/StudioPanel.tsx` & `components/SettingsCard.tsx`: Memperbarui nilai fallback default `titleLength` dari `'70'` ke `'120'`.
    - `lib/store.ts`: Auto-migrasi pengaturan tersimpan di LocalStorage dari 70 karakter ke 120 karakter.
  - **Instruksi Mesin AI (app/page.tsx)**:
    - Default state `titleLength` diperbarui dari 70 menjadi 120 karakter.
    - Menyusun arsitektur formula universal di `defaultInstruction` (berlaku untuk seluruh 21 kategori microstock tanpa terkotak pada 4 ceruk riset):
      1. **Front-Loading**: Wajib menempatkan 3-4 kata kunci subjek utama di awal kalimat.
      2. **Multi-Sentence Compound Structure with Period (`.`)**: Memisahkan 2-3 klausa lengkap menggunakan tanda titik (`.`), **STRICTLY NO COMMAS** demi kepatuhan CSV Adobe Stock.
      3. **Natural Synonym Stacking**: Penambahan 1-2 sinonim kata kunci bernilai pencarian tinggi di kalimat kedua.
      4. **Commercial Intent / Buyer Use-Case**: Penutup judul berorientasi kegunaan komersial (e.g. concept for website banner, copy space, advertising layout).
      5. **Title-Keyword Convergence**: 10 keyword pertama (Top 10) wajib berkonvergensi penuh dengan seluruh kata kunci utama pada judul.
  - Verifikasi: 77 unit tests lolos hijau (`pnpm test:run`), TypeScript check lolos tanpa error (`npx tsc --noEmit`).

## Currently Working On
- Deployment rilis terbaru live di Cloudflare Pages (`https://meta-gen-gue.pages.dev`, deployment ID `b30f8fe6`).

## Remaining Tasks
- [x] **Persistent Session Pool di Bridge**: Selesai diimplementasikan di `ftp-bridge/server.mjs`.
- [x] **Controlled Parallel Concurrency di UI**: Selesai diimplementasikan di `components/FtpQueueView.tsx`.
- [x] **Pilihan 1 (Seamless Engine Upgrade)**: Selesai diimplementasikan pada prompt generator, sanitasi CSV, UI counter, dan auto-migrasi setting.
- [x] **Cloudflare Pages Production Deployment**: Selesai dideploy via Wrangler ke `https://meta-gen-gue.pages.dev` (Deployment ID: `b30f8fe6`).

## Blockers / Errors
- None. Seluruh test lolos (77/77), TypeScript lolos bersih, static export berhasil, dan live deployment di Cloudflare Pages 100% healthy.

## Files Recently Changed
- `lib/csv.ts`
- `lib/__tests__/csv.test.ts`
- `app/page.tsx`
- `components/MetadataItem.tsx`
- `components/StudioPanel.tsx`
- `components/SettingsCard.tsx`
- `lib/store.ts`
- `wrangler.toml`
- `ftp-bridge/server.mjs`
