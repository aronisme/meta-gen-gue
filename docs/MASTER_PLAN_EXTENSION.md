# 🚀 MASTER PLAN PENGEMBANGAN EKSTENSI META-GEN
## Ekosistem Jembatan Otomasi Google Flow, Smart Tagging, Mass Downloader 2K/4K, dan Direct Microstock Pipeline

> **Versi Dokumen**: 1.0.0  
> **Target Platform**: Google Chrome / Microsoft Edge (Manifest V3)  
> **Status**: Aktif dalam Pengembangan  
> **Repositori**: `c:\App Tools\meta-gen-gue` (`https://github.com/aronisme/meta-gen-gue`)

---

## 🎯 1. Visi & Tujuan Strategis

Ekstensi **Meta-Gen Assistant / Flow Bridge** adalah urat nadi yang menghubungkan aplikasi web **Meta-Gen Microstock Studio** dengan platform AI generatif **Google Labs / Google Flow** (`flow.google.com`), **Local FTP Bridge**, dan platform stock agency (Adobe Stock, Freepik, Shutterstock, Vecteezy).

Tujuan utama ekstensi ini adalah menciptakan **Zero-Friction AI Microstock Workflow**:
1. **Otomasi Eksekusi Prompt**: Mengirim puluhan prompt hasil racikan AI langsung ke antarmuka Google Flow tanpa copy-paste manual.
2. **Presisi Asosiasi Media (Smart Tagging)**: Menjamin 100% setiap gambar yang digenerate di Flow tertaut persis dengan prompt, nomor urut (*ordinal*), dan metadata aslinya.
3. **Unduh Otomatis Resolusi Tinggi (2K/4K/FHD)**: Mengadopsi teknologi scan zoom 50% dan navigasi submenu Angular Material untuk mengunduh versi terbaik secara massal.
4. **Penyematan Metadata & Auto-Upload**: Menyalurkan hasil unduhan langsung ke ExifTool untuk diisi IPTC/XMP (Title, Caption, Keywords) dan dikirim ke server FTP agensi microstock.

---

## 🏗️ 2. Arsitektur Teknis Sistem (Manifest V3)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             META-GEN STUDIO WEB APP                              │
│                    (Prompt Generator, Metadata Editor, FTP Queue)                │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ window.postMessage
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         CONTENT SCRIPT (content.js)                              │
│                 Menerjemahkan event Web App ke Chrome Runtime                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ chrome.runtime.sendMessage
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   BACKGROUND SERVICE WORKER (background.js)                      │
│  - CDP (Chrome DevTools Protocol) Hardware Clicks (isTrusted: true)              │
│  - Chrome Downloads API Interception (Routing subfolder & verifikasi unduhan)    │
│  - Tab Management & Script Injection                                             │
└──────────────────┬───────────────────────────────────────────┬───────────────────┘
                   │                                           │
                   ▼                                           ▼
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│     GOOGLE FLOW (flow-bridge.js)     │    │       LOCAL FTP BRIDGE (Node)        │
│  - Input Prompt ProseMirror/Angular  │    │  - Port 4040 Localhost               │
│  - Baseline Diffing Detection        │    │  - ExifTool IPTC/XMP Embedding       │
│  - Floating Visual Badge Tagging     │    │  - Direct FTP/SFTP Dispatch          │
│  - Auto-Click Resolusi 2K/4K         │    └──────────────────────────────────────┘
└──────────────────────────────────────┘
```

---

## 🧩 3. Pilar Pengembangan Fitur

### 📌 PILAR 1: Bi-directional Automation Bridge
*Fokus: Mengendalikan tab Google Flow layaknya pengguna manusia asli tanpa memicu deteksi bot.*

- **Dual-Action Prompt Dispatch**:
  - Injeksi teks ke editor Slate/ProseMirror (`contenteditable="true"`).
  - Pemicu kombinasi tombol `Enter` hardware-level melalui Chrome DevTools Protocol (`Input.dispatchKeyEvent`).
  - Fallback simulasi pointer event lengkap (`pointerdown` -> `mousedown` -> `pointerup` -> `mouseup` -> `click`).
- **Sinkronisasi Pengaturan Otomatis (Setting Sync)**:
  - Otomatis mencocokkan aspek rasio (1:1 Square, 16:9 Landscape, 9:16 Portrait) pada switcher rasio Google Flow sebelum generate dimulai.
  - Memilih model AI di Flow (Imagen 3 / Nano Banana).
- **Auto-Dismiss Shield**:
  - Deteksi dan auto-approve pop-up disclaimer (*"Approve"*, *"Accepter"*, *"Got it"*, *"Setuju"*).
  - Penutupan banner cookie EU / Google Consent yang menutupi tombol bawah.

---

### 🏷️ PILAR 2: Smart Card Tracking, Tagging, & Registry System
*Fokus: Menghilangkan kebingungan "gambar ini dari prompt yang mana?" saat ratusan gambar selesai dibuat.*

- **Metode Baseline Diffing (Presisi Tinggi)**:
  - Mengambil snapshot seluruh ID media (`baselineTokens`) sesaat sebelum tombol generate ditekan.
  - Mendeteksi selisih kemunculan media baru saat ikon *stop* (render) berganti normal.
- **Visual Badge Mengambang di Galeri Flow**:
  - Menempelkan badge visual hijau elegan (`⚡ MetaGen #X`) langsung di pojok kiri atas kartu gambar di tab Google Flow.
  - **Interaktivitas Badge**:
    - Tooltip hover menampilkan teks prompt lengkap.
    - Sekali klik pada badge langsung menyalin (*copy to clipboard*) teks prompt tersebut.
- **Atribut DOM Semantik**:
  - Menyisipkan atribut `data-metagen-card-id`, `data-metagen-ordinal`, `data-metagen-prompt`, dan `data-metagen-token` ke container kartu (`flow-grid-tile-container`).
- **Persistent Local Registry**:
  - Menyimpan pemetaan permanen di `chrome.storage.local` (`metagen_flow_registry`).
  - **Virtual Scroll Hydration**: Fungsi otomatis `hydrateFlowBadges()` yang memulihkan badge pada kartu galeri saat pengguna melakukan scroll atau reload halaman.

---

### ⚡ PILAR 3: Mass Downloader 2K/4K Engine
*Fokus: Mengadaptasi teknologi terbaik dari "Flow Mass Downloader" untuk mengekstrak resolusi tertinggi secara otomatis.*

- **Pre-Scan Galeri Super Cepat (Zoom 50%)**:
  - Memperkecil halaman ke zoom 50% selama fase pemindaian galeri agar browser merender 2x lipat lebih banyak kartu virtual.
  - Auto-scroll dinamis pada `cdk-virtual-scroll-viewport` hingga mencapai batas akhir galeri.
  - Mengembalikan zoom ke 100% sebelum proses unduhan dimulai.
- **Multi-tier More Button Trigger**:
  - Mendeteksi tombol 3-titik Angular (`.mat-mdc-menu-trigger`, `button[flowhotbarbutton]`, icon `more_vert`).
  - Strategi memanjat DOM (DOM hierarchy climbing) hingga 5 level jika klik tombol terhalang.
  - Fallback klik kanan (*context menu mouse event*) jika klik kiri gagal memunculkan menu.
- **Submenu Resolution Handling**:
  - Otomatis mengidentifikasi menu "Download" utama, memicu submenu resolusi (`1K Original`, `2K Upscaled`, `4K Ultra HD`, `1080p FHD`).
  - Validasi status disable pada tombol sebelum klik.
- **Handshake Verifikasi Asinkron**:
  - Content script tidak menggunakan waktu tunggu statis, melainkan mendengarkan event native `chrome.downloads.onCreated` dari browser.
  - Timeout adaptif: 8 detik untuk foto standar, hingga 20 detik untuk video/upscale 2K.
- **Subfolder Auto-Routing**:
  - Menggunakan `chrome.downloads.onDeterminingFilename` untuk merapikan file unduhan ke dalam subfolder khusus:
    `Downloads/MetaGen_Flow/[Batch_Name]/MetaGen_001_SlugPrompt.jpg`.

---

### 🎨 PILAR 4: Auto-Pipeline ke ExifTool & FTP Bridge
*Fokus: Menghubungkan aset hasil unduhan dengan pipeline monetisasi microstock.*

- **Penyematan Metadata Instan (EXIF/IPTC/XMP)**:
  - File yang diunduh langsung dideteksi oleh watcher folder atau dikirim via stream ke Local FTP Bridge (`ftp-bridge/server.mjs`).
  - ExifTool (`ftp-bridge/exiftool-wrapper.mjs`) menyematkan:
    - `IPTC:Headline` = Judul Gambar
    - `IPTC:Caption-Abstract` = Teks Prompt Lengkap
    - `IPTC:Keywords` = 30-50 Tag Microstock Relevan
    - `XMP-dc:Rights` = Nama Kontributor / Lisensi
- **Antrean Upload Multi-Agensi Otomatis**:
  - Setelah metadata tersemat, file langsung didorong ke antrean FTP/SFTP agensi tujuan yang aktif.

---

## 📅 4. Roadmap & Tahapan Implementasi

| Fase | Modul Utama | Status | Deskripsi Pekerjaan |
| :--- | :--- | :---: | :--- |
| **Fase 1** | **Tracking & Visual Tagging** | ✅ **Selesai** | Implementasi baseline diffing, atribut DOM `data-metagen-*`, badge visual mengambang di tab Flow, dan hydration registry. |
| **Fase 2** | **Sinkronisasi Rasio Gambar** | 🟡 **Berikutnya** | Otomatisasi pemilihan aspek rasio (1:1, 16:9, 9:16) di interface Flow sebelum prompt dieksekusi. |
| **Fase 3** | **Modul 2K/4K Downloader** | 📋 Terjadwal | Mengintegrasikan fitur klik menu opsi, zoom 50% pre-scan, dan pemicu unduh 2K/4K massal langsung dari panel Meta-Gen. |
| **Fase 4** | **Jembatan Folder & ExifTool** | 📋 Terjadwal | Auto-watch folder unduhan oleh FTP Bridge untuk langsung menyematkan metadata IPTC dan masuk antrean kirim. |
| **Fase 5** | **UI Extension Popup & Settings**| 📋 Terjadwal | Pembaruan antarmuka popup extension: indikator status tab Flow, pengaturan delay unduhan, dan manajemen lisensi/token. |

---

## 🔒 5. Keamanan, Anti-Banned, & Standar Kebijakan Chrome

1. **Manifest V3 100% Compliant**: Tidak menggunakan evaluasi kode jarak jauh (*no remote code evaluation/eval*), seluruh logika terbundel lokal.
2. **Human-like Timing & Jeda Aman**:
   - Delay acak (*jitter*) 250ms - 500ms pada setiap event pengetikan dan klik.
   - Batch interval 3 - 5 detik antar prompt untuk menjaga akun Google dari pembatasan kuota (*rate limiting*).
3. **Pemberian Izin Minimal (Least Privilege)**:
   - Hanya menggunakan permission: `storage`, `downloads`, `activeTab`, dan `scripting`.
   - Host permissions terbatas pada domain relevan (`*.flow.google.com`, `*.labs.google`).

---

*Dokumen ini diperbarui secara berkala seiring berjalannya siklus rilis Meta-Gen Microstock Suite.*
