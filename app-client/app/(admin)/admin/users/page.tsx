"use client";

import { useState } from "react";
import Link from "next/link";
import { ResourceManager } from "@/components/admin";
import { InvitationModal } from "@/components/admin/invitation-modal";
import type { ResourceField, ResourceItem } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7001";

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
  const [showInvitations, setShowInvitations] = useState(false);

  function handleImpersonate(item: ResourceItem) {
    if (!confirm(`Impersonate ${item.name || item.email}?`)) return;
    // Open the API endpoint directly so cookies are set same-origin
    window.open(
      `${API_URL}/api/users/${item.id}/impersonate`,
      "_blank",
    );
  }

  return (
    <>
      <ResourceManager
        title="Users"
        endpoint="/api/users"
        fields={userFields}
        getTitle={(item) => String(item.name || item.email)}
        getSubtitle={(item) => `${item.email}`}
        emptyItem={emptyUser}
        headerAction={
          <button
            onClick={() => setShowInvitations(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Invite User
          </button>
        }
        renderItemActions={(item) => (
          <div className="flex items-center gap-2">
            {item.status === "active" && (
              <button
                onClick={() => handleImpersonate(item)}
                className="text-xs text-amber-600 hover:underline"
              >
                Impersonate
              </button>
            )}
            <Link
              href={`/admin/users/${item.id}/activity`}
              className="text-xs text-primary hover:underline"
            >
              Activity
            </Link>
          </div>
        )}
      />
      {showInvitations && (
        <InvitationModal onClose={() => setShowInvitations(false)} />
      )}
    </>
  );
}
