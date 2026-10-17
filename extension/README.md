# Meta-Gen VCPA Browser Extension

Ekstensi browser Chrome / Edge / Brave / Chromium untuk mendeteksi gambar di semua halaman web dan mengirimkannya langsung ke antrean **Visual Concept Prompt Agent (VCPA)** di Meta-Gen.

---

## Fitur Utama

1. **Klik Kanan Langsung Pada Gambar**:
   - Klik kanan pada gambar apa saja di halaman web mana pun (Unsplash, Freepik, Adobe Stock, Pinterest, Midjourney showcase, dll.).
   - Pilih **"✨ Generate Prompt dengan VCPA (Meta-Gen)"**.
   - Gambar akan otomatis dikirim ke Antrean Web App (`meta-gen-gue`) untuk dianalisis dan di-generate menjadi batch prompt terkurasi.

2. **Scanner Semua Gambar di Halaman (Popup)**:
   - Klik ikon ekstensi di toolbar browser.
   - Ekstensi secara otomatis memindai seluruh gambar beresolusi cukup pada halaman aktif.
   - Pilih satu atau banyak gambar sekaligus (multi-select / "Pilih Semua").
   - Klik **"Kirim [X] Gambar ke Antrean"** untuk memproses batch gambar secara beruntun.

3. **Sistem Antrean Otomatis**:
   - Jika antrean di web sedang memproses gambar sebelumnya, gambar-gambar baru dari ekstensi akan otomatis masuk status antrean (`pending`).
   - Begitu gambar sebelumnya selesai dan menghasilkan prompt, sistem antrean otomatis memproses gambar berikutnya tanpa intervensi manual.

---

## Cara Memasang Ekstensi (Google Chrome / Edge / Brave)

1. Buka browser Anda (Google Chrome, Microsoft Edge, atau Brave).
2. Di bilah alamat URL, ketik:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Aktifkan **Mode Pengembang (Developer Mode)** di sudut kanan atas.
4. Klik tombol **"Muat yang belum dibongkar" (Load unpacked)** di kiri atas.
5. Pilih folder:
   ```
   C:\App Tools\meta-gen-gue\extension
   ```
6. Ekstensi **"Meta-Gen VCPA - AI Image to Prompt Assistant"** kini aktif di browser Anda!

---

## Konfigurasi Target Web App

Secara default, ekstensi akan mengirim gambar ke versi live:
- **Cloud (Produksi)**: `https://meta-gen-gue.pages.dev`

Jika Anda sedang menjalankan server lokal:
- Buka popup ekstensi.
- Ubah dropdown *Target Web App* ke: `Local (localhost:3000)`.
