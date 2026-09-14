"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AccessDenied } from "@/components/layout/access-denied";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { useMe } from "@/hooks/use-auth";
import { canRead, canWrite } from "@/lib/permissions";
import {
  useAttachmentCategories,
  useAttachmentCategoryMutations,
} from "@/hooks/use-asset-media";
import type { AttachmentCategory } from "@/lib/api/asset-media";
import { ApiError } from "@/types/api";
import { arrayMove } from "@/lib/utils";

export default function AttachmentCategoriesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: user, isLoading: userLoading } = useMe();
  const list = useAttachmentCategories();
  const { create, update, remove, reorder } = useAttachmentCategoryMutations();

  const [rows, setRows] = useState<AttachmentCategory[]>([]);
  const [modal, setModal] = useState<{ row?: AttachmentCategory } | null>(null);
  const [name, setName] = useState("");
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    setRows(list.data?.data ?? []);
  }, [list.data]);

  const allowRead = canRead(user, "masterAttachmentCategory");
  const allowWrite = canWrite(user, "masterAttachmentCategory");
  const dndEnabled = allowWrite && rows.length > 1;

  const openCreate = () => {
    setName("");
    setModal({});
  };
  const openEdit = (row: AttachmentCategory) => {
    setName(row.category_name ?? "");
    setModal({ row });
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Category name is required");
      return;
    }
    try {
      if (modal?.row) {
        await update.mutateAsync({ id: modal.row.id, name: trimmed });
        toast.success("Category updated");
      } else {
        await create.mutateAsync(trimmed);
        toast.success("Category added");
      }
      setModal(null);
    } catch (e) {
      toast.error("Save failed", e instanceof ApiError ? e.message : undefined);
    }
  };

  const askDelete = (row: AttachmentCategory) => {
    confirm.ask({
      title: "Delete this category?",
      description: "A category still used by attachments cannot be deleted.",
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await remove.mutateAsync(row.id);
          toast.success("Category deleted");
          confirm.close();
        } catch (e) {
          toast.error("Failed", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  const handleDrop = (toIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === toIndex) return;
    const next = arrayMove(rows, from, toIndex);
    setRows(next);
    reorder.mutate(
      next.map((r) => r.id),
      {
        onError: (e) => {
          toast.error(
            "Failed to save order",
            e instanceof ApiError ? e.message : undefined,
          );
          setRows(list.data?.data ?? []);
        },
      },
    );
  };

  if (!userLoading && !allowRead) {
    return (
      <PageContainer title="Asset Attachment Categories">
        <AccessDenied />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Asset Attachment Categories"
      description="Categories for grouping asset attachments/photos. Drag rows to change the order."
      actions={
        allowWrite ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        ) : null
      }
    >
      {list.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <div className="card p-4">
          <EmptyState title="No attachment categories yet" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="w-16 px-3 py-2 text-left font-semibold">#</th>
                <th className="px-3 py-2 text-left font-semibold">Category Name</th>
                {allowWrite ? <th className="w-24 px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  draggable={dndEnabled}
                  onDragStart={() => {
                    dragIndex.current = i;
                  }}
                  onDragOver={(e) => {
                    if (dndEnabled) e.preventDefault();
                  }}
                  onDrop={() => dndEnabled && handleDrop(i)}
                  className={`border-b border-slate-50 last:border-0 ${
                    dndEnabled ? "cursor-move hover:bg-slate-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-slate-300">
                    {dndEnabled ? <GripVertical className="h-4 w-4" /> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 text-slate-800">{row.category_name}</td>
                  {allowWrite ? (
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-rose-500 hover:bg-rose-50"
                          onClick={() => askDelete(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <Modal
          open
          onClose={() => setModal(null)}
          title={modal.row ? "Edit Category" : "Add Category"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button onClick={save} loading={create.isPending || update.isPending}>
                Save
              </Button>
            </>
          }
        >
          <Field label="Category Name" required>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </Field>
        </Modal>
      ) : null}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
        loading={remove.isPending}
      />
    </PageContainer>
  );
}
