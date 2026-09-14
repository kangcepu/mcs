"use client";

import { useState } from "react";
import { BadgeCheck, Check, Eye, Loader2, X } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Tabs } from "@/components/ui/tabs";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";
import { DescriptionList } from "@/components/ui/detail";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useApprovalList,
  useApprovalSummary,
  useMutationDecision,
  useWorkOrderDecision,
} from "@/hooks/use-approval-center";
import { useWorkOrderDetail } from "@/hooks/use-work-orders";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE, ApiError } from "@/types/api";
import { APPROVAL_TABS, type ApprovalItem, type ApprovalTabKey } from "@/types/approval";
import type { WoDecision } from "@/lib/api/approval-center";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { dash, pick } from "@/lib/display";

const DEFAULTS = { tab: "wo_approvals", q: "", page: 1, per_page: DEFAULT_PER_PAGE };

interface ActionDef {
  key: string;
  label: string;
  tone: "primary" | "danger";
  icon: React.ReactNode;
}

const APPROVE: ActionDef = { key: "approve", label: "Setujui", tone: "primary", icon: <Check className="h-4 w-4" /> };
const REJECT: ActionDef = { key: "reject", label: "Tolak", tone: "danger", icon: <X className="h-4 w-4" /> };
const CLOSE: ActionDef = { key: "close", label: "Tutup WO", tone: "primary", icon: <Check className="h-4 w-4" /> };

const TAB_ACTIONS: Record<ApprovalTabKey, ActionDef[]> = {
  wo_approvals: [APPROVE, REJECT],
  wo_closings: [CLOSE, REJECT],
  materials: [], // hanya lihat — keputusan di modul Material Usage
  mutations: [APPROVE, REJECT],
};

const WO_MODULE_FILTERS = [
  { value: "", label: "Semua WO" },
  { value: "wo_mtc", label: "WO MESO" },
  { value: "wo_operational", label: "WO MTC" },
  { value: "wo_it", label: "WO IS" },
  { value: "wo_preventive", label: "WO Production" },
  { value: "wo_ga", label: "WO GA" },
] as const;

const APPROVAL_TO_DETAIL_MODULE: Record<string, string> = {
  wo_mtc: "meso",
  wo_operational: "maintenance",
  wo_it: "is",
  wo_preventive: "production",
  wo_ga: "ga",
};

function docNoOf(item: ApprovalItem): string {
  return String(
    pick(item, ["doc_no", "document_no", "ref", "no_doc", "docno"]) || item.id || "",
  );
}

export default function ApprovalCenterPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const tab = values.tab as ApprovalTabKey;
  const [woModule, setWoModule] = useState<string>("");
  const isWoQueue = tab === "wo_approvals" || tab === "wo_closings";

  const summary = useApprovalSummary();
  const list = useApprovalList(tab, {
    q: values.q || undefined,
    module: isWoQueue ? woModule || undefined : undefined,
    page: values.page,
    per_page: values.per_page,
  });
  const woDecision = useWorkOrderDecision();
  const mutationDecision = useMutationDecision();
  const pending = woDecision.isPending || mutationDecision.isPending;

  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const selectedWoNumber =
    selected && isWoQueue ? String(pick(selected, ["wo_number"])) : "";
  const selectedWoModule = selected
    ? APPROVAL_TO_DETAIL_MODULE[String(selected.module_key ?? "")] ?? ""
    : "";
  const detailQ = useWorkOrderDetail(selectedWoNumber, selectedWoModule);
  const detail = (detailQ.data?.data ?? {}) as Record<string, unknown>;
  const detailHeader =
    detail.header && typeof detail.header === "object"
      ? (detail.header as Record<string, unknown>)
      : {};
  const detailValue = (keys: string[], selectedKeys = keys) =>
    pick(detail, keys) || pick(detailHeader, keys) || pick(selected, selectedKeys);
  const detailAssetName = detailValue(["asset_name", "AssetName"], ["asset_name"]);
  const detailAssetCode = detailValue(["asset_code", "AssetCode"], ["asset_code"]);
  const detailAsset = [detailAssetCode, detailAssetName].filter(Boolean).join(" — ") || "-";

  const rows = list.data?.data ?? [];
  const s = summary.data?.data;
  const globalCanDecide = s?.can_decide !== false;

  const summaryCards = [
    { key: "wo_approvals", label: "WO Approval", value: s?.wo_approvals },
    { key: "wo_closings", label: "WO Closing", value: s?.wo_closings },
    { key: "materials", label: "Material Request", value: s?.materials },
    { key: "mutations", label: "Asset Mutation", value: s?.mutations },
  ];

  const canDecideItem = (item: ApprovalItem) =>
    globalCanDecide && item.can_decide !== false && TAB_ACTIONS[tab].length > 0;

  const runAction = (item: ApprovalItem, action: ActionDef) => {
    const ref = pick(item, ["wo_number", "ref"]) || docNoOf(item);
    confirm.ask({
      title: `${action.label}?`,
      description: (
        <>
          {action.label} untuk <b>{ref}</b>
          {pick(item, ["job_title", "title"]) ? ` — ${pick(item, ["job_title", "title"])}` : ""}.
        </>
      ),
      tone: action.tone,
      confirmLabel: action.label,
      onConfirm: async () => {
        try {
          if (tab === "mutations") {
            await mutationDecision.mutateAsync({
              decision: action.key === "reject" ? "reject" : "approve",
              doc_no: docNoOf(item),
            });
          } else {
            const decision: WoDecision =
              action.key === "close"
                ? "close"
                : action.key === "reject"
                  ? "reject"
                  : "approve";
            await woDecision.mutateAsync({
              decision,
              module: String(pick(item, ["module_key", "module"]) || "wo_mtc"),
              wo_number: String(item.wo_number ?? ""),
            });
          }
          toast.success(`${action.label} berhasil`);
          confirm.close();
          setSelected(null);
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const columns: Column<ApprovalItem>[] = [
    {
      key: "ref",
      header: "Referensi",
      cell: (r) => (
        <span className="font-medium text-brand-700">
          {pick(r, ["wo_number", "ref"]) || docNoOf(r) || "-"}
        </span>
      ),
    },
    {
      key: "title",
      header: "Deskripsi",
      cell: (r) => (
        <div className="max-w-[280px]">
          <p className="truncate text-slate-800">
            {pick(r, ["job_title", "title"]) || "-"}
          </p>
          <p className="truncate text-xs text-slate-400">
            {[pick(r, ["module_label"]), pick(r, ["asset_name", "asset_code"])]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
    },
    { key: "company", header: "Company", cell: (r) => dash(pick(r, ["company"])) },
    {
      key: "date",
      header: "Tanggal",
      cell: (r) => formatDate(pick(r, ["date", "requested_at"])),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(r);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canDecideItem(r)
            ? TAB_ACTIONS[tab].map((a) => (
                <Button
                  key={a.key}
                  variant={a.tone === "danger" ? "danger" : "primary"}
                  className="h-8 px-2.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    runAction(r, a);
                  }}
                >
                  {a.icon}
                  {a.label}
                </Button>
              ))
            : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Approval Center"
      description="Pusat persetujuan work order, closing, material, dan mutasi aset."
    >
      {!globalCanDecide ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Akun management hanya dapat melihat daftar approval, tidak dapat memutuskan.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <button
            key={c.key}
            onClick={() => setValues({ tab: c.key }, { resetPage: true })}
            className={`card flex items-center gap-3 p-4 text-left transition hover:shadow-md ${
              tab === c.key ? "ring-2 ring-brand-200" : ""
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <BadgeCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="text-lg font-bold text-slate-900">
                {summary.isLoading ? "…" : formatNumber((c.value as number) ?? 0)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Tabs
        items={APPROVAL_TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={(key) => setValues({ tab: key }, { resetPage: true })}
      />

      {isWoQueue ? (
        <div className="flex flex-wrap gap-2" aria-label="Filter modul work order">
          {WO_MODULE_FILTERS.map((item) => (
            <button
              key={item.value || "all"}
              type="button"
              onClick={() => {
                setWoModule(item.value);
                setValues({ page: 1 });
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                woModule === item.value
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50"
              }`}
              aria-pressed={woModule === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari referensi / deskripsi…"
        onRefresh={() => list.refetch()}
        isFetching={list.isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      />

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => (r.wo_number as string) ?? docNoOf(r) ?? i}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(r) => setSelected(r)}
        emptyTitle="Tidak ada antrian"
        emptyDescription={
          woModule
            ? `Tidak ada antrian pada ${WO_MODULE_FILTERS.find((item) => item.value === woModule)?.label ?? "modul ini"}.`
            : "Semua item pada kategori ini sudah diproses."
        }
      />

      {rows.length > 0 ? (
        <div className="card">
          <Pagination
            meta={list.data?.meta}
            page={values.page}
            perPage={values.per_page}
            onPageChange={(page) => setValues({ page })}
            onPerPageChange={(per_page) => setValues({ per_page }, { resetPage: true })}
          />
        </div>
      ) : null}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          selected
            ? pick(selected, ["wo_number", "ref"]) || docNoOf(selected) || "Detail"
            : ""
        }
        description={selected ? pick(selected, ["job_title", "title"]) : ""}
        footer={
          selected && canDecideItem(selected)
            ? TAB_ACTIONS[tab].map((a) => (
                <Button
                  key={a.key}
                  variant={a.tone === "danger" ? "danger" : "primary"}
                  onClick={() => runAction(selected, a)}
                >
                  {a.icon}
                  {a.label}
                </Button>
              ))
            : null
        }
      >
        {selected ? (
          isWoQueue ? (
            detailQ.isLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat detail work order…
              </div>
            ) : detailQ.error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Detail lengkap belum dapat dimuat. Informasi ringkas tetap tersedia di bawah.
              </div>
            ) : (
              <div className="space-y-5">
                <section className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Tujuan pekerjaan</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {detailValue(["title", "job_title"], ["job_title", "title"]) || "-"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {detailValue(["job_requirement", "description", "keterangan"], ["note"]) || "Belum ada requirement tambahan."}
                  </p>
                </section>

                <DescriptionList
                  columns={1}
                  items={[
                    { label: "Referensi", value: detailValue(["wo_number"], ["wo_number", "ref"]) || docNoOf(selected) },
                    { label: "Modul", value: detailValue(["module_label"], ["module_label", "module_key"]) || "-" },
                    { label: "Pemohon / dibuat oleh", value: detailValue(["requested_by", "creator", "requester", "created_by"]) || "-" },
                    { label: "Aset", value: detailAsset },
                    { label: "Company", value: detailValue(["company", "company_name"], ["company"]) || "-" },
                    { label: "Executor", value: detailValue(["executor", "job_executor"]) || "-" },
                    { label: "PIC", value: detailValue(["pic"]) || "-" },
                    { label: "Tipe WO", value: detailValue(["type_wo"]) || "-" },
                    { label: "Prioritas", value: detailValue(["priority"]) || "-" },
                    { label: "Shift", value: detailValue(["shift"]) || "-" },
                    { label: "Dibuat", value: formatDateTime(detailValue(["created_at", "date"], ["requested_at", "date"])) },
                    { label: "Jadwal kerja", value: formatDateTime(detailValue(["scheduled_at", "date"], ["date"])) },
                    { label: "Status", value: <StatusBadge status={detailValue(["status"], ["status"])} /> },
                  ]}
                />
              </div>
            )
          ) : (
            <DescriptionList
              columns={1}
              items={[
                { label: "Referensi", value: pick(selected, ["wo_number", "ref"]) || docNoOf(selected) },
                { label: "Deskripsi", value: dash(pick(selected, ["job_title", "title"])) },
                { label: "Status", value: <StatusBadge status={selected.status} /> },
              ]}
            />
          )
        ) : null}
      </Drawer>

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={pending}
      />
    </PageContainer>
  );
}
