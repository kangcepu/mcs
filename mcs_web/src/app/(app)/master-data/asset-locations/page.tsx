"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";

export default function AssetLocationsPage() {
  return (
    <MasterDataView
      resource="asset-locations"
      title="Asset Locations"
      description="Asset location codes and names."
      area="masterAssetLocation"
      canCreate
      idKey="id_location_asset"
      fields={[
        {
          name: "location_code",
          label: "Location Code",
          aliases: ["code"],
          required: true,
          editable: false,
        },
        {
          name: "location_name",
          label: "Location Name",
          aliases: ["name"],
          required: true,
        },
      ]}
    />
  );
}
