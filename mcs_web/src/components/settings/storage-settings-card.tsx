"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, XCircle } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  useSaveStorageSettings,
  useStorageSettings,
  useTestStorageConnection,
} from "@/hooks/use-settings";
import { StorageSyncPanel } from "@/components/settings/storage-sync-panel";
import { ApiError } from "@/types/api";
import { formatDateTime } from "@/lib/format";

type Banner = { ok: boolean; message: string } | null;

export function StorageSettingsCard() {
  const toast = useToast();
  const { data, isLoading } = useStorageSettings();
  const saved = data?.data;
  const save = useSaveStorageSettings();
  const test = useTestStorageConnection();

  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [bucket, setBucket] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [pathStyle, setPathStyle] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [serve, setServe] = useState(false);
  const [gateway, setGateway] = useState(false);
  const [publicRead, setPublicRead] = useState(false);
  const [verify, setVerify] = useState(true);
  const [publicEndpoint, setPublicEndpoint] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (!saved) return;
    setEndpoint(saved.endpoint ?? "");
    setRegion(saved.region || "us-east-1");
    setBucket(saved.bucket ?? "");
    setAccessKey(saved.access_key ?? "");
    setPathStyle(saved.path_style ?? true);
    setEnabled(saved.enabled ?? false);
    setServe(saved.serve ?? false);
    setGateway(saved.gateway ?? false);
    setPublicRead(saved.public ?? false);
    setVerify(saved.verify ?? true);
    setPublicEndpoint(saved.public_endpoint ?? "");
    setSecretKey("");
  }, [saved]);

  const formPayload = () => ({
    endpoint: endpoint.trim(),
    region: region.trim() || "us-east-1",
    bucket: bucket.trim(),
    access_key: accessKey.trim(),
    ...(secretKey ? { secret_key: secretKey } : {}),
    path_style: pathStyle,
    enabled,
    serve,
    gateway,
    public: publicRead,
    verify,
    public_endpoint: publicEndpoint.trim(),
  });

  const onTest = async () => {
    setBanner(null);
    try {
      const res = await test.mutateAsync(formPayload());
      const r = res.data ?? { ok: false, message: "Tidak ada respons." };
      setBanner(r);
    } catch (e) {
      setBanner({
        ok: false,
        message: e instanceof ApiError ? e.message : "Gagal menguji koneksi.",
      });
    }
  };

  const onSave = async () => {
    try {
      await save.mutateAsync(formPayload());
      toast.success("Konfigurasi storage disimpan");
      setSecretKey("");
      setBanner(null);
    } catch (e) {
      toast.error(
        "Gagal menyimpan",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">
          Lampiran File (Storage)
        </h2>
      </div>

      {banner ? (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            banner.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {banner.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Konfigurasi endpoint MinIO/S3 eksternal untuk penyimpanan lampiran &amp;
        dokumen. Endpoint harus bisa diakses baik oleh server maupun langsung oleh
        browser pengguna (dipakai untuk link upload/download).
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat konfigurasi…
        </div>
      ) : (
        <>
          <Field label="Endpoint" required hint="Contoh: http://192.168.8.4:9000">
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://192.168.8.4:9000"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Region" required>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </Field>
            <Field label="Bucket" required>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
            </Field>
          </div>

          <Field label="Access Key" required>
            <Input
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Secret Key"
            hint={
              saved?.secret_key_set
                ? "Secret key sudah tersimpan. Kosongkan jika tidak ingin mengubah."
                : "Wajib diisi saat pertama kali."
            }
          >
            <Input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={
                saved?.secret_key_set
                  ? "•••••••• (kosongkan jika tidak ingin mengubah)"
                  : ""
              }
              autoComplete="new-password"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={pathStyle}
              onChange={(e) => setPathStyle(e.target.checked)}
            />
            Gunakan path-style URL (wajib untuk kebanyakan setup MinIO)
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Aktifkan penyimpanan MinIO untuk upload lampiran baru
          </label>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Penyajian media (API V2)
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={serve}
                onChange={(e) => setServe(e.target.checked)}
              />
              Sajikan lampiran &amp; foto dari MinIO (lampiran aset, custom detail,
              foto profil)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                disabled={!serve}
                checked={gateway}
                onChange={(e) => setGateway(e.target.checked)}
              />
              Alirkan lewat aplikasi (proxy <code>api/v2/media</code>) — MinIO
              tidak perlu diekspos ke publik. <strong>Disarankan</strong> karena
              domain aplikasi sudah publik.
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                disabled={!serve || gateway}
                checked={publicRead}
                onChange={(e) => setPublicRead(e.target.checked)}
              />
              Bucket bersifat public-read (pakai URL langsung; jika tidak, pakai
              presigned URL yang kedaluwarsa 1 jam)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                disabled={!serve}
                checked={verify}
                onChange={(e) => setVerify(e.target.checked)}
              />
              Verifikasi objek ada di bucket dulu — fallback ke file lokal bila
              belum tersinkron (matikan bila sinkronisasi sudah tuntas, lebih
              cepat)
            </label>

            <div className={`pt-1 ${gateway ? "opacity-50" : ""}`}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Endpoint publik MinIO untuk gambar (opsional)
              </label>
              <Input
                value={publicEndpoint}
                onChange={(e) => setPublicEndpoint(e.target.value)}
                placeholder="https://files.domain.com"
                disabled={!serve || gateway}
              />
              <p className="mt-1 text-xs text-slate-500">
                Hanya dipakai bila <em>tidak</em> memakai proxy: hostname MinIO
                yang bisa diakses dari luar (mis. tunnel Cloudflare ke port S3
                MinIO). Server tetap memakai endpoint LAN di atas untuk
                upload/cek. Kosong = pakai endpoint di atas.
              </p>
            </div>
          </div>

          {saved?.updated_at ? (
            <p className="text-xs text-slate-400">
              Terakhir diperbarui: {formatDateTime(saved.updated_at)}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="secondary"
              onClick={onTest}
              loading={test.isPending}
              disabled={save.isPending}
            >
              Test Koneksi
            </Button>
            <Button onClick={onSave} loading={save.isPending} disabled={test.isPending}>
              Simpan Perubahan
            </Button>
          </div>

          <StorageSyncPanel
            canRun={Boolean(
              saved?.endpoint && saved?.bucket && saved?.secret_key_set,
            )}
          />
        </>
      )}
    </div>
  );
}
