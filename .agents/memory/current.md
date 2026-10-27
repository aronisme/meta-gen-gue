# Current Project State

## Last Updated
2026-10-24 20:40

## Current Objective
Pengembangan Fitur & Polishing UI: Mode Auto End-to-End Pipeline (Prompt Gen -> Antrean Google Flow -> Auto Download 2K -> Auto Preflight QC -> Auto Gen Metadata dalam Sesi Kerja Tunggal).

## Completed Recently
- **Isolasi Pengaturan Snapshot Per Item Antrean Generator (Image Ref Queue)**:
  - Masalah teratasi: Perubahan pada Panel Pengaturan Generator di tengah antrean tidak lagi menimpa atau mengubah konfigurasi gambar acuan yang sedang menunggu.
  - Snapshot konfigurasi otomatis dibekukan ke `PromptQueueItem.settings` pada saat gambar diunggah, di-paste, di-drag-drop, atau dikirim via ekstensi Chrome.
  - Worker antrean FIFO mengeksekusi `executeVCPAGeneration` dengan `effectiveSettings` spesifik milik item tersebut.
  - Setiap kartu hasil (`PromptCardItem`) mewarisi `engine`, `aspectRatio`, dan `settingsSnapshot` asli sehingga regenerasi tunggal maupun otomasi Google Flow tetap konsisten.
  - Tampilan Laci Antrean (Queue Drawer) diperkaya badge visual setelan tersimpan (`Engine`, `Count P`, `Rasio`, `Gaya Visual`) serta tombol aksi "Sinkronkan Setelan Panel" jika pengguna sewaktu-waktu ingin menerapkan setelan aktif secara massal ke antrean pending.
  - 135/135 unit test lulus (100% pass), `npx tsc --noEmit` 0 error, `pnpm lint` 0 error, dan `pnpm build` sukses.
- **Opsi Salin Belum Disalin (Tab Gen Prompt)**:
  - Penambahan field `isCopied` dan `copiedAt` pada kontrak `PromptCardItem` ([`lib/prompt-agent/types.ts`](file:///c:/App%20Tools/meta-gen-gue/lib/prompt-agent/types.ts)) dan helper [`exportUncopiedPromptsToQueueText`](file:///c:/App%20Tools/meta-gen-gue/lib/prompt-agent/engine.ts).
  - Tombol aksi `Salin Belum Disalin ({N})` di toolbar aksi dengan auto-counter dinamis, deteksi `Semua Sudah Disalin`, serta tombol `Reset Status`.
  - Filter bar tampilan di atas feed prompt: `Semua`, `Belum Disalin`, `Sudah Disalin`, dan `Favorit` dengan penomoran ordinal stabil.
- **Fix Fatal Syntax Error & Tab Blocking di Extension Google Flow**:
  - Memperbaiki unclosed loop di `extension/flow-bridge.js:371` dan layout overlap `extension/agent-floater.js`.

- **Conditional Human Subject Casting & Commercial Aesthetics Directive (VCPA Engine)**:
  - Mengimplementasikan pedoman casting model bersyarat 3 lapis pada [`lib/prompt-agent/engine.ts`](file:///c:/App%20Tools/meta-gen-gue/lib/prompt-agent/engine.ts):
    1. *Zero Forced Humans*: Mencegah AI menyelipkan manusia pada gambar objek, makanan, flatlay, arsitektur, lanskap, dan produk.
    2. *Commercial Appeal*: Jika konsep memuat manusia, model wajib fotogenik, menarik, terawat (*well-groomed*), berbusana pas, kulit sehat (*radiant*), dan ekspresi hangat/percaya diri dengan *catchlight*, melarang keras tampang suram, kusam, atau lelah (*weary/grim*).
    3. *Demographic Fidelity & Active Seniors*: Menjaga demografi asli konsep (misal jika konsep lansia/orang tua, tetap lansia berwibawa/karismatik/sehat, bukan kusam dan bukan diubah menjadi anak muda).
  - Memperbarui `STYLE_SPECIFICATIONS.photo_commercial_lifestyle` dan instruksi regenerasi kartu tunggal di [`lib/prompt-agent/client.ts`](file:///c:/App%20Tools/meta-gen-gue/lib/prompt-agent/client.ts).
  - Terverifikasi: 134/134 unit test lulus (100% pass) dan `npx tsc --noEmit` 0 error.

## Currently Working On
- Penyempurnaan parameter kualitas visual prompt agent selesai diuji.

## Remaining Tasks
- Opsional: Pengguna dapat mengaktifkan toggle "⚡ Mode Auto" di tab Generator Prompt dan melakukan uji coba langsung ke Google Flow.

## Blockers / Errors
- None (TypeScript 0 error, 133/133 unit tests pass, static build pass).

## Files Recently Changed
- `extension/flow-bridge.js`
- `extension/agent-floater.js`
- `components/PromptGeneratorView.tsx`

## Next Recommended Step
- Buka dan uji langsung percakapan serta pembuatan prompt/metadata di `https://meta-gen-gue.pages.dev`.

## Notes for Next Session
- Local FTP bridge berjalan di latar belakang via Windows VBS runner pada port `45678`.
- Backend Cloudflare Function `/api/agent/chat` menangani failover otomatis antar-kluster GAS Proxy.
