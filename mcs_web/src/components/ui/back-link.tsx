"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Tombol "kembali". Kalau `returnHref` dikasih (URL daftar lengkap dengan
 * query string filter/halaman yang sedang aktif saat baris itu diklik),
 * itu yang dipakai — eksplisit, tidak bergantung urutan riwayat browser.
 * `router.back()` sendiri pernah diandalkan untuk ini tapi tidak selalu
 * konsisten (mis. page sempat ganti query beberapa kali lewat
 * `router.replace` sebelum pindah ke detail — urutan riwayatnya tidak
 * selalu balik ke entry yang benar). `fallbackHref` dipakai kalau
 * `returnHref` tidak ada dan juga tidak ada riwayat untuk kembali (mis.
 * detail dibuka langsung lewat URL/bookmark).
 */
export function BackLink({
  fallbackHref,
  returnHref,
  children,
}: {
  fallbackHref: string;
  /** URL daftar lengkap (termasuk query filter/halaman) untuk kembali eksplisit. */
  returnHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (returnHref) {
          router.push(returnHref);
        } else if (typeof window !== "undefined" && window.history.length > 1) {
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
