# Bantuan Aure Code

Aure Code menjalankan **Claude Code resmi tanpa modifikasi** di ponsel Anda, membungkusnya dengan antarmuka grafis, dan menyertakan toolkit pengembangan lengkap. Claude bisa membaca dan menulis file, menjalankan perintah, dan menyalakan server lokal, sama seperti di terminal komputer.

## Memulai

1. **Pasang toolkit**: saat pertama kali dibuka, centang modul yang Anda inginkan. Paket bawaan sekitar 330 MB dan bisa dilanjutkan jika terputus.
2. **Masuk atau tambahkan kunci**: beri izin akun Claude Anda sekali di browser, atau masukkan kunci untuk Anthropic, DeepSeek, Qwen, atau endpoint kompatibel lainnya.
3. **Mulai percakapan**: ketuk ＋ di bilah atas, atau Chat baru di bilah samping.
4. **Biarkan Claude bekerja**: Claude bertanya dulu sebelum menyunting file atau menjalankan perintah; ganti mode izin di bawah kotak masukan.

## Tampilan layar

Ujung kanan bilah atas biasanya hanya menampilkan ⋯. Ketuk untuk memunculkan pintasan yang paling sering dipakai di sebelah kirinya; ketuk lagi (sekarang menjadi ›) untuk menyembunyikannya. Aplikasi mengingat posisi terakhir yang Anda pilih.

| Tombol | Fungsinya |
|---|---|
| 📁 | File: jelajahi, sunting, dan pratinjau file di workspace |
| >_ | Terminal: toolchain yang sama dengan yang dipakai Claude |
| 🌐 | Browser: server lokal dan tautan dari balasan; di tablet menempel di sisi kanan |
| ‹› | Palet perintah: perintah garis miring, skill, dan tindakan umum |
| ＋ | Percakapan baru |
| ⋯ | Tampilkan atau sembunyikan tombol di atas |

Tombol menu di kiri atas membuka bilah samping: tujuan di bagian atas (Chat, Proyek, Tugas terjadwal, serta Ekstensi, Kemampuan, Pemakaian, dan Bantuan di bawah Lainnya), chat terbaru di tengah, dan baris akun di bagian bawah yang membuka Pengaturan.

Garis tipis di bawah bilah atas menunjukkan **pemakaian konteks**; makin ke kanan makin penuh. Paruh keduanya menunjukkan sisa kuota penyedia saat ini: porsi batas 5 jam dan mingguan yang terpakai jika Anda masuk dengan akun Claude, atau saldo untuk DeepSeek, Kimi, dan sejenisnya. Ketuk garis itu untuk detailnya; kuota dan pengeluaran tiap penyedia, serta pengingat kuota menipis, ada di **Kuota dan pengeluaran** di bagian atas halaman Pemakaian. Di area masukan, ＋ melampirkan file dan membuka tindakan umum. Baris di bawahnya menampilkan model, upaya berpikir, dan mode izin; ketuk salah satunya untuk menggantinya. Pemilih model hanya menampilkan penyedia yang bisa Anda pakai: akun Claude yang belum masuk, atau model di perangkat yang belum diunduh, tidak ditampilkan. Untuk menyembunyikan penyedia yang sudah diatur, pilih di **Penyedia & model** di Pengaturan lalu matikan **Tampilkan di pemilih model** (pengaturannya tetap tersimpan, dan yang sedang dipakai selalu ditampilkan).

## Sesuaikan sesuai selera

- **Tampilan**: Pengaturan → Umum → Tampilan menyediakan empat gaya: Native, Qiusuo, Zhuyue, dan Construct, masing-masing dalam mode terang dan gelap. Construct bersudut tajam, bergaris tinta tebal, dan merah di atas kertas cokelat, untuk tampilan yang lebih tegas.
- **Warna aksen**: Pengaturan → Umum → Warna aksen menyediakan delapan preset atau warna pilihan Anda sendiri. Warnanya disesuaikan dengan tampilan saat ini agar tetap terbaca di mode terang maupun gelap.
- **Tombol di bawah pesan**: di Pengaturan → Umum, ketuk tombol yang tidak Anda pakai (misalnya penanda atau cabang) untuk menyembunyikannya; pesan Anda dan balasan Claude diatur terpisah.
- **Tombol bilah atas**: Pengaturan → Umum → Tombol bilah atas. Setiap tombol bisa Disematkan (selalu di bilah atas, tanpa perlu mengetuk ⋯ dulu), Di ⋯, atau Disembunyikan. Tahan pegangan di kiri lalu seret untuk mengubah urutan. Kembalikan bawaan mengembalikan semuanya.
- **Font**: antarmuka dan balasan masing-masing bisa memakai font berbeda. Di Pengaturan → Umum → Font yang diimpor, impor file ttf / otf / woff / woff2, lalu pilih lewat Kustom… di baris yang Anda inginkan. Karakter yang tidak ada di font itu (misalnya huruf Mandarin di font Latin) memakai font bawaan. Kode dan terminal selalu memakai font monospace bawaan.
- **Prompt tersimpan**: simpan prompt panjang yang sering Anda kirim lalu pilih dengan mengetik / di kotak masukan; lihat Ekstensi di bawah.
- **Pintasan bilah samping**: Sesuaikan item yang disematkan… di bagian bawah Lainnya pada bilah samping.

Semua pilihan ini disimpan di data aplikasi sendiri, jadi menghapus cache WebView tidak akan menghilangkannya.

## Percakapan

- **Enter mengirim.** Mengirim saat Claude sibuk akan mengantrekan pesan; ⚡ menyela giliran yang sedang berjalan tanpa menghentikannya.
- `/` membuka perintah garis miring dan `@` merujuk file. Pakai Bagikan → Aure Code di aplikasi lain untuk langsung melampirkan file.
- Baris atas ＋ di sebelah kotak masukan: Lampirkan file, Ambil foto, Tangkapan layar, Jelajahi file. Foto diperkecil menjadi 2048 px di sisi terpanjang sebelum dilampirkan. **Tekan lama Tangkapan layar untuk mengambilnya dalam 5 detik**: pindahlah ke aplikasi yang ingin ditangkap selama itu, dan Anda akan dikembalikan setelahnya.
- Pemanggilan alat diringkas menjadi satu baris seperti "3 langkah · selesai"; ketuk untuk melihat tiap langkah. Langkah yang membutuhkan Anda, atau yang gagal, terbuka sendiri.
- **Subagen** punya kartu sendiri di bawah langkah yang menjalankannya: satu baris per subagen dengan status, jumlah langkah, dan apa yang sedang dikerjakannya; ketuk baris untuk membuka langkah-langkahnya. Di bagian bawah, log pesan menampilkan "siapa → kepada siapa · tentang apa". Arahan dan laporan tiap subagen disimpan di `.aurecode/agents/` di folder proyek; ketuk "Arahan" atau "Laporan" untuk membacanya.
- Path di balasan terbuka di penampil; tautan web terbuka di browser dalam aplikasi.
- Setiap pesan punya empat tombol. Pesan Anda: salin, kirim ulang, mundur ke sini, hapus. Balasan Claude: salin, bagikan, cabangkan dari sini, hapus.
- **Mundur ke sini** pertama-tama menampilkan file yang berubah sejak saat itu, lalu Anda bisa membatalkan kodenya saja, atau kode sekaligus percakapannya. File yang diubah perintah shell tidak dipulihkan.
- `/goal <syarat>` membuat Claude terus bekerja giliran demi giliran sampai syaratnya terpenuhi. Tugas latar dan daftar tugas tampil di atas kotak masukan, dan masing-masing bisa dihentikan; beberapa tugas latar diringkas menjadi satu baris, ketuk untuk membukanya.
- Halaman Chat bisa mencari isi pesan, menyaring, serta mengekspor atau mengimpor zip. Chat yang dihapus disimpan di tempat sampah selama 30 hari.

## Izin dan keamanan

| Mode | Perilaku |
|---|---|
| Tanya saya (bawaan) | Membaca bebas; bertanya sebelum menyunting file, menjalankan perintah, atau mengakses internet |
| Terima suntingan | Menyunting tanpa bertanya; tetap bertanya sebelum menjalankan perintah |
| Rencana | Hanya membaca dan merencanakan, lalu bertindak setelah Anda menyetujui |
| Otomatis | Pengklasifikasi Claude memutuskan apa yang perlu ditanyakan (eksperimental) |
| Tolak tanpa bertanya | Apa pun yang butuh persetujuan langsung ditolak; untuk proses tanpa pengawasan |
| Izinkan semuanya | Tidak pernah bertanya; hanya jika Anda benar-benar memercayai tugasnya |

**Apa arti sebenarnya "Izinkan semuanya".** Claude berhenti bertanya dan langsung menyunting file apa pun atau menjalankan perintah apa pun, termasuk menghapus, mengakses internet, dan mengirim data keluar. Risiko utamanya bukan Claude sendiri, melainkan apa yang dibacanya: halaman web, file unduhan, repositori dan issue milik orang lain bisa menyembunyikan instruksi untuk AI (prompt injection) yang menyuruhnya membaca kunci Anda, mengubah pengaturan, atau mengunggah sesuatu. Di mode "Tanya saya" Anda melihat langkah itu dan bisa menolaknya; dengan "Izinkan semuanya" pemeriksaan itu hilang. Jadi:

- Aktifkan hanya untuk tugas yang jelas dan Anda tahu file mana yang akan disentuhnya, lalu kembalikan setelahnya.
- Biarkan nonaktif saat Claude membaca halaman web, repositori, atau file yang asal-usulnya tidak jelas.
- "Konfirmasi tindakan sensitif" (Pengaturan → Perilaku Claude, aktif secara bawaan) adalah jaring pengaman: saat Claude akan membaca kunci atau kredensial masuk (.env, kunci SSH, API key, token gateway, dan sejenisnya), membaca layar atau mengetuk di aplikasi lain, membaca papan klip, atau membagikan file keluar, kartu berbingkai merah akan bertanya kepada Anda bahkan dalam mode "Izinkan semuanya". Jika kartu itu muncul padahal Anda tidak menyuruh Claude melakukannya, tolak. Fitur ini hanya mengenali bentuk yang jelas dan bisa sengaja diakali, jadi jangan menganggapnya sebagai jaminan untuk "Izinkan semuanya".

- Kartu persetujuan muncul di bawah alat yang membutuhkannya, dan bilah di atas kotak masukan membuatnya tetap terlihat. Izinkan, selalu izinkan, atau tolak dengan alasan (opsional).
- Saat aplikasi di latar, Anda diberi tahu ketika satu giliran selesai atau membutuhkan Anda. Dari notifikasi Anda hanya bisa menolak; untuk mengizinkan, kembali ke aplikasi dan baca perintah lengkapnya.
- Kunci tetap di direktori privat aplikasi. Login akun ditangani Claude Code sendiri; aplikasi tidak pernah menyentuh kredensial Anda.

## Proyek dan tugas terjadwal

**Proyek** adalah folder kerja dengan instruksinya sendiri (CLAUDE.md) serta model, upaya berpikir, dan izin bawaannya. Percakapan yang dimulai dalam proyek berjalan di folder itu dan otomatis memakai instruksinya.

- Bilah samping → Proyek → Proyek baru: buat folder di workspace, pakai folder yang sudah ada, atau clone dari git. Dengan folder yang sudah ada, percakapan yang pernah Anda mulai di sana ditambahkan otomatis.
- Layar sambutan percakapan baru memungkinkan Anda memilih proyek; label proyek lalu muncul di bawah kotak masukan.
- Tekan lama percakapan yang sudah ada (atau ketuk ⋯) lalu pilih Pindahkan ke proyek; catatannya ikut dipindahkan.
- Bilah filter di halaman Chat bisa menampilkan satu proyek saja, atau hanya percakapan yang dibuat tugas terjadwal (ditandai ikon jam).

**Tugas terjadwal** menjalankan Claude sekali di perangkat ini pada waktu yang ditentukan. Tidak ada orang yang bisa ditanya, jadi apa pun yang butuh persetujuan Anda akan ditolak. Mulailah dengan mode hanya-baca selama beberapa hari sebelum memberinya izin lebih.

- Harian, mingguan, bulanan, setiap beberapa jam, sekali, atau ekspresi cron. Formulir menampilkan dua waktu proses berikutnya saat Anda menyunting.
- Untuk "jangan ganggu kecuali ada masalah": minta ia membalas dengan satu frasa tetap saat tidak ada temuan (misalnya "Semua aman") dan atur notifikasi ke Hanya jika ada temuan.
- Anda bisa membatasi proses hanya saat Wi-Fi atau mengisi daya, membatasi biaya dan durasi per proses, dan menetapkan total harian. Sebagian besar API pihak ketiga tidak melaporkan biaya, jadi batas biaya tidak berlaku untuknya.
- Penghitung waktu ada di gateway: tugas berjalan tepat waktu selama aplikasi terbuka atau berjalan di latar. Jika sistem mematikannya atau perangkat mati, proses itu terlewat dan ditangani oleh pengaturan Jika terlewat milik tugas tersebut saat Anda membuka aplikasi berikutnya; proses yang terlewat tidak pernah dikejar diam-diam.

## Silsilah

Halaman Silsilah di bilah samping menggambar semua sesi Anda sebagai peta kereta bawah tanah: waktu berjalan dari kiri ke kanan, tiap jalur adalah satu sesi, dikelompokkan dalam pita per proyek. Dalam mode potret tampilannya menjadi pohon berindentasi. Pada kunjungan pertama, ketuk "Cara membaca" di kanan atas. Tur dua menit itu memakai data contoh dan tidak pernah menyentuh sesi Anda.

- **Stasiun dan nomor arsip.** Setiap pemadatan mengakhiri satu bab dan menambah satu stasiun di jalur. "a1b2·3" adalah nomor arsip: empat karakter pertama ID sesi · nomor bab. Ketuk stasiun untuk melompat ke awal bab itu.
- **Asal judul.** Model di chat memberi judul tiap bab sendiri, berdasarkan apa yang benar-benar dikerjakan di bab itu, bukan pesan pertama Anda; daftar sesi menampilkan judul bab terbaru. Untuk chat baru, aplikasi menulis judul di latar tepat setelah balasan pertama, dan judul itu muncul beberapa detik kemudian. Pilih model untuk tugas ini, atau matikan, di Judul otomatis pada Pengaturan → Penyedia & model. Untuk mengganti nama chat, cukup minta model, atau tekan lama chat di daftar lalu ganti namanya sendiri; nama yang Anda tetapkan tidak pernah ditimpa.
- **Asal sebuah jalur.** Jalur yang bercabang dari jalur lain di tengah jalan adalah fork. Jalur yang berbelok balik di titik cabang adalah rewind. Jalur yang mengalir masuk dengan panah adalah penggabungan. Bab lama tanpa judul menampilkan prompt pertamanya dalam warna abu-abu; "Isi judul" di bilah alat memberi judul semuanya sekaligus.
- **Penggabungan.** Saat beberapa sesi masing-masing sudah setengah jalan dan Anda ingin melanjutkan di satu sesi baru: pilih sebuah jalur, ketuk "Gabungkan…" di kartunya, centang sesi lainnya, lalu ketuk "Berikutnya". Panduannya tiga langkah: untuk tiap sumber, pilih ringkasan pemadatannya atau beberapa giliran pilihan; tulis satu kalimat tentang langkah berikutnya; pratinjau pesan pertama (bisa Anda sunting). Setelah dikirim, jalur dari tiap sumber mengalir ke sesi baru itu.
- **Tambah sumber, cabangkan dari sini.** Di "Lainnya…" pada kartu: sesi tempat Anda pernah menempel serah terima secara manual tidak punya sumber yang bisa ditebak, jadi tautkan dengan "Tambah sumber…", dan batalkan jika salah. "Cabangkan dari sini" membuat sesi baru dari giliran terakhir sesi ini.
- **Rujukan arsip.** Tulis "lihat a1b2·3" di pesan dan ringkasan pemadatan dari akhir bab itu dilampirkan untuk Claude (tidak tampil di gelembung pesan Anda). Maksimal tiga per pesan. Jika bab itu masih berjalan dan belum punya ringkasan, Claude diberi tahu lokasi file sesinya agar bisa membacanya bila perlu.
- **Rincian.** "Rincian" di kartu menjabarkan sesi giliran demi giliran: kapan tiap giliran berjalan, berapa pemanggilan alat, berapa subagen yang dikirim, berapa kesalahan. Sesi yang dicabangkan dari sebuah giliran digantung di bawahnya; ketuk untuk melihat rinciannya. Ketuk sebuah giliran untuk melihat setiap pemanggilan alat (bagian terang adalah waktu berpikir sebelum pemanggilan, bagian gelap adalah alat yang berjalan) dan berapa lama tiap subagen berjalan, dengan subagen bertingkat diindentasi. Tombol kembali mundur satu tingkat setiap kali.
- **Ekspor.** "Ekspor" di bilah alat menyimpan peta saat ini sebagai gambar (PNG), file vektor (SVG), atau halaman web satu file yang bisa digeser dan diketuk (HTML), lalu memungkinkan Anda menyimpannya di tempat lain atau membagikannya.

## File, terminal, browser

- **File dan penampil**: sunting dan simpan kode langsung di tempat; jika file berubah di disk, Anda ditanya sebelum menyimpan. Markdown, gambar, PDF, dan HTML bisa dipratinjau langsung, dan HTML dimuat ulang saat berubah. Word dan Excel terbuka apa adanya; PPT dan .doc lama butuh LibreOffice, yang dipasang saat pertama kali dipakai.
- **Terminal**: banyak tab, ditambah baris tombol Esc, Tab, Ctrl, dan panah. Tetap berjalan walau panelnya ditutup.
- **Browser**: ketik `127.0.0.1:port` untuk membuka server lokal. ↗ menyerahkan halaman ke browser sistem; halaman masuk (login) selalu dibuka di sana.

## Layar besar dan layar terpisah

Tata letak mengikuti lebar jendela, bukan orientasi:

- Sempit: satu kolom; file, terminal, dan browser menutupi layar.
- Lebar (≥ 840): chat ditambah workspace di kanan; seret pemisahnya, ketuk dua kali untuk mengatur ulang.
- Lebih lebar (≥ 1000): bilah samping tetap menempel di kiri, dan tepinya juga bisa diseret.

## Ekstensi

- **Modul toolkit**: pasang dan copot sesuai kebutuhan; masing-masing menampilkan kegunaan, ukuran, dan apa yang memakainya. Mengetik perintah yang belum ada di terminal akan memberi tahu modul mana yang memilikinya.
- **Komponen**: alat berukuran besar seperti Chromium, Blender, Godot, LibreOffice, llama.cpp, dan driver GPU, dipasang saat Anda membutuhkannya. Tanda tangannya diperiksa lebih dulu, dan setiap komponen menyertakan skill agar Claude tahu cara memakainya.
- **Prompt tersimpan**: buat di Prompt tersimpan pada halaman Ekstensi: beri nama (misalnya issue) dan tulis apa yang harus dikirim ke Claude. Lalu ketik `/issue detail Anda` di kotak masukan, dan teks setelah nama itu mengisi `$ARGUMENTS`. Prompt bisa berlaku untuk semua proyek atau hanya proyek saat ini. Prompt disimpan sebagai file perintah standar Claude Code, jadi claude di terminal juga bisa memakainya.
- **Plugin, skill, MCP**: tambahkan dan kelola di halaman Ekstensi; perubahan berlaku mulai pesan berikutnya. Lainnya → Kemampuan menampilkan semua yang bisa dipakai Claude di giliran ini.
- **pkg**: di terminal, `pkg install rust` memasang paket dari repositori Termux; `pkg verified` menampilkan paket yang sudah diuji di perangkat.

## Shizuku dan izin sistem

- Pengaturan → Perangkat & izin → Pasang dan aktifkan. Aktivasi lewat debugging nirkabel tanpa komputer, dan aktif ulang sendiri setelah reboot.
- Setelah aktif, terminal dan Claude bisa menjalankan `priv '<perintah>'` sebagai pengguna shell; setiap pemanggilan tercatat di Log perintah istimewa.
- **Alat perangkat** (nonaktif secara bawaan): izinkan Claude mengirim notifikasi, memakai papan klip, dan membagikan file. Membaca dan mengetuk layar butuh aksesibilitas, yang bisa dinyalakan hanya saat dipakai.
- **Pengelola memori** (nonaktif secara bawaan): menghentikan aplikasi latar di luar daftar izin Anda sebelum pekerjaan berat. Di terminal, pakai `cc-mem run -- <perintah>`.

## Pembaruan dan perbaikan

- **Pembaruan otomatis** (aktif secara bawaan): Claude Code diperbarui diam-diam; versi aplikasi baru diperiksa tanda tangannya lalu ditawarkan untuk dipasang; pembaruan toolkit diunduh lewat Wi‑Fi dan diterapkan saat aplikasi dibuka berikutnya.
- Toolkit diunduh dari GitHub (repositori Aure Code) atau dari file lokal. Unduhan yang terputus dilanjutkan dari titik terakhir, dan semuanya diperiksa terhadap hash yang disertakan di APK.
- Pembaruan diverifikasi terhadap manifest rilis sebelum ada yang diganti. Jika terputus, pembaruan diselesaikan atau dikembalikan saat aplikasi dibuka berikutnya.
- Catatan perbaikan di Pengaturan → Pemecahan masalah mencatat setiap pemasangan, pemeriksaan, dan perbaikan.
- **Dua paket pemasangan**: `aurecode.apk` yang biasa menargetkan SDK 28 dan berjalan di perangkat paling banyak; `aurecode-36.apk` menargetkan SDK 36 untuk ponsel baru yang sistemnya menolak aplikasi dengan target SDK lama. Keduanya punya fitur sama dan berbagi data, dan Anda bisa beralih kapan saja di Pengaturan → Pembaruan → Paket pemasangan. Jika sistem pernah menolak build 28, aplikasi mengingatnya dan hanya memperbarui ke 36 sejak itu; memilih 28 lalu diblokir. Di build 36, program toolkit dijalankan lewat loader sistem, jadi sesekali program yang mencari datanya relatif terhadap path-nya sendiri bisa berperilaku aneh — tolong laporkan jika Anda menemukannya.

## Masalah yang diketahui

- Sudah diperbaiki · Semua · **Masukan Pinyin tidak sampai ke kotak saat pertama dibuka**: diperbaiki di 0.3.7. Di versi lama, ketuk di luar kotak masukan lalu kembali.
- Ada solusi · Semua · **Tidak ada yang bisa digulir**: bug pada WebView sistem. Aplikasi mendeteksinya dan pulih dalam sekitar satu detik, sambil mengembalikan teks yang belum terkirim; jika tidak pulih, tekan dan tahan judul di bilah atas (nama percakapan) sekitar satu detik; judul memudar, ponsel bergetar singkat, dan pemulihan dimulai.
- Ada solusi · Red Magic / Nubia · **Dibekukan setelah sekitar 90 detik di latar**: Info aplikasi → Penggunaan baterai → izinkan aktivitas latar, dan izinkan mulai otomatis.
- Ada solusi · Xiaomi / OPPO / vivo / Huawei · **Pembersihan latar yang terlalu agresif**: atur penghemat baterai ke tanpa batasan, izinkan mulai otomatis, dan kunci kartu aplikasi di daftar aplikasi terbaru.
- Ada solusi · ZUI · **"Layar terpisah tidak didukung"**: daftar blokir layar terpisah milik sistem sudah usang. Pasang ulang di atasnya atau reboot.
- Sedang diselidiki · Semua · **Bilah atas menampilkan "Kesalahan skrip antarmuka: Script error."**: saat kode yang dijalankan cangkang Android di halaman gagal, WebView hanya memberikan baris ini, jadi asalnya tidak bisa diketahui. Sejak 0.3.13 pesannya berbunyi "<titik masuk>: <alasan>", jadi tangkapan layar sudah cukup untuk melacaknya. Aplikasi biasanya tetap berjalan.
- Sedang diselidiki · Samsung · **Macet di "Menunggu gateway…" setelah dibuka**: pernah dilaporkan sekali; gateway sebenarnya berjalan dan aplikasi terbuka setelah dua sampai tiga menit. Penyebabnya masih diselidiki. Tunggu sedikit lebih lama alih-alih menutup paksa lalu membuka ulang aplikasi; setelah terbuka, kirim paket diagnostik dari Pengaturan → Pemecahan masalah.
- Sedang diselidiki · Non-Snapdragon · **Komponen GPU tidak tersedia**: sebagian besar butuh Snapdragon. GPU Mali seperti MediaTek bisa memakai gpu-driver-mali; Exynos dan Kirin belum didukung.

## Pemecahan masalah

Mulailah dari Pengaturan → Pemecahan masalah → Periksa catatan, lalu Catatan perbaikan. Jika tidak membantu, kirim Paket diagnostik ke orang yang membantu Anda, atau pakai Laporkan di GitHub: perangkat, sistem, dan hasil uji mandiri terisi otomatis, sementara kunci dan pesan Anda tidak disertakan.

Jika sebuah hook, plugin, atau CLAUDE.md merusak sesuatu, aktifkan **Mode aman** di Pengaturan → Perilaku Claude. Tidak ada kustomisasi yang dimuat sampai Anda mematikannya lagi.
