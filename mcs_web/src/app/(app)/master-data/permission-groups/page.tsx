"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";
import { PermissionGroupForm } from "@/components/master-data/permission-group-form";

export default function PermissionGroupsPage() {
  return (
    <MasterDataView
      resource="permission-groups"
      title="Permission Groups"
      description="Manage permission groups and the access rights assigned to them."
      area="masterPermissionGroup"
      canCreate
      idKey="id_permission_group"
      FormComponent={PermissionGroupForm}
      fields={[
        { name: "group_name", label: "Group Name", aliases: ["name"], required: true },
        { name: "description", label: "Description", aliases: ["keterangan"] },
        {
          name: "permissions",
          label: "Permission Count",
          render: (row) =>
            Array.isArray(row.permissions) ? row.permissions.length : "-",
        },
        { name: "active", label: "Status", type: "checkbox" },
      ]}
    />
  );
}
