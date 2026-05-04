import type React from "react";

export type FieldType =
  | "text"
  | "password"
  | "textarea"
  | "rich-text"
  | "number"
  | "date"
  | "select"
  | "checkboxes"
  | "slug"
  | "combobox";

export type EditorSection = "Basics" | "Content" | "Details";

export type ResourceField = {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionLabels?: Record<string, string>;
  help?: string;
  placeholder?: string;
  section?: EditorSection;
  fullWidth?: boolean;
  /** URL to load options dynamically (for checkboxes). Response: { ok, data: { items: [{ key, description, category }] } } */
  optionsEndpoint?: string;
  /** For "slug" fields: name of the source field to auto-generate from. */
  slugSource?: string;
  /** For "combobox" fields: URL to load suggestions. Response: { ok, data: { items: [...] } } */
  suggestionsEndpoint?: string;
  /** For "combobox" fields: which field from the API response to extract as suggestion values. */
  suggestionsField?: string;
  /** For "checkboxes" with optionsEndpoint: map response objects to DynamicOption shape. */
  optionsMapping?: { keyField: string; labelField: string };
};

export type ResourceItem = Record<string, unknown> & {
  id?: string;
  status?: string;
};

export type FieldRendererProps = {
  field: ResourceField;
  value: unknown;
  onChange: (value: unknown) => void;
  allValues?: ResourceItem;
};

export type DynamicOption = {
  key: string;
  description: string;
  category: string;
};

export type ResourceManagerProps = {
  title: string;
  endpoint: string;
  fields: ResourceField[];
  getTitle: (item: ResourceItem) => string;
  getSubtitle?: (item: ResourceItem) => string;
  emptyItem: ResourceItem;
  renderItemActions?: (item: ResourceItem) => React.ReactNode;
  renderEditorExtra?: (
    item: ResourceItem,
    setField: (name: string, value: unknown) => void,
  ) => React.ReactNode;
};

export type ResourceEditorProps = {
  item: ResourceItem;
  fields: ResourceField[];
  title: string;
  saving: boolean;
  onSave: (item: ResourceItem) => void;
  onClose: () => void;
  renderExtra?: (
    item: ResourceItem,
    setField: (name: string, value: unknown) => void,
  ) => React.ReactNode;
};

export type ResourceListProps = {
  items: ResourceItem[];
  loading: boolean;
  getTitle: (item: ResourceItem) => string;
  getSubtitle?: (item: ResourceItem) => string;
  onEdit: (item: ResourceItem) => void;
  onDelete: (item: ResourceItem) => void;
  renderItemActions?: (item: ResourceItem) => React.ReactNode;
};
