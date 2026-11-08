"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations } from "@/hooks/use-assets";
import { ApiError } from "@/types/api";

export function LinkPendingChildModal({
  parentAssetCode,
  pendingId,
  childName,
  onClose,
}: {
  parentAssetCode: string;
  pendingId: number;
  childName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { linkPendingChild } = useAssetMutations(parentAssetCode);
  const [selected, setSelected] = useState({ code: "", name: "" });

  const link = async () => {
    if (!selected.code) return;
    try {
      await linkPendingChild.mutateAsync({ pendingId, childAsset: selected.code });
      toast.success("Asset berhasil ditautkan", `${childName} menggunakan ${selected.name || selected.code}.`);
      onClose();
    } catch (error) {
      toast.error("Gagal menautkan asset", error instanceof ApiError ? error.message : undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Isi Asset Code / QR"
      description={`Tautkan “${childName}” ke asset master. Asset yang dipilih tidak boleh sudah tertaut ke lokasi/parent lain.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button disabled={!selected.code || selected.code === parentAssetCode} loading={linkPendingChild.isPending} onClick={link}>
            <Link2 className="h-4 w-4" /> Tautkan
          </Button>
        </>
      }
    >
      <AssetPicker
        selectedCode={selected.code}
        selectedName={selected.name}
        onSelect={(code, name) => setSelected({ code, name })}
        onClear={() => setSelected({ code: "", name: "" })}
        placeholder="Ketik Asset Code atau scan QR…"
        excludeLinked
      />
      {selected.code === parentAssetCode ? <p className="mt-2 text-xs text-rose-600">Aset induk tidak dapat ditautkan ke dirinya sendiri.</p> : null}
    </Modal>
  );
}
