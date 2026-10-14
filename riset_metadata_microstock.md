# Riset: Formula Metadata Microstock Berkualitas Berbasis AI + Data Pasar

**Tanggal riset:** 10 Oktober 2026  
**Tujuan:** merangkum pola dari repository generator metadata microstock, aplikasi riset Adobe Stock, scraper Apify, dan panduan resmi marketplace; lalu menyusun formulasi yang bisa diimplementasikan pada web app metadata generator.

---

## 1. Ringkasan eksekutif

Kesimpulan paling penting: **metadata terbaik tidak seharusnya dihasilkan dari prompt AI vision saja, dan juga tidak seharusnya menyalin keyword aset populer.** Pendekatan paling kuat adalah pipeline hibrida:

1. **AI vision mengidentifikasi fakta visual** pada aset.
2. **Data pasar menemukan bahasa yang benar-benar digunakan pada aset sejenis**, serta memberi sinyal tentang aset yang performanya terlihat baik.
3. **Ranking dan aturan marketplace memfilter serta mengurutkan kandidat keyword** berdasarkan relevansi, spesifisitas, dan kegunaan bagi pembeli.
4. **Validator deterministik memeriksa aturan** seperti jumlah keyword, duplikasi, bahasa, batas judul, kategori, dan format ekspor.
5. **Human review** memberi kesempatan memperbaiki interpretasi visual, urutan keyword, dan istilah yang tidak akurat.

Dari repositori yang diperiksa:

- [`meta-gen`](https://github.com/UmutHasanoglu/meta-gen) memiliki pola web app yang praktis: bulk image processing, pilihan model, exact keyword count, penyuntingan manual, drag-to-reorder, deduplikasi sederhana, riwayat lokal, dan CSV marketplace.
- [`RJ Auto Metadata`](https://github.com/riiicil/RJ-Auto-Metadata) kuat sebagai contoh pipeline desktop lintas provider, konfigurasi prompt, retry, metadata embedding, dan ekspor per platform.
- [`metadata_tool`](https://github.com/innerfire630/metadata_tool) menyediakan contoh paling jelas tentang implementasi prompt dan parser yang dapat dibaca langsung. Pemeriksaan source-nya juga menunjukkan beberapa celah yang sebaiknya tidak ditiru begitu saja.
- [`Attributor`](https://github.com/Ars-Mond/Attributor) dan [`Xpiks`](https://github.com/andsontan/xpiks) memberi pelajaran penting tentang AI lokal, autocomplete, pustaka keyword, penyuntingan batch, validasi, dan metadata file.
- [`MicrostockIQ`](https://microstockiq.com/) **bukan generator metadata**. Ia lebih tepat diposisikan sebagai alat riset performa aset dan portofolio Adobe Stock, menggunakan Apify ketika perlu mendapatkan data baru.
- Dari Actor Apify yang ditinjau, [`kawsar/adobe-stock-scraper`](https://apify.com/kawsar/adobe-stock-scraper) paling kaya untuk eksperimen analisis metadata karena output yang didokumentasikan mencakup keyword aset, judul, creator, kategori, tanggal, download count, dan atribut media. Ini adalah kandidat alat riset, **bukan bukti bahwa MicrostockIQ memakai Actor tersebut**.

**Rekomendasi utama:** bangun sistem **Vision → Candidate Retrieval → Evidence-weighted Ranking → Compliance Validation → Human Review**, bukan satu kali panggilan LLM yang diminta langsung menghasilkan 49 keyword.

---

## 2. Ruang lingkup dan tingkat kepastian

Riset ini membandingkan repository yang telah dibahas sebelumnya: `meta-gen`, `RJ Auto Metadata`, `metadata_tool`, `Attributor`, dan `Xpiks`; halaman publik MicrostockIQ; serta tiga kandidat Apify Actor untuk scraper Adobe Stock.

Tingkat kepastian dalam dokumen ini:

- **Terdokumentasi:** fitur atau aturan disebut di README, source code yang dapat dibaca, atau dokumentasi resmi.
- **Analisis:** kesimpulan teknis yang diturunkan dari fitur/source yang tersedia.
- **Rekomendasi:** formulasi yang disarankan untuk implementasi baru; angka bobotnya adalah hipotesis awal yang harus diuji, bukan formula resmi dari Adobe atau marketplace.

Pemeriksaan sumber publik tidak sama dengan menjalankan benchmark langsung pada semua aplikasi. Kualitas hasil metadata tiap repository belum diukur pada dataset gambar yang sama. Untuk `meta-gen`, `RJ Auto Metadata`, dan `Attributor`, dokumentasi publik yang tersedia menjelaskan arsitektur dan kontrol prompt, tetapi tidak semua prompt internal berhasil diverifikasi baris demi baris pada audit ini. Untuk `metadata_tool`, file prompt/parser dibaca langsung: [`app/ai/prompts.py`](https://github.com/innerfire630/metadata_tool/blob/main/app/ai/prompts.py).

---

## 3. Audit repository generator metadata

### 3.1 `meta-gen` — fondasi web app yang praktis

**Repo:** https://github.com/UmutHasanoglu/meta-gen  
**Lisensi yang tercantum:** Apache-2.0  
**Stack:** Next.js, React, TypeScript, route API serverless; pilihan provider OpenAI dan Gemini.

#### Pola pembuatan metadata yang terdokumentasi

- Menerima beberapa gambar dalam satu batch.
- Memungkinkan pengguna memilih tipe aset, panjang judul, panjang deskripsi, dan jumlah keyword yang tepat.
- Mengirim gambar yang telah diperkecil pada sisi klien hingga sisi terpanjang maksimal 1024 px agar lebih cepat dan lebih murah.
- Menggunakan system prompt dengan aturan default untuk stock marketplace serta instruksi ekstra per batch.
- Memiliki tombol *Tidy* untuk memangkas spasi, menghapus duplikasi dengan perbandingan case-insensitive, dan membatasi output ke jumlah keyword yang diminta.
- Memungkinkan edit judul/deskripsi, menambah/menghapus keyword, mengurutkan keyword melalui drag-and-drop, dan regenerasi per item.
- Mengekspor CSV untuk Adobe Stock, Shutterstock, Vecteezy, Freepik, dan Dreamstime.
- Menyimpan riwayat di IndexedDB pada browser. API key disimpan pada browser dan dipakai saat memanggil route serverless.

Sumber: [README meta-gen](https://github.com/UmutHasanoglu/meta-gen).

#### Pelajaran yang bisa diambil

1. **Pisahkan hasil generasi dari hasil akhir.** AI mengusulkan metadata; pengguna dan validator masih bisa mengedit serta mengurutkannya.
2. **Gunakan kontrol jumlah sebagai batas, bukan indikator kualitas.** Output 49 keyword tidak otomatis lebih relevan daripada 25 keyword.
3. **Jadikan pengurutan keyword pengalaman utama.** Adobe menyatakan 10 keyword pertama mendapat prioritas lebih besar dalam pencarian; UI yang memudahkan drag-and-drop sangat berguna.
4. **Perhatikan detail visual setelah resize.** Resize ke 1024 px cukup untuk banyak objek umum, tetapi bisa kehilangan tulisan kecil, detail ornamen, atau perbedaan kecil pada aset yang kompleks. Untuk ilustrasi rumit, pertimbangkan preview tambahan/crop detail atau ukuran input adaptif.

#### Keterbatasan yang terlihat

- Tidak memiliki fitur yang terdokumentasi untuk mengambil bukti performa pasar dari aset sejenis.
- Tidak menanamkan metadata XMP/IPTC langsung ke file pada workflow yang dijelaskan; fungsi utamanya generation, editing, dan CSV.
- Kategori dan release untuk Adobe Stock kosong secara default menurut README.
- Dedup yang terdokumentasi adalah case-insensitive dedupe; itu belum sama dengan deteksi sinonim atau keyword spam berulang seperti `car ride`, `car road`, `car drive`.

**Penilaian:** pilihan fondasi terbaik dari daftar ini bila prioritasnya adalah **web app generation dan editing**. Untuk metadata yang benar-benar tajam, lapisan riset pasar, semantic dedupe, dan compliance perlu ditambahkan.

---

### 3.2 `RJ Auto Metadata` — pipeline batch lintas provider/platform

**Repo:** https://github.com/riiicil/RJ-Auto-Metadata  
**Lisensi:** AGPL-3.0  
**Model/Provider:** Gemini, OpenAI, OpenRouter, Groq, Mistral, Blackbox, dan endpoint OpenAI-compatible khusus.

#### Pola yang terdokumentasi

- Memakai model vision-capable untuk menghasilkan title, description, dan keywords.
- Memiliki pilihan *quality* dan pengaturan batas karakter/kata; README menyebut mode Detailed, Balanced, Less, dan Custom.
- Mengizinkan custom instruction, hint untuk gambar, dan injected keywords yang didahulukan pada hasil AI.
- Mendukung batch processing, worker/delay, dan retry.
- Menggunakan ExifTool dengan strategi XMP-first dan mengekspor CSV terpisah untuk Adobe Stock, Shutterstock, 123RF, Vecteezy, Depositphotos, dan Miri Canvas.
- Memproses sejumlah format raster, vektor, dan video; kedalaman embedding berbeda menurut format.

Sumber: [README RJ Auto Metadata](https://github.com/riiicil/RJ-Auto-Metadata).

#### Pelajaran

- **Custom hint berguna untuk menjelaskan konteks yang tidak mudah ditebak dari gambar**, misalnya “isolated icon set”, “seamless pattern”, atau kategori proyek. Namun hint harus berfungsi sebagai konteks yang dapat diuji, bukan instruksi agar model memasukkan istilah yang tidak tampak.
- **Injected keywords jangan langsung dianggap benar.** Kandidat yang dimasukkan pengguna tetap perlu dicek terhadap gambar, dideduplikasi, dan diberi ranking.
- Mode kualitas sebaiknya mengubah tingkat detail dan cakupan, bukan sekadar memperpanjang judul atau menambah kata.
- Retry, worker, delay, dan progress sangat penting untuk batch; semuanya meningkatkan keandalan pipeline tetapi tidak dengan sendirinya meningkatkan ketepatan semantik metadata.

#### Keterbatasan

- Memiliki lisensi AGPL-3.0. Sebelum memakai atau memodifikasinya untuk produk komersial, pahami kewajiban lisensi, terutama bila versi modifikasi dijalankan sebagai layanan jaringan.
- README mengungkap dukungan format yang beragam, tetapi beberapa format hanya didukung sebagian dalam embedding metadata.
- Seperti generator vision lain, sinyal permintaan pasar tidak otomatis hadir hanya karena model menghasilkan keyword yang terdengar profesional.

**Penilaian:** sangat berguna sebagai referensi **arsitektur pipeline dan pemrosesan batch**, khususnya bila nanti membutuhkan provider abstraction, retry, embedding, dan CSV multipatform.

---

### 3.3 `metadata_tool` — prompt terstruktur, kategori, dan audit parser

**Repo:** https://github.com/innerfire630/metadata_tool  
**Lisensi:** pada daftar file publik yang diperiksa, tidak terlihat file `LICENSE` di root; jangan asumsikan bebas dipakai atau didistribusikan secara komersial tanpa konfirmasi pemilik.

Ini repository yang paling berguna untuk memahami detail implementasi prompt karena file [prompts.py dapat dibaca langsung](https://github.com/innerfire630/metadata_tool/blob/main/app/ai/prompts.py).

#### Desain prompt yang dipakai

Source membangun prompt dengan struktur ketat:

- Title diminta berukuran 45–70 karakter.
- Keyword diminta dalam jumlah tepat yang dikonfigurasi, berupa item dipisahkan koma dan diurutkan menurut relevansi.
- Model harus memilih tepat satu kategori Adobe dan satu kategori Shutterstock dari daftar yang sudah disediakan.
- Model diperintahkan mengeluarkan struktur terlabel seperti `TITLE:`, `KEYWORDS:`, `ADOBE_CATEGORY:`, dan `SHUTTER_CATEGORY:` saja.
- Mode Detailed meminta bahasa komersial yang rinci; mode ringkas meminta bahasa langsung.

Source menggabungkan daftar kategori resmi ke prompt, lalu melakukan parsing JSON jika memungkinkan atau parsing baris berlabel bila tidak. Ini jauh lebih terkontrol daripada meminta model menghasilkan metadata dalam prosa bebas.

#### Temuan code-review yang penting

Berdasarkan implementasi [`prompts.py`](https://github.com/innerfire630/metadata_tool/blob/main/app/ai/prompts.py):

1. Parser keyword membelah teks berdasarkan koma, titik koma, atau pipe, membuang nilai kosong, lalu **memotong daftar jika jumlahnya melebihi target**. Parser itu tidak dengan sendirinya membuktikan jumlah selalu tepat jika model menghasilkan terlalu sedikit keyword.
2. Parser keyword yang dibaca tidak melakukan deduplikasi semantik atau deduplikasi huruf besar/kecil pada tahap tersebut.
3. Prompt meminta title minimal 45 karakter, tetapi fungsi normalisasi yang terlihat terutama memangkas judul yang melebihi 70 karakter. Validasi minimal 45 karakter tidak tampak ditegakkan secara deterministik oleh fungsi normalisasi itu.
4. Field `description` ditetapkan sama dengan `title` pada parser yang dibaca. Jadi jangan mengasumsikan tool ini menghasilkan description yang berbeda dan lebih kaya daripada title.
5. Kategori disamakan ke pilihan kategori yang dikenal melalui fungsi pencocokan setelah parsing; ini lebih aman daripada menerima teks kategori bebas, tetapi hasil kategori tetap harus diperiksa.

Ini adalah contoh kenapa **instruksi prompt dan validasi kode harus bekerja bersama**. Menulis “exactly 49 keywords” di prompt saja tidak menjamin output berisi 49 kata unik yang relevan.

#### Pelajaran yang perlu dipertahankan

- Minta output terstruktur, idealnya JSON dengan schema yang tervalidasi.
- Masukkan pilihan kategori yang sah agar model memilih dari taksonomi terbatas.
- Validasi batas dan format setelah generasi; jangan hanya mengandalkan kepatuhan model.
- Pertahankan logika “tidak tahu” atau field kosong untuk atribut yang memang tidak dapat dipastikan dari gambar.

#### Yang perlu diperbaiki pada implementasi baru

- Jika jumlah target `N` adalah 30, hasil validasi harus memastikan `N` keyword **unik setelah normalisasi**, bukan hanya `min(len(keywords), N)`.
- Hindari menambah filler untuk memenuhi jumlah; jalankan tahap candidate expansion yang terpisah dan hanya memasukkan istilah yang lolos relevance check.
- Jangan memaksa `description = title` untuk setiap marketplace; aturan tiap marketplace perlu dipisah.
- Batas panjang harus menjadi validator yang diuji dengan unit test, bukan sekadar kalimat di prompt.

**Penilaian:** nilai terbesarnya adalah contoh **prompt terstruktur + mapping kategori + parsing deterministik**. Namun parser seperti yang saat ini terlihat masih perlu lapisan validasi lebih kuat untuk memenuhi standard produksi.

---

### 3.4 `Attributor` — AI lokal, editing, dan keyword autocomplete

**Repo:** https://github.com/Ars-Mond/Attributor  
**Lisensi:** AGPL-3.0  
**Stack:** Rust, Tauri, SvelteKit, TypeScript; AI vision melalui Ollama.

#### Pola yang terdokumentasi

- AI lokal dapat menghasilkan title, description, keywords, kategori, dan content flags dari gambar tunggal atau batch.
- Pengguna dapat menyimpan hasil/edit di database lokal terlebih dahulu, lalu menulis metadata ke file tanpa re-encoding saat Save.
- Memiliki preset CSV untuk Adobe Stock, Shutterstock, iStock, dan Envato.
- Keyword autocomplete memakai fuzzy search atas 1.000+ istilah fotografi stock, dengan kemampuan promote/remove dan reorder.
- Mendukung JPEG, PNG, dan WebP; tidak mendukung semua format vektor/video yang dibahas pada repo lain.

Sumber: [README Attributor](https://github.com/Ars-Mond/Attributor).

#### Pelajaran

- **Local keyword lexicon + AI vision** bisa lebih konsisten daripada LLM yang dibiarkan membuat seluruh terminologi dari nol.
- Penyimpanan metadata sebagai draft sebelum menulis ke file adalah pola keselamatan yang baik; pengguna dapat meninjau hasil dan membatalkan perubahan.
- Model lokal bukan jaminan kualitas. Kemampuan vision model, ukuran input, prompt, dan aturan validasi tetap menentukan hasil.

**Penilaian:** referensi kuat untuk aplikasi yang mengutamakan privasi/local AI dan workflow editing; bukan sumber demand intelligence dengan sendirinya.

---

### 3.5 `Xpiks` — rekomendasi keyword dari platform dan pustaka lokal

**Repo:** https://github.com/andsontan/xpiks  
**Lisensi:** GPL-3.0  
**Stack:** C++ dan Qt.

#### Pola yang terdokumentasi

- Menambah dan mengedit title, description, serta keyword melalui XMP/IPTC.
- Menyediakan saran keyword dari Shutterstock API, iStock, Fotolia, atau local library.
- Memiliki pemeriksaan ejaan, autocomplete bahasa Inggris, preset keyword, pencarian metadata lokal, dan pemeriksaan masalah sebelum upload.
- Mendukung upload FTP untuk agensi yang didukung serta penanganan file vektor tertentu.

Sumber: [README Xpiks](https://github.com/andsontan/xpiks).

#### Pelajaran

Xpiks mendukung ide penting: **metadata bisa dihasilkan atau ditingkatkan lewat retrieval dari sumber keyword yang sudah ada**, bukan murni melalui text generation. Dalam sistem baru, retrieval sebaiknya menjadi generator kandidat; setelah itu kandidat harus disaring berdasarkan gambar yang sedang diproses.

**Penilaian:** bukan AI generator modern, tetapi referensi bagus untuk autocomplete, kamus, spelling, validasi, dan integrasi keyword suggestion.

---

## 4. Audit MicrostockIQ dan Actor Apify

### 4.1 Apa yang MicrostockIQ lakukan

Situs [MicrostockIQ](https://microstockiq.com/) menjelaskan fungsi pencarian aset Adobe Stock menurut keyword atau contributor ID, filter tipe konten dan AI, serta perbandingan download, tanggal upload, dan performa portofolio. Ia memakai akun Apify pengguna untuk permintaan yang memerlukan discovery atau analisis baru, dan dapat memakai hasil yang sudah tersimpan/cache.

Dokumentasi situs menjelaskan metriknya secara eksplisit:

- **Lifetime downloads:** jumlah unduhan total yang dilaporkan untuk aset tersebut.
- **Avg. downloads/month:** lifetime downloads dibagi usia aset dalam bulan; bukan unduhan aktual di bulan terakhir.
- **Best performance:** pengurutan berdasarkan rata-rata unduhan seumur hidup per bulan untuk aset yang sedang dimuat; tidak memprediksi penjualan masa depan.
- Ringkasan portofolio hanya berlaku untuk aset yang sudah dimuat, bukan keseluruhan portofolio.

Sumber: [MicrostockIQ homepage/help](https://microstockiq.com/).

**Implikasi:** MicrostockIQ berfungsi sebagai lapisan **market research/performance analytics**, bukan generator metadata. Tidak ditemukan repo publik yang bisa dikonfirmasi sebagai source code resmi MicrostockIQ pada pencarian ini. Situs yang ditinjau juga tidak menyebut secara eksplisit nama Actor Apify yang digunakan.

### 4.2 Kandidat Actor Apify yang ditinjau

#### A. [`kawsar/adobe-stock-scraper`](https://apify.com/kawsar/adobe-stock-scraper)

Output yang didokumentasikan mencakup asset ID/title, creator ID/name, kategori, dimensi, tipe media, keyword list, tanggal publikasi, download count, view count, flag AI, dan preview URL. Actor juga mendukung query pencarian, creator portfolio, pagination, penghapusan duplikasi asset ID, filter media, warna, orientasi, transparansi, dan atribut lainnya.

**Kecocokan untuk riset:** kandidat paling kuat dari tiga Actor ini bagi eksperimen keyword karena menghubungkan teks metadata dengan atribut asset serta sinyal download. Tetap perlu diuji kestabilan field, cakupan hasil, biaya, dan kepatuhan terhadap aturan layanan yang relevan.

#### B. [`igolaizola/adobe-stock-scraper`](https://apify.com/igolaizola/adobe-stock-scraper)

Dokumentasi yang diperiksa menampilkan mode keyword search dan creator portfolio, `maxItems`, filter tipe aset, AI, serta urutan seperti relevance/downloads/newest. Contoh output mencakup title, tipe konten, contributor, URL/thumbnail, serta dimensi.

**Kecocokan untuk riset:** baik untuk mengambil sampel hasil pencarian dengan kontrol query/filter/order. Field keyword lengkap dan download count perlu dipastikan berdasarkan output Actor versi yang digunakan; jangan diasumsikan semua field tersedia hanya karena Actor lain mempunyainya.

#### C. [`louisdeconinck/adobe-stock-scraper`](https://apify.com/louisdeconinck/adobe-stock-scraper)

Dokumentasinya memperlihatkan asset ID, judul, format, URL thumbnail, ukuran pixel, author/creator ID, dan content URL. Listing ini lebih lama dibanding sebagian kandidat lain.

**Kecocokan untuk riset:** bisa menjadi pembanding atau fallback, tetapi berdasarkan dokumentasi yang diperiksa, field demand/keyword tidak selengkap output yang didokumentasikan Actor Kawsar.

**Peringatan penting:** MicrostockIQ menggunakan Apify, tetapi belum ada bukti publik yang cukup untuk menyatakan ia menggunakan salah satu dari ketiga Actor di atas. Anggap semuanya sebagai kandidat, bukan identifikasi definitif.

### 4.3 Cara memakai data pasar tanpa menyalin metadata orang lain

Jangan menyalin keseluruhan judul/keyword dari satu aset yang banyak diunduh. Sebaliknya:

1. Cari banyak aset sejenis dari beberapa varian query.
2. Kelompokkan berdasar jenis aset, tujuan visual, jenis media, dan rentang usia.
3. Ekstrak kata dan frasa yang muncul berulang di aset relevan.
4. Hitung dukungan keyword secara agregat pada kelompok aset yang performanya relatif baik.
5. Gunakan hasil tersebut sebagai **prior atau bukti permintaan**, bukan keputusan final.
6. Validasi setiap keyword kandidat terhadap gambar baru; kata yang populer tetapi tidak sesuai harus dibuang.

Download count juga bukan ukuran permintaan murni: ia dapat dipengaruhi usia aset, posisi hasil pencarian, kualitas visual, contributor, musim, histori exposure, dan faktor marketplace lain yang tidak terlihat pada scraper.

---

## 5. Aturan resmi marketplace yang menentukan formulasi

### 5.1 Adobe Stock

Berdasarkan [panduan Adobe Stock tentang judul dan keyword](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html) yang tercatat diperbarui 18 Agustus 2026:

- Judul mesti ringkas dan faktual; idealnya di bawah 70 karakter.
- Gunakan kata benda, sifat, dan konsep yang relevan serta spesifik.
- Maksimal 49 keyword per konten.
- Urutan keyword sangat penting; **10 keyword pertama mendapat pengaruh lebih besar** dalam pencarian.
- Gunakan ejaan lokal yang sesuai bila relevan.
- Keyword dan judul harus menggunakan bahasa sesuai pengaturan bahasa akun Contributor.
- Hindari keyword yang tidak relevan, trademark/brand, nama artis, orang nyata, karakter fiksi, serta referensi IP yang dilarang.
- Gunakan setiap keyword satu kali; hindari pengulangan dan spam.

Referensi:
- [Adobe: Tips for effective titles and keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html)
- [Adobe: Reorder keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/change-order-keywords.html)
- [Adobe: Generative AI guidelines](https://helpx.adobe.com/stock/contributor/submit-your-content/submit-generative-ai-content/generative-ai-content-guidelines.html)

### 5.2 Shutterstock

Berdasarkan [Description and Keyword Best Practices](https://submit.shutterstock.com/help/en/articles/10594702-description-and-keyword-best-practices) dan [Content Publishing Standards: Contextual Metadata](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata):

- Metadata judul/deskripsi ditulis sebagai kalimat atau frasa faktual yang jelas dan unik, bukan daftar kata.
- Judul sebaiknya menyatakan siapa/apa, tindakan, lokasi/setting ketika relevan, serta mood yang benar-benar didukung gambar.
- Keyword harus presisi dan spesifik; aturan publik yang diperiksa menyebut 7–50 keyword dan mengharuskan bahasa Inggris untuk Shutterstock, dengan pengecualian tertentu.
- Jangan mengulang kata/frasa secara berlebihan, menambahkan keyword tidak relevan, atau memasukkan trademark/informasi pribadi yang tidak diizinkan.

Referensi:
- [Shutterstock: Description and Keyword Best Practices](https://submit.shutterstock.com/help/en/articles/10594702-description-and-keyword-best-practices)
- [Shutterstock: Contextual Metadata standards](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata)
- [Shutterstock: How keyword and title spamming are defined](https://submit.shutterstock.com/help/en/articles/10617485-how-are-keyword-and-title-spamming-defined)

### 5.3 Aturan per platform harus terpisah

Jangan membuat satu title/keyword list lalu mengekspornya tanpa penyesuaian ke semua marketplace. Buat `platform_profile` terpisah yang mendefinisikan:

- bahasa metadata;
- batas title/description;
- minimum/maksimum keyword;
- cara memisahkan keyword/frasa;
- kategori yang diperbolehkan;
- field CSV wajib/opsional;
- larangan khusus dan aturan editorial/AI;
- urutan keyword bila marketplace memberi bobot pada urutan.

Contoh: Adobe dan Shutterstock mempunyai aturan bahasa dan format title yang tidak sama. Validator harus bekerja per target marketplace, bukan menilai “lulus stock” secara generik.

---

## 6. Formula metadata berkualitas yang direkomendasikan

Formula berikut adalah **rancangan awal yang dapat diuji**, bukan formula resmi marketplace atau klaim bahwa bobotnya sudah terbukti optimal.

### Tahap A — Analisis visual terstruktur

Gunakan vision model untuk membuat *visual evidence record* sebelum menyusun title dan keywords. Minta model memisahkan apa yang terlihat langsung dengan apa yang hanya interpretasi.

Field yang disarankan:

- `asset_type`: photo, vector, illustration, icon, pattern, background, video, dan lain-lain.
- `primary_subjects`: objek utama beserta confidence.
- `actions_or_state`: tindakan/keadaan yang terlihat.
- `attributes`: warna, jumlah objek, bentuk, tekstur, material, umur/gender hanya jika cukup jelas dan diperbolehkan.
- `setting`: indoor/outdoor, lingkungan, musim/cuaca, lokasi hanya bila benar-benar terlihat/terbukti.
- `composition`: isolated, close-up, overhead, aerial, symmetry, copy space, seamless repeat—hanya jika benar.
- `visual_style`: flat vector, line art, 3D render, watercolor, photorealistic, geometric, minimalist, dan sebagainya bila dapat diidentifikasi dengan yakin.
- `commercial_concepts`: konsep seperti teamwork, sustainability, celebration, security; sertakan confidence dan alasan visual.
- `visible_text`: teks aktual jika terbaca; jangan mengarang OCR.
- `negative_evidence`: kategori atau atribut yang secara eksplisit tidak boleh disimpulkan dari gambar.

**Tujuan tahap ini:** mencegah model beralih dari “apa yang terlihat” menjadi asumsi generik seperti “healthcare”, “business”, atau “sustainability” tanpa bukti visual yang cukup.

### Tahap B — Buat kandidat keyword dari beberapa sumber

Bangun union kandidat dari empat sumber:

1. **Visual labels:** subjek, objek, tindakan, atribut, setting, gaya, komposisi.
2. **Semantic expansion:** sinonim yang wajar, istilah taksonomi (misalnya monstera → houseplant/tropical foliage bila relevan), bentuk tunggal/jamak, dan compound phrase yang benar-benar dipakai pembeli.
3. **Market retrieval:** keyword list dan metadata dari banyak hasil pencarian aset sejenis pada Adobe Stock melalui Actor yang mendukung field tersebut.
4. **Lexicon/autocomplete:** kamus keyword lokal atau layanan suggestion seperti pola pada Xpiks/Attributor.

Semua kandidat menyimpan sumber dan evidence, misalnya:

```json
{
  "keyword": "tropical foliage",
  "sources": ["vision", "market_retrieval"],
  "visual_confidence": 0.92,
  "market_support": 0.63,
  "reason": "The asset visibly shows a tropical leaf illustration"
}
```

Jangan berikan market candidate prioritas otomatis hanya karena banyak aset lain menggunakan istilah tersebut. Setiap kandidat tetap perlu melewati visual relevance gate.

### Tahap C — Ukur sinyal pasar secara hati-hati

Untuk setiap aset referensi, simpan sekurangnya:

- asset ID dan creator ID;
- tanggal/usia aset;
- tipe media dan filter query;
- judul serta keyword list jika tersedia;
- downloads dan indikator performa yang tersedia;
- query asal, waktu pengambilan, dan versi Actor.

Metrik pertama yang mudah dipahami adalah:

`downloads_per_month = lifetime_downloads / max(asset_age_months, 1)`

Ini sejalan dengan metrik sederhana yang ditampilkan MicrostockIQ, tetapi harus diberi label **proxy/rata-rata historis**, bukan penjualan baru atau ramalan.

Agar aset yang sudah sangat lama atau outlier tidak mendominasi, normalisasikan skor per kelompok query + tipe aset, contohnya:

`performance_score = percentile_rank(log1p(downloads_per_month))`

Lalu ukur dukungan keyword `k` di sebuah cohort:

`market_support(k) = weighted_share_of_relevant_assets_containing(k)`

Bobot aset dapat menggabungkan relevansi hasil, performance percentile, recency, dan kesesuaian jenis media. Normalisasikan nilainya ke 0–1. Dokumentasikan kalau `downloadCount` atau `keywordList` tidak tersedia; **jangan mengisi nilai yang hilang dengan tebakan**.

Batasan: hasil pencarian scraper bukan random sample pasar. Urutan ranking, jumlah halaman yang diambil, cache, query wording, creator, umur aset, dan kualitas thumbnail dapat menimbulkan bias. Jalankan beberapa varian query dan bandingkan kelompok aset untuk mengurangi bias.

### Tahap D — Score dan ranking keyword

Bobot awal yang disarankan untuk eksperimen:

`score(k) = 100 × (0.40V + 0.20S + 0.15M + 0.15I + 0.10U) − penalties`

Keterangan:

- `V` = **visual relevance/confidence**: apakah kata itu benar-benar didukung gambar?
- `S` = **specificity**: apakah istilah menjelaskan hal yang cukup khas, bukan hanya kata superumum?
- `M` = **market support**: seberapa sering istilah muncul pada aset referensi yang relevan dan/atau relatif berkinerja baik?
- `I` = **buyer intent/usefulness**: apakah kata membantu pembeli menemukan aset untuk tujuan yang masuk akal, contohnya `isolated`, `seamless pattern`, `copy space`, atau `icon set`—hanya bila benar.
- `U` = **distinctive coverage**: apakah kata menangkap atribut penting yang belum diwakili keyword lain, misalnya warna spesifik, bentuk, sudut kamera, atau teknik ilustrasi?
- `penalties` = penalti/penolakan bagi istilah tak berdasar, trademark, nama/IP terlarang, duplikasi, salah bahasa, istilah spam, atau konsep terlalu jauh dari gambar.

**Gate wajib:** jika `V` di bawah threshold, misalnya 0,65, kandidat tidak boleh lolos hanya karena `M` tinggi. Istilah yang tak didukung secara visual dihapus, bukan diselamatkan oleh popularitas.

Bobot di atas adalah starting point untuk uji internal. Setelah ada data human review dan performa hasil unggahan, bobot bisa disesuaikan; jangan menyebutnya sebagai algoritma ranking resmi Adobe.

### Tahap E — Susun keyword dalam kelompok, lalu urutkan

Susun ranking kandidat melalui kelompok:

1. Subjek utama dan nama objek yang paling spesifik.
2. Objek/aksi sekunder atau relasi yang jelas.
3. Atribut penting: warna, bentuk, material, jumlah, setting, sudut/perspektif.
4. Konsep atau mood yang didukung gambar.
5. Media/teknik/format, bila akurat.
6. Kegunaan desain: background, isolated, copy space, pattern, template, icon set, dan sebagainya—hanya yang terlihat/benar.

Kemudian urutkan berdasarkan score. Untuk Adobe Stock, **10 posisi pertama harus diisi keyword paling penting dan relevan**, bukan kata dengan market popularity tertinggi saja.

Sasaran awal yang layak diuji untuk banyak aset Adobe adalah sekitar 25–35 keyword yang benar-benar relevan, lalu gunakan hingga 49 jika memang ada kandidat berkualitas. Angka 25–35 ini adalah kebijakan produk yang diusulkan, bukan angka wajib Adobe. Jika aset hanya mendukung 18 keyword yang bagus, jangan menambah filler supaya angka terlihat penuh.

Deduplikasi perlu dilakukan pada beberapa tingkat:

- exact case-insensitive duplicate;
- plural/singular yang tidak memberi informasi baru;
- variasi stem berulang yang menyerupai spam;
- frasa dengan maksud identik, misalnya beberapa variasi dari konsep yang sama;
- kata terlalu generik yang tidak menambah retrieval value.

Namun jangan menghapus frasa yang memang memiliki maksud berbeda. Misalnya `plant pot` dan `houseplant` tidak selalu duplikat, walau keduanya berkaitan.

### Tahap F — Susun title berbeda per marketplace

Title bukan sekadar tempat meletakkan keyword. Gunakan pola dasar:

`[subjek utama yang spesifik] + [aksi/keadaan] + [atribut/setting/jenis visual yang paling penting]`

Adobe Stock: prioritaskan ringkas, faktual, dan idealnya di bawah 70 karakter. Shutterstock punya pedoman title/description yang berbeda, termasuk deskripsi faktual dalam bahasa Inggris untuk konten komersial. Maka hasil akhir perlu memakai `title_adapter(platform_profile)`.

Jangan:

- menumpuk daftar keyword dengan koma;
- memasukkan setiap istilah dari keyword list ke title;
- menyebut merek, seniman, karakter, atau IP yang tidak boleh digunakan;
- menegaskan lokasi, demografi, emosi, atau fungsi yang tidak terlihat;
- memakai template title generik untuk seluruh batch.

### Tahap G — Validator deterministik

Sebelum ekspor, validasi secara kode:

- schema JSON lengkap;
- jumlah keyword berada di rentang platform;
- jumlah keyword unik setelah normalisasi;
- title/description sesuai batas dan bahasa marketplace;
- urutan keyword dipertahankan;
- kategori adalah value resmi yang sah;
- trademark/IP/personal identifier yang terlarang terdeteksi;
- field release/editorial/mature/AI tidak diisi oleh tebakan yang tak terverifikasi;
- format CSV, separator, quoting, line ending, dan header tepat;
- nama file tetap cocok dengan file asli;
- tidak ada file sumber yang terhapus bila proses gagal;
- hasil tiap item disimpan atomik sehingga retry tidak menggandakan row CSV.

Jika output gagal validasi, kirim hanya bagian yang gagal kembali ke model atau tandai untuk pemeriksaan manual. Hindari regenerate seluruh metadata jika hanya ada satu keyword duplikat.

---

## 7. Prompt dasar yang dapat dijadikan awal

Template ini merupakan rancangan baru yang menggabungkan pelajaran dari repository yang diperiksa dan aturan metadata resmi. Ini bukan prompt internal yang diklaim berasal dari salah satu repo.

```text
You are a meticulous commercial stock metadata editor.
Analyze the supplied asset and produce metadata grounded in visible evidence.

First separate:
A. directly observable visual facts;
B. reasonable commercial concepts supported by those facts;
C. uncertain details that must not be asserted.

Do not invent objects, actions, demographics, locations, materials, text,
brand names, artist names, fictional characters, or use cases.
Do not include irrelevant trends or copy another asset's title/keyword sequence.
Use the selected marketplace's language and constraints.

TITLE:
- Describe the main subject and the most distinctive visible attribute.
- Use natural factual wording, not a comma-separated list of keywords.
- Follow the target platform's length and language constraints.

KEYWORDS:
- Generate candidates from the visual facts first.
- Include specific subject terms, key attributes, action/setting where visible,
  and medium/composition/use-case terms only when accurate.
- Rank the most important and precise terms first.
- Keep each keyword/phrase distinct; remove redundant stems and synonyms
  that do not add meaning.
- Market research is a secondary relevance signal, never permission to add
  a term unsupported by the image.
- Return fewer strong candidates rather than padding with irrelevant terms.

CATEGORIES:
- Choose only from the supplied allowed category list.
- If confidence is insufficient, return null for review rather than guessing.

Return only valid JSON following the supplied schema.
```

### Output schema yang disarankan

```json
{
  "title": "string",
  "description": "string or null",
  "keywords": [
    {
      "term": "string",
      "score": 0,
      "evidence": ["visual", "market", "use_case"],
      "confidence": 0.0
    }
  ],
  "category": "allowed_category_or_null",
  "content_flags": {
    "generative_ai": null,
    "editorial": null,
    "mature": null,
    "isolated": null,
    "copy_space": null,
    "seamless_pattern": null
  },
  "warnings": []
}
```

Dalam implementasi, `generative_ai` harus datang dari status provenance aset atau keputusan contributor, bukan disimpulkan dari tampilan visual. Flag lain yang kritis juga harus dapat dikonfirmasi manusia.

---

## 8. Contoh hasil formulasi

**Aset contoh:** ilustrasi vektor minimal berupa daun monstera dalam pot, objek tunggal di latar putih. Contoh ini mengasumsikan bahwa ciri-ciri tersebut benar-benar tampak pada gambar.

**Title Adobe Stock:**

`Minimal monstera illustration in a pot on white background`

**Keyword ranking awal:**

1. monstera
2. houseplant
3. tropical foliage
4. botanical illustration
5. potted greenery
6. plant pot
7. leaf
8. indoor decor
9. isolated object
10. vector illustration
11. flat design
12. minimalist
13. green foliage
14. home decoration
15. decorative element
16. nature
17. organic form
18. simple shapes
19. modern design
20. white background
21. cutout
22. botanical art

Tambahkan `copy space`, `seamless pattern`, atau istilah lain hanya jika komposisi benar-benar mendukungnya. Untuk Shutterstock, terapkan aturan bahasa, title, dan jumlah keyword Shutterstock secara terpisah; jangan mengekspor set ini tanpa validasi platform.

Contoh ini mengilustrasikan metode, bukan hasil benchmark performa keyword pada Adobe Stock.

---

## 9. Cara membuktikan formula lebih baik

Tidak ada dasar untuk mengklaim bahwa prompt tertentu adalah “terbaik” tanpa membandingkannya pada dataset yang sama. Uji dengan desain evaluasi berikut.

### Dataset

Mulai dengan 100–300 aset yang mencakup foto, ilustrasi/vektor, icon, background, dan pattern. Untuk setiap aset, minta reviewer manusia menandai fakta visual, title yang diterima, top keyword yang relevan, kategori, dan keyword yang tidak boleh digunakan.

### Eksperimen pembanding

- **A — Vision-only:** model vision langsung menghasilkan title/keywords.
- **B — Vision + deterministic validator:** hasil A melalui dedupe dan compliance rules.
- **C — Vision + lexicon retrieval:** kandidat digabung dengan autocomplete/kamus keyword.
- **D — Vision + market retrieval:** kandidat ditambah istilah agregat dari aset sejenis di Adobe Stock.
- **E — Full hybrid:** vision + retrieval + ranking + validator + human review.

Gunakan model, input gambar, dan target marketplace yang sama pada semua kelompok.

### Metrik evaluasi

- `Precision@10`: berapa proporsi dari sepuluh keyword pertama yang dinilai relevan oleh reviewer.
- `Visual grounding rate`: proporsi keyword yang dapat dibuktikan dari gambar atau konteks yang sah.
- `Coverage`: apakah objek/aksi/atribut penting yang terlihat sudah terwakili.
- `Duplicate/spam rate`: jumlah keyword redundan atau term yang melanggar kebijakan.
- `Title accuracy`: ketepatan subjek dan atribut pada title.
- `Platform compliance rate`: hasil yang lolos validator untuk target platform.
- `Human edit rate`: seberapa sering reviewer mengubah atau menghapus kata.
- `Cost and latency per asset`: biaya dan waktu setiap metode.

Sesudah publikasi, download dan penghasilan dapat menjadi indikator lanjutan, tetapi bukan metrik tunggal kualitas metadata. Kinerja aset dipengaruhi visual, topik, persaingan, usia, waktu publikasi, dan faktor distribusi. Jangan menganggap korelasi keyword dengan aset populer sebagai bukti sebab-akibat.

---

## 10. Arsitektur web app yang direkomendasikan

```text
Upload asset
    ↓
Image normalization + preview / optional crop
    ↓
Vision evidence extraction (structured JSON)
    ↓
Candidate generator ──┬── visual labels + synonym expansion
                       ├── local lexicon/autocomplete
                       └── Adobe Stock market retrieval via Apify
    ↓
Visual-grounding gate + risk/compliance filter
    ↓
Keyword scoring + semantic deduplication
    ↓
Platform adapter (Adobe / Shutterstock / Vecteezy / Freepik ...)
    ↓
Human editor (reorder, approve, regenerate field, warnings)
    ↓
Deterministic validator
    ↓
CSV export + optional XMP/IPTC embedding + audit log
```

### Modul yang sebaiknya dipisahkan

- `vision_analyzer`: deskripsi visual dan confidence.
- `market_research`: query variants, Apify Actor, cache, cohort tracking.
- `candidate_builder`: synonym, phrase, taxonomy, local lexicon.
- `keyword_ranker`: score, sort, rationale, first-10 optimization.
- `semantic_deduper`: stemming/redundancy check.
- `platform_profiles`: language, limits, category and CSV rules.
- `metadata_validator`: deterministic pass/fail with actionable errors.
- `human_review`: inline edit, approve/reject, reorder, regeneration per field.
- `exporter`: CSV and/or metadata embedding, atomic write and restore.
- `evaluation`: test dataset, metrics, model/prompt version comparison.

### Pengendalian biaya dan keamanan

- Cache market research berdasarkan normalisasi query, media type, filter, Actor version, dan waktu pengambilan.
- Jangan mengulang paid Actor run saat pengguna hanya menyortir data lokal yang sudah diambil.
- Panggil API dengan pagination dan batas item; lakukan dedup berdasarkan asset ID.
- API token sebaiknya tidak dicatat ke log. Jika menerima token BYOK, kirim melalui HTTPS, minimalkan retensi, dan dokumentasikan pemrosesannya. Jangan pernah memasukkan token dalam file ekspor atau screenshot.
- Hindari menghapus file asli secara otomatis; gunakan staging directory dan komit output hanya setelah seluruh langkah sukses.
- Simpan source/evidence untuk keyword yang diusulkan agar mudah diaudit dan diperbaiki.
- Rekam versi model, prompt, schema, profil marketplace, timestamp pengambilan data, dan versi Actor agar perubahan kualitas bisa ditelusuri.

---

## 11. Kesimpulan dan keputusan praktis

### Repo mana yang layak dijadikan referensi?

| Tujuan | Referensi terbaik | Alasan |
|---|---|---|
| Fondasi web app generator | [`meta-gen`](https://github.com/UmutHasanoglu/meta-gen) | Next.js/React, bulk generate, edit/reorder, history, CSV |
| Pipeline batch lintas provider dan format | [`RJ Auto Metadata`](https://github.com/riiicil/RJ-Auto-Metadata) | Prompt controls, retries, embedding, multi-platform export |
| Struktur prompt dan parser untuk dipelajari | [`metadata_tool/prompts.py`](https://github.com/innerfire630/metadata_tool/blob/main/app/ai/prompts.py) | Prompt terstruktur dan kategori resmi, dengan beberapa celah parser yang patut diperbaiki |
| AI lokal dan keyword autocomplete | [`Attributor`](https://github.com/Ars-Mond/Attributor) | Ollama vision, lexicon 1.000+ istilah, draft database dan edit metadata |
| Workflow suggestion dan validasi contributor | [`Xpiks`](https://github.com/andsontan/xpiks) | Keyword API suggestions, kamus, spelling dan upload workflow |
| Riset aset/kontributor dan sinyal download | [MicrostockIQ](https://microstockiq.com/) + kandidat [Kawsar Adobe Stock Scraper](https://apify.com/kawsar/adobe-stock-scraper) | Menghubungkan query dan metadata aset dengan indikator performa; bukan generator title sendiri |

### Rekomendasi akhir

Jika targetnya membuat produk sendiri, pilih `meta-gen` sebagai referensi UI web app. Pelajari `RJ Auto Metadata` untuk batch/error handling dan per-platform export. Gunakan `metadata_tool` sebagai studi kasus prompt/parser—termasuk untuk memahami mengapa output harus divalidasi secara deterministik. Tambahkan konsep autocomplete dari Xpiks/Attributor. Jika ingin fitur *market-aware keywording*, buat modul riset Apify terpisah dan ambil sinyal agregat dari banyak aset, bukan mengadopsi metadata pesaing secara utuh.

Formula inti yang disarankan:

**Metadata final = visual evidence × relevance gate + market evidence as a weak prior + platform rules + semantic dedupe + human review.**

Prioritasnya bukan memperoleh jumlah keyword maksimal, melainkan menghasilkan **keyword yang benar, berbeda satu sama lain, diurutkan tepat, sesuai aturan marketplace, dan dibuktikan pada gambar**.

---

## 12. Sumber utama

### Repositori

1. [`meta-gen`](https://github.com/UmutHasanoglu/meta-gen) — README, fitur web app, model, kontrol keyword, dan CSV.
2. [`RJ Auto Metadata`](https://github.com/riiicil/RJ-Auto-Metadata) — README, konfigurasi provider, prompt customization, pipeline batch, embedding, dan lisensi.
3. [`metadata_tool`](https://github.com/innerfire630/metadata_tool) — README dan [source `app/ai/prompts.py`](https://github.com/innerfire630/metadata_tool/blob/main/app/ai/prompts.py).
4. [`Attributor`](https://github.com/Ars-Mond/Attributor) — README, Ollama vision, autocomplete, local store, CSV.
5. [`Xpiks`](https://github.com/andsontan/xpiks) — README, API keyword suggestions, spelling, metadata, upload.

### MicrostockIQ dan Apify

6. [MicrostockIQ](https://microstockiq.com/) — halaman riset Adobe Stock, FAQ Apify, caching, dan definisi metrik performa.
7. [Kawsar — Adobe Stock Scraper](https://apify.com/kawsar/adobe-stock-scraper) — documented fields, query, creator portfolio, filters, downloads, keywords.
8. [Iñigo Garcia Olaizola — Adobe Stock Scraper](https://apify.com/igolaizola/adobe-stock-scraper) — pencarian keyword, creator ID, filter dan sort.
9. [Louis Deconinck — Adobe Stock Search Results Scraper](https://apify.com/louisdeconinck/adobe-stock-scraper) — metadata hasil pencarian Adobe Stock.

### Panduan resmi marketplace

10. [Adobe Stock — Tips for effective titles and keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html) — title, keyword limits, urutan sepuluh keyword awal, bahasa, dan relevansi.
11. [Adobe Stock — Change order of keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/change-order-keywords.html) — urutan keyword.
12. [Adobe Stock — Generative AI content guidelines](https://helpx.adobe.com/stock/contributor/submit-your-content/submit-generative-ai-content/generative-ai-content-guidelines.html) — larangan dan aturan konten AI.
13. [Shutterstock — Description and Keyword Best Practices](https://submit.shutterstock.com/help/en/articles/10594702-description-and-keyword-best-practices) — title/description dan keyword yang relevan.
14. [Shutterstock — Contextual Metadata Standards](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata) — format dan batas metadata.
15. [Shutterstock — Keyword and title spamming](https://submit.shutterstock.com/help/en/articles/10617485-how-are-keyword-and-title-spamming-defined) — duplikasi, stem berulang, keyword tidak relevan, dan spam.
