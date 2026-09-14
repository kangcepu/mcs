# MCS — Maintenance Control System

Monorepo untuk aplikasi **Maintenance Control System (MCS)**. Repository ini menyatukan API, dashboard web, dan aplikasi mobile agar perubahan antar-platform dapat dikelola dalam satu tempat.

## Aplikasi

| Direktori | Teknologi | Peran |
| --- | --- | --- |
| [`mcs_backend`](./mcs_backend) | Node.js, Express, TypeScript, MySQL | REST API dan layanan backend |
| [`mcs_web`](./mcs_web) | Next.js, React, TypeScript, Tailwind CSS | Dashboard dan antarmuka web |
| [`mcs_mobile`](./mcs_mobile) | Flutter, Dart, Firebase | Aplikasi mobile Android/iOS |

## Prasyarat

- Node.js 20 atau lebih baru dan npm
- Flutter SDK dengan Dart 3 atau lebih baru
- MySQL untuk menjalankan backend secara lokal
- Konfigurasi Firebase yang sah bila menjalankan fitur notifikasi pada mobile

## Menjalankan secara lokal

Clone repository lalu pasang dependency setiap aplikasi yang dibutuhkan.

```bash
git clone git@github.com:utama-corporation/mcs.git
cd mcs

cd mcs_backend && npm ci
cd ../mcs_web && npm ci
cd ../mcs_mobile && flutter pub get
```

### Backend

Buat konfigurasi lokal dari template, lalu isi nilai database dan secret sesuai environment Anda.

```bash
cd mcs_backend
cp .env.example .env
npm run dev
```

API berjalan pada `http://localhost:3000` secara default. Endpoint pemeriksaan kesehatan tersedia di `GET /api/v2/health`.

Perintah yang tersedia:

```bash
npm run check       # type-check TypeScript
npm run test:smoke  # smoke test
npm run build       # build ke dist/
npm start           # jalankan hasil build
```

### Web

Siapkan endpoint API untuk Next.js di file lokal yang tidak di-commit.

```bash
cd mcs_web
cp .env.example .env.local
# Ubah NEXT_PUBLIC_API_BASE_URL ke URL API yang sesuai
npm run dev -- --port 3005
```

Dashboard lokal tersedia di `http://localhost:3005`. Port ini menghindari bentrok dengan backend lokal yang memakai port `3000`. Untuk menjalankan mode production, gunakan `npm run build` lalu `npm start` (port `3005`).

```bash
npm run typecheck
npm run build
```

### Mobile

Buat `mcs_mobile/.env` berdasarkan endpoint development yang digunakan tim. Aplikasi membaca konfigurasi jaringan berikut:

- `MCS_BASE_URL`, `MCS_WEB_BASE_URL`, `MATERIAL_BASE_URL`, `API_BASE_URL`, dan `WS_BASE_URL`
- Variasi `*_LOCAL` dan `*_PUBLIC` untuk pemilihan jaringan
- `AUTO_DETECT_NETWORK` untuk mengaktifkan deteksi otomatis

Konfigurasi Firebase seperti `google-services.json` dan service-account JSON tidak disimpan di Git. Minta berkas tersebut melalui kanal internal yang aman.

```bash
cd mcs_mobile
flutter run
flutter test
```

## Keamanan konfigurasi

- Jangan pernah commit `.env`, token, password database, private key, atau service-account Firebase.
- Salin file `*.env.example` sebagai titik awal, lalu isi nilai hanya di file environment lokal/deployment.
- Berkas build, dependency, upload runtime, dan kredensial Firebase telah dikecualikan melalui [`.gitignore`](./.gitignore).
- Jika suatu secret pernah ter-push, segera rotasi secret tersebut; menghapus file dari commit berikutnya tidak menghapusnya dari riwayat Git.

## Workflow Git

Gunakan branch terpisah untuk setiap perubahan dan buat commit yang kecil serta fokus.

```bash
git switch -c feat/nama-fitur
git add mcs_backend/src/routes/contoh.ts
git commit -m "feat(backend): tambah endpoint contoh"
git push -u origin feat/nama-fitur
```

Sebelum membuka pull request, jalankan pemeriksaan yang relevan pada aplikasi yang Anda ubah. Jangan commit file rahasia atau artefak hasil build.

## Konvensi commit

Gunakan gaya Conventional Commits bila memungkinkan:

```text
feat(web): tambah filter laporan aset
fix(mobile): tangani koneksi websocket terputus
fix(backend): validasi payload work order
docs: perbarui panduan setup lokal
chore: perbarui dependency
```

## Kontribusi

1. Buat branch dari `main`.
2. Implementasikan perubahan dan verifikasi secara lokal.
3. Pastikan tidak ada credential atau file build yang ikut dalam `git status`.
4. Push branch lalu buat pull request untuk ditinjau tim.

---

