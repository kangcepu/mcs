"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FolderSync, Loader2, Square, XCircle } from "lucide-react";
import { Button, Field, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  checkStorageSync,
  controlStorageSync,
  getStorageSyncState,
  type StorageCheckResult,
  type StorageSyncState,
} from "@/lib/api/settings";
import { ApiError } from "@/types/api";
import { formatBytes, formatNumber } from "@/lib/format";
import { sleep } from "@/lib/utils";

const DEFAULT_ROOT = "assets/docs";

const ROOT_PRESETS = [
  { value: DEFAULT_ROOT, label: "Semua lampiran & dokumen (assets/docs)" },
  { value: "assets/docs/masterAsset", label: "Foto & lampiran aset (masterAsset)" },
  { value: "assets/docs/customDetails", label: "Foto custom detail" },
  { value: "assets/docs/wo_service_evidence", label: "Evidence WO (service)" },
  { value: "assets/docs/wo_part_execution", label: "Evidence WO (part execution)" },
  { value: "assets/docs/daily_control", label: "Media daily control" },
  { value: "assets/img/profile", label: "Foto profil pengguna" },
];

function etaText(s: StorageSyncState): string | null {
  if (s.status !== "running" || !s.started_at) return null;
  const done = s.done_files ?? 0;
  const total = s.total_files ?? 0;
  if (done < 20 || total <= done) return null;
  const elapsed = (Date.now() - new Date(s.started_at).getTime()) / 1000;
  if (elapsed < 5) return null;
  const rate = done / elapsed; // file/s
  const remain = Math.round((total - done) / rate);
  if (!Number.isFinite(remain) || remain <= 0) return null;
  if (remain < 90) return `± ${remain} dtk lagi`;
  if (remain < 5400) return `± ${Math.round(remain / 60)} menit lagi`;
  return `± ${(remain / 3600).toFixed(1)} jam lagi`;
}

export function StorageSyncPanel({ canRun }: { canRun: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<StorageSyncState | null>(null);
  const [root, setRoot] = useState(DEFAULT_ROOT);
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [checkRes, setCheckRes] = useState<
    (StorageCheckResult & { root: string }) | null
  >(null);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    let fails = 0;
    try {
      while (runningRef.current) {
        let r;
        try {
          r = await controlStorageSync("step");
          fails = 0;
        } catch (e) {
          fails += 1;
          if (fails >= 5) throw e;
          await sleep(Math.min(15000, 2000 * fails)); // transient blip — back off & retry
          continue;
        }
        if (!r.data) break;
        setState(r.data);
        if (r.data.status !== "running") break;
        const locked = Boolean((r.data as { locked?: boolean }).locked);
        await sleep(locked ? 1500 : 200);
      }
    } catch (e) {
      toast.error(
        "Sinkronisasi terhenti",
        e instanceof ApiError
          ? e.message
          : "Koneksi ke server terputus. Klik Lanjutkan untuk mencoba lagi.",
      );
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    let alive = true;
    getStorageSyncState()
      .then((r) => {
        if (!alive || !r.data) return;
        setState(r.data);
        if (r.data.status === "running") void pump();
      })
      .catch(() => {});
    return () => {
      alive = false;
      runningRef.current = false;
    };
  }, [pump]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await controlStorageSync("start", { root });
      if (r.data) setState(r.data);
      if (r.data?.status === "running") void pump();
      else setBusy(false);
    } catch (e) {
      setBusy(false);
      toast.error(
        "Gagal memulai",
        e instanceof ApiError ? e.message : "Terjadi kesalahan.",
      );
    }
  };

  const stop = async () => {
    runningRef.current = false;
    try {
      const r = await controlStorageSync("stop");
      if (r.data) setState(r.data);
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const runCheck = async () => {
    setChecking(true);
    setCheckRes(null);
    try {
      const r = await checkStorageSync(root);
      if (r.data) setCheckRes({ ...r.data, root });
    } catch (e) {
      toast.error(
        "Gagal mengecek",
        e instanceof ApiError ? e.message : "Terjadi kesalahan.",
      );
    } finally {
      setChecking(false);
    }
  };

  const isRunning = state?.status === "running";
  const canResume = isRunning && !runningRef.current && !busy;
  const pct = Math.min(100, Math.max(0, state?.percent ?? 0));
  const eta = state ? etaText(state) : null;

  return (
    <div className="mt-2 space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-center gap-2">
        <FolderSync className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">
          Sinkronisasi file lama ke MinIO
        </h3>
      </div>
      <p className="text-xs text-slate-500">
        Menyalin file yang sudah ada di server ke bucket MinIO (struktur folder
        dipertahankan). File lokal <strong>tidak dihapus</strong>. File yang sudah
        ada di bucket dengan ukuran sama akan dilewati, jadi aman dijalankan ulang.
        Progres tersimpan di server — halaman boleh ditutup lalu dibuka lagi untuk
        melanjutkan. Untuk data besar, admin server dapat menuntaskannya tanpa
        halaman ini terbuka: <code>php index.php storage_sync resume</code> (mis.
        via Task Scheduler tiap 15 menit).
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Folder" >
          <Select
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            disabled={isRunning || busy}
            className="w-72"
          >
            {ROOT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        {isRunning ? (
          <>
            {canResume ? (
              <Button variant="secondary" onClick={() => void pump()}>
                <Loader2 className="h-4 w-4" />
                Lanjutkan
              </Button>
            ) : null}
            <Button variant="danger" onClick={stop}>
              <Square className="h-4 w-4" />
              Hentikan
            </Button>
          </>
        ) : (
          <Button onClick={start} loading={busy} disabled={!canRun || busy}>
            <FolderSync className="h-4 w-4" />
            {state?.status === "done" || state?.status === "stopped"
              ? "Sinkronkan lagi"
              : "Mulai Sinkronisasi"}
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={runCheck}
          loading={checking}
          disabled={!canRun || checking}
        >
          <CheckCircle2 className="h-4 w-4" />
          Cek Kelengkapan
        </Button>
      </div>

      {!canRun ? (
        <p className="text-xs text-amber-600">
          Simpan konfigurasi MinIO (termasuk secret key) terlebih dahulu sebelum
          menjalankan sinkronisasi.
        </p>
      ) : null}

      {checkRes ? (
        (() => {
          const gap = (checkRes.missing ?? 0) + (checkRes.mismatch ?? 0);
          const complete = gap === 0;
          return (
            <div
              className={`rounded-lg border p-3 text-sm ${
                complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <div className="flex items-start gap-2">
                {complete ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>
                  {complete ? (
                    <>
                      <strong>Lengkap.</strong> Semua{" "}
                      {formatNumber(checkRes.local)} file di{" "}
                      <code>{checkRes.root}</code> sudah ada di bucket dengan
                      ukuran sama.
                    </>
                  ) : (
                    <>
                      <strong>{formatNumber(gap)} file belum tersinkron</strong> (
                      {formatBytes(checkRes.missing_bytes)}) di{" "}
                      <code>{checkRes.root}</code>. Klik{" "}
                      {state?.status === "done" || state?.status === "stopped"
                        ? "“Sinkronkan lagi”"
                        : "“Mulai Sinkronisasi”"}{" "}
                      untuk mengunggahnya.
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <span>Lokal: <strong>{formatNumber(checkRes.local)}</strong></span>
                <span>Cocok di bucket: <strong>{formatNumber(checkRes.ok)}</strong></span>
                <span>Belum ada: <strong>{formatNumber(checkRes.missing)}</strong></span>
                <span>Beda ukuran: <strong>{formatNumber(checkRes.mismatch)}</strong></span>
              </div>

              {checkRes.sample && checkRes.sample.length > 0 ? (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">
                    Contoh {checkRes.sample.length} file
                  </summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded bg-white/70 p-2 font-mono text-[11px]">
                    {checkRes.sample.map((r, i) => (
                      <li key={i} className="truncate" title={r}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        })()
      ) : null}

      {state && state.status !== "idle" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>
              {state.status === "running" && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Menyalin…
                </span>
              )}
              {state.status === "done" && <span className="text-emerald-600">Selesai</span>}
              {state.status === "stopped" && <span>Dihentikan</span>}
              {state.status === "error" && (
                <span className="text-rose-600">Error</span>
              )}
              {state.root ? <span className="ml-1 text-slate-400">· {state.root}</span> : null}
            </span>
            <span>
              {formatNumber(state.done_files)} / {formatNumber(state.total_files)} file
              {eta ? <span className="ml-1 text-slate-400">· {eta}</span> : null}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                state.status === "error" ? "bg-rose-400" : "bg-emerald-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
            <span>Terunggah: <strong>{formatNumber(state.uploaded)}</strong></span>
            <span>Dilewati: <strong>{formatNumber(state.skipped)}</strong></span>
            <span>
              Gagal:{" "}
              <strong className={state.failed ? "text-rose-600" : ""}>
                {formatNumber(state.failed)}
              </strong>
            </span>
            <span>Data: <strong>{formatBytes(state.uploaded_bytes)}</strong></span>
          </div>

          {state.cursor ? (
            <p className="mt-1.5 truncate text-[11px] text-slate-400" title={state.cursor}>
              {state.cursor}
            </p>
          ) : null}

          {state.recent && state.recent.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-rose-600">
                {state.recent.length} pesan / error terakhir
              </summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded bg-white p-2 font-mono text-[11px] text-slate-600">
                {state.recent.map((r, i) => (
                  <li key={i} className="truncate" title={r}>
                    {r}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {state.status === "error" && state.last_error ? (
            <p className="mt-1 text-xs text-rose-600">{state.last_error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
