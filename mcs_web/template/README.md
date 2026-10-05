# MCS UI Templates

Folder ini menjadi sumber utama untuk empat bagian UI/UX MCS yang dapat
dipelihara secara terpisah:

- `login-page.tsx` — halaman login dan dialog error login.
- `navbar.tsx` — app header/navbar, jam, notifikasi, dan menu profil.
- `sidebar.tsx` — navigasi utama, submenu, permission, dan state collapse.
- `profile-page.tsx` — informasi akun, avatar, dan form ganti password.

Route dan komponen lama di dalam `src/` hanya menjadi wrapper/re-export agar
URL serta import existing tetap kompatibel. Alias `@template/*` didefinisikan
di `tsconfig.json`, dan folder ini sudah masuk ke konfigurasi content Tailwind.

Untuk mengubah tampilan salah satu bagian, edit file terkait di folder ini.

## Perilaku sidebar saat di-collapse (desktop)

- Sidebar **tidak hilang**; menyusut menjadi rail sempit `lg:w-16`.
- Yang tetap tampil: logo/ikon aplikasi (atau fallback ikon Wrench) dan ikon
  setiap menu utama (centered). Teks nama aplikasi, label menu, chevron, dan
  submenu disembunyikan (`lg:hidden`); nama menu tetap tersedia lewat `title`
  dan `aria-label` saat hover.
- Semua aturan collapse memakai prefix `lg:` sehingga drawer mobile tidak
  terpengaruh oleh state `collapsed`.
- Sistem lain yang memakai template ini cukup mengikuti pola kelas `lg:`
  yang sama di `sidebar.tsx` (brand, label, nav link, submenu).
