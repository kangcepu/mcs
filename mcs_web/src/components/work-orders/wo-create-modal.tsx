"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { AssetPicker } from "@/components/assets/asset-picker";
import { useCreateWorkOrder, useWorkOrderOptions } from "@/hooks/use-work-orders";
import { useMe } from "@/hooks/use-auth";
import { readableWoModules } from "@/lib/permissions";
import { WO_MODULE_LABEL } from "@/types/work-order";
import { ApiError } from "@/types/api";

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_TYPE_WO = "CORRECTIVE MAINTENANCE";
const DEFAULT_PRIORITY = "NORMAL";
const DEFAULT_SHIFT = "REGULAR";

const EMPTY_FORM = {
  module: "",
  asset_code: "",
  asset_name: "",
  asset_photo_url: "",
  asset_photo_urls: [] as string[],
  company: "",
  type_wo: DEFAULT_TYPE_WO,
  priority: DEFAULT_PRIORITY,
  shift: DEFAULT_SHIFT,
  date: today(),
  job_title: "",
  job_requirement: "",
};

type FormState = typeof EMPTY_FORM;
type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey | "form", string>>;

/** Kode error backend → field yang disorot + pesan ramah. */
const SERVER_CODE_FIELD: Record<string, FieldKey> = {
  WO_MODULE_UNKNOWN: "module",
  WO_ASSET_NOT_FOUND: "asset_code",
  WO_CREATE_COMPANY: "company",
};

export function WoCreateModal({
  open,
  onClose,
  initialModule,
}: {
  open: boolean;
  onClose: () => void;
  /** Modul dari tab daftar WO. Jika ada, WO harus dibuat pada modul ini. */
  initialModule?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: user } = useMe();
  const create = useCreateWorkOrder();

  const modules = useMemo(() => readableWoModules(user), [user]);
  const lockedModule = useMemo(
    () =>
      initialModule && modules.includes(initialModule) ? initialModule : undefined,
    [initialModule, modules],
  );
  const options = useWorkOrderOptions();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);

  // Pastikan nilai default terpilih selalu punya <option>, walau daftar opsi
  // masih loading / gagal dimuat dari /work-orders/options.
  const withFallback = useCallback(
    (
      list: { code: string; label: string }[],
      current: string,
      fallbackLabel: string,
    ) =>
      current === "" || list.some((o) => o.code === current)
        ? list
        : [{ code: current, label: fallbackLabel }, ...list],
    [],
  );

  const types = withFallback(
    options.data?.data?.types ?? [],
    form.type_wo,
    "Corrective Maintenance",
  );
  const priorities = withFallback(
    options.data?.data?.priorities ?? [],
    form.priority,
    "Normal",
  );
  const shifts = withFallback(
    options.data?.data?.shifts ?? [],
    form.shift,
    "Regular",
  );

  // Reset penuh setiap kali modal dibuka.
  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      date: today(),
      module: lockedModule ?? modules[0] ?? "",
    });
    setErrors({});
    setAttempted(false);
    create.reset();
    // Hanya saat open berubah; `modules`/`create` sengaja tidak jadi dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedModule, modules]);

  // Modul bisa datang setelah /me selesai — isi kalau masih kosong.
  useEffect(() => {
    if (open && !form.module && modules.length > 0) {
      setForm((f) => ({ ...f, module: lockedModule ?? modules[0]! }));
    }
  }, [open, form.module, lockedModule, modules]);

  const validate = useCallback(
    (f: FormState): Errors => {
      const e: Errors = {};
      if (!f.module) e.module = "Pilih modul WO.";
      if (!f.asset_code) e.asset_code = "Pilih aset terlebih dahulu.";
      if (!f.job_title.trim()) e.job_title = "Judul pekerjaan wajib diisi.";
      else if (f.job_title.trim().length > 255)
        e.job_title = "Judul pekerjaan maksimal 255 karakter.";
      if (f.asset_code && !f.company.trim())
        e.company = "Nama company wajib diisi.";
      if (f.date && Number.isNaN(Date.parse(f.date)))
        e.date = "Tanggal tidak valid.";
      return e;
    },
    [],
  );

  const applyChange = useCallback(
    (patch: Partial<FormState>, clearKeys: FieldKey[]) => {
      setForm((f) => ({ ...f, ...patch }));
      setErrors((prev) => {
        // Setelah submit pertama: validasi live pakai state terbaru.
        if (attempted) return validate({ ...form, ...patch });
        const cleared: Errors = { ...prev, form: undefined };
        for (const k of clearKeys) cleared[k] = undefined;
        return cleared;
      });
    },
    [attempted, form, validate],
  );

  const set = useCallback(
    <K extends FieldKey>(key: K, value: FormState[K]) =>
      applyChange({ [key]: value } as Partial<FormState>, [key]),
    [applyChange],
  );

  const submit = useCallback(async () => {
    if (create.isPending) return;
    setAttempted(true);
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Formulir belum lengkap", "Periksa isian yang ditandai merah.");
      return;
    }

    try {
      const res = await create.mutateAsync({
        module: form.module,
        asset_code: form.asset_code,
        job_title: form.job_title.trim(),
        type_wo: form.type_wo || undefined,
        priority: form.priority || undefined,
        shift: form.shift || undefined,
        date: form.date || undefined,
        company: form.company.trim() || undefined,
        running_hours: "0",
        job_requirement: form.job_requirement.trim() || undefined,
      });
      const created = res.data;
      toast.success("WO berhasil dibuat", created?.wo_number);
      onClose();
      if (created?.wo_number && created?.module) {
        router.push(
          `/work-orders/${encodeURIComponent(created.module)}/${created.wo_number
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
        );
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Terjadi kesalahan tak terduga. Coba lagi.";
      const code =
        err instanceof ApiError &&
        err.payload &&
        typeof err.payload === "object" &&
        "errors" in err.payload
          ? String(
              (err.payload as { errors?: { code?: string } }).errors?.code ?? "",
            )
          : "";
      const field = SERVER_CODE_FIELD[code];
      setErrors(field ? { [field]: msg, form: msg } : { form: msg });
      toast.error("Gagal membuat WO", msg);
    }
  }, [create, form, onClose, router, toast, validate]);

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Buat Work Order"
      description={
        lockedModule
          ? `WO baru akan dibuat pada modul ${WO_MODULE_LABEL[lockedModule as keyof typeof WO_MODULE_LABEL] ?? lockedModule}.`
          : "WO baru akan mengikuti alur approval modul yang dipilih."
      }
      closeOnBackdrop={!create.isPending}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-slate-400">
            Kolom bertanda * wajib diisi.
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={create.isPending}
            >
              Batal
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              {create.isPending ? "Membuat…" : "Buat WO"}
            </Button>
          </div>
        </div>
      }
    >
      {modules.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Anda tidak memiliki akses membuat Work Order pada modul manapun.
        </div>
      ) : (
        <div
          className="space-y-4"
          onKeyDown={(e) => {
            // Enter di input teks → submit; abaikan textarea & pencarian aset.
            const el = e.target as HTMLElement;
            if (
              e.key === "Enter" &&
              el.tagName === "INPUT" &&
              (el as HTMLInputElement).type !== "search" &&
              !el.closest("[data-asset-picker]")
            ) {
              e.preventDefault();
              void submit();
            }
          }}
        >
          {errors.form ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errors.form}</span>
            </div>
          ) : attempted && errorCount > 0 ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {errorCount} isian belum benar. Perbaiki bagian yang ditandai
                merah di bawah.
              </span>
            </div>
          ) : null}

          {options.isError ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Daftar opsi tidak dapat dimuat — memakai nilai bawaan (Corrective /
              Normal / Regular).
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modul WO" required error={errors.module}>
              {lockedModule ? (
                <Input
                  value={WO_MODULE_LABEL[lockedModule as keyof typeof WO_MODULE_LABEL] ?? lockedModule}
                  readOnly
                  className="bg-slate-50 font-medium text-slate-700"
                />
              ) : (
                <Select
                  value={form.module}
                  onChange={(e) => set("module", e.target.value)}
                  aria-invalid={Boolean(errors.module)}
                >
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {WO_MODULE_LABEL[m as keyof typeof WO_MODULE_LABEL] ?? m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Tanggal" error={errors.date}>
              <Input
                type="date"
                value={form.date}
                max={today()}
                onChange={(e) => set("date", e.target.value)}
                aria-invalid={Boolean(errors.date)}
              />
            </Field>
          </div>

          <div data-asset-picker>
            <Field
              label="Aset"
              required
              error={errors.asset_code}
              hint={
                errors.asset_code
                  ? undefined
                  : "Cari berdasarkan nama, kode, atau company."
              }
            >
              <AssetPicker
                selectedName={form.asset_name}
                selectedCode={form.asset_code}
                selectedPhotoUrl={form.asset_photo_url}
                selectedPhotoUrls={form.asset_photo_urls}
                includeInactive
                forWorkOrder
                onSelect={(code, name, company, photoUrl, photoUrls) =>
                  applyChange(
                    {
                      asset_code: code,
                      asset_name: name,
                      asset_photo_url: photoUrl ?? "",
                      asset_photo_urls: photoUrls ?? [],
                      ...(company ? { company } : {}),
                    },
                    ["asset_code", "company"],
                  )
                }
                onClear={() =>
                  applyChange(
                    { asset_code: "", asset_name: "", asset_photo_url: "", asset_photo_urls: [] },
                    ["asset_code"],
                  )
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Company"
              required
              error={errors.company}
              hint={errors.company ? undefined : "Otomatis dari aset, bisa diubah."}
            >
              <Input
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Nama company"
                aria-invalid={Boolean(errors.company)}
              />
            </Field>

            <Field label="Divisi Pembuat" hint="Otomatis mengikuti divisi akun yang membuat WO.">
              <Input value={user?.division ?? "Divisi akun Anda"} readOnly className="bg-slate-50 text-slate-600" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipe WO">
              <Select
                value={form.type_wo}
                onChange={(e) => set("type_wo", e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Prioritas">
              <Select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                {priorities.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Shift">
              <Select
                value={form.shift}
                onChange={(e) => set("shift", e.target.value)}
              >
                {shifts.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Judul Pekerjaan" required error={errors.job_title}>
            <Input
              value={form.job_title}
              onChange={(e) => set("job_title", e.target.value)}
              placeholder="Contoh: Ganti bearing conveyor line 2"
              maxLength={255}
              aria-invalid={Boolean(errors.job_title)}
            />
          </Field>

          <Field label="Kebutuhan / Uraian Pekerjaan">
            <Textarea
              value={form.job_requirement}
              onChange={(e) => set("job_requirement", e.target.value)}
              placeholder="Detail kebutuhan, gejala, atau instruksi kerja"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
