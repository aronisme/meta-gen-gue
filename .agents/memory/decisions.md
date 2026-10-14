# Architectural & Product Decisions

## [2026-10-10] Edge Runtime for AI Generation API Routes
- **Context**: Rute generasi AI (`/api/generate/openai`, `/api/generate/gemini`, `/api/generate/gemini-video`) bertindak sebagai proksi validasi dan penerus permintaan dari peramban ke API eksternal.
- **Decision**: Menetapkan `export const runtime = 'edge'` pada seluruh rute API generasi.
- **Rationale**: Edge runtime menawarkan waktu boot instan (*zero cold-start overhead*), efisiensi memori yang jauh lebih tinggi daripada container serverless standar, dan latensi minimum untuk streaming data atau streaming respons.
- **Consequences & Constraints**: Tidak dapat menggunakan API Node.js tradisional yang berat seperti `fs` atau library native C++. Semua manipulasi file menggunakan Web API standar (`fetch`, `Uint8Array`, `atob`).

## [2026-10-10] Client-Side Image Resizing (Max 1024px via Canvas)
- **Context**: File foto yang dihasilkan kamera fotografer seringkali berukuran 20MB–50MB dengan resolusi 6000x4000 piksel ke atas. Mengunggah gambar mentah langsung ke model AI memboroskan bandwidth, lambat, dan memicu penolakan *payload size limit*.
- **Decision**: Melakukan downscaling di sisi klien menggunakan `OffscreenCanvas` (`lib/resize.ts`) dengan panjang sisi terpanjang dibatasi maksimal 1024px pada kualitas JPEG/PNG 0.92.
- **Rationale**: Resolusi 1024px merupakan *sweet spot* optimal untuk model Vision AI (GPT-4o & Gemini Flash/Pro) untuk mendeteksi subjek, tekstur, dan tulisan secara jelas tanpa menghabiskan token multimodal berlebih atau memperlambat unggahan.
- **Consequences & Constraints**: Pengguna tetap mengekspor CSV dengan nama file asli; gambar asli tidak terdistorsi di disk pengguna karena proses resize hanya dilakukan secara virtual di memori browser.

## [2026-10-10] Resumable Video Ingestion via Google Gemini Files API
- **Context**: Video klip microstock (MP4, MOV, WebM) berukuran puluhan hingga ratusan megabyte dan tidak dapat dikirim secara inline base64 dalam satu payload HTTP POST standar tanpa risiko batas payload atau timeout.
- **Decision**: Menggunakan Gemini Files API dengan protokol upload *resumable/chunked* dua tahap (inisiasi lalu streaming binary), diikuti polling loop status hingga file bernilai `ACTIVE` sebelum dieksekusi oleh model AI.
- **Rationale**: Memungkinkan model Gemini menganalisis video dengan durasi penuh dan frame temporal nyata tanpa membebani server lokal atau membuat koneksi HTTP putus di tengah jalan.
- **Consequences & Constraints**: Fitur video saat ini eksklusif untuk provider Google Gemini. UI menampilkan peringatan otomatis apabila pengguna memilih provider OpenAI ketika terdapat file video di antrean unggahan.

## [2026-10-10] Strict JSON Schema & Structured Outputs
- **Context**: Model bahasa besar (LLM) sering menyisipkan teks obrolan, markdown code fence, atau mengubah struktur kunci JSON secara tidak terduga, yang dapat merusak parsing frontend.
- **Decision**: Menggunakan *Structured Outputs* dengan skema ketat (`json_schema` strict pada OpenAI dan `responseSchema` OBJECT pada Gemini).
- **Rationale**: Menjamin 100% kepatuhan struktur data kembalian `{ title: string, description: string, keywords: string }` tanpa memerlukan regex ekstraksi yang rentan galat.
- **Consequences & Constraints**: Seluruh model AI yang digunakan harus mendukung mode output skema terstruktur.

## [2026-10-10] Local-First Storage Architecture (IndexedDB & LocalStorage)
- **Context**: Pengguna memerlukan riwayat metadata, kemampuan mengedit hasil di lain waktu, dan ekspor ulang tanpa harus membuat akun atau menyimpan data di database server terpusat.
- **Decision**: Menggunakan IndexedDB via `idb-keyval` untuk penyimpanan riwayat generasi (termasuk thumbnail data URL) dan `localStorage` untuk preferensi pengguna serta API key.
- **Rationale**:
  - Nol biaya server database.
  - Privasi data pengguna 100% terjaga (API key dan foto tidak disimpan di server pembuat aplikasi).
  - Bekerja secara instan dan dapat digunakan secara offline untuk melihat riwayat.
- **Consequences & Constraints**: Riwayat terikat pada browser/perangkat spesifik pengguna. Jika cache/storage peramban dibersihkan, data riwayat akan terhapus kecuali sudah diekspor dalam bentuk CSV.

## [2026-10-10] Microstock 2026 CSV Compliance & Platform Adapters
- **Context**: Setiap marketplace microstock memiliki aturan format CSV yang sangat spesifik dan mudah menyebabkan rejection (Freepik mewajibkan delimiter `;` dan tag `_ai_generated`, Shutterstock mewajibkan 7 kolom dengan kategori teks, Adobe melarang koma pada judul maks 70 char, Vecteezy membedakan mode FTP vs Add Data).
- **Decision**: Memisahkan format internal master dengan platform-specific adapters di `lib/csv.ts`. Menggunakan pemisah titik koma untuk Freepik/Magnific dan koma untuk agensi lain, serta otomatisasi sanitasi judul Adobe Stock.
- **Rationale**: Menjamin 100% penerimaan batch upload pada seluruh portal agensi tanpa intervensi manual dari pengguna.

## [2026-10-10] Category Taxonomy Auto-Assignment & Semantic Dedupe
- **Context**: Pengguna sering menghabiskan waktu manual memilih kategori, dan pembersih kata kunci lama hanya melakukan exact match sehingga variasi spam seperti `car, car ride, driving car` atau kata subjektif terlarang (`beautiful`, `cute`) lolos.
- **Decision**: Membuat modul taksonomi `lib/categories.ts` (21 kategori Adobe + 26 kategori Shutterstock) dan memperluas prompt serta skema AI untuk mengusulkan kategori otomatis. Memperkuat `cleanKeywords` dengan penyaring kata subjektif terlarang, deduplikasi bentuk jamak/tunggal, dan pembatasan frekuensi kata dasar.
- **Rationale**: Menghasilkan metadata berkualitas komersial tinggi, hemat slot keyword, dan siap pakai langsung tanpa repetisi.

## [2026-10-11] UI Layout Architecture: Single-Thumbnail Card, Adaptive Hierarchy & Column View Toggle
- **Context**: Terdapat duplikasi visual (thumbnail muncul ganda di header dan body kartu). Di samping itu, grid 2 kolom tetap pada panel hasil menyebabkan kartu menyempit drastis (~270px) di layar laptop ketika sidebar Studio dibuka, yang menyebabkan dropdown kategori dan input *Releases* saling tumpang tindih dan terpotong.
- **Decision**:
  1. Menghilangkan thumbnail kedua di body kartu, mengandalkan thumbnail tunggal yang bersih di header kartu di sebelah nama file dan timestamp.
  2. Mengalokasikan 100% lebar kartu untuk input Title dan Textarea Description sehingga teks tidak lagi tertekan.
  3. Mengubah layout kategori menjadi grid adaptif (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`) dengan aturan CSS `w-full min-w-0 max-w-full overflow-hidden truncate` pada `SelectTrigger`.
  4. Menjadikan grid `ResultsCard` adaptif (`grid-cols-1 xl:grid-cols-2`) dan menyematkan kontrol tampilan tombol interaktif di bilah atas: **Auto**, **1 Kolom** (leluasa), dan **2 Kolom** (grid).
- **Rationale**: Menyediakan pengalaman visual yang lega, menghilangkan tabrakan elemen form pada berbagai ukuran layar (*fully responsive*), dan memberikan kebebasan bagi pengguna untuk memilih mode tampilan sesuai gaya kerja mereka.
- **Consequences & Constraints**: Komponen `SelectTrigger` harus selalu memiliki `min-w-0` agar Radix UI Select tidak meluap ke luar kolom grid induknya.

## [2026-10-11] Studio UI Polish: Iconography Standardization, Reduced Sidebar, Enlarged Thumbnail Lightbox & Auto Asset Type
- **Context**: 
  1. Terdapat teks internal/teknis ("Dual Proxy Active" dan "Model B Split-View") yang tidak relevan bagi pengguna akhir microstock.
  2. Penggunaan emoji teks membuat antarmuka terasa kurang konsisten di berbagai sistem operasi.
  3. Lebar panel samping (kolom kontrol) terlalu dominan (41.7% di layar besar), menyisakan ruang yang relatif sempit untuk panel hasil.
  4. Thumbnail 64x64px terlalu kecil untuk kontributor menginspeksi subjek, komposisi, dan detail visual gambar/video.
  5. Pengguna memerlukan fleksibilitas agar model AI dapat mendeteksi tipe aset (foto vs ilustrasi) secara otomatis tanpa harus mengganti setting manual sebelum generate.
- **Decision**:
  1. Menghapus teks/badge "Dual Proxy Active" dan "Model B Split-View" dari seluruh antarmuka.
  2. Menstandarkan seluruh ikonografi dengan library vektor Lucide (`Zap`, `Sparkles`, `Upload`, `FolderOpen`, `History`, `X`, `Maximize2`, `Camera`, `PenTool`, `Video`) dan mengeliminasi emoji di seluruh UI.
  3. Mempersempit lebar side panel menjadi `lg:col-span-4 xl:col-span-3` (25%-33%), memperlebar panel hasil menjadi `lg:col-span-8 xl:col-span-9` (66%-75%).
  4. Memperbesar thumbnail preview menjadi 112px–144px (`w-28 h-28 sm:w-36 sm:h-36`) serta menyematkan modal Lightbox interaktif (klik thumbnail untuk memperbesar resolusi penuh).
  5. Menambahkan nilai `'auto'` pada `FileType` yang menjadi opsi default di dropdown Tipe Asset; prompt model AI dioptimalkan untuk mendeteksi tipe media dan memetakan flag `illustration` secara otomatis.
- **Rationale**: Meningkatkan kepuasan visual, mempercepat alur kerja kontributor, dan memberikan ruang optimal untuk peninjauan metadata.
- **Consequences & Constraints**: Ketika `fileType === 'auto'`, penentuan flag `illustration` di CSV diputuskan berdasarkan output deteksi visual model AI (`parsed.illustration`).

## [2026-10-11] Sesi Tugas (Task Session) Model Berbasis Paradigma Dokumen Kerja (MS Office Model)
- **Context**: Sebelumnya, setiap penambahan batch gambar/video baru di UI akan menimpa array `items`, sehingga kontributor kehilangan hasil generasi sebelumnya dan harus mengekspor CSV terpisah per batch kecil.
- **Decision**: Mengadopsi paradigma "Dokumen Kerja" (seperti dokumen baru di MS Office):
  1. Dalam satu sesi tugas aktif, penambahan file bersifat akumulatif (`items` tidak di-reset; item baru di-append).
  2. Seluruh aset yang digenerate dalam satu sesi tugas akan diekspor bersama ke dalam satu file CSV yang sama.
  3. Tombol `+ Sesi Tugas Baru` bertindak sebagai *File > New Document* (mengosongkan kanvas kerja untuk sesi batch terpisah).
  4. Riwayat (`HistoryCard.tsx`) menyajikan tab default *Per Sesi Tugas* lengkap dengan tombol *Buka Sesi Tugas* untuk me-restore kanvas kerja aktif kapan saja.
  5. Menambahkan skema `GenerationSession` di IndexedDB (`lib/store.ts`) dan inline rename judul sesi tugas di `ResultsCard.tsx`.
- **Rationale**: Sesuai dengan alur kerja nyata kontributor microstock yang mengelompokkan portofolio mereka per sesi pemotretan/proyek ke dalam satu CSV batch upload.

## [2026-10-11] Multimodal Video Vision via Browser Keyframe Sampling & Chronological Interleaving
- **Context**: 
  1. Penggunaan Google Gemini Files API langsung dengan token GAS Proxy menghasilkan galat `400 API_KEY_INVALID` karena token proksi `sk_live_...` bukan Google Cloud AI Studio API key resmi.
  2. Upstream provider lain (Mistral/Pixtral, Groq, OpenAI) tidak mendukung upload file video mentah (MP4/MOV).
  3. Model vision memiliki kecenderungan bias awal (*first image primacy bias*) jika menerima deretan gambar mentah tanpa penanda waktu kronologis.
- **Decision**:
  1. Mengimplementasikan ekstraksi 5 keyframe merata (10%, 30%, 50%, 70%, 90% durasi) langsung di peramban menggunakan HTML5 Canvas & Video API dengan penempatan DOM off-screen dan sinkronisasi `requestVideoFrameCallback` (`lib/video.ts`).
  2. Mengarahkan seluruh video ke gateway terpadu GAS Proxy (`/api/generate/proxy`) dengan payload multi-frame `imageDataUrls`.
  3. Menyusun prompt berselang-seling (*chronological interleaving*): menyematkan label `[Keyframe 1 of 5 (START - ~10%)]` hingga `[Keyframe 5 of 5 (END - ~90%)]` serta instruksi sintesis temporal agar model merangkum pergerakan/aksi keseluruhan adegan video, bukan hanya satu frame.
  4. Menyematkan strip 5 Frame Kunci visual di kartu UI item dan Lightbox (`MetadataItem.tsx`).
- **Rationale**: Ekstraksi di browser hanya memakan waktu ~200-400ms, sangat hemat bandwidth (tidak mengunggah ratusan MB video), universal untuk semua provider/model AI, dan memanfaatkan rotasi key Google Sheet di GAS AI Proxy secara penuh.

## [2026-10-11] Removal of Edge Runtime on Proxy Route (Node.js Default for Windows Next.js Stability)
- **Context**: Rute `/api/generate/proxy` dengan `export const runtime = 'edge'` memicu galat runtime fatal `ENOENT: no such file or directory, open '...route_client-reference-manifest.js'` di Next.js 15 dev mode pada sistem operasi Windows.
- **Decision**: Menghapus `export const runtime = 'edge'` dari `app/api/generate/proxy/route.ts` dan menggunakan runtime Node.js standar bawaan Next.js.
- **Rationale**: Menghilangkan galat manifest ENOENT pada Windows, mempertahankan performa transmisi HTTP streaming yang stabil, dan kompatibel 100% dengan Fetch API dan Buffer base64 multi-image.

## [2026-10-13] Multi-Stage Anti-Duplicate Upload Protection (Studio & FTP Queue)
- **Context**: Kontributor sering mengekspor file AI atau merender ulang gambar yang sama dengan timestamp berbeda (contoh: `..._20261011224436.jpg` vs `..._20261011213958.jpg`), atau tidak sengaja memasukkan file yang sama dua kali dalam satu sesi kerja. Hal ini memboroskan kuota/token generasi AI dan berisiko mengunggah file ganda ke marketplace microstock.
- **Decision**:
  1. Membuat modul sentral `lib/dedupe.ts` yang menyaring duplikasi melalui 4 lapisan:
     - Lapisan 1: Kesamaan nama persis (*exact filename*).
     - Lapisan 2: Kesamaan hash binary SHA-256 (*exact content hash* via `computeFileFingerprint`).
     - Lapisan 3: Kesamaan visual hash perseptual (16x16 grayscale aHash via Canvas untuk gambar).
     - Lapisan 4: Normalisasi *stem* nama file (pembersihan timestamp/serial hasil render) + kecocokan ukuran byte file.
  2. Mengintegrasikan filter otomatis di `StudioPanel.tsx` dan `UploadCard.tsx` saat drop/picker file; menolak file kembar dan menampilkan toast informatif kepada pengguna.
  3. Memvalidasi ulang di `runGeneration()` sebelum permintaan AI dikirim.
  4. Menerapkan *Intra-Queue Deduplication* di `FtpManagerModal.tsx` agar file kembar di antrean otomatis ditandai `⚠️ Kembar di antrean dengan [nama file]` dan otomatis tidak dicentang (*unchecked*) saat opsi *Lewati duplikat* aktif.
## [2026-10-13] Dedicated Left App Side Rail & Multi-Module Workspace Architecture
- **Context**: Aplikasi bertumbuh dari sekadar metadata generator menjadi platform all-in-one bagi kontributor microstock dan AI visual creator. Pengguna memerlukan navigasi modul utama yang terpisah (Metadata Generator, Prompt Img Generator, dan Keyword Research) dengan estetika side-rail minimalis mirip strip ikon vertikal ChatGPT/VS Code tanpa mengganggu navigasi internal (Studio, Riwayat, Antrean Upload, Kelola Akun) yang sudah ada.
- **Decision**: Mengimplementasikan arsitektur navigasi dua tingkat (*Two-Tier Navigation Architecture*):
  1. **Tier 1 - Primary Left Side Rail (`AppSideRail.tsx`)**: Bilah navigasi vertikal ramping (`w-16` di desktop) di sisi kiri layar dengan ikon interaktif, active pill highlight, badge notifikasi ("Baru"), hover tooltips elegan, tombol bantuan modal (*Product Tour*), dan avatar profil.
     - **Metadata Generator**: Modul utama pengelolaan aset gambar/video, metadata AI, dan Multi-FTP sync.
     - **Prompt Img Generator**: Modul perancangan prompt gambar AI komersial (Midjourney v6, FLUX.1 Pro, SDXL) dengan preset gaya foto komersial, vektor, 3D render, rasio aspek, pencahayaan, dan copy space.
     - **Keyword Research**: Modul eksplorasi kata kunci mikrostock populer, topik tren, tag cloud interaktif, dan pengukur batas kuota tag agensi (35-50 kata kunci).
  2. **Tier 2 - Secondary Module Sub-Tabs**: Navigasi horizontal di dalam masing-masing modul. Di modul Metadata Generator tetap terdapat 4 sub-halaman: **[Studio]**, **[Riwayat]**, **[Antrean Upload]**, dan **[Kelola Akun]**.
  3. **Responsif**: Di layar mobile/tablet kecil, bilah samping bertransformasi menjadi top pill rail horizontal yang ringkas.
## [2026-10-14] Local FTP Bridge Architecture for Cloudflare Pages Deployment
- **Context**: Saat aplikasi di-deploy ke Cloudflare Pages (`https://meta-gen-gue.pages.dev`), browser tidak dapat membuka socket TCP mentah untuk FTP/SFTP langsung, dan Cloudflare Pages Functions memiliki batas ukuran payload 100MB serta batas waktu eksekusi (timeout) 30 detik.
- **Decision**: Mengembangkan server jembatan lokal mandiri berbasis Node.js (`ftp-bridge/server.mjs`) yang berjalan di port `45678`.
- **Rationale**:
  - Mengeliminasi batas payload: file video ratusan MB dapat langsung diunggah melalui jaringan lokal (*loopback*).
  - Menggunakan library native Node.js: `ssh2-sftp-client` (SFTP port 22) dan `basic-ftp` (FTP/FTPS port 21).
  - Menyediakan penanaman (*embed*) biner metadata IPTC/XMP lokal langsung di PC sebelum file dikirim.
  - Nol biaya bandwidth server Cloudflare dan mendukung Private Network Access (PNA) dari origin HTTPS.

## [2026-10-14] Cross-Origin Profile Synchronization (Edge LevelDB Recovery & accounts.json)
- **Context**: Setelah beralih dari `http://localhost:3000` ke Cloudflare Pages (`https://meta-gen-gue.pages.dev`), browser mengisolasi database IndexedDB berdasarkan aturan *Same-Origin Policy* sehingga seluruh akun FTP yang telah dimasukkan pengguna terlihat hilang.
- **Decision**: Mengekstrak data mentah 6 profil akun FTP microstock dari database LevelDB Microsoft Edge lokal (`000007.log`). Menyimpannya secara permanen di file lokal komputer `ftp-bridge/accounts.json` (dikecualikan dari git via `.gitignore`). Menambahkan endpoint `/api/ftp/profiles` pada bridge lokal dan auto-pull pada `lib/ftp/store.ts`.
- **Rationale**: Menghindarkan pengguna dari keharusan mengetik ulang kredensial, serta memastikan akun FTP tetap tersinkronisasi lintas domain (localhost, Cloudflare Pages, atau aplikasi desktop).

## [2026-10-14] Keep-Alive Tab State & Background Upload Queue Architecture
- **Context**: Sebelumnya, perpindahan tab di `app/page.tsx` menggunakan *conditional unmounting* React (`{tab === 'upload' && <FtpQueueView />}`), yang menyebabkan komponen antrean dihancurkan saat pengguna berpindah tab sehingga proses upload terhenti dan status kembali ke nol.
- **Decision**: Mengubah mekanisme tab menjadi pembungkus CSS `block` / `hidden` sehingga seluruh komponen tetap terpasang (*mounted*) di memori. Di `FtpQueueView.tsx`, status antrean dipertahankan saat pemindaian ulang, proses upload dikunci dengan `isUploadingRef` dan `AbortController`, serta ditambahkan indikator live pada tombol tab, bilah samping, dan widget mengambang di pojok kanan bawah.
- **Rationale**: Memungkinkan pengguna melanjutkan pekerjaan di Studio atau Riwayat sementara batch upload video/gambar berukuran besar tetap berjalan mulus di latar belakang.

## [2026-10-14] Silent Windows Auto-Start & Global CLI (metagen-bridge & GitHub 1-Liner)
- **Context**: Pengguna merasa repot harus menjalankan terminal manual setiap hari saat menyalakan PC, dan menginginkan cara instalasi otomatis 1-baris seperti tool CLI modern dari GitHub.
- **Decision**:
  1. Membuat runner VBScript `ftp-bridge/run-hidden.vbs` yang mengeksekusi server via Windows Script Host dengan window style `0` (100% senyap tanpa jendela console CMD).
  2. Memasang file ke folder Windows Startup (`%APPDATA%\...\Startup\MetaGen-FTP-Bridge.vbs`).
  3. Mendaftarkan CLI global `metagen-bridge` via field `"bin"` di `package.json` dan `npm link`.
  4. Menyediakan script instalasi 1-baris langsung dari repositori GitHub via PowerShell: `irm https://raw.githubusercontent.com/aronisme/meta-gen-gue/main/install.ps1 | iex`.
- **Rationale**: Pengalaman pengguna tanpa hambatan (*frictionless*) di mana backend selalu otomatis siap di latar belakang begitu komputer menyala.
