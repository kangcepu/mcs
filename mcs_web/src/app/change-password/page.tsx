"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, KeyRound, Loader2, Wrench } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { changePassword } from "@/lib/api/auth";
import { useBranding } from "@/hooks/use-settings";
import { Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/types/api";

const schema = z
  .object({
    username: z.string().min(1, "Username wajib diisi"),
    current_password: z.string().optional(),
    password: z.string().min(6, "Minimal 6 karakter"),
    confirm_password: z.string().min(1, "Konfirmasi password wajib diisi"),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Konfirmasi password tidak sama",
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const branding = useBranding().data?.data;
  const logoUrl = branding?.logo_url ?? null;
  const appName = branding?.app_name || "MCS";

  const [showNew, setShowNew] = useState(false);
  const usernameParam = params.get("username") ?? "";
  const next = params.get("next");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (usernameParam) setValue("username", usernameParam);
  }, [usernameParam, setValue]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      changePassword({
        username: values.username.trim(),
        current_password: values.current_password ?? "",
        password: values.password,
        confirm_password: values.confirm_password,
      }),
    onSuccess: () => {
      toast.success("Password berhasil dibuat", "Silakan masuk dengan password baru Anda.");
      const q = next && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : "";
      router.replace(`/login${q}`);
    },
    onError: (err) => {
      toast.error(
        "Gagal membuat password",
        err instanceof ApiError ? err.message : "Terjadi kesalahan tak terduga.",
      );
    },
  });

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#7d5a91] via-[#c98a9b] to-[#f0a97e] px-4 py-10">
      <h1 className="mb-8 text-center text-2xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-3xl">
        Buat Password Baru
      </h1>

      <div className="w-full max-w-sm rounded-3xl border border-white/25 bg-white/15 p-7 shadow-2xl backdrop-blur-xl">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={appName}
            className="mx-auto mb-5 h-20 w-auto max-w-[220px] object-contain drop-shadow-lg"
          />
        ) : (
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white shadow-md">
              <Wrench className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold text-white">{appName}</span>
          </div>
        )}

        <p className="mb-5 flex items-start gap-2 rounded-lg bg-white/20 px-3 py-2 text-xs text-white">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          Akun ini belum memiliki password (baru dibuat / direset). Buat password
          baru untuk melanjutkan.
        </p>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <Field
            label="Username"
            required
            error={errors.username?.message}
          >
            <input
              className="h-11 w-full rounded-xl border-0 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
              readOnly={Boolean(usernameParam)}
              {...register("username")}
            />
          </Field>

          <Field
            label="Password Lama (opsional)"
            hint="Kosongkan bila akun baru atau password baru saja direset."
          >
            <input
              type="password"
              className="h-11 w-full rounded-xl border-0 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
              autoComplete="current-password"
              {...register("current_password")}
            />
          </Field>

          <Field label="Password Baru" required error={errors.password?.message}>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                className="h-11 w-full rounded-xl border-0 bg-white px-4 pr-10 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
                autoComplete="new-password"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={showNew ? "Sembunyikan" : "Tampilkan"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field
            label="Konfirmasi Password Baru"
            required
            error={errors.confirm_password?.message}
          >
            <input
              type={showNew ? "text" : "password"}
              className="h-11 w-full rounded-xl border-0 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
              autoComplete="new-password"
              {...register("confirm_password")}
            />
          </Field>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="text-sm font-medium text-white/80 hover:text-white"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-rose-600 px-7 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700 disabled:opacity-60"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                </>
              ) : (
                "Simpan Password"
              )}
            </button>
          </div>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-white/80">
        Copyright © {new Date().getFullYear()}, {appName}
      </p>
    </div>
  );
}
