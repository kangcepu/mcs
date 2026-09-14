"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useImportAssets } from "@/hooks/use-assets";
import { downloadAssetImportTemplate } from "@/lib/api/assets";
import type { AssetImportResult } from "@/lib/api/assets";
import { ApiError } from "@/types/api";

const STATUS_STYLE: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700",
  updated: "bg-blue-50 text-blue-700",
  skipped: "bg-slate-100 text-slate-500",
  error: "bg-rose-50 text-rose-700",
};

const STATUS_LABEL: Record<string, string> = {
  created: "Dibuat",
  updated: "Diperbarui",
  skipped: "Dilewati",
  error: "Gagal",
};

export function AssetImportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const importer = useImportAssets();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState<AssetImportResult | null>(null);
  const [wasDryRun, setWasDryRun] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const run = (dryRun: boolean) => {
    if (!file) {
      toast.error("Pilih file Excel/CSV dulu");
      return;
    }
    importer.mutate(
      { file, dryRun, updateExisting },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setWasDryRun(dryRun);
          const s = res.data.summary;
          if (dryRun) {
            toast.success(
              "Pratinjau selesai",
              `${s.total} baris — ${s.errors} error, ${s.skipped} dilewati.`,
            );
          } else {
            toast.success(
              "Impor selesai",
              `${s.created} dibuat, ${s.updated} diperbarui, ${s.errors} gagal.`,
            );
          }
        },
        onError: (e) => {
          toast.error(
            "Impor gagal",
            e instanceof ApiError ? e.message : undefined,
          );
        },
      },
    );
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadAssetImportTemplate();
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
      title="Impor Aset dari Excel"
      description="Unggah file .xlsx / .xls / .csv. Kolom: AssetCode (opsional), AssetName, AliasName, Brand, Company, Location, Category, MtcArea, Keterangan, Active."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="secondary"
            onClick={() => run(true)}
            loading={importer.isPending}
            disabled={!file}
          >
            Cek Dulu (pratinjau)
          </Button>
          <Button
            onClick={() => run(false)}
            loading={importer.isPending}
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
              {file ? file.name : "Pilih file Excel / CSV…"}
            </p>
            <p className="text-xs text-slate-400">
              {file
                ? `${(file.size / 1024).toFixed(0)} KB`
                : "Maksimal 5 MB, 2000 baris"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Perbarui aset yang AssetCode-nya sudah ada (default: dilewati)
        </label>

        {summary ? (
          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-100 px-4 py-2.5 text-sm">
              <span className="text-slate-500">
                {wasDryRun ? "Pratinjau" : "Hasil"}:
              </span>
              <span className="font-medium text-slate-700">
                {summary.total} baris
              </span>
              <span className="text-emerald-600">{summary.created} dibuat</span>
              <span className="text-blue-600">{summary.updated} diperbarui</span>
              <span className="text-slate-500">{summary.skipped} dilewati</span>
              <span className="text-rose-600">{summary.errors} gagal</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Baris</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      AssetCode
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result?.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center text-slate-400"
                      >
                        Tidak ada baris data.
                      </td>
                    </tr>
                  ) : (
                    result?.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500">{r.row}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {r.asset_code || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_STYLE[r.status] ?? "bg-slate-100"
                            }`}
                          >
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {r.message || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
