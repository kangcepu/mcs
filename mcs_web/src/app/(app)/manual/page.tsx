"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Fuel,
  Gauge,
  QrCode,
  PackagePlus,
  ShieldCheck,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";

type GuideStep = {
  title: string;
  description: ReactNode;
};

function Workflow({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="grid gap-3 lg:grid-cols-2">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {index + 1}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
            <div className="mt-1 text-sm leading-6 text-slate-600">{step.description}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function GuideSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function StatusFlow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, index) => (
        <span key={item} className="inline-flex items-center gap-2">
          <StatusBadge status={item} />
          {index < items.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-slate-300" /> : null}
        </span>
      ))}
    </div>
  );
}

function Note({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
      {children}
    </div>
  );
}

function EnergyManual() {
  return (
    <div className="space-y-4">
      <Note>
        <strong>Satu asset, satu identitas.</strong> Modul Energy merupakan profil tambahan dari Asset existing. QR dan Asset Code tetap memakai milik Asset; ketika QR dibuka, profil serta transaksi Energy dapat dilihat dari halaman detail Asset.
      </Note>

      <GuideSection icon={Zap} title="1. Mengaktifkan Asset sebagai Energy & Utility" description="Buat Asset utama terlebih dahulu, kemudian tambahkan profil Energy tanpa membuat identitas baru.">
        <Workflow steps={[
          { title: "Siapkan Asset existing", description: <>Pastikan Asset Code, lokasi, company, kategori, status, dan QR Asset sudah benar pada menu <strong>Asset Manage</strong>.</> },
          { title: "Tambah profil Energy", description: <>Buka <strong>Energy & Utility → Asset Profile → Tambah Profil</strong>, lalu cari Asset atau scan QR.</> },
          { title: "Pilih jenis Energy asset", description: <>Pilih Meter Listrik, Water Meter, Genset, Fuel Tank, Compressor, Boiler, atau Lainnya. Field teknis akan mengikuti jenis yang dipilih.</> },
          { title: "Lengkapi spesifikasi", description: <>Isi nomor meter/serial, satuan, multiplier, kapasitas, batas minimum–maksimum, interval inspeksi, custodian, dan tanggal commissioning yang relevan.</> },
        ]} />
      </GuideSection>

      <GuideSection icon={Gauge} title="2. Meter Reading dan Meter Master" description="Digunakan untuk meter listrik dan air, termasuk konsumsi, foto, koreksi, kalibrasi, dan reminder.">
        <div className="space-y-4">
          <Workflow steps={[
            { title: "Atur master meter", description: <>Pada tab <strong>Meter Master</strong>, atur parent/sub-meter, jadwal reading, due date berikutnya, dan kebutuhan kalibrasi.</> },
            { title: "Input reading", description: <>Buka detail Asset dari tombol <strong>Buka</strong> atau QR, lalu isi tanggal, nilai meter, catatan, dan foto evidence.</> },
            { title: "Periksa konsumsi", description: <>Sistem menghitung selisih dari reading sebelumnya dengan memperhitungkan multiplier dan rollover meter.</> },
            { title: "Submit dan validasi", description: <>Simpan Draft, Submit untuk pemeriksaan, kemudian Validate/Lock. Data yang sudah terkunci hanya diperbaiki melalui proses koreksi.</> },
          ]} />
          <StatusFlow items={["DRAFT", "SUBMITTED", "VALIDATED", "LOCKED"]} />
          <Note warning><strong>Perhatian:</strong> jangan mengubah digit, multiplier, atau nilai rollover setelah transaksi berjalan tanpa mengecek dampaknya terhadap konsumsi historis.</Note>
        </div>
      </GuideSection>

      <GuideSection icon={Activity} title="3. Operasi Genset, Compressor, dan Boiler" description="Catat jam operasi, meter, output, dan parameter aktual untuk mendeteksi kondisi abnormal.">
        <Workflow steps={[
          { title: "Genset operation", description: <>Isi waktu mulai–selesai, hour meter awal–akhir, beban, produksi kWh, dan konsumsi bahan bakar.</> },
          { title: "Hubungkan Fuel Tank", description: <>Jika solar berasal dari tank internal, pilih Fuel Tank. Pemakaian baru mengurangi saldo setelah transaksi melewati approval sesuai alur.</> },
          { title: "Utility inspection", description: <>Untuk Compressor/Boiler, isi tekanan, temperatur, flow, output, hour meter, operator, dan catatan pemeriksaan.</> },
          { title: "Tindak kondisi abnormal", description: <>Nilai di luar batas normal ditandai abnormal dan dapat dikaitkan ke WO corrective. Interval hour meter dapat memicu kebutuhan preventive.</> },
        ]} />
      </GuideSection>

      <GuideSection icon={Fuel} title="4. Fuel Tank Movement dan Stock Opname" description="Kelola penerimaan, pemakaian, transfer, adjustment, saldo, dan rekonsiliasi fisik.">
        <div className="space-y-4">
          <Workflow steps={[
            { title: "Catat movement", description: <>Pilih penerimaan, pemakaian, transfer, atau adjustment. Isi jumlah liter, tanggal, referensi, tank sumber/tujuan, dan evidence.</> },
            { title: "Ajukan transaksi", description: <>Periksa saldo sebelum Submit. Transaksi Draft belum mengubah saldo referensi Fuel Tank.</> },
            { title: "Approval", description: <>Reviewer menyetujui atau menolak transaksi. Saldo hanya diperbarui oleh transaksi yang disetujui.</> },
            { title: "Stock opname", description: <>Bandingkan saldo sistem dengan hasil ukur fisik, unggah bukti, lalu rekonsiliasi selisih melalui approval.</> },
          ]} />
          <StatusFlow items={["DRAFT", "SUBMITTED", "APPROVED"]} />
        </div>
      </GuideSection>

      <GuideSection icon={ShieldCheck} title="5. Monitoring, KPI, Allocation, dan Governance" description="Gunakan data transaksi yang sudah valid sebagai bahan analisis, pembebanan, dan tindak lanjut audit.">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Monitoring & Laporan", "Pantau grafik konsumsi, tren, rollover, anomali, minimum stock, dan export laporan."],
            ["Baseline & KPI", "Tentukan baseline, target, arah penilaian, periode, bobot, owner, lalu aktifkan KPI."],
            ["Utility Allocation", "Pilih sumber utility dan periode, tentukan sub-meter atau driver estimasi, cost center, tarif referensi, lalu review hasil alokasi."],
            ["Energy Governance", "Tangani NCR otomatis/manual, approval queue, root cause, corrective/preventive action, evidence SOP/ISO, verifikasi, dan penutupan."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </GuideSection>
    </div>
  );
}

function FleetManual() {
  return (
    <div className="space-y-4">
      <Note>
        <strong>Fleet tetap menggunakan Asset dan QR existing.</strong> Kendaraan atau forklift harus sudah terdaftar di Asset Manage. Profil Fleet hanya menambahkan data kendaraan, meter, inspeksi, fuel, service, dan kontrol efisiensi.
      </Note>

      <GuideSection icon={Truck} title="1. Membuat Master Fleet" description="Aktifkan Asset existing sebagai kendaraan atau forklift dan tentukan aturan operasionalnya.">
        <Workflow steps={[
          { title: "Pilih Asset existing", description: <>Buka <strong>Fleet & Vehicle → Tambah Fleet Asset</strong>, lalu cari Asset yang sesuai. Satu Asset hanya boleh memiliki satu profil Fleet.</> },
          { title: "Tentukan jenis dan meter", description: <>Kendaraan umumnya memakai Odometer (km), sedangkan forklift memakai Hour Meter (jam). Sesuaikan bila kondisi unit berbeda.</> },
          { title: "Isi identitas dan PIC", description: <>Lengkapi nomor registrasi/polisi, merek, model, custodian, department, cost center, dan meter awal.</> },
          { title: "Atur preventive dan efisiensi", description: <>Isi interval hari, interval km/jam, target efisiensi, serta batas minimum agar due dan anomaly dapat dihitung.</> },
        ]} />
      </GuideSection>

      <GuideSection icon={ClipboardCheck} title="2. Update Meter dan Daily Inspection" description="Meter harus aktual agar due preventive dan efisiensi fuel dihitung dengan benar.">
        <div className="space-y-4">
          <Workflow steps={[
            { title: "Update meter", description: <>Pada tab Master Fleet pilih <strong>Update Meter</strong>, isi waktu reading dan nilai odometer/hour meter terbaru. Nilai tidak boleh mundur.</> },
            { title: "Buat inspeksi", description: <>Pilih <strong>Inspeksi</strong> atau tab Daily Inspection, lalu isi unit, waktu, operator, shift, dan nilai meter.</> },
            { title: "Isi checklist", description: <>Tandai setiap item Baik/Tidak Baik. Aktifkan <strong>Tidak aman untuk dioperasikan</strong> bila unit harus dihentikan.</> },
            { title: "Submit dan review", description: <>Simpan Draft, Submit, lalu reviewer Setujui atau Tolak. Temuan gagal menjadi dasar tindak lanjut corrective.</> },
          ]} />
          <StatusFlow items={["DRAFT", "SUBMITTED", "APPROVED"]} />
        </div>
      </GuideSection>

      <GuideSection icon={Fuel} title="3. Pengisian Solar dan Kontrol Efisiensi" description="Catat fuel kendaraan/forklift, kurangi saldo tank internal, dan pantau konsumsi abnormal.">
        <Workflow steps={[
          { title: "Pilih unit dan sumber fuel", description: <>Pilih kendaraan/forklift. Pilih Fuel Tank internal bila pengisian harus memotong stok; biarkan eksternal jika tidak menggunakan tank MCS.</> },
          { title: "Isi transaksi", description: <>Isi waktu, jumlah liter, operator, meter sebelum–sesudah, dan status full tank bila pengukuran memakai metode full-to-full.</> },
          { title: "Submit dan approval", description: <>Draft belum memotong saldo. Setelah disetujui, movement Fuel Tank dibuat dan saldo diperbarui.</> },
          { title: "Periksa anomaly", description: <>Sistem membandingkan efisiensi aktual dengan target/minimum. Selisih meter, konsumsi berlebih, atau pola tidak wajar masuk tab Anomaly.</> },
        ]} />
      </GuideSection>

      <GuideSection icon={Wrench} title="4. Preventive, Service, dan Corrective History" description="Simpan History pekerjaan kendaraan serta kaitkan ke Work Order bila tersedia.">
        <Workflow steps={[
          { title: "Pantau preventive due", description: <>Ringkasan Fleet menampilkan due berdasarkan interval hari dan/atau km/jam yang diatur pada profil.</> },
          { title: "Catat service", description: <>Pada tab Preventive & Service isi jenis pekerjaan, waktu mulai–selesai, meter, workshop, keluhan, dan pekerjaan yang dilakukan.</> },
          { title: "Tautkan WO", description: <>Isi modul serta nomor WO existing jika pekerjaan berasal dari WO Maintenance, MESO, atau GA.</> },
          { title: "Selesaikan History", description: <>Ubah status menjadi Completed setelah pekerjaan selesai dan pastikan meter serta ringkasan pekerjaan sudah benar.</> },
        ]} />
      </GuideSection>

      <GuideSection icon={AlertTriangle} title="5. Penanganan Anomaly" description="Anomaly harus memiliki tindakan dan hasil penyelesaian yang dapat ditelusuri.">
        <Workflow steps={[
          { title: "Buka tab Anomaly", description: <>Prioritaskan severity Critical/High, lalu periksa unit, waktu deteksi, tipe anomaly, nilai aktual, dan nilai yang diharapkan.</> },
          { title: "Lakukan pemeriksaan", description: <>Verifikasi meter, bukti pengisian, kebocoran, perilaku operasi, serta kondisi mekanis sebelum menentukan tindakan.</> },
          { title: "Buat tindak lanjut", description: <>Jika memerlukan pekerjaan teknis, buat atau kaitkan WO corrective dan dokumentasikan evidence.</> },
          { title: "Selesaikan", description: <>Klik <strong>Selesaikan</strong>, tulis tindakan serta hasil pemeriksaan secara lengkap, lalu simpan untuk menutup anomaly.</> },
        ]} />
      </GuideSection>
    </div>
  );
}

function SparepartManual(){return <div className="space-y-4"><Note><strong>ERP tetap menjadi sumber master dan saldo referensi.</strong> MCS dipakai untuk receiving fisik, bin, request/issue/return, transfer, stock opname, NCR, dan rekonsiliasi tanpa posting GL/HPP.</Note><GuideSection icon={PackagePlus} title="1. Master dan Katalog ERP" description="Cari item ERP, lihat saldo referensi, lalu sinkronkan item terpilih ke Master Sparepart."><Workflow steps={[{title:"Buka Katalog & Saldo ERP",description:<>Pilih company UC/GSU/RU dan cari kode atau nama item.</>},{title:"Sync item terpilih",description:<>Pilih item yang benar lalu Sync. Sistem mencegah mapping ganda dan memperbarui nama/UOM.</>},{title:"Lengkapi atribut teknis",description:<>Atur compatibility asset, criticality, serial, lot, expiry, min/max dan reorder point.</>},{title:"Jangan samakan saldo",description:<>Saldo ERP adalah referensi; saldo MCS berasal dari transaksi operasional MCS.</>}]}/></GuideSection><GuideSection icon={ClipboardCheck} title="2. Receiving sampai Issue WO" description="Alur stok operasional harus memiliki referensi, QC, lokasi, dan approval."><Workflow steps={[{title:"Receiving & QC",description:<>Isi referensi PO, warehouse/bin, accepted/hold/rejected, lot/serial dan expiry lalu kunci dokumen.</>},{title:"Request dan reserve",description:<>Part WO diminta, dialokasikan dari saldo tersedia, kemudian dipick.</>},{title:"Issue dan return",description:<>Issue mengurangi stok; sisa dikembalikan ke available atau hold setelah pemeriksaan.</>},{title:"Transfer",description:<>Transfer antar-bin/warehouse harus disetujui checker yang berbeda dari maker.</>}]}/></GuideSection><GuideSection icon={ShieldCheck} title="3. Stock Opname dan Governance" description="Blind count, adjustment, NCR, dan rekonsiliasi dijaga maker-checker."><Workflow steps={[{title:"Blind count",description:<>Counter tidak melihat saldo sistem sampai hasil count diajukan.</>},{title:"Review variance",description:<>Checker memeriksa selisih dan evidence sebelum adjustment masuk ledger MCS.</>},{title:"Tangani NCR",description:<>Variance dan barang rejected membuat NCR otomatis; salah issue dapat dibuat manual.</>},{title:"Rekonsiliasi ERP",description:<>Bandingkan snapshot ERP dengan ledger MCS. Hasil hanya referensi dan tidak memposting ERP.</>}]}/></GuideSection></div>}

export default function ManualPage() {
  const [module, setModule] = useState("energy");
  const energy = module === "energy";
  const fleet = module === "fleet";

  return (
    <PageContainer
      title="Manual Pengguna"
      description="Panduan operasional modul Energy & Utility dan Fleet Vehicle."
      actions={(
        <Link href={energy ? "/energy" : fleet ? "/fleet" : "/spareparts"} className="btn-primary">
          {energy ? <Zap className="h-4 w-4" /> : fleet ? <Truck className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
          Buka Modul
        </Link>
      )}
    >
      <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Pilih modul yang ingin dipelajari</h2>
            <p className="mt-1 text-sm text-slate-500">Ikuti urutan langkah dari master data sampai approval dan monitoring.</p>
          </div>
        </div>
        <Tabs
          variant="pill"
          value={module}
          onChange={setModule}
          items={[
            { key: "energy", label: "Energy & Utility" },
            { key: "fleet", label: "Fleet Vehicle" },
            { key: "sparepart", label: "Sparepart" },
          ]}
        />
      </Card>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <QrCode className="h-4 w-4" />
        QR pada kedua modul tetap menggunakan QR Asset yang sama; tidak perlu mencetak identitas tambahan.
      </div>

      {energy ? <EnergyManual /> : fleet ? <FleetManual /> : <SparepartManual />}
    </PageContainer>
  );
}
