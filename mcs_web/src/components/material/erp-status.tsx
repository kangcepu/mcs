import { AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatRelative } from "@/lib/format";

/** Badge status sinkronisasi ERP dengan penekanan pada kondisi gagal/pause. */
export function ErpStatusBadge({
  status,
  syncedAt,
}: {
  status?: string | null;
  syncedAt?: string | null;
}) {
  const s = (status ?? "").toString().toLowerCase();
  const failed = ["failed", "error", "gagal"].some((k) => s.includes(k));
  const paused = ["pause", "hold", "stopped"].some((k) => s.includes(k));
  // PENDING pada tb_material_part_request berarti belum pernah dikirim ke
  // ERP, bukan sedang menunggu respons ERP. Jangan gunakan StatusBadge umum
  // karena label generiknya adalah "Menunggu" dan membuat alur rancu.
  const notSynced = !s || ["pending", "not_synced", "pending_dry_run", "not_ready"].includes(s);
  const synced = ["synced", "synced_test", "success", "sent_erp", "sent"].includes(s);

  if (failed || paused) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
        {paused ? <PauseCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {paused ? "ERP dijeda" : "ERP gagal"}
      </span>
    );
  }

  if (notSynced) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
        Belum disinkronkan
      </span>
    );
  }

  if (synced) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Tersinkron ke ERP
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <StatusBadge status={status || "not_synced"} />
      {syncedAt ? (
        <span className="text-[10px] text-slate-400">{formatRelative(syncedAt)}</span>
      ) : null}
    </span>
  );
}

export function ErpSyncWarning({ status }: { status?: string | null }) {
  const s = (status ?? "").toString().toLowerCase();
  const failed = ["failed", "error", "gagal"].some((k) => s.includes(k));
  const paused = ["pause", "hold", "stopped"].some((k) => s.includes(k));
  if (!failed && !paused) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">
          {paused ? "Sinkronisasi ERP dijeda" : "Sinkronisasi ERP gagal"}
        </p>
        <p className="text-xs text-amber-700">
          {paused
            ? "Permintaan tidak akan diteruskan ke ERP sampai sinkronisasi dilanjutkan."
            : "Data belum terkirim ke ERP. Coba jalankan ulang sinkronisasi atau hubungi admin ERP."}
        </p>
      </div>
    </div>
  );
}
