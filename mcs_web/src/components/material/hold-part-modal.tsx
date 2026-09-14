"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, DecimalInput, Field, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useMaterialUsageMutations } from "@/hooks/use-material-usage";
import { ApiError } from "@/types/api";
import { dash, pick } from "@/lib/display";
import { formatQty, parseDecimal } from "@/lib/format";

export function HoldPartModal({
  open,
  onClose,
  requestId,
  part,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string | number;
  part: Record<string, unknown> | null;
}) {
  const toast = useToast();
  const { hold } = useMaterialUsageMutations(requestId);
  const [qty, setQty] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) return;
    setQty(part?.hold ? String(part.hold) : "");
    setRemarks("");
  }, [open, part]);

  const rowId = part
    ? (pick(part, ["id", "id_material_request", "id_material_part_request"]) as
        | string
        | number)
    : "";
  const maxQty = Number(part?.material_request ?? 0);

  const submit = async () => {
    const holdQty = parseDecimal(qty);
    if (!rowId) {
      toast.error("Baris part tidak valid");
      return;
    }
    if (Number.isNaN(holdQty) || holdQty <= 0) {
      toast.warning("Qty hold harus lebih dari 0");
      return;
    }
    if (maxQty > 0 && holdQty > maxQty) {
      toast.warning("Melebihi request", `Qty hold melebihi qty request (${maxQty}).`);
      return;
    }
    try {
      await hold.mutateAsync({ id: rowId, hold_qty: holdQty, remarks: remarks.trim() });
      toast.success("Part ditahan (hold)");
      onClose();
    } catch (e) {
      toast.error("Gagal menahan part", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hold Part"
      description={
        part
          ? `${dash(pick(part, ["part", "part_name"]))} · request ${formatQty(
              maxQty,
            )} ${pick(part, ["uom_request", "uom"]) || ""}`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={hold.isPending}>
            Simpan Hold
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Qty Hold" required>
          <DecimalInput
            autoFocus
            value={qty}
            onValueChange={setQty}
            placeholder="mis. 0,5"
          />
        </Field>
        <Field label="Keterangan">
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Alasan part ditahan…"
          />
        </Field>
      </div>
    </Modal>
  );
}
