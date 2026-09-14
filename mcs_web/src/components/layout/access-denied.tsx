"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";

export function AccessDenied({
  message = "Anda tidak memiliki izin untuk mengakses halaman atau fitur ini. Hubungi administrator bila menurut Anda ini keliru.",
}: {
  message?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 rounded-full bg-rose-50 p-4 text-rose-500">
        <ShieldX className="h-8 w-8" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Akses Ditolak</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
