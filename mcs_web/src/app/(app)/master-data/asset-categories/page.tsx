"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";

export default function AssetCategoriesPage() {
  return (
    <MasterDataView
      resource="asset-categories"
      title="Asset Categories"
      description="Asset category codes and names."
      area="masterAssetCategory"
      canCreate
      idKey="id_category_asset"
      fields={[
        {
          name: "category_code",
          label: "Category Code",
          aliases: ["code"],
          required: true,
          editable: false,
        },
        {
          name: "category_name",
          label: "Category Name",
          aliases: ["name"],
          required: true,
        },
      ]}
    />
  );
}
