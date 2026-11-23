"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAssetMutations } from "@/hooks/use-assets";
import { ApiError } from "@/types/api";

export function MoveChildAssetModal({
  childCode,
  childName,
  currentParentCode,
  onClose,
}: {
  childCode: string;
  childName?: string;
  currentParentCode: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { moveChild } = useAssetMutations(childCode);
  const [target, setTarget] = useState({ code: "", name: "" });
  const invalidTarget = !target.code || target.code === childCode || target.code === currentParentCode;

  const move = async () => {
    if (invalidTarget) return;
    try {
      await moveChild.mutateAsync({ childAsset: childCode, newParentAsset: target.code });
      toast.success(
        "Aset berhasil dipindahkan",
        `${childName || childCode} dilepas dari ${currentParentCode} dan ditautkan ke ${target.name || target.code}.`,
      );
      onClose();
    } catch (error) {
      toast.error("Gagal memindahkan aset", error instanceof ApiError ? error.message : undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Mutasi / Pindah Aset"
      description={`${childName || childCode} saat ini tertaut ke ${currentParentCode}. Relasi lama otomatis dilepas setelah parent baru dipilih.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button disabled={invalidTarget} loading={moveChild.isPending} onClick={move}>
            <ArrowRightLeft className="h-4 w-4" /> Pindahkan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <AssetPicker
          selectedCode={target.code}
          selectedName={target.name}
          onSelect={(code, name) => setTarget({ code, name })}
          onClear={() => setTarget({ code: "", name: "" })}
          placeholder="Cari asset lokasi / parent tujuan…"
          includeInactive
        />
        {target.code === childCode ? (
          <p className="text-xs text-rose-600">Asset tidak dapat menjadi parent bagi dirinya sendiri.</p>
        ) : target.code === currentParentCode ? (
          <p className="text-xs text-amber-600">Asset sudah tertaut ke parent tersebut.</p>
        ) : (
          <p className="text-xs text-slate-500">Perpindahan akan tercatat pada History → History Lokasi.</p>
        )}
      </div>
    </Modal>
  );
}
