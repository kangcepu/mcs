"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";

export default function UserAliasesPage() {
  return (
    <MasterDataView
      resource="user-aliases"
      title="User Aliases"
      description="User aliases/nicknames for field-data matching. Only the alias field can be changed."
      area="masterUserAlias"
      canCreate={false}
      canDelete={false}
      idKey="id_user"
      fields={[
        { name: "fullname", label: "Full Name", aliases: ["full_name"], editable: false },
        { name: "username", label: "Username", editable: false },
        { name: "alias", label: "Alias", required: true },
        {
          name: "division_name",
          label: "Division",
          aliases: ["division_code", "divisi"],
          editable: false,
        },
        {
          name: "active",
          label: "Active Status",
          type: "checkbox",
          aliases: ["is_active"],
          editable: false,
        },
      ]}
    />
  );
}
