"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, login, logout, type LoginPayload } from "@/lib/api/auth";
import { clearToken, getToken, setToken } from "@/lib/auth";
import { ApiError } from "@/types/api";
import type { MeUser } from "@/types/auth";

export const meQueryKey = ["me"] as const;

/** Query profil + permission user aktif. */
export function useMe() {
  return useQuery<MeUser>({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => getMe(signal),
    enabled: typeof window !== "undefined" && Boolean(getToken()),
    staleTime: 5 * 60_000,
    retry: (count, error) => {
      if (error instanceof ApiError && [401, 403].includes(error.status)) return false;
      return count < 1;
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: async (result) => {
      if (result.requiresPasswordChange) {
        const params = new URLSearchParams();
        if (result.username) params.set("username", result.username);
        const next = new URLSearchParams(window.location.search).get("next");
        if (next && next.startsWith("/")) params.set("next", next);
        router.replace(`/change-password?${params.toString()}`);
        return;
      }
      setToken(result.token as string);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    // Tidak menunggu response agar logout lokal selalu cepat; backend mencatat
    // event bila koneksi tersedia.
    void logout().catch(() => undefined);
    clearToken();
    queryClient.clear();
    router.replace("/login");
  };
}
