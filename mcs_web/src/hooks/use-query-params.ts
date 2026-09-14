"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sinkronisasi state filter dengan URL query string sehingga halaman bisa
 * di-bookmark / di-refresh tanpa kehilangan konteks.
 */
export function useQueryParams<T extends Record<string, string | number | undefined>>(
  defaults: T,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw !== null) {
        const def = defaults[key];
        (result as Record<string, string | number>)[key] =
          typeof def === "number" ? Number(raw) : raw;
      }
    }
    return result;
  }, [searchParams, defaults]);

  const setValues = useCallback(
    (patch: Partial<T>, opts: { resetPage?: boolean } = {}) => {
      const usp = new URLSearchParams(searchParams.toString());
      const merged: Record<string, unknown> = { ...patch };
      if (opts.resetPage && !("page" in patch)) merged.page = 1;

      for (const [key, value] of Object.entries(merged)) {
        if (
          value === undefined ||
          value === "" ||
          value === null ||
          value === defaults[key]
        ) {
          usp.delete(key);
        } else {
          usp.set(key, String(value));
        }
      }
      const qs = usp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaults],
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const hasActiveFilters = useMemo(() => {
    for (const [key, def] of Object.entries(defaults)) {
      const raw = searchParams.get(key);
      if (raw !== null && raw !== String(def) && key !== "page" && key !== "per_page") {
        return true;
      }
    }
    return false;
  }, [searchParams, defaults]);

  return { values, setValues, reset, hasActiveFilters };
}
