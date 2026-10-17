# Meta-Gen VCPA Browser Extension

Ekstensi browser Google Chrome / Microsoft Edge / Brave / Chromium untuk mendeteksi gambar di semua halaman web dan mengirimkannya langsung ke antrean **Visual Concept Prompt Agent (VCPA)** di Meta-Gen.

---

## Fitur Utama & Cara Kerja

1. **Satu Klik Kanan — 100% di Latar Belakang (Tanpa Berpindah Tab)**:
   - Klik kanan pada gambar apa saja di halaman web mana pun (Unsplash, Freepik, Adobe Stock, Pinterest, Canva, Figma, Google Images, dll.).
   - Hanya ada **1 menu tunggal**: **`✨ Generate Prompt (Meta-Gen)`**.
   - **Tidak berpindah tab**: Anda tetap berada di halaman yang sedang Anda telusuri. Tab tidak akan melompat.
   - **Floating In-Page Toast**: Notifikasi elegan muncul sesaat di pojok kanan bawah halaman web Anda (`✓ Masuk Antrean Meta-Gen`), mengonfirmasi gambar sedang diproses di latar belakang.
   - Menembus overlay transparan, kartu bertingkat, dan lapisan pembungkus (`div`, `a`, `picture`).

2. **Deteksi Komprehensif Seluruh Frame & Halaman (Multi-Frame / Iframe / Lazy)**:
   - Memindai tag `<img>`, `<picture>`, CSS `background-image`, SVG `<image>`, `<canvas>`, dan `<video>` poster.
   - Menembus `iframe` dan `frames` di seluruh halaman web secara otomatis.
   - Mendeteksi gambar *lazy-loading* (`data-src`, `data-original`, `data-lazy-src`, `srcset`).
   - Popup menampilkan galeri thumbnail, dimensi resolusi, toggle filter ikon kecil, dan tombol "Pilih Semua".
   - Tombol **"Kirim [X] Gambar ke Antrean (Latar Belakang)"** mengirim seluruh pilihan sekaligus tanpa memindahkan tab Anda.

3. **Sistem Antrean Otomatis di Web App**:
   - Jika sistem web sedang sibuk memproses gambar, gambar-gambar baru otomatis masuk antrean (`pending`).
   - Selesai satu gambar, prompt otomatis ditambahkan ke baris teratas sesi aktif, dan sistem otomatis lanjut memproses gambar berikutnya tanpa henti.

---

## Cara Memasang / Memperbarui Ekstensi (Chrome / Edge / Brave)

1. Buka browser Anda (Google Chrome, Microsoft Edge, atau Brave).
2. Di bilah alamat URL, ketik:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Aktifkan **Mode Pengembang (Developer Mode)** di sudut kanan atas.
4. Jika ekstensi sudah terpasang sebelumnya:
   - Cukup klik ikon **Reload (🔄)** pada kartu ekstensi Meta-Gen VCPA.
   - Atau jika belum terpasang, klik **"Muat yang belum dibongkar" (Load unpacked)** dan pilih folder:
     ```
     C:\App Tools\meta-gen-gue\extension
     ```
5. Ekstensi siap digunakan!

---

## Konfigurasi Target Web App

- **Cloud (Produksi Default)**: `https://meta-gen-gue.pages.dev`
- **Localhost**: Jika sedang menjalankan `pnpm dev`, buka popup ekstensi dan pilih `Local (localhost:3000)`.
