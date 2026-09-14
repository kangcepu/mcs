"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Info, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, Field, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AccessDenied } from "@/components/layout/access-denied";
import { useMasterList, useMasterMutations } from "@/hooks/use-master";
import { useMe } from "@/hooks/use-auth";
import { canRead, canWrite, type AreaKey } from "@/lib/permissions";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEFAULT_PER_PAGE } from "@/types/api";
import { ApiError } from "@/types/api";
import type { MasterResource } from "@/types/master";
import { dash } from "@/lib/display";

export interface MasterFieldDef {
  name: string;
  label: string;
  type?: "text" | "checkbox";
  required?: boolean;
  /** Tampilkan di tabel. */
  inTable?: boolean;
  /** Kandidat key fallback saat membaca nilai dari row. */
  aliases?: string[];
  /** Boleh diedit (mis. code sering read-only saat edit). */
  editable?: boolean;
  /** Render sel tabel kustom (mengabaikan `type`). */
  render?: (row: Record<string, unknown>) => React.ReactNode;
  /** Field hanya untuk tabel, tidak dimunculkan di form bawaan. */
  tableOnly?: boolean;
}

/** Props untuk form kustom (mis. User / Permission Group). */
export interface MasterFormProps {
  mode: "create" | "edit";
  row?: Record<string, unknown>;
  idKey: string;
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (vars: {
    id: string | number;
    body: Record<string, unknown>;
  }) => Promise<unknown>;
  saving: boolean;
}

// `active` dikirim kosong untuk resource selain user dan diabaikan backend.
// Menyimpannya di default membuat filter status User tetap tersinkron ke URL.
const DEFAULTS = { q: "", active: "", page: 1, per_page: DEFAULT_PER_PAGE };

function readValue(row: Record<string, unknown>, field: MasterFieldDef): unknown {
  for (const key of [field.name, ...(field.aliases ?? [])]) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function MasterDataView({
  resource,
  title,
  description,
  area,
  fields,
  canCreate,
  canDelete = true,
  writeAvailable = true,
  activeStatusFilter = false,
  deactivateAction = false,
  idKey = "id",
  FormComponent,
}: {
  resource: MasterResource;
  title: string;
  description?: string;
  area: AreaKey;
  fields: MasterFieldDef[];
  canCreate: boolean;
  canDelete?: boolean;
  writeAvailable?: boolean;
  /** Tampilkan filter Aktif/Nonaktif; hanya dipakai oleh resource Users. */
  activeStatusFilter?: boolean;
  /** Ganti hapus permanen dengan mengubah status akun menjadi nonaktif. */
  deactivateAction?: boolean;
  idKey?: string;
  /** Ganti form bawaan dengan komponen kustom. */
  FormComponent?: React.ComponentType<MasterFormProps>;
}) {
  const toast = useToast();
  const { data: user, isLoading: userLoading } = useMe();
  const { values, setValues, reset, hasActiveFilters } = useQueryParams(DEFAULTS);
  const list = useMasterList(resource, values);
  const { create, update, remove } = useMasterMutations(resource);
  const confirm = useConfirm();

  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: Record<string, unknown> } | null>(
    null,
  );

  const allowRead = canRead(user, area);
  const allowWrite = writeAvailable && canWrite(user, area);

  const rows = (list.data?.data ?? []) as Array<Record<string, unknown>>;

  const columns: Column<Record<string, unknown>>[] = [
    ...fields
      .filter((f) => f.inTable !== false)
      .map<Column<Record<string, unknown>>>((f) => ({
        key: f.name,
        header: f.label,
        cell: (row) =>
          f.render ? (
            f.render(row)
          ) : f.type === "checkbox" ? (
            <StatusBadge
              status={readValue(row, f) ? "active" : "inactive"}
              tone={readValue(row, f) ? "green" : "slate"}
            />
          ) : (
            dash(readValue(row, f))
          ),
      })),
  ];

  if (allowWrite) {
    columns.push({
      key: "_actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() => setModal({ mode: "edit", row })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {deactivateAction && (row.active === true || row.active === 1 || row.active === "1" || row.is_active === true || row.is_active === 1 || row.is_active === "1") ? (
            <Button
              variant="ghost"
              className="h-8 px-2 text-amber-600 hover:bg-amber-50"
              aria-label="Nonaktifkan user"
              onClick={() =>
                confirm.ask({
                  title: "Nonaktifkan user?",
                  description: "User tidak dapat login, tetapi data dan riwayatnya tetap tersimpan.",
                  tone: "danger",
                  confirmLabel: "Nonaktifkan",
                  onConfirm: async () => {
                    try {
                      await update.mutateAsync({ id: row[idKey] as string | number, body: { active: 0 } });
                      toast.success("User berhasil dinonaktifkan");
                      confirm.close();
                    } catch (e) {
                      toast.error("Gagal menonaktifkan user", e instanceof ApiError ? e.message : undefined);
                    }
                  },
                })
              }
            >
              <UserX className="h-4 w-4" />
            </Button>
          ) : canDelete ? (
            <Button
              variant="ghost"
              className="h-8 px-2 text-rose-500 hover:bg-rose-50"
              onClick={() =>
                confirm.ask({
                  title: `Delete this ${title.toLowerCase()}?`,
                  description: "This data will be permanently deleted.",
                  tone: "danger",
                  confirmLabel: "Delete",
                  onConfirm: async () => {
                    try {
                      await remove.mutateAsync(row[idKey] as string | number);
                      toast.success("Data deleted");
                      confirm.close();
                    } catch (e) {
                      toast.error("Failed", e instanceof ApiError ? e.message : undefined);
                    }
                  },
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ),
    });
  }

  if (!userLoading && !allowRead) {
    return (
      <PageContainer title={title}>
        <AccessDenied />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={title}
      description={description}
      actions={
        allowWrite && canCreate ? (
          <Button onClick={() => setModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        ) : null
      }
    >
      {!writeAvailable ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Write API for this resource is not available yet. This page is read-only
            (list &amp; detail).
          </span>
        </div>
      ) : null}

      <FilterBar
        search={values.q}
        onSearchChange={(q) => setValues({ q }, { resetPage: true })}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
        onRefresh={() => list.refetch()}
        isFetching={list.isFetching}
        onReset={reset}
        hasActiveFilters={hasActiveFilters}
      >
        {activeStatusFilter ? (
          <FilterSelect
            value={values.active}
            onChange={(active) => setValues({ active }, { resetPage: true })}
            placeholder="Semua status"
            options={[
              { value: "1", label: "Aktif" },
              { value: "0", label: "Nonaktif" },
            ]}
          />
        ) : null}
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r, i) => (r[idKey] as string | number) ?? i}
        isLoading={list.isLoading}
        isFetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle={`No ${title.toLowerCase()} yet`}
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
        FormComponent ? (
          <FormComponent
            key={modal.mode + String(modal.row?.[idKey] ?? "new")}
            mode={modal.mode}
            row={modal.row}
            idKey={idKey}
            onClose={() => setModal(null)}
            onCreate={create.mutateAsync}
            onUpdate={update.mutateAsync}
            saving={create.isPending || update.isPending}
          />
        ) : (
          <MasterFormModal
            key={modal.mode + String(modal.row?.[idKey] ?? "new")}
            resource={resource}
            title={title}
            fields={fields}
            mode={modal.mode}
            row={modal.row}
            idKey={idKey}
            onClose={() => setModal(null)}
            onCreate={create.mutateAsync}
            onUpdate={update.mutateAsync}
            saving={create.isPending || update.isPending}
          />
        )
      ) : null}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={remove.isPending}
      />
    </PageContainer>
  );
}

function MasterFormModal({
  resource: _resource,
  title,
  fields,
  mode,
  row,
  idKey,
  onClose,
  onCreate,
  onUpdate,
  saving,
}: {
  resource: MasterResource;
  title: string;
  fields: MasterFieldDef[];
  mode: "create" | "edit";
  row?: Record<string, unknown>;
  idKey: string;
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (vars: { id: string | number; body: Record<string, unknown> }) => Promise<unknown>;
  saving: boolean;
}) {
  const toast = useToast();
  const { register, handleSubmit, reset } = useForm<Record<string, unknown>>();

  const formFields = fields.filter((f) => !f.tableOnly);

  useEffect(() => {
    const init: Record<string, unknown> = {};
    for (const f of formFields) {
      init[f.name] = row ? (readValue(row, f) ?? "") : f.type === "checkbox" ? true : "";
    }
    reset(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, row, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    const body: Record<string, unknown> = {};
    for (const f of formFields) {
      if (mode === "edit" && f.editable === false) continue;
      body[f.name] = raw[f.name];
    }
    try {
      if (mode === "create") {
        await onCreate(body);
        toast.success(`${title} added`);
      } else {
        await onUpdate({ id: row![idKey] as string | number, body });
        toast.success(`${title} updated`);
      }
      onClose();
    } catch (e) {
      toast.error("Save failed", e instanceof ApiError ? e.message : undefined);
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={mode === "create" ? `Add ${title}` : `Edit ${title}`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {formFields.map((f) => (
          <Field key={f.name} label={f.label} required={f.required}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded" {...register(f.name)} />
                Active
              </label>
            ) : (
              <Input
                {...register(f.name, { required: f.required })}
                readOnly={mode === "edit" && f.editable === false}
                className={mode === "edit" && f.editable === false ? "bg-slate-100" : ""}
              />
            )}
          </Field>
        ))}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
