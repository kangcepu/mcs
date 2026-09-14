import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/types/api";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data dianggap segar 45 dtk → navigasi bolak-balik cepat terasa instan.
        staleTime: 45_000,
        // Simpan cache 15 mnt → kembali ke halaman list tidak memuat ulang dari nol
        // (data lama tampil dulu, refetch di latar belakang).
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Jangan retry error auth / otorisasi / validasi.
          if (error instanceof ApiError && [400, 401, 403, 404, 422].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
