"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Input } from "@/components/ui/primitives";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  /** Jika diisi, user harus mengetik teks ini untuk mengaktifkan tombol konfirmasi. */
  confirmPhrase?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  tone = "primary",
  loading = false,
  confirmPhrase,
}: ConfirmDialogProps) {
  const [phrase, setPhrase] = useState("");
  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase;

  const handleClose = () => {
    if (loading) return;
    setPhrase("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title} size="md">
      <div className="space-y-3">
        {description ? (
          <div className="text-sm text-slate-600">{description}</div>
        ) : null}
        {confirmPhrase ? (
          <div>
            <p className="mb-1 text-sm text-slate-600">
              Ketik <span className="font-semibold text-slate-900">{confirmPhrase}</span>{" "}
              untuk melanjutkan.
            </p>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
            />
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={handleClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          loading={loading}
          disabled={!phraseOk}
          onClick={async () => {
            await onConfirm();
            setPhrase("");
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Hook untuk mengelola state konfirmasi satu aksi. */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    props: Partial<ConfirmDialogProps>;
  }>({ open: false, props: {} });

  return {
    confirmProps: {
      open: state.open,
      onClose: () => setState((s) => ({ ...s, open: false })),
      ...state.props,
    },
    ask: (props: Omit<ConfirmDialogProps, "open" | "onClose">) =>
      setState({ open: true, props }),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}
