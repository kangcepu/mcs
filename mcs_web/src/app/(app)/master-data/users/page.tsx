"use client";

import { MasterDataView } from "@/components/master-data/master-data-view";
import { UserForm } from "@/components/master-data/user-form";
import { StatusBadge } from "@/components/ui/status-badge";

export default function MasterUsersPage() {
  return (
    <MasterDataView
      resource="users"
      title="Users"
      description="Manage user accounts, permission groups, and active status. Passwords are hashed on the server and never displayed."
      area="masterUser"
      canCreate
      canDelete={false}
      activeStatusFilter
      deactivateAction
      idKey="id_user"
      FormComponent={UserForm}
      fields={[
        { name: "username", label: "Username", required: true },
        { name: "fullname", label: "Full Name", aliases: ["full_name", "name"] },
        { name: "email", label: "Email" },
        { name: "division_name", label: "Division", aliases: ["id_division"] },
        {
          name: "permission_group_name",
          label: "Permission Group",
          aliases: ["permission_group_id"],
        },
        {
          name: "active",
          label: "Status",
          aliases: ["is_active"],
          render: (row) => {
            const value = row.active ?? row.is_active;
            const active = value === true || value === 1 || value === "1";
            return <StatusBadge status={active ? "Aktif" : "Nonaktif"} tone={active ? "green" : "slate"} />;
          },
        },
      ]}
    />
  );
}
