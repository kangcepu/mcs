# MCS Express Backend

Backend TypeScript mandiri untuk menggantikan CodeIgniter MCS. Project ini memakai database MySQL lama `mcs_new`; aplikasi PHP dan dump tidak diubah.

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
