"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ClipboardCheck, FileText, Filter, Lock, PackageSearch, Plus, QrCode, RefreshCw, Search } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Modal } from "@/components/ui/modal";
import { Button, Card, Field, Input, Label, Textarea } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";
import {
  addStockOpnameFinding, createStockOpname, getStockOpnameBom, getStockOpnameDetail,
  getStockOpnameFindings, getStockOpnameMasters, getStockOpnameWorkItems, lockStockOpname,
  saveStockOpnameBom, scanStockOpnameAsset, submitStockOpname, type StockOpnameDetailRow, type StockOpnameWorkItem,
} from "@/lib/api/stock-opname";

type Choice = { value: string; label: string };
const text = (value: unknown) => String(value ?? "").trim();
const list = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const noSo = (item: StockOpnameWorkItem) => text(item.NoSO || (item as unknown as Record<string, unknown>).no_so);
const isBom = (item: StockOpnameWorkItem) => item.IsBOM === true || Number(item.IsBOM) === 1;
const isLocked = (item: StockOpnameWorkItem) => { const value = text(item.LockedDate); return Boolean(value && value !== "-" && !value.startsWith("0000")); };

function choices(source: unknown, key: "companies" | "categories" | "locations"): Choice[] {
  const object = source && typeof source === "object" ? source as Record<string, unknown> : {};
  const rows = Array.isArray(object[key]) ? object[key] as Array<Record<string, unknown>> : [];
  const valueKeys = key === "companies" ? ["companyId", "value", "id"] : key === "categories" ? ["categoryCode", "value", "id"] : ["locationCode", "value", "id"];
  const labelKeys = key === "companies" ? ["companyName", "label", "name"] : key === "categories" ? ["categoryName", "label", "name"] : ["locationName", "label", "name"];
  return rows.map((row) => ({ value: text(valueKeys.map((field) => row[field]).find(Boolean)), label: text(labelKeys.map((field) => row[field]).find(Boolean)) })).filter((row) => row.value);
}

function Checks({ label, rows, values, change }: { label: string; rows: Choice[]; values: string[]; change: (next: string[]) => void }) {
  return <div><Label>{label}</Label><div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">{rows.map((row) => <label key={row.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={values.includes(row.value)} onChange={() => change(values.includes(row.value) ? values.filter((value) => value !== row.value) : [...values, row.value])}/><span>{row.label || row.value}</span></label>)}</div></div>;
}

function CreateDialog({ close, saved }: { close: () => void; saved: () => Promise<unknown> }) {
  const toast = useToast();
  const masters = useQuery({ queryKey: ["stock-opname-masters"], queryFn: ({ signal }) => getStockOpnameMasters(signal) });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ Tanggal: new Date().toISOString().slice(0, 10), IdCompanies: [] as string[], IdCategories: [] as string[], IdLocations: [] as string[], IsBOM: false });
  const data = masters.data?.data;
  const save = async () => { setBusy(true); try { await createStockOpname(form); toast.success("Stock Opname dibuat"); await saved(); close(); } catch (error) { toast.error("Gagal membuat Stock Opname", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  return <Modal open onClose={close} title="Buat Stock Opname" description="Buat sesi manual untuk asset atau BOM / Part." size="2xl" footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={busy} onClick={save}>Buat Stock Opname</Button></>}>
    {masters.isLoading ? <LoadingSkeleton rows={5}/> : masters.error ? <ErrorState error={masters.error} onRetry={() => masters.refetch()}/> : <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Tanggal"><Input type="date" value={form.Tanggal} onChange={(event) => setForm((value) => ({ ...value, Tanggal: event.target.value }))}/></Field>
      <label className="mt-6 flex items-center gap-2 rounded-lg border border-slate-200 px-3"><input type="checkbox" checked={form.IsBOM} onChange={(event) => setForm((value) => ({ ...value, IsBOM: event.target.checked }))}/><span className="text-sm font-medium">Stock Opname BOM / Part</span></label>
      <Checks label="Company" rows={choices(data, "companies")} values={form.IdCompanies} change={(next) => setForm((value) => ({ ...value, IdCompanies: next }))}/>
      <Checks label="Kategori" rows={choices(data, "categories")} values={form.IdCategories} change={(next) => setForm((value) => ({ ...value, IdCategories: next }))}/>
      <div className="sm:col-span-2"><Checks label="Lokasi" rows={choices(data, "locations")} values={form.IdLocations} change={(next) => setForm((value) => ({ ...value, IdLocations: next }))}/></div>
    </div>}
  </Modal>;
}

type BomNode = Record<string, unknown>;
type BomFlat = { node: BomNode; path: number[]; depth: number };
function flattenBom(rows: unknown[], depth = 0, parent: number[] = []): BomFlat[] {
  const output: BomFlat[] = [];
  rows.forEach((raw, index) => { if (!raw || typeof raw !== "object") return; const node = raw as BomNode; const path = [...parent, index]; output.push({ node, path, depth }); const children = Array.isArray(node.parts) ? node.parts : Array.isArray(node.children) ? node.children : []; output.push(...flattenBom(children, depth + 1, path)); });
  return output;
}
function updateBom(rows: unknown[], path: number[], patch: BomNode): unknown[] {
  const copy = structuredClone(rows) as BomNode[]; let current = copy[path[0]!]!;
  for (let i = 1; i < path.length; i++) { const children = (Array.isArray(current.parts) ? current.parts : current.children) as BomNode[]; current = children[path[i]!]!; }
  Object.assign(current, patch); return copy;
}

function BomDialog({ session, asset, editable = true, close, refreshed }: { session: StockOpnameWorkItem; asset: StockOpnameDetailRow; editable?: boolean; close: () => void; refreshed: () => Promise<unknown> }) {
  const toast = useToast(); const sessionNo = noSo(session);
  const query = useQuery({ queryKey: ["stock-opname-bom", sessionNo, asset.asset_code], queryFn: ({ signal }) => getStockOpnameBom(sessionNo, asset.asset_code, signal) });
  const [draft, setDraft] = useState<unknown[] | null>(null); const [busy, setBusy] = useState(false);
  const rows = draft ?? query.data?.data ?? []; const flat = flattenBom(rows);
  const save = async () => { setBusy(true); try { await saveStockOpnameBom(sessionNo, asset.asset_code, rows as Array<Record<string, unknown>>); toast.success("Hasil BOM disimpan"); await refreshed(); close(); } catch (error) { toast.error("Gagal menyimpan BOM", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  return <Modal open onClose={close} title={`Pemeriksaan BOM — ${asset.asset_code}`} description={asset.asset_name} size="2xl" footer={<><Button variant="secondary" onClick={close}>Tutup</Button>{editable && !isLocked(session) ? <Button loading={busy} onClick={save}>Simpan Hasil</Button> : null}</>}>
    {query.isLoading ? <LoadingSkeleton rows={5}/> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()}/> : !flat.length ? <EmptyState title="BOM tidak ditemukan"/> : <div className="max-h-[62vh] space-y-2 overflow-auto">{flat.map(({ node, path, depth }, index) => { const name = text(node.Part ?? node.part ?? node.header ?? node.PartName) || "BOM item"; const onHand = text(node.QtyOnHand ?? node.qtyOnHand ?? node.qty_on_hand); const found = text(node.QtyFound ?? node.qtyFound ?? node.qty_found); const remark = text(node.Remark ?? node.remark); const parent = Array.isArray(node.parts) || Array.isArray(node.children); return <div key={`${path.join("-")}-${index}`} className={`grid gap-2 rounded-lg border p-3 ${parent ? "bg-slate-50" : "bg-white"}`} style={{ marginLeft: Math.min(depth * 14, 56) }}><div className="flex items-center justify-between"><div><p className="font-medium">{name}</p><p className="text-xs text-slate-500">Qty master: {onHand || "0"}</p></div>{parent ? <StatusBadge status="GROUP"/> : null}</div>{!parent ? <div className="grid gap-2 sm:grid-cols-[140px_1fr]"><Field label="Qty ditemukan"><Input type="number" min={0} disabled={isLocked(session)} value={found} onChange={(event) => setDraft(updateBom(rows, path, { QtyFound: event.target.value, qtyFound: event.target.value }))}/></Field><Field label="Catatan"><Input disabled={isLocked(session)} value={remark} onChange={(event) => setDraft(updateBom(rows, path, { Remark: event.target.value, remark: event.target.value }))}/></Field></div> : null}</div>; })}</div>}
  </Modal>;
}

function FindingDialog({ session, close, saved }: { session: StockOpnameWorkItem; close: () => void; saved: () => Promise<unknown> }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [kind, setKind] = useState<"asset" | "part">("asset"); const [form, setForm] = useState({ name: "", location_code: "", qty: 1, remark: "" });
  const save = async () => { setBusy(true); try { await addStockOpnameFinding(noSo(session), kind, form); toast.success(kind === "asset" ? "Asset temuan ditambahkan" : "Part temuan ditambahkan"); await saved(); close(); } catch (error) { toast.error("Gagal menyimpan temuan", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  return <Modal open onClose={close} title="Tambah Temuan" description="Catat asset atau part yang ditemukan tetapi tidak ada dalam snapshot." footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={busy} onClick={save}>Simpan</Button></>}><div className="space-y-4"><div className="flex gap-2"><Button variant={kind === "asset" ? "primary" : "secondary"} onClick={() => setKind("asset")}>Non-asset</Button><Button variant={kind === "part" ? "primary" : "secondary"} onClick={() => setKind("part")}>Part temuan</Button></div><Field label="Nama" required><Input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}/></Field>{kind === "asset" ? <Field label="Kode lokasi"><Input value={form.location_code} onChange={(event) => setForm((value) => ({ ...value, location_code: event.target.value }))}/></Field> : <Field label="Jumlah"><Input type="number" min={1} value={form.qty} onChange={(event) => setForm((value) => ({ ...value, qty: Number(event.target.value) || 1 }))}/></Field>}<Field label="Catatan"><Textarea value={form.remark} onChange={(event) => setForm((value) => ({ ...value, remark: event.target.value }))}/></Field></div></Modal>;
}

function DetailDialog({ session, canManage, close, listRefetch }: { session: StockOpnameWorkItem; canManage: boolean; close: () => void; listRefetch: () => Promise<unknown> }) {
  const toast = useToast(); const sessionNo = noSo(session); const locked = isLocked(session);
  const [q, setQ] = useState(""); const [tab, setTab] = useState<"all" | "pending" | "checked" | "findings">("all"); const [scan, setScan] = useState(""); const [busy, setBusy] = useState(false); const [bom, setBom] = useState<StockOpnameDetailRow | null>(null); const [finding, setFinding] = useState(false);
  const detail = useQuery({ queryKey: ["stock-opname-detail", sessionNo], queryFn: ({ signal }) => getStockOpnameDetail(sessionNo, signal) });
  const findings = useQuery({ queryKey: ["stock-opname-findings", sessionNo], queryFn: ({ signal }) => getStockOpnameFindings(sessionNo, signal), enabled: tab === "findings" });
  const rows = useMemo(() => (detail.data?.data.rows ?? []).filter((row) => { const match = !q || `${row.asset_code} ${row.asset_name} ${row.location}`.toLowerCase().includes(q.toLowerCase()); return match && (tab === "all" || tab === "findings" || (tab === "checked" ? row.checked : !row.checked)); }), [detail.data, q, tab]);
  const refresh = async () => { await Promise.all([detail.refetch(), findings.refetch()]); };
  const submitScan = async () => { if (!scan.trim()) return; setBusy(true); try { await scanStockOpnameAsset(sessionNo, scan.trim()); toast.success("Aset berhasil dicatat"); setScan(""); await refresh(); } catch (error) { toast.error("Aset gagal dicatat", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const workflow = text(detail.data?.data.workflow?.status || session.workflow_status || (locked ? "LOCKED" : "COUNTING")).toUpperCase();
  const editable = !locked && ["COUNTING", "RECOUNT"].includes(workflow);
  const submit = async () => { if (!confirm(`Kirim hasil ${sessionNo} ke checker? Setelah submit data tidak dapat diubah kecuali diminta recount.`)) return; setBusy(true); try { await submitStockOpname(sessionNo); toast.success("Hasil count dikirim ke checker"); await Promise.all([refresh(), listRefetch()]); } catch (error) { toast.error("Gagal submit hasil Stock Opname", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const lock = async () => { if (!confirm(`Kunci final Stock Opname ${sessionNo}?`)) return; setBusy(true); try { await lockStockOpname(sessionNo); toast.success("Stock Opname dikunci final"); await listRefetch(); close(); } catch (error) { toast.error("Gagal mengunci Stock Opname", error instanceof Error ? error.message : undefined); } finally { setBusy(false); } };
  const checked = detail.data?.data.rows.filter((row) => row.checked).length ?? 0; const total = detail.data?.data.rows.length ?? 0;
  return <Modal open onClose={close} title={`${sessionNo} · ${isBom(session) ? "BOM / Part" : "Asset"}`} description={`${list(session.companies).join(", ")} · ${list(session.locations).join(", ")}`} size="2xl" footer={<><Link className="btn-secondary" href={`/reports/stock-opname?q=${encodeURIComponent(sessionNo)}`}><FileText className="h-4 w-4"/> Laporan</Link>{editable && !canManage ? <Button loading={busy} onClick={submit}><ClipboardCheck className="h-4 w-4"/> Submit Hasil</Button> : null}{workflow === "APPROVED" && canManage ? <Button variant="danger" loading={busy} onClick={lock}><Lock className="h-4 w-4"/> Kunci Final</Button> : null}<Button variant="secondary" onClick={close}>Tutup</Button></>}>
    <div className="space-y-4"><div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-sm font-medium">Workflow Stock Opname</span><StatusBadge status={workflow}/></div><div className="grid gap-3 sm:grid-cols-3"><Card className="p-3"><p className="text-xs text-slate-500">Total snapshot</p><p className="text-xl font-bold">{total}</p></Card><Card className="p-3"><p className="text-xs text-slate-500">Sudah dihitung</p><p className="text-xl font-bold text-emerald-600">{checked}</p></Card><Card className="p-3"><p className="text-xs text-slate-500">Belum dihitung</p><p className="text-xl font-bold text-amber-600">{Math.max(0, total - checked)}</p></Card></div>
      {editable ? <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3"><Input value={scan} onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitScan(); }} placeholder="Scan atau ketik kode QR / Asset Code"/><Button loading={busy} onClick={submitScan}><QrCode className="h-4 w-4"/> Catat</Button><Button variant="secondary" onClick={() => setFinding(true)}><Plus className="h-4 w-4"/> Temuan</Button></div> : <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600"><Lock className="mr-2 inline h-4 w-4"/>{workflow === "LOCKED" ? "Sesi sudah dikunci final." : `Data count dikunci sementara karena status ${workflow}. Keputusan dilakukan dari My Work.`}</div>}
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><Input className="pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Cari kode, nama, atau lokasi…"/></div><div className="flex gap-1">{(["all", "pending", "checked", "findings"] as const).map((value) => <Button key={value} variant={tab === value ? "primary" : "secondary"} onClick={() => setTab(value)}>{value === "all" ? "Semua" : value === "pending" ? "Belum" : value === "checked" ? "Sudah" : "Temuan"}</Button>)}</div></div>
      {tab === "findings" ? findings.isLoading ? <LoadingSkeleton rows={4}/> : findings.error ? <ErrorState error={findings.error} onRetry={() => findings.refetch()}/> : <div className="grid gap-3 md:grid-cols-2"><Card className="p-4"><h3 className="mb-3 font-semibold">Non-asset</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(findings.data?.data.assets ?? [], null, 2)}</pre></Card><Card className="p-4"><h3 className="mb-3 font-semibold">Part temuan</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(findings.data?.data.parts ?? [], null, 2)}</pre></Card></div> : detail.isLoading ? <LoadingSkeleton rows={6}/> : detail.error ? <ErrorState error={detail.error} onRetry={() => detail.refetch()}/> : !rows.length ? <EmptyState title="Tidak ada data pada filter ini"/> : <div className="max-h-[48vh] overflow-auto rounded-lg border border-slate-200"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Petugas</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={`${row.asset_code}-${row.location}`}><td className="px-4 py-3"><b>{row.asset_name || "-"}</b><p className="text-xs text-slate-500">{row.asset_code} · {row.category}</p></td><td className="px-4 py-3">{row.location || "-"}<p className="text-xs text-slate-400">{row.company}</p></td><td className="px-4 py-3"><StatusBadge status={row.checked ? "SUDAH" : "BELUM"} tone={row.checked ? "green" : "amber"}/>{detail.data?.data.type === "BOM" ? <p className="mt-1 text-xs">{row.qty_found ?? 0} / {row.parts_count ?? 0} part</p> : null}</td><td className="px-4 py-3">{row.username || "-"}</td><td className="px-4 py-3 text-right">{detail.data?.data.type === "BOM" ? <Button variant="secondary" onClick={() => setBom(row)}><PackageSearch className="h-4 w-4"/> Periksa BOM</Button> : null}</td></tr>)}</tbody></table></div>}
    </div>
    {bom ? <BomDialog session={session} asset={bom} editable={editable} close={() => setBom(null)} refreshed={refresh}/> : null}{finding ? <FindingDialog session={session} close={() => setFinding(false)} saved={refresh}/> : null}
  </Modal>;
}

function StockOpnameContent() {
  const [q, setQ] = useState(""); const [type, setType] = useState<"ALL" | "ASSET" | "BOM">("ALL"); const [create, setCreate] = useState(false); const [selected, setSelected] = useState<StockOpnameWorkItem | null>(null);
  const query = useQuery({ queryKey: ["stock-opname-work-items"], queryFn: ({ signal }) => getStockOpnameWorkItems(signal) });
  const payload = query.data?.data; const rows = useMemo(() => (payload?.items ?? []).filter((item) => { const search = `${noSo(item)} ${list(item.companies).join(" ")} ${list(item.categories).join(" ")} ${list(item.locations).join(" ")}`.toLowerCase(); return (!q || search.includes(q.toLowerCase())) && (type === "ALL" || (type === "BOM") === isBom(item)); }), [payload, q, type]);
  return <PageContainer title="Stock Opname" description="Stock Opname aset dan BOM / Part. Web dan tablet memakai data serta assignment yang sama." actions={<div className="flex gap-2"><Button variant="secondary" onClick={() => query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}/> Refresh</Button>{payload?.can_manage ? <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4"/> Buat SO</Button> : null}</div>}>
    <Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><Input className="pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Cari No. SO, company, kategori, atau lokasi…"/></div><div className="flex gap-1"><Filter className="mt-2 h-4 w-4 text-slate-400"/>{(["ALL", "ASSET", "BOM"] as const).map((value) => <Button key={value} variant={type === value ? "primary" : "secondary"} onClick={() => setType(value)}>{value === "ALL" ? "Semua" : value === "ASSET" ? "Asset" : "BOM"}</Button>)}</div></div></Card>
    {query.isLoading ? <LoadingSkeleton rows={7}/> : query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()}/> : !rows.length ? <EmptyState title="Tidak ada tugas Stock Opname" description={payload?.can_manage ? "Belum ada sesi Stock Opname." : "Belum ada NoSO/lokasi yang ditugaskan kepada Anda."}/> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((item) => <Card key={noSo(item)} className="p-4"><div className="flex items-start justify-between gap-3"><span className={`rounded-lg p-2 ${isBom(item) ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{isBom(item) ? <Boxes className="h-5 w-5"/> : <ClipboardCheck className="h-5 w-5"/>}</span><StatusBadge status={text(item.workflow_status || (isLocked(item) ? "LOCKED" : "COUNTING"))}/></div><button className="mt-3 text-left text-base font-semibold hover:text-brand-600" onClick={() => setSelected(item)}>{noSo(item)}</button><p className="mt-1 text-xs text-slate-500">{text(item.Tanggal)} · {isBom(item) ? "BOM / Part" : "Asset"}</p><div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><p><b>Company:</b> {list(item.companies).join(", ") || "-"}</p><p className="mt-1"><b>Kategori:</b> {list(item.categories).join(", ") || "-"}</p><p className="mt-1"><b>Lokasi:</b> {list(item.locations).join(", ") || "-"}</p></div><Button className="mt-3 w-full" variant="secondary" onClick={() => setSelected(item)}>Buka Stock Opname</Button></Card>)}</div>}
    {create ? <CreateDialog close={() => setCreate(false)} saved={() => query.refetch()}/> : null}{selected ? <DetailDialog session={selected} canManage={Boolean(payload?.can_manage)} close={() => setSelected(null)} listRefetch={() => query.refetch()}/> : null}
  </PageContainer>;
}

export default function StockOpnamePage() {
  return <PermissionGuard permission={[PERMISSIONS.stockOpname, PERMISSIONS.schedule]} mode="page"><StockOpnameContent/></PermissionGuard>;
}
