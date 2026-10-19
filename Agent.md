# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock Image Metadata Generator - a Next.js application that generates titles, descriptions, and keywords for stock photography and videos using AI (OpenAI and Google Gemini). Users upload images/videos, select an AI provider/model, and export CSV files for stock marketplaces (Adobe Stock, Shutterstock, Vecteezy, Freepik, Dreamstime).

## Commands

```bash
pnpm dev           # Start development server at http://localhost:3000
pnpm build         # Production build
pnpm start         # Run production build locally
pnpm lint          # ESLint + TypeScript checks
pnpm test          # Run unit tests with Vitest (watch mode)
pnpm test:run      # Run unit tests once
pnpm test:coverage # Run tests with coverage report
pnpm test:e2e      # Run Playwright E2E tests
pnpm test:e2e:ui   # Run E2E tests with Playwright UI
```

## Architecture

### Tech Stack
- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS 4 + shadcn/ui (new-york style, neutral base color)
- Edge runtime API routes for AI providers
- IndexedDB (via idb-keyval) for local history persistence
- Vitest + React Testing Library for unit tests
- Playwright for E2E tests

### Key Structure
- `app/page.tsx` - Main page orchestrating components and state
- `components/` - Feature components:
  - `ProviderCard.tsx` - Provider/model selection
  - `SettingsCard.tsx` - Generation settings
  - `UploadCard.tsx` - File upload with video support
  - `ResultsCard.tsx` - Generated results display
  - `HistoryCard.tsx` - History with search, delete, selection
  - `MetadataItem.tsx` - Reusable item card (editable/read-only)
  - `error-boundary.tsx` - React error boundary
  - `Providers.tsx` - Client-side providers wrapper
- `app/api/generate/` - API routes:
  - `openai/route.ts` - OpenAI with input validation
  - `gemini/route.ts` - Gemini with rate limiting
  - `gemini-video/route.ts` - Gemini video analysis via Files API
- `lib/` - Utility modules:
  - `types.ts` - Core types including video support
  - `csv.ts` - CSV export with Adobe Stock category/releases
  - `store.ts` - IndexedDB + settings persistence
  - `resize.ts`, `hash.ts`, `keywords.ts`
- `lib/__tests__/` - Unit tests for utilities
- `e2e/` - Playwright E2E tests
- `components/ui/` - shadcn/ui components (do not edit directly)

### Data Flow
1. Images resized to max 1024px client-side; videos sent directly
2. System prompt hashed for caching across batch
3. API routes validate input and proxy to OpenAI/Gemini
4. Results stored in IndexedDB with thumbnails
5. Settings persisted in localStorage across sessions

### Video Support
- Video files use `gemini-video` API route (Gemini only)
- Uploads to Gemini Files API, polls for processing, then generates
- OpenAI shows warning when video files selected

### Adding New Models
Edit `OPENAI_MODELS` and `GEMINI_MODELS` arrays in `app/page.tsx`.

## Path Aliases
- `@/*` maps to project root (e.g., `@/lib/types`, `@/components/ui/button`)

## Testing
- Unit tests: `lib/__tests__/*.test.ts`
- E2E tests: `e2e/*.spec.ts`
- Run `pnpm test:run` before committing

<!-- antislop:start -->
## antislop
Wajib menggunakan skill `antislop` untuk setiap pekerjaan antarmuka pengguna (UI), tata letak (layout), copywriting/teks, aksesibilitas, dan penulisan komentar kode.
- UI / visual: gunakan skill `antislop-ui`
- Copy & text: gunakan skill `antislop-copywriting`
- People & Aksesibilitas: gunakan skill `antislop-human` (kontras WCAG AA, navigasi keyboard)
- Mobile / responsif: gunakan skill `antislop-layoutmobile` (bebas overflow horizontal, tap target min 44px)
- Code comments: gunakan skill `antislop-code` (bebas komentar AI-slop generik)

Terapkan standar keahlian (Craftsmanship Standard C-1 s/d C-5):
- Menolak teknik visual tanpa tujuan (Purpose-Gate).
- Larangan keras (Hard Gate): Tidak ada elemen interaktif/tombol mati (R-26), teks tidak kontras (R-25), link tanpa tujuan (R-24), atau data/klaim palsu (R-17/R-36).
- Verifikasi interaksi satu per satu sebelum menyelesaikan tugas (R-35).
<!-- antislop:end -->

## Google Flow Automation Integration (VCPA Extension)
- **Feature**: On-demand image generation via `✨ Gen Img` button on each prompt card in `PromptGeneratorView.tsx`.
- **Extension Bridge**:
  - `extension/manifest.json`: Includes `"debugger"`, `"tabs"`, `"scripting"`, `"storage"`, and host permissions for `flow.google.com` & `labs.google/fx/*`.
  - `extension/background.js`: Uses `chrome.debugger` (CDP) to dispatch native hardware-level Enter key (`Input.dispatchKeyEvent`) and mouse click (`Input.dispatchMouseEvent`) with `isTrusted: true` to bypass Angular/ProseMirror synthetic event blockers.
  - `extension/flow-bridge.js`: Injects prompt into ProseMirror editor, calculates submit button coordinates, triggers CDP submit, monitors render progress via `<mat-icon>stop</mat-icon>` (`isFlowGenerating()`), and captures completed images back to the Meta-Gen prompt card.
- **Project Reference**: `C:\App Tools\Flow Automation V2` and `flow ext Rj.zip` (CDP pattern for Flow).

## Local FTP Bridge & ExifTool Lossless Metadata Engine (v1.2.0)
- **Port Target**: `127.0.0.1:45678` (Node.js daemon backend dengan Keep-Alive Session Pool).
- **Core Modules**:
  - `ftp-bridge/exiftool-wrapper.mjs`: Multi-format lossless metadata injector (JPG, PNG, TIFF, WebP, PSD, EPS, SVG, MP4, MOV, M4V) dengan fallback transparan ke `ftp-bridge/embed.mjs`.
  - `ftp-bridge/server.mjs`: Local Bridge server dengan pooling SFTP/FTPS, real-time byte stream tracking, serta endpoint `/health`, `/api/ftp/upload`, `/api/ftp/progress`, dan `/api/metadata/embed`.
  - `ftp-bridge/cli.mjs`: Global CLI manager (`metagen-bridge status`, `install`, `start`, `stop`, `install-exiftool`).
- **Real-Time Progress Tracking**:
  - `components/FtpQueueView.tsx`: Menggunakan `uploadWithXhr` + progress polling ke `/api/ftp/progress` untuk menampilkan live percent bar (0–100%), counter byte terunggah (`MB/MB`), kecepatan instan (`MB/s`), dan status fase transfer.
- **Commands**:
  - `pnpm bridge` - Jalankan bridge di foreground.
  - `pnpm bridge:status` - Cek status koneksi, port 45678, dan ExifTool engine.
  - `pnpm bridge:exiftool` - Pasang/perbarui ExifTool via WinGet.
