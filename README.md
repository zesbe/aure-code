<div align="center">

# Aure Code

**Claude Code resmi, berjalan langsung di Android, dengan antarmuka bahasa Indonesia.**

[![Android 8.0+](https://img.shields.io/badge/Android-8.0%2B-3ddc84)](#)
[![arm64](https://img.shields.io/badge/arch-arm64-5A4BE0)](#)
[![Lisensi](https://img.shields.io/badge/lisensi-Apache--2.0-0EA5E9)](LICENSE)
[![Build](https://github.com/zesbe/aure-code/actions/workflows/apk.yml/badge.svg?branch=ccodtest)](https://github.com/zesbe/aure-code/actions/workflows/apk.yml)

</div>

---

## Apa ini?

Aure Code menjalankan **Claude Code resmi tanpa modifikasi** di ponsel Android, membungkusnya dengan antarmuka
grafis, dan menyertakan toolkit pengembangan lengkap (Python, Node, Git, compiler C/C++, Java, dan lainnya).
Claude bisa membaca dan menulis file, menjalankan perintah, dan menyalakan server lokal, sama seperti di komputer.
Tidak perlu root, tidak memakai proot atau mesin virtual.

## Fitur

- **Antarmuka bahasa Indonesia** di seluruh aplikasi: menu, pengaturan, dialog, notifikasi, Bantuan, dan catatan rilis.
- **Chat dengan Claude** memakai akun Claude Anda, atau API key Anthropic, DeepSeek, Qwen, Kimi, dan penyedia kompatibel lain.
- **File, terminal, dan browser** bawaan, dengan toolkit yang sama dengan yang dipakai Claude.
- **Proyek, tugas terjadwal, dan Silsilah** (peta riwayat sesi).
- **Bisa dipasang berdampingan** dengan aplikasi asalnya (paket `cc.codtest`, folder `/sdcard/AureCode`).
- **Pembaruan langsung menimpa**: versi naik setiap build dan tanda tangan tetap, jadi tidak perlu mencopot aplikasi
  dan toolkit yang sudah terpasang tidak diunduh ulang.

## Pemasangan

Syarat: Android 8.0+, prosesor arm64, ruang kosong sekitar 4 GB.

1. Unduh APK terbaru dari tab [Actions](https://github.com/zesbe/aure-code/actions/workflows/apk.yml)
   (build pada branch `ccodtest`, artefak `aure-code-<versi>`).
2. Pasang `aurecode.apk`. Jika sistem menolak, pakai `aurecode-36.apk`.
3. Saat pertama dibuka, aplikasi mengunduh toolkit pengembangan sekitar 690 MB dari Release
   [`devkit-2026.11.03`](https://github.com/zesbe/aure-code/releases/tag/devkit-2026.11.03).

## Membangun sendiri

Setiap push ke branch `ccodtest` (atau menjalankan workflow `apk` secara manual) membangun kedua APK di GitHub Actions.
Tanda tangan memakai kunci tetap dari secret `AURE_KS_B64` / `AURE_KS_PASS`, dan nomor versi otomatis
`1000 + nomor run`. Toolkit dibangun terpisah lewat workflow `devkit-test` untuk paket `cc.codtest`.

## Kredit dan lisensi

Aure Code adalah fork dari proyek sumber terbuka karya **greyoak111**, dirilis dengan lisensi
[Apache-2.0](LICENSE). Pemberitahuan hak cipta dan atribusi pihak ketiga ada di [`NOTICE`](NOTICE)
dan [`ThirdPartyLicenses`](ThirdPartyLicenses). Dokumen proyek asal disimpan di [`docs/upstream`](docs/upstream).

Claude dan Claude Code adalah merek Anthropic. Aure Code bukan produk resmi Anthropic.
