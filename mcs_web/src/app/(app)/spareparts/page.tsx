"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Link2, MapPinned, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { SparepartReceivingPanel } from "@/components/spareparts/sparepart-receiving";
import { SparepartWoFlowPanel } from "@/components/spareparts/sparepart-wo-flow";
import { SparepartInventoryControlPanel } from "@/components/spareparts/sparepart-inventory-control";
import { SparepartErpCatalogPanel } from "@/components/spareparts/sparepart-erp-catalog";
import { SparepartGovernancePanel } from "@/components/spareparts/sparepart-governance";
import { SparepartHistoryPanel } from "@/components/spareparts/sparepart-history";
import { PageContainer } from "@/components/layout/page-container";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  createSparepart, createSparepartBin, createSparepartCompatibility, createSparepartErpMapping,
  createSparepartRack, createSparepartWarehouse, deleteSparepartCompatibility,
  getSparepartFoundation, updateSparepart, updateSparepartBin, updateSparepartErpMapping,
  updateSparepartRack, updateSparepartWarehouse,
} from "@/lib/api/spareparts";
import type { SparepartCompatibility, SparepartErpMapping, SparepartMaster } from "@/types/sparepart";

type FormKind = "part" | "compatibility" | "warehouse" | "rack" | "bin" | "erp" | null;
type Form = Record<string, string | boolean>;
const emptyPart = (): Form => ({ part_code: "", part_name: "", part_number: "", category: "", brand: "", model: "", base_uom: "PCS", criticality: "NORMAL", status: "ACTIVE", description: "", is_serialized: false, is_lot_controlled: false, has_expiry: false });

const CRITICALITY_LABEL: Record<string, string> = { LOW: "Rendah", NORMAL: "Normal", HIGH: "Tinggi", CRITICAL: "Kritis" };

export default function SparepartFoundationPage() {
  const toast = useToast();
  const [tab, setTab] = useState("receiving");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [kind, setKind] = useState<FormKind>(null);
  const [form, setForm] = useState<Form>(emptyPart);
  const [editingPart, setEditingPart] = useState<SparepartMaster | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [asset, setAsset] = useState({ id: "", code: "", name: "" });
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ["sparepart-foundation", q, status], queryFn: ({ signal }) => getSparepartFoundation({ q, status }, signal) });
  const data = query.data?.data;
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const close = () => { setKind(null); setEditingPart(null); setEditingId(null); setAsset({ id: "", code: "", name: "" }); setForm(emptyPart()); };
  const open = (next: Exclude<FormKind, null>) => { setEditingId(null); setForm(next === "part" ? emptyPart() : next === "compatibility" ? { sparepart_id: "", compatibility_type: "ASSET", asset_category: "", notes: "" } : next === "warehouse" ? { warehouse_code: "", warehouse_name: "", company_code: "GLOBAL", location_description: "", custodian_name: "", status: "ACTIVE" } : next === "rack" ? { warehouse_id: "", rack_code: "", rack_name: "", status: "ACTIVE" } : next === "bin" ? { rack_id: "", bin_code: "", bin_name: "", status: "ACTIVE" } : { sparepart_id: "", company_code: "GLOBAL", erp_system: "ERP_REFERENCE", erp_item_code: "", erp_item_name: "", erp_uom: "", status: "ACTIVE" }); setKind(next); };
  const editPart = (part: SparepartMaster) => { setEditingPart(part); setForm({ part_code: part.part_code, part_name: part.part_name, part_number: part.part_number ?? "", category: part.category ?? "", brand: part.brand ?? "", model: part.model ?? "", base_uom: part.base_uom, criticality: part.criticality, status: part.status, description: part.description ?? "", is_serialized: Boolean(part.is_serialized), is_lot_controlled: Boolean(part.is_lot_controlled), has_expiry: Boolean(part.has_expiry) }); setKind("part"); };

  const save = async () => {
    if (!kind) return;
    setSaving(true);
    try {
      if (kind === "part") {
        if (editingPart) await updateSparepart(editingPart.id, form);
        else await createSparepart(form);
      }
      if (kind === "compatibility") await createSparepartCompatibility({ ...form, asset_id: asset.id || undefined });
      if (kind === "warehouse") {
        if (editingId) await updateSparepartWarehouse(editingId, form); else await createSparepartWarehouse(form);
      }
      if (kind === "rack") {
        if (editingId) await updateSparepartRack(editingId, form); else await createSparepartRack(form);
      }
      if (kind === "bin") {
        if (editingId) await updateSparepartBin(editingId, form); else await createSparepartBin(form);
      }
      if (kind === "erp") {
        if (editingId) await updateSparepartErpMapping(editingId, form); else await createSparepartErpMapping(form);
      }
      toast.success("Data Sparepart berhasil disimpan"); close(); await query.refetch();
    } catch (error) { toast.error("Data Sparepart gagal disimpan", error instanceof Error ? error.message : undefined); }
    finally { setSaving(false); }
  };

  const removeCompatibility = async (id: number) => {
    try { await deleteSparepartCompatibility(id); toast.success("Kompatibilitas berhasil dihapus"); await query.refetch(); }
    catch (error) { toast.error("Kompatibilitas gagal dihapus", error instanceof Error ? error.message : undefined); }
  };

  const partColumns: Column<SparepartMaster>[] = [
    { key: "part", header: "Sparepart", cell: (row) => <div><p className="font-medium text-slate-900">{row.part_name}</p><p className="text-xs text-slate-500">{row.part_code}{row.part_number ? ` · ${row.part_number}` : ""}</p></div> },
    { key: "category", header: "Kategori / Brand", cell: (row) => <div>{row.category || "-"}<p className="text-xs text-slate-400">{[row.brand,row.model].filter(Boolean).join(" · ") || "-"}</p></div> },
    { key: "control", header: "Kontrol", cell: (row) => <div className="flex flex-wrap gap-1 text-xs">{row.is_serialized ? <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Serial</span> : null}{row.is_lot_controlled ? <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">Lot</span> : null}{row.has_expiry ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Expiry</span> : null}{!row.is_serialized&&!row.is_lot_controlled&&!row.has_expiry ? "-" : null}</div> },
    { key: "criticality", header: "Criticality", cell: (row) => <span className={row.criticality === "CRITICAL" ? "font-semibold text-rose-600" : row.criticality === "HIGH" ? "text-amber-600" : "text-slate-600"}>{CRITICALITY_LABEL[row.criticality]}</span> },
    { key: "relation", header: "Relasi", cell: (row) => <span className="text-xs">{row.compatibility_count} asset/kategori<br />{row.erp_mapping_count} mapping ERP</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "action", header: "Aksi", align: "right", cell: (row) => <Button variant="ghost" onClick={() => editPart(row)}><Pencil className="h-4 w-4" /> Ubah</Button> },
  ];
  const compatibilityColumns: Column<SparepartCompatibility>[] = [
    { key: "part", header: "Sparepart", cell: (row) => <div className="font-medium">{row.part_name}<p className="text-xs font-normal text-slate-400">{row.part_code}</p></div> },
    { key: "type", header: "Cakupan", cell: (row) => row.compatibility_type === "ASSET" ? "Asset tertentu" : "Kategori asset" },
    { key: "target", header: "Asset / Kategori", cell: (row) => row.compatibility_type === "ASSET" ? <div>{row.AssetName}<p className="text-xs text-slate-400">{row.AssetCode} · {row.CompanyName}</p></div> : row.asset_category },
    { key: "notes", header: "Catatan", cell: (row) => row.notes || "-" },
    { key: "action", header: "Aksi", align: "right", cell: (row) => <Button variant="ghost" className="text-rose-600" onClick={() => removeCompatibility(row.id)}><Trash2 className="h-4 w-4" /> Hapus</Button> },
  ];
  const erpColumns: Column<SparepartErpMapping>[] = [
    { key: "part", header: "Sparepart MCS", cell: (row) => <div className="font-medium">{row.part_name}<p className="text-xs font-normal text-slate-400">{row.part_code}</p></div> },
    { key: "company_code", header: "Perusahaan" }, { key: "erp_system", header: "Sistem" },
    { key: "erp_item", header: "Item ERP", cell: (row) => <div>{row.erp_item_name || "-"}<p className="text-xs text-slate-400">{row.erp_item_code} · {row.erp_uom || "-"}</p></div> },
    { key: "mode", header: "Mode", cell: () => <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Referensi saja</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "action", header: "Aksi", align: "right", cell: (row) => <Button variant="ghost" onClick={()=>{setEditingId(row.id);setForm({sparepart_id:String(row.sparepart_id),company_code:row.company_code,erp_system:row.erp_system,erp_item_code:row.erp_item_code,erp_item_name:row.erp_item_name??"",erp_uom:row.erp_uom??"",status:row.status});setKind("erp");}}><Pencil className="h-4 w-4"/> Ubah</Button> },
  ];

  return <PageContainer title="Sparepart Management" description="Fondasi master sparepart, kompatibilitas asset, lokasi penyimpanan, dan referensi ERP.">
    <div className="grid gap-3 sm:grid-cols-4">
      <Card className="p-4"><p className="text-2xl font-semibold">{data?.parts.length ?? 0}</p><p className="text-xs text-slate-500">Master sparepart</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold">{data?.compatibility.length ?? 0}</p><p className="text-xs text-slate-500">Relasi kompatibilitas</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold">{data?.warehouses.length ?? 0}</p><p className="text-xs text-slate-500">Warehouse</p></Card>
      <Card className="p-4"><p className="text-2xl font-semibold">{data?.erp_mappings.length ?? 0}</p><p className="text-xs text-slate-500">Referensi ERP</p></Card>
    </div>
    <Tabs value={tab} onChange={setTab} items={[{key:"receiving",label:"Penerimaan & Stok"},{key:"inventory",label:"Transfer, SO & Control"},{key:"wo",label:"Request & Issue WO"},{key:"history",label:"Riwayat Asset / WO"},{key:"erp-catalog",label:"Katalog & Saldo ERP"},{key:"governance",label:"Governance"},{key:"master",label:"Master Sparepart",count:data?.parts.length},{key:"compatibility",label:"Kompatibilitas Asset",count:data?.compatibility.length},{key:"location",label:"Warehouse / Rack / Bin",count:data?.bins.length},{key:"erp",label:"Mapping ERP",count:data?.erp_mappings.length}]} />
    {tab === "receiving" ? <SparepartReceivingPanel /> : null}
    {tab === "inventory" ? <SparepartInventoryControlPanel /> : null}
    {tab === "wo" ? <SparepartWoFlowPanel /> : null}
    {tab === "history" ? <SparepartHistoryPanel /> : null}
    {tab === "erp-catalog" ? <SparepartErpCatalogPanel onSynced={()=>void query.refetch()} /> : null}
    {tab === "governance" ? <SparepartGovernancePanel /> : null}
    {tab === "master" ? <>
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cari kode, nama, part number, atau kategori…" className="sm:max-w-md" /><Select value={status} onChange={(e)=>setStatus(e.target.value)} className="sm:max-w-40"><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></Select><Button className="sm:ml-auto" onClick={()=>open("part")}><Plus className="h-4 w-4" /> Tambah Sparepart</Button></div>
      <DataTable columns={partColumns} data={data?.parts} rowKey={(row)=>row.id} isLoading={query.isLoading} error={query.error} onRetry={()=>query.refetch()} emptyTitle="Belum ada master sparepart" />
    </> : null}
    {tab === "compatibility" ? <><div className="flex justify-end"><Button onClick={()=>open("compatibility")}><Link2 className="h-4 w-4" /> Tambah Kompatibilitas</Button></div><DataTable columns={compatibilityColumns} data={data?.compatibility} rowKey={(row)=>row.id} isLoading={query.isLoading} /></> : null}
    {tab === "location" ? <><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={()=>open("warehouse")}><Plus className="h-4 w-4" /> Warehouse</Button><Button variant="secondary" onClick={()=>open("rack")}><Plus className="h-4 w-4" /> Rack</Button><Button onClick={()=>open("bin")}><Plus className="h-4 w-4" /> Bin</Button></div><div className="space-y-3">{(data?.warehouses ?? []).map((warehouse)=><Card key={warehouse.id} className="overflow-hidden"><div className="flex items-center gap-3 border-b bg-slate-50 px-4 py-3"><MapPinned className="h-5 w-5 text-brand-600"/><div><p className="font-semibold">{warehouse.warehouse_name}</p><p className="text-xs text-slate-500">{warehouse.warehouse_code} · {warehouse.company_code}</p></div><StatusBadge status={warehouse.status}/><Button variant="ghost" className="ml-auto" onClick={()=>{setEditingId(warehouse.id);setForm({warehouse_code:warehouse.warehouse_code,warehouse_name:warehouse.warehouse_name,company_code:warehouse.company_code,location_description:warehouse.location_description??"",custodian_name:warehouse.custodian_name??"",status:warehouse.status});setKind("warehouse");}}><Pencil className="h-4 w-4"/></Button></div><div className="divide-y">{(data?.racks ?? []).filter((rack)=>rack.warehouse_id===warehouse.id).map((rack)=><div key={rack.id} className="px-4 py-3"><div className="flex items-center"><p className="text-sm font-medium">Rack {rack.rack_code} {rack.rack_name ? `— ${rack.rack_name}` : ""}</p><Button variant="ghost" className="ml-auto" onClick={()=>{setEditingId(rack.id);setForm({warehouse_id:String(rack.warehouse_id),rack_code:rack.rack_code,rack_name:rack.rack_name??"",status:rack.status});setKind("rack");}}><Pencil className="h-3.5 w-3.5"/></Button></div><div className="mt-2 flex flex-wrap gap-2">{(data?.bins ?? []).filter((bin)=>bin.rack_id===rack.id).map((bin)=><button type="button" key={bin.id} onClick={()=>{setEditingId(bin.id);setForm({rack_id:String(bin.rack_id),bin_code:bin.bin_code,bin_name:bin.bin_name??"",status:bin.status});setKind("bin");}} className="rounded-md border bg-white px-2.5 py-1 text-xs hover:border-brand-300 hover:bg-brand-50"><Boxes className="mr-1 inline h-3 w-3"/>{bin.bin_code}{bin.bin_name ? ` · ${bin.bin_name}` : ""}</button>)}{!(data?.bins ?? []).some((bin)=>bin.rack_id===rack.id)?<span className="text-xs text-slate-400">Belum ada bin.</span>:null}</div></div>)}{!(data?.racks ?? []).some((rack)=>rack.warehouse_id===warehouse.id)?<p className="px-4 py-4 text-sm text-slate-400">Belum ada rack.</p>:null}</div></Card>)}{!data?.warehouses.length?<Card className="p-6 text-center text-sm text-slate-500">Belum ada warehouse.</Card>:null}</div></> : null}
    {tab === "erp" ? <><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Mapping ini tidak melakukan posting stok, valuasi, GL, atau HPP ke ERP.</p><Button onClick={()=>open("erp")}><RefreshCw className="h-4 w-4" /> Tambah Mapping</Button></div><DataTable columns={erpColumns} data={data?.erp_mappings} rowKey={(row)=>row.id} isLoading={query.isLoading}/></> : null}

    <Modal open={kind!==null} onClose={close} title={kind==="part"?(editingPart?"Ubah Master Sparepart":"Tambah Master Sparepart"):kind==="compatibility"?"Tambah Kompatibilitas Asset":`${editingId?"Ubah":"Tambah"} ${kind==="warehouse"?"Warehouse":kind==="rack"?"Rack":kind==="bin"?"Bin":"Mapping ERP"}`} size={kind==="part"?"xl":"lg"} footer={<><Button variant="secondary" onClick={close}>Batal</Button><Button loading={saving} onClick={save}>Simpan</Button></>}>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {kind==="part"?<><Field label="Kode sparepart" required><Input value={String(form.part_code??"")} onChange={(e)=>set("part_code",e.target.value.toUpperCase())}/></Field><Field label="Nama sparepart" required><Input value={String(form.part_name??"")} onChange={(e)=>set("part_name",e.target.value)}/></Field><Field label="Part number"><Input value={String(form.part_number??"")} onChange={(e)=>set("part_number",e.target.value)}/></Field><Field label="Kategori"><Input value={String(form.category??"")} onChange={(e)=>set("category",e.target.value)}/></Field><Field label="Brand"><Input value={String(form.brand??"")} onChange={(e)=>set("brand",e.target.value)}/></Field><Field label="Model"><Input value={String(form.model??"")} onChange={(e)=>set("model",e.target.value)}/></Field><Field label="Satuan dasar" required><Input value={String(form.base_uom??"")} onChange={(e)=>set("base_uom",e.target.value.toUpperCase())}/></Field><Field label="Criticality" required><Select value={String(form.criticality)} onChange={(e)=>set("criticality",e.target.value)}>{Object.entries(CRITICALITY_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>{editingPart?<Field label="Status"><Select value={String(form.status)} onChange={(e)=>set("status",e.target.value)}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></Select></Field>:null}<div className="sm:col-span-2 flex flex-wrap gap-4 text-sm">{([ ["is_serialized","Wajib serial number"], ["is_lot_controlled","Kontrol lot/batch"], ["has_expiry","Memiliki expiry date"] ] as const).map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form[key])} onChange={(e)=>set(key,e.target.checked)}/>{label}</label>)}</div><div className="sm:col-span-2"><Field label="Deskripsi"><Textarea value={String(form.description??"")} onChange={(e)=>set("description",e.target.value)}/></Field></div></>:null}
        {kind==="compatibility"?<><Field label="Sparepart" required><Select value={String(form.sparepart_id)} onChange={(e)=>set("sparepart_id",e.target.value)}><option value="">Pilih sparepart…</option>{data?.parts.filter((p)=>p.status==="ACTIVE").map((p)=><option key={p.id} value={p.id}>{p.part_code} · {p.part_name}</option>)}</Select></Field><Field label="Cakupan" required><Select value={String(form.compatibility_type)} onChange={(e)=>{set("compatibility_type",e.target.value);setAsset({id:"",code:"",name:""});}}><option value="ASSET">Asset tertentu</option><option value="ASSET_CATEGORY">Kategori asset</option></Select></Field><div className="sm:col-span-2">{form.compatibility_type==="ASSET"?<Field label="Asset existing" required><AssetPicker selectedCode={asset.code} selectedName={asset.name} forWorkOrder onSelect={(code,name,_company,_photo,_photos,id)=>setAsset({id:id??"",code,name})} onClear={()=>setAsset({id:"",code:"",name:""})}/></Field>:<Field label="Kategori asset" required><Select value={String(form.asset_category)} onChange={(e)=>set("asset_category",e.target.value)}><option value="">Pilih kategori…</option>{data?.asset_categories.map((item)=><option key={item}>{item}</option>)}</Select></Field>}</div><div className="sm:col-span-2"><Field label="Catatan"><Textarea value={String(form.notes??"")} onChange={(e)=>set("notes",e.target.value)}/></Field></div></>:null}
        {kind==="warehouse"?<><Field label="Kode warehouse" required><Input value={String(form.warehouse_code)} onChange={(e)=>set("warehouse_code",e.target.value.toUpperCase())}/></Field><Field label="Nama warehouse" required><Input value={String(form.warehouse_name)} onChange={(e)=>set("warehouse_name",e.target.value)}/></Field><Field label="Perusahaan" required><Input list="sparepart-companies" value={String(form.company_code)} onChange={(e)=>set("company_code",e.target.value)}/><datalist id="sparepart-companies">{data?.companies.map((item)=><option key={item} value={item}/>)}</datalist></Field><Field label="Custodian"><Input value={String(form.custodian_name)} onChange={(e)=>set("custodian_name",e.target.value)}/></Field><div className="sm:col-span-2"><Field label="Lokasi"><Input value={String(form.location_description)} onChange={(e)=>set("location_description",e.target.value)}/></Field></div></>:null}
        {kind==="rack"?<><Field label="Warehouse" required><Select value={String(form.warehouse_id)} onChange={(e)=>set("warehouse_id",e.target.value)}><option value="">Pilih warehouse…</option>{data?.warehouses.filter((x)=>x.status==="ACTIVE").map((x)=><option key={x.id} value={x.id}>{x.warehouse_code} · {x.warehouse_name}</option>)}</Select></Field><Field label="Kode rack" required><Input value={String(form.rack_code)} onChange={(e)=>set("rack_code",e.target.value.toUpperCase())}/></Field><div className="sm:col-span-2"><Field label="Nama rack"><Input value={String(form.rack_name)} onChange={(e)=>set("rack_name",e.target.value)}/></Field></div></>:null}
        {kind==="bin"?<><Field label="Rack" required><Select value={String(form.rack_id)} onChange={(e)=>set("rack_id",e.target.value)}><option value="">Pilih rack…</option>{data?.racks.filter((x)=>x.status==="ACTIVE").map((x)=><option key={x.id} value={x.id}>{x.warehouse_code} / {x.rack_code}</option>)}</Select></Field><Field label="Kode bin" required><Input value={String(form.bin_code)} onChange={(e)=>set("bin_code",e.target.value.toUpperCase())}/></Field><div className="sm:col-span-2"><Field label="Nama bin"><Input value={String(form.bin_name)} onChange={(e)=>set("bin_name",e.target.value)}/></Field></div></>:null}
        {kind==="erp"?<><Field label="Sparepart" required><Select value={String(form.sparepart_id)} onChange={(e)=>set("sparepart_id",e.target.value)}><option value="">Pilih sparepart…</option>{data?.parts.filter((p)=>p.status==="ACTIVE").map((p)=><option key={p.id} value={p.id}>{p.part_code} · {p.part_name}</option>)}</Select></Field><Field label="Perusahaan" required><Input list="erp-companies" value={String(form.company_code)} onChange={(e)=>set("company_code",e.target.value)}/><datalist id="erp-companies">{data?.companies.map((item)=><option key={item} value={item}/>)}</datalist></Field><Field label="Sistem ERP" required><Input value={String(form.erp_system)} onChange={(e)=>set("erp_system",e.target.value.toUpperCase())}/></Field><Field label="Kode item ERP" required><Input value={String(form.erp_item_code)} onChange={(e)=>set("erp_item_code",e.target.value)}/></Field><Field label="Nama item ERP"><Input value={String(form.erp_item_name)} onChange={(e)=>set("erp_item_name",e.target.value)}/></Field><Field label="UOM ERP"><Input value={String(form.erp_uom)} onChange={(e)=>set("erp_uom",e.target.value.toUpperCase())}/></Field><div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Mode dikunci sebagai <strong>REFERENCE_ONLY</strong>. Tidak ada posting stok, valuasi, atau jurnal ke ERP.</div></>:null}
        {editingId && kind!=="part" && kind!=="compatibility" ? <Field label="Status"><Select value={String(form.status)} onChange={(e)=>set("status",e.target.value)}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></Select></Field> : null}
      </div>
    </Modal>
  </PageContainer>;
}
