# MCS Web — Maintenance Control System

Web application baru untuk MCS (Maintenance Control System). Dibangun dengan
**Next.js (App Router) + TypeScript strict + Tailwind CSS + TanStack Query +
Zod + React Hook Form + Lucide Icons**.

Web ini menggantikan UI lama secara bertahap. Data berasal dari **MCS API V2**.
API V2 dilengkapi secara **aditif** (endpoint & field baru, envelope
`{success,message,data,meta}`) tanpa mengubah route v1 / controller mobile /
database. Lihat bagian "Kontrak API V2" di bawah.

---

## 1. Instalasi

Prasyarat: **Node.js 20+** (direkomendasikan 22/24) dan npm 10+.

```bash
npm install
```

## 2. Konfigurasi `.env.local`

Buat file `.env.local` di root project (lihat `.env.example`):

```env
NEXT_PUBLIC_API_BASE_URL=https://mcs.padmoasm.com/api
```

| Variabel                   | Wajib | Keterangan                                             |
| -------------------------- | ----- | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL` | Ya    | Base URL API MCS, **tanpa** trailing slash.           |

## 3. API Base URL

Semua pemanggilan API diturunkan dari satu sumber (`src/lib/env.ts`):

- **Base** : `NEXT_PUBLIC_API_BASE_URL` → `https://mcs.padmoasm.com/api`
- **V2**   : `${API_BASE_URL}/v2` → dipakai `apiV2` client
- **Login**: `${API_BASE_URL}/auth/login` → dipakai `apiBase` client

API client ada di [`src/lib/api-client.ts`](src/lib/api-client.ts):

- `apiV2.get/post/patch/put/delete(path, ...)` untuk endpoint V2.
- `apiBase.get/post(path, ...)` untuk endpoint non-V2 (login).
- Otomatis melampirkan `Authorization: Bearer {token}`.
- Menangani format respons standar:

  ```ts
  type ApiResponse<T> = {
    success: boolean;
    message: string;
    data: T;
    meta?: { page: number; per_page: number; total: number; total_pages: number };
  };
  ```

- **401** → hapus token + redirect ke `/login?next=...`.
- **403** → komponen menampilkan halaman/blok **"Akses Ditolak"**.
- Pesan error dari API ditampilkan apa adanya (Bahasa Indonesia) via toast /
  `ErrorState`.

Service per domain ada di [`src/lib/api/`](src/lib/api/) dan selalu dipakai
lewat hook TanStack Query di [`src/hooks/`](src/hooks/). Semua aksi tulis
melakukan `invalidateQueries` pada query terkait.

## 4. Login Flow

1. Pengguna membuka route terproteksi → `middleware.ts` cek cookie token.
   Bila tidak ada → redirect `/login?next=<tujuan>`.
2. Form login (`/login`) memanggil `POST ${API_BASE_URL}/auth/login`
   dengan `{ username, password }`.
3. Token JWT yang diterima disimpan pada **cookie** `mcs_token`
   (`Path=/`, `SameSite=Lax`, `Secure` saat HTTPS, `Max-Age` 7 hari).
   **Password / hash tidak pernah disimpan.**
4. Setelah token tersimpan, aplikasi memanggil `GET ${API_BASE_URL}/v2/me`
   untuk profil + daftar permission, lalu redirect ke `next` atau `/dashboard`.
5. Logout: hapus cookie, `queryClient.clear()`, redirect `/login`.
6. Selama sesi, jika API membalas **401**, `api-client` otomatis
   menghapus token dan mengarahkan ke `/login`.

File terkait: [`src/lib/auth.ts`](src/lib/auth.ts),
[`src/hooks/use-auth.ts`](src/hooks/use-auth.ts),
[`src/components/layout/app-shell.tsx`](src/components/layout/app-shell.tsx),
[`src/middleware.ts`](src/middleware.ts).

## 5. Struktur Permission

Profil `/v2/me` dinormalisasi menjadi `MeUser.permissions: string[]`
(mendukung array string, array objek `{name|slug}`, atau map boolean).
Lihat [`src/types/auth.ts`](src/types/auth.ts).

Pengecekan dilakukan lewat [`src/lib/permissions.ts`](src/lib/permissions.ts):

- `hasAnyPermission(user, slug | slug[])`
- `hasAllPermissions(user, slug[])`
- `canRead(user, area)` / `canWrite(user, area)` — berbasis peta
  `AREA_PERMISSIONS`.
- `user.permissions` yang berisi `"*"` atau `"super_admin"` → bypass.

Komponen/utility UI:

- `<PermissionGuard permission=... mode="hide" | "page">` — sembunyikan elemen
  atau tampilkan halaman "Akses Ditolak".
- `useCan(permission)` — boolean untuk menyembunyikan tombol aksi.

Peta area → permission (ringkas):

| Area                                   | Read                                   | Write                          |
| -------------------------------------- | -------------------------------------- | ------------------------------ |
| Daily Control                          | `daily_control` / `daily_control_all`  | —                              |
| Asset (list)                           | `list_of_asset` / `privilage_asset`    | `privilage_asset`              |
| Asset Category / Location (Master)     | `privilage_asset`                      | `privilage_asset`              |
| Material Usage                         | `material_usage`                       | `material_usage`               |
| Preventive Schedule                    | `schedule` / `work_calendar`           | `schedule`                     |
| Company / Permission Group / User      | `user_management`                      | `user_management`              |
| User Alias                             | `user_alias_edit` / `user_management`  | `user_alias_edit` / `user_management` |
| Reports                                | `list_of_asset` / `privilage_asset`    | —                              |

> Menu sidebar & tombol aksi hanya muncul bila permission terpenuhi. Untuk
> Permission Group & User, endpoint CRUD belum tersedia sehingga halaman
> bersifat **baca-saja** dengan penanda "API write belum tersedia".

## 6. Menjalankan

### Development

```bash
npm run dev
# http://localhost:3000
```

### Type-check & Lint

```bash
npm run typecheck
npm run lint
```

### Production build

```bash
npm run build
npm run start
```

---

## Struktur Folder

```
src/
  app/
    login/                     # halaman login (tanpa app shell)
    (app)/                     # grup route terproteksi (pakai AppShell)
      dashboard/
      work-orders/            +  [module]/[...woNumber]/   (detail, wo_number berisi "/")
      daily-control/
      assets/                 +  [...assetCode]/
      material-usage/         +  [id]/
      approval-center/
      preventive-schedules/   +  [id]/
      master-data/            (company-structure, asset-categories, asset-locations,
                               permission-groups, users, user-aliases)
      reports/                (assets, assets-history, qr, stock-opname,
                               list-of-assets, recap-work-orders)
  components/
    layout/                    # app-sidebar, app-header, page-container, app-shell, nav
    ui/                        # data-table, filter-bar, status-badge, confirm-dialog,
                               # states (loading/empty/error), pagination, permission-guard,
                               # modal, drawer, tabs, toast, detail, primitives
    work-orders/ assets/ schedules/ reports/ master-data/ material/
  hooks/                       # useMe, use-work-orders, use-assets, dst.
  lib/
    api-client.ts auth.ts permissions.ts query-client.ts env.ts format.ts csv.ts
    api/                       # service per domain
  types/                       # DTO/type per domain
  middleware.ts                # proteksi route berbasis cookie
```

## Kontrak API V2 (ringkas)

Envelope: `{ success, message, data, meta? }` untuk endpoint native V2, dan
`{ status, message, data }` untuk endpoint kompatibilitas — `api-client`
menerima keduanya.

| Domain | Endpoint | Catatan bentuk data |
| --- | --- | --- |
| Auth | `POST /auth/login` (form-urlencoded) → `data.token` | envelope `status` |
| Profil | `GET /v2/me` (kini juga `avatar_url` absolut); `POST /v2/profile/password` body `{current_password,new_password,confirm_password}`; `POST /v2/profile/avatar` (multipart `avatar`), `DELETE /v2/profile/avatar` | `division`/`company` objek `{id,code,name}`; `permissions` map int (termasuk `user_management`, `user_alias_edit`, `material_usage`). Controller `V2_profile` (envelope `success`); password md5 di `tb_user`, cek current via `M_User::cekAccount` (skip bila password kosong = akun baru), clear `force_password_change`; avatar → `FCPATH/assets/img/profile/`. FullName & username tidak bisa diubah. Halaman `/profile` (link di dropdown user) |
| Work Order | `GET /v2/work-orders`, `GET /v2/work-orders/detail?wo_number=&module=`, `GET /v2/work-orders/options`, `POST /v2/work-orders/{approve\|reject\|close\|void}` body `{module,wo_number,comment?}` | detail: field flat + `header` + `executors/labor(s)/materials/approvals/evidence(s)/history(ies)/schedule_items`; aksi memakai guard pending & blok akun management |
| WO — buat baru | `POST /v2/work-orders/create` body `{module, asset_code, job_title, type_wo?, priority?, shift?, date?, company?, id_division?, running_hours?, job_requirement?, category_maintenance?}` → `{wo_number, module, asset_code}` | controller `V2_bridge::wo_create` (envelope `success`), tanpa backend baru: reuse `M_Wo_{Mtc\|Operational\|Preventive\|It\|Ga}::create()` apa adanya (status awal, PIC, `job_executor`, forward approval ditangani model — identik alur mobile). Gate izin = `canReadModule` (`wo_<modul>` / `*_all` / `wo_cross_access`). `id_equipment`←`asset.AssetID` dari `asset_code`; `company` default `asset.CompanyName`; `id_division` default divisi user; nomor WO via `getNew(division_code)` pembuat. `category_maintenance` (MKL\|ELC\|SPL\|OTO) hanya untuk module `maintenance`. FE: tombol **Buat WO** + `WoCreateModal` di `/work-orders` |
| WO — aksi eksekutor | Lewat facade kompatibilitas `POST /v2/{meso\|maintenance\|production\|is\|ga}/{action}` (controller mobile per-modul, envelope `status`), tanpa backend baru. Segmen aksi: MESO = `job_explanation`/`labor`/`material`/`complete`; modul lain = `add_job_explanation`/`add_labor`/`add_material`/`complete`. `add_job_explanation` (multipart `wo_number`+`job_explanation`+`status`+`service_photos[]` ≥1, ≤10), `add_labor` `{wo_number,trade[],men,hours}`, `add_material` `{wo_number,material,qty,unit,pr?}` (→ sync ke Material Usage), `complete` `{wo_number,comment?}` → NEED_CLOSED | kapabilitas per-modul kini **semua modul** = job/labor/material/complete (maintenance tanpa complete, pakai Forward/Part Preventive). Backend cek user = eksekutor WO. FE: `WoExecutionPanel` di halaman detail WO |
| WO — edit / planner / sub-WO | `POST /v2/work-orders/update` `{module, wo_number, company?, shift?, type_wo?, priority?, id_division?, id_equipment?(=AssetID/asset_code), job_title?, running_hours?, job_requirement?, category_maintenance?}` → `M_Wo_*::updateR()` (WO kembali ke antrean approval); `POST /v2/work-orders/planner` `{module, wo_number, job_executor:[codes], started_planner, finished_planner, estimate_planner?, comment?}` → `insert_job_executor()` + `update_planner()`; `POST /v2/work-orders/sub` `{module, wo_number, sub_to:GA\|IT\|MTC}` → `M_Wo_*::add_sub_wo()` (tak tersedia utk `production`) | controller `V2_bridge` (envelope `success`), reuse model legacy. Gate = `canReadModule`. FE: tombol **Edit WO** / **Planner** / **Buat Sub-WO** di `WoExecutionPanel` (muncul bila punya izin WO & status belum final) |
| Equipment — BOM & stok part | `GET /v2/equipment/parts?asset_code=` (list `tb_parts_bom`), `GET /v2/equipment/part?id=`, `POST /v2/equipment/parts/sub` `{asset_code, part, uom?, company?, qty_on_hand?, level?, id_nested?}`, `POST /v2/equipment/parts/{toggle\|disable\|enable}` `{id}`, `POST /v2/equipment/parts/use` `{part_id, qty_used, used_for, work_order_no?, project_name?, reference_no?, used_date?, notes?}`, `POST /v2/equipment/parts/restock` `{part_id, qty_added, notes, reference_no?}`, `GET /v2/equipment/parts/history?part_id=`, `DELETE /v2/equipment/parts/history?id=` (kembalikan stok), `GET/POST/DELETE /v2/equipment/bom-photos` (`?asset_code=&part_id=` / multipart `photo` / `?id=`), `POST /v2/equipment/gallery/reorder` `{asset_code, ids[]}`, `POST /v2/equipment/annotated-image` `{image, row_id, column_type, original_filename}` | controller `V2_equipment` (envelope `success`). Reads: `list_of_asset`\|`privilage_asset`; writes: `privilage_asset`. Logika `use`/`restock` di-port persis dari `Equipment::use_part`/`restock_part` (tulis `tb_parts_usage_history`, auto-disable saat stok 0, auto-enable saat restock). FE: `BomPartsPanel` di tab **Parts / BOM** halaman aset |
| Equipment — alert area maintenance | `GET /v2/equipment/missing-area-alerts?limit=` → `{items, summary:{total_wo,total_asset}}`; `POST /v2/equipment/missing-area-alerts/review` `{wo_number, decision, note?}` | `V2_equipment`, reuse `getMissingAreaWoAlerts`/`saveMissingAreaWoReview`; perm `privilage_asset`. FE: belum ada halaman khusus |
| Equipment — anotasi foto custom detail | `GET /v2/equipment/custom-detail-image?path=assets/docs/customDetails/xxx.png` → `{filename, mime, data_uri}` (base64, bebas taint CORS; lokal → fallback MinIO); `POST /v2/equipment/annotated-image` `{image(dataURI), row_id, column_type, original_filename}` → **menimpa** file asli + sync `asset_custom_detail_images.file_size/mime_type` | `V2_equipment` (envelope `success`), logika ported dari `Equipment::save_annotated_image`. FE: `ImageAnnotator` (editor `<canvas>` murni tanpa lib — pen/lingkaran/kotak/garis/panah/teks + warna + tebal + Undo) dibuka lewat tombol pensil di tiap foto pada tab **Custom Detail** |
| WO Preventive (modul maintenance) | `GET /v2/maintenance/part_execution?wo_number=` → checklist part (dari `asset_custom_details` aset); `POST /v2/maintenance/part_execution` `{wo_number, rows:[{custom_detail_id,part_mesin,bagian_mesin,maintenance_status:PENDING\|DONE,request_qty,request_part,request_uom,keterangan}]}` (qty>0 → auto request part ke Material Usage; butuh permission `wo_executor`); `POST /v2/maintenance/forward` `{wo_number,to_division:"MESO",comment?}` → buat WO MESO baru (`FROM_MAINTENANCE`) + set WO ini `FORWARD_TO_MESO` | mobile controller `api/wo_operational` (envelope `status`), tanpa backend baru. FE: tab **Part Preventive** + tombol **Forward ke MESO** muncul saat `module=maintenance` & `type_wo` ~preventive. "Forward External" belum ada di API mobile |
| Notifikasi | `GET /v2/notifications` → `{total_notifications, preventive_wo, in_progress_wo}` (envelope `status`) | dihitung live dari status WO; tanpa mark-read |
| Dashboard | `GET /v2/dashboard?range=7\|14\|30\|90\|180&company=&module=` → `{totals, delta:{total_pct,closed_pct}, by_module[], by_status[], by_company[], top_assets[], trend:[{date,created,closed}], aging:[{bucket,count}]}` | controller `V2_dashboard` (envelope `success`). **1 panggilan** = agregat `GROUP BY` langsung ke 5 tabel `tb_wo_*` (window `>= from AND < to+1`), tanpa per-row PHP. Scoping izin & divisi mengikuti WO list (`canReadModule` + `id_division`), MESO tak hitung mirror preventive, management → view-all. FE: halaman `/dashboard` interaktif (chip range, KPI+delta, tren/donut/bar) — chart SVG/CSS tanpa lib. Menggantikan 5× `listWorkOrders` lama |
| Daily Control | + `GET /v2/daily-control/comments?activity_id=`, `POST /v2/daily-control/comment` body `{activity_id, message}` | |
| Material Usage | + `POST /v2/material-usage/select` body `{id, part_name, qty, uom, pr_number?}` (status harus PENDING, perm `material_usage`) | |
| Asset Mutation | `GET /v2/asset-mutations?search=&status=`, `GET /v2/asset-mutations/meta`, `GET /v2/asset-mutations/assets`, `GET /v2/asset-mutations/detail?doc_no=`, `POST /v2/asset-mutations/detail-item` (form), `POST /v2/asset-mutations/detail-item-delete` (form `{id}`), `POST /v2/asset-mutations/submit` (form), `POST /v2/asset-mutations/approve` (form `{doc_no}`) | map ke controller `api/asset_mutation` (envelope `status`); perm `asset_mutation` / `approval_asset_mutation` |
| Asset | `GET/POST /v2/assets`, `GET/PATCH /v2/assets/detail?asset=`, `GET /v2/assets/options`, `POST /v2/assets/status`, `POST /v2/assets/generate-code` | kolom `PascalCase` (`AssetCode`,`AssetName`,`CompanyName`,…); detail: `{asset, parts_bom, custom_details, attachments, history}`; options item punya `value`/`label`; status & generate-code menerima alias snake_case + `is_active` |
| Preventive | `GET/POST /v2/preventive-schedules`, `GET/PATCH/DELETE /v2/preventive-schedules/detail?id=`, `POST …/pause`, `POST …/repair`, `GET …/calendar?year=` | detail: `{header, details, repair_status}`; create menerima `part`/`frequency` (label) & derive `asset_id` |
| Approval | `GET /v2/approval-center/summary`, `GET /v2/approval-center/{wo-approvals\|wo-closings\|materials\|mutations}`, `POST /v2/approval-center/{wo-approve\|wo-reject\|wo-close\|wo-void}` body `{module,wo_number,comment?}`, `POST …/{mutation-approve\|mutation-reject}` body `{doc_no,comment?}` | summary: `{wo_approvals,wo_closings,materials,mutations,total,can_decide}`; list: `data` array + `meta`; user management-role → 403 pada aksi |
| Daily Control | `GET /v2/daily-control/summary?date=` → `{pro,cor,prev,total_activities,unread_count}`; `GET /v2/daily-control/activities?date=&area=`; `GET /v2/daily-control/unread` → `{count,activities}`; `POST /v2/daily-control/read` body `{activity_id}` atau `{all:true}` | |
| Material Usage | `GET /v2/material-usage/list?page&per_page&status&wo_number&q` → `{data,meta}`; `GET /v2/material-usage/detail?id=` → `{request,wo,parts[],purchase[],hold[],request_code,wo_number,job_executor}`; `POST …/erp-parts` proxy; `POST …/select-parts` body `{id,items[]}`; `POST …/set-usage` body `{wo_number,job_executor,request_code,rows[]}`; `POST …/hold` body `{id,hold_qty,remarks}` (id = baris `tb_material_request`); `POST …/confirm` body `{wo_number,job_executor,request_code,purchase_rows:[{part_prc,material_usage_prc,material_receive_prc,uom_prc}]}` (IN_PROGRESS → CLOSED); `POST …/trigger_erp`; `DELETE …/cancel?id=` | bridge ke `M_Material_Usage` (`material_hold`/`closed`); perm `material_usage` |
| Asset Media | `GET/POST /v2/assets/attachments` (POST multipart `file`,`asset`,`category_id`), `POST /v2/assets/attachments/reorder` body `{asset,order:[id,…]}` (kolom `sort_order`, dibuat on-demand), `DELETE /v2/assets/attachments/{id}`; `GET/POST /v2/assets/custom-details` (body `asset_code` + `bagian`/`bagian_mesin`/`part_mesin`/`kondisi`/`durasi_pengecekan`/`part_diperlukan`), `PATCH/DELETE /v2/assets/custom-details/{id}`, `POST /v2/assets/custom-details/{id}/images` (multipart `image` + `image_type` = `tampak_jauh`\|`tampak_dekat`\|`detail_part`), `DELETE /v2/assets/custom-detail-images/{id}`; `GET/POST /v2/attachment-categories`, `POST /v2/attachment-categories/reorder` body `{order:[id,…]}` (kolom `number`), `PATCH/DELETE /v2/attachment-categories/{id}` | controller `V2_asset_media` (envelope `success`); reuse tabel & folder legacy (`tb_attachment_asset` → `assets/docs/masterAsset`, `asset_custom_detail*` → `assets/docs/customDetails`, `tb_attachment_asset_category`); baca perm `list_of_asset`\|`privilage_asset`, tulis `privilage_asset`; hapus kategori dipakai → 409; mutasi mengembalikan list ter-refresh |
| Master | `GET /v2/master/{resource}`, `…/detail/{id}` (GET/PATCH/DELETE), `POST /v2/master/{resource}` | CRUD penuh untuk company-structure, asset-categories, asset-locations, **permission-groups**, **users**; PK: `id_company` / `id_category_asset` / `id_location_asset` / `id_permission_group` / `id_user`; user-aliases PATCH hanya field `alias`; hapus akun sendiri ditolak |
| Master (opsi form) | `GET /v2/master/options` → `{companies,divisions,positions,sections,permission_groups}`; `GET /v2/master/permission-catalog` → `[{field,label,on_user}]`; `GET /v2/master/employees?q=&company=` → `[{employee_code,name,email,company,...}]` (autocomplete pegawai, EmployeeCode → username) | butuh permission `user_management`; Employee API perlu env `EMP_API_TOKEN` di server |
| Reports | `GET /v2/reports/{assets\|list-of-assets\|recap-work-orders\|assets-history?asset_code=\|qr?asset=\|stock-opname}` | `qr` → `{asset, asset_code, asset_name, qr_payload, qr_url, print_url}`; `stock-opname` terima `date_from`/`date_to`. **recap-work-orders** filter: `module,date_from,date_to,status,type_wo,company,priority,shift,id_division,job_executor,asset_id,q` (`id_division` hanya berlaku untuk user view-all). FE: tiap report punya **CSV** + **Cetak / PDF** (`lib/print-report.ts` A4 tanpa dependency; kolom terkurasi `lib/report-columns.ts`); ringkasan + isi export dihitung dari **seluruh** hasil filter (bukan page aktif). Recap WO: filter Divisi/Company/Tipe/Prioritas/Status jadi dropdown + Executor/PIC, summary Waiting/In-Progress/Closed/Void/Emergency dengan %.
| Settings | `GET /v2/settings/branding` (publik), `POST /v2/settings/branding` (multipart); `GET/POST /v2/settings/storage`, `POST /v2/settings/storage/test`; `GET /v2/settings/storage/sync`, `POST /v2/settings/storage/sync` body `{action:status\|start\|step\|stop\|check, root?, force?}` (`check` = bandingkan lokal vs bucket tanpa upload → `{local,ok,missing,mismatch,missing_bytes,sample}`) | controller `V2_setting` (envelope `success`), key/value `tb_app_setting`. Storage = konfigurasi MinIO/S3 eksternal `{enabled,endpoint,region,bucket,access_key,path_style,secret_key_set,updated_at}` — `secret_key` write-only (POST kosongkan = pertahankan); `…/test` uji koneksi (ListObjectsV2) tanpa menyimpan. `…/sync` = copy bertahap file lokal `assets/docs`\|`assets/img` → MinIO (tidak menghapus lokal); FE panggil `start` lalu `step` berulang (~1 batch/req, ≤80 file / 18 dtk), state di `tb_app_setting.storage_sync_state`, resumable, skip by size. Konfigurasi `serve`/`gateway`/`public`/`public_endpoint`/`verify`/`enabled`: bila `serve` aktif, endpoint media di V2 (`assets/attachments`, `assets/custom-details`, `me.avatar_url`) mengembalikan URL MinIO via `application/libraries/Media_url.php`. Mode URL: `gateway` (proxy lewat `GET /api/v2/media?k=&e=&s=` — controller `V2_media` stream objek dari MinIO LAN ke browser, MinIO tak perlu publik, fallback ke file lokal; **disarankan bila domain app sudah publik**) → `public` (URL langsung, bucket public-read) → presigned 1 jam (default). `public_endpoint` = host MinIO publik untuk mode non-proxy (server tetap pakai `endpoint` LAN untuk put/head/sync). `verify` = HEAD-check objek dulu, fallback lokal. Bila `enabled` aktif, upload/hapus lampiran aset / foto custom detail / foto profil di V2 **juga ditulis/dihapus di MinIO** (dual-write; file lokal tetap cadangan; kegagalan MinIO tidak menggagalkan request). Semua via `application/libraries/S3_Client.php` (SigV4, curl, tanpa Composer). Butuh `user_management` |

## Catatan Penting

- **Tidak ada mock data** untuk endpoint yang sudah tersedia — semua lewat API V2.
- **Tidak** membuat WO dari UI; halaman Preventive Schedule hanya mengelola jadwal.
- **Tidak** ada hard delete aset dari UI (hanya aktif/nonaktif).
- Angka ringkasan pada Report dihitung dari baris hasil filter aktif agar
  konsisten dengan tabel dan hasil export CSV.
- ID internal tidak ditampilkan bila tersedia kode/nama yang lebih mudah dibaca.
- Modal konfirmasi dipakai untuk delete, approve, reject, close, pause, resume,
  repair, dan perubahan status.
