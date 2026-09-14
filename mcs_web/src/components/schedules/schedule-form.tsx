"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Plus, Sparkles, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  usePreventiveMutations,
  useScheduleCustomDetailRows,
} from "@/hooks/use-preventive-schedules";
import { AssetPicker } from "@/components/assets/asset-picker";
import {
  listPreventiveSchedules,
  type ScheduleCustomDetailRow,
} from "@/lib/api/preventive-schedules";
import { SCHEDULE_GROUPS } from "@/types/preventive";
import { ApiError } from "@/types/api";
import { pick } from "@/lib/display";

const detailSchema = z.object({
  part: z.string().min(1, "Wajib"),
  activity: z.string().optional(),
  frequency: z.string().min(1, "Wajib"),
  condition: z.string().optional(),
  /** Tautan ke asset_custom_details.id bila baris berasal dari Custom Detail. */
  custom_detail_id: z.union([z.number(), z.string()]).optional(),
});

const schema = z
  .object({
    asset_code: z.string().min(1, "Kode aset wajib diisi"),
    company: z.string().min(1, "Company wajib diisi"),
    towo: z.string().min(1, "Tujuan WO wajib dipilih"),
    mtc_executors: z.array(z.string()).default([]),
    details: z.array(detailSchema).min(1, "Minimal satu detail"),
  })
  .superRefine((v, ctx) => {
    if (v.towo === "wo_mtc" && v.mtc_executors.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mtc_executors"],
        message: "Pilih minimal satu divisi eksekutor MESO",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

/** Nilai `towo` = nilai DB legacy (dipakai generator WO di M_Schedule). */
const TOWO = [
  { value: "wo_mtc", label: "WO MESO" },
  { value: "wo_mtc_operational", label: "WO Maintenance" },
  { value: "wo_it", label: "WO IT" },
  { value: "wo_preventive", label: "WO Produksi" },
];

/** Divisi eksekutor MESO (WO MTC) — WO diteruskan ke user divisi ini. */
const MTC_DIVISIONS = [
  { value: "MKL", label: "Mekanikal (MKL)" },
  { value: "ELC", label: "Elektrikal (ELC)" },
  { value: "SPL", label: "Sipil (SPL)" },
  { value: "OTO", label: "Otomotif (OTO)" },
];

/** Alias FE lama -> nilai DB legacy, untuk memuat schedule lama. */
const TOWO_ALIAS: Record<string, string> = {
  meso: "wo_mtc",
  maintenance: "wo_mtc_operational",
  production: "wo_preventive",
  is: "wo_it",
};

const FREQ = SCHEDULE_GROUPS.filter((g) => g.key !== "unscheduled").map((g) => ({
  value: g.label,
  label: g.label,
}));

/** Nilai `type_schedule` backend -> label FREQ. */
const FREQ_FROM_BACKEND: Record<string, string> = {
  harian: "Harian",
  daily: "Harian",
  day: "Harian",
  "1 hari": "Harian",
  week: "Mingguan",
  weekly: "Mingguan",
  mingguan: "Mingguan",
  bulanan: "Bulanan",
  "3 bulan": "3 Bulan",
  "3 bulanan": "3 Bulan",
  "6 bulan": "6 Bulan",
  "6 bulanan": "6 Bulan",
  "1 tahun": "Tahunan",
  tahunan: "Tahunan",
};

/**
 * Baris Custom Detail aset -> baris form Detail Schedule.
 * Mengikuti `autoGenerateScheduleFromCustomDetail()` di web lama:
 *  - Part            = part_mesin
 *  - Aktivitas       = kondisi  (backend: `job_requirement`)
 *  - Frekuensi       = type_schedule. Nilai kosong menggunakan "Harian",
 *    sama dengan default persistensi API V2 (bukan dipaksa Mingguan).
 *  - Kategori Mtc    = category_maintenance  (backend: `category_maintenance`)
 */
function customRowToDetail(row: ScheduleCustomDetailRow) {
  const part = row.part_mesin ?? "";
  return {
    part,
    activity: row.kondisi || (part ? `Pengecekan kondisi ${part}` : ""),
    frequency:
      FREQ_FROM_BACKEND[
        String(row.type_schedule ?? row.durasi_pengecekan ?? "").toLowerCase().trim()
      ] ?? "Harian",
    condition: row.category_maintenance || "",
    custom_detail_id: row.custom_detail_id || undefined,
  };
}

type ScheduleDetailPayload = {
  header?: Record<string, unknown>;
  details?: Array<Record<string, unknown>>;
};

export function ScheduleFormModal({
  open,
  onClose,
  mode,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  /** Wrapper `{header, details}` dari /v2/preventive-schedules/detail. */
  initial?: ScheduleDetailPayload;
}) {
  const toast = useToast();
  const scheduleId = initial?.header?.id as string | number | undefined;
  const { create, update } = usePreventiveMutations(scheduleId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mtc_executors: [],
      details: [{ part: "", activity: "", frequency: "", condition: "" }],
    },
  });

  const assetCode = watch("asset_code") ?? "";
  const towo = watch("towo");
  const isMeso = towo === "wo_mtc";
  const [assetName, setAssetName] = useState("");

  // Cek aset yang dipilih sudah punya schedule (mirror validasi backend).
  const dupCheck = useQuery({
    queryKey: ["schedule-dup-check", assetCode],
    queryFn: ({ signal }) =>
      listPreventiveSchedules({ q: assetCode, per_page: 20 }, signal),
    enabled: mode === "create" && assetCode.trim().length > 0,
    staleTime: 30_000,
  });
  const assetHasSchedule =
    mode === "create" &&
    assetCode.trim() !== "" &&
    ((dupCheck.data?.data ?? []) as Array<Record<string, unknown>>).some(
      (r) =>
        String(r.AssetCode ?? r.asset_code ?? "")
          .trim()
          .toLowerCase() === assetCode.trim().toLowerCase(),
    );

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "details",
  });

  // Baris Custom Detail aset (create mode) — untuk mengisi form otomatis.
  const cdRows = useScheduleCustomDetailRows(
    assetCode,
    mode === "create" && assetCode.trim().length > 0,
  );
  const customRows = cdRows.data?.data?.rows ?? [];
  const [autoFilledFor, setAutoFilledFor] = useState<string>("");

  const fillFromCustomDetail = () => {
    if (customRows.length === 0) return;
    replace(customRows.map(customRowToDetail));
    setAutoFilledFor(assetCode);
    toast.success(
      "Detail terisi dari Custom Detail",
      `${customRows.length} part dimuat. Periksa frekuensi & kondisi tiap baris.`,
    );
  };

  // Auto-isi sekali saat aset baru dipilih & grid masih baris kosong bawaan.
  useEffect(() => {
    if (mode !== "create" || customRows.length === 0) return;
    if (autoFilledFor === assetCode) return;
    const pristine =
      fields.length === 1 &&
      !watch("details.0.part") &&
      !watch("details.0.activity");
    if (!pristine) return;
    replace(customRows.map(customRowToDetail));
    setAutoFilledFor(assetCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRows, assetCode, mode]);

  useEffect(() => {
    if (!open) return;
    const h = initial?.header ?? {};
    const d = initial?.details ?? [];
    setAssetName(pick(h, ["AssetName", "asset_name", "name"]));
    const rawTowo = pick(h, ["towo", "target_wo"]);
    const firstExec = pick((d[0] as Record<string, unknown>) ?? {}, ["executor"]);
    reset({
      asset_code: pick(h, ["AssetCode", "asset_code"]),
      company: pick(h, ["CompanyName", "company_name", "company"]),
      towo: TOWO_ALIAS[rawTowo] ?? rawTowo,
      mtc_executors: firstExec
        ? firstExec
            .split(",")
            .map((s) => s.split("|")[0]?.trim().toUpperCase() ?? "")
            .filter((s) => MTC_DIVISIONS.some((m) => m.value === s))
        : [],
      details:
        d.length > 0
          ? d.map((row) => ({
              part: pick(row, ["part_mesin", "part"]),
              activity: pick(row, ["job_requirement", "activity", "job_title"]),
              frequency:
                FREQ_FROM_BACKEND[
                  String(pick(row, ["type_schedule", "frequency"])).toLowerCase()
                ] ?? "Harian",
              condition: pick(row, ["category_maintenance", "condition"]),
              custom_detail_id:
                pick(row, ["asset_custom_detail_id", "custom_detail_id"]) ||
                undefined,
            }))
          : [{ part: "", activity: "", frequency: "", condition: "" }],
    });
    setAutoFilledFor("");
  }, [open, initial, reset]);

  const onSubmit = handleSubmit(async (values) => {
    // Untuk MESO, sertakan divisi eksekutor: setiap detail WO dieksekusi user
    // divisi ini. Backend memetakan `executor`/`category_maintenance` ke detail.
    const execList =
      values.towo === "wo_mtc" ? (values.mtc_executors ?? []) : [];
    const body: Record<string, unknown> = {
      ...values,
      ...(execList.length
        ? {
            executor: execList.join(","),
            category_maintenance: execList[0]?.toLowerCase(),
          }
        : {}),
      };
    try {
      if (mode === "create") {
        const result = await create.mutateAsync(body);
        const generated = result.data?.generated_work_orders?.length ?? 0;
        if (generated > 0) {
          toast.success("Schedule dan WO awal dibuat", `${generated} WO preventive siap dieksekusi.`);
        } else {
          toast.warning(
            "Schedule dibuat, WO awal belum terbentuk",
            "Periksa hari kerja/kalender libur atau buka detail schedule lalu pilih Buat WO Sekarang.",
          );
        }
      } else {
        if (!scheduleId) throw new Error("ID schedule tidak ditemukan.");
        await update.mutateAsync({ id: scheduleId, body });
        toast.success("Schedule diperbarui");
      }
      onClose();
    } catch (e) {
      toast.error(
        "Gagal menyimpan",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={mode === "create" ? "Buat Preventive Schedule" : "Ubah Preventive Schedule"}
      description="Satu aset hanya boleh memiliki satu schedule aktif."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {assetHasSchedule ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Aset <strong>{assetCode}</strong> sudah memiliki preventive
              schedule. Satu aset hanya boleh punya satu schedule aktif — pilih
              aset lain atau ubah schedule yang ada.
            </span>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" {...register("asset_code")} />
          <Field
            label="Aset"
            required
            error={errors.asset_code?.message}
            hint={assetCode ? `Kode: ${assetCode}` : "Ketik nama atau kode aset"}
          >
            {mode === "edit" ? (
              <Input value={assetName || assetCode} readOnly className="bg-slate-100" />
            ) : (
              <AssetPicker
                selectedName={assetName}
                selectedCode={assetCode}
                onSelect={(code, name, company) => {
                  setValue("asset_code", code, { shouldValidate: true });
                  setAssetName(name);
                  if (company) setValue("company", company);
                }}
                onClear={() => {
                  setValue("asset_code", "", { shouldValidate: true });
                  setAssetName("");
                }}
              />
            )}
          </Field>
          <Field label="Company">
            <Input {...register("company")} />
          </Field>
          <Field label="Tujuan WO" required error={errors.towo?.message}>
            <Select {...register("towo")}>
              <option value="">Pilih</option>
              {TOWO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isMeso ? (
          <Field
            label="Divisi Eksekutor MESO"
            required
            error={errors.mtc_executors?.message}
            hint="WO hasil schedule ini akan dieksekusi oleh user divisi terpilih."
          >
            <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 p-3">
              {MTC_DIVISIONS.map((m) => (
                <label
                  key={m.value}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    value={m.value}
                    className="h-4 w-4 rounded"
                    {...register("mtc_executors")}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </Field>
        ) : null}

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Detail Schedule</p>
            <div className="flex items-center gap-2">
              {mode === "create" && customRows.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-2 text-xs"
                  onClick={fillFromCustomDetail}
                  title="Isi ulang seluruh baris detail dari Custom Detail aset"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Isi dari Custom Detail ({customRows.length})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-2 text-xs"
                onClick={() =>
                  append({
                    part: "",
                    activity: "",
                    frequency: "",
                    condition: "",
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah baris
              </Button>
            </div>
          </div>
          {mode === "create" && assetCode && cdRows.isFetching ? (
            <p className="mb-2 text-xs text-slate-400">
              Memeriksa Custom Detail aset…
            </p>
          ) : null}
          {mode === "create" && assetCode && !cdRows.isFetching && customRows.length === 0 ? (
            <p className="mb-2 text-xs text-slate-400">
              Aset ini belum punya Custom Detail — isi baris detail manual.
            </p>
          ) : null}
          {errors.details?.message ? (
            <p className="mb-2 text-xs text-rose-600">{errors.details.message}</p>
          ) : null}

          <div className="mb-1 hidden gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[1fr_1fr_140px_1fr_36px]">
            <span>Part Mesin</span>
            <span>Aktivitas / Prosedur</span>
            <span>Frekuensi</span>
            <span>Kategori Mtc</span>
            <span />
          </div>

          <div className="space-y-2">
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_140px_1fr_36px]"
              >
                <input
                  type="hidden"
                  {...register(`details.${i}.custom_detail_id`)}
                />
                <Input
                  placeholder="Part mesin"
                  {...register(`details.${i}.part`)}
                />
                <Input
                  placeholder="Prosedur / kondisi pengecekan"
                  {...register(`details.${i}.activity`)}
                />
                <Select {...register(`details.${i}.frequency`)}>
                  <option value="">Frekuensi</option>
                  {FREQ.map((fr) => (
                    <option key={fr.value} value={fr.value}>
                      {fr.label}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="mkl / elc / general…"
                  {...register(`details.${i}.condition`)}
                />
                <button
                  type="button"
                  onClick={() => fields.length > 1 && remove(i)}
                  className="grid place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  disabled={fields.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={assetHasSchedule}>
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
