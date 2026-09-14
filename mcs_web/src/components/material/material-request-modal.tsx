"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useMaterialUsageMutations } from "@/hooks/use-material-usage";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { ApiError } from "@/types/api";
import { pick } from "@/lib/display";

export function MaterialRequestModal({
  open,
  onClose,
  defaultWo,
}: {
  open: boolean;
  onClose: () => void;
  defaultWo?: string;
}) {
  const toast = useToast();
  const { request } = useMaterialUsageMutations();

  const [woNumber, setWoNumber] = useState("");
  const [jobExecutor, setJobExecutor] = useState("");
  const [note, setNote] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [woOpen, setWoOpen] = useState(false);
  const debouncedWo = useDebouncedValue(woSearch, 300);

  const woList = useWorkOrders({
    q: debouncedWo || undefined,
    per_page: 8,
    page: 1,
  });
  const woResults = woList.data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    setWoNumber(defaultWo ?? "");
    setJobExecutor("");
    setNote("");
    setWoSearch("");
    setWoOpen(false);
  }, [open, defaultWo]);

  const submit = async () => {
    if (!woNumber.trim()) {
      toast.warning("Lengkapi data", "Nomor Work Order wajib diisi.");
      return;
    }
    try {
      await request.mutateAsync({
        wo_number: woNumber.trim(),
        job_executor: jobExecutor.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Permintaan material dikirim", woNumber.trim());
      onClose();
    } catch (e) {
      toast.error(
        "Gagal mengirim permintaan",
        e instanceof ApiError ? e.message : "Terjadi kesalahan tak terduga.",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Buat Permintaan Material"
      description="Ajukan kebutuhan material untuk sebuah work order. Pemilihan part & qty dilakukan tim Sparepart setelah permintaan dibuat."
    >
      <div className="space-y-4">
        <Field label="Nomor Work Order" required>
          <div className="relative">
            <Input
              value={woNumber}
              onChange={(e) => {
                setWoNumber(e.target.value);
                setWoSearch(e.target.value);
                setWoOpen(true);
              }}
              onFocus={() => woNumber.trim().length >= 2 && setWoOpen(true)}
              placeholder="Ketik untuk mencari WO…"
              className="pr-9"
              autoComplete="off"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {woOpen && debouncedWo.trim().length >= 2 ? (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {woList.isLoading ? (
                  <p className="px-3 py-2 text-sm text-slate-400">Mencari…</p>
                ) : woResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-400">Tidak ada WO cocok.</p>
                ) : (
                  woResults.map((wo, i) => (
                    <button
                      key={(wo.wo_number as string) ?? i}
                      type="button"
                      onClick={() => {
                        setWoNumber(String(wo.wo_number ?? ""));
                        setWoOpen(false);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-brand-50/60"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {String(wo.wo_number ?? "-")}
                      </span>
                      <span className="truncate text-xs text-slate-500">
                        {pick(wo as Record<string, unknown>, ["job_title", "title"]) || ""}
                        {pick(wo as Record<string, unknown>, ["asset_name", "asset_code"])
                          ? ` · ${pick(wo as Record<string, unknown>, ["asset_name", "asset_code"])}`
                          : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </Field>

        <Field label="Job Executor (opsional)" hint="Kode/nama executor bila permintaan atas nama executor tertentu.">
          <Input
            value={jobExecutor}
            onChange={(e) => setJobExecutor(e.target.value)}
          />
        </Field>

        <Field label="Catatan (opsional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={submit} loading={request.isPending}>
          Kirim Permintaan
        </Button>
      </div>
    </Modal>
  );
}
