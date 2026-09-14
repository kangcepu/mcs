"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";

export default function CompanyStructurePage() {
  return (
    <MasterDataView
      resource="company-structure"
      title="Company Structure"
      description="Company codes and names."
      area="masterCompany"
      canCreate
      idKey="id_company"
      fields={[
        {
          name: "id_company",
          label: "Company Code",
          aliases: ["code", "company_code"],
          required: true,
          editable: false,
        },
        {
          name: "company_name",
          label: "Company Name",
          aliases: ["name"],
          required: true,
        },
      ]}
    />
  );
}
