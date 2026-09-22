"use client";

import { useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, Trash2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  useFirebaseCredentials,
  useRemoveFirebaseCredentials,
  useSaveFirebaseCredentials,
} from "@/hooks/use-settings";
import { ApiError } from "@/types/api";
import { formatDateTime } from "@/lib/format";

export function FirebaseCredentialsCard() {
  const toast = useToast();
  const { data, isLoading } = useFirebaseCredentials();
  const saved = data?.data;
  const save = useSaveFirebaseCredentials();
  const remove = useRemoveFirebaseCredentials();
  const fileRef = useRef<HTMLInputElement>(null);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBanner(null);
    try {
      await save.mutateAsync(file);
      setBanner({ ok: true, message: "Kredensial Firebase tersimpan." });
      toast.success("Kredensial Firebase disimpan");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Gagal menyimpan kredensial.";
      setBanner({ ok: false, message });
      toast.error("Gagal menyimpan", message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync();
      setBanner(null);
      toast.success("Kredensial Firebase dihapus");
    } catch (e) {
      toast.error("Gagal menghapus", e instanceof ApiError ? e.message : undefined);
    }
  };

  const busy = save.isPending || remove.isPending;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">
          Push Notification (Firebase)
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
        Unggah file JSON Firebase service account (Project Settings → Service
        Accounts → Generate new private key) agar server bisa mengirim push
        notification ke aplikasi mobile. Kredensial disimpan terenkripsi di
        database, jadi tidak perlu diatur ulang setiap pindah/deploy server.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat status…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm">
            {saved?.configured ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
            )}
            <span className="text-slate-700">
              {saved?.configured
                ? `Terkonfigurasi — ${saved.project_id} (${saved.client_email})`
                : "Belum ada kredensial tersimpan — push notification tidak aktif."}
            </span>
          </div>

          {saved?.updated_at ? (
            <p className="text-xs text-slate-400">
              Terakhir diperbarui: {formatDateTime(saved.updated_at)}
            </p>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              loading={save.isPending}
              disabled={busy}
            >
              <UploadCloud className="h-4 w-4" />
              {saved?.configured ? "Ganti File JSON" : "Unggah File JSON"}
            </Button>
            {saved?.configured ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onRemove}
                loading={remove.isPending}
                disabled={busy}
                className="text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
                Hapus Kredensial
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
