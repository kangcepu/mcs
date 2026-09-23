import { cn } from "@/lib/utils";

type Tone = "green" | "red" | "amber" | "blue" | "slate" | "violet" | "cyan";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
};

/** Pemetaan status umum MCS -> tone + label ramah. */
const STATUS_MAP: Record<string, { tone: Tone; label?: string }> = {
  // generik
  open: { tone: "blue", label: "Open" },
  new: { tone: "blue", label: "Baru" },
  draft: { tone: "slate", label: "Draft" },
  pending: { tone: "amber", label: "Menunggu" },
  waiting_part_selection: { tone: "amber", label: "Menunggu Pilih Part" },
  waiting_part_pickup: { tone: "violet", label: "Menunggu Pengambilan" },
  usage_recorded: { tone: "cyan", label: "Pemakaian Diisi" },
  selected: { tone: "blue", label: "Part Dipilih" },
  sent_erp: { tone: "cyan", label: "Dikirim ke ERP" },
  waiting: { tone: "amber", label: "Menunggu" },
  in_progress: { tone: "cyan", label: "Dikerjakan" },
  in_progress_executor: { tone: "cyan", label: "Dalam Proses" },
  "in progress": { tone: "cyan", label: "Dikerjakan" },
  progress: { tone: "cyan", label: "Dikerjakan" },
  on_progress: { tone: "cyan", label: "Dikerjakan" },
  running: { tone: "cyan", label: "Berjalan" },
  paused: { tone: "amber", label: "Dijeda" },
  hold: { tone: "amber", label: "Ditahan" },
  need_approval: { tone: "amber", label: "Perlu Approval" },
  approved: { tone: "green", label: "Disetujui" },
  rejected: { tone: "red", label: "Ditolak" },
  reject: { tone: "red", label: "Ditolak" },
  done: { tone: "green", label: "Selesai" },
  completed: { tone: "green", label: "Selesai" },
  closed: { tone: "green", label: "Ditutup" },
  close: { tone: "green", label: "Ditutup" },
  cancelled: { tone: "slate", label: "Dibatalkan" },
  canceled: { tone: "slate", label: "Dibatalkan" },
  failed: { tone: "red", label: "Gagal" },
  error: { tone: "red", label: "Error" },
  synced: { tone: "green", label: "Tersinkron" },
  not_synced: { tone: "slate", label: "Belum Sinkron" },
  active: { tone: "green", label: "Aktif" },
  inactive: { tone: "slate", label: "Nonaktif" },
  // module WO
  pro: { tone: "blue", label: "PRO" },
  cor: { tone: "amber", label: "COR" },
  prev: { tone: "violet", label: "PREV" },
  // status WO (tb_wo_mtc_operational / tb_wo_mtc / tb_wo_preventive / tb_wo_it / tb_wo_ga)
  wait_ka_div: { tone: "amber", label: "Menunggu Ka Div" },
  wait_ka_div_mtc: { tone: "amber", label: "Menunggu Ka Div" },
  wait_ka_dept_meso: { tone: "amber", label: "Menunggu Ka Dept" },
  wait_executor_admin: { tone: "amber", label: "Menunggu Admin" },
  complete_executor: { tone: "cyan", label: "Selesai Dikerjakan" },
  parts_received: { tone: "cyan", label: "Part Diterima" },
  waiting_parts: { tone: "amber", label: "Menunggu Part" },
  forward_to_meso: { tone: "violet", label: "Diteruskan ke MESO" },
  from_maintenance: { tone: "violet", label: "Dari Maintenance" },
  need_closed: { tone: "amber", label: "Perlu Ditutup" },
  void: { tone: "slate", label: "Void" },
};

export function statusTone(status?: string | null): Tone {
  if (!status) return "slate";
  return STATUS_MAP[status.toString().toLowerCase().trim()]?.tone ?? "slate";
}

export function StatusBadge({
  status,
  className,
  tone,
}: {
  status?: string | null;
  className?: string;
  tone?: Tone;
}) {
  const key = (status ?? "").toString().toLowerCase().trim();
  const mapped = STATUS_MAP[key];
  const resolvedTone = tone ?? mapped?.tone ?? "slate";
  const label =
    mapped?.label ??
    (status ? status.toString().replace(/[_-]+/g, " ") : "-");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      {label}
    </span>
  );
}
