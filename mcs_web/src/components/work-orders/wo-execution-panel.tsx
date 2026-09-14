"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  GitFork,
  PackagePlus,
  Pencil,
  Send,
  Users,
  UserCog,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useWoExecution, woExecCaps } from "@/hooks/use-wo-execution";
import { PicPicker } from "@/components/work-orders/pic-picker";
import { ApiError } from "@/types/api";
import { pick } from "@/lib/display";

const FINAL = ["CLOSED", "VOID", "REJECT", "DECLINE", "NEED_CLOSED"];

export function WoExecutionPanel({
  module,
  woNumber,
  woStatus,
  wo,
  canManage = false,
}: {
  module: string;
  woNumber: string;
  woStatus: string;
  wo?: Record<string, unknown>;
  canManage?: boolean;
}) {
  const toast = useToast();
  const caps = woExecCaps(module);
  const exec = useWoExecution(module, woNumber);
  const [open, setOpen] = useState<
    | null
    | "job"
    | "labor"
    | "material"
    | "complete"
    | "forward"
    | "edit"
    | "planner"
    | "sub"
  >(null);

  const isFinal = FINAL.includes(woStatus.toUpperCase());
  const canForward = module === "maintenance";
  const canManageNow = canManage && !isFinal;
  const canSub = canManageNow && module !== "production";
  const anyCap =
    caps.job ||
    caps.labor ||
    caps.material ||
    caps.complete ||
    canForward ||
    canManageNow;
  if (isFinal || !anyCap) return null;

  const close = () => setOpen(null);

  return (
    <>
      {caps.job ? (
        <Button variant="secondary" onClick={() => setOpen("job")}>
          <ClipboardCheck className="h-4 w-4" />
          Update Pekerjaan
        </Button>
      ) : null}
      {caps.labor ? (
        <Button variant="secondary" onClick={() => setOpen("labor")}>
          <Users className="h-4 w-4" />
          Tambah Labor
        </Button>
      ) : null}
      {caps.material ? (
        <Button variant="secondary" onClick={() => setOpen("material")}>
          <PackagePlus className="h-4 w-4" />
          Ajukan Part
        </Button>
      ) : null}
      {caps.complete && !caps.job ? (
        <Button variant="secondary" onClick={() => setOpen("complete")}>
          <CheckCircle2 className="h-4 w-4" />
          Selesaikan
        </Button>
      ) : null}
      {canForward ? (
        <Button variant="secondary" onClick={() => setOpen("forward")}>
          <Send className="h-4 w-4" />
          Forward ke MESO
        </Button>
      ) : null}
      {canManageNow ? (
        <Button variant="secondary" onClick={() => setOpen("edit")}>
          <Pencil className="h-4 w-4" />
          Edit WO
        </Button>
      ) : null}
      {canManageNow ? (
        <Button variant="secondary" onClick={() => setOpen("planner")}>
          <UserCog className="h-4 w-4" />
          Planner
        </Button>
      ) : null}
      {canSub ? (
        <Button variant="secondary" onClick={() => setOpen("sub")}>
          <GitFork className="h-4 w-4" />
          Buat Sub-WO
        </Button>
      ) : null}

      {open === "job" ? (
        <JobModal
          woNumber={woNumber}
          onClose={close}
          pending={exec.jobExplanation.isPending}
          onSubmit={async (fd) => {
            try {
              await exec.jobExplanation.mutateAsync(fd);
              toast.success("Update pekerjaan tersimpan");
              close();
            } catch (e) {
              toast.error(
                "Gagal menyimpan",
                e instanceof ApiError ? e.message : undefined,
              );
            }
          }}
        />
      ) : null}

      {open === "labor" ? (
        <LaborModal
          onClose={close}
          pending={exec.addLabor.isPending}
          onSubmit={async (v) => {
            try {
              await exec.addLabor.mutateAsync({ wo_number: woNumber, ...v });
              toast.success("Labor ditambahkan");
              close();
            } catch (e) {
              toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
            }
          }}
        />
      ) : null}

      {open === "material" ? (
        <RequestPartModal
          onClose={close}
          pending={exec.requestPart.isPending}
          onSubmit={async (note) => {
            try {
              await exec.requestPart.mutateAsync(note || undefined);
              toast.success(
                "Permohonan part terkirim",
                "Muncul di modul Material Usage — tim Sparepart yang memilih part.",
              );
              close();
            } catch (e) {
              toast.error(
                "Gagal mengajukan",
                e instanceof ApiError ? e.message : undefined,
              );
            }
          }}
        />
      ) : null}

      {open === "complete" ? (
        <CompleteModal
          onClose={close}
          pending={exec.complete.isPending}
          onSubmit={async (comment) => {
            try {
              await exec.complete.mutateAsync({ wo_number: woNumber, comment });
              toast.success("WO diselesaikan", "Status menjadi NEED_CLOSED.");
              close();
            } catch (e) {
              toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
            }
          }}
        />
      ) : null}

      {open === "forward" ? (
        <ForwardModal
          onClose={close}
          pending={exec.forwardMeso.isPending}
          onSubmit={async (comment) => {
            try {
              await exec.forwardMeso.mutateAsync(comment || undefined);
              toast.success(
                "WO diteruskan ke MESO",
                "WO baru dibuat untuk tim MESO/MTC.",
              );
              close();
            } catch (e) {
              toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
            }
          }}
        />
      ) : null}

      {open === "edit" ? (
        <EditWoModal
          woNumber={woNumber}
          wo={wo ?? {}}
          module={module}
          pending={exec.updateHeader.isPending}
          onClose={close}
          onSubmit={async (body) => {
            try {
              await exec.updateHeader.mutateAsync(body);
              toast.success(
                "WO diperbarui",
                "WO masuk kembali ke antrean approval.",
              );
              close();
            } catch (e) {
              toast.error(
                "Gagal menyimpan",
                e instanceof ApiError ? e.message : undefined,
              );
            }
          }}
        />
      ) : null}

      {open === "planner" ? (
        <PlannerModal
          pending={exec.savePlanner.isPending}
          onClose={close}
          onSubmit={async (body) => {
            try {
              await exec.savePlanner.mutateAsync(body);
              toast.success("Planner disimpan");
              close();
            } catch (e) {
              toast.error(
                "Gagal menyimpan",
                e instanceof ApiError ? e.message : undefined,
              );
            }
          }}
        />
      ) : null}

      {open === "sub" ? (
        <SubWoModal
          pending={exec.subWo.isPending}
          onClose={close}
          onSubmit={async (subTo) => {
            try {
              const res = await exec.subWo.mutateAsync(subTo);
              toast.success(
                "Sub-WO dibuat",
                res.data?.sub_wo_number ?? undefined,
              );
              close();
            } catch (e) {
              toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
            }
          }}
        />
      ) : null}
    </>
  );
}

function EditWoModal({
  woNumber,
  wo,
  module,
  onClose,
  onSubmit,
  pending,
}: {
  woNumber: string;
  wo: Record<string, unknown>;
  module: string;
  onClose: () => void;
  onSubmit: (body: {
    job_title?: string;
    job_requirement?: string;
    type_wo?: string;
    priority?: string;
    shift?: string;
    running_hours?: string;
    category_maintenance?: string;
  }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    job_title: pick(wo, ["title", "job_title", "subject"]),
    job_requirement: pick(wo, ["job_requirement", "requirement"]),
    type_wo: pick(wo, ["type_wo"]) || "CORRECTIVE MAINTENANCE",
    priority: pick(wo, ["priority"]) || "NORMAL",
    shift: pick(wo, ["shift"]) || "REGULAR",
    running_hours: pick(wo, ["running_hours"]),
    category_maintenance: pick(wo, ["category_maintenance"]),
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Edit WO — ${woNumber}`}
      description="Menyimpan perubahan header akan mengembalikan WO ke antrean approval."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => onSubmit(form)}
            loading={pending}
            disabled={!form.job_title.trim()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Judul Pekerjaan" required>
          <Input
            value={form.job_title}
            onChange={(e) => set("job_title", e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Uraian / Kebutuhan Pekerjaan">
          <Textarea
            value={form.job_requirement}
            onChange={(e) => set("job_requirement", e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipe WO">
            <Select
              value={form.type_wo}
              onChange={(e) => set("type_wo", e.target.value)}
            >
              <option value="CORRECTIVE MAINTENANCE">Corrective Maintenance</option>
              <option value="PREV MAINTENANCE">Preventive Maintenance</option>
              <option value="PROJECT">Project</option>
            </Select>
          </Field>
          <Field label="Prioritas">
            <Select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              <option value="NORMAL">Normal</option>
              <option value="EMERGENCY">Emergency</option>
            </Select>
          </Field>
          <Field label="Shift">
            <Select
              value={form.shift}
              onChange={(e) => set("shift", e.target.value)}
            >
              <option value="REGULAR">Regular</option>
              <option value="SHIFT 1">Shift 1</option>
              <option value="SHIFT 2">Shift 2</option>
              <option value="SHIFT 3">Shift 3</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Running Hours">
            <Input
              value={form.running_hours}
              onChange={(e) => set("running_hours", e.target.value)}
              inputMode="decimal"
            />
          </Field>
          {module === "maintenance" ? (
            <Field label="Kategori Maintenance" hint="MKL / ELC / SPL / OTO">
              <Select
                value={form.category_maintenance}
                onChange={(e) => set("category_maintenance", e.target.value)}
              >
                <option value="">—</option>
                <option value="MKL">Mekanikal (MKL)</option>
                <option value="ELC">Elektrikal (ELC)</option>
                <option value="SPL">Sipil (SPL)</option>
                <option value="OTO">Otomotif (OTO)</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function PlannerModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (body: {
    job_executor: string[];
    started_planner: string;
    finished_planner: string;
    estimate_planner?: string;
    comment?: string;
  }) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [executors, setExecutors] = useState("");
  const [started, setStarted] = useState(today);
  const [finished, setFinished] = useState(today);
  const [estimate, setEstimate] = useState("");
  const [comment, setComment] = useState("");

  const submit = () => {
    const list = executors
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (list.length === 0) {
      toast.error("Isi minimal satu kode eksekutor");
      return;
    }
    if (!started || !finished) {
      toast.error("Tanggal mulai & selesai wajib diisi");
      return;
    }
    onSubmit({
      job_executor: list,
      started_planner: started,
      finished_planner: finished,
      estimate_planner: estimate.trim() || undefined,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Planner — Assign Eksekutor & Jadwal"
      description="Menetapkan tim pelaksana dan jadwal rencana. Baris eksekutor WAITING dibuat per kode."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={pending}>
            Simpan Planner
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Kode Eksekutor"
          required
          hint="Pisahkan dengan koma, mis. MKL, ELC"
        >
          <Input
            value={executors}
            onChange={(e) => setExecutors(e.target.value)}
            placeholder="MKL, ELC"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai (rencana)" required>
            <Input
              type="date"
              value={started}
              onChange={(e) => setStarted(e.target.value)}
            />
          </Field>
          <Field label="Selesai (rencana)" required>
            <Input
              type="date"
              value={finished}
              onChange={(e) => setFinished(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Estimasi (jam/hari)" hint="Opsional.">
          <Input
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </Field>
        <Field label="Catatan" hint="Opsional.">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function SubWoModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (subTo: "GA" | "IT" | "MTC") => void;
  pending: boolean;
}) {
  const [subTo, setSubTo] = useState<"GA" | "IT" | "MTC">("MTC");
  return (
    <Modal
      open
      onClose={onClose}
      title="Buat Sub-WO"
      description="Membuat WO turunan ke divisi lain berdasarkan data WO ini."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => onSubmit(subTo)} loading={pending}>
            Buat Sub-WO
          </Button>
        </>
      }
    >
      <Field label="Tujuan Sub-WO" required>
        <Select
          value={subTo}
          onChange={(e) => setSubTo(e.target.value as "GA" | "IT" | "MTC")}
        >
          <option value="MTC">Maintenance (MTC)</option>
          <option value="IT">IT / IS</option>
          <option value="GA">General Affairs (GA)</option>
        </Select>
      </Field>
    </Modal>
  );
}

function ForwardModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (comment: string) => void;
  pending: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="Forward ke MESO"
      description="Meneruskan WO ke tim MESO/MTC. Sebuah WO MESO baru akan dibuat (status FROM_MAINTENANCE) dan WO ini menjadi FORWARD_TO_MESO."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => onSubmit(comment.trim())} loading={pending}>
            Forward
          </Button>
        </>
      }
    >
      <Field label="Catatan" hint="Opsional.">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* ---------------- modals ---------------- */

function JobModal({
  woNumber,
  onClose,
  onSubmit,
  pending,
}: {
  woNumber: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [explanation, setExplanation] = useState("");
  const [status, setStatus] = useState<"IN_PROGRESS" | "COMPLETE">("IN_PROGRESS");
  const [files, setFiles] = useState<File[]>([]);
  const [pics, setPics] = useState<string[]>([]);
  const [men, setMen] = useState("1");
  const [hours, setHours] = useState("1");

  const submit = () => {
    if (!explanation.trim()) {
      toast.error("Penjelasan pekerjaan wajib diisi");
      return;
    }
    if (files.length === 0) {
      toast.error("Minimal 1 foto bukti wajib diunggah");
      return;
    }
    if (files.length > 10) {
      toast.error("Maksimal 10 foto");
      return;
    }
    const fd = new FormData();
    fd.append("wo_number", woNumber);
    fd.append("job_explanation", explanation.trim());
    fd.append("status", status);
    pics.forEach((pic) => fd.append("labor[]", pic));
    if (pics.length > 0) {
      fd.append("labor_men", men);
      fd.append("labor_hours", hours);
    }
    files.forEach((f) => fd.append("service_photos[]", f));
    onSubmit(fd);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Update Pekerjaan — ${woNumber}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={pending}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Penjelasan Pekerjaan" required>
          <Textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Uraikan pekerjaan yang dilakukan…"
            autoFocus
          />
        </Field>
        <Field label="Status Pekerjaan" required>
          <Select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "IN_PROGRESS" | "COMPLETE")
            }
          >
            <option value="IN_PROGRESS">Dalam proses</option>
            <option value="COMPLETE">Selesai</option>
          </Select>
        </Field>
        <Field
          label="PIC / Tenaga Kerja"
          hint={`Opsional. Input labor bersamaan dengan update pekerjaan. (${pics.length}/20)`}
        >
          <PicPicker value={pics} onChange={setPics} max={20} />
        </Field>
        {pics.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jumlah Orang">
              <Input
                type="number"
                min="1"
                value={men}
                onChange={(e) => setMen(e.target.value)}
              />
            </Field>
            <Field label="Jam Kerja">
              <Input
                type="number"
                min="0"
                step="any"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <Field
          label="Foto Bukti"
          required
          hint="JPG / PNG / WEBP, 1–10 foto, maks 10 MB per foto."
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {files.length > 0 ? (
            <p className="mt-1 text-xs text-slate-500">{files.length} foto dipilih</p>
          ) : null}
        </Field>
      </div>
    </Modal>
  );
}

function LaborModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (v: {
    trade: string[];
    men: string;
    hours: string;
  }) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [pics, setPics] = useState<string[]>([]);
  const [men, setMen] = useState("1");
  const [hours, setHours] = useState("1");

  const submit = () => {
    if (pics.length === 0) {
      toast.error("Pilih minimal 1 PIC / tenaga kerja");
      return;
    }
    if (pics.length > 20) {
      toast.error("Maksimal 20 user");
      return;
    }
    onSubmit({ trade: pics, men, hours });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah Labor"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={pending}>
            Tambah
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="PIC / Tenaga Kerja"
          required
          hint={`Cari nama lalu pilih dari daftar. Bisa memilih hingga 20 user. (${pics.length}/20)`}
        >
          <PicPicker value={pics} onChange={setPics} max={20} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah Orang">
            <Input
              type="number"
              min="1"
              value={men}
              onChange={(e) => setMen(e.target.value)}
            />
          </Field>
          <Field label="Jam Kerja">
            <Input
              type="number"
              min="0"
              step="any"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function RequestPartModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajukan Permohonan Part"
      description="Eksekutor cukup mengajukan — tidak perlu mengisi nama/jumlah part. Tim Sparepart yang memilih part di modul Material Usage."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => onSubmit(note.trim())} loading={pending}>
            Kirim Permohonan
          </Button>
        </>
      }
    >
      <Field
        label="Catatan"
        hint="Opsional — jelaskan kebutuhan part (mis. bagian yang rusak / perkiraan part)."
      >
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="mis. bearing motor konveyor aus, minta ganti"
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function CompleteModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (comment: string) => void;
  pending: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="Selesaikan Work Order"
      description="Menandai pekerjaan selesai. Status WO menjadi NEED_CLOSED."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => onSubmit(comment.trim())} loading={pending}>
            Selesaikan
          </Button>
        </>
      }
    >
      <Field label="Catatan" hint="Opsional.">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}
