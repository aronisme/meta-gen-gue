# Current Project State

## Last Updated
2026-10-15 20:30

## Current Objective
MetaGen Creator Suite v1.0.0 live di Cloudflare Pages (https://meta-gen-gue.pages.dev) terintegrasi dengan MetaGen Local FTP Bridge di port 45678 untuk upload microstock skala besar tanpa batas payload/timeout, auto-start Windows permanen, background queue persistence, auto-retry SFTP anti-drop, validasi Adobe Stock CSV, serta kepatuhan standar craftmanship anti-slop pada seluruh antarmuka dan kode.

## Completed Recently
- **Studio Sticky Sidebar & Pinned Bottom CTA**:
  - Memperbaiki layout kolom kiri `StudioPanel` dengan `lg:self-start lg:sticky lg:top-4 xl:top-6 lg:max-h-[calc(100vh-2rem)] flex flex-col`.
  - Memisahkan area input scrollable mandiri dan mem-pinning tombol Generate Metadata + progress bar di bagian bawah panel secara permanen.
- **Fixed Responsive Auto Grid & LocalStorage Persistence**:
  - Memperbaiki mode tampilan Auto di `ResultsCard` agar secara adaptif mengalokasikan 2 kolom pada layar laptop/desktop (≥768px) dan 3 kolom pada layar lebar (≥1680px), serta menyimpan preferensi tampilan ke `localStorage`.
- **Card Keywords Accordion Fold (Lipatan Kata Kunci)**:
  - Mengimplementasikan fitur lipatan/accordion kata kunci pada setiap kartu `MetadataItem` (mereduksi tinggi kartu ~50% saat terlipat dengan preview 8 kata kunci teratas + pill expand).
  - Menyediakan tombol global *Lipat Semua Keyword* / *Buka Keyword* di toolbar atas `ResultsCard`.
  - Menambahkan penghitung kata (*word counter*) pada kolom Description.
- **Adobe Stock CSV Sanitization & Error Exclusion**:
  - Memperbaiki `lib/csv.ts` agar otomatis menyaring baris error/tanpa metadata agar upload CSV ke Adobe Stock tidak ditolak.
  - Menambahkan sanitasi numerik 1–21 untuk kategori Adobe Stock.
- **FTP Queue Error Filtering & One-Click Retry**:
  - Memperbaiki `components/FtpQueueView.tsx` agar membedakan item gagal AI, tidak mencentangnya secara default, dan menambahkan tombol *Coba Lagi Gagal*.
- **SFTP Resilience & Keepalive**:
  - Menambahkan SSH keepalive (10s) dan loop auto-retry 2x di `ftp-bridge/server.mjs` untuk mengatasi `ECONNRESET` / handshake drop.
  - Menambahkan pacing delay 800ms antar file di antrean.
- **Resilient Metadata Normalizer**:
  - Mengganti validator kaku dengan `normalizeMeta` di `app/page.tsx` yang toleran terhadap keywords array dan casing field.

## Currently Working On
- Melakukan deployment rilis terbaru ke Cloudflare Pages (`https://meta-gen-gue.pages.dev`).

## Remaining Tasks
- Pengujian batch upload gambar/video volume besar secara langsung ke akun contributor Adobe Stock / Dreamstime.

## Blockers / Errors
- None. Semua 67 unit test Vitest lolos dan build Next.js lulus.

## Files Recently Changed
- `components/StudioPanel.tsx`
- `components/ResultsCard.tsx`
- `components/MetadataItem.tsx`
- `components/FtpQueueView.tsx`
- `lib/csv.ts`
- `lib/keywords.ts`
- `lib/__tests__/csv.test.ts`
- `ftp-bridge/server.mjs`
- `app/page.tsx`

## Next Recommended Step
- Verifikasi hasil deploy di `https://meta-gen-gue.pages.dev`.
- Pastikan local bridge aktif via `metagen-bridge status`.
