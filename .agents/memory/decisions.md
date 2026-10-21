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

## [2026-10-15] Mandatory Anti-Slop Filter for AI Agents
- **Context**: Kode dan antarmuka pengguna yang dihasilkan oleh coding agent AI rentan terperangkap dalam pola template generik ("AI slop") seperti palet ungu/cyan klise, tombol kapsul/rounded tanpa variasi, teks buzzwords ("AI-Powered, Seamless"), tombol/interaksi mati tanpa fungsi nyata, serta tata letak yang rusak di perangkat mobile.
- **Decision**: Menetapkan kewajiban bagi seluruh AI agent yang bekerja di repositori ini untuk mengaktifkan dan mematuhi panduan skill `antislop` (beserta rangkaian sub-skill: `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`).
- **Rationale**: Menegakkan standar keahlian desainer profesional (*Craftsmanship Standard* C-1 s/d C-5):
  1. *Purpose-Gate*: Setiap teknik visual harus memiliki alasan yang jelas, bukan sekadar dekorasi bawaan AI.
  2. *Hard Gate Compliance*: Wajib kontras warna WCAG AA (R-25), navigasi dan elemen interaktif 100% berfungsi (R-24 & R-26), dukungan keyboard (R-32), tata letak mobile sempurna tanpa overflow (R-03), dan melarang klaim/statistik palsu (R-17 & R-36).
  3. Menjamin UI terasa berkarakter, unik, dan nyaman digunakan oleh kontributor profesional microstock.
- **Consequences & Constraints**: Setiap perancangan atau audit komponen UI wajib menerapkan filter ini, baik di mode *during* (saat pengerjaan) maupun *after* (audit).

## [2026-10-15] Visual Concept Prompt Agent (VCPA) Architecture
- **Context**: Sistem generator prompt sebelumnya di tab `Prompt Img Generator` hanya menggabungkan string statis (subjek + suffix preset) menjadi 1 prompt tunggal secara offline tanpa kecerdasan buatan, tanpa dukungan citra acuan (image reference), dan tanpa diversitas konsep.
- **Decision**: Menghapus sistem perakit statis lama dan menggantinya dengan arsitektur **Visual Concept Prompt Agent (VCPA)** terstruktur:
  1. *Dual Mode*: Mode 1 (Dengan Citra Referensi untuk ekstraksi Visual DNA) dan Mode 2 (Ideasi Brief Teks Bebas).
  2. *Visual DNA Separation*: Membedakan *observed* (fakta visual), *inferred* (suasana/tafsir), *anchors* (elemen identitas yang dikunci), *variables* (variabel kreatif yang diubah), dan *semantic theme*.
  3. *Batch Diverse Generation*: Menghasilkan N prompt (1, 5, 10, 20) yang tersebar di beragam sumbu kreatif (sudut pandang kamera, pencahayaan, material, narasi, copy-space komersial).
  4. *Multi-Engine Tailoring*: Sintaks otomatis khusus Midjourney v6.1 (`--ar`, `--style raw`, `--v 6.1`, `--no`), FLUX.1 (deskriptif natural tanpa watermark), dan SDXL (pemisahan prompt positif dan negatif).
  5. *Failover Edge Route*: Menyediakan endpoint `/api/generate/prompt-agent` di Next.js App Router dan Cloudflare Pages Functions (`functions/api/generate/prompt-agent.ts`) dengan rotasi proxy multi-cluster.
  6. *Local Persistence & Export*: Menyimpan state ke `localStorage` dan menyediakan export batch ke format TXT dan JSON.
- **Rationale**: Menghasilkan prompt komersial berkualitas tinggi yang siap dieksekusi di generator eksternal dengan variasi konseptual mendalam dan nol duplikasi malas (anti-slop).
- **Consequences & Constraints**: Perubahan ini membutuhkan koneksi AI (GAS Proxy, Gemini, atau OpenAI) untuk menghasilkan batch prompt, namun tetap mempertahankan kontrol fallback yang anggun jika kuota habis.

## [2026-10-16] Unified Vision Model Selection for Prompt Agent & Planned FTP Bridge Optimization
- **Context**:
  1. Pengguna memiliki berbagai model vision pada proxy GAS AI (misal Gemini, Claude, Groq/Llama-vision, Mistral-vision) yang sebelumnya terfilter atau hanya mengandalkan Gemini di Mode 1.
  2. Proses upload FTP via local bridge dirasakan lebih lambat dibandingkan upload langsung ke web portal agensi karena arsitektur per-file TCP/SSH teardown dan eksekusi sekuensial murni.
- **Decision**:
  1. Menghapus batasan hardcoded vision model pada Mode 1 sehingga seluruh model vision kustom yang didaftarkan pengguna di proxy GAS dapat dipilih dan dirotasikan secara otomatis oleh algoritma failover.
  2. Merencanakan arsitektur optimasi FTP Bridge untuk sesi kerja berikutnya:
     - *Persistent Connection / Session Reuse*: Menggunakan kembali sesi client SFTP/FTPS aktif tanpa re-handshake dan re-auth per file.
     - *Controlled Concurrency*: Mengizinkan 2–3 stream upload paralel terkontrol pada antrean UI.
     - *Pipelining*: Menyematkan metadata secara asinkron mendahului antrean upload file berikutnya.
- **Rationale**: Memaksimalkan fleksibilitas AI multimodal dan memangkas waktu tunggu upload FTP massal hingga 60–70% tanpa melanggar batasan rate-limit agensi microstock.

## [2026-10-16] Dynamic Best-Seller Title Prompt Architecture & Comma-Free Compliance
- **Context**: Judul yang dihasilkan generator sebelumnya selalu terkunci pada formula repetitif yang diakhiri frasa kaku `"Concept for [X] and [Y]."`. Di samping itu, Adobe Stock CSV secara ketat melarang tanda koma pada kolom judul (koma dapat merusak parsing CSV atau memicu penolakan).
- **Decision**:
  1. Merombak `defaultInstruction` di `app/page.tsx` untuk melarang pengulangan frasa `"Concept for..."` pada setiap aset.
  2. Memberikan kebebasan komposisi kalimat alami (1–2 kalimat) yang dipisahkan secara eksklusif oleh tanda titik (`.`) tanpa koma.
  3. Memperkenalkan 4 variasi penutup judul:
     - *Representasi & Metafora*: `"Representing..."`, `"A representation of..."`, `"Symbolizing..."`.
     - *Kebutuhan Komersial / Utility*: `"Ideal for website banner / editorial..."`, `"Designed for marketing campaign..."`.
     - *Tata Letak / Spatial*: `"...with copy space for advertising text."`, `"...isolated on white background with clipping path."`.
     - *Deskriptif Organik Murni*: Tanpa embel-embel konsep paksaan untuk subjek visual yang sudah jelas (makanan, satwa, lanskap, potret).
- **Rationale**: Menghasilkan judul yang kaya variasi, terdengar alami seperti ditulis kurator profesional, memaksimalkan SEO mesin pencari Adobe Stock, dan 100% aman diekspor ke CSV tanpa merusak struktur kolom.

## [2026-10-16] Google Identity Services (GIS) & Google Sheets Whitelist Authentication Architecture
- **Context**: Dibutuhkan sistem login berbasis Gmail / Google Account untuk mengontrol akses pengguna, mengelola kuota, dan mencegah penyalahgunaan resource AI tanpa menambah biaya infrastruktur server baru pada aplikasi static export di Cloudflare Pages.
- **Decision**:
  1. Memanfaatkan **Google Identity Services (GIS / OAuth 2.0 Web SDK)** di sisi frontend (React / Next.js) dengan tombol resmi "Sign in with Google" dan dukungan One-Tap.
  2. Menggunakan backend **Google Apps Script (GAS) Proxy** yang sudah ada untuk memverifikasi ID Token Google resmi via endpoint `https://oauth2.googleapis.com/tokeninfo?id_token=...`.
  3. Menjadikan Google Sheets sebagai basis data identitas pengguna dengan menambahkan tab **`Users`** (kolom: Email, Name, Role, Status, DailyQuota, UsageCount, LastLogin).
  4. Menyediakan mode kontrol akses fleksibel: **Whitelist Ketat (Private/Tim)** dan **Auto-Register (Freemium/Kuota Harian)**.
- **Rationale**:
  - Nol biaya operasional server (0 USD / bulan).
  - Keamanan standar industri dengan enkripsi dan tanda tangan kriptografis dari Google.
  - Kompatibel 100% dengan hosting static di Cloudflare Pages dan database Google Sheets yang sudah aktif digunakan oleh proyek.

## [2026-10-16] Mode 2 Isolation, Schema Optimization & Expanded AI Brainstorm Ideation
- **Context**: Mode 2 (Text-Only Ideation) pada tab Prompt Img Generator mengalami sejumlah galat:
  1. State `imageDataUrl` dan `visualDna` yang tersisa dari Mode 1 tetap terkirim ke backend dan proxy AI sehingga diproses keliru sebagai request multimodal.
  2. Instruksi schema JSON AI mewajibkan object `visualDna` padahal tidak ada gambar acuan, yang menghabiskan 400+ token sia-sia dan memicu galat timeout/truncation pada batch prompt.
  3. Tombol `+ Ide AI Baru` tidak memiliki opsi input topik spesifik dan hanya menghasilkan 5 ide terbatas.
- **Decision**:
  1. Menjamin isolasi ketat Mode 2: `imageDataUrl` dan `visualDna` di-reset ke `null`/`undefined` saat beralih atau generate di Mode 2.
  2. Mengondisikan schema JSON pada `buildVCPAPromptInstruction`: Mode 2 hanya meminta output array `prompts` murni (tanpa payload `visualDna`), memangkas latensi dan penggunaan token.
  3. Mengintegrasikan panel pop-down interaktif pada `+ Ide AI Baru` dengan kolom input topik spesifik (misal: "Kuliner Nusantara", "Smart City") serta pilihan jumlah ide (5, 10, 15, 20 dengan default 10).
  4. Memperluas katalog inspirasi kurasi `CURATED_INSPIRATION_POOL` menjadi 36+ tema dan menaikkan kuota default inspirasi menjadi 10 ide.
- **Rationale**: Menghilangkan galat timeout pada Mode 2 dan memberikan kontrol eksplorasi ide yang jauh lebih kaya dan terarah bagi kreator.

## [2026-10-16] Universal Clipboard Image Paste (Ctrl+V) Support
- **Context**: Pengguna sering mengambil tangkapan layar (screenshot via Snipping Tool/PrintScreen) atau menyalin gambar dari peramban/editor dan ingin langsung memasukkannya ke dropzone tanpa harus menyimpan file ke disk lokal terlebih dahulu.
- **Decision**: Mengintegrasikan penangkap clipboard `paste` (Ctrl+V) secara global dan pada elemen dropzone di:
  1. `components/PromptGeneratorView.tsx` (Dropzone Image Reference Mode 1, dengan auto-switch jika sedang di Mode 2).
  2. `components/StudioPanel.tsx` (Dropzone aset utama Studio).
  3. `components/UploadCard.tsx` (Komponen dropzone file card).
- **Rationale**: Mempercepat alur kerja kreator (*zero friction*), otomatis menamai file tangkapan clipboard dengan nama yang bersih (`Pasted_Ref_...png`), dan tetap mempertahankan fungsi paste teks biasa di textarea/input tanpa konflik.

## [2026-10-17] Google OAuth 2.0 Web Client & Spreadsheet Whitelist Implementation
- **Context**: Mengimplementasikan kredensial Google Cloud Console OAuth 2.0 Web Client (`61908502532-85bvlf6i8safupsefop9n3hflbodrthe.apps.googleusercontent.com`) secara end-to-end pada backend Google Apps Script dan frontend Next.js.
- **Decision**:
  1. Menggunakan Google Identity Services (GSI) SDK di `components/GoogleAuthModal.tsx` dengan auto-render button resmi dan fallback yang tangguh.
  2. Mengimplementasikan tab `Users` di `gas/Code.gs` dengan 8 kolom: `Email`, `Name`, `Role`, `Status`, `DailyQuota`, `UsageCount`, `LastLogin`, `CreatedAt`.
  3. Menyematkan verifikasi ID token via `UrlFetchApp` ke endpoint Google `https://oauth2.googleapis.com/tokeninfo?id_token=...` serta pencocokan audience `aud` dengan Client ID.
  4. Menerapkan reset otomatis kuota pemakaian saat pergantian hari (00:00) berbasis tanggal `LastLogin`.
  5. Menghubungkan avatar dinamis di `components/AppSideRail.tsx` dengan badge status (Hijau = Aktif Whitelist, Kuning = Pending Approval, Merah = Diblokir) dan meter kuota sisa di header `app/page.tsx`.
- **Rationale**: Memastikan akses AI terkontrol dengan kuota yang adil tanpa biaya database server terpusat.
## [2026-10-17] Cloudflare D1 Serverless SQL Database & Edge Auth Architecture
- **Context**: Kebutuhan migrasi dari Google Sheets ke database SQL berlatensi rendah (~0.2ms) yang terintegrasi langsung dengan Cloudflare Pages Functions tanpa cold-start, untuk autentikasi, kuota harian, riwayat generasi, sesi, akun FTP, dan upload ledger.
- **Decision**:
  1. Menggunakan **Cloudflare D1 (`metagen-db`)** region Singapura (`SIN`) dengan binding `DB` di `wrangler.toml`.
  2. Merancang 6 tabel relasional di `schema.sql`: `users`, `metadata_history`, `generation_sessions`, `ftp_accounts`, `upload_ledger`, dan `user_settings`.
  3. Mengarahkan verifikasi auth Google OAuth 2.0 ID Token langsung di Edge via `functions/api/auth/google.ts` dan pre-flight quota check di `functions/api/generate/proxy.ts`.
- **Rationale**: Menghilangkan latensi tinggi Google Apps Script (dari ~1.5–3 detik menjadi <100ms) dan memberikan isolasi ACID transaction untuk data pengguna.

## [2026-10-17] Auth & Sync Hardening: BOLA Protection, WIB Quota Reset Engine, Zombie-Free Sync, and D1 Batching
- **Context**: Audit menyeluruh terhadap sistem autentikasi dan sinkronisasi menemukan 5 kerentanan/hambatan kritis:
  1. Broken Object-Level Authorization (BOLA) pada `/api/sync` di mana request hanya mengandalkan query string `email` tanpa validasi kepemilikan token.
  2. Penguncian kuota permanen akibat perbandingan tanggal UTC vs WIB (`Asia/Jakarta`) yang meleset 7 jam serta logika reset yang hanya berjalan saat full re-login.
  3. Pemotongan kuota prematur sebelum AI berhasil mengembalikan metadata JSON, merugikan pengguna jika terjadi timeout cluster AI.
  4. Fenomena "Zombie Data" di mana data sesi atau akun FTP yang dihapus lokal bangkit kembali saat sinkronisasi cloud D1.
  5. Latensi push cloud tinggi akibat loop eksekusi SQL sekuensial (N+1) pada Cloudflare D1.
- **Decision**:
  1. **BOLA Enforcement**: `functions/api/sync.ts` memvalidasi Google ID Token resmi via Google tokeninfo dan mencocokkan `token.email === userEmail`. Semua request sync dari client (`lib/sync/engine.ts`) wajib menyertakan token ini.
  2. **WIB Daily Quota Engine**: Helper `getWibDateString()` menggunakan `Intl.DateTimeFormat` dengan timezone `Asia/Jakarta`. Pengecekan reset kuota diaktifkan otomatis di pre-flight `proxy.ts` dan tombol "Segarkan Kuota" (`get_user_status`).
  3. **Delayed Quota Deduction**: Pemotongan kuota D1 hanya dieksekusi setelah model AI sukses mengembalikan JSON valid. Di frontend, `currentUser` reaktif ter-update instan per item yang selesai.
  4. **Zombie-Free Deletion**: Menambahkan endpoint `delete_session` dan `delete_ftp_account` di D1 sync API, dan mengaitkannya langsung saat user menghapus sesi di `app/page.tsx` atau akun FTP di `lib/ftp/store.ts`.
  5. **D1 Batching & IndexedDB Optimization**: Mengganti query sekuensial D1 dengan `db.batch()` dalam pecahan 100 statement per chunk. Di frontend, menggunakan `getMany()` dan `setMany()` dari `idb-keyval`.
  6. **Settings Overwrite Guard**: Isolasi penyimpanan preferensi pengguna via `isSettingsInitialized` ref di `app/page.tsx` dan `triggerSync` flag pada `lib/store.ts` untuk mencegah setting D1 tertimpa nilai default perangkat baru.
- **Rationale & Consequences**: Menjamin integritas data, keamanan akses per pengguna, akurasi perhitungan kuota tepat jam 00:00 WIB, performa push sub-detik (<200ms), serta pengalaman pengguna yang mulus tanpa kehilangan kuota akibat kegagalan jaringan.

## [2026-10-17] Multi-Tenant Client-Side Storage Isolation, Local Bridge User Binding & Logout Sanitization
- **Context**: Pada perangkat bersama atau saat berganti akun login (misal `T-Neon` atau `Hunter`):
  1. Cache IndexedDB (`history-v1:*`, `sessions-v1:*`, `metagen_ftp_accounts_v1`) bersifat global dan tidak terisolasi per email, sehingga pengguna baru di browser lama melihat 322 riwayat dan 6 akun milik pengguna sebelumnya.
  2. Local FTP Bridge (`ftp-bridge`) mengembalikan seluruh 6 akun di `accounts.json` ke sembarang browser di PC yang sama jika IndexedDB kosong.
  3. Logout sebelumnya hanya menghapus auth token di `localStorage` tanpa menyeka state memori dan cache browser.
- **Decision**:
  1. **User-Scoped Storage Namespaces**: Seluruh key di IndexedDB dan localStorage diisolasi dengan prefix email pengguna: `hist:${userEmail}:${id}`, `sess:${userEmail}:${sessionId}`, `metagen_ftp_accounts_${userEmail}`, `metagen_upload_ledger_${userEmail}`, dan `gen_settings_${userEmail}`.
  2. **Local FTP Bridge Identity Binding**: Endpoint `/api/ftp/profiles` pada `ftp-bridge/server.mjs` menerima parameter `?userEmail=...` dan hanya mengembalikan akun yang cocok dengan email pemanggil (profil legacy dialokasikan ke admin utama `sr7aron@gmail.com`).
  3. **Comprehensive Logout Sanitization**: Handler `handleLogout` di `app/page.tsx` menyeka seluruh state UI aktif (`items`, `files`, `sessions`, `currentSession`, `hist`, `selectedIds`, `ftpProfilesCount`) dan mengarahkan kembali ke Beranda.
- **Rationale & Consequences**: 100% mencegah kebocoran data riwayat dan kredensial agensi antar-pengguna pada browser yang sama maupun browser berbeda di PC yang sama, memenuhi standar privasi dan keamanan multi-tenant.

## [2026-10-17] VCPA Prompt Generator Session Architecture: Zero Extra Clicks, Prepending, and Unified Bulk Export
- **Context**: Pada modul Visual Concept Prompt Agent (VCPA):
  1. Pengguna meminta alur kerja berbasis sesi mirip Metadata Studio, namun menolak friksi tombol manual "Tambah ke Sesi".
  2. Kurator membutuhkan hasil generate terbaru langsung muncul di posisi teratas canvas (prepending) agar tidak perlu scroll ke bawah saat batch terus bertambah.
  3. Dibutuhkan kemampuan unduh sekaligus semua prompt di sesi aktif dalam beragam format (CSV terstruktur Excel, Queue TXT untuk bot render, TXT dokumen lengkap, JSON arsip).
  4. Perlu audit sinkronisasi fitur: penghapusan kartu satuan (`Trash2`), regenerasi in-place, inline edit judul & teks prompt, serta penyesuaian format sintaks saat berpindah engine AI atau rasio.
- **Decision**:
  1. **Zero-Click Session Accumulation (Auto-Add)**: Setiap kali `handleGenerate` selesai, prompt baru otomatis terakumulasi ke dalam sesi aktif di canvas dan IndexedDB tanpa memerlukan klik tombol tambahan.
  2. **Prepending Newest Prompts**: Batch prompt baru di-prepend ke array (`[...newBatch, ...prev]`) dengan penanda visual "Terbaru" di kartu pertama.
  3. **Unified Bulk Export Suite**:
     - `exportPromptsToCsv`: RFC 4180 standard dengan UTF-8 BOM, judul kolom terstandar, dan escaping tanda kutip ganda untuk Microsoft Excel dan Google Sheets.
     - `exportPromptsToQueueText`: Format baris per baris bersih untuk batch queue di Midjourney bot, ComfyUI, dan SD WebUI.
     - `exportPromptsToText`: Format dokumen teks naratif lengkap memuat strategi kreatif dan rationale.
     - `exportPromptsToJson`: Arsip terstruktur JSON komprehensif.
     - `Salin Semua`: Copy 1-klik seluruh baris prompt ke clipboard.
  4. **Multi-Tenant Prompt Session Store (`lib/prompt-agent/store.ts`)**:
     - Kunci penyimpanan diisolasi via `getUserScope()`: `prompt_sess:${scope}:${id}` dan `prompt_active:${scope}`.
     - Modal `PromptSessionModal` untuk manajemen riwayat sesi (pencarian, preview snippet, pemuatan ke workspace, unduh CSV langsung, dan hapus sesi).
  5. **Card-Level Operations Synchronization**:
     - Ditambahkan tombol hapus kartu satuan (`Trash2`).
     - Regenerasi prompt per-kartu ter-update di tempat tanpa melompat ke atas.
     - Pergantian engine AI atau aspect ratio secara reaktif memformat ulang sintaks seluruh kartu prompt di canvas.
- **Rationale & Consequences**: Menghadirkan alur kerja kurasi microstock berkecepatan tinggi, bebas friksi klik, bebas kontradiksi status UI, serta terisolasi aman antar akun pengguna.

## [2026-10-18] Google Flow Automation: Chrome DevTools Protocol (CDP) Hardware-Level Dispatch & Stop Icon Render Lifecycle Monitoring
- **Context**: Pada integrasi pembuatan gambar otomatis dari Meta-Gen Studio ke Google Flow (`flow.google.com` / `labs.google/fx/tools/flow`):
  1. Pengguna menginginkan kontrol per kartu prompt via tombol `✨ Gen Img` (bukan render otomatis massal sekaligus).
  2. Google Flow menggunakan ProseMirror (`contenteditable`) dan Angular Ivy / Zone.js. Ekstensi browser biasa yang menginjeksikan event JavaScript sintetis (`btn.click()`, `new KeyboardEvent('keydown', { key: 'Enter' })`) selalu gagal karena browser menandai event tersebut dengan `isTrusted: false`. ProseMirror dan Angular secara otomatis mengabaikan event tidak tepercaya (`isTrusted: false`).
  3. Perlu mendeteksi kapan proses render Flow sedang berjalan vs selesai secara presisi untuk menarik gambar hasil generasi.
- **Decision**:
  1. **CDP Hardware-Level Dispatch (`chrome.debugger`)**:
     - Menambahkan permission `"debugger"` pada `extension/manifest.json`.
     - Pada `extension/background.js`, mengimplementasikan `executeCdpSubmission` yang menempelkan debugger sementara (`chrome.debugger.attach`) ke tab Flow.
     - Mengirim `Input.dispatchKeyEvent` (tombol Enter) dan `Input.dispatchMouseEvent` (klik tombol submit pada koordinat tombol yang dihitung oleh content script).
     - Seluruh event dari CDP dieksekusi di level engine Chromium/OS dan memiliki status **`isTrusted: true`**, sehingga berhasil melewati filter keamanan Angular Ivy & ProseMirror.
  2. **Visual Lifecycle Monitoring via `<mat-icon>stop</mat-icon>`**:
     - Saat Flow mulai merender, ikon tombol submit berganti dari `arrow_forward` menjadi `stop` (`<mat-icon>stop</mat-icon>`).
     - Membuat helper `isFlowGenerating()` di `extension/flow-bridge.js` yang melacak ikon `stop` secara real-time.
     - Selama ikon `stop` aktif, ekstensi menampilkan notifikasi waktu nyata dan menunggu.
     - Begitu ikon `stop` hilang / berganti kembali, ekstensi mengetahui secara pasti bahwa render selesai, mendeteksi elemen gambar terbaru, mengonversi ke Base64, dan mengirimkan kembali ke card prompt di Meta-Gen.
     - Batas waktu polling diperpanjang menjadi 180 detik.
- **Rationale & Consequences**: Menjamin 100% keandalan submit tanpa terhalang isolasi Zone.js/ProseMirror, memberikan feedback status visual yang jelas kepada pengguna, dan mencegah penarikan gambar prematur saat render masih berlangsung.

## [2026-10-19] Local FTP Bridge v1.2.0: Phil Harvey's ExifTool Lossless Multi-Format Engine & Real-Time Byte-Level Stream Tracking
- **Context**:
  1. Pengunggahan metadata microstock sebelumnya hanya mendukung injeksi biner buffer native JS untuk `.jpg` dan `.png` ([ftp-bridge/embed.mjs](file:///c:/App%20Tools/meta-gen-gue/ftp-bridge/embed.mjs)). File footage video (`.mp4`, `.mov`) dan vektor (`.eps`, `.svg`) terunggah tanpa metadata tertanam, sehingga kontributor harus mengisi ulang title dan keywords secara manual di dashboard agensi (Adobe Stock, Shutterstock, Dreamstime).
  2. Pada UI antrean ([components/FtpQueueView.tsx](file:///c:/App%20Tools/meta-gen-gue/components/FtpQueueView.tsx)), upload menggunakan pemanggilan `fetch()` standar yang tidak memiliki event progress. Selama proses pengiriman file video berukuran 50MB - 300MB, progress bar tertahan di 30% dan tampak macet (*frozen*) sebelum melonjak langsung ke 100%.
- **Decision**:
  1. **Smart Dual-Engine ExifTool & Fallback ([ftp-bridge/exiftool-wrapper.mjs](file:///c:/App%20Tools/meta-gen-gue/ftp-bridge/exiftool-wrapper.mjs))**:
     - Mengintegrasikan Phil Harvey's ExifTool (terdeteksi v13.59 resmi) sebagai engine utama penyematan metadata multi-format lossless untuk foto (`.jpg`, `.jpeg`, `.png`, `.tif`, `.webp`, `.psd`), vektor (`.eps`, `.svg`), dan video footage (`.mp4`, `.mov`, `.m4v`).
     - Injeksi otomatis tag QuickTime (`DisplayName`, `Description`, `Keywords`) dan XMP pada file video MP4/MOV agar diakui langsung oleh bot Adobe Stock Video dan Shutterstock.
     - Eksekusi menggunakan file argumen temporary (`-@ argfile`) ber-encoding UTF-8 untuk menjamin integritas karakter khusus, tanda kutip ganda, dan karakter non-ASCII di Windows.
     - Transparent Fallback: Jika ExifTool offline/tidak ditemukan, bridge secara transparan melakukan fallback ke native JS buffer injector ([ftp-bridge/embed.mjs](file:///c:/App%20Tools/meta-gen-gue/ftp-bridge/embed.mjs)) untuk file JPEG & PNG tanpa throw error.
  2. **Byte-Level Stream Tracking & Polling Endpoint ([ftp-bridge/server.mjs](file:///c:/App%20Tools/meta-gen-gue/ftp-bridge/server.mjs))**:
     - Mengimplementasikan `Transform` stream pada upload SFTP dan `trackProgress` pada FTP (`basic-ftp`) untuk menghitung byte aktual yang diterima server remote per `uploadId`.
     - Menyediakan endpoint `GET /api/ftp/progress?id=...` yang menyiarkan byte terunggah, persentase, dan kecepatan transfer.
     - Menyediakan endpoint `POST /api/metadata/embed` untuk injeksi metadata standalone langsung ke file tanpa upload.
  3. **Real-time UI Progress Bar & Monitoring ([components/FtpQueueView.tsx](file:///c:/App%20Tools/meta-gen-gue/components/FtpQueueView.tsx))**:
     - Mengganti `fetch()` statis dengan `uploadWithXhr` (`XMLHttpRequest.upload.onprogress`) dikombinasikan dengan polling berkala ke `/api/ftp/progress`.
     - Menampilkan progress bar halus (0–100%), counter byte aktual (`14.2 / 48.0 MB`), kecepatan instan (`⚡ 3.4 MB/s`), status fase transfer, dan badge verifikasi engine metadata (`ExifTool` / `IPTC & XMP`).
     - Memperbarui `FtpBridgeStatusBanner` dengan badge `✨ ExifTool Active (v13.59)` dan menambahkan script `pnpm bridge:status` & `pnpm bridge:exiftool` di `package.json`.
- **Rationale & Consequences**: Memberikan transparansi transfer 100% tanpa efek *freezing*, menjamin penanaman metadata otomatis pada file footage video, dan menjaga kompatibilitas penuh dengan sistem lama berkat arsitektur fallback cerdas.

## [2026-10-21] Semantic Scene Disambiguation: Google Flow Agent Multi-Scene vs True Single-Prompt Variations
- **Context**: 
  1. Di Google Flow, satu eksekusi dapat menghasilkan banyak gambar dalam dua skenario yang berbeda:
     - *Kasus A (True Variations)*: Satu prompt tunggal menghasilkan 2–4 gambar alternatif dari konsep yang sama.
     - *Kasus B (Agent Mode Multi-Scene)*: Satu master prompt menghasilkan adegan berbeda (Scene 1, Scene 2) yang dirender sebagai baris kanvas independen dengan teks prompt unik masing-masing.
  2. Sebelumnya, logika di `flow-bridge.js` menganggap setiap kali gambar baru > 1 sebagai variasi dari prompt pertama (`#1 (A)` dan `#1 (B)`), menyebabkan tertukarnya adegan dan gagal terisinya kartu prompt kedua di Meta-Gen Studio.
- **Decision**:
  1. **Diferensiasi Prompt Otomatis**: Memeriksa teks prompt aktual tiap baris kanvas via `extractTilePromptText()`. Jika baris memiliki prompt yang berbeda drastis, bridge menonaktifkan pelabelan sub-variasi `(A)/(B)`.
  2. **Pencocokan Semantik per Adegan (`findBestMatchingScene`)**: Teks kartu kanvas dicocokkan ke array `scenes` yang dikirim dari Studio. Kartu adegan 2 (*Top-down aerial*) dipetakan ke ordinal 2 (`⚡ MetaGen #2`), dan kartu adegan 1 (*Low-angle*) dipetakan ke ordinal 1 (`⚡ MetaGen #1`).
  3. **Multi-Card Result Grouping**: Bridge mengelompokkan hasil unduhan berdasarkan `cardId` (`results: [...]`), memungkinkan Meta-Gen Studio memperbarui seluruh kartu target secara simultan.
  4. **State Persistence & Passive Hydration**: Menyimpan `metagen_agent_scenes` di `chrome.storage.local` saat prompt disalin, memungkinkan `hydrateFlowBadges()` secara pasif mengenali dan menempelkan badge semantik bahkan ketika pengguna menempelkan prompt secara manual ke panel obrolan Google Flow Agent.
- **Rationale & Consequences**: Menjamin 100% presisi asosiasi visual adegan di kanvas Flow, menghilangkan bug kartu kosong di Studio, dan mempertahankan kebebasan alur kerja pengguna (baik via tombol otomatis maupun paste manual).

## [2026-10-21] Google Flow Dashboard Auto-Project Initialization: New Project Button Detection & Transition
- **Context**: 
  1. Ketika Google Flow dibuka untuk pertama kali (URL `https://flow.google.com/`), pengguna berada di halaman dashboard / daftar proyek, bukan di kanvas project (`/project/...`).
  2. Pada halaman dashboard, kotak prompt (ProseMirror / Angular `flow-prompt-box`) belum ada. Untuk masuk ke kanvas pembuatan gambar, pengguna harus mengklik tombol FAB Material `Project baru` (`button.new-project-button`).
  3. Jika Meta-Gen memicu pembuatan prompt saat tab Flow masih di halaman dashboard, bridge sebelumnya langsung gagal dengan pesan error *"Kotak prompt Google Flow tidak ditemukan"*.
- **Decision**:
  1. **Deteksi Multi-Selektor Tombol `Project baru` (`findNewProjectButton`)**:
     - Memeriksa `button.new-project-button`, `button.mat-mdc-extended-fab.new-project-button`, `button[mat-fab][extended]`.
     - Memeriksa teks tombol ("Project baru", "Proyek baru", "New project", "Create project") dan ikon `<mat-icon>add</mat-icon>`.
  2. **Simulasi Klik Hardware Lengkap (`clickNewProjectButton`)**:
     - Mengirimkan sekuens event pointer & mouse terpercaya (`pointerover`, `pointerenter`, `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) dengan scroll ke tengah viewport untuk kompatibilitas penuh dengan Angular Material FAB & Zone.js.
  3. **Auto-Project Navigation Guard (`ensureActiveProject`)**:
     - Dipanggil di pre-flight `handleFlowGeneration` dan endpoint `FLOW_ENSURE_PROJECT`.
     - Otomatis mengklik tombol `Project baru` jika kanvas belum aktif, menampilkan toast notifikasi *"Membuka Project baru otomatis..."*, dan menunggu transisi URL `/project/` serta inisialisasi ProseMirror editor hingga 15 detik.
  4. **Resilient Editor Polling**: Menambahkan toleransi polling 6 detik pada pencarian editor prompt pasca-transisi navigasi.
- **Rationale & Consequences**: Menghilangkan hambatan manual saat pertama kali membuka Google Flow, memungkinkan eksekusi otomatis ujung-ke-ujung (Zero Extra Clicks) dari Meta-Gen Studio langsung ke kanvas render Flow.

## [2026-10-21] Google Flow Agent Mode Auto-Activation: Toggle Chip State Detection & Multi-Tier Trigger
- **Context**: 
  1. Di dalam kanvas proyek Google Flow (`https://flow.google.com/project/...`), terdapat toggle chip mode Agen (`<flow-agent-mode-toggle-chip>`).
  2. Ketika tombol Agen mati/tidak aktif: `<flow-agent-mode-toggle-chip>` tidak memiliki kelas `checked` dan `<button class="agent-mode-chip" aria-pressed="false">`.
  3. Ketika tombol Agen aktif/menyala: `<flow-agent-mode-toggle-chip class="checked">` dan `<button class="agent-mode-chip agent-mode-chip-checked" aria-pressed="true">` memiliki elemen glow (`.glow-fill`, `.glow-outline`).
  4. Untuk eksekusi prompt multi-scene berstruktur Agent (seperti dari tombol *Agent Batch*), Google Flow wajib berada dalam status Agen Aktif. Jika tidak aktif, Flow hanya memperlakukan prompt sebagai pembuatan gambar standar tunggal.
- **Decision**:
  1. **Deteksi Status Presisi (`isAgentModeActive`)**:
     - Menguji apakah chip memiliki kelas `checked`, tombol memiliki `aria-pressed="true"`, atau elemen `.glow-fill` hadir di DOM.
     - Jika sudah aktif, sistem **tidak akan mengklik** (menghindari toggle off yang tidak disengaja).
  2. **Multi-Tier Activation Trigger (`clickAgentModeButton` & `ensureAgentModeActive`)**:
     - Jika terdeteksi tidak aktif (`aria-pressed="false"`), ekstensi memicu sekuens klik 3 lapis: DOM pointer/mouse, eksekusi aman di MAIN World Zone.js (`TRIGGER_MAIN_WORLD_CLICK_AGENT_MODE`), dan klik fisik hardware CDP (`TRIGGER_CDP_MOUSE_CLICK`).
     - Menunggu hingga 3.5 detik untuk transisi status tombol ke `checked` / `aria-pressed="true"`.
  3. **Inklusi ke Alur Eksekusi**:
     - Dipanggil otomatis pada Step 0.5 di `handleFlowGeneration` segera setelah kanvas proyek `/project/...` terkonfirmasi aktif.
- **Rationale & Consequences**: Menjamin 100% Google Flow berada di Mode Agen sebelum prompt multi-scene disuntikkan, menghilangkan kebutuhan pengguna menyalakan chip Agen secara manual, dan mencegah salah eksekusi di mode standar.

## [2026-10-21] Google Flow Aspect Ratio & Module Settings Synchronization (Roadmap Fase 2)
- **Context**: 
  1. Di Google Flow, terdapat modul pengaturan popup (`button.settings-trigger-button` dengan ringkasan model, rasio, dan jumlah output).
  2. Modul pengaturan memuat:
     - Switcher Mode: `Gambar` vs `Video` (`flow-toggles[aria-label="Mode"]`).
     - Switcher Rasio Aspek: `16:9`, `4:3`, `1:1`, `3:4`, `9:16` (`flow-toggles[aria-label="Rasio aspek"]`).
     - Switcher Jumlah Output: `x1`, `x2`, `x3`, `x4` (`flow-toggles[aria-label="Jumlah output"]`).
  3. Di Google Flow Agent Mode, instruksi rasio dan jumlah variasi juga dapat disisipkan langsung ke dalam teks prompt (misal: `"in 16:9 aspect ratio"`).
  4. Pengguna membutuhkan sinkronisasi otomatis agar rasio yang dipilih di Meta-Gen Studio langsung diterapkan ke UI Google Flow tanpa klik manual.
- **Decision**:
  1. **Dual-Layer Aspect Ratio Control**:
     - *Layer 1 (Prompt Semantics)*: Teks prompt Agent menyematkan klausul rasio eksplisit (`"in ${aspect} aspect ratio"`).
     - *Layer 2 (UI Switcher Sync)*: Ekstensi membaca ringkasan setelan tombol via `getCurrentFlowSettings()`. Jika rasio sudah cocok dan bukan mode Video, ekstensi tidak perlu membuka popover (Zero Delay).
  2. **Automated Settings Popover Configuration (`ensureFlowSettings`)**:
     - Jika rasio belum cocok atau mode Video aktif:
       1. Klik `button.settings-trigger-button`.
       2. Beralih ke mode `Gambar` jika sebelumnya di mode `Video`.
       3. Memilih rasio target (`16:9`, `1:1`, `9:16`, `4:3`, `3:4`) pada `flow-toggles[aria-label="Rasio aspek"]`.
       4. Menutup overlay dengan tombol `Escape` dan klik backdrop.
  3. **Inklusi Otomatis ke Pre-Flight**: Dipanggil pada Step 0.6 di `handleFlowGeneration` tepat setelah kanvas proyek dan mode Agen aktif.
- **Rationale & Consequences**: Menjamin hasil render di Google Flow 100% konsisten dengan aspek rasio yang dipilih di Meta-Gen Studio, baik untuk single prompt maupun batch generation.



