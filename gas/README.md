# 🤖 GAS AI Proxy (OpenAI Compatible & Smart Cooldown Edition v3.1)

Serverless AI Proxy yang berjalan di atas Google Apps Script (GAS) menggunakan Google Sheets sebagai basis data dan panel kontrol.

## 🌟 Fitur Baru di Versi 3.1:
1. **🧠 Smart Key Cooldown (Circuit Breaker)**:
   - Jika suatu key terkena **429 (Rate Limit / Quota Habis)**, key otomatis diistirahatkan selama **60 detik**.
   - Request berikutnya **langsung melewati (skip)** key tersebut tanpa buang waktu menunggu error.
   - Jika key berstatus **401 (Invalid/Dicabut)**, key dinonaktifkan sementara (24 jam) sehingga key lain di provider yang sama tetap bisa berjalan lancar.
2. **⚡ Multi-Key & Multi-Provider Rotation**:
   - Mendukung Groq, Google Gemini, Mistral AI, Nvidia NIM, dan xKiro.
   - Round-robin load balancing antar-key.
   - Failover otomatis lintas provider saat satu provider tumbang.
3. **🌐 Standar Resmi OpenAI API**:
   - Menerima `POST` dengan format standar OpenAI Chat Completions (`messages`, `model`, `temperature`, dll).
   - Mendukung endpoint model `GET ?action=models` (sesuai format OpenAI `/v1/models`).
   - Mendukung multimodal vision (*image base64*).
4. **🛡️ Database Thread-Safe**:
   - Dilengkapi `LockService` di Google Sheets untuk mencegah bentrokan data saat banyak request bersamaan.

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
