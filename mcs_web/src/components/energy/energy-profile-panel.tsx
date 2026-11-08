"use client";

import { useState } from "react";
import { Pencil, QrCode, Zap } from "lucide-react";
import { EnergyProfileForm } from "@/components/energy/energy-profile-form";
import { EnergyOperationsPanel } from "@/components/energy/energy-operations-panel";
import { DescriptionList } from "@/components/ui/detail";
import { Button } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatQty } from "@/lib/format";
import type { EnergyAssetProfile } from "@/types/energy";

const TYPE_LABEL: Record<string, string> = {
  ELECTRICITY_METER: "Meter Listrik",
  WATER_METER: "Water Meter",
  GENSET: "Genset",
  FUEL_TANK: "Fuel Tank",
  COMPRESSOR: "Compressor",
  BOILER: "Boiler",
  OTHER: "Lainnya",
};

const UTILITY_LABEL: Record<string, string> = {
  ELECTRICITY: "Listrik",
  FUEL: "Bahan Bakar",
  WATER: "Air",
  COMPRESSED_AIR: "Udara Bertekanan",
  STEAM: "Steam",
  OTHER: "Lainnya",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};

function metadata(profile: EnergyAssetProfile): Record<string, unknown> {
  try {
    return profile.metadata_json ? JSON.parse(profile.metadata_json) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function EnergyProfilePanel({
  profile,
  canWrite,
  onChanged,
}: {
  profile: EnergyAssetProfile;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const meter = profile.energy_type === "ELECTRICITY_METER" || profile.energy_type === "WATER_METER";
  const generic = metadata(profile);

  const technicalItems = meter
    ? [
        { label: "Nomor Meter", value: profile.meter_number },
        { label: "Tipe Meter", value: profile.meter_type },
        { label: "Satuan", value: profile.meter_unit },
        { label: "Multiplier / CT Factor", value: formatQty(profile.meter_multiplier) },
        { label: "Jumlah Digit", value: profile.digit_count },
        { label: "Nilai Rollover", value: formatQty(profile.rollover_value) },
        { label: "Frekuensi Reading", value: profile.reading_frequency },
        { label: "Berlaku Mulai", value: formatDate(profile.meter_effective_from) },
        { label: "Berlaku Sampai", value: formatDate(profile.meter_effective_to) },
      ]
    : profile.energy_type === "GENSET"
      ? [
          { label: "Serial Number", value: profile.serial_number },
          { label: "Jenis Bahan Bakar", value: profile.genset_fuel_type },
          { label: "Rated Capacity", value: profile.rated_kva ? `${formatQty(profile.rated_kva)} kVA` : null },
          { label: "Rated Power", value: profile.rated_kw ? `${formatQty(profile.rated_kw)} kW` : null },
          { label: "Kapasitas Tangki Internal", value: profile.tank_capacity_liter ? `${formatQty(profile.tank_capacity_liter)} liter` : null },
          { label: "Initial Hour Meter", value: formatQty(profile.initial_hour_meter) },
          { label: "Current Hour Meter", value: formatQty(profile.current_hour_meter) },
        ]
      : profile.energy_type === "FUEL_TANK"
        ? [
            { label: "Nomor Tank", value: profile.tank_number },
            { label: "Jenis Bahan Bakar", value: profile.tank_fuel_type },
            { label: "Kapasitas", value: profile.capacity_liter ? `${formatQty(profile.capacity_liter)} liter` : null },
            { label: "Saldo Referensi", value: profile.reference_balance_liter ? `${formatQty(profile.reference_balance_liter)} liter` : null },
            { label: "Batas Minimum", value: profile.minimum_level_liter ? `${formatQty(profile.minimum_level_liter)} liter` : null },
            { label: "Batas Maksimum", value: profile.maximum_level_liter ? `${formatQty(profile.maximum_level_liter)} liter` : null },
          ]
        : (profile.energy_type === "COMPRESSOR" || profile.energy_type === "BOILER")
          ? [
              { label: "Kapasitas", value: [profile.utility_capacity_value, profile.utility_capacity_unit].filter(Boolean).join(" ") },
              { label: "Daya Terpasang", value: profile.utility_rated_power_kw ? `${formatQty(profile.utility_rated_power_kw)} kW` : null },
              { label: "Hour Meter", value: formatQty(profile.utility_current_hour_meter ?? profile.utility_initial_hour_meter) },
              { label: "Batas Tekanan", value: profile.pressure_min_bar != null || profile.pressure_max_bar != null ? `${formatQty(profile.pressure_min_bar)}–${formatQty(profile.pressure_max_bar)} bar` : null },
              { label: "Batas Temperatur", value: profile.temperature_min_c != null || profile.temperature_max_c != null ? `${formatQty(profile.temperature_min_c)}–${formatQty(profile.temperature_max_c)} °C` : null },
              { label: "Batas Flow", value: profile.flow_min != null || profile.flow_max != null ? `${formatQty(profile.flow_min)}–${formatQty(profile.flow_max)} ${profile.flow_unit ?? ""}` : null },
              { label: "Batas Output", value: profile.output_min != null || profile.output_max != null ? `${formatQty(profile.output_min)}–${formatQty(profile.output_max)} ${profile.output_unit ?? ""}` : null },
              { label: "Frekuensi Inspeksi", value: profile.utility_inspection_frequency },
              { label: "Interval Preventive", value: profile.preventive_interval_hours ? `${formatQty(profile.preventive_interval_hours)} jam` : null },
              { label: "Spesifikasi Tambahan", value: generic.technical_specification as string | undefined },
            ]
          : [
              { label: "Kapasitas", value: [generic.capacity_value, generic.capacity_unit].filter(Boolean).join(" ") },
              { label: "Tekanan Operasi", value: generic.operating_pressure_bar ? `${generic.operating_pressure_bar} bar` : null },
              { label: "Daya Terpasang", value: generic.rated_power_kw ? `${generic.rated_power_kw} kW` : null },
              { label: "Spesifikasi Tambahan", value: generic.technical_specification as string | undefined },
            ];

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900">{TYPE_LABEL[profile.energy_type] ?? profile.energy_type}</h2>
                <StatusBadge
                  status={STATUS_LABEL[profile.status] ?? profile.status}
                  tone={profile.status === "ACTIVE" ? "green" : profile.status === "MAINTENANCE" ? "amber" : "slate"}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Profil Energy menggunakan identitas dan QR Asset yang sama.</p>
            </div>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Ubah Profil
            </Button>
          ) : null}
        </div>
        <div className="p-5">
          <DescriptionList
            columns={3}
            items={[
              { label: "Jenis Asset Energy", value: TYPE_LABEL[profile.energy_type] ?? profile.energy_type },
              { label: "Jenis Utility", value: UTILITY_LABEL[profile.utility_type] ?? profile.utility_type },
              { label: "Kode Profil", value: profile.profile_code },
              { label: "Commissioning", value: formatDate(profile.commissioning_date) },
              { label: "Ownership / Custodian", value: profile.ownership },
              { label: "Status", value: STATUS_LABEL[profile.status] ?? profile.status },
            ]}
          />
          {profile.description ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Keterangan</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{profile.description}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-brand-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Spesifikasi Teknis</h2>
            <p className="text-xs text-slate-500">Terbuka dari Asset Passport yang sama ketika QR discan.</p>
          </div>
        </div>
        <DescriptionList columns={3} items={technicalItems} />
      </section>

      <EnergyOperationsPanel profile={profile} canWrite={canWrite} />

      {editOpen ? (
        <EnergyProfileForm
          open
          initial={profile}
          onSaved={onChanged}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </div>
  );
}
