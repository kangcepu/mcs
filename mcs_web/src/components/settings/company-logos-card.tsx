"use client";

import { useRef, useState } from "react";
import { Building2, ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  useCompanyLogos,
  useRemoveCompanyLogo,
  useSaveCompanyLogo,
} from "@/hooks/use-settings";
import { ApiError } from "@/types/api";
import type { CompanyLogo } from "@/lib/api/settings";

const MAX_BYTES = 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

export function CompanyLogosCard() {
  const { data, isLoading } = useCompanyLogos();
  const companies = data?.data?.companies ?? [];

  return (
    <div className="card space-y-1 p-5">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">
          Logo QR per Company
        </h3>
      </div>
      <p className="pb-2 text-xs text-slate-500">
        Logo yang dipakai di label cetak QR aset. Tiap company bisa punya
        logonya sendiri. Gambar otomatis dipaskan ke slot logo tanpa mengubah
        desain label. PNG / JPG / WEBP / SVG, maks 1&nbsp;MB.
      </p>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : companies.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Data company tidak tersedia.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {companies.map((c) => (
            <CompanyRow key={c.id_company} company={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CompanyRow({ company }: { company: CompanyLogo }) {
  const toast = useToast();
  const save = useSaveCompanyLogo();
  const remove = useRemoveCompanyLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const busy = save.isPending || remove.isPending;
  const shown = preview ?? (company.logo_url || null);

  const onPick = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.warning("Ukuran terlalu besar", "Maksimal 1 MB.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    try {
      await save.mutateAsync({ idCompany: company.id_company, file: f });
      toast.success("Logo disimpan", company.company_name);
    } catch (e) {
      setPreview(null);
      toast.error(
        "Gagal menyimpan logo",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync(company.id_company);
      setPreview(null);
      toast.success("Logo dihapus", `${company.company_name} kembali ke logo bawaan.`);
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <li className="flex items-center gap-4 py-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={company.company_name}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <Building2 className="h-5 w-5 text-slate-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {company.company_name}
        </p>
        <p className="text-xs text-slate-400">
          {company.id_company}
          {" · "}
          {company.has_custom || preview ? "logo custom" : "logo bawaan"}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => fileRef.current?.click()}
        loading={save.isPending}
        disabled={busy}
      >
        <ImageUp className="h-4 w-4" />
        {company.has_custom || preview ? "Ganti" : "Unggah"}
      </Button>
      {company.has_custom ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          loading={remove.isPending}
          disabled={busy}
          className="text-rose-600"
          aria-label="Hapus logo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </li>
  );
}
