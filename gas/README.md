# 🤖 GAS AI Proxy (OpenAI Compatible & Smart Cooldown Edition v3.3)

Serverless AI Proxy berkecepatan tinggi yang berjalan di atas Google Apps Script (GAS) menggunakan Google Sheets sebagai basis data API key dan panel kontrol.

> [!NOTE]
> Sistem autentikasi login pengguna dan kuota harian telah dialihkan sepenuhnya ke **Cloudflare D1 SQL Native Database** ([functions/api/auth/google.ts](file:///c:/App%20Tools/meta-gen-gue/functions/api/auth/google.ts)), sehingga GAS kini fokus 100% sebagai AI proxy murni yang jauh lebih cepat, ringan, dan bebas lag LockService.

## 🌟 Fitur Utama:
1. **🧠 Smart Key Cooldown (Circuit Breaker)**:
   - Jika suatu key terkena **429 (Rate Limit / Quota Habis)** atau **502 (Peak Demand)**, key otomatis diistirahatkan selama **60 detik**.
   - Request berikutnya **langsung melewati (skip)** key tersebut tanpa buang waktu menunggu error.
   - Jika key berstatus **401 (Invalid/Dicabut)**, key dinonaktifkan sementara (24 jam) sehingga key lain di provider yang sama tetap bisa berjalan lancar.
2. **⚡ Multi-Key & Multi-Provider Rotation**:
   - Mendukung Groq, Google Gemini, TokenHarbor, OpenRouter, Mistral AI, Nvidia NIM, dan xKiro.
   - Round-robin load balancing antar-key.
   - Failover otomatis lintas provider saat satu provider tumbang.
3. **🌐 Standar Resmi OpenAI API**:
   - Menerima `POST` dengan format standar OpenAI Chat Completions (`messages`, `model`, `temperature`, dll).
   - Mendukung endpoint model `GET ?action=models` (sesuai format OpenAI `/v1/models`).
   - Mendukung multimodal vision (*image base64 & image URL*).
4. **🛡️ Database Thread-Safe**:
   - Dilengkapi `LockService` di Google Sheets untuk sinkronisasi rotasi kunci.

---

## 📁 Struktur File di Folder Ini:
- [`Code.gs`](file:///c:/App%20Tools/meta-gen-gue/gas/Code.gs): Kode backend utama JavaScript untuk Google Apps Script.
- [`Index.html`](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html): File antarmuka dialog modal untuk Spreadsheet.

---

## 🚀 Cara Memperbarui di Google Apps Script:
1. Buka project script Anda di [script.google.com](https://script.google.com).
2. Salin isi [`gas/Code.gs`](file:///c:/App%20Tools/meta-gen-gue/gas/Code.gs) ke file `Code.gs` di editor GAS (timpa seluruh isinya).
3. Salin isi [`gas/Index.html`](file:///c:/App%20Tools/meta-gen-gue/gas/Index.html) ke file `Index.html` di editor GAS.
4. Klik tombol **Save (💾)**.
5. Klik **Deploy > Manage Deployments** > Klik ikon pensil (**Edit**) > Pilih **New Version** > Klik **Deploy**.
