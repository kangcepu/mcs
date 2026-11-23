"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Unlock,
  UserX,
  Users as UsersIcon,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { AccessDenied } from "@/components/layout/access-denied";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { UserForm } from "@/components/master-data/user-form";
import {
  useMasterList,
  useMasterMutations,
  useMasterOptions,
  useResetUserPassword,
} from "@/hooks/use-master";
import { useMe } from "@/hooks/use-auth";
import { canRead, canWrite } from "@/lib/permissions";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE, ApiError } from "@/types/api";
import { listMaster } from "@/lib/api/master";
import { formatNumber, initials } from "@/lib/format";
import { dash, pick } from "@/lib/display";
import { cn } from "@/lib/utils";

const DEFAULTS = {
  q: "",
  active: "",
  permission_group_id: "",
  id_company: "",
  page: 1,
  per_page: DEFAULT_PER_PAGE,
};

/** Tiap request hanya boleh ambil maks 100 baris (batas server) — dipaginasi
 * sendiri di sini sampai `total_pages`, dibatasi 20 halaman (2000 user) biar
 * aman kalau suatu saat datanya jadi sangat besar. */
const STATS_PAGE_SIZE = 100;
const STATS_MAX_PAGES = 20;

function useAllUsersForStats() {
  return useQuery({
    queryKey: ["master-users-stats"],
    queryFn: async ({ signal }) => {
      const first = await listMaster<Record<string, unknown>>(
        "users",
        { page: 1, per_page: STATS_PAGE_SIZE },
        signal,
      );
      const totalPages = Math.min(first.meta?.total_pages ?? 1, STATS_MAX_PAGES);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
          listMaster<Record<string, unknown>>(
            "users",
            { page: i + 2, per_page: STATS_PAGE_SIZE },
            signal,
          ),
        ),
      );
      return {
        total: first.meta?.total ?? first.data.length,
        rows: [first, ...rest].flatMap((r) => r.data ?? []),
      };
    },
    staleTime: 60_000,
  });
}

function isActiveRow(row: Record<string, unknown>): boolean {
  const v = row.active ?? row.is_active;
  return v === true || v === 1 || v === "1";
}

const BADGE_TONES = [
  "bg-brand-50 text-brand-700 ring-brand-600/20",
  "bg-violet-50 text-violet-700 ring-violet-600/20",
  "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "bg-amber-50 text-amber-800 ring-amber-600/20",
  "bg-rose-50 text-rose-700 ring-rose-600/20",
  "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
];
const AVATAR_TONES = [
  "bg-brand-100 text-brand-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
];
function toneFor(seed: string, palette: string[]): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  badge,
  sub,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  badge?: string;
  sub: string;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg", iconClass)}>
          {icon}
        </span>
        {badge ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {badge}
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-lg font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

export default function MasterUsersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);

  const allowRead = canRead(me, "masterUser");
  const allowWrite = canWrite(me, "masterUser");

  const list = useMasterList<Record<string, unknown>>("users", values);
  const { create, update } = useMasterMutations("users");
  const resetPassword = useResetUserPassword();
  const options = useMasterOptions();
  const stats = useAllUsersForStats();

  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: Record<string, unknown> } | null>(
    null,
  );

  const rows = list.data?.data ?? [];

  const statSummary = useMemo(() => {
    const srows = stats.data?.rows ?? [];
    const total = stats.data?.total ?? srows.length;
    const activeCount = srows.filter(isActiveRow).length;
    const inactiveCount = srows.length - activeCount;
    const activePct = srows.length ? Math.round((activeCount / srows.length) * 100) : 0;
    // NIK (username dari Employee API) selalu digit semua — username non-digit
    // berarti akun dibuat manual, belum tertaut NIK pegawai.
    const noNikCount = srows.filter((r) => {
      const username = String(pick(r, ["username"]) || "").trim();
      return username !== "" && !/^\d+$/.test(username);
    }).length;

    const roleCounts = new Map<string, number>();
    const companyCounts = new Map<string, number>();
    for (const r of srows) {
      const role = String(pick(r, ["permission_group_name"]) || "Tanpa Role");
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      const company = String(pick(r, ["company_name"]) || "Tanpa Company");
      companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
    }
    const topEntry = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
    // "Tanpa Role" biasanya jadi grup terbesar (akun belum di-assign role) —
    // itu fakta data quality, bukan jawaban berguna untuk "role terbanyak".
    // Jadi "role terbanyak" cuma dihitung dari yang BENERAN punya role,
    // dan jumlah yang belum punya role ditampilkan terpisah sebagai insight.
    const assignedRoleCounts = new Map(roleCounts);
    const noRoleCount = assignedRoleCounts.get("Tanpa Role") ?? 0;
    assignedRoleCounts.delete("Tanpa Role");
    const [topRole, topRoleCount] = topEntry(assignedRoleCounts);
    const [topCompany, topCompanyCount] = topEntry(companyCounts);

    return {
      total,
      activeCount,
      inactiveCount,
      activePct,
      noNikCount,
      topRole,
      topRoleCount,
      noRoleCount,
      roleLevels: assignedRoleCounts.size,
      topCompany,
      topCompanyCount,
      companyCount: companyCounts.size,
    };
  }, [stats.data]);

  const roleOptions = (options.data?.data?.permission_groups ?? []).map((g) => ({
    value: g.value,
    label: g.label,
  }));
  const companyOptions = (options.data?.data?.companies ?? []).map((c) => ({
    value: c.value,
    label: c.label,
  }));

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "profile",
      header: "User / Profil",
      cell: (row) => {
        const fullname = String(pick(row, ["fullname", "full_name", "name"]) || "-");
        const username = String(pick(row, ["username"]) || "");
        return (
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold",
                toneFor(fullname || username, AVATAR_TONES),
              )}
            >
              {initials(fullname || username)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{fullname}</p>
              <p className="truncate text-xs text-slate-400">@{username || "-"}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => <span className="text-sm text-slate-600">{dash(pick(row, ["email"]))}</span>,
    },
    {
      key: "role",
      header: "Role & Wewenang",
      cell: (row) => {
        const role = pick(row, ["permission_group_name"]);
        if (!role) return <span className="text-sm text-slate-400">Tanpa Role</span>;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
              toneFor(String(role), BADGE_TONES),
            )}
          >
            {String(role)}
          </span>
        );
      },
    },
    {
      key: "org",
      header: "Company / Divisi",
      cell: (row) => {
        const company = pick(row, ["company_name"]);
        const division = pick(row, ["division_name"]);
        return (
          <div>
            <p className="text-sm text-slate-700">{dash(company)}</p>
            <p className="text-xs text-slate-400">{dash(division)}</p>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={isActiveRow(row) ? "active" : "inactive"} />
      ),
    },
  ];

  if (allowWrite) {
    columns.push({
      key: "_actions",
      header: "",
      align: "right",
      cell: (row) => {
        const active = isActiveRow(row);
        const id = row.id_user as string | number;
        const fullname = String(pick(row, ["fullname", "full_name", "name"]) || "user ini");
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              className="h-8 px-2"
              aria-label="Edit user"
              onClick={() => setModal({ mode: "edit", row })}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-2 text-amber-600 hover:bg-amber-50"
              aria-label="Reset password"
              onClick={() =>
                confirm.ask({
                  title: "Reset password?",
                  description: (
                    <>
                      Password <b>{fullname}</b> akan dikosongkan dan wajib diganti saat login
                      berikutnya.
                    </>
                  ),
                  tone: "danger",
                  confirmLabel: "Reset Password",
                  onConfirm: async () => {
                    try {
                      await resetPassword.mutateAsync(id);
                      toast.success("Password berhasil di-reset");
                      confirm.close();
                    } catch (e) {
                      toast.error("Gagal reset password", e instanceof ApiError ? e.message : undefined);
                    }
                  },
                })
              }
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "h-8 px-2",
                active ? "text-rose-500 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50",
              )}
              aria-label={active ? "Nonaktifkan user" : "Aktifkan user"}
              onClick={() =>
                confirm.ask({
                  title: active ? "Nonaktifkan user?" : "Aktifkan user?",
                  description: active ? (
                    <>
                      <b>{fullname}</b> tidak dapat login, tetapi data dan History tetap
                      tersimpan.
                    </>
                  ) : (
                    <>
                      <b>{fullname}</b> akan bisa login kembali.
                    </>
                  ),
                  tone: active ? "danger" : "primary",
                  confirmLabel: active ? "Nonaktifkan" : "Aktifkan",
                  onConfirm: async () => {
                    try {
                      await update.mutateAsync({ id, body: { active: active ? 0 : 1 } });
                      toast.success(active ? "User dinonaktifkan" : "User diaktifkan");
                      confirm.close();
                    } catch (e) {
                      toast.error("Gagal mengubah status", e instanceof ApiError ? e.message : undefined);
                    }
                  },
                })
              }
            >
              {active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </Button>
          </div>
        );
      },
    });
  }

  if (!allowRead) {
    return (
      <PageContainer title="Users">
        <AccessDenied />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Users"
      description="Kelola akun pengguna, role, dan status aktif. Password di-hash di server dan tidak pernah ditampilkan."
      actions={
        allowWrite ? (
          <Button onClick={() => setModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<UsersIcon className="h-5 w-5" />}
          iconClass="bg-brand-50 text-brand-600"
          label="Total Users"
          value={stats.isLoading ? "…" : formatNumber(statSummary.total)}
          badge={stats.isLoading ? undefined : `${statSummary.activePct}% Aktif`}
          sub={stats.isLoading ? "Memuat…" : `${formatNumber(statSummary.noNikCount)} user belum pakai NIK`}
        />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          iconClass="bg-violet-50 text-violet-600"
          label="Role Terbanyak"
          value={stats.isLoading ? "…" : statSummary.topRole}
          sub={stats.isLoading ? "Memuat…" : `${formatNumber(statSummary.topRoleCount)} User · ${formatNumber(statSummary.noRoleCount)} belum punya role`}
        />
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Company Terbanyak"
          value={stats.isLoading ? "…" : statSummary.topCompany}
          sub={stats.isLoading ? "Memuat…" : `${formatNumber(statSummary.topCompanyCount)} User · ${statSummary.companyCount} company`}
        />
        <StatCard
          icon={<UserX className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
          label="Perlu Perhatian"
          value={stats.isLoading ? "…" : formatNumber(statSummary.inactiveCount)}
          sub="Akun nonaktif, tidak dapat login"
        />
      </div>

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder="Cari nama, username, email…"
        onRefresh={() => {
          list.refetch();
          stats.refetch();
        }}
        isFetching={list.isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterSelect
          value={String(values.permission_group_id)}
          onChange={(v) => setValues({ permission_group_id: v }, { resetPage: true })}
          placeholder="Semua Role"
          options={roleOptions}
        />
        <FilterSelect
          value={String(values.active)}
          onChange={(active) => setValues({ active }, { resetPage: true })}
          placeholder="Semua Status"
          options={[
            { value: "1", label: "Aktif" },
            { value: "0", label: "Nonaktif" },
          ]}
        />
        <FilterSelect
          value={String(values.id_company)}
          onChange={(v) => setValues({ id_company: v }, { resetPage: true })}
          placeholder="Semua Company"
          options={companyOptions}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => (r.id_user as string | number) ?? i}
        isLoading={list.isLoading}
        isFetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle="Belum ada user"
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

      {modal ? (
        <UserForm
          key={modal.mode + String(modal.row?.id_user ?? "new")}
          mode={modal.mode}
          row={modal.row}
          idKey="id_user"
          onClose={() => setModal(null)}
          onCreate={create.mutateAsync}
          onUpdate={update.mutateAsync}
          saving={create.isPending || update.isPending}
        />
      ) : null}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={resetPassword.isPending || update.isPending}
      />
    </PageContainer>
  );
}
