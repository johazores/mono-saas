"use client";

import { ResourceManager } from "@/components/admin";
import type { ResourceField, ResourceItem } from "@/types";

const featureFields: ResourceField[] = [
  {
    name: "key",
    label: "Key",
    type: "text",
    help: "Lowercase with dots/hyphens (e.g. storage.5gb, api.access).",
  },
  {
    name: "description",
    label: "Description",
    type: "text",
    section: "Basics",
  },
  {
    name: "category",
    label: "Category",
    type: "combobox",
    suggestionsEndpoint: "/api/admins/features",
    suggestionsField: "category",
    help: "Type a category or pick from existing ones.",
  },
  {
    name: "isActive",
    label: "Active",
    type: "select",
    options: ["true", "false"],
  },
  { name: "sortOrder", label: "Sort Order", type: "number" },
];

const emptyFeature: ResourceItem = {
  key: "",
  description: "",
  category: "features",
  isActive: "true",
  sortOrder: 0,
};

export default function FeaturesPage() {
  return (
    <ResourceManager
      title="Features"
      endpoint="/api/admins/features"
      fields={featureFields}
      getTitle={(item) => String(item.key)}
      getSubtitle={(item) => `${item.category} · ${item.description}`}
      emptyItem={emptyFeature}
    />
  );
}
