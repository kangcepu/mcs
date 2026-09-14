"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  useEmployeeSearch,
  useMasterOptions,
  usePermissionCatalog,
} from "@/hooks/use-master";
import { useDebouncedValue } from "@/hooks/use-debounce";
import type { MasterFormProps } from "@/components/master-data/master-data-view";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";
import { pick } from "@/lib/display";
import type { EmployeeHit, MasterOptionItem } from "@/lib/api/master";

function optionValue(
  value: string | number | null | undefined,
  options: MasterOptionItem[] | undefined,
) {
  const needle = String(value ?? "").trim().toLocaleLowerCase();
  if (!needle || !options) return "";
  return (
    options.find(
      (option) =>
        option.value.toLocaleLowerCase() === needle ||
        option.label.toLocaleLowerCase() === needle,
    )?.value ?? ""
  );
}

export function UserForm({
  mode,
  row,
  idKey,
  onClose,
  onCreate,
  onUpdate,
  saving,
}: MasterFormProps) {
  const toast = useToast();
  const options = useMasterOptions();
  const catalog = usePermissionCatalog();

  const [form, setForm] = useState({
    username: "",
    fullname: "",
    email: "",
    id_division: "",
    id_position: "",
    id_company: "",
    permission_group_id: "",
    password: "",
    active: true,
  });
  const [showManual, setShowManual] = useState(false);
  const [manualPerms, setManualPerms] = useState<Set<string>>(new Set());

  // Autocomplete pegawai (Employee API): data identitas dan organisasi diisi otomatis.
  const [empQuery, setEmpQuery] = useState("");
  const [empOpen, setEmpOpen] = useState(false);
  const [usernameFromEmp, setUsernameFromEmp] = useState(mode === "edit");
  const empBoxRef = useRef<HTMLDivElement>(null);
  const debouncedEmpQuery = useDebouncedValue(empQuery, 300);
  const empSearch = useEmployeeSearch(debouncedEmpQuery, "");

  useEffect(() => {
    const r = row ?? {};
    setForm({
      username: pick(r, ["username"]),
      fullname: pick(r, ["fullname", "full_name", "name"]),
      email: pick(r, ["email"]),
      id_division: pick(r, ["id_division"]),
      id_position: pick(r, ["id_position"]),
      id_company: pick(r, ["id_company"]),
      permission_group_id: pick(r, ["permission_group_id", "permission_group"]),
      password: "",
      active: mode === "create" ? true : Number(r.active ?? 1) === 1,
    });
    // Prefill manual permission flags dari kolom user (nilai 1).
    const catFields = (catalog.data?.data ?? [])
      .filter((c) => c.on_user && Number((r as Record<string, unknown>)[c.field] ?? 0) === 1)
      .map((c) => c.field);
    setManualPerms(new Set(catFields));
  }, [row, mode, catalog.data]);

  const opt = options.data?.data;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (empBoxRef.current && !empBoxRef.current.contains(e.target as Node)) {
        setEmpOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pickEmployee = (emp: EmployeeHit) => {
    setForm((f) => ({
      ...f,
      fullname: emp.name || f.fullname,
      username: emp.employee_code || f.username,
      // Employee API adalah sumber data utama saat user dibuat.
      email: emp.email || "",
      id_company:
        optionValue(emp.id_company ?? emp.company_code ?? emp.company, opt?.companies) ||
        f.id_company,
      id_division:
        optionValue(emp.id_division ?? emp.division_code ?? emp.division, opt?.divisions) ||
        f.id_division,
      id_position:
        optionValue(emp.id_position ?? emp.position_code ?? emp.position, opt?.positions) ||
        f.id_position,
    }));
    setUsernameFromEmp(Boolean(emp.employee_code));
    setEmpOpen(false);
    setEmpQuery("");
  };

  const empResults = empSearch.data?.data ?? [];

  const groupedCatalog = useMemo(() => {
    const items = (catalog.data?.data ?? []).filter((c) => c.on_user);
    return items;
  }, [catalog.data]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.fullname.trim()) {
      toast.warning("Complete the form", "Username and full name are required.");
      return;
    }
    const body: Record<string, unknown> = {
      username: form.username.trim(),
      fullname: form.fullname.trim(),
      // Email optional; jangan kirim string kosong agar backend yang lama tidak
      // menganggapnya sebagai alamat email tidak valid.
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      id_division: form.id_division || null,
      id_position: form.id_position || null,
      id_company: form.id_company || null,
      permission_group_id: form.permission_group_id
        ? Number(form.permission_group_id)
        : 0,
      active: form.active ? 1 : 0,
    };
    if (form.password.trim()) body.password = form.password.trim();
    if (!form.permission_group_id && showManual) {
      body.permissions = Array.from(manualPerms);
    }

    try {
      if (mode === "create") {
        await onCreate(body);
        toast.success("User created");
      } else {
        await onUpdate({ id: (row?.[idKey] as string | number) ?? "", body });
        toast.success("User updated");
      }
      onClose();
    } catch (err) {
      toast.error(
        "Save failed",
        err instanceof ApiError ? err.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={mode === "create" ? "Add User" : "Edit User"}
      description={
        mode === "edit"
          ? "Leave the password blank to keep the current password."
          : "Passwords are hashed on the server. A blank password requires the user to create one on first login."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full Name"
            required
            hint="Search and select an employee to fill identity, company, division, and position automatically."
          >
            <div className="relative" ref={empBoxRef}>
              <Input
                value={form.fullname}
                onChange={(e) => {
                  set({ fullname: e.target.value });
                  setEmpQuery(e.target.value);
                  setEmpOpen(true);
                }}
                onFocus={() => {
                  if (empQuery.trim().length >= 2) setEmpOpen(true);
                }}
                className="pr-9"
                placeholder="mis. Muhammad Khalid"
                autoFocus={mode === "create"}
                autoComplete="off"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {empSearch.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </span>

              {empOpen && debouncedEmpQuery.trim().length >= 2 ? (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {empSearch.isLoading ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Searching employees…</p>
                  ) : empResults.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">
                      {empSearch.isError
                        ? "Employee data is currently unavailable."
                        : "No matching employees found."}
                    </p>
                  ) : (
                    empResults.map((emp, i) => (
                      <button
                        key={emp.employee_code || emp.name || i}
                        type="button"
                        onClick={() => pickEmployee(emp)}
                        className="flex w-full flex-col items-start gap-0.5 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-brand-50/60"
                      >
                        <span className="text-sm font-medium text-slate-800">
                          {emp.name || "-"}
                        </span>
                        <span className="text-xs text-slate-500">
                          NIK {emp.employee_code || "-"}
                          {emp.email ? ` · ${emp.email}` : ""}
                          {emp.company ? ` · ${emp.company}` : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </Field>

          <Field
            label="Username (NIK / EmployeeCode)"
            required
            hint={
              usernameFromEmp && mode === "create"
                ? "Filled automatically from employee data."
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
                readOnly={mode === "edit" || (usernameFromEmp && mode === "create")}
                className={
                  mode === "edit" || (usernameFromEmp && mode === "create")
                    ? "bg-slate-100"
                    : ""
                }
              />
            </div>
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={mode === "edit" ? "•••••• (tidak diubah)" : ""}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Division">
            <Select
              value={form.id_division}
              onChange={(e) => set({ id_division: e.target.value })}
            >
              <option value="">— Select division —</option>
              {(opt?.divisions ?? []).map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Company">
            <Select
              value={form.id_company}
              onChange={(e) => set({ id_company: e.target.value })}
            >
              <option value="">— Select company —</option>
              {(opt?.companies ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position">
            <Select
              value={form.id_position}
              onChange={(e) => set({ id_position: e.target.value })}
            >
              <option value="">— Select position —</option>
              {(opt?.positions ?? []).map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Permission Group">
            <Select
              value={form.permission_group_id}
              onChange={(e) => set({ permission_group_id: e.target.value })}
            >
              <option value="">— No group —</option>
              {(opt?.permission_groups ?? []).map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={form.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Active account
        </label>

        {!form.permission_group_id ? (
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700"
            >
              Configure manual permissions ({manualPerms.size} selected)
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", showManual && "rotate-180")}
              />
            </button>
            {showManual ? (
              <div className="max-h-[36vh] overflow-y-auto border-t border-slate-100 p-3">
                {catalog.isLoading ? (
                  <LoadingSkeleton rows={4} />
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {groupedCatalog.map((c) => (
                      <label
                        key={c.field}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          checked={manualPerms.has(c.field)}
                          onChange={() =>
                            setManualPerms((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.field)) next.delete(c.field);
                              else next.add(c.field);
                              return next;
                            })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Permissions follow the selected group. Changing the group will overwrite
            this user&apos;s permissions.
          </p>
        )}

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
