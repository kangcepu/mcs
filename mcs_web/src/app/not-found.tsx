import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
      <div>
        <p className="text-6xl font-bold text-slate-200">404</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-800">Halaman tidak ditemukan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
