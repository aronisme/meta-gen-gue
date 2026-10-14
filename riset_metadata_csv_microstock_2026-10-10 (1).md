# Riset Mendalam Metadata CSV Microstock

**Platform:** Adobe Stock, Shutterstock, Vecteezy, dan Freepik Contributor (sekarang Magnific)  
**Tanggal pemeriksaan:** 10 Oktober 2026  
**Tujuan:** Acuan teknis untuk membangun generator metadata AI dan exporter CSV yang valid untuk tiap marketplace.

> **Kesimpulan paling penting:** jangan membuat satu file CSV generik lalu mengirimkannya ke empat platform. Simpan metadata dalam satu struktur internal yang konsisten, lalu buat empat exporter terpisah. Header, delimiter, kategori, aturan judul, dan alur upload platform ini berbeda.

## 1. Ringkasan eksekutif

| Aspek | Adobe Stock | Shutterstock | Vecteezy | Freepik / Magnific Contributor |
|---|---|---|---|---|
| Kolom inti untuk CSV | `Filename`, `Title`, `Keywords` | `Filename`, `Description`, `Keywords`, `Categories` | `Filename`, `Title`, `Description`, `Keywords`, `License` | `File name`, `Title`, `Keywords` |
| Kolom tambahan | `Category`, `Releases` | `Illustration`, `Mature Content`, `Editorial` | `Id` ada pada CSV yang diunduh dari Add Data; pertahankan | `Prompt`, `Model` untuk prompt/model AI; tag AI menggunakan keyword khusus |
| Delimiter kolom | Koma | Koma | Koma pada format CSV lazim | Titik koma `;` menurut panduan CSV resmi |
| Pemisah keyword di dalam field | Koma | Koma | Koma | Koma |
| Jumlah keyword | Spesifikasi CSV menyebut maks. 50; panduan metadata menyebut hingga 49 — pakai maks. 49 sebagai nilai konservatif | 7–50 | 5–50; rekomendasi 20–30 | 5–50; sekitar 20 keyword relevan sudah cukup |
| Batas judul/deskripsi | Judul maks. 70 karakter menurut spesifikasi CSV | Panduan metadata menyebut deskripsi/judul maks. 2.048 karakter; artikel editor menyebut 150 karakter. Gunakan 150 sebagai target aman untuk judul komersial dan verifikasi kasus editorial | Panduan metadata terbaru menyebut 3–8 kata, maks. 200 karakter; panduan lain meminta kurang dari 100. Gunakan <100 sebagai batas konservatif | Rekomendasi judul 35–100 karakter; harus bahasa Inggris, tanpa nomor/tanggal yang tidak diperlukan, tanpa ekstensi/jenis file |
| Kategori tema pada CSV | Ya, opsional; masukkan nomor kategori | Ya, wajib 1 dan kategori kedua opsional; gunakan nama kategori | Tidak ada kolom kategori tema di skema CSV yang terdokumentasi | Tidak ada kolom kategori tema di skema CSV yang terdokumentasi |
| Lokasi | Tidak ada kolom lokasi pada skema CSV ini | Opsional dalam metadata platform, tetapi bukan kolom pada skema CSV yang didokumentasikan | Tidak ada kolom lokasi dalam skema CSV | Tidak ada kolom lokasi dalam skema CSV |
| Prompt/model AI | Tidak ada kolom khusus pada CSV ini | Tidak ada kolom khusus pada CSV ini | Tidak ada kolom khusus pada CSV ini | Ada kolom Prompt/Model untuk konten AI yang sesuai, dan tag `_ai_generated` untuk label AI |
| Batas ukuran/baris CSV yang dinyatakan di dokumen | Maks. 1 MB dan 5.000 baris | Tidak ditemukan angka batas file/baris pada panduan CSV yang diperiksa | Tidak ditemukan angka batas file/baris pada panduan CSV yang diperiksa | Panduan CSV yang diperiksa tidak menyebut angka batas file/baris |

**Dasar utama:** [Adobe — CSV requirements](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html), [Adobe — title & keyword guide](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html), [Shutterstock — CSV metadata](https://submit.shutterstock.com/help/en/articles/10617486-how-do-i-include-existing-metadata-with-my-content-submission), [Shutterstock — metadata standards](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata), [Vecteezy — CSV metadata upload](https://eezycontributors.zendesk.com/hc/en-us/articles/360029388091-CSV-Metadata-Upload), [Vecteezy — metadata guidelines](https://eezycontributors.zendesk.com/hc/en-us/articles/360039385912-Metadata-Guidelines), [Magnific — CSV guide](https://www.magnific.com/ai/contributors/how-to-create-a-csv-file).

---

# 2. Adobe Stock CSV

## 2.1 Struktur kolom

Gunakan header dengan ejaan dan kapitalisasi yang sama seperti template resmi. Jangan menerjemahkan header.

| Kolom | Status | Ketentuan |
|---|---|---|
| `Filename` | Wajib | Nama file lengkap beserta ekstensi, harus cocok dengan file yang diunggah. Spesifikasi CSV menyatakan maksimum 30 karakter. |
| `Title` | Wajib | Maksimum 70 karakter. Deskripsi singkat, faktual, tanpa koma atau karakter khusus menurut spesifikasi CSV. |
| `Keywords` | Wajib | Daftar keyword dalam satu field, dipisahkan dengan koma dan diurutkan berdasarkan relevansi. Maksimum yang tertulis pada halaman CSV adalah 50. |
| `Category` | Opsional | Nomor kategori yang paling sesuai; bukan nama kategori bebas. |
| `Releases` | Opsional | Nama file model/property release yang cocok persis; maksimum 30 karakter dan format JPEG menurut spesifikasi CSV. |

### Spesifikasi file

- File harus berformat `.csv`; bukan `.xlsx`, `.xls`, atau workbook lain.
- Maksimum **5.000 baris** dan ukuran file **1 MB**.
- Gunakan **UTF-8**; Adobe secara khusus menyarankan CSV UTF-8 untuk pengguna Excel di luar Amerika Serikat.
- Gunakan template resmi dan pertahankan header persis.
- Satu baris untuk satu file aset.

Sumber: [Adobe Stock CSV requirements](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html) dan [Create a CSV file for Adobe Stock](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/create-csv-file.html).

## 2.2 Contoh struktur

Contoh berikut mengilustrasikan bentuk field, bukan aset yang benar-benar diunggah:

```csv
Filename,Title,Keywords,Category,Releases
new-year-visual.jpg,Minimal gold new year celebration,New Year,celebration,gold,black,holiday,2027,festive,typography,background,3,
```

**Catatan:** saat menulis CSV sungguhan, serializer CSV harus membungkus field `Keywords` yang mengandung koma dengan tanda kutip ganda. Bentuk yang diproses sebagai satu field keyword adalah:

```csv
Filename,Title,Keywords,Category,Releases
new-year-visual.jpg,Minimal gold new year celebration,"New Year, celebration, gold, black, holiday, 2027, festive, typography, background",3,
```

Jangan membangun CSV lewat penggabungan string mentah. Gunakan library CSV supaya tanda kutip, koma, dan karakter Unicode di-escape dengan benar.

## 2.3 Daftar kategori Adobe Stock

Panduan kategori resmi saat diperiksa memuat 21 kelompok berikut. Untuk CSV, spesifikasi Adobe meminta **nomor kategori**. Urutan bernomor di bawah mengikuti urutan kategori yang digunakan dalam daftar contributor saat ini; karena halaman persyaratan CSV tidak menampilkan tabel nomor-ke-nama di tempat yang sama, validasi mapping terhadap template/portal contributor terkini sebelum mengunci angka ini ke produksi.

| No. | Kategori | Cakupan singkat |
|---:|---|---|
| 1 | Animals | Hewan, serangga, hewan peliharaan dan satwa liar |
| 2 | Buildings and architecture | Bangunan, interior, struktur, arsitektur |
| 3 | Business | Bisnis, kantor, keuangan, aktivitas profesional |
| 4 | Drinks | Minuman, kopi, cocktail, budaya minum |
| 5 | The environment | Alam, lingkungan, iklim, cuaca, keberlanjutan |
| 6 | States of mind | Emosi, pengalaman batin, kreativitas, meditasi, konsep abstrak |
| 7 | Food | Makanan, bahan makanan, memasak, hidangan |
| 8 | Graphic resources | Background, tekstur, pola, simbol, ikon, UI, vektor, aset desain |
| 9 | Hobbies and leisure | Hobi, kerajinan, aktivitas santai, minat personal |
| 10 | Industry | Industri, manufaktur, konstruksi, produksi, energi |
| 11 | Landscape | Pemandangan alam, cityscape, lokasi dan destinasi |
| 12 | Lifestyle | Kehidupan sehari-hari, keluarga, rumah, kegiatan sosial |
| 13 | People | Orang, potret, representasi demografis, subjek manusia |
| 14 | Plants and flowers | Tanaman, bunga, botani, kebun |
| 15 | Culture and religion | Tradisi, budaya, warisan, perayaan dan upacara agama |
| 16 | Science | Ilmu pengetahuan, riset, laboratorium, medis, inovasi |
| 17 | Social issues | Isu sosial, ketimpangan, aktivisme, kesadaran sosial |
| 18 | Sports | Olahraga, latihan kebugaran, kompetisi |
| 19 | Technology | Perangkat digital, komputer, smartphone, software, konektivitas |
| 20 | Transport | Kendaraan, logistik, jalan, infrastruktur transportasi |
| 21 | Travel | Pariwisata, destinasi, petualangan dan perjalanan |

Sumber kategori: [Adobe — Choose the right category for your content](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/choose-right-category-content.html). Artikel tersebut diperbarui pada 2026 dan menyediakan deskripsi masing-masing kategori.

### Implementasi kategori yang disarankan

Jangan meminta LLM mengarang nomor kategori secara langsung. Minta model memilih **nama kategori internal**, lalu konversikan melalui tabel mapping terverifikasi. Jika hasilnya tidak yakin, simpan kategori sebagai `needs_review`, bukan mengisi angka secara acak.

## 2.4 Aturan judul dan keyword

### Judul

- Maksimum teknis CSV: 70 karakter.
- Utamakan subjek visual utama dan konteks yang tampak.
- Hindari klaim atau detail yang tidak bisa dilihat dari aset.
- Hindari istilah teknis kamera/peralatan yang tidak berguna bagi pembeli.
- Jangan menyebut nama artis, orang nyata, atau elemen kekayaan intelektual secara tidak patut.
- Untuk kompatibilitas dengan spesifikasi CSV, jangan memakai koma di judul.

### Keyword

- Spesifikasi CSV menyebut maks. 50 keyword, tetapi panduan metadata Adobe yang diperiksa menyebut hingga **49 keyword**. Ini adalah perbedaan di antara dua halaman resmi. Untuk exporter yang defensif, batasi ke **49 keyword** sampai angka di UI/template akun Anda terverifikasi.
- Keyword harus relevan, akurat, dan diurutkan dengan keyword terpenting di depan.
- Panduan Adobe menyebut keyword awal — terutama **10 posisi pertama** — punya pengaruh besar terhadap pencarian.
- Gabungkan subjek utama, objek, atribut visual, konteks, emosi/konsep yang benar-benar terwakili, lokasi bila relevan, jumlah orang, dan sudut pandang/komposisi bila layak.
- Jangan mengisi keyword dengan spesifikasi teknis atau kata yang tidak terkait.
- Pastikan bahasa metadata cocok dengan bahasa yang dikonfigurasi pada akun contributor.

Sumber: [Adobe — Tips for effective titles and keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html).

## 2.5 Releases dan konten AI

- `Releases` mengacu pada nama file model/property release, bukan isi surat izinnya. Nama file perlu cocok dengan file release yang tersedia dan ketentuan CSV.
- Kolom CSV ini tidak menggantikan proses pemenuhan release maupun deklarasi AI di portal contributor.
- Untuk konten yang dihasilkan AI, periksa ketentuan submit AI Adobe yang berlaku dan pastikan deklarasi tersebut ditangani lewat alur contributor yang sesuai. Jangan menganggap adanya kata `AI` di judul/keyword menggantikan deklarasi resmi.

## 2.6 Validator Adobe yang direkomendasikan

1. Pastikan header wajib persis `Filename`, `Title`, `Keywords`; gunakan `Category`/`Releases` hanya bila dibutuhkan.
2. Periksa filename dengan ekstensi, kecocokan nama, maksimum 30 karakter menurut panduan CSV.
3. Pastikan judul tidak lebih dari 70 karakter dan tidak memuat koma.
4. Normalisasi keyword, hapus duplikat, periksa relevansi, pertahankan urutan ranking, dan batasi 49 sebagai kebijakan aman.
5. Pastikan `Category` berupa nilai numerik dari mapping terverifikasi.
6. Periksa nama release dan ukuran/file rows CSV.
7. Tulis UTF-8, CSV valid, ukuran ≤1 MB dan ≤5.000 baris.

---

# 3. Shutterstock CSV

## 3.1 Skema dan urutan kolom

Menurut panduan upload metadata Shutterstock yang diperbarui pada September 2026, setiap baris merepresentasikan satu file dan filename harus berada pada kolom A. Header harus cocok dengan nama kolom yang ditentukan.

| Kolom | Status | Nilai |
|---|---|---|
| `Filename` | Wajib | Nama file yang benar-benar ada dalam batch submission |
| `Description` | Wajib | Deskripsi/judul faktual dalam bahasa Inggris |
| `Keywords` | Wajib | 7–50 keyword relevan dalam satu field; dipisahkan koma |
| `Categories` | Wajib | Satu kategori; kategori kedua opsional; nama kategori yang diperbolehkan |
| `Illustration` | Opsional | `Yes` atau `No` |
| `Mature Content` | Opsional | `Yes` atau `No` |
| `Editorial` | Opsional | `Yes` atau `No` |

Dokumentasi CSV menyebut A–D wajib, menjelaskan E–F opsional, tetapi juga mencantumkan G (`Editorial`) dan menyatakan tag opsional dapat disertakan/dikeluarkan. Karena dokumentasinya menggunakan kolom berurutan, exporter aman sebaiknya mempertahankan urutan A–G persis ketika menggunakan semua flag opsional. Bila hanya memakai satu flag opsional, verifikasi perilaku format pada template/sample terkini sebelum membuat CSV massal.

Sumber: [Shutterstock — How do I include existing metadata with my content submission?](https://submit.shutterstock.com/help/en/articles/10617486-how-do-i-include-existing-metadata-with-my-content-submission).

## 3.2 Contoh struktur

```csv
Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial
city-sunset.jpg,"Aerial view of a city skyline at sunset","city, skyline, sunset, architecture, travel, urban, evening",Buildings/Landmarks,No,No,No
```

`Keywords` harus menjadi satu field CSV berisi daftar keyword, bukan sejumlah kolom terpisah. Karena terdapat koma di dalam daftar keyword, field tersebut harus diapit tanda kutip ganda dalam CSV yang menggunakan koma sebagai delimiter. Nama kategori kedua juga, bila dimasukkan di field yang sama sebagai daftar comma-separated, perlu diperlakukan sebagai satu field dan di-escape sesuai format contoh resmi yang dipakai portal.

**Urutan upload sangat penting:** upload aset terlebih dahulu, lalu buka halaman Submit dan gunakan tombol CSV. Panduan September 2026 secara khusus menyatakan jangan mengunggah CSV melalui halaman web/FTPS upload aset; CSV perlu ditambahkan dari halaman Submit. Bersihkan baris yang bukan bagian dari batch saat ini, dan klik Submit sekali saja sambil menunggu proses selesai.

Sumber: [Shutterstock CSV metadata upload](https://submit.shutterstock.com/help/en/articles/10617486-how-do-i-include-existing-metadata-with-my-content-submission).

## 3.3 Daftar kategori Shutterstock

Panduan metadata kontekstual resmi Shutterstock yang diperiksa mencantumkan 26 kategori berikut. Satu kategori wajib; kategori kedua opsional. Tanda `*` berarti kategori itu tidak tersedia untuk video.

1. Abstract `*`
2. Animals/Wildlife
3. Arts
4. Backgrounds/Textures
5. Beauty/Fashion `*`
6. Buildings/Landmarks
7. Business/Finance
8. Celebrities `*`
9. Education
10. Food and Drink
11. Healthcare/Medical
12. Holidays
13. Industrial
14. Interiors `*`
15. Miscellaneous `*`
16. Nature
17. Objects
18. Parks/Outdoor `*`
19. People
20. Religion
21. Science
22. Signs/Symbols
23. Sports/Recreation
24. Technology
25. Transportation
26. Vintage `*`

Sumber: [Shutterstock — Content Publishing Standards: Contextual Metadata](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata), diperbarui Februari 2026.

### Rekomendasi pemilihan kategori

- Pilih nama kategori yang benar-benar didukung daftar resmi; jangan pakai nomor kategori Adobe.
- Satu kategori yang paling langsung menggambarkan isi aset dipilih terlebih dahulu.
- Tambahkan kategori kedua hanya jika benar-benar relevan.
- Beberapa tema tidak tersedia untuk video (lihat tanda `*`). Validasi kategori berdasarkan jenis aset.

## 3.4 Aturan deskripsi, keyword, dan lokasi

### Deskripsi/judul

- Harus berupa kalimat atau frasa faktual, bukan sekadar daftar keyword.
- Harus relevan, unik terhadap aset, dan dalam bahasa Inggris (dengan pengecualian tertentu, misalnya nama tempat dan nama ilmiah Latin).
- Halaman standar metadata menyebut maksimum **2.048 karakter**; artikel alur editor yang lebih baru menyebut batas **150 karakter** pada deskripsi yang diisi lewat editor. Ada perbedaan di antara dokumentasi resmi. Untuk metadata komersial, jadikan ≤150 karakter sebagai target aman bila tidak mengorbankan akurasi. Untuk editorial dokumenter, verifikasi batas yang benar pada jalur submission yang dipakai karena keterangan tanggal/lokasi wajib tetap harus disertakan.
- Untuk dokumenter editorial, deskripsi wajib menyertakan tanggal pengambilan gambar (hari, bulan, tahun; untuk konten sebelum 2000 cukup tahun/dekade) dan lokasi geografis.

### Keyword

- Minimum 7, maksimum 50.
- Harus dalam bahasa Inggris dan menggambarkan isi/konsep yang benar-benar terkait.
- Jangan mengulang kata atau frasa; hindari spam, ejaan salah, emoji, link, data identitas pribadi, dan istilah kekayaan intelektual pada konten komersial.
- Nama merek/produk hanya boleh dipakai sesuai aturan platform, termasuk pengecualian tertentu untuk editorial yang relevan.
- Jangan membuat kata kunci untuk menyiasati campaign bila tidak sesuai dengan isi.

### Lokasi

Lokasi bersifat opsional dan sebaiknya spesifik bila diketahui, seperti lingkungan, kota kecil, kota, atau wilayah relevan. Namun kolom `Location` tidak tercantum dalam skema CSV metadata yang didokumentasikan. Simpan sebagai field internal dan masukkan melalui UI/metadata lain yang didukung jika dibutuhkan; jangan menambahkan kolom `Location` pada CSV resmi tanpa verifikasi.

Sumber: [Contextual Metadata](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata), [Description and Keyword Best Practices](https://submit.shutterstock.com/help/en/articles/10594702-description-and-keyword-best-practices), dan [submission editor guide](https://submit.shutterstock.com/help/id/articles/10617414-portofolio-mempersiapkan-konten-yang-anda-unggah-untuk-dikirim).

## 3.5 Kategori dan flag jangan dicampur

`Categories` adalah kategori tema aset, sedangkan `Illustration`, `Mature Content`, dan `Editorial` adalah flag/status yang memengaruhi cara aset diproses. Jangan mengubah `Illustration=Yes` hanya karena gambar terlihat seperti ilustrasi tanpa memastikan tipe submission dan definisi platform; validasi flag berdasarkan jenis aset yang sebenarnya.

## 3.6 Validator Shutterstock yang direkomendasikan

1. Cocokkan filename dengan file yang telah diunggah dan singkirkan semua baris di luar batch saat ini.
2. Pastikan kolom inti dan urutan header benar.
3. Validasi deskripsi faktual; gunakan target ≤150 karakter untuk aset komersial agar aman terhadap batas editor yang lebih ketat.
4. Pastikan 7–50 keyword, relevan, tidak duplikat, berbahasa Inggris.
5. Pastikan satu kategori valid, dengan kategori kedua hanya jika sesuai dan tersedia untuk jenis aset itu.
6. Isi flag sebagai `Yes`/`No` jika memang diperlukan; pertahankan urutan kolom.
7. Untuk editorial dokumenter, validasi tanggal dan lokasi secara terpisah.
8. Upload CSV dari halaman Submit setelah aset diunggah.

---

# 4. Vecteezy CSV

## 4.1 Struktur kolom

Vecteezy menyediakan tiga cara untuk menyiapkan CSV: mengunduh CSV dari **Add Data** (ideal untuk mengedit aset yang sudah diunggah), memakai file contoh (umumnya untuk workflow FTP), atau membuat CSV sendiri.

| Kolom | Status | Catatan |
|---|---|---|
| `Filename` | Wajib | Harus berada di kolom pertama. Cocokkan dengan aset; nama tanpa spasi disarankan. |
| `Title` | Opsional dalam dokumentasi CSV | Ikuti Metadata Guidelines; tetap disarankan untuk kelengkapan dan penemuan. |
| `Description` | Opsional | Pedoman metadata terkini menyatakan deskripsi tidak lagi diwajibkan; judul sebaiknya sudah singkat dan deskriptif. |
| `Keywords` | Opsional pada format CSV dasar, tetapi wajib untuk submission yang dapat ditemukan | Keyword dalam satu field, dipisahkan dengan koma. Aturan metadata meminta sedikitnya 5 keyword. |
| `License` | Opsional | Nilai yang diizinkan: `pro`, `free`, `editorial`, atau kosong. |
| `Id` | Ada di CSV yang diunduh dari Add Data | **Jangan ubah atau hapus.** Field ini membantu mencocokkan record pada alur update metadata. |

Perbedaan filename menurut workflow:

- **FTP:** dokumentasi menyebut ekstensi filename tidak boleh disertakan untuk proses metadata yang benar.
- **Add Data:** ekstensi filename opsional.
- **CSV yang diunduh dari Add Data:** jangan modifikasi/hapus kolom `Filename` atau `Id`; kolom ini telah dipopulasi untuk membantu mengurangi kesalahan pencocokan.

Sumber: [Vecteezy — CSV Metadata Upload](https://eezycontributors.zendesk.com/hc/en-us/articles/360029388091-CSV-Metadata-Upload).

## 4.2 Contoh struktur

Contoh dasar untuk CSV yang dibuat untuk workflow FTP:

```csv
Filename,Title,Description,Keywords,License
abstract-cubes,Abstract Colored Cubes Background,Abstract colored cubes arranged in a clean geometric composition,"abstract, cubes, geometric, colorful, shapes, background, pattern",pro
```

Contoh tersebut hanya ilustrasi bentuk dan aturan field. Untuk memperbarui aset yang sudah berada di Add Data, lebih aman mengunduh CSV langsung dari portal, mempertahankan `Filename` dan `Id`, mengubah field yang dibutuhkan, lalu mengunggah kembali.

## 4.3 Kategori Vecteezy: bedakan jenis konten dan tema

Skema CSV metadata yang didokumentasikan tidak mempunyai kolom `Category` untuk kategori tema seperti Adobe atau Shutterstock. Vecteezy tetap memiliki **kategori upload/review berdasarkan jenis file**, yang dipilih di Add Data:

| Format file | Kategori di alur upload |
|---|---|
| EPS | Vector |
| JPG/JPEG | Photo |
| MP4, MOV, RED | Video |
| PNG | PNG |
| PSD | PSD |

Kategori tersebut membantu mengarahkan file kepada reviewer dengan keahlian yang sesuai. Itu bukan taxonomy kategori tema yang perlu diekspor ke `Category` pada CSV metadata.

Sumber: [Vecteezy — What are categories?](https://eezycontributors.zendesk.com/hc/en-us/articles/8837507965204-What-are-categories).

## 4.4 Aturan judul

Ada perbedaan antara dua halaman resmi:

- [Metadata Guidelines](https://eezycontributors.zendesk.com/hc/en-us/articles/360039385912-Metadata-Guidelines), diperbarui Januari 2025: judul spesifik dan unik, panjang **3–8 kata**, tidak lebih dari **200 karakter**, kapitalisasi awal kata kecuali kata kecil seperti “of” dan “the”; tanda baca terbatas.
- [Titles, Keywords & Descriptions](https://eezycontributors.zendesk.com/hc/en-us/articles/360025313292-Titles-Keywords-Descriptions), halaman lebih lama: minta judul kurang dari **100 karakter**.

Untuk exporter konservatif, targetkan **3–8 kata dan kurang dari 100 karakter**. Gunakan bahasa faktual dan profesional; hindari superlatif subjektif seperti “best”, “amazing”, “brilliant” dan tanda baca yang berlebihan.

## 4.5 Aturan keyword

- Minimal 5, maksimum 50.
- Rekomendasi platform: 20–30 keyword per aset; lima keyword pertama merupakan keyword yang paling penting.
- Utamakan bahasa Inggris dan istilah yang lazim dipakai pembeli.
- Hindari ejaan salah, slang ambigu, karakter khusus, istilah tidak relevan, dan keyword yang sama untuk semua file tanpa memperhatikan isi.
- Kata/konsep yang bisa memiliki banyak arti perlu dibuat spesifik melalui kombinasi kata yang tepat.
- Keyword yang berguna dapat meliputi subjek, aktivitas, komposisi (close-up, aerial view, copy space), makanan/bahan, lokasi, objek/warna, peran orang, umur/relasi jika relevan, arah/orientasi dan filter pencarian yang benar-benar sesuai.
- Pedoman keyword menekankan bahwa judul dan deskripsi tidak dapat diandalkan sebagai field pencarian di situs, sehingga keyword perlu memuat informasi penting yang ingin ditemukan pelanggan.

Sumber: [Vecteezy — Metadata Guidelines](https://eezycontributors.zendesk.com/hc/en-us/articles/360039385912-Metadata-Guidelines), [Keyword Guide](https://eezycontributors.zendesk.com/hc/en-us/articles/4401763019924-Vecteezy-Keyword-Guide), dan [Titles, Keywords & Descriptions](https://eezycontributors.zendesk.com/hc/en-us/articles/360025313292-Titles-Keywords-Descriptions).

## 4.6 License

Nilai yang didokumentasikan adalah `pro`, `free`, `editorial`, atau kosong. Gunakan nilai persis; jangan mengekspor label UI lain, terjemahan lokal, atau nilai boolean. License berkaitan dengan pilihan distribusi/penggunaan aset, jadi jangan ditentukan hanya dari isi visual oleh model AI.

## 4.7 Fitur Magic Metadata

Vecteezy menyediakan Magic Metadata, yaitu pembuatan judul dan keyword berbasis AI dari preview file. Dokumentasi menyebut fitur ini tersedia untuk Vector, Photo, Video, PNG, dan PSD yang mengikuti guidelines dan akan ditawarkan dengan lisensi Free atau Pro. Editorial dan Bundles tidak eligible. Jika Magic Metadata diaktifkan dan diterapkan setelah aset disetujui, judul dan keyword hasilnya tidak dapat diedit di Add Data; bila ingin mengisi manual atau CSV, contributor dapat memilih untuk tidak memakai Magic Metadata.

Sumber: [Vecteezy — Magic Metadata](https://eezycontributors.zendesk.com/hc/en-us/articles/26699723854484-Magic-Metadata).

## 4.8 Validator Vecteezy yang direkomendasikan

1. Tentukan mode ekspor: FTP baru atau update Add Data.
2. Mode update: simpan `Filename` dan `Id` asli; mode FTP: periksa aturan filename tanpa ekstensi.
3. Validasi judul 3–8 kata dan <100 karakter sebagai aturan konservatif.
4. Pastikan 5–50 keyword, idealnya 20–30, dengan 5 terpenting lebih awal.
5. Bersihkan keyword dari typo, istilah ambigu, karakter khusus dan kata yang tidak terkait.
6. Validasi `License` ke daftar persis `pro`, `free`, `editorial`, atau string kosong.
7. Jangan menambahkan kolom kategori tema buatan sendiri ke format CSV ini.

---

# 5. Freepik Contributor / Magnific CSV

## 5.1 Status platform per 10 Oktober 2026

Dokumentasi resmi menyatakan Freepik telah berganti nama menjadi **Magnific**: perusahaan, akun dan platform yang sama, dengan domain `freepik.com` yang diarahkan ke `magnific.com`. Beberapa dokumentasi contributor yang dahulu berada di domain Freepik kini dialihkan ke Magnific. Jadi, istilah “Freepik CSV” masih merujuk ke workflow contributor historis, tetapi periksa panduan contributor terkini di domain Magnific sebelum merilis exporter produksi.

Sumber: [Magnific — Freepik is now Magnific](https://www.magnific.com/ai/docs/freepik-is-now-magnific).

## 5.2 Struktur CSV dan delimiter

Panduan CSV contributor Magnific menunjukkan urutan field berikut:

1. `File name`
2. `Title`
3. `Keywords`
4. `Prompt` — bila konten dibuat dengan AI
5. `Model` — bila konten dibuat dengan AI

Dokumen tersebut menggunakan **titik koma `;` sebagai pemisah kolom**, sementara **koma `,` memisahkan keyword di dalam field Keywords**. Jangan memakai delimiter koma sebagai pemisah kolom untuk format ini.

```text
File name;Title;Keywords;Prompt;Model
"beautiful-sunset.jpg";"Beautiful sunset on the beach";"sunset,beach,mountain,summer,coast";"Beautiful sunset on a tropical beach";"Midjourney 5"
```

Catatan: panduan resmi menggunakan sedikit variasi penulisan saat menjelaskan header Prompt/Model. Untuk otomatisasi yang mengutamakan keandalan, jadikan file contoh/template terbaru dari panel contributor sebagai sumber kebenaran untuk header ejaan, urutan field dan nilai model. Jangan menganggap header `Prompt`/`Model` atau ejaan `File name` selalu identik di semua versi template tanpa mengecek contoh aktual.

Sumber: [Magnific — How to create a .csv file](https://www.magnific.com/ai/contributors/how-to-create-a-csv-file).

## 5.3 Field dan kebijakan metadata

| Field | Tujuan dan aturan |
|---|---|
| `File name` | Nama file aset yang harus cocok dengan file upload. Gunakan ejaan dari template contributor yang aktual. |
| `Title` | Deskripsi ringkas dari isi/kegunaan visual. Direkomendasikan sekitar 35–100 karakter; judul terlalu pendek atau terlalu panjang dapat ditolak. |
| `Keywords` | Keyword relevan dipisahkan dengan koma; 5–50 keyword, dan sekitar 20 keyword yang tepat dianggap cukup. |
| `Prompt` | Prompt asli yang terkait dengan aset AI. Panduan prompt menyebut 500 karakter biasanya sudah cukup. Jangan mengarang prompt asli bila tidak diketahui. |
| `Model` | Model/template generator yang digunakan. Panduan meminta nilai cocok dengan opsi/dropdown di panel contributor; jangan menormalisasi label model menjadi nama buatan sendiri. |
| Tag AI | Untuk konten AI, panduan resmi menyebut penggunaan keyword khusus `_ai_generated` atau pemilihan tombol AI di panel upload. EPS/PSD yang dibuat AI — atau mengandung elemen AI — harus ditandai “Created by AI”. |

Sumber: [AI generated resources prompts](https://www.magnific.com/ai/contributors/ai-generated-resources-prompts) dan [AI generated resources — General guidelines](https://www.magnific.com/idn/ai/contributors/ai-generated-resources-general-guidelines).

## 5.4 Aturan judul

- Bahasa Inggris.
- Rekomendasi panjang 35–100 karakter.
- Judul harus satu frasa/kalimat yang jelas tentang tema dan konsep aset, bukan daftar keyword.
- Hindari nama tipe file/ekstensi seperti EPS10, PSD, JPG dalam judul.
- Hindari angka atau tanggal yang tidak dibutuhkan (ada pengecualian untuk nama perayaan seperti 4th July).
- Hindari karakter khusus yang tidak perlu, ejaan salah, tata bahasa buruk dan detail yang tidak terlihat.
- Judul tidak boleh berulang untuk mengejar keyword tambahan; pastikan tetap unik dan akurat.

Sumber: [Magnific — Metadata Guidelines: Must read](https://www.magnific.com/ai/contributors/metadata-guidelines-must-read).

## 5.5 Aturan keyword

- Minimum 5, maksimum 50; panduan menyebut sekitar 20 keyword yang relevan cukup.
- Gunakan bahasa Inggris, kecuali proper noun tertentu dengan ejaan yang tepat.
- Keyword harus menggambarkan tema/objek yang terlihat atau konsep yang benar-benar diwakili aset.
- Hindari spam keyword, pengulangan, keyword campaign yang tak berkaitan, daftar semua warna, angka kalender yang tidak relevan, serta sinonim yang diulang hanya untuk menambah jumlah.
- Keyword dipisahkan dengan koma; hindari titik koma dan karakter khusus di dalam keyword karena titik koma adalah delimiter kolom.
- Jangan tambahkan istilah file seperti `jpg`, `eps`, `psd`, `photography` atau kata generik hanya untuk mengakali pencarian.
- Jangan memasukkan semua bahan/objek yang tidak terlihat atau tidak relevan dengan gambar.

Sumber: [Magnific — Metadata Guidelines: Must read](https://www.magnific.com/ai/contributors/metadata-guidelines-must-read).

## 5.6 Kategori

Dalam skema CSV contributor yang diperiksa, tidak ada kolom kategori tema seperti `Category` pada Adobe atau `Categories` pada Shutterstock. Jangan tambahkan kolom `Category` ke format ini kecuali template terbaru di contributor panel secara eksplisit memintanya.

Situs Magnific memiliki filter katalog seperti Vectors, Illustrations, Photos, PSD, Templates, Mockups, Videos/Footage, Motion Graphics, Video Templates, Icons, dan 3D Models. **Itu merupakan tipe/jenis katalog atau filter pencarian pada situs; bukan daftar nilai `Category` yang dapat langsung dimasukkan ke CSV metadata contributor.** Bedakan taxonomy tampilan katalog dari skema metadata upload.

## 5.7 Aturan AI yang penting untuk workflow massal

- Jangan tandai semua aset sebagai AI secara otomatis. Label AI harus menggambarkan asal aset yang sebenarnya.
- Bila aset memang dibuat AI, masukkan tag `_ai_generated` atau gunakan tombol AI di panel upload sesuai arahan terkini.
- Untuk EPS/PSD yang dihasilkan AI atau berisi elemen AI, penandaan “Created by AI” diwajibkan menurut panduan yang diperiksa.
- Prompt harus berasal dari prompt sebenarnya jika tersedia. Kolom prompt kosong lebih jujur daripada prompt sintetis yang seolah-olah merupakan prompt asli.
- Nilai `Model` harus sesuai opsi panel contributor. Daftar contoh model pada dokumentasi lama — seperti DALL·E, Midjourney versi lama, atau Stable Diffusion versi lama — mungkin tidak mencerminkan dropdown terkini. Periksa opsi aktual sebelum membuat enum/allowlist permanen.
- Panduan resmi menyebut prompt yang sudah diunggah saat ini tidak dapat diedit atau dihapus melalui fitur yang dijelaskan; tinjau prompt sebelum pengiriman.

Sumber: [AI generated resources prompts](https://www.magnific.com/ai/contributors/ai-generated-resources-prompts) dan [AI generated resources — General guidelines](https://www.magnific.com/idn/ai/contributors/ai-generated-resources-general-guidelines).

## 5.8 Validator Magnific yang direkomendasikan

1. Pastikan delimiter kolom `;` dan keyword separator `,`.
2. Pastikan field order/header sama dengan template contributor aktual.
3. Validasi judul 35–100 karakter, bahasa Inggris, tanpa nomor/tanggal/ekstensi yang tidak perlu.
4. Validasi 5–50 keyword, ideal sekitar 20, relevan, tidak berulang, tanpa karakter khusus yang berisiko.
5. Untuk aset AI, isi Prompt/Model secara benar dan cocok dengan panel, jangan menebak model/prompt asli.
6. Tambahkan `_ai_generated` hanya untuk aset AI yang memang perlu ditandai.
7. Jangan mengekspor kategori tema yang tidak ada dalam template resmi.

---

# 6. Apa yang boleh dan tidak boleh disamakan lintas platform?

## 6.1 Field internal yang disarankan

Untuk generator metadata multi-platform, simpan metadata master dalam bentuk terstruktur, bukan menyimpan satu string CSV sebagai sumber utama.

```json
{
  "asset_filename": "golden-new-year-background.jpg",
  "title_master": "Minimal gold new year celebration background",
  "description_master": "Minimal gold and black new year celebration artwork with elegant geometric details",
  "keywords": [
    "new year", "gold", "celebration", "black", "holiday",
    "festive", "geometric", "elegant", "background", "copy space"
  ],
  "category_internal": "backgrounds_graphic_resources",
  "release_filenames": [],
  "location": null,
  "content_type": "illustration",
  "license": null,
  "illustration": true,
  "mature_content": false,
  "editorial": false,
  "ai_generated": true,
  "ai_prompt": null,
  "ai_model": null,
  "review_status": "needs_review"
}
```

Contoh JSON di atas adalah rancangan skema internal aplikasi, bukan format upload marketplace. Data internal jangan langsung dikirim sebagai file CSV; lakukan transformasi lewat exporter per platform.

## 6.2 Mapping kategori internal

Gunakan ID kategori internal sendiri (misalnya `animals`, `business`, `background_texture`, `technology`) kemudian buat mapping terpisah:

- **Adobe Stock:** map ke salah satu 21 kategori resminya dan, bila menggunakan CSV, hasilkan angka kategori yang telah diverifikasi.
- **Shutterstock:** map ke nama kategori resmi dan pilih 1–2 kategori; cek apakah tersedia untuk jenis file.
- **Vecteezy:** tidak mengeluarkan kategori tema di CSV; kategorisasi file/review di portal ditangani terpisah.
- **Magnific:** CSV contributor yang diperiksa tidak menunjukkan kolom kategori tema; tipe katalog tidak boleh diasumsikan sebagai nilai CSV.

**Jangan melakukan mapping satu-ke-satu secara paksa.** Misalnya, `Graphic resources` pada Adobe dapat meliputi pola, background dan ikon; Shutterstock memisahkan `Backgrounds/Textures`, `Signs/Symbols`, dan `Objects`; Vecteezy memilih kategori berbasis format/reviewer; CSV Magnific tidak memiliki field kategori tema terdokumentasi.

## 6.3 Keyword internal sebaiknya array, bukan string

Simpan keyword sebagai array dengan urutan relevansi dipertahankan, misalnya:

```json
["gold", "new year", "celebration", "black background", "festive", "holiday"]
```

Saat ekspor, ubah array menjadi string yang sesuai format. Jangan menyimpan keyword dalam satu string koma sejak awal, karena akan lebih sulit menghapus duplikat dan melakukan validasi per item.

## 6.4 Jangan menganggap title dan description identik

- Adobe menggunakan `Title`.
- Shutterstock menggunakan `Description` sebagai deskripsi/judul.
- Vecteezy memisahkan `Title` dan `Description`, walaupun deskripsi opsional.
- Magnific menggunakan `Title` dan memiliki field AI `Prompt` yang berbeda makna dari title.

Bangun `title_master` dan `description_master` secara terpisah, lalu tentukan transformasi per exporter. Jangan memasukkan seluruh prompt AI ke dalam title.

---

# 7. Algoritma pembuatan metadata berkualitas

## 7.1 Pipeline yang direkomendasikan

1. **Analisis aset:** kenali subjek primer, objek sekunder yang penting, aktivitas, setting, komposisi, warna dominan, gaya visual, ruang kosong/copy space, suasana atau konsep yang benar-benar terbukti.
2. **Bangun fakta visual:** simpan hanya elemen yang terlihat atau bisa dipastikan dari aset. Bedakan deskripsi visual dengan asumsi.
3. **Buat title dasar:** satu frasa deskriptif yang spesifik dan ringkas, bukan rangkaian sinonim.
4. **Buat keyword candidate:** subjek inti, spesies/objek/jenis produk, tindakan, style/medium yang relevan, setting, warna utama (bila penting), komposisi, penggunaan konseptual, lokasi bila benar-benar diketahui.
5. **Skor keyword:** urutkan berdasarkan keterkaitan visual, kekhususan, niat pencarian pembeli, serta kegunaan kontekstual. Jangan hanya mengurutkan kata yang paling sering muncul secara umum.
6. **Bersihkan:** normalisasi whitespace, hapus duplikat case-insensitive, koreksi ejaan, buang istilah umum tak berguna, kata yang tak terbukti, spam sinonim, merek tak diizinkan, dan frasa yang melanggar aturan platform.
7. **Terapkan profil platform:** batas judul, batas jumlah keyword, bahasa, format keyword, kategori, field khusus, flag AI/editorial/mature, dan aturan release.
8. **Validasi skema CSV:** header, delimiter, urutan kolom, jumlah kolom per baris, quoting/escaping, encoding, filename yang cocok, dan limit file.
9. **Tampilkan preview:** biarkan contributor mengedit title, keyword, kategori dan status sebelum ekspor.
10. **Ekspor dan log:** simpan file hasil, versi aturan, jumlah keyword, flag validasi, dan warning per baris agar mudah ditelusuri.

## 7.2 Prinsip keyword yang berkualitas

Gunakan taksonomi internal berikut sebagai panduan, bukan sebagai keyword wajib yang harus selalu masuk:

- **Subjek inti:** apa yang paling utama di gambar.
- **Objek/atribut:** benda, bahan, warna dominan, bentuk, detail yang tampak.
- **Aksi/relasi:** sedang melakukan apa, hubungan antara subjek dan objek.
- **Setting/lokasi:** studio, indoor/outdoor, kota atau negara jika diketahui.
- **Komposisi:** close-up, aerial view, top view, portrait, copy space, panoramic, hanya bila cocok.
- **Konsep:** misalnya teamwork, sustainability, relaxation, resilience — hanya jika visual mendukung makna itu.
- **Audiens/kegunaan:** marketing, invitation, website header, packaging, presentation, hanya bila penggunaan tersebut masuk akal dari bentuk aset; jangan menjejalkan semuanya.
- **Teknis/jenis file:** jangan tambahkan `jpg`, `eps`, `psd`, `photography`, `vector`, atau istilah sejenis hanya untuk menambah jumlah keyword, khususnya pada Magnific/Freepik dan platform lain yang melarangnya.

Pilih keyword berdasarkan kekuatan bukti dan potensi pencarian. Sepuluh keyword sangat relevan biasanya lebih baik daripada lima puluh keyword yang berulang atau tidak terkait.

---

# 8. Rekomendasi validator per platform

| Validator | Adobe Stock | Shutterstock | Vecteezy | Magnific |
|---|---|---|---|---|
| Header persis | Ya | Ya | Ya; jaga `Filename`/`Id` pada update | Verifikasi template panel aktual |
| Kecocokan filename | Ekstensi wajib sesuai spesifikasi | Harus cocok dengan aset submission saat ini | Aturan ekstensi berbeda antara FTP dan Add Data | Cocokkan dengan file upload/template |
| Jumlah keyword | Pakai maks. 49 (dokumen konflik 49/50) | 7–50 | 5–50 | 5–50 |
| Saran keyword | Relevansi tertinggi di posisi awal; khususnya top 10 | Relevan, individual, tanpa pengulangan | 20–30 disarankan; top 5 terpenting | Sekitar 20; kurangi pengulangan/spam |
| Judul | ≤70 karakter; tanpa koma/karakter khusus sesuai CSV spec | Target ≤150 karakter agar kompatibel dengan batas editor yang lebih ketat; editorial perlu pemeriksaan | 3–8 kata dan <100 karakter sebagai nilai konservatif | 35–100 karakter |
| Kategori | Nomor terverifikasi; 21 kategori | Nama kategori resmi; 1 wajib + opsional kedua | Jangan tambahkan kategori tema ke CSV | Jangan tambahkan kategori tema ke CSV tanpa instruksi template terkini |
| Release | Nama file release exact, ≤30 karakter | Bukan field pada skema CSV yang diperiksa | Alur release terpisah di Add Data | Ikuti release/content policy portal |
| AI metadata | Deklarasi AI perlu sesuai alur Adobe | Tidak ada kolom prompt/model dalam skema CSV ini | Magic Metadata adalah opsi terpisah; editorial/bundle tidak eligible | `_ai_generated`; prompt/model bila applicable |
| Delimiter kolom | Koma | Koma | Koma | Titik koma `;` |
| Encoding/size limit | UTF-8; ≤1 MB; ≤5.000 baris | Tidak disebut di halaman CSV yang diperiksa | Tidak disebut di halaman CSV yang diperiksa | Tidak disebut di panduan CSV yang diperiksa |

---

# 9. Kasus tepi yang wajib diuji

Sebelum dipakai untuk batch besar, buat test fixture untuk tiap exporter dan pastikan file dibuka kembali menggunakan CSV parser, bukan hanya dilihat di spreadsheet.

1. Filename mengandung spasi, huruf kapital, beberapa titik, atau ekstensi yang tidak cocok.
2. Judul berisi apostrof, tanda kutip, aksen, non-ASCII, atau koma.
3. Keyword multi-kata seperti `black background`, `copy space`, atau `business meeting`.
4. Keyword berisi koma/tanda kutip yang harus di-escape.
5. Baris dengan keyword kosong, terlalu sedikit, atau lebih dari maksimum.
6. Duplikat keyword dengan kapitalisasi berbeda, misalnya `Flower` dan `flower`.
7. Kategori kedua Shutterstock disertakan dan tidak disertakan.
8. Shutterstock hanya menggunakan `Editorial=Yes` dengan flag opsional lain kosong: pastikan posisi/header tidak bergeser.
9. Video Shutterstock untuk kategori yang ditandai tidak tersedia bagi video.
10. CSV Vecteezy dari Add Data: nilai `Id` tetap utuh setelah diedit.
11. CSV Vecteezy untuk FTP: filename diekspor tanpa ekstensi jika sesuai ketentuan FTP.
12. CSV Magnific: delimiter kolom `;` tetap bertahan walaupun Keyword memakai koma.
13. Metadata AI Magnific: `_ai_generated` hanya ditambahkan bila benar; prompt/model tidak ditebak.
14. File CSV dengan baris baru dalam field, quote terlepas, UTF-8, BOM, dan sel kosong.
15. Aset yang diunggah tidak sama dengan semua filename pada CSV: gagal validasi sebelum upload.

---

# 10. Kesimpulan dan keputusan implementasi

Untuk generator metadata microstock, pendekatan yang paling aman adalah:

- **Satu metadata master internal** dengan keyword array, title/description terpisah, kategori internal, license, release, AI status, prompt/model, dan flags.
- **Empat exporter terpisah**: Adobe Stock, Shutterstock, Vecteezy, dan Freepik/Magnific.
- **Empat validator terpisah**, menggunakan batas konservatif ketika dokumentasi resmi saling bertentangan.
- **Taxonomy mapping yang bisa diperbarui**, bukan prompt yang memaksa model mengarang angka kategori.
- **Human review sebelum ekspor** untuk keyword, kategori, editorial, trademark, release, dan AI status.
- **Regression tests untuk hasil CSV** agar perubahan library/format tidak diam-diam merusak jumlah kolom atau delimiter.

Prioritas implementasi yang paling penting: 1) skema internal dan keyword array, 2) serializer CSV yang benar, 3) validator filename/header/keyword count, 4) mapping kategori yang diverifikasi, 5) profil title/keyword khusus platform, 6) flag AI/editorial/releases, dan 7) preview serta pencatatan warning sebelum unduh.

## Daftar sumber resmi

### Adobe Stock

- [CSV requirements for Adobe Stock](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html)
- [Create a CSV file for Adobe Stock](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/create-csv-file.html)
- [Choose the right category for your content](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/choose-right-category-content.html)
- [Tips for effective titles and keywords](https://helpx.adobe.com/stock/contributor/content-policies-guidelines/metadata/tips-effective-titles-keywords.html)

### Shutterstock

- [How do I include existing metadata with my content submission?](https://submit.shutterstock.com/help/en/articles/10617486-how-do-i-include-existing-metadata-with-my-content-submission)
- [Content Publishing Standards: Contextual Metadata](https://submit.shutterstock.com/help/en/articles/10617427-content-publishing-standards-contextual-metadata)
- [Description and Keyword Best Practices](https://submit.shutterstock.com/help/en/articles/10594702-description-and-keyword-best-practices)
- [Contributor upload/submit workflow](https://submit.shutterstock.com/help/id/articles/10617414-portofolio-mempersiapkan-konten-yang-anda-unggah-untuk-dikirim)

### Vecteezy

- [CSV Metadata Upload](https://eezycontributors.zendesk.com/hc/en-us/articles/360029388091-CSV-Metadata-Upload)
- [Metadata Guidelines](https://eezycontributors.zendesk.com/hc/en-us/articles/360039385912-Metadata-Guidelines)
- [Vecteezy Keyword Guide](https://eezycontributors.zendesk.com/hc/en-us/articles/4401763019924-Vecteezy-Keyword-Guide)
- [What are categories?](https://eezycontributors.zendesk.com/hc/en-us/articles/8837507965204-What-are-categories)
- [Magic Metadata](https://eezycontributors.zendesk.com/hc/en-us/articles/26699723854484-Magic-Metadata)

### Freepik Contributor / Magnific

- [How to create a .csv file](https://www.magnific.com/ai/contributors/how-to-create-a-csv-file)
- [Metadata Guidelines — Must read](https://www.magnific.com/ai/contributors/metadata-guidelines-must-read)
- [AI generated resources prompts](https://www.magnific.com/ai/contributors/ai-generated-resources-prompts)
- [AI generated resources — General guidelines](https://www.magnific.com/idn/ai/contributors/ai-generated-resources-general-guidelines)
- [Freepik is now Magnific](https://www.magnific.com/ai/docs/freepik-is-now-magnific)

---

**Catatan metodologi:** laporan ini menyarikan dokumentasi resmi yang tersedia secara publik pada 10 Oktober 2026. Beberapa halaman resmi masih menggunakan istilah lama atau mencantumkan batas yang tidak sepenuhnya konsisten. Untuk implementasi final, template yang diunduh dari akun contributor dan validasi upload pertama berukuran kecil tetap harus menjadi pemeriksaan akhir, terutama untuk nomor kategori Adobe, header Freepik/Magnific, serta batas teks Shutterstock.
