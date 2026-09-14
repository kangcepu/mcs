"use client";

import { useQuery } from "@tanstack/react-query";
import { lookupUsers } from "@/lib/api/users";

/** Autocomplete user aktif untuk picker PIC / tenaga kerja / eksekutor WO. */
export function useUserLookup(q: string) {
  return useQuery({
    queryKey: ["user-lookup", q],
    queryFn: ({ signal }) => lookupUsers(q, signal),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}
