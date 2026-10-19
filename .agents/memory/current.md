# Current Project State

## Last Updated
2026-10-19 19:28

## Current Objective
Peningkatan Local FTP Bridge & Integrasi ExifTool untuk Penyematan Metadata IPTC/XMP/QuickTime Multi-Format.

## Completed Recently
- **Integrasi Provider TokenHarbor ke GAS AI Proxy ([gas/Code.gs](file:///c:/App%20Tools/meta-gen-gue/gas/Code.gs), [gas/Index.html](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html))**:
  - Validasi langsung kemampuan Multimodal Vision & Text untuk TokenHarbor (`https://tokenharbor.ai/v1`). Terbukti model `deepseek-v4.1-flash:free`, `mimo-v2.6-flash:free`, dan `mimo-v2.5:free` sukses mengenali gambar secara akurat dan memproses Base64 maupun Image URL.
  - Menambahkan provider `tokenharbor` ke `gas/Code.gs`:
    - Fungsi `callTokenHarbor()` dengan endpoint OpenAI-compatible (`https://tokenharbor.ai/v1/chat/completions`) dan autentikasi Bearer.
    - Resolusi model pintar di `resolveProviderAndModel()` mendeteksi prefiks `thk_`, model nama `:free`, `mimo-`, dan `deepseek-v4`.
    - Smart Cooldown Circuit Breaker terpasang untuk `cursor_tokenharbor` saat terkena status 429 atau 502 (peak demand).
    - Menambahkan opsi TokenHarbor ke antarmuka dialog modal Google Spreadsheet ([gas/Index.html](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html)) dan [gas/README.md](file:///c:/App%20Tools/meta-gen-gue/gas/README.md).
- **Integrasi Pilihan Model UI Frontend ([app/page.tsx](file:///c:/App%20Tools/meta-gen-gue/app/page.tsx), [components/ProviderCard.tsx](file:///c:/App%20Tools/meta-gen-gue/components/ProviderCard.tsx), [components/StudioPanel.tsx](file:///c:/App%20Tools/meta-gen-gue/components/StudioPanel.tsx))**:
  - Menambahkan opsi `deepseek-v4.1-flash:free` dan `mimo-v2.6-flash:free` ke dropdown target model AI agar pengguna dapat memilih model TokenHarbor langsung melalui GAS Proxy.
- **Pembersihan Sistem Login dari GAS AI Proxy ([gas/Code.gs](file:///c:/App%20Tools/meta-gen-gue/gas/Code.gs), [gas/README.md](file:///c:/App%20Tools/meta-gen-gue/gas/README.md))**:
  - Menghapus tab `Users`, fungsi verifikasi Google OAuth (`verifyGoogleIdToken`), sinkronisasi whitelist (`syncGoogleUser`), profile getter (`getUserProfileByEmail`), dan pengecekan kuota spreadsheet (`checkAndDeductQuota`) dari backend GAS.
  - Menghapus endpoint `google_login`, `auth_verify`, dan `user_status` dari `doGet` dan `doPost`.
  - Sistem autentikasi pengguna dan kuota kini 100% ditangani oleh Cloudflare D1 SQL Native Database ([functions/api/auth/google.ts](file:///c:/App%20Tools/meta-gen-gue/functions/api/auth/google.ts)), menjadikan GAS AI Proxy murni, ringan, dan jauh lebih cepat tanpa overhead LockService user.
- **Integrasi Provider OpenRouter ke GAS AI Proxy ([gas/Code.gs](file:///c:/App%20Tools/meta-gen-gue/gas/Code.gs), [gas/Index.html](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html))**:
  - Menambahkan provider `openrouter` ke `gas/Code.gs` dengan fungsi `callOpenRouter()` yang memanggil `https://openrouter.ai/api/v1/chat/completions` lengkap dengan header identifikasi `HTTP-Referer` dan `X-Title`.
  - Otomatis me-resolve model dengan prefiks `openrouter/`, `google/`, `meta-llama/`, `anthropic/`, atau kunci berawalan `sk-or-`.
  - Smart Cooldown Circuit Breaker terpasang untuk `cursor_openrouter`.
  - Menambahkan opsi OpenRouter pada antarmuka dialog spreadsheet ([gas/Index.html](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html)) dan opsi model `google/gemini-2.0-flash-001` serta `openrouter/auto` pada UI frontend.
- **Pembaruan Endpoint & Token GAS AI Proxy Proyek ([.env.local](file:///c:/App%20Tools/meta-gen-gue/.env.local), [lib/store.ts](file:///c:/App%20Tools/meta-gen-gue/lib/store.ts), [app/api/generate/proxy/route.ts](file:///c:/App%20Tools/meta-gen-gue/app/api/generate/proxy/route.ts), [app/api/generate/prompt-agent/route.ts](file:///c:/App%20Tools/meta-gen-gue/app/api/generate/prompt-agent/route.ts))**:
  - Memperbarui `GAS_PROXY_URL_1`, `GAS_PROXY_URL`, `DEFAULT_GAS_URL` ke `https://script.google.com/macros/s/AKfycbz0TfjsTcaMF6WvXqf8SIfHCHVqkHQjB8I8O5l_zfKmoqeqDdh0IyHvg0PJlg8kWzXKwA/exec`.
  - Memperbarui `GAS_PROXY_TOKEN_1`, `GAS_PROXY_TOKEN`, `DEFAULT_GAS_TOKEN`, `NEXT_PUBLIC_GAS_PROXY_TOKEN` ke `sk-gas-default-token133`.
  - Sinkronisasi fallback pada Cloudflare Pages functions ([functions/api/generate/proxy.ts](file:///c:/App%20Tools/meta-gen-gue/functions/api/generate/proxy.ts), [functions/api/generate/prompt-agent.ts](file:///c:/App%20Tools/meta-gen-gue/functions/api/generate/prompt-agent.ts)).
- **Deploy ke Cloudflare Pages Selesai (`https://meta-gen-gue.pages.dev`)**:
  - Berhasil menjalankan static export Next.js 15 via `scripts/build-pages.mjs` (`pnpm pages:build`) ke direktori `out/`.
  - Berhasil men-deploy bundle static dan Cloudflare Functions API menggunakan `npx wrangler pages deploy out --project-name=meta-gen-gue`.
  - Deployment live dan aktif pada URL produksi: [https://meta-gen-gue.pages.dev](https://meta-gen-gue.pages.dev) (Deployment hash preview: [https://b059422d.meta-gen-gue.pages.dev](https://b059422d.meta-gen-gue.pages.dev)).
  - Semua perubahan telah di-commit dan di-push ke remote repository `origin/main` di GitHub.

## Currently Working On
- Menunggu instruksi berikutnya dari pengguna atau melanjutkan roadmap fitur berikutnya.

## Remaining Tasks (Roadmap)
- [ ] **Sinkronisasi Rasio Gambar Google Flow**: Penyesuaian aspek rasio (1:1, 16:9, 9:16) ke setting Flow saat generate dipicu.
- [ ] **Modul Keyword Research**: Eksplorasi tren microstock, tag cloud interaktif, dan filter kata kunci terlarang di `components/KeywordResearchView.tsx`.

## Blockers / Errors
- None.

## Files Recently Changed
- `scripts/build-pages.mjs`
- `components/FtpQueueView.tsx`
- `gas/Code.gs`
- `gas/Index.html`
- `gas/README.md`
- `app/page.tsx`
- `components/ProviderCard.tsx`
- `components/StudioPanel.tsx`
- `.agents/memory/current.md`

