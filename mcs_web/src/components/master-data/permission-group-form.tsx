"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { usePermissionCatalog } from "@/hooks/use-master";
import type { MasterFormProps } from "@/components/master-data/master-data-view";
import { ApiError } from "@/types/api";
import { pick } from "@/lib/display";

/** Kelompokkan field permission ke bagian yang mudah dibaca. */
function categoryOf(field: string): string {
  if (field.startsWith("mtc_area_")) return "Area Maintenance";
  if (field.startsWith("wo_category_")) return "Work Order Categories";
  if (field.startsWith("wo_")) return "Work Order";
  if (field.startsWith("report_") || field === "recap_wo") return "Reports";
  if (
    field.includes("asset") ||
    ["privilage_asset", "list_of_asset", "approve_asset"].includes(field)
  )
    return "Assets";
  if (field.startsWith("daily_control")) return "Daily Control";
  if (
    field.startsWith("approval") ||
    ["void", "write_off", "approved_write_off"].includes(field)
  )
    return "Approval";
  if (
    field === "schedule" ||
    field === "work_calendar" ||
    field.startsWith("preventive_alarm")
  )
    return "Preventive Schedule";
  return "Other";
}

const CATEGORY_ORDER = [
  "Work Order",
  "Work Order Categories",
  "Area Maintenance",
  "Assets",
  "Preventive Schedule",
  "Daily Control",
  "Approval",
  "Reports",
  "Other",
];

export function PermissionGroupForm({
  mode,
  row,
  idKey,
  onClose,
  onCreate,
  onUpdate,
  saving,
}: MasterFormProps) {
  const toast = useToast();
  const catalog = usePermissionCatalog();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const r = row ?? {};
    setName(pick(r, ["group_name", "name"]));
    setDescription(pick(r, ["description", "keterangan"]));
    setActive(mode === "create" ? true : Number(r.active ?? 1) === 1);
    const perms = Array.isArray(r.permissions) ? (r.permissions as string[]) : [];
    setSelected(new Set(perms));
  }, [row, mode]);

  const grouped = useMemo(() => {
    const items = catalog.data?.data ?? [];
    const map = new Map<string, { field: string; label: string }[]>();
    for (const it of items) {
      const cat = categoryOf(it.field);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ field: it.field, label: it.label });
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      items: map.get(c)!,
    }));
  }, [catalog.data]);

  const toggle = (field: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const toggleGroup = (fields: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => (on ? next.add(f) : next.delete(f)));
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning("Complete the form", "Group name is required.");
      return;
    }
    const body = {
      group_name: name.trim(),
      name: name.trim(),
      description: description.trim(),
      active: active ? 1 : 0,
      permissions: Array.from(selected),
    };
    try {
      if (mode === "create") {
        await onCreate(body);
        toast.success("Permission group created");
      } else {
        await onUpdate({ id: (row?.[idKey] as string | number) ?? "", body });
        toast.success("Permission group updated");
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
      size="2xl"
      title={mode === "create" ? "Add Permission Group" : "Edit Permission Group"}
      description="Selected permissions will be applied to every user in this group."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Group Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active group
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              Permissions ({selected.size} selected)
            </p>
          </div>

          {catalog.isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : catalog.error ? (
            <p className="text-sm text-rose-600">Failed to load permission catalog.</p>
          ) : (
            <div className="max-h-[46vh] space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {grouped.map((g) => {
                const fields = g.items.map((i) => i.field);
                const allOn = fields.every((f) => selected.has(f));
                return (
                  <div key={g.category}>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {g.category}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleGroup(fields, !allOn)}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {allOn ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {g.items.map((it) => (
                        <label
                          key={it.field}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded"
                            checked={selected.has(it.field)}
                            onChange={() => toggle(it.field)}
                          />
                          {it.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
