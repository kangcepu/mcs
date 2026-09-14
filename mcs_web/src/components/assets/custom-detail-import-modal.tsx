"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMediaMutations } from "@/hooks/use-asset-media";
import { downloadCustomDetailTemplate } from "@/lib/api/asset-media";
import type { CustomDetailImportResult } from "@/lib/api/asset-media";
import { ApiError } from "@/types/api";

export function CustomDetailImportModal({
  assetCode,
  onClose,
}: {
  assetCode: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { importDetails } = useAssetMediaMutations(assetCode);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [result, setResult] = useState<CustomDetailImportResult | null>(null);
  const [wasDryRun, setWasDryRun] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const run = (dryRun: boolean) => {
    if (!file) {
      toast.error("Pilih file .xlsx dulu");
      return;
    }
    importDetails.mutate(
      { file, mode, dryRun },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setWasDryRun(dryRun);
          const s = res.data.summary;
          toast.success(
            dryRun ? "Pratinjau selesai" : "Impor selesai",
            `${s.rows} baris, ${s.images} gambar${
              s.images_failed ? `, ${s.images_failed} gambar gagal` : ""
            }.`,
          );
        },
        onError: (e) =>
          toast.error(
            "Impor gagal",
            e instanceof ApiError ? e.message : undefined,
          ),
      },
    );
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadCustomDetailTemplate();
    } catch (e) {
      toast.error(
        "Gagal mengunduh template",
        e instanceof ApiError ? e.message : undefined,
      );
    } finally {
      setDownloading(false);
    }
  };

  const summary = result?.summary;

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title="Impor Custom Detail dari Excel"
      description={`Aset ${assetCode}. Unggah .xlsx (data mulai baris 10; kolom E Part Mesin wajib). Gambar embedded template lama F/G/H maupun template V2 G/H/I ikut terbaca — maks. 2 per kolom per baris.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="secondary"
            onClick={() => run(true)}
            loading={importDetails.isPending}
            disabled={!file}
          >
            Cek Dulu (pratinjau)
          </Button>
          <Button
            onClick={() => run(false)}
            loading={importDetails.isPending}
            disabled={!file}
          >
            <Upload className="h-4 w-4" />
            Impor Sekarang
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={downloading}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Unduh template Excel
        </button>

        <div
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 hover:border-brand-400 hover:bg-brand-50/40"
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-700">
              {file ? file.name : "Pilih file .xlsx…"}
            </p>
            <p className="text-xs text-slate-400">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "Maksimal 25 MB"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="cd-import-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            Ganti semua (replace)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="cd-import-mode"
              checked={mode === "append"}
              onChange={() => setMode("append")}
            />
            Tambahkan (append)
          </label>
        </div>

        {summary ? (
          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-100 px-4 py-2.5 text-sm">
              <span className="text-slate-500">
                {wasDryRun ? "Pratinjau" : "Hasil"} ({summary.mode}):
              </span>
              <span className="font-medium text-slate-700">
                {summary.rows} baris
              </span>
              <span className="text-emerald-600">{summary.images} gambar</span>
              {summary.image_engine ? (
                <span className="text-xs text-slate-400">
                  Engine: {summary.image_engine}
                </span>
              ) : null}
              {summary.images_failed ? (
                <span className="text-rose-600">
                  {summary.images_failed} gambar gagal
                </span>
              ) : null}
              {!wasDryRun ? (
                <span className="text-blue-600">
                  {summary.created} tersimpan
                </span>
              ) : null}
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Bagian</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Bagian Mesin
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Part Mesin
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">Durasi</th>
                    <th className="px-3 py-2 text-right font-semibold">Gambar</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.rows ?? []).map((r) => (
                    <tr key={r.no} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{r.no}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.bagian || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.bagian_mesin || "-"}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {r.part_mesin}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.durasi_pengecekan || "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {r.images}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
