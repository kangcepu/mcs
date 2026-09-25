"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Loader2, PackagePlus, PlayCircle } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { LoadingSkeleton, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { usePreventiveParts, useWoExecution } from "@/hooks/use-wo-execution";
import type {
  PreventivePartRequestInfo,
  PreventivePartRow,
} from "@/lib/api/wo-execution";
import { ApiError } from "@/types/api";
import { dash } from "@/lib/display";
import { toAbsoluteUploadUrl } from "@/lib/env";

type Draft = {
  done: boolean;
  need_request_part: boolean;
  keterangan: string;
};

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm)(\?|$)/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_RE.test(url);
}

function photoUrls(p: PreventivePartRow): string[] {
  const groups = [
    p.tampak_jauh,
    p.tampak_dekat,
    p.detail_part,
    p.execution_media,
  ];
  const out: string[] = [];
  for (const g of groups) {
    for (const im of g ?? []) {
      const u = (im as Record<string, unknown>).url ?? (im as Record<string, unknown>).path;
      if (typeof u === "string" && u) out.push(toAbsoluteUploadUrl(u));
    }
  }
  return out;
}

export function PreventiveChecklist({
  woNumber,
  module = "maintenance",
  canWrite = true,
}: {
  woNumber: string;
  module?: string;
  canWrite?: boolean;
}) {
  const toast = useToast();
  const { data, isLoading, error, refetch } = usePreventiveParts(
    module,
    woNumber,
    true,
  );
  const { savePreventiveParts } = useWoExecution(module, woNumber);

  const rows: PreventivePartRow[] = data?.data ?? [];
  const partRequest =
    (data?.meta as unknown as
      | { part_request?: PreventivePartRequestInfo | null }
      | undefined)?.part_request ?? null;
  const [draft, setDraft] = useState<Record<string, Draft>>({});

  useEffect(() => {
    const next: Record<string, Draft> = {};
    rows.forEach((r, i) => {
      const key = String(r.custom_detail_id || `row-${i}`);
      next[key] = {
        done: String(r.maintenance_status ?? "").toUpperCase() === "DONE",
        need_request_part: !!r.need_request_part || (r.request_qty ?? 0) > 0,
        keterangan: r.keterangan ?? "",
      };
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const EMPTY: Draft = {
    done: false,
    need_request_part: false,
    keterangan: "",
  };
  const setRow = (key: string, patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? EMPTY), ...patch } }));

  const doneCount = Object.values(draft).filter((d) => d?.done).length;
  const reqCount = Object.values(draft).filter((d) => d?.need_request_part).length;

  const submit = async () => {
    const payload = rows.map((r, i) => {
      const key = String(r.custom_detail_id || `row-${i}`);
      const d = draft[key];
      return {
        custom_detail_id: r.custom_detail_id,
        part_mesin: r.part_mesin,
        bagian_mesin: r.bagian_mesin ?? "",
        maintenance_status: (d?.done ? "DONE" : "PENDING") as "DONE" | "PENDING",
        need_request_part: !!d?.need_request_part,
        keterangan: d?.keterangan ?? "",
      };
    });
    try {
      const res = await savePreventiveParts.mutateAsync(payload);
      const req = res.data?.requested ?? 0;
      toast.success(
        "Checklist part disimpan",
        req > 0
          ? "Permohonan part dikirim ke tim Sparepart (modul Material Usage)."
          : undefined,
      );
    } catch (e) {
      toast.error(
        "Gagal menyimpan",
        e instanceof ApiError ? e.message : undefined,
      );
    }
  };

  if (isLoading) return <LoadingSkeleton rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-slate-400">
        Tidak ada part preventive untuk WO ini (aset belum punya Custom Detail).
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Update Part Preventive
          <span className="ml-2 text-xs font-normal text-slate-400">
            {doneCount}/{rows.length} selesai
            {reqCount > 0 ? ` · ${reqCount} minta part` : ""}
          </span>
        </h3>
        {canWrite ? (
          <Button onClick={submit} loading={savePreventiveParts.isPending}>
            <CheckSquare className="h-4 w-4" />
            Simpan Checklist
          </Button>
        ) : null}
      </div>

      {partRequest?.exists ? (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <PackagePlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Permohonan part <strong>{partRequest.status ?? "PENDING"}</strong>
            {partRequest.requested_by ? ` oleh ${partRequest.requested_by}` : ""} —
            menunggu tim Sparepart memilih part di modul Material Usage.
            {partRequest.note ? (
              <span className="block text-amber-700">{partRequest.note}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Part Mesin</th>
              <th className="px-3 py-2 text-left font-semibold">Bagian Mesin</th>
              <th className="px-3 py-2 text-left font-semibold">Jadwal</th>
              <th className="px-3 py-2 text-left font-semibold">Foto</th>
              <th className="px-3 py-2 text-left font-semibold">Checklist</th>
              <th className="px-3 py-2 text-left font-semibold">Minta Part</th>
              <th className="px-3 py-2 text-left font-semibold">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const key = String(r.custom_detail_id || `row-${i}`);
              const d = draft[key] ?? EMPTY;
              const photos = photoUrls(r).slice(0, 6);
              return (
                <tr key={key} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3 font-medium text-slate-800">
                    {dash(r.part_mesin)}
                    {r.kondisi ? (
                      <span className="block text-xs font-normal text-slate-400">
                        {r.kondisi}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{dash(r.bagian_mesin)}</td>
                  <td className="px-3 py-3 text-slate-600">{dash(r.tipe_jadwal)}</td>
                  <td className="px-3 py-3">
                    {photos.length ? (
                      <div className="flex flex-wrap gap-1">
                        {photos.map((u, k) =>
                          isVideoUrl(u) ? (
                            <a
                              key={k}
                              href={u}
                              target="_blank"
                              rel="noreferrer"
                              className="grid h-9 w-9 place-items-center rounded bg-slate-800 ring-1 ring-slate-200"
                            >
                              <PlayCircle className="h-4 w-4 text-white" />
                            </a>
                          ) : (
                            <a key={k} href={u} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={u}
                                alt=""
                                className="h-9 w-9 rounded object-cover ring-1 ring-slate-200"
                              />
                            </a>
                          ),
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        disabled={!canWrite}
                        checked={d.done}
                        onChange={(e) => setRow(key, { done: e.target.checked })}
                      />
                      Sudah Preventive
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        disabled={!canWrite}
                        checked={d.need_request_part}
                        onChange={(e) =>
                          setRow(key, { need_request_part: e.target.checked })
                        }
                      />
                      Perlu part
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      disabled={!canWrite}
                      className="h-8 min-w-[200px]"
                      placeholder="mis. bearing aus, perlu ganti"
                      value={d.keterangan}
                      onChange={(e) => setRow(key, { keterangan: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Centang <strong>Perlu part</strong> untuk mengajukan permohonan part —
        eksekutor cukup mengajukan, <em>tidak perlu</em> mengisi nama/jumlah part.
        Tim Sparepart yang memilih part di modul Material Usage. Semua part harus
        diceklis <strong>Sudah Preventive</strong> sebelum WO bisa di-
        <em>Complete</em>. Setelah minimal satu checklist disimpan, status WO
        otomatis menjadi <strong>Dalam Proses</strong>.
      </p>

      {savePreventiveParts.isPending ? (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…
        </div>
      ) : null}
    </div>
  );
}
