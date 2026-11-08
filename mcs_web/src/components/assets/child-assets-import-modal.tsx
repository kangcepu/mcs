"use client";

import { Fragment, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations } from "@/hooks/use-assets";
import { downloadChildAssetImportTemplate, type ChildAssetImportResult } from "@/lib/api/assets";
import { ApiError } from "@/types/api";

export function ChildAssetsImportModal({
  assetCode,
  onClose,
}: {
  assetCode: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { importChildren } = useAssetMutations(assetCode);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ChildAssetImportResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadChildAssetImportTemplate();
    } catch (error) {
      toast.error("Template gagal diunduh", error instanceof ApiError ? error.message : undefined);
    } finally {
      setDownloading(false);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    try {
      const response = await importChildren.mutateAsync({ file, dryRun });
      setResult(response.data);
      const summary = response.data.summary;
      if (summary.errors) {
        toast.error("File masih perlu diperbaiki", `${summary.errors} baris tidak dapat diproses.`);
      } else {
        toast.success(
          dryRun ? "Pratinjau selesai" : "Import selesai",
          dryRun
            ? `${summary.valid} komponen siap ditautkan, ${summary.pending} komponen akan disimpan untuk ditautkan nanti${summary.warnings ? ` (${summary.warnings} peringatan QR)` : ""}.`
            : `${summary.attached} komponen ditautkan, ${summary.pending_imported} baru disimpan untuk diisi nanti${summary.skipped_existing ? `, ${summary.skipped_existing} data lama diperbarui tanpa duplikasi` : ""}.`,
        );
      }
    } catch (error) {
      toast.error("Import gagal", error instanceof ApiError ? error.message : undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title="Import Aset Terkait"
      description={`Aset induk ${assetCode}. Asset Code / QR diisi per komponen (CPU, Monitor, Keyboard, dll) dan boleh dikosongkan.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
          <Button variant="secondary" disabled={!file} loading={importChildren.isPending} onClick={() => run(true)}>
            Cek Dulu
          </Button>
          <Button disabled={!file || Boolean(result?.summary.errors)} loading={importChildren.isPending} onClick={() => run(false)}>
            <Upload className="h-4 w-4" /> Import Sekarang
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          disabled={downloading}
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Menyiapkan template…" : "Unduh Form Preventive Audit siap import"}
        </button>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Asset Code/QR tidak wajib. Isikan pada baris komponen seperti CPU, Monitor, atau Keyboard—bukan pada kelompok “Personal Computer”. Kode kosong, belum ditemukan, atau belum dapat ditautkan tidak membatalkan import; komponennya tetap disimpan untuk ditautkan nanti.
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-left hover:border-brand-400 hover:bg-brand-50/40"
        >
          <FileSpreadsheet className="h-6 w-6 text-slate-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-700">{file?.name ?? "Pilih file .xlsx…"}</span>
            <span className="block text-xs text-slate-400">Maksimal 25 MB</span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </button>

        {result ? (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>{result.summary.groups} kelompok</span>
              <span className="text-emerald-700">{result.summary.valid} valid</span>
              {result.summary.pending ? <span className="text-amber-700">{result.summary.pending} isi nanti</span> : null}
              {result.summary.warnings ? <span className="text-amber-700">{result.summary.warnings} peringatan</span> : null}
              {result.summary.skipped_existing ? <span className="text-blue-700">{result.summary.skipped_existing} sudah ada</span> : null}
              <span className="text-rose-700">{result.summary.errors} error</span>
              {result.summary.reassigned ? <span className="text-amber-700">{result.summary.reassigned} pindah parent</span> : null}
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Kelompok</th>
                    <th className="px-3 py-2">Asset Code / QR</th>
                    <th className="px-3 py-2">Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((row) => (
                    <Fragment key={`${row.row}-${row.child_name}`}>
                      <tr className="bg-slate-50/50">
                        <td className="px-3 py-2 text-slate-500">{row.row}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{row.child_name}</td>
                        <td className="px-3 py-2 text-slate-400">-</td>
                        <td className="px-3 py-2 text-slate-500">{row.items.length} komponen</td>
                      </tr>
                      {row.items.map((item) => (
                        <tr key={`${row.row}-${item.row}-${item.item_name}`} className="text-xs">
                          <td className="px-3 py-1.5 text-slate-400">{item.row}</td>
                          <td className="py-1.5 pl-7 pr-3 text-slate-600">└ {item.item_name}</td>
                          <td className="px-3 py-1.5 text-slate-600">{item.resolved_code || item.lookup_value || "-"}</td>
                          <td className={`px-3 py-1.5 ${item.status === "error" ? "text-rose-600" : item.status === "pending" || item.status === "warning" ? "text-amber-600" : "text-emerald-600"}`}>{item.message}</td>
                        </tr>
                      ))}
                    </Fragment>
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
