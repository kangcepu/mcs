"use client";

import { Download, Smartphone } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useMcsMobileRelease } from "@/hooks/use-mcs-mobile";
import { formatDateTime } from "@/lib/format";
import { toAbsoluteUploadUrl } from "@/lib/env";

export default function McsMobilePage() {
  const { data, isLoading, error, refetch } = useMcsMobileRelease();
  const release = data?.data;

  return (
    <PageContainer
      title="Mobile & Tablet"
      description="Unduh versi terbaru aplikasi MCS Mobile untuk HP/tablet."
    >
      {isLoading ? <LoadingSkeleton rows={6} /> : null}
      {error ? (
        <div className="card flex items-center justify-between gap-4 p-5 text-sm text-rose-700">
          <span>Release MCS Mobile tidak dapat dimuat.</span>
          <Button variant="secondary" onClick={() => refetch()}>Coba lagi</Button>
        </div>
      ) : null}
      {release ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white"><Smartphone className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Release aktif</p>
                <p className="text-xs text-slate-500">Versi terbaru yang tersedia untuk diunduh.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">v{release.version}</span>
              <a href={toAbsoluteUploadUrl(release.download_url)} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
                <Download className="h-4 w-4" /> {release.file_name?.toUpperCase().endsWith(".AAB") ? "AAB" : "APK"}
              </a>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Version Code" value={String(release.version_code)} />
            <Info label="Pembaruan" value={release.force_update ? "Wajib diperbarui" : "Opsional"} strong={release.force_update} />
            <Info label="Diunggah oleh" value={release.uploaded_by || "-"} />
            <Info label="Diunggah pada" value={formatDateTime(release.uploaded_at)} />
          </div>
          <div className="border-t border-slate-100 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Release Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{release.release_notes || "-"}</p>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className={strong ? "mt-1 text-sm font-semibold text-amber-700" : "mt-1 text-sm font-medium text-slate-700"}>{value}</p></div>;
}
