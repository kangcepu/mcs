"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, KeyRound, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  useOpenCodeLlmSettings,
  useRemoveOpenCodeApiKey,
  useSaveOpenCodeLlmSettings,
  useSyncOpenCodeModels,
  useTestOpenCodeConnection,
} from "@/hooks/use-settings";
import { ApiError } from "@/types/api";
import { formatDateTime } from "@/lib/format";

type Banner = { ok: boolean; message: string } | null;

export function OpenCodeLlmSettingsCard() {
  const toast = useToast();
  const query = useOpenCodeLlmSettings();
  const save = useSaveOpenCodeLlmSettings();
  const sync = useSyncOpenCodeModels();
  const test = useTestOpenCodeConnection();
  const remove = useRemoveOpenCodeApiKey();
  const saved = query.data?.data;

  const [baseUrl, setBaseUrl] = useState("https://opencode.ai/inference/go");
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (!saved) return;
    setBaseUrl(saved.base_url || "https://opencode.ai/inference/go");
    setDefaultModel(saved.default_model || "");
    setEnabled(saved.enabled);
    setApiKey("");
  }, [saved]);

  const connectionBody = () => ({
    base_url: baseUrl.trim(),
    ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
  });

  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback;

  const onSave = async () => {
    setBanner(null);
    try {
      const result = await save.mutateAsync({
        enabled,
        base_url: baseUrl.trim(),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        ...(defaultModel ? { default_model: defaultModel } : {}),
        sync_models: Boolean(apiKey.trim()) || !saved?.models.length,
      });
      setApiKey("");
      const model = result.data?.default_model;
      setBanner({ ok: true, message: model ? `Konfigurasi disimpan. Model default: ${model}.` : "Konfigurasi disimpan." });
      toast.success("Konfigurasi LLM disimpan");
    } catch (error) {
      setBanner({ ok: false, message: errorMessage(error, "Gagal menyimpan konfigurasi OpenCode.") });
    }
  };

  const onSync = async () => {
    setBanner(null);
    try {
      const result = await sync.mutateAsync(connectionBody());
      setApiKey("");
      const count = result.data?.models.length ?? 0;
      setBanner({ ok: true, message: `${count} model ditemukan. Model default dipilih otomatis bila belum ditentukan.` });
    } catch (error) {
      setBanner({ ok: false, message: errorMessage(error, "Gagal mengambil daftar model.") });
    }
  };

  const onTest = async () => {
    setBanner(null);
    try {
      const result = await test.mutateAsync(connectionBody());
      setBanner({ ok: true, message: result.data?.message ?? "Koneksi berhasil." });
    } catch (error) {
      setBanner({ ok: false, message: errorMessage(error, "Koneksi OpenCode gagal.") });
    }
  };

  const onRemove = async () => {
    if (!window.confirm("Hapus API key OpenCode dan nonaktifkan integrasi LLM?")) return;
    try {
      await remove.mutateAsync();
      setApiKey("");
      setEnabled(false);
      toast.success("API key OpenCode dihapus");
    } catch (error) {
      toast.error("Gagal menghapus API key", errorMessage(error, "Terjadi kesalahan."));
    }
  };

  const busy = save.isPending || sync.isPending || test.isPending || remove.isPending;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">LLM OpenCode Go</h2>
            <p className="mt-0.5 text-xs text-slate-500">API key disimpan terenkripsi di server dan tidak pernah ditampilkan kembali.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          Aktifkan LLM
        </label>
      </div>

      {banner ? (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${banner.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {banner.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{banner.message}</span>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Memuat konfigurasi…</div>
      ) : (
        <>
          <Field label="Base URL" required hint="Default OpenCode Go: https://opencode.ai/inference/go">
            <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://opencode.ai/inference/go" />
          </Field>

          <Field label="API Key" required={!saved?.api_key_set} hint={saved?.api_key_set ? `Tersimpan (${saved.api_key_hint}). Kosongkan untuk mempertahankan key.` : "Tempel API key OpenCode. Nilai ini hanya dikirim ke backend."}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={saved?.api_key_set ? "•••••••• (tidak berubah)" : "Masukkan API key"} autoComplete="new-password" className="pl-9" />
            </div>
          </Field>

          <Field label="Model Default" hint={saved?.models.length ? `${saved.models.length} model tersedia dari sinkronisasi terakhir.` : "Isi API key lalu klik Deteksi Model."}>
            <select
              value={defaultModel}
              onChange={(event) => setDefaultModel(event.target.value)}
              disabled={!saved?.models.length}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {!saved?.models.length ? <option value="">Belum ada model terdeteksi</option> : null}
              {saved?.models.map((model) => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} — ${model.id}`}</option>)}
            </select>
          </Field>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button onClick={onSave} loading={save.isPending} disabled={busy}>Simpan &amp; Terapkan</Button>
            <Button variant="secondary" onClick={onSync} loading={sync.isPending} disabled={busy || (!apiKey.trim() && !saved?.api_key_set)}>
              <RefreshCw className="h-4 w-4" /> Deteksi Model
            </Button>
            <Button variant="ghost" onClick={onTest} loading={test.isPending} disabled={busy || (!apiKey.trim() && !saved?.api_key_set)}>Uji Koneksi</Button>
            {saved?.api_key_set ? <Button variant="ghost" onClick={onRemove} disabled={busy} className="text-rose-600"><Trash2 className="h-4 w-4" /> Hapus Key</Button> : null}
          </div>

          {saved?.models_synced_at || saved?.updated_at ? (
            <p className="text-xs text-slate-400">
              {saved.models_synced_at ? `Model diperbarui ${formatDateTime(saved.models_synced_at)}.` : ""}
              {saved.updated_at ? ` Konfigurasi terakhir oleh ${saved.updated_by || "admin"}, ${formatDateTime(saved.updated_at)}.` : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
