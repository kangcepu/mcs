"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  ListTodo,
  Package,
  X,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { DescriptionList } from "@/components/ui/detail";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useMyWorkSummary, useMyWorkList } from "@/hooks/use-my-work";
import { useWorkOrderDecision } from "@/hooks/use-approval-center";
import { useWorkOrderDetail } from "@/hooks/use-work-orders";
import { useQueryParams } from "@/hooks/use-query-params";
import type { MyWorkCategoryKey, MyWorkItem } from "@/lib/api/my-work";
import type { WoDecision } from "@/lib/api/approval-center";
import { DEFAULT_PER_PAGE, ApiError } from "@/types/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { dash, pick } from "@/lib/display";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  MyWorkCategoryKey,
  { icon: React.ReactNode; empty: string }
> = {
  wo_approvals: { icon: <BadgeCheck className="h-4 w-4" />, empty: "Tidak ada WO yang menunggu persetujuan Anda." },
  wo_closings: { icon: <Check className="h-4 w-4" />, empty: "Tidak ada WO yang menunggu ditutup." },
  materials: { icon: <Package className="h-4 w-4" />, empty: "Tidak ada request part yang menunggu." },
  wo_todo: { icon: <ListTodo className="h-4 w-4" />, empty: "Tidak ada WO yang belum Anda kerjakan." },
  stock_opname_unlocked: { icon: <Lock className="h-4 w-4" />, empty: "Semua Stock Opname sudah dikunci." },
};

/** WO module_key (`wo_mtc`, dst — Approval Center & Material Request) -> segmen route detail WO. */
const APPROVAL_MODULE_TO_ROUTE: Record<string, string> = {
  wo_mtc: "meso",
  wo_operational: "maintenance",
  wo_it: "is",
  wo_preventive: "production",
  wo_ga: "ga",
};

function moduleRouteOf(categoryKey: MyWorkCategoryKey, item: MyWorkItem): string {
  if (categoryKey === "wo_todo") return String(item.module ?? "");
  return APPROVAL_MODULE_TO_ROUTE[String(item.module_key ?? "")] ?? "";
}

function itemKey(categoryKey: MyWorkCategoryKey, item: MyWorkItem, i: number): string {
  if (categoryKey === "stock_opname_unlocked") return String(item.no_so ?? i);
  if (categoryKey === "materials") return String(item.request_code ?? i);
  return `${item.wo_number ?? i}`;
}

function itemTitle(categoryKey: MyWorkCategoryKey, item: MyWorkItem): string {
  if (categoryKey === "stock_opname_unlocked") return String(item.no_so ?? "-");
  return String(item.wo_number ?? "-");
}

function itemSubtitle(categoryKey: MyWorkCategoryKey, item: MyWorkItem): string {
  if (categoryKey === "stock_opname_unlocked") {
    return [item.type, formatDate(item.tanggal)].filter(Boolean).join(" · ");
  }
  if (categoryKey === "materials") {
    return [dash(pick(item, ["job_title"])), item.requested_by_name ? `diminta ${item.requested_by_name}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return [dash(pick(item, ["job_title"])), item.asset_name].filter(Boolean).join(" · ");
}

const DEFAULTS = { tab: "wo_approvals" as string, q: "", page: 1, per_page: DEFAULT_PER_PAGE };

export default function MyWorkPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const tab = values.tab as MyWorkCategoryKey;

  const summary = useMyWorkSummary();
  const categories = summary.data?.data?.categories ?? [];
  const total = summary.data?.data?.total ?? 0;

  const list = useMyWorkList(tab, { q: values.q || undefined, page: values.page, per_page: values.per_page });
  const rows = list.data?.data ?? [];

  const [selected, setSelected] = useState<MyWorkItem | null>(null);
  useEffect(() => setSelected(null), [tab]);

  const selectedModuleRoute = selected ? moduleRouteOf(tab, selected) : "";
  const isWoTab = tab === "wo_approvals" || tab === "wo_closings" || tab === "wo_todo";
  const detailQ = useWorkOrderDetail(
    isWoTab ? String(selected?.wo_number ?? "") : "",
    selectedModuleRoute,
  );
  const detail = (detailQ.data?.data ?? {}) as Record<string, unknown>;
  const detailHeader = detail.header && typeof detail.header === "object" ? (detail.header as Record<string, unknown>) : {};
  const detailValue = (keys: string[]) => pick(detail, keys) || pick(detailHeader, keys) || pick(selected ?? {}, keys);

  const decision = useWorkOrderDecision();

  const woHref = selected && selectedModuleRoute
    ? `/work-orders/${encodeURIComponent(selectedModuleRoute)}/${String(selected.wo_number ?? "")
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/")}`
    : "";

  const runDecision = (action: WoDecision) => {
    if (!selected) return;
    const label = action === "approve" ? "Setujui" : action === "close" ? "Tutup WO" : action === "reject" ? "Tolak" : "Void";
    confirm.ask({
      title: `${label}?`,
      description: (
        <>
          {label} untuk <b>{selected.wo_number}</b>
          {selected.job_title ? ` — ${selected.job_title}` : ""}.
        </>
      ),
      tone: action === "reject" || action === "void" ? "danger" : "primary",
      confirmLabel: label,
      onConfirm: async () => {
        try {
          await decision.mutateAsync({
            decision: action,
            module: String(selected.module_key ?? ""),
            wo_number: String(selected.wo_number ?? ""),
          });
          toast.success(`${label} berhasil`);
          confirm.close();
          setSelected(null);
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const externalHref = useMemo(() => {
    if (!selected) return "";
    if (tab === "materials") return `/material-usage?q=${encodeURIComponent(String(selected.wo_number ?? ""))}`;
    if (tab === "stock_opname_unlocked") return `/reports/stock-opname?q=${encodeURIComponent(String(selected.no_so ?? ""))}`;
    return woHref;
  }, [selected, tab, woHref]);

  return (
    <PageContainer
      title="My Work"
      description="Daftar pekerjaan yang perlu perhatian Anda — berbeda untuk tiap user sesuai hak akses."
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {(categories.length ? categories : (Object.keys(CATEGORY_META) as MyWorkCategoryKey[]).map((key) => ({ key, label: key, count: 0, items: [] }))).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setValues({ tab: c.key, q: "" }, { resetPage: true })}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition",
              tab === c.key ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50",
            )}
          >
            <span className={cn("grid h-7 w-7 place-items-center rounded-md", c.count > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400")}>
              {CATEGORY_META[c.key as MyWorkCategoryKey]?.icon}
            </span>
            <span className="text-lg font-bold text-slate-900">{summary.isLoading ? "…" : formatNumber(c.count)}</span>
            <span className="text-xs font-medium leading-tight text-slate-500">{c.label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        {summary.isLoading ? "Memuat ringkasan…" : `${formatNumber(total)} total pekerjaan tertunda di seluruh kategori.`}
      </p>

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari No. WO, No. SO, atau deskripsi…"
        onRefresh={() => list.refetch()}
        isFetching={list.isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {list.isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Tidak ada pekerjaan" description={CATEGORY_META[tab]?.empty} />
          ) : (
            <div className="card divide-y divide-slate-100 p-0">
              {rows.map((item, i) => {
                const key = itemKey(tab, item, i);
                const active = selected && itemKey(tab, selected, 0) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50",
                      active ? "bg-brand-50" : "",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{itemTitle(tab, item)}</p>
                      <p className="truncate text-xs text-slate-500">{itemSubtitle(tab, item)}</p>
                    </div>
                    {item.status ? <StatusBadge status={String(item.status)} /> : null}
                  </button>
                );
              })}
            </div>
          )}
          {rows.length > 0 ? (
            <div className="card mt-3">
              <Pagination
                meta={list.data?.meta}
                page={values.page}
                perPage={values.per_page}
                onPageChange={(page) => setValues({ page })}
                onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
              />
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <div className="card sticky top-4 p-5">
            {!selected ? (
              <p className="py-10 text-center text-sm text-slate-400">Pilih salah satu pekerjaan di daftar untuk lihat detailnya.</p>
            ) : isWoTab ? (
              detailQ.isLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat detail work order…
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{itemTitle(tab, selected)}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{detailValue(["job_title", "title"]) || "-"}</p>
                  </div>
                  <DescriptionList
                    columns={1}
                    items={[
                      { label: "Modul", value: detailValue(["module_label"]) || "-" },
                      { label: "Aset", value: [detailValue(["asset_code", "AssetCode"]), detailValue(["asset_name", "AssetName"])].filter(Boolean).join(" — ") || "-" },
                      { label: "Company", value: detailValue(["company"]) || "-" },
                      { label: "Executor", value: detailValue(["executor", "job_executor"]) || "-" },
                      { label: "Dibuat", value: formatDateTime(detailValue(["created_at", "date"])) },
                      { label: "Status", value: <StatusBadge status={detailValue(["status"])} /> },
                    ]}
                  />
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {tab === "wo_approvals" ? (
                      <>
                        <Button onClick={() => runDecision("approve")} loading={decision.isPending}>
                          <Check className="h-4 w-4" /> Setujui
                        </Button>
                        <Button variant="danger" onClick={() => runDecision("reject")} loading={decision.isPending}>
                          <X className="h-4 w-4" /> Tolak
                        </Button>
                      </>
                    ) : tab === "wo_closings" ? (
                      <Button onClick={() => runDecision("close")} loading={decision.isPending}>
                        <Check className="h-4 w-4" /> Tutup WO
                      </Button>
                    ) : null}
                    {woHref ? (
                      <Button variant="secondary" onClick={() => window.open(woHref, "_self")}>
                        <ExternalLink className="h-4 w-4" /> Buka Detail WO
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-slate-900">{itemTitle(tab, selected)}</p>
                <DescriptionList
                  columns={1}
                  items={
                    tab === "materials"
                      ? [
                          { label: "No. WO", value: dash(selected.wo_number) },
                          { label: "Deskripsi", value: dash(pick(selected, ["job_title"])) },
                          { label: "Diminta oleh", value: dash(selected.requested_by_name) },
                          { label: "Status", value: <StatusBadge status={String(selected.status ?? "")} /> },
                        ]
                      : [
                          { label: "No. SO", value: dash(selected.no_so) },
                          { label: "Tipe", value: dash(selected.type) },
                          { label: "Tanggal", value: formatDate(selected.tanggal) },
                        ]
                  }
                />
                {externalHref ? (
                  <div className="border-t border-slate-100 pt-4">
                    <Button variant="secondary" onClick={() => window.open(externalHref, "_self")}>
                      <ExternalLink className="h-4 w-4" />
                      {tab === "materials" ? "Buka Material Usage" : "Buka Report Stock Opname"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)} loading={decision.isPending} />
    </PageContainer>
  );
}
