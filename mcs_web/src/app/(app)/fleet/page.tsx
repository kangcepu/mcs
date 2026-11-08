"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ClipboardCheck, Fuel, Gauge, Plus, Truck, Wrench } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { PageContainer } from "@/components/layout/page-container";
import { Modal } from "@/components/ui/modal";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/ui/permission-guard";
import {
  createFleetFuel,
  createFleetInspection,
  createFleetMeterReading,
  createFleetProfile,
  createFleetService,
  getFleetOverview,
  resolveFleetAnomaly,
  reviewFleetFuel,
  reviewFleetInspection,
  submitFleetFuel,
  submitFleetInspection,
} from "@/lib/api/fleet";
import { PERMISSIONS } from "@/lib/permissions";
import type { FleetOverview, FleetProfile } from "@/types/fleet";

type FormKind = "profile" | "meter" | "inspection" | "fuel" | "service" | null;
type FormState = Record<string, string | boolean>;

const nowInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const emptyForm = (): FormState => ({
  vehicle_type: "VEHICLE",
  meter_type: "ODOMETER",
  fuel_type: "DIESEL",
  inspection_frequency: "DAILY",
  current_meter: "0",
  reading_at: nowInput(),
  inspected_at: nowInput(),
  fueled_at: nowInput(),
  started_at: nowInput(),
  service_type: "PREVENTIVE",
  status: "COMPLETED",
  completed_at: nowInput(),
  full_tank: false,
  unsafe_to_operate: false,
});

const INSPECTION_ITEMS: Record<string, string[]> = {
  VEHICLE: ["Rem", "Lampu", "Ban", "Klakson", "Fluida", "Sabuk pengaman", "Kebocoran"],
  FORKLIFT: ["Rem", "Klakson", "Fork", "Mast", "Hidrolik", "Ban", "Lampu", "Sabuk pengaman"],
};

function metric(value: number, label: string, icon: React.ReactNode, tone: string) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>{icon}</div>
      <div><p className="text-2xl font-semibold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
    </Card>
  );
}

function formatMeter(profile: Pick<FleetProfile, "current_meter" | "meter_type">) {
  return `${Number(profile.current_meter).toLocaleString("id-ID")} ${profile.meter_type === "ODOMETER" ? "km" : "jam"}`;
}

function AssetLink({ code, name }: { code: string; name: string }) {
  return <Link className="font-medium text-brand-700 hover:underline" href={`/assets/${code.split("/").map(encodeURIComponent).join("/")}`}>{name}<span className="block text-xs font-normal text-slate-400">{code}</span></Link>;
}

export default function FleetPage() {
  const canWrite = useCan(PERMISSIONS.privilageAsset);
  const toast = useToast();
  const query = useQuery({ queryKey: ["fleet-overview"], queryFn: ({ signal }) => getFleetOverview(signal) });
  const data = query.data?.data;
  const [tab, setTab] = useState("master");
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState({ id: "", code: "", name: "" });
  const [inspectionResults, setInspectionResults] = useState<Record<string, "PASS" | "FAIL">>({});
  const [resolving, setResolving] = useState<number | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const profiles = data?.profiles ?? [];
  const selectedProfile = profiles.find((item) => String(item.id) === String(form.vehicle_id));
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const open = (kind: Exclude<FormKind, null>, profile?: FleetProfile) => {
    const initial = emptyForm();
    if (profile) {
      initial.vehicle_id = String(profile.id);
      initial.current_value = String(profile.current_meter);
      initial.meter_value = String(profile.current_meter);
      initial.meter_before = String(profile.current_meter);
      initial.meter_after = String(profile.current_meter);
    }
    setForm(initial); setInspectionResults({}); setFormKind(kind);
  };

  const requiredItems = useMemo(() => INSPECTION_ITEMS[selectedProfile?.vehicle_type ?? "VEHICLE"] ?? INSPECTION_ITEMS.VEHICLE ?? [], [selectedProfile]);

  const save = async () => {
    if (!formKind) return;
    setSaving(true);
    try {
      if (formKind === "profile") {
        if (!asset.id) throw new Error("Pilih asset existing terlebih dahulu.");
        await createFleetProfile({ ...form, asset_id: Number(asset.id) });
      } else if (formKind === "meter") {
        await createFleetMeterReading(form);
      } else if (formKind === "inspection") {
        const items = requiredItems.map((name, index) => ({ item_code: name.toUpperCase().replace(/\s+/g, "_"), item_name: name, result: inspectionResults[name] ?? "PASS", sort_order: index }));
        await createFleetInspection({ ...form, items });
      } else if (formKind === "fuel") {
        await createFleetFuel(form);
      } else if (formKind === "service") {
        await createFleetService(form);
      }
      toast.success("Data Fleet berhasil disimpan");
      setFormKind(null); setAsset({ id: "", code: "", name: "" });
      await query.refetch();
    } catch (error) {
      toast.error("Data Fleet gagal disimpan", error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  const transition = async (work: () => Promise<unknown>, success: string) => {
    try { await work(); toast.success(success); await query.refetch(); }
    catch (error) { toast.error("Proses Fleet gagal", error instanceof Error ? error.message : undefined); }
  };

  if (query.error) return <PageContainer title="Fleet & Vehicle"><Card className="p-5 text-sm text-rose-600">{query.error instanceof Error ? query.error.message : "Data Fleet gagal dimuat."}</Card></PageContainer>;

  return (
    <PageContainer title="Fleet & Vehicle" description="Kendaraan, forklift, inspeksi, solar, meter, preventive, service, dan efficiency control."
      actions={canWrite ? <Button onClick={() => open("profile")}><Plus className="h-4 w-4" /> Tambah Fleet Asset</Button> : undefined}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metric(data?.stats.total ?? 0, "Fleet asset aktif", <Truck className="h-5 w-5" />, "bg-brand-50 text-brand-700")}
        {metric(data?.stats.inspection_due ?? 0, "Inspection due", <ClipboardCheck className="h-5 w-5" />, "bg-amber-50 text-amber-700")}
        {metric(data?.stats.preventive_due ?? 0, "Preventive due", <CalendarClock className="h-5 w-5" />, "bg-violet-50 text-violet-700")}
        {metric(data?.stats.open_anomalies ?? 0, "Anomaly terbuka", <AlertTriangle className="h-5 w-5" />, "bg-rose-50 text-rose-700")}
        {metric(data?.stats.pending_approvals ?? 0, "Menunggu approval", <Gauge className="h-5 w-5" />, "bg-cyan-50 text-cyan-700")}
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { key: "master", label: "Master Fleet", count: profiles.length },
        { key: "inspection", label: "Daily Inspection", count: data?.inspections.length },
        { key: "fuel", label: "Fuel", count: data?.fuel_transactions.length },
        { key: "service", label: "Preventive & Service", count: data?.services.length },
        { key: "anomaly", label: "Anomaly", count: data?.stats.open_anomalies },
      ]} />

      {tab === "master" ? <section className="space-y-3">
        {profiles.map((item) => <Card key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><AssetLink code={item.AssetCode} name={item.AssetName} /><p className="mt-1 text-xs text-slate-500">{item.registration_number || "Tanpa nomor registrasi"} · {item.vehicle_type === "FORKLIFT" ? "Forklift" : "Kendaraan"} · {item.LocationAsset || "Lokasi belum diisi"}</p></div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{formatMeter(item)}</span>{item.inspection_due ? <StatusBadge status="Inspection due" tone="amber" /> : null}{item.preventive_due ? <StatusBadge status="Preventive due" tone="red" /> : null}</div>
          {canWrite ? <div className="flex gap-2"><Button variant="secondary" onClick={() => open("meter", item)}>Update Meter</Button><Button variant="secondary" onClick={() => open("inspection", item)}>Inspeksi</Button></div> : null}
        </Card>)}
        {!profiles.length ? <Card className="p-8 text-center text-sm text-slate-500">Belum ada Asset yang diaktifkan sebagai kendaraan atau forklift.</Card> : null}
      </section> : null}

      {tab === "inspection" ? <section className="space-y-3">
        {canWrite ? <div className="flex justify-end"><Button onClick={() => open("inspection")}><Plus className="h-4 w-4" /> Daily Inspection</Button></div> : null}
        <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Nomor / Asset","Waktu","Operator","Meter","Kondisi","Status","Aksi"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.inspections.map(item=><tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><AssetLink code={item.AssetCode} name={item.inspection_number} /></td><td className="px-4 py-3">{item.inspected_at}</td><td className="px-4 py-3">{item.operator_name}</td><td className="px-4 py-3">{Number(item.meter_value).toLocaleString("id-ID")}</td><td className="px-4 py-3"><StatusBadge status={item.overall_condition} tone={item.overall_condition === "PASS" ? "green" : "red"} /></td><td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3"><div className="flex gap-1">{item.status === "DRAFT" ? <Button variant="secondary" onClick={()=>transition(()=>submitFleetInspection(item.id),"Inspeksi diajukan")}>Submit</Button>:null}{item.status === "SUBMITTED" ? <><Button onClick={()=>transition(()=>reviewFleetInspection(item.id,"APPROVE"),"Inspeksi disetujui")}>Setujui</Button><Button variant="danger" onClick={()=>transition(()=>reviewFleetInspection(item.id,"REJECT"),"Inspeksi ditolak")}>Tolak</Button></>:null}</div></td></tr>)}</tbody></table></div>
      </section> : null}

      {tab === "fuel" ? <section className="space-y-3">
        {canWrite ? <div className="flex justify-end"><Button onClick={() => open("fuel")}><Fuel className="h-4 w-4" /> Catat Pengisian Solar</Button></div> : null}
        <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Nomor / Asset","Waktu","Liter","Efisiensi","Anomaly","Status","Aksi"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.fuel_transactions.map(item=><tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><AssetLink code={item.AssetCode} name={item.transaction_number} /></td><td className="px-4 py-3">{item.fueled_at}</td><td className="px-4 py-3">{Number(item.quantity_liter).toLocaleString("id-ID")}</td><td className="px-4 py-3">{item.efficiency_value == null ? "-" : Number(item.efficiency_value).toFixed(3)}</td><td className="px-4 py-3"><StatusBadge status={item.anomaly_status} tone={item.anomaly_status === "NORMAL" ? "green" : "red"}/></td><td className="px-4 py-3"><StatusBadge status={item.status}/></td><td className="px-4 py-3"><div className="flex gap-1">{item.status === "DRAFT"?<Button variant="secondary" onClick={()=>transition(()=>submitFleetFuel(item.id),"Transaksi diajukan")}>Submit</Button>:null}{item.status === "SUBMITTED"?<><Button onClick={()=>transition(()=>reviewFleetFuel(item.id,"APPROVE"),"Transaksi disetujui dan stok diperbarui")}>Setujui</Button><Button variant="danger" onClick={()=>transition(()=>reviewFleetFuel(item.id,"REJECT"),"Transaksi ditolak")}>Tolak</Button></>:null}</div></td></tr>)}</tbody></table></div>
      </section> : null}

      {tab === "service" ? <section className="space-y-3">
        {canWrite ? <div className="flex justify-end"><Button onClick={() => open("service")}><Wrench className="h-4 w-4" /> Catat Service</Button></div> : null}
        <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Nomor / Asset","Jenis","Mulai","Selesai","Meter","WO","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{data?.services.map(item=><tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><AssetLink code={item.AssetCode} name={item.service_number}/></td><td className="px-4 py-3">{item.service_type}</td><td className="px-4 py-3">{item.started_at}</td><td className="px-4 py-3">{item.completed_at || "-"}</td><td className="px-4 py-3">{Number(item.meter_value).toLocaleString("id-ID")}</td><td className="px-4 py-3">{item.wo_number || "-"}</td><td className="px-4 py-3"><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div>
      </section> : null}

      {tab === "anomaly" ? <section className="grid gap-3 lg:grid-cols-2">{data?.anomalies.map(item=><Card key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.anomaly_number}</p><p className="text-xs text-slate-500">{item.AssetName} · {item.AssetCode}</p></div><div className="flex gap-1"><StatusBadge status={item.severity} tone={item.severity === "CRITICAL" || item.severity === "HIGH" ? "red" : "amber"}/><StatusBadge status={item.status}/></div></div><p className="mt-3 text-sm text-slate-700">{item.description}</p><p className="mt-2 text-xs text-slate-400">{item.detected_at} · {item.anomaly_type}</p>{item.status === "OPEN" && canWrite ? <Button className="mt-3" variant="secondary" onClick={()=>{setResolving(item.id);setResolutionNote("");}}>Selesaikan</Button>:null}</Card>)}</section> : null}

      <FleetFormModal kind={formKind} form={form} set={set} profiles={profiles} data={data} asset={asset} setAsset={setAsset} selectedProfile={selectedProfile} inspectionResults={inspectionResults} setInspectionResults={setInspectionResults} requiredItems={requiredItems} saving={saving} onClose={()=>setFormKind(null)} onSave={save}/>
      <Modal open={resolving !== null} onClose={()=>setResolving(null)} title="Selesaikan Anomaly" footer={<><Button variant="secondary" onClick={()=>setResolving(null)}>Batal</Button><Button loading={saving} onClick={async()=>{if(!resolving)return;setSaving(true);try{await resolveFleetAnomaly(resolving,resolutionNote);toast.success("Anomaly diselesaikan");setResolving(null);await query.refetch();}catch(error){toast.error("Gagal menyelesaikan anomaly",error instanceof Error?error.message:undefined);}finally{setSaving(false);}}}>Simpan Penyelesaian</Button></>}><Field label="Tindakan dan hasil penyelesaian" required><Textarea value={resolutionNote} onChange={e=>setResolutionNote(e.target.value)}/></Field></Modal>
    </PageContainer>
  );
}

function FleetFormModal({kind,form,set,profiles,data,asset,setAsset,selectedProfile,inspectionResults,setInspectionResults,requiredItems,saving,onClose,onSave}:{kind:FormKind;form:FormState;set:(key:string,value:string|boolean)=>void;profiles:FleetProfile[];data?:FleetOverview;asset:{id:string;code:string;name:string};setAsset:(value:{id:string;code:string;name:string})=>void;selectedProfile?:FleetProfile;inspectionResults:Record<string,"PASS"|"FAIL">;setInspectionResults:React.Dispatch<React.SetStateAction<Record<string,"PASS"|"FAIL">>>;requiredItems:string[];saving:boolean;onClose:()=>void;onSave:()=>void}) {
  const title = kind === "profile" ? "Tambah Fleet Asset" : kind === "meter" ? "Update Odometer / Hour Meter" : kind === "inspection" ? "Daily Inspection" : kind === "fuel" ? "Pengisian Solar" : "Service & Corrective History";
  return <Modal open={kind!==null} onClose={onClose} title={title} description="Fleet tetap menggunakan Asset dan QR Code existing." size="2xl" footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button loading={saving} onClick={onSave}>Simpan Draft</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      {kind === "profile" ? <>
        <div className="sm:col-span-2"><Field label="Asset existing" required><AssetPicker selectedCode={asset.code} selectedName={asset.name} onClear={()=>setAsset({id:"",code:"",name:""})} onSelect={(code,name,_company,_photo,_photos,id)=>setAsset({id:id??"",code,name})}/></Field></div>
        <Field label="Jenis" required><Select value={String(form.vehicle_type)} onChange={e=>{set("vehicle_type",e.target.value);set("meter_type",e.target.value==="FORKLIFT"?"HOUR_METER":"ODOMETER");}}><option value="VEHICLE">Kendaraan</option><option value="FORKLIFT">Forklift</option></Select></Field>
        <Field label="Jenis meter" required><Select value={String(form.meter_type)} onChange={e=>set("meter_type",e.target.value)}><option value="ODOMETER">Odometer (km)</option><option value="HOUR_METER">Hour meter (jam)</option></Select></Field>
        <Field label="Nomor registrasi / polisi"><Input value={String(form.registration_number??"")} onChange={e=>set("registration_number",e.target.value)}/></Field>
        <Field label="Meter awal"><Input type="number" min="0" value={String(form.current_meter)} onChange={e=>set("current_meter",e.target.value)}/></Field>
        <Field label="Merek"><Input value={String(form.make??"")} onChange={e=>set("make",e.target.value)}/></Field><Field label="Model"><Input value={String(form.model??"")} onChange={e=>set("model",e.target.value)}/></Field>
        <Field label="Interval preventive (hari)"><Input type="number" min="1" value={String(form.preventive_interval_days??"")} onChange={e=>set("preventive_interval_days",e.target.value)}/></Field><Field label="Interval preventive (km/jam)"><Input type="number" min="0" value={String(form.preventive_interval_meter??"")} onChange={e=>set("preventive_interval_meter",e.target.value)}/></Field>
        <Field label="Target efisiensi"><Input type="number" step="0.001" min="0" value={String(form.fuel_efficiency_target??"")} onChange={e=>set("fuel_efficiency_target",e.target.value)}/></Field><Field label="Batas minimum efisiensi"><Input type="number" step="0.001" min="0" value={String(form.fuel_efficiency_minimum??"")} onChange={e=>set("fuel_efficiency_minimum",e.target.value)}/></Field>
        <Field label="Custodian"><Input value={String(form.custodian_name??"")} onChange={e=>set("custodian_name",e.target.value)}/></Field><Field label="Department / Cost center"><div className="grid grid-cols-2 gap-2"><Input placeholder="Department" value={String(form.department_name??"")} onChange={e=>set("department_name",e.target.value)}/><Input placeholder="Cost center" value={String(form.cost_center_code??"")} onChange={e=>set("cost_center_code",e.target.value)}/></div></Field>
      </> : null}
      {kind && kind !== "profile" ? <Field label="Fleet asset" required><Select value={String(form.vehicle_id??"")} onChange={e=>{set("vehicle_id",e.target.value);const p=profiles.find(x=>String(x.id)===e.target.value);if(p){set("meter_value",String(p.current_meter));set("current_value",String(p.current_meter));set("meter_before",String(p.current_meter));set("meter_after",String(p.current_meter));}}}><option value="">Pilih kendaraan / forklift</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.AssetCode} · {p.AssetName}</option>)}</Select></Field> : null}
      {kind === "meter" ? <><Field label="Waktu reading" required><Input type="datetime-local" value={String(form.reading_at)} onChange={e=>set("reading_at",e.target.value)}/></Field><Field label={`Nilai ${selectedProfile?.meter_type==="HOUR_METER"?"hour meter":"odometer"}`} required><Input type="number" min="0" step="0.001" value={String(form.current_value??"")} onChange={e=>set("current_value",e.target.value)}/></Field></> : null}
      {kind === "inspection" ? <><Field label="Waktu inspeksi" required><Input type="datetime-local" value={String(form.inspected_at)} onChange={e=>set("inspected_at",e.target.value)}/></Field><Field label="Operator" required><Input value={String(form.operator_name??"")} onChange={e=>set("operator_name",e.target.value)}/></Field><Field label="Shift"><Input value={String(form.shift??"")} onChange={e=>set("shift",e.target.value)}/></Field><Field label="Nilai meter" required><Input type="number" min="0" value={String(form.meter_value??"")} onChange={e=>set("meter_value",e.target.value)}/></Field><div className="sm:col-span-2"><p className="mb-2 text-sm font-medium text-slate-700">Checklist kondisi</p><div className="grid gap-2 sm:grid-cols-2">{requiredItems.map(name=><div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"><span className="text-sm">{name}</span><Select className="w-28" value={inspectionResults[name]??"PASS"} onChange={e=>setInspectionResults(current=>({...current,[name]:e.target.value as "PASS"|"FAIL"}))}><option value="PASS">Baik</option><option value="FAIL">Tidak baik</option></Select></div>)}</div></div><label className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><input type="checkbox" checked={Boolean(form.unsafe_to_operate)} onChange={e=>set("unsafe_to_operate",e.target.checked)}/> Tidak aman untuk dioperasikan</label></> : null}
      {kind === "fuel" ? <><Field label="Waktu pengisian" required><Input type="datetime-local" value={String(form.fueled_at)} onChange={e=>set("fueled_at",e.target.value)}/></Field><Field label="Sumber Fuel Tank"><Select value={String(form.fuel_tank_id??"")} onChange={e=>set("fuel_tank_id",e.target.value)}><option value="">Eksternal / tanpa potong stok</option>{data?.fuel_tanks.map(t=><option key={t.id} value={t.id}>{t.AssetName} · saldo {Number(t.reference_balance_liter).toLocaleString("id-ID")} L</option>)}</Select></Field><Field label="Jumlah (liter)" required><Input type="number" min="0.001" step="0.001" value={String(form.quantity_liter??"")} onChange={e=>set("quantity_liter",e.target.value)}/></Field><Field label="Operator" required><Input value={String(form.operator_name??"")} onChange={e=>set("operator_name",e.target.value)}/></Field><Field label="Meter sebelum" required><Input type="number" min="0" value={String(form.meter_before??"")} onChange={e=>set("meter_before",e.target.value)}/></Field><Field label="Meter sesudah" required><Input type="number" min="0" value={String(form.meter_after??"")} onChange={e=>set("meter_after",e.target.value)}/></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.full_tank)} onChange={e=>set("full_tank",e.target.checked)}/> Pengisian full tank</label></> : null}
      {kind === "service" ? <><Field label="Jenis service" required><Select value={String(form.service_type)} onChange={e=>set("service_type",e.target.value)}><option value="PREVENTIVE">Preventive</option><option value="CORRECTIVE">Corrective</option><option value="REPAIR">Repair</option><option value="INSPECTION">Inspection</option></Select></Field><Field label="Status" required><Select value={String(form.status)} onChange={e=>set("status",e.target.value)}><option value="DRAFT">Draft</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></Select></Field><Field label="Mulai" required><Input type="datetime-local" value={String(form.started_at)} onChange={e=>set("started_at",e.target.value)}/></Field><Field label="Selesai"><Input type="datetime-local" value={String(form.completed_at)} onChange={e=>set("completed_at",e.target.value)}/></Field><Field label="Meter saat service" required><Input type="number" min="0" value={String(form.meter_value??"")} onChange={e=>set("meter_value",e.target.value)}/></Field><Field label="Workshop"><Input value={String(form.workshop_name??"")} onChange={e=>set("workshop_name",e.target.value)}/></Field><Field label="Nomor WO existing"><Input value={String(form.wo_number??"")} onChange={e=>set("wo_number",e.target.value)}/></Field><Field label="Modul WO"><Select value={String(form.wo_module??"")} onChange={e=>set("wo_module",e.target.value)}><option value="">Tanpa WO</option><option value="maintenance">Maintenance</option><option value="meso">MESO</option><option value="ga">GA</option></Select></Field><div className="sm:col-span-2"><Field label="Keluhan / temuan"><Textarea value={String(form.complaint??"")} onChange={e=>set("complaint",e.target.value)}/></Field></div><div className="sm:col-span-2"><Field label="Pekerjaan yang dilakukan"><Textarea value={String(form.work_performed??"")} onChange={e=>set("work_performed",e.target.value)}/></Field></div></> : null}
    </div>
  </Modal>;
}
