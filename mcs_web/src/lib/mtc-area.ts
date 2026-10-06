export const MTC_AREA_OPTIONS = [
  { value: "GSU_WNB", label: "GSU - WNB" },
  { value: "GSU_INJECT", label: "GSU - Inject" },
  { value: "RU_SAWMILL", label: "RU - Sawmill" },
  { value: "RU_PRODUCTION", label: "RU - FJLB" },
] as const;

export function mtcAreaLabel(value?: string | null): string {
  if (!value) return "-";
  return MTC_AREA_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
