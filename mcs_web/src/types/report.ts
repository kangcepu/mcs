export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  company?: string;
  location?: string;
  category?: string;
  status?: string;
  module?: string;
  type_wo?: string;
  asset?: string;
  executor?: string;
  q?: string;
  page?: number;
  per_page?: number;
}

export type ReportRow = Record<string, unknown>;

export interface QrReportData {
  asset_code: string;
  asset_name?: string;
  company_name?: string;
  /** URL logo perusahaan (kosong bila company tidak dikenal). */
  logo_url?: string;
  /** Isi yang di-encode ke dalam QR (URL Detail_asset dengan id terenkripsi). */
  qr_content?: string;
  qr_payload?: string;
  /** PNG QR sebagai data URI, digenerate backend (Ciqrcode, ECC H). */
  qr_image?: string | null;
  qr_url?: string;
  /** Halaman cetak label bawaan backend (equipment/qrcode_mcs). */
  print_url?: string;
  [key: string]: unknown;
}
