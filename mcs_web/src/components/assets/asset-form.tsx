"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations, useAssetOptions } from "@/hooks/use-assets";
import { ApiError } from "@/types/api";
import { isAssetInactive, pick } from "@/lib/display";

const schema = z.object({
  asset_name: z.string().min(1, "Nama aset wajib diisi"),
  company: z.string().min(1, "Company wajib dipilih"),
  location: z.string().min(1, "Lokasi wajib dipilih"),
  category: z.string().min(1, "Kategori wajib dipilih"),
  asset_code: z.string().min(1, "Kode aset wajib diisi"),
  alias_name: z.string().optional(),
  brand: z.string().optional(),
  serial_number: z.string().optional(),
  keterangan: z.string().optional(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function AssetFormModal({
  open,
  onClose,
  mode,
  initial,
  assetCode,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  /** Baris aset mentah dari /v2/assets/detail (`data.asset`). */
  initial?: Record<string, unknown>;
  /** Kode aset otoritatif (mis. dari URL detail) — dipakai saat edit. */
  assetCode?: string;
}) {
  const toast = useToast();
  const options = useAssetOptions();
  const initialCode =
    (assetCode ?? "").trim() ||
    pick(initial ?? {}, [
      "AssetCode",
      "asset_code",
      "AssetID",
      "asset_id",
      "code",
    ]);
  const { create, update, generateCode } = useAssetMutations(initialCode);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  });

  useEffect(() => {
    if (!open) return;
    const i = initial ?? {};
    reset({
      asset_name: pick(i, ["AssetName", "asset_name", "name"]),
      company: pick(i, ["CompanyName", "company_name", "company"]),
      location: pick(i, ["LocationAsset", "location_name", "location"]),
      category: pick(i, ["CategoryAsset", "category_name", "category"]),
      asset_code: pick(i, ["AssetCode", "asset_code"]),
      alias_name: pick(i, ["AliasName", "alias_name"]),
      brand: pick(i, ["brand"]),
      serial_number: pick(i, ["Remarks", "serial_number"]),
      keterangan: pick(i, ["Keterangan", "description"]),
      is_active: initial ? !isAssetInactive(i) : true,
    });
  }, [open, initial, reset]);

  const opt = options.data?.data;

  const onGenerate = async () => {
    const { company, location, category } = getValues();
    if (!company || !location || !category) {
      toast.warning("Lengkapi data", "Pilih company, lokasi, dan kategori terlebih dahulu.");
      return;
    }
    try {
      const res = await generateCode.mutateAsync({ company, location, category });
      const code = res.data?.asset_code;
      if (code) {
        setValue("asset_code", code, { shouldValidate: true });
        toast.success("Kode dibuat", code);
      }
    } catch (e) {
      toast.error("Gagal membuat kode", e instanceof ApiError ? e.message : undefined);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (mode === "create") {
        await create.mutateAsync(values);
        toast.success("Aset dibuat", values.asset_code);
      } else {
        const target = (initialCode || values.asset_code || "").trim();
        if (!target) {
          toast.error("Gagal menyimpan", "Kode aset tidak diketahui.");
          return;
        }
        await update.mutateAsync({ asset: target, body: values });
        toast.success("Aset diperbarui", values.asset_code);
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
      size="xl"
      title={mode === "create" ? "Tambah Aset" : "Ubah Aset"}
      description={
        mode === "create"
          ? "Isi data aset lalu buat kode otomatis atau isi manual."
          : initialCode
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama Aset" required error={errors.asset_name?.message}>
          <Input {...register("asset_name")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Company" required error={errors.company?.message}>
            <Select {...register("company")}>
              <option value="">Pilih company</option>
              {(opt?.companies ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lokasi" required error={errors.location?.message}>
            <Select {...register("location")}>
              <option value="">Pilih lokasi</option>
              {(opt?.locations ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategori" required error={errors.category?.message}>
            <Select {...register("category")}>
              <option value="">Pilih kategori</option>
              {(opt?.categories ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Kode Aset" required error={errors.asset_code?.message}>
          <div className="flex gap-2">
            <Input
              {...register("asset_code")}
              readOnly={mode === "edit"}
              className={mode === "edit" ? "bg-slate-100" : ""}
            />
            {mode === "create" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onGenerate}
                loading={generateCode.isPending}
                className="shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Generate
              </Button>
            ) : null}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Merek">
            <Input {...register("brand")} />
          </Field>
          <Field label="Alias">
            <Input {...register("alias_name")} />
          </Field>
          <Field label="No. Seri / Remarks">
            <Input {...register("serial_number")} />
          </Field>
        </div>

        <Field label="Keterangan">
          <Input {...register("keterangan")} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register("is_active")} className="h-4 w-4 rounded" />
          Aset aktif
        </label>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {mode === "create" ? "Simpan Aset" : "Simpan Perubahan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
