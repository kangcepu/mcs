"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Tombol "kembali" yang memakai riwayat browser (`router.back()`) alih-alih
 * `<Link>` ke URL daftar polos, supaya filter/pencarian/halaman yang sedang
 * aktif di halaman daftar tidak hilang saat pengguna kembali dari detail.
 * `fallbackHref` dipakai hanya bila tidak ada riwayat untuk kembali (mis.
 * detail dibuka langsung lewat URL/bookmark).
 */
export function BackLink({
  fallbackHref,
  children,
}: {
  fallbackHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </button>
  );
}
