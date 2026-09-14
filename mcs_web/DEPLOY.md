# Deploy — MCS Web (Next.js 15 + PM2)

App berjalan di **port 3005**.

## Prasyarat server

- Node.js 18.18+ (disarankan 20 LTS)
- `pm2` global: `npm i -g pm2`

## ⚠️ WAJIB: daftarkan origin web di BACKEND (sekali per origin)

Frontend memanggil API `https://mcs.padmoasm.com/api` langsung dari browser.
`V2::applyCorsPolicy()` hanya mengizinkan origin yang terdaftar. Edit di backend:

`Z:\xampp\htdocs\mcs\application\config\config.php`

```php
$config['api_v2_allowed_origins'] = array(
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3005',
    'http://127.0.0.1:3005',
    'http://192.168.9.202:3005',   // <-- IP:port persis yang diketik di address bar browser
    // 'https://mcs-web.padmoasm.com',  // tambah kalau diakses lewat domain
);
```

Tambahkan **setiap** origin (skema + host + port, tanpa slash) yang dipakai user.
Setelah edit: restart Apache/PHP-FPM di server backend.

Gejala kalau origin belum terdaftar: halaman tampil tapi semua request API gagal
→ "Tidak dapat terhubung ke server".

## Pertama kali (frontend)

```bash
cd /path/ke/mcs
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # sekali, agar auto-jalan saat reboot
```

Cek: `curl -I http://127.0.0.1:3005` → `200` atau `307` (redirect ke /login).

## Update berikutnya

```bash
npm ci && npm run build && pm2 reload mcs-web
```

## Konfigurasi

| Hal | Di mana |
|---|---|
| Port | `3005` — `ecosystem.config.js` & script `npm start` |
| Base URL API | `NEXT_PUBLIC_API_BASE_URL` di `.env.production` — **di-inline saat `next build`** (ubah → build ulang) |
| CORS origin | backend `config.php` → `api_v2_allowed_origins` (lihat atas) |
| Bind address | `0.0.0.0:3005` |
| Memory guard | restart otomatis bila > 512 MB |

## Reverse proxy (opsional, contoh nginx)

```nginx
location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
Kalau pakai domain di depan, tambahkan origin domain itu ke `api_v2_allowed_origins`.

## Perintah PM2

```bash
pm2 status | logs mcs-web | restart mcs-web | stop mcs-web | delete mcs-web
```
