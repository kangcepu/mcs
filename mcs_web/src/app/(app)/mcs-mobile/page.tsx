"use client";

import { useRef, useState } from "react";
import { Download, FileArchive, ShieldAlert, Smartphone, Upload } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import { useMcsMobileRelease, useUploadMcsMobileRelease } from "@/hooks/use-mcs-mobile";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime, formatBytes } from "@/lib/format";
import { toAbsoluteUploadUrl } from "@/lib/env";
import { ApiError } from "@/types/api";

const MAX_RELEASE_BYTES = 300 * 1024 * 1024;

export default function McsMobilePage() {
  const toast = useToast();
  const canUpload = useCan(PERMISSIONS.mcsMobileUpload);
  const { data, isLoading, error, refetch } = useMcsMobileRelease();
  const upload = useUploadMcsMobileRelease();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const release = data?.data;

  const selectFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const ext = next.name.split(".").pop()?.toLowerCase();
    if (ext !== "apk" && ext !== "aab") {
      toast.warning("Format tidak didukung", "Pilih file APK atau AAB.");
      return;
    }
    if (next.size > MAX_RELEASE_BYTES) {
      toast.warning("File terlalu besar", "Ukuran maksimal release adalah 300 MB.");
      return;
    }
    setFile(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !version.trim() || !/^\d+$/.test(versionCode) || Number(versionCode) < 1) {
      toast.warning("Data belum lengkap", "Version, Version Code, dan file APK/AAB wajib diisi.");
      return;
    }
    const form = new FormData();
    form.append("version", version.trim());
    form.append("version_code", versionCode);
    form.append("release_notes", releaseNotes.trim());
    form.append("force_update", forceUpdate ? "1" : "0");
    form.append("apk_file", file);
    try {
      const result = await upload.mutateAsync(form);
      toast.success("Release dipublikasikan", `MCS Mobile v${result.data?.version ?? version.trim()} sekarang aktif.`);
      setVersion("");
      setVersionCode("");
      setReleaseNotes("");
      setForceUpdate(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      toast.error("Gagal mengunggah release", error instanceof ApiError ? error.message : "Terjadi kesalahan saat menyimpan release.");
    }
  };

  return (
    <PageContainer
      title="MCS Mobile"
      description="Release aktif untuk aplikasi MCS Mobile. Aplikasi akan membaca version code ini saat memeriksa pembaruan."
    >
      {isLoading ? <LoadingSkeleton rows={6} /> : null}
      {error ? (
        <div className="card flex items-center justify-between gap-4 p-5 text-sm text-rose-700">
          <span>Release MCS Mobile tidak dapat dimuat.</span>
          <Button variant="secondary" onClick={() => refetch()}>Coba lagi</Button>
        </div>
      ) : null}
      {release ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <section className="card overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><Smartphone className="h-6 w-6" /></span>
                <div>
                  <p className="text-base font-semibold text-slate-900">Release aktif</p>
                  <p className="text-sm text-slate-500">Versi yang tersedia untuk pengguna mobile.</p>
                </div>
              </div>
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">v{release.version}</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Info label="Version Code" value={String(release.version_code)} />
              <Info label="Pembaruan" value={release.force_update ? "Wajib diperbarui" : "Opsional"} strong={release.force_update} />
              <Info label="Diunggah oleh" value={release.uploaded_by || "-"} />
              <Info label="Diunggah pada" value={formatDateTime(release.uploaded_at)} />
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Release Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{release.release_notes || "-"}</p>
              </div>
            </div>
            <div className="border-t border-slate-100 p-4">
              <a href={toAbsoluteUploadUrl(release.download_url)} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
                <Download className="h-4 w-4" /> Download {release.file_name?.toUpperCase().endsWith(".AAB") ? "AAB" : "APK"}
              </a>
            </div>
          </section>

          {canUpload ? (
            <section className="card p-5">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Upload className="h-5 w-5" /></span>
                <div><h2 className="font-semibold text-slate-900">Upload release baru</h2><p className="mt-0.5 text-sm text-slate-500">Release baru langsung menjadi versi aktif.</p></div>
              </div>
              <form className="space-y-4" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Version" required><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Contoh: 1.2.0" /></Field>
                  <Field label="Version Code" required hint="Nomor build Android, minimal 1."><Input type="number" min="1" value={versionCode} onChange={(e) => setVersionCode(e.target.value)} placeholder="Contoh: 12" /></Field>
                </div>
                <Field label="Release Notes" hint="Jelaskan perubahan penting pada release ini."><Textarea rows={4} value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} placeholder={"- Bug fixes\n- Improve performance"} /></Field>
                <Field label="APK / AAB" required hint="Format APK atau AAB, maksimal 300 MB.">
                  <input ref={fileRef} type="file" accept=".apk,.aab,application/vnd.android.package-archive" className="hidden" onChange={(e) => selectFile(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}><FileArchive className="h-4 w-4" /> Pilih file</Button>
                    <span className="text-sm text-slate-500">{file ? `${file.name} (${formatBytes(file.size)})` : "Belum ada file dipilih"}</span>
                  </div>
                </Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <input type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                  <span><span className="block text-sm font-medium text-slate-800">Wajib update</span><span className="block text-xs text-slate-500">Pengguna harus memperbarui aplikasi sebelum melanjutkan.</span></span>
                </label>
                <Button className="w-full" type="submit" loading={upload.isPending}><Upload className="h-4 w-4" /> Publikasikan release</Button>
              </form>
            </section>
          ) : (
            <section className="card flex flex-col justify-center p-6">
              <ShieldAlert className="h-8 w-8 text-amber-500" />
              <h2 className="mt-3 font-semibold text-slate-900">Download-only access</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Anda dapat mengunduh release aktif. Untuk menerbitkan pembaruan, minta permission MCS Mobile Upload kepada administrator.</p>
            </section>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className={strong ? "mt-1 text-sm font-semibold text-amber-700" : "mt-1 text-sm font-medium text-slate-700"}>{value}</p></div>;
}
