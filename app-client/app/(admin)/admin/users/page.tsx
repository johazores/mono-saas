"use client";

import Link from "next/link";
import { ResourceManager } from "@/components/admin";
import type { ResourceField, ResourceItem } from "@/types";

const userFields: ResourceField[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "email", label: "Email", type: "text" },
  {
    name: "password",
    label: "Password",
    type: "password",
    help: "Minimum 8 characters. Leave blank when editing to keep current password.",
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["active", "disabled"],
  },
  { name: "phone", label: "Phone", type: "text" },
  { name: "address.street", label: "Street", type: "text" },
  { name: "address.street2", label: "Street 2", type: "text" },
  { name: "address.city", label: "City", type: "text" },
  { name: "address.state", label: "State", type: "text" },
  { name: "address.zip", label: "ZIP", type: "text" },
  { name: "address.country", label: "Country", type: "text" },
];

const emptyUser: ResourceItem = {
  name: "",
  email: "",
  password: "",
  status: "active",
  phone: "",
  address: { street: "", street2: "", city: "", state: "", zip: "", country: "" },
};

export default function UsersPage() {
  return (
    <ResourceManager
      title="Users"
      endpoint="/api/users"
      fields={userFields}
      getTitle={(item) => String(item.name || item.email)}
      getSubtitle={(item) => `${item.email}`}
      emptyItem={emptyUser}
      renderItemActions={(item) => (
        <Link
          href={`/admin/users/${item.id}/activity`}
          className="text-xs text-primary hover:underline"
        >
          Activity
        </Link>
      )}
    />
  );
}
