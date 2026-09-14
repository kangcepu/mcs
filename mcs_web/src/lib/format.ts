const ID_LOCALE = "id-ID";

export function formatDate(value?: string | number | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(ID_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(ID_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(value?: number | string | null, fractionDigits = 0): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(ID_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Parse angka dari input manual yang memakai koma (locale Indonesia) atau titik
 * sebagai pemisah desimal. Pemisah ribuan diabaikan. Kembalikan `NaN` bila
 * tidak valid / kosong.
 *
 * Contoh: "0,5" → 0.5 · "1.234,56" → 1234.56 · "3.3" → 3.3 · "" → NaN
 */
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  let s = String(value).trim().replace(/\s/g, "");
  if (s === "") return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Pemisah desimal = yang paling kanan; sisanya pemisah ribuan.
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else {
    s = s.replace(",", ".");
  }
  return Number(s);
}

/**
 * Format kuantitas: tampilkan hingga 2 desimal, tanpa memaksa angka nol di
 * belakang (mis. 4 → "4", 0.5 → "0,5", 3.25 → "3,25").
 */
export function formatQty(value?: number | string | null): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? parseDecimal(value) : value;
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(ID_LOCALE, { maximumFractionDigits: 2 });
}

export function formatBytes(bytes?: number | null, fractionDigits = 1): string {
  const n = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(fractionDigits)} ${units[i]}`;
}

export function formatRelative(value?: string | number | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(ID_LOCALE, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(-diffMs / ms), unit);
  }
  return "baru saja";
}

/** "2026-08-29" untuk input[type=date]. */
export function toDateInput(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
