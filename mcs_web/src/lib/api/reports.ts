import { apiV2 } from "@/lib/api-client";
import { getToken, forceLogout } from "@/lib/auth";
import { API_V2_URL } from "@/lib/env";
import type { ApiResponse } from "@/types/api";
import type { QrReportData, ReportFilters, ReportRow } from "@/types/report";

type ReportKey =
  | "assets"
  | "assets-history"
  | "stock-opname"
  | "list-of-assets"
  | "recap-work-orders";

export interface RecapWorkOrderFilterOptions {
  companies: Array<{ value: string; label: string }>;
  divisions: Array<{ value: string; label: string }>;
}

/** Opsi filter recap yang dapat diakses pengguna report, bukan endpoint master User Management. */
export function getRecapWorkOrderFilterOptions(
  signal?: AbortSignal,
): Promise<ApiResponse<RecapWorkOrderFilterOptions>> {
  return apiV2.get<RecapWorkOrderFilterOptions>(
    "/reports/recap-work-orders-options",
    { signal },
  );
}

export function getReport(
  key: ReportKey,
  filters: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ApiResponse<ReportRow[]>> {
  return apiV2.get<ReportRow[]>(`/reports/${key}`, { params: { ...filters }, signal });
}

export function getAssetHistoryReport(
  assetCode: string,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<ApiResponse<ReportRow[]>> {
  return apiV2.get<ReportRow[]>("/reports/assets-history", {
    params: { asset_code: assetCode, ...filters },
    signal,
  });
}

const EXPORT_PER_PAGE = 500;
const EXPORT_MAX_PAGES = 200; // safety cap ~100rb baris

/**
 * Ambil SELURUH baris laporan sesuai filter (semua halaman) untuk export/cetak.
 * Berhenti berdasarkan `meta.total_pages` — TIDAK mengandalkan panjang chunk
 * (backend meng-clamp per_page, jadi chunk pendek ≠ halaman terakhir).
 */
export async function fetchAllReportRows(
  key: ReportKey,
  filters: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await getReport(
      key,
      { ...filters, page, per_page: EXPORT_PER_PAGE },
      signal,
    );
    const chunk = (res.data ?? []) as ReportRow[];
    out.push(...chunk);
    totalPages = Number(res.meta?.total_pages ?? page);
    if (chunk.length === 0) break;
    page += 1;
  } while (page <= totalPages && page <= EXPORT_MAX_PAGES);
  return out;
}

/** Idem untuk Asset History (endpoint terpisah, param `asset_code`). */
export async function fetchAllAssetHistoryRows(
  assetCode: string,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await getAssetHistoryReport(
      assetCode,
      { ...filters, page, per_page: EXPORT_PER_PAGE } as ReportFilters,
      signal,
    );
    const chunk = (res.data ?? []) as ReportRow[];
    out.push(...chunk);
    totalPages = Number(res.meta?.total_pages ?? page);
    if (chunk.length === 0) break;
    page += 1;
  } while (page <= totalPages && page <= EXPORT_MAX_PAGES);
  return out;
}

export function getQrReport(
  assetCode: string,
  signal?: AbortSignal,
): Promise<ApiResponse<QrReportData>> {
  return apiV2.get<QrReportData>("/reports/qr", {
    params: { asset_code: assetCode },
    signal,
  });
}

/** PDF per No. SO melalui proxy V2 yang sudah memvalidasi user saat ini. */
export async function getStockOpnamePdf(noSo: string): Promise<Blob> {
  const token = getToken();
  const response = await fetch(
    `${API_V2_URL}/reports/stock-opname/print?no_so=${encodeURIComponent(noSo)}`,
    {
      headers: {
        Accept: "application/pdf, application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    },
  );

  if (response.status === 401) {
    forceLogout();
    throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Gagal mengambil PDF (HTTP ${response.status}).`);
  }
  return response.blob();
}
