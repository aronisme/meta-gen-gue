# Project Overview

## What This Project Is
**Stock Image Metadata Generator** (`meta-gen`) adalah aplikasi web modern berbasis Next.js 15 yang dirancang khusus untuk kontributor microstock (fotografer, videografer, ilustrator AI/vektor). Aplikasi ini menganalisis file gambar dan video menggunakan kecerdasan buatan multimodal (OpenAI & Google Gemini) untuk menghasilkan judul (title), deskripsi (description), dan kata kunci (keywords) yang ramah SEO dan patuh pada pedoman ketat kurator agensi microstock internasional.

## Main Goal
- Mengeliminasi pekerjaan manual pembuatan metadata untuk ratusan aset gambar dan video.
- Menghasilkan metadata yang berdaya jual komersial tinggi, terindeks optimal di algoritma pencarian agensi, dan meminimalkan risiko penolakan (*rejection*) dari kurator agensi.
- Menyediakan ekspor satu klik ke format CSV siap unggah untuk 5 agensi microstock utama: **Adobe Stock**, **Shutterstock**, **Vecteezy**, **Freepik**, dan **Dreamstime**.

## Architecture

### 1. Frontend & Client Architecture
- **Framework**: Next.js 15 (App Router, Client Component orchestration di `app/page.tsx`).
- **State & Komponen**:
  - `ProviderCard.tsx`: Manajemen provider (OpenAI vs Gemini), pemilihan model, dan penyimpanan API key.
  - `SettingsCard.tsx`: Konfigurasi tipe file (auto, photo, illustration, vector, icon, transparent PNG, video), panjang karakter title, jumlah kata description, kuota keywords, dan custom extra instructions.
  - `UploadCard.tsx`: Drag & drop file picker (mendukung multi-file image & video) dengan validasi kompatibilitas format.
  - `StudioPanel.tsx`: Kontrol studio terpadu di kolom kiri yang ramping (`lg:col-span-4 xl:col-span-3`): Upload dropzone, pemilihan model AI, konfigurasi tipe asset dengan dukungan deteksi `auto`, panjang judul/deskripsi, dan kuota kata kunci.
  - `ResultsCard.tsx`: Tampilan hasil studio di kolom kanan (`lg:col-span-8 xl:col-span-9`) dengan bilah CSV Export, switcher mode tampilan interaktif (Auto, 1 Kolom penuh, 2 Kolom grid), dan daftar kartu hasil.
  - `MetadataItem.tsx`: Kartu item metadata dengan thumbnail preview besar di header (112px–144px), fitur lightbox modal resolusi penuh saat diklik, badge visual tipe media & kategori, input judul dan deskripsi full-width, dropdown taksonomi kategori ganda (Adobe & Shutterstock) serta releases dalam grid adaptif anti-overlap, chip kata kunci interaktif drag-and-drop, dan tombol aksi per item (Copy, Save, Regenerate).
  - `HistoryCard.tsx`: Tampilan riwayat lokal dengan pagination (100 item/halaman), pencarian real-time, seleksi multi-item, bulk export CSV, dan bulk delete.
- **Client-Side Image Downscaling**: Menggunakan `OffscreenCanvas` di `lib/resize.ts` untuk mengecilkan dimensi sisi terpanjang gambar maksimal 1024px sebelum di-encode ke Base64 Data URL. Menghemat kuota token AI dan mempercepat pengiriman tanpa mengurangi detail analisis visual.
- **Zero-Backend Persistence (Local-First)**:
  - IndexedDB via `idb-keyval` (`lib/store.ts`) untuk riwayat hasil generasi lengkap dengan thumbnail preview.
  - `localStorage` untuk menyimpan API key pengguna secara privat dan setting preferensi generasi terakhir.

### 2. Backend & API Route Architecture (Edge Runtime)
- **Edge Runtime (`export const runtime = 'edge'`)**: API routes beroperasi di edge server tanpa node runtime berat:
  - `/api/generate/openai/route.ts`: Memvalidasi API key, memformat payload dengan *Structured Outputs* (`response_format: json_schema strict`), dan meneruskan permintaan ke OpenAI API.
  - `/api/generate/gemini/route.ts`: Menyertakan delay rate-limiting (5 detik), memformat payload dengan `responseSchema: OBJECT`, dan memanggil Gemini REST endpoint.
  - `/api/generate/gemini-video/route.ts`: Khusus video. Menerima base64 data video, menginisiasi *resumable upload* ke Google Gemini Files API, melakukan polling hingga status file `ACTIVE`, lalu menghasilkan metadata melalui Gemini multimodal video context.
- **Instruction Caching**: Menggunakan SHA-256 hash dari system prompt (`instructionHash`) dan in-memory cache map di edge route untuk menghindari transmisi ulang teks prompt yang sama pada batch upload.

### 3. Local FTP Bridge & Multi-Agency Uploader Architecture (`ftp-bridge/`)
- **Port & Runtime**: Server HTTP mandiri berbasis Node.js yang berjalan di port `45678` (`127.0.0.1:45678`).
- **Tujuan**: Mengatasi keterbatasan browser web yang tidak dapat membuka socket TCP FTP/SFTP mentah secara langsung, serta melewati limit payload 100MB dan timeout 30 detik pada serverless Cloudflare Pages.
- **Fitur Kunci**:
  - Dukungan native SFTP (`ssh2-sftp-client`) port 22 dan FTP/FTPS (`basic-ftp`) port 21.
  - Auto-embed biner metadata IPTC & XMP ke file JPG/PNG lokal via ExifTool sebelum file dikirim.
  - Penyimpanan akun aman di `ftp-bridge/accounts.json` (dikecualikan dari git via `.gitignore`).
  - Endpoint `/api/ftp/profiles` untuk sinkronisasi kredensial otomatis lintas domain (`localhost` maupun Cloudflare Pages).
  - Background silent runner `run-hidden.vbs` yang otomatis aktif di folder Windows Startup tanpa jendela terminal.
  - CLI global `metagen-bridge` (`status`, `install`, `start`, `stop`, `uninstall`) dan one-line PowerShell installer dari GitHub (`install.ps1`).

## Technology Stack
- **Core Framework**: Next.js 15.4.10, React 19.1.0, TypeScript 5
- **Deployment Platform**: Cloudflare Pages (`https://meta-gen-gue.pages.dev`) via static export (`scripts/build-pages.mjs`)
- **Local Bridge**: Node.js HTTP server (port 45678), `ssh2-sftp-client`, `basic-ftp`, Windows Script Host (`wscript.exe`)
- **Styling & UI**: Tailwind CSS 4, Radix UI primitives, Lucide Icons, `next-themes`, `sonner`
- **Package Manager**: pnpm (v10+)
- **Testing**:
  - Unit Tests: Vitest 2.1.9 + React Testing Library + JSDOM
  - E2E Tests: Playwright 1.58.1
- **Storage**: `idb-keyval` (IndexedDB abstraction), LocalStorage, dan `accounts.json` (Local Bridge)

## Important Features
1. **Multi-Model Support**:
   - OpenAI: `gpt-5.2`, `gpt-5.1`, `gpt-5`, `o4-mini`, `o3`, `o3-mini`, `gpt-4o`, `gpt-4.1`.
   - Gemini: `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-2.5-flash-lite`.
2. **Video Analysis Pipeline**: Upload video langsung ke Gemini Files API dengan polling status otomatis sebelum prompt inference.
3. **Interactive Keyword Management**:
   - Chip kata kunci interaktif dengan drag-and-drop native HTML5 untuk reordering prioritas 10 kata kunci teratas.
   - Penambahan kata kunci manual dengan proteksi duplikasi otomatis.
   - Tombol "Tidy" (`cleanKeywords`) untuk merapikan, menghapus duplikasi case-insensitive, dan membatasi jumlah sesuai target.
4. **Export Multi-Agency CSV Profile (2026 Compliant)**:
   - **Adobe Stock**: `Filename,Title,Keywords,Category,Releases` (otomatis sanitasi tanpa koma, batasan panjang ≤70 karakter, kode numerik kategori 1–21).
   - **Shutterstock**: `Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial` (7 kolom wajib, teks nama kategori dari 26 daftar resmi, flag otomatis berdasarkan tipe aset).
   - **Vecteezy**: `Filename,Title,Description,Keywords,License` (mendukung mode standar Web Add Data dan mode FTP tanpa ekstensi nama file, kolom `Id` dipertahankan jika ada).
   - **Freepik / Magnific**: `File name;Title;Keywords;Prompt;Model` (pemisah kolom titik koma `;`, pemisah keyword koma `,`, dan otomatis tag `_ai_generated` untuk aset AI).
   - **Dreamstime**: `filename,title,description,keywords`.
   - Format file menggunakan baris penutup CRLF (`\r\n`) dan quote-escaping sesuai standar parsing spreadsheet agensi.
5. **Visual Concept Prompt Agent (VCPA)**:
   - Agen prompt kreatif berbasis AI yang menggantikan sistem perakit statis lama.
   - Mendukung dua mode: Mode 1 (analisis citra acuan untuk mengekstrak Visual DNA Profile: *observed*, *inferred*, *anchors*, *variables*, dan tema semantik) & Mode 2 (ideasi brief teks komersial).
   - Menghasilkan batch N prompt beragam secara konseptual (1, 5, 10, 20) dengan slider kemiripan (0–100%) dan preservasi makna.
   - Format sintaks otomatis untuk Midjourney v6.1, FLUX.1, dan SDXL.
   - Feed kartu prompt interaktif dengan edit inline, regenerasi kartu tunggal, favorit, serta ekspor batch ke TXT & JSON.
6. **Adobe Stock QC Inspector Module**:
   - Asisten kendali mutu pra-submit mandiri untuk aset still image (JPEG & PNG transparan).
   - *Deterministic Preflight Engine*: Memvalidasi batasan teknis mutlak (resolusi minimum 4 MP, maksimum 100 MP, ukuran maksimum 45 MB, dan transparansi alpha PNG) di browser tanpa kuota AI.
   - *VLM Inspection*: Integrasi Dual-Cluster GAS Proxy untuk menganalisis cacat visual AI (anatomi, distorsi, floating objects), bintik debu sensor (*sensor dust spots*), horizon miring (*tilted horizons*), pemotongan canggung (*awkward crop*), artefak pengeditan/penajaman, dan teks/merk liar (OCR).
   - *Known Restrictions Watchlist*: Pencocokan otomatis terhadap 40+ item/merek/landmark terlarang resmi Adobe Stock.
   - *Deterministic Decision Engine*: Mengeluarkan keputusan objektif (`BLOCK`, `REVIEW`, `READY`) dengan bukti visual, alasan regulasi, dan tombol 1-klik handoff ke Studio atau Antrean Upload FTP.

## Project Conventions
- **Path Aliasing**: `@/*` dipetakan ke root proyek (contoh: `@/lib/types`, `@/components/ui/button`).
- **No Direct UI Edit**: Komponen di `components/ui/*` adalah modul shadcn/ui murni. Kustomisasi dilakukan melalui *wrapper* atau penyesuaian kelas di komponen fitur.
- **Privacy First**: API key tidak pernah disimpan di server backend; hanya tersimpan di `localStorage` peramban pengguna dan dikirim langsung per request.
- **Resilience**: Setiap panggilan generasi dibungkus fungsi retry (`withRetry`, 3 kali percobaan dengan exponential backoff). Batch upload dijalankan secara concurrency-controlled (`pLimit` 4 tugas paralel).
- **Anti-Slop Filter & Craftsmanship Standard (Mandatory)**: Wajib selalu mengaktifkan dan mengacu pada skill `antislop` (serta sub-skill: `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`) dalam setiap pengerjaan UI, layout, copywriting, dan kode. Menolak tampilan generik "AI slop", melarang tombol/kontrol mati (R-26), mematuhi standar kontras WCAG AA (R-25), memastikan kesempurnaan layout mobile tanpa overflow (R-03), dan melarang klaim/statistik palsu (R-17/R-36).

## Important Constraints
- **Video Input Hanya Didukung oleh Gemini**: OpenAI API tidak mendukung unggahan video raw mandiri dengan format yang sama, sehingga antarmuka menampilkan peringatan jika video diunggah dengan provider OpenAI aktif.
- **Strict Stock Guidelines**:
  - Judul tidak boleh memuat nama merek atau nama orang nyata.
  - Kata kunci harus berupa kata benda tunggal (*singular nouns*).
  - Dilarang menggunakan kata sifat subjektif (*beautiful, cute, amazing*).
  - 10 kata kunci pertama wajib menjadi kata kunci paling relevan dan mencakup kata kunci dari judul.

## Current Milestone
- Status stabil dan *production hardened*.
- Seluruh 118 pengujian unit (Vitest) berhasil lulus (100% pass).
- Live production deployment aktif di Cloudflare Pages: [https://meta-gen-gue.pages.dev](https://meta-gen-gue.pages.dev).
- Server pengembangan lokal berjalan aktif di `http://localhost:3000`.
