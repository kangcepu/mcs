"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Camera,
  ClipboardCheck,
  Settings2,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  createSparepartOpname,
  createSparepartTransfer,
  deleteSparepartInventoryAttachment,
  getSparepartInventoryAttachments,
  getSparepartInventoryOverview,
  getSparepartOpname,
  reviewSparepartOpname,
  reviewSparepartTransfer,
  saveSparepartInventoryPolicy,
  saveSparepartOpnameCounts,
  submitSparepartOpname,
  uploadSparepartInventoryAttachments,
} from "@/lib/api/spareparts";
import { formatNumber } from "@/lib/format";

const nowInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const n = (value: unknown) => Number(value ?? 0);
const POLICY_FIELDS: Array<
  [
    (
      | "minimum_qty"
      | "maximum_qty"
      | "reorder_point"
      | "reorder_qty"
      | "lead_time_days"
      | "slow_moving_days"
      | "dead_stock_days"
    ),
    string,
  ]
> = [
  ["minimum_qty", "Minimum stock"],
  ["maximum_qty", "Maximum stock"],
  ["reorder_point", "Reorder point"],
  ["reorder_qty", "Reorder quantity"],
  ["lead_time_days", "Lead time (hari)"],
  ["slow_moving_days", "Slow moving (hari)"],
  ["dead_stock_days", "Dead stock (hari)"],
];

export function SparepartInventoryControlPanel() {
  const toast = useToast();
  const [tab, setTab] = useState("transfer");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["sparepart-inventory-control"],
    queryFn: ({ signal }) => getSparepartInventoryOverview(signal),
  });
  const data = query.data?.data;
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState({
    source_key: "",
    to_bin_id: "",
    quantity: "",
    transferred_at: nowInput(),
    notes: "",
  });
  const [serialIds, setSerialIds] = useState<number[]>([]);
  const [opnameCreate, setOpnameCreate] = useState(false);
  const [opnameWarehouse, setOpnameWarehouse] = useState("");
  const [opnameId, setOpnameId] = useState<number | null>(null);
  const [counts, setCounts] = useState<
    Record<number, { counted_qty: string; count_note: string; serial_text: string }>
  >({});
  const detail = useQuery({
    queryKey: ["sparepart-opname", opnameId],
    queryFn: ({ signal }) => getSparepartOpname(opnameId!, signal),
    enabled: opnameId !== null,
  });
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState({
    sparepart_id: "",
    warehouse_id: "",
    minimum_qty: "0",
    maximum_qty: "",
    reorder_point: "0",
    reorder_qty: "",
    lead_time_days: "0",
    slow_moving_days: "90",
    dead_stock_days: "180",
    notes: "",
  });
  const [evidence, setEvidence] = useState<{
    type: "TRANSFER" | "OPNAME";
    id: number;
    label: string;
  } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const evidenceQuery = useQuery({
    queryKey: ["sparepart-inventory-evidence", evidence?.type, evidence?.id],
    queryFn: () =>
      getSparepartInventoryAttachments(evidence!.type, evidence!.id),
    enabled: Boolean(evidence),
  });
  useEffect(() => {
    const lines = detail.data?.data.lines;
    if (lines) {
      const initial: Record<
        number,
        { counted_qty: string; count_note: string; serial_text: string }
      > = {};
      lines.forEach((line) => {
        initial[line.id] = {
          counted_qty: line.counted_qty == null ? "" : String(line.counted_qty),
          count_note: line.count_note ?? "",
          serial_text: (line.serials ?? []).filter((serial) => serial.counted_present).map((serial) => serial.serial_number).join("\n"),
        };
      });
      setCounts(initial);
    }
  }, [detail.data]);
  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      await Promise.all([
        query.refetch(),
        opnameId !== null ? detail.refetch() : Promise.resolve(),
        evidence ? evidenceQuery.refetch() : Promise.resolve(),
      ]);
    } catch (error) {
      toast.error(
        "Proses inventory gagal",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  };
  const source = data?.balances.find(
    (item) =>
      `${item.sparepart_id}|${item.bin_id}|${item.stock_bucket}|${item.lot_number ?? ""}|${item.expiry_date ?? ""}` ===
      transfer.source_key,
  );
  const sourcePart = data?.parts.find(
    (item) => item.id === source?.sparepart_id,
  );
  const destBins = (data?.bins ?? []).filter(
    (item) => item.id !== source?.bin_id,
  );
  const sourceSerials = (data?.serials ?? []).filter(
    (item) =>
      item.sparepart_id === source?.sparepart_id &&
      item.bin_id === source?.bin_id &&
      item.stock_bucket === source?.stock_bucket,
  );
  const warehouses = useMemo(
    () =>
      Array.from(
        new Map(
          (data?.bins ?? []).map((bin) => [
            bin.warehouse_id,
            {
              id: bin.warehouse_id,
              label: `${bin.warehouse_code} · ${bin.warehouse_name}`,
            },
          ]),
        ).values(),
      ),
    [data?.bins],
  );
  const saveTransfer = () =>
    run(async () => {
      if (!source) throw new Error("Pilih saldo sumber.");
      const dest = data?.bins.find(
        (item) => String(item.id) === transfer.to_bin_id,
      );
      if (!dest) throw new Error("Pilih bin tujuan.");
      await createSparepartTransfer({
        from_warehouse_id: source.warehouse_id,
        to_warehouse_id: dest.warehouse_id,
        transferred_at: transfer.transferred_at,
        notes: transfer.notes,
        lines: [
          {
            sparepart_id: source.sparepart_id,
            from_bin_id: source.bin_id,
            to_bin_id: dest.id,
            stock_bucket: source.stock_bucket,
            lot_number: source.lot_number,
            expiry_date: source.expiry_date,
            quantity: transfer.quantity,
            serial_ids: serialIds,
          },
        ],
      });
      setTransferOpen(false);
      setTransfer({
        source_key: "",
        to_bin_id: "",
        quantity: "",
        transferred_at: nowInput(),
        notes: "",
      });
      setSerialIds([]);
    }, "Transfer diajukan ke checker");
  const countPayload = () => Object.entries(counts).map(([lineId, value]) => ({
    id: Number(lineId), ...value,
    serial_numbers: value.serial_text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
  }));
  const saveCounts = () =>
    run(
      () =>
        saveSparepartOpnameCounts(
          opnameId!,
          countPayload(),
        ),
      "Hasil blind count disimpan",
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [data?.stats.pending_transfer, "Transfer pending"],
          [data?.stats.counting_opname, "SO counting"],
          [data?.stats.pending_adjustment, "Adjustment pending"],
          [data?.stats.reorder_due, "Reorder due"],
          [data?.stats.critical_alert, "Critical alert"],
          [data?.stats.slow_dead, "Slow/dead stock"],
        ].map(([value, label]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-2xl font-semibold text-slate-900">
              {value ?? 0}
            </p>
            <p className="text-xs text-slate-500">{label}</p>
          </Card>
        ))}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        variant="pill"
        items={[
          { key: "transfer", label: "Transfer" },
          { key: "opname", label: "Stock Opname" },
          { key: "control", label: "Inventory Control" },
          { key: "trend", label: "Trend & Forecast" },
          { key: "audit", label: "Audit Trail" },
        ]}
      />
      {tab === "transfer" ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="h-4 w-4" /> Transfer Stok
            </Button>
          </div>
          <Table
            headers={[
              "Nomor",
              "Dari → Tujuan",
              "Tanggal",
              "Qty",
              "Maker / Checker",
              "Status",
              "Aksi",
            ]}
          >
            {data?.transfers.map((item) => (
              <tr key={item.id} className="border-t">
                <Td>
                  <strong>{item.transfer_number}</strong>
                </Td>
                <Td>
                  {item.from_code} → {item.to_code}
                </Td>
                <Td>{item.transferred_at}</Td>
                <Td>{formatNumber(n(item.total_qty))}</Td>
                <Td>
                  {item.created_by || "-"}
                  <br />
                  <span className="text-xs text-slate-400">
                    {item.checked_by || "Belum dicek"}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={item.status} />
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {item.status === "SUBMITTED" ? (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => reviewSparepartTransfer(item.id, "APPROVE"),
                              "Transfer disetujui",
                            )
                          }
                        >
                          Setujui
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                reviewSparepartTransfer(
                                  item.id,
                                  "REJECT",
                                  window.prompt("Alasan penolakan") ||
                                    "Ditolak",
                                ),
                              "Transfer ditolak",
                            )
                          }
                        >
                          Tolak
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setEvidence({
                          type: "TRANSFER",
                          id: item.id,
                          label: item.transfer_number,
                        })
                      }
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
      {tab === "opname" ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setOpnameCreate(true)}>
              <ClipboardCheck className="h-4 w-4" /> Mulai Blind Count
            </Button>
          </div>
          <Table
            headers={[
              "Nomor",
              "Warehouse",
              "Progress",
              "Variance",
              "Maker / Checker",
              "Status",
              "Aksi",
            ]}
          >
            {data?.opnames.map((item) => (
              <tr key={item.id} className="border-t">
                <Td>
                  <strong>{item.opname_number}</strong>
                  {Number(item.recount_count)>0?<p className="text-xs text-amber-600">Recount {item.recount_count}x</p>:null}
                </Td>
                <Td>{item.warehouse_code}</Td>
                <Td>
                  {item.counted_lines}/{item.line_count}
                </Td>
                <Td>
                  {["COUNTING","RECOUNTING"].includes(item.status)
                    ? "Tersembunyi"
                    : formatNumber(n(item.absolute_variance))}
                </Td>
                <Td>
                  {item.created_by || "-"}
                  <br />
                  <span className="text-xs text-slate-400">
                    {item.checked_by || "Belum dicek"}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={item.status} />
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      onClick={() => setOpnameId(item.id)}
                    >
                      Buka
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setEvidence({
                          type: "OPNAME",
                          id: item.id,
                          label: item.opname_number,
                        })
                      }
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                    {item.status === "SUBMITTED" ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const reason=window.prompt("Alasan recount wajib diisi:");
                            if(!reason?.trim()) return;
                            run(() => reviewSparepartOpname(item.id,"RECOUNT",reason.trim()),"Recount stock opname diminta");
                          }}
                        >
                          Recount
                        </Button>
                        <Button
                          onClick={() =>
                            run(
                              () => reviewSparepartOpname(item.id, "APPROVE"),
                              "Adjustment disetujui",
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() =>
                            run(
                              () =>
                                reviewSparepartOpname(
                                  item.id,
                                  "REJECT",
                                  window.prompt("Alasan") || "Ditolak",
                                ),
                              "Adjustment ditolak",
                            )
                          }
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
      {tab === "control" ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setPolicyOpen(true)}>
              <Settings2 className="h-4 w-4" /> Atur Min/Max/Reorder
            </Button>
          </div>
          <Table
            headers={[
              "Sparepart / Warehouse",
              "Saldo",
              "Min / Max",
              "Reorder",
              "Pergerakan",
              "Alert",
            ]}
          >
            {data?.alerts.map((item) => (
              <tr key={item.id} className="border-t">
                <Td>
                  <strong>{item.part_name}</strong>
                  <p className="text-xs text-slate-400">
                    {item.part_code} · {item.warehouse_code} ·{" "}
                    {item.criticality}
                  </p>
                </Td>
                <Td>
                  {formatNumber(n(item.current_qty))} {item.base_uom}
                </Td>
                <Td>
                  {formatNumber(n(item.minimum_qty))} /{" "}
                  {item.maximum_qty == null
                    ? "-"
                    : formatNumber(n(item.maximum_qty))}
                </Td>
                <Td>{formatNumber(n(item.reorder_point))}</Td>
                <Td>
                  <StatusBadge status={item.movement_class} />
                  <p className="text-xs text-slate-400">
                    {item.days_since_consumption == null
                      ? "Belum ada pemakaian"
                      : `${item.days_since_consumption} hari`}
                  </p>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {item.reorder_due ? (
                      <StatusBadge status="REORDER DUE" tone="red" />
                    ) : null}
                    {item.over_maximum ? (
                      <StatusBadge status="OVER MAX" tone="amber" />
                    ) : null}
                    {item.criticality === "CRITICAL" ? (
                      <StatusBadge status="CRITICAL" tone="red" />
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {!data?.alerts.length ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              Belum ada inventory policy. Tambahkan minimum, maximum, dan
              reorder point.
            </Card>
          ) : null}
        </section>
      ) : null}
      {tab === "trend" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold">Consumption Trend 12 Bulan</h3>
            </div>
            <Table headers={["Periode", "Sparepart", "Pemakaian"]}>
              {data?.trend.map((item, index) => {
                const part = data.parts.find((p) => p.id === item.sparepart_id);
                return (
                  <tr
                    key={`${item.period}-${item.sparepart_id}-${index}`}
                    className="border-t"
                  >
                    <Td>{item.period}</Td>
                    <Td>{part?.part_name || item.sparepart_id}</Td>
                    <Td>
                      {formatNumber(n(item.consumption_qty))} {part?.base_uom}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold">
                Kebutuhan Berdasarkan Preventive Schedule
              </h3>
              <p className="text-xs text-slate-500">
                Menggabungkan kompatibilitas asset, jadwal aktif, dan konsumsi
                180 hari.
              </p>
            </div>
            <Table
              headers={[
                "Sparepart",
                "Jadwal aktif",
                "Konsumsi 180 hari",
                "Saldo",
                "Indikasi",
              ]}
            >
              {data?.forecast.map((item) => {
                const avg = item.active_schedule_count
                  ? n(item.consumption_180_days) / item.active_schedule_count
                  : 0;
                return (
                  <tr key={item.sparepart_id} className="border-t">
                    <Td>
                      <strong>{item.part_name}</strong>
                      <p className="text-xs text-slate-400">
                        {item.part_code} · {item.criticality}
                      </p>
                    </Td>
                    <Td>{item.active_schedule_count}</Td>
                    <Td>{formatNumber(n(item.consumption_180_days))}</Td>
                    <Td>{formatNumber(n(item.current_qty))}</Td>
                    <Td>
                      {formatNumber(avg)} {item.base_uom}/jadwal
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </section>
      ) : null}
      {tab === "audit" ? (
        <Card className="divide-y">
          {data?.audit.map((item) => (
            <div key={item.id} className="p-4">
              <p className="text-sm font-medium">{item.event_summary}</p>
              <p className="text-xs text-slate-400">
                {item.event_at} · {item.actor_name || "SYSTEM"} ·{" "}
                {item.entity_type} #{item.entity_id}
              </p>
            </div>
          ))}
        </Card>
      ) : null}

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer Antar-bin / Warehouse"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(false)}>
              Batal
            </Button>
            <Button loading={busy} onClick={saveTransfer}>
              Submit Transfer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Saldo sumber" required>
              <Select
                value={transfer.source_key}
                onChange={(e) => {
                  setTransfer({
                    ...transfer,
                    source_key: e.target.value,
                    to_bin_id: "",
                    quantity: "",
                  });
                  setSerialIds([]);
                }}
              >
                <option value="">Pilih sparepart dan bin sumber…</option>
                {data?.balances.map((item) => (
                  <option
                    key={`${item.sparepart_id}-${item.bin_id}-${item.stock_bucket}-${item.lot_number}-${item.expiry_date}`}
                    value={`${item.sparepart_id}|${item.bin_id}|${item.stock_bucket}|${item.lot_number ?? ""}|${item.expiry_date ?? ""}`}
                  >
                    {item.part_code} · {item.part_name} — {item.warehouse_code}/
                    {item.rack_code}/{item.bin_code} — {item.stock_bucket}{" "}
                    {formatNumber(n(item.current_qty))}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Bin tujuan" required>
            <Select
              value={transfer.to_bin_id}
              onChange={(e) =>
                setTransfer({ ...transfer, to_bin_id: e.target.value })
              }
            >
              <option value="">Pilih bin…</option>
              {destBins.map((bin) => (
                <option key={bin.id} value={bin.id}>
                  {bin.warehouse_code}/{bin.rack_code}/{bin.bin_code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qty" required>
            <Input
              inputMode="decimal"
              value={transfer.quantity}
              onChange={(e) =>
                setTransfer({ ...transfer, quantity: e.target.value })
              }
            />
          </Field>
          <Field label="Waktu transfer">
            <Input
              type="datetime-local"
              value={transfer.transferred_at}
              onChange={(e) =>
                setTransfer({ ...transfer, transferred_at: e.target.value })
              }
            />
          </Field>
          <Field label="Catatan">
            <Input
              value={transfer.notes}
              onChange={(e) =>
                setTransfer({ ...transfer, notes: e.target.value })
              }
            />
          </Field>
          {sourcePart?.is_serialized ? (
            <div className="sm:col-span-2">
              <Field label="Serial yang dipindahkan" required>
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                  {sourceSerials.map((serial) => (
                    <label
                      key={serial.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={serialIds.includes(serial.id)}
                        onChange={(e) =>
                          setSerialIds((current) =>
                            e.target.checked
                              ? [...current, serial.id]
                              : current.filter((id) => id !== serial.id),
                          )
                        }
                      />
                      {serial.serial_number}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={opnameCreate}
        onClose={() => setOpnameCreate(false)}
        title="Mulai Blind Stock Opname"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpnameCreate(false)}>
              Batal
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  const result = await createSparepartOpname({
                    warehouse_id: opnameWarehouse,
                    counted_at: nowInput(),
                  });
                  setOpnameCreate(false);
                  setOpnameId(result.data.id);
                }, "Blind count dibuat")
              }
            >
              Mulai
            </Button>
          </>
        }
      >
        <div className="p-5">
          <Field label="Warehouse" required>
            <Select
              value={opnameWarehouse}
              onChange={(e) => setOpnameWarehouse(e.target.value)}
            >
              <option value="">Pilih warehouse…</option>
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            Saldo sistem dan variance tidak ditampilkan kepada counter sampai
            seluruh hasil count disubmit.
          </p>
        </div>
      </Modal>
      <Modal
        open={opnameId !== null}
        onClose={() => setOpnameId(null)}
        title={detail.data?.data.opname_number ?? "Stock Opname"}
        description={`${detail.data?.data.warehouse_name ?? ""} · ${detail.data?.data.status ?? ""}`}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpnameId(null)}>
              Tutup
            </Button>
            {["COUNTING","RECOUNTING"].includes(detail.data?.data.status ?? "") ? (
              <>
                <Button loading={busy} onClick={saveCounts}>
                  Simpan Count
                </Button>
                <Button
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      await saveSparepartOpnameCounts(
                        opnameId!,
                        countPayload(),
                      );
                      await submitSparepartOpname(opnameId!);
                    }, "Stock opname disubmit")
                  }
                >
                  Simpan & Submit
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <div className="max-h-[65vh] overflow-auto p-5">
          <Table
            headers={[
              "Sparepart / Bin",
              "Bucket / Lot",
              "Qty Count",
              "Saldo Sistem",
              "Variance",
              "Catatan",
            ]}
          >
            {detail.data?.data.lines.map((line) => (
              <tr key={line.id} className="border-t">
                <Td>
                  <strong>{line.part_name}</strong>
                  <p className="text-xs text-slate-400">
                    {line.part_code} · {line.rack_code}/{line.bin_code}
                  </p>
                </Td>
                <Td>
                  {line.stock_bucket}
                  <p className="text-xs text-slate-400">
                    {line.lot_number || "Tanpa lot"}
                  </p>
                </Td>
                <Td>
                  {["COUNTING","RECOUNTING"].includes(detail.data?.data.status ?? "") ? (
                    line.is_serialized ? <Textarea className="min-w-48" placeholder="Scan/input satu serial per baris" value={counts[line.id]?.serial_text ?? ""} onChange={(e)=>setCounts((current)=>({...current,[line.id]:{...(current[line.id]??{count_note:"",counted_qty:""}),serial_text:e.target.value}}))}/>
                    : <Input
                        className="w-28"
                        inputMode="decimal"
                        value={counts[line.id]?.counted_qty ?? ""}
                        onChange={(e) =>
                          setCounts((current) => ({
                            ...current,
                            [line.id]: {
                              ...(current[line.id] ?? { count_note: "", serial_text: "" }),
                              counted_qty: e.target.value,
                            },
                          }))
                        }
                      />
                  ) : (
                    formatNumber(n(line.counted_qty))
                  )}
                </Td>
                <Td>
                  {line.system_qty === undefined ? (
                    <span className="text-xs text-slate-400">Blind</span>
                  ) : (
                    formatNumber(n(line.system_qty))
                  )}
                </Td>
                <Td>
                  {line.variance_qty === undefined ? (
                    "-"
                  ) : (
                    <span
                      className={
                        n(line.variance_qty) !== 0
                          ? "font-semibold text-rose-600"
                          : "text-emerald-600"
                      }
                    >
                      {formatNumber(n(line.variance_qty))}
                    </span>
                  )}
                </Td>
                <Td>
                  {["COUNTING","RECOUNTING"].includes(detail.data?.data.status ?? "") ? (
                    <Input
                      value={counts[line.id]?.count_note ?? ""}
                      onChange={(e) =>
                        setCounts((current) => ({
                          ...current,
                          [line.id]: {
                            ...(current[line.id] ?? { counted_qty: "", serial_text: "" }),
                            count_note: e.target.value,
                          },
                        }))
                      }
                    />
                  ) : (
                    line.count_note || "-"
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Modal>
      <Modal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title="Atur Inventory Control"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPolicyOpen(false)}>
              Batal
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  await saveSparepartInventoryPolicy(policy);
                  setPolicyOpen(false);
                }, "Inventory policy disimpan")
              }
            >
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Sparepart" required>
            <Select
              value={policy.sparepart_id}
              onChange={(e) =>
                setPolicy({ ...policy, sparepart_id: e.target.value })
              }
            >
              <option value="">Pilih…</option>
              {data?.parts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.part_code} · {item.part_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Warehouse" required>
            <Select
              value={policy.warehouse_id}
              onChange={(e) =>
                setPolicy({ ...policy, warehouse_id: e.target.value })
              }
            >
              <option value="">Pilih…</option>
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {POLICY_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                inputMode="decimal"
                value={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: e.target.value })
                }
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Catatan">
              <Textarea
                value={policy.notes}
                onChange={(e) =>
                  setPolicy({ ...policy, notes: e.target.value })
                }
              />
            </Field>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(evidence)}
        onClose={() => {
          setEvidence(null);
          setFiles([]);
        }}
        title={`Evidence ${evidence?.label ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEvidence(null)}>
              Tutup
            </Button>
            <Button
              disabled={!files.length}
              loading={busy}
              onClick={() =>
                run(async () => {
                  if (!evidence) return;
                  await uploadSparepartInventoryAttachments(
                    evidence.type,
                    evidence.id,
                    files,
                  );
                  setFiles([]);
                }, "Evidence diunggah")
              }
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="p-5">
          <Field label="Foto/PDF evidence">
            <Input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Field>
          <div className="mt-4 space-y-2">
            {evidenceQuery.data?.data.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <a
                  className="text-sm font-medium text-brand-700"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.file_name}
                </a>
                <Button
                  variant="danger"
                  onClick={() =>
                    run(
                      () => deleteSparepartInventoryAttachment(item.id),
                      "Evidence dihapus",
                    )
                  }
                >
                  Hapus
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
