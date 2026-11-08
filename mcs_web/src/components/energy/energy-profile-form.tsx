"use client";

import { useEffect, useState } from "react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useEnergyProfileMutations, useEnergyProfileOptions } from "@/hooks/use-energy";
import type {
  EnergyAssetProfile,
  EnergyAssetType,
  EnergyProfileInput,
  EnergyProfileStatus,
  UtilityType,
} from "@/types/energy";

const FALLBACK_DEFAULT_UTILITY: Record<string, UtilityType> = {
  ELECTRICITY_METER: "ELECTRICITY",
  GENSET: "FUEL",
  FUEL_TANK: "FUEL",
  WATER_METER: "WATER",
  COMPRESSOR: "COMPRESSED_AIR",
  BOILER: "STEAM",
  OTHER: "OTHER",
};

const text = (value: unknown) => value === null || value === undefined ? "" : String(value);

function metadataOf(initial?: EnergyAssetProfile | null): Record<string, unknown> {
  if (!initial?.metadata_json) return {};
  try {
    const parsed = JSON.parse(initial.metadata_json);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function EnergyProfileForm({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: EnergyAssetProfile | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const optionsQuery = useEnergyProfileOptions();
  const options = optionsQuery.data?.data;
  const mutations = useEnergyProfileMutations();
  const editing = Boolean(initial);

  const [assetId, setAssetId] = useState(0);
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [energyType, setEnergyType] = useState<EnergyAssetType>("ELECTRICITY_METER");
  const [utilityType, setUtilityType] = useState<UtilityType>("ELECTRICITY");
  const [profileCode, setProfileCode] = useState("");
  const [commissioningDate, setCommissioningDate] = useState("");
  const [ownership, setOwnership] = useState("");
  const [status, setStatus] = useState<EnergyProfileStatus>("ACTIVE");
  const [description, setDescription] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [meterType, setMeterType] = useState<"MAIN" | "SUB" | "INCOMING" | "OUTGOING">("MAIN");
  const [meterUnit, setMeterUnit] = useState("kWh");
  const [meterMultiplier, setMeterMultiplier] = useState("1");
  const [digitCount, setDigitCount] = useState("");
  const [rolloverValue, setRolloverValue] = useState("");
  const [readingFrequency, setReadingFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | "">("");
  const [meterEffectiveFrom, setMeterEffectiveFrom] = useState("");
  const [meterEffectiveTo, setMeterEffectiveTo] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [ratedKva, setRatedKva] = useState("");
  const [ratedKw, setRatedKw] = useState("");
  const [fuelType, setFuelType] = useState("DIESEL");
  const [tankCapacityLiter, setTankCapacityLiter] = useState("");
  const [initialHourMeter, setInitialHourMeter] = useState("");
  const [currentHourMeter, setCurrentHourMeter] = useState("");
  const [tankNumber, setTankNumber] = useState("");
  const [capacityLiter, setCapacityLiter] = useState("");
  const [minimumLevelLiter, setMinimumLevelLiter] = useState("");
  const [maximumLevelLiter, setMaximumLevelLiter] = useState("");
  const [referenceBalanceLiter, setReferenceBalanceLiter] = useState("");
  const [capacityValue, setCapacityValue] = useState("");
  const [capacityUnit, setCapacityUnit] = useState("");
  const [operatingPressureBar, setOperatingPressureBar] = useState("");
  const [ratedPowerKw, setRatedPowerKw] = useState("");
  const [technicalSpecification, setTechnicalSpecification] = useState("");
  const [utilityInitialHour, setUtilityInitialHour] = useState("");
  const [utilityCurrentHour, setUtilityCurrentHour] = useState("");
  const [pressureMin, setPressureMin] = useState("");
  const [pressureMax, setPressureMax] = useState("");
  const [temperatureMin, setTemperatureMin] = useState("");
  const [temperatureMax, setTemperatureMax] = useState("");
  const [flowMin, setFlowMin] = useState("");
  const [flowMax, setFlowMax] = useState("");
  const [flowUnit, setFlowUnit] = useState("");
  const [outputMin, setOutputMin] = useState("");
  const [outputMax, setOutputMax] = useState("");
  const [outputUnit, setOutputUnit] = useState("");
  const [inspectionFrequency, setInspectionFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND">("DAILY");
  const [preventiveInterval, setPreventiveInterval] = useState("");
  const [lastPreventiveHour, setLastPreventiveHour] = useState("");
  const [autoCorrectiveWo, setAutoCorrectiveWo] = useState(true);
  const [autoPreventiveWo, setAutoPreventiveWo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAssetId(Number(initial?.asset_id ?? 0));
    setAssetCode(initial?.AssetCode ?? "");
    setAssetName(initial?.AssetName ?? "");
    setEnergyType(initial?.energy_type ?? "ELECTRICITY_METER");
    setUtilityType(initial?.utility_type ?? "ELECTRICITY");
    setProfileCode(initial?.profile_code ?? "");
    setCommissioningDate(initial?.commissioning_date?.slice(0, 10) ?? "");
    setOwnership(initial?.ownership ?? "");
    setStatus(initial?.status ?? "ACTIVE");
    setDescription(initial?.description ?? "");
    setMeterNumber(initial?.meter_number ?? "");
    setMeterType(initial?.meter_type ?? "MAIN");
    setMeterUnit(initial?.meter_unit ?? (initial?.energy_type === "WATER_METER" ? "m3" : "kWh"));
    setMeterMultiplier(text(initial?.meter_multiplier ?? 1));
    setDigitCount(text(initial?.digit_count));
    setRolloverValue(text(initial?.rollover_value));
    setReadingFrequency(initial?.reading_frequency ?? "");
    setMeterEffectiveFrom(initial?.meter_effective_from?.slice(0, 10) ?? "");
    setMeterEffectiveTo(initial?.meter_effective_to?.slice(0, 10) ?? "");
    setSerialNumber(initial?.serial_number ?? "");
    setRatedKva(text(initial?.rated_kva));
    setRatedKw(text(initial?.rated_kw));
    setFuelType(initial?.genset_fuel_type ?? initial?.tank_fuel_type ?? "DIESEL");
    setTankCapacityLiter(text(initial?.tank_capacity_liter));
    setInitialHourMeter(text(initial?.initial_hour_meter));
    setCurrentHourMeter(text(initial?.current_hour_meter));
    setTankNumber(initial?.tank_number ?? "");
    setCapacityLiter(text(initial?.capacity_liter));
    setMinimumLevelLiter(text(initial?.minimum_level_liter));
    setMaximumLevelLiter(text(initial?.maximum_level_liter));
    setReferenceBalanceLiter(text(initial?.reference_balance_liter));
    const metadata = metadataOf(initial);
    setCapacityValue(text(initial?.utility_capacity_value ?? metadata.capacity_value));
    setCapacityUnit(text(initial?.utility_capacity_unit ?? metadata.capacity_unit));
    setOperatingPressureBar(text(metadata.operating_pressure_bar));
    setRatedPowerKw(text(initial?.utility_rated_power_kw ?? metadata.rated_power_kw));
    setTechnicalSpecification(text(metadata.technical_specification));
    setUtilityInitialHour(text(initial?.utility_initial_hour_meter));
    setUtilityCurrentHour(text(initial?.utility_current_hour_meter));
    setPressureMin(text(initial?.pressure_min_bar));
    setPressureMax(text(initial?.pressure_max_bar));
    setTemperatureMin(text(initial?.temperature_min_c));
    setTemperatureMax(text(initial?.temperature_max_c));
    setFlowMin(text(initial?.flow_min));
    setFlowMax(text(initial?.flow_max));
    setFlowUnit(initial?.flow_unit ?? (initial?.energy_type === "COMPRESSOR" ? "CFM" : "kg/h"));
    setOutputMin(text(initial?.output_min));
    setOutputMax(text(initial?.output_max));
    setOutputUnit(initial?.output_unit ?? (initial?.energy_type === "COMPRESSOR" ? "Nm3/min" : "ton/h"));
    setInspectionFrequency(initial?.utility_inspection_frequency ?? "DAILY");
    setPreventiveInterval(text(initial?.preventive_interval_hours));
    setLastPreventiveHour(text(initial?.last_preventive_hour_meter));
    setAutoCorrectiveWo(initial?.auto_corrective_wo == null ? true : Boolean(Number(initial.auto_corrective_wo)));
    setAutoPreventiveWo(initial?.auto_preventive_wo == null ? true : Boolean(Number(initial.auto_preventive_wo)));
  }, [initial, open]);

  const pending = mutations.create.isPending || mutations.update.isPending;

  const changeEnergyType = (value: EnergyAssetType) => {
    setEnergyType(value);
    setUtilityType(options?.default_utility[value] ?? FALLBACK_DEFAULT_UTILITY[value] ?? "OTHER");
    if (value === "ELECTRICITY_METER") setMeterUnit("kWh");
    if (value === "WATER_METER") setMeterUnit("m3");
  };

  const submit = async () => {
    if (!assetId) {
      toast.error("Asset belum dipilih", "Pilih asset existing yang akan dijadikan Energy asset.");
      return;
    }
    const body: EnergyProfileInput = {
      ...(editing ? {} : { asset_id: assetId }),
      energy_type: energyType,
      utility_type: utilityType,
      profile_code: profileCode,
      commissioning_date: commissioningDate,
      ownership,
      status,
      description,
      meter_number: meterNumber,
      meter_type: meterType,
      meter_unit: meterUnit,
      meter_multiplier: meterMultiplier,
      digit_count: digitCount,
      rollover_value: rolloverValue,
      reading_frequency: readingFrequency,
      meter_effective_from: meterEffectiveFrom,
      meter_effective_to: meterEffectiveTo,
      serial_number: serialNumber,
      rated_kva: ratedKva,
      rated_kw: ratedKw,
      fuel_type: fuelType,
      tank_capacity_liter: tankCapacityLiter,
      initial_hour_meter: initialHourMeter,
      current_hour_meter: currentHourMeter,
      tank_number: tankNumber,
      capacity_liter: capacityLiter,
      minimum_level_liter: minimumLevelLiter,
      maximum_level_liter: maximumLevelLiter,
      reference_balance_liter: referenceBalanceLiter,
      capacity_value: capacityValue,
      capacity_unit: capacityUnit,
      operating_pressure_bar: operatingPressureBar,
      rated_power_kw: ratedPowerKw,
      technical_specification: technicalSpecification,
      utility_initial_hour_meter: utilityInitialHour,
      utility_current_hour_meter: utilityCurrentHour,
      pressure_min_bar: pressureMin,
      pressure_max_bar: pressureMax,
      temperature_min_c: temperatureMin,
      temperature_max_c: temperatureMax,
      flow_min: flowMin,
      flow_max: flowMax,
      flow_unit: flowUnit,
      output_min: outputMin,
      output_max: outputMax,
      output_unit: outputUnit,
      utility_inspection_frequency: inspectionFrequency,
      preventive_interval_hours: preventiveInterval,
      last_preventive_hour_meter: lastPreventiveHour,
      auto_corrective_wo: autoCorrectiveWo,
      auto_preventive_wo: autoPreventiveWo,
    };
    try {
      if (editing) await mutations.update.mutateAsync({ assetId, body });
      else await mutations.create.mutateAsync(body);
      toast.success(
        editing ? "Profil Energy diperbarui" : "Profil Energy dibuat",
        `${assetName || assetCode} tetap menggunakan master Asset existing.`,
      );
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error("Gagal menyimpan profil", error instanceof Error ? error.message : "Terjadi kesalahan.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Ubah Energy Asset Profile" : "Tambah Energy Asset Profile"}
      description="Profil ini merupakan extension dari Asset existing, bukan membuat asset baru."
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Batal</Button>
          <Button onClick={submit} loading={pending}>Simpan Profil</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Asset existing" required>
            {editing ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-medium text-slate-800">{assetName || "-"}</p>
                <p className="text-xs text-slate-500">{assetCode}</p>
              </div>
            ) : (
              <AssetPicker
                selectedName={assetName}
                selectedCode={assetCode}
                onSelect={(code, name, _company, _photo, _photos, id) => {
                  setAssetId(Number(id ?? 0));
                  setAssetCode(code);
                  setAssetName(name);
                }}
                onClear={() => {
                  setAssetId(0);
                  setAssetCode("");
                  setAssetName("");
                }}
                placeholder="Cari atau scan QR asset…"
              />
            )}
          </Field>
        </div>

        <Field label="Jenis Energy asset" required>
          <Select value={energyType} onChange={(e) => changeEnergyType(e.target.value as EnergyAssetType)}>
            {(options?.energy_types ?? []).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Jenis utility" required>
          <Select value={utilityType} onChange={(e) => setUtilityType(e.target.value as UtilityType)}>
            {(options?.utility_types ?? []).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Kode profil" hint="Opsional; Asset Code tetap menjadi identitas utama.">
          <Input value={profileCode} onChange={(e) => setProfileCode(e.target.value)} maxLength={100} />
        </Field>

        <Field label="Tanggal commissioning">
          <Input type="date" value={commissioningDate} onChange={(e) => setCommissioningDate(e.target.value)} />
        </Field>

        <Field label="Ownership/custodian">
          <Input value={ownership} onChange={(e) => setOwnership(e.target.value)} maxLength={80} />
        </Field>

        <Field label="Status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EnergyProfileStatus)}>
            {(options?.statuses ?? []).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2 mt-1 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Spesifikasi Teknis</h3>
          <p className="mt-0.5 text-xs text-slate-500">Field menyesuaikan jenis Energy asset yang dipilih.</p>
        </div>

        {(energyType === "ELECTRICITY_METER" || energyType === "WATER_METER") ? (
          <>
            <Field label="Nomor meter">
              <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Tipe meter" required>
              <Select value={meterType} onChange={(e) => setMeterType(e.target.value as typeof meterType)}>
                <option value="MAIN">Main Meter</option>
                <option value="SUB">Submeter</option>
                <option value="INCOMING">Incoming</option>
                <option value="OUTGOING">Outgoing</option>
              </Select>
            </Field>
            <Field label="Satuan" required hint={energyType === "WATER_METER" ? "Contoh: m3" : "Contoh: kWh"}>
              <Input value={meterUnit} onChange={(e) => setMeterUnit(e.target.value)} maxLength={24} />
            </Field>
            <Field label="Multiplier / CT factor" required>
              <Input inputMode="decimal" value={meterMultiplier} onChange={(e) => setMeterMultiplier(e.target.value)} />
            </Field>
            <Field label="Jumlah digit meter">
              <Input inputMode="numeric" value={digitCount} onChange={(e) => setDigitCount(e.target.value)} />
            </Field>
            <Field label="Nilai rollover" hint="Nilai maksimum sebelum meter kembali ke nol.">
              <Input inputMode="decimal" value={rolloverValue} onChange={(e) => setRolloverValue(e.target.value)} />
            </Field>
            <Field label="Frekuensi pencatatan">
              <Select value={readingFrequency} onChange={(e) => setReadingFrequency(e.target.value as typeof readingFrequency)}>
                <option value="">Belum ditentukan</option>
                <option value="DAILY">Harian</option>
                <option value="WEEKLY">Mingguan</option>
                <option value="MONTHLY">Bulanan</option>
                <option value="ON_DEMAND">Sesuai kebutuhan</option>
              </Select>
            </Field>
            <div />
            <Field label="Berlaku mulai">
              <Input type="date" value={meterEffectiveFrom} onChange={(e) => setMeterEffectiveFrom(e.target.value)} />
            </Field>
            <Field label="Berlaku sampai">
              <Input type="date" value={meterEffectiveTo} onChange={(e) => setMeterEffectiveTo(e.target.value)} />
            </Field>
          </>
        ) : null}

        {energyType === "GENSET" ? (
          <>
            <Field label="Serial number">
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Jenis bahan bakar" required>
              <Select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
                <option value="DIESEL">Diesel/Solar</option>
                <option value="GASOLINE">Gasoline/Bensin</option>
                <option value="GAS">Gas</option>
                <option value="OTHER">Lainnya</option>
              </Select>
            </Field>
            <Field label="Rated capacity (kVA)">
              <Input inputMode="decimal" value={ratedKva} onChange={(e) => setRatedKva(e.target.value)} />
            </Field>
            <Field label="Rated power (kW)">
              <Input inputMode="decimal" value={ratedKw} onChange={(e) => setRatedKw(e.target.value)} />
            </Field>
            <Field label="Kapasitas tangki internal (liter)">
              <Input inputMode="decimal" value={tankCapacityLiter} onChange={(e) => setTankCapacityLiter(e.target.value)} />
            </Field>
            <div />
            <Field label="Initial hour meter">
              <Input inputMode="decimal" value={initialHourMeter} onChange={(e) => setInitialHourMeter(e.target.value)} />
            </Field>
            <Field label="Current hour meter">
              <Input inputMode="decimal" value={currentHourMeter} onChange={(e) => setCurrentHourMeter(e.target.value)} />
            </Field>
          </>
        ) : null}

        {energyType === "FUEL_TANK" ? (
          <>
            <Field label="Nomor tank">
              <Input value={tankNumber} onChange={(e) => setTankNumber(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Jenis bahan bakar" required>
              <Select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
                <option value="DIESEL">Diesel/Solar</option>
                <option value="GASOLINE">Gasoline/Bensin</option>
                <option value="OTHER">Lainnya</option>
              </Select>
            </Field>
            <Field label="Kapasitas tank (liter)" required>
              <Input inputMode="decimal" value={capacityLiter} onChange={(e) => setCapacityLiter(e.target.value)} />
            </Field>
            <Field label="Saldo awal/referensi (liter)">
              <Input inputMode="decimal" value={referenceBalanceLiter} onChange={(e) => setReferenceBalanceLiter(e.target.value)} />
            </Field>
            <Field label="Batas minimum (liter)">
              <Input inputMode="decimal" value={minimumLevelLiter} onChange={(e) => setMinimumLevelLiter(e.target.value)} />
            </Field>
            <Field label="Batas maksimum (liter)">
              <Input inputMode="decimal" value={maximumLevelLiter} onChange={(e) => setMaximumLevelLiter(e.target.value)} />
            </Field>
          </>
        ) : null}

        {(["COMPRESSOR", "BOILER", "OTHER"] as string[]).includes(energyType) ? (
          <>
            <Field label="Kapasitas">
              <Input inputMode="decimal" value={capacityValue} onChange={(e) => setCapacityValue(e.target.value)} />
            </Field>
            <Field label="Satuan kapasitas" hint="Contoh: CFM, kg/h, ton/h">
              <Input value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)} maxLength={32} />
            </Field>
            <Field label="Tekanan operasi (bar)">
              <Input inputMode="decimal" value={operatingPressureBar} onChange={(e) => setOperatingPressureBar(e.target.value)} />
            </Field>
            <Field label="Daya terpasang (kW)">
              <Input inputMode="decimal" value={ratedPowerKw} onChange={(e) => setRatedPowerKw(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Spesifikasi teknis tambahan">
                <Textarea value={technicalSpecification} onChange={(e) => setTechnicalSpecification(e.target.value)} maxLength={5000} />
              </Field>
            </div>
          </>
        ) : null}

        {(["COMPRESSOR", "BOILER"] as string[]).includes(energyType) ? (
          <>
            <div className="sm:col-span-2 mt-1 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Batas Operasional & Inspeksi</h3>
              <p className="mt-0.5 text-xs text-slate-500">Nilai di luar rentang akan ditandai abnormal saat inspeksi dikunci.</p>
            </div>
            <Field label="Initial hour meter">
              <Input inputMode="decimal" value={utilityInitialHour} onChange={(e) => setUtilityInitialHour(e.target.value)} />
            </Field>
            <Field label="Current hour meter">
              <Input inputMode="decimal" value={utilityCurrentHour} onChange={(e) => setUtilityCurrentHour(e.target.value)} />
            </Field>
            <Field label="Tekanan minimum (bar)">
              <Input inputMode="decimal" value={pressureMin} onChange={(e) => setPressureMin(e.target.value)} />
            </Field>
            <Field label="Tekanan maksimum (bar)">
              <Input inputMode="decimal" value={pressureMax} onChange={(e) => setPressureMax(e.target.value)} />
            </Field>
            <Field label="Temperatur minimum (°C)">
              <Input inputMode="decimal" value={temperatureMin} onChange={(e) => setTemperatureMin(e.target.value)} />
            </Field>
            <Field label="Temperatur maksimum (°C)">
              <Input inputMode="decimal" value={temperatureMax} onChange={(e) => setTemperatureMax(e.target.value)} />
            </Field>
            <Field label="Flow minimum">
              <Input inputMode="decimal" value={flowMin} onChange={(e) => setFlowMin(e.target.value)} />
            </Field>
            <Field label="Flow maksimum">
              <Input inputMode="decimal" value={flowMax} onChange={(e) => setFlowMax(e.target.value)} />
            </Field>
            <Field label="Satuan flow">
              <Input value={flowUnit} onChange={(e) => setFlowUnit(e.target.value)} maxLength={24} placeholder={energyType === "COMPRESSOR" ? "CFM" : "kg/h"} />
            </Field>
            <div />
            <Field label="Output minimum">
              <Input inputMode="decimal" value={outputMin} onChange={(e) => setOutputMin(e.target.value)} />
            </Field>
            <Field label="Output maksimum">
              <Input inputMode="decimal" value={outputMax} onChange={(e) => setOutputMax(e.target.value)} />
            </Field>
            <Field label="Satuan output">
              <Input value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} maxLength={24} placeholder={energyType === "COMPRESSOR" ? "Nm3/min" : "ton/h"} />
            </Field>
            <Field label="Frekuensi inspeksi">
              <Select value={inspectionFrequency} onChange={(e) => setInspectionFrequency(e.target.value as typeof inspectionFrequency)}>
                <option value="DAILY">Harian</option>
                <option value="WEEKLY">Mingguan</option>
                <option value="MONTHLY">Bulanan</option>
                <option value="ON_DEMAND">Sesuai kebutuhan</option>
              </Select>
            </Field>
            <Field label="Interval preventive (jam)" hint="WO preventive dibuat saat hour meter mencapai interval berikutnya.">
              <Input inputMode="decimal" value={preventiveInterval} onChange={(e) => setPreventiveInterval(e.target.value)} />
            </Field>
            <Field label="Hour meter preventive terakhir">
              <Input inputMode="decimal" value={lastPreventiveHour} onChange={(e) => setLastPreventiveHour(e.target.value)} />
            </Field>
            <div className="sm:col-span-2 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={autoCorrectiveWo} onChange={(e) => setAutoCorrectiveWo(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span><span className="block font-medium text-slate-900">WO corrective otomatis</span><span className="mt-0.5 block text-xs text-slate-500">Dibuat setelah inspeksi abnormal diverifikasi dan dikunci.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={autoPreventiveWo} onChange={(e) => setAutoPreventiveWo(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span><span className="block font-medium text-slate-900">WO preventive otomatis</span><span className="mt-0.5 block text-xs text-slate-500">Dibuat berdasarkan interval dan hour meter yang terkunci.</span></span>
              </label>
            </div>
          </>
        ) : null}

        <div className="sm:col-span-2">
          <Field label="Keterangan">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
