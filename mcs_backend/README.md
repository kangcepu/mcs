# MCS Express Backend

Backend udpate sebagai pengganti CI3.

## Menjalankan

```powershell
npm install
npm run dev
```

Server berjalan di `http://localhost:3000`. Konfigurasi lokal sudah berada di `.env` dan mengambil kredensial yang sama dengan backend lama. Ubah hanya bila MySQL Anda berbeda.

```powershell
npm run check
npm run test:smoke
```

Endpoint awal untuk verifikasi: `GET /api/v2/health`.

API memakai `Authorization: Bearer <token>`. Login kompatibel dengan aplikasi lama: `POST /api/v2/auth/login`, body `{ "username": "...", "password": "..." }`.

Namespace yang tersedia: auth/profile, master, assets/equipment, preventive schedules, work orders/approval, material usage, Daily Control, settings, media, reports, notifications, dan mobile release.

## Export PDF (Gotenberg)

Endpoint `*/pdf` (report-equipment, report-asset-mutation, report-wo-mtc) menggunakan [Gotenberg](https://gotenberg.dev/) untuk convert HTML ke PDF. Jalankan Gotenberg secara lokal:

```bash
docker run -d --rm -p 3001:3000 --name gotenberg gotenberg/gotenberg:8
```

Lalu set `GOTENBERG_URL=http://localhost:3001` di `.env` (default sudah begitu). Endpoint export Excel (`*/excel`) dan JSON tidak butuh Gotenberg sama sekali.

## Material Usage — pencarian part ERP

## Daily Control — push notification (FCM)

Komentar baru di Daily Control mengirim push notification (Firebase Cloud Messaging) ke pemilik aktivitas, participant WO, dan siapa saja yang pernah komentar/membaca aktivitas itu — sama seperti alur mobile lama. Set `FIREBASE_SERVICE_ACCOUNT_PATH` di `.env` ke path file service account JSON (`firebase-admin`). Tanpa env ini terisi/file valid, pengiriman otomatis di-skip (tidak error) — cocok untuk dev tanpa kredensial. Token device yang invalid (uninstall app dsb) otomatis di-nonaktifkan (`tb_user_device_token.is_active=0`).

## Preventive Schedule — generator WO otomatis

Backend menjalankan scheduler internal (`node-cron`, default tiap jam — atur via `SCHEDULE_CRON_EXPR`) yang mereplikasi `schedule/scheduling_create_wo_mtc` legacy: cek semua Preventive Schedule aktif, generate WO untuk yang jatuh tempo hari ini (harian/mingguan/bulanan/dst). Pakai MySQL advisory lock (`GET_LOCK`) supaya tidak overlap kalau proses sebelumnya belum selesai. Endpoint manual `POST /preventive-schedules/generate` tetap tersedia untuk generate WO awal segera setelah schedule baru dibuat.

Endpoint `GET /material-usage/erp-parts` konek LANGSUNG ke database ERP Ascend (SQL Server) via `mssql` — tidak lagi lewat microservice PHP terpisah. Set `ERP_MSSQL_HOST`/`ERP_MSSQL_PORT`/`ERP_MSSQL_USER`/`ERP_MSSQL_PASSWORD` plus 4 nama database per company (`ERP_MSSQL_DB_UC`, `_RU`, `_GSU`, `_GSU_TEST5`) di `.env`. Company `GSU` memakai pencarian item usage (join production `AS_GSU` + identitas sandbox `AS_GSU_TEST5`); company lain memakai pencarian nama item sederhana lintas `AS_UC_2017`/`AS_RU`/`AS_GSU`.
