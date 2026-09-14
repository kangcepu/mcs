"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, RotateCcw, Wrench } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { useToast } from "@/components/ui/toast";
import { useBranding, useUpdateBranding } from "@/hooks/use-settings";
import { StorageSettingsCard } from "@/components/settings/storage-settings-card";
import { CompanyLogosCard } from "@/components/settings/company-logos-card";
import { PERMISSIONS } from "@/lib/permissions";
import { ApiError } from "@/types/api";
import { formatDateTime } from "@/lib/format";

// Branding disimpan sebagai data URI di database. Base64 menambah ukuran
// sekitar 33%, jadi file yang disimpan harus cukup kecil agar tidak melewati
// batas paket MySQL pada server produksi.
const MAX_BYTES = 450 * 1024;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const RASTER_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function optimizeLogo(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file;
  if (!RASTER_LOGO_TYPES.has(file.type) || typeof createImageBitmap === "undefined") {
    throw new Error("Use PNG, JPG, or WEBP up to 450 KB.");
  }

  const source = await createImageBitmap(file);
  try {
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);

    let smallest: Blob | null = null;
    for (const quality of [0.9, 0.82, 0.74, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= MAX_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
          type: "image/webp",
        });
      }
    }
    throw new Error(
      `The image is still too large after optimization (${Math.ceil((smallest?.size ?? file.size) / 1024)} KB).`,
    );
  } finally {
    source.close();
  }
}

export default function BrandingPage() {
  return (
    <PermissionGuard permission={PERMISSIONS.userManagement} mode="page">
      <Inner />
    </PermissionGuard>
  );
}

function Inner() {
  const toast = useToast();
  const { data, isLoading } = useBranding();
  const branding = data?.data;
  const update = useUpdateBranding();

  const [appName, setAppName] = useState("");
  const [appSubtitle, setAppSubtitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!branding) return;
    setAppName(branding.app_name ?? "MCS");
    setAppSubtitle(branding.app_subtitle ?? "Maintenance Control System");
  }, [branding]);

  const onPickFile = async (f: File | null) => {
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (f.size > MAX_SOURCE_BYTES) {
      toast.warning("Image is too large", "Choose an image up to 10 MB.");
      return;
    }
    try {
      const prepared = await optimizeLogo(f);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
      if (prepared !== f) {
        toast.success("Logo optimized", "The image was reduced so it can be saved.");
      }
    } catch (error) {
      toast.warning(
        "Logo cannot be used",
        error instanceof Error ? error.message : "Choose an image up to 450 KB.",
      );
    }
  };

  const save = async () => {
    const fd = new FormData();
    fd.append("app_name", appName.trim());
    fd.append("app_subtitle", appSubtitle.trim());
    if (file) fd.append("logo", file);
    try {
      await update.mutateAsync(fd);
      toast.success("Branding disimpan", "Logo & favicon akan mengikuti gambar baru.");
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(
        "Save failed",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  const removeLogo = async () => {
    const fd = new FormData();
    fd.append("remove", "1");
    fd.append("app_name", appName.trim());
    fd.append("app_subtitle", appSubtitle.trim());
    try {
      await update.mutateAsync(fd);
      toast.success("Logo removed", "Reverted to the default icon.");
      setFile(null);
      setPreview(null);
    } catch (e) {
      toast.error("Failed", e instanceof ApiError ? e.message : undefined);
    }
  };

  const currentLogo = preview ?? branding?.logo_url ?? null;

  return (
    <PageContainer
      title="Branding & Storage"
      description="Manage the application logo (sidebar, login, favicon) and external file-storage endpoint (MinIO/S3)."
    >
      <div className="space-y-4">
      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Form */}
          <div className="card space-y-4 p-5">
            <Field label="Application Logo">
              <div className="flex items-center gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200">
                  {currentLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentLogo}
                      alt="Logo"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <Wrench className="h-8 w-8 text-white" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon"
                    className="hidden"
                    onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImageUp className="h-4 w-4" />
                    Choose Image
                  </Button>
                  <p className="text-xs text-slate-400">
                    PNG / JPG / WEBP are optimized automatically. SVG / GIF / ICO are limited to 450 KB.
                    A square ratio is recommended.
                  </p>
                </div>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application Name">
                <Input value={appName} onChange={(e) => setAppName(e.target.value)} />
              </Field>
              <Field label="Subtitle">
                <Input
                  value={appSubtitle}
                  onChange={(e) => setAppSubtitle(e.target.value)}
                />
              </Field>
            </div>

            {branding?.updated_at ? (
              <p className="text-xs text-slate-400">
                Last updated: {formatDateTime(branding.updated_at)}
              </p>
            ) : null}

            <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
              <Button onClick={save} loading={update.isPending} disabled={update.isPending}>
                Save Changes
              </Button>
              {branding?.logo_url ? (
                <Button
                  variant="ghost"
                  onClick={removeLogo}
                  loading={update.isPending}
                  className="text-rose-600"
                >
                  <RotateCcw className="h-4 w-4" />
                  Remove Logo (use default)
                </Button>
              ) : null}
            </div>
          </div>

          {/* Preview */}
          <div className="card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sidebar Preview
            </p>
            <div className="rounded-xl bg-[#0a0f1c] p-4">
              <div className="flex items-center gap-3">
                {currentLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentLogo}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-xl bg-slate-900 object-contain p-1 ring-1 ring-white/10"
                  />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white ring-1 ring-white/10">
                    <Wrench className="h-5 w-5" />
                  </span>
                )}
                <span className="leading-tight">
                  <span className="block text-base font-bold text-white">
                    {appName || "MCS"}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {appSubtitle || "Maintenance Control System"}
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              The browser-tab favicon will also use this image after saving.
            </p>
          </div>
        </div>
      )}

        <CompanyLogosCard />

        <StorageSettingsCard />
      </div>
    </PageContainer>
  );
}
