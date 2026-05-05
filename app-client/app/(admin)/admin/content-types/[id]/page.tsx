"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { cmsContentTypeService } from "@/services/cms-service";
import { slugify } from "@/lib/slugify";
import type {
  ContentType,
  ContentFieldDefinition,
  ContentFieldType,
} from "@/types";
import { ArrowLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Field type options (shared with block-templates)
// ---------------------------------------------------------------------------

const FIELD_TYPES: { value: ContentFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "rich-text", label: "Rich Text (HTML)" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "url", label: "URL" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "media", label: "Media / Image" },
  { value: "repeater", label: "Repeater (sub-fields)" },
  { value: "gallery-list", label: "Gallery" },
  { value: "document-list", label: "Documents" },
];

const emptyField: ContentFieldDefinition = {
  name: "",
  label: "",
  type: "text",
  width: "full",
};

// ---------------------------------------------------------------------------
// Field builder (reused from block-templates pattern)
// ---------------------------------------------------------------------------

function FieldBuilder({
  fields,
  onChange,
  depth = 0,
}: {
  fields: ContentFieldDefinition[];
  onChange: (fields: ContentFieldDefinition[]) => void;
  depth?: number;
}) {
  const inputClass =
    "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-sm";

  function updateField(index: number, patch: Partial<ContentFieldDefinition>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(from: number, to: number) {
    const next = [...fields];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div
          key={index}
          className="rounded-lg border border-[var(--theme-border)] p-3"
          style={{ marginLeft: depth * 16 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Field {index + 1}: {field.label || "(unnamed)"}
            </span>
            <div className="flex gap-1 text-xs">
              {index > 0 && (
                <button
                  type="button"
                  className="text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                  onClick={() => moveField(index, index - 1)}
                >
                  Up
                </button>
              )}
              {index < fields.length - 1 && (
                <button
                  type="button"
                  className="text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                  onClick={() => moveField(index, index + 1)}
                >
                  Down
                </button>
              )}
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                onClick={() => removeField(index)}
              >
                Remove
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <label>
              <span className="text-xs text-[var(--theme-muted)]">
                Name (key)
              </span>
              <input
                className={inputClass}
                value={field.name}
                onChange={(e) => updateField(index, { name: e.target.value })}
                placeholder="field_name"
              />
            </label>
            <label>
              <span className="text-xs text-[var(--theme-muted)]">Label</span>
              <input
                className={inputClass}
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="Display Label"
              />
            </label>
            <label>
              <span className="text-xs text-[var(--theme-muted)]">Type</span>
              <select
                className={inputClass}
                value={field.type}
                onChange={(e) =>
                  updateField(index, {
                    type: e.target.value as ContentFieldType,
                  })
                }
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {ft.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs text-[var(--theme-muted)]">Width</span>
              <select
                className={inputClass}
                value={field.width || "full"}
                onChange={(e) =>
                  updateField(index, {
                    width: e.target.value as "full" | "half",
                  })
                }
              >
                <option value="full">Full</option>
                <option value="half">Half</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <label>
              <span className="text-xs text-[var(--theme-muted)]">
                Placeholder
              </span>
              <input
                className={inputClass}
                value={field.placeholder || ""}
                onChange={(e) =>
                  updateField(index, {
                    placeholder: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                checked={field.required || false}
                onChange={(e) =>
                  updateField(index, { required: e.target.checked })
                }
              />
              <span className="text-xs text-[var(--theme-muted)]">
                Required
              </span>
            </label>
            {field.type === "select" && (
              <label className="col-span-2">
                <span className="text-xs text-[var(--theme-muted)]">
                  Options (comma-separated)
                </span>
                <input
                  className={inputClass}
                  value={(field.options || []).join(", ")}
                  onChange={(e) =>
                    updateField(index, {
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="option1, option2, option3"
                />
              </label>
            )}
          </div>
          {field.type === "repeater" && depth < 1 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--theme-muted)]">
                  Sub-fields
                </span>
                <button
                  type="button"
                  className="text-xs text-[var(--theme-primary)] hover:underline"
                  onClick={() =>
                    updateField(index, {
                      subFields: [
                        ...(field.subFields || []),
                        { ...emptyField },
                      ],
                    })
                  }
                >
                  + Add Sub-field
                </button>
              </div>
              <FieldBuilder
                fields={field.subFields || []}
                onChange={(subFields) => updateField(index, { subFields })}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-[var(--theme-primary)] hover:underline"
        onClick={() => onChange([...fields, { ...emptyField }])}
      >
        + Add Field
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types for settings JSON objects
// ---------------------------------------------------------------------------

type ContentTypeSettings = {
  hasSlug: boolean;
  hasStatus: boolean;
  hasSortOrder: boolean;
  slugSource: string;
  defaultStatus: string;
};

type ListDisplay = {
  titleField: string;
  subtitleField: string;
  imageField: string;
};

type PublicSettings = {
  hasPublicList: boolean;
  hasDetailPage: boolean;
  urlPrefix: string;
};

const defaultSettings: ContentTypeSettings = {
  hasSlug: true,
  hasStatus: true,
  hasSortOrder: true,
  slugSource: "name",
  defaultStatus: "draft",
};

const defaultListDisplay: ListDisplay = {
  titleField: "name",
  subtitleField: "",
  imageField: "",
};

const defaultPublicSettings: PublicSettings = {
  hasPublicList: false,
  hasDetailPage: false,
  urlPrefix: "",
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ContentTypeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Basic info
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pluralName, setPluralName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [sortOrder, setSortOrder] = useState(0);

  // Field definitions
  const [fields, setFields] = useState<ContentFieldDefinition[]>([]);

  // Settings
  const [settings, setSettings] =
    useState<ContentTypeSettings>(defaultSettings);

  // List display
  const [listDisplay, setListDisplay] =
    useState<ListDisplay>(defaultListDisplay);

  // Public settings
  const [publicSettings, setPublicSettings] = useState<PublicSettings>(
    defaultPublicSettings,
  );

  useEffect(() => {
    async function load() {
      try {
        const result = await cmsContentTypeService.getById(id);
        const ct = result.data as ContentType;
        if (!ct) {
          setError("Content type not found.");
          setLoading(false);
          return;
        }
        setName(ct.name);
        setSlug(ct.slug);
        setPluralName(ct.pluralName);
        setIcon(ct.icon || "");
        setDescription(ct.description || "");
        setStatus(ct.status);
        setSortOrder(ct.sortOrder);
        setFields((ct.fields as ContentFieldDefinition[]) || []);
        setSettings({
          ...defaultSettings,
          ...((ct.settings as Partial<ContentTypeSettings>) || {}),
        });
        setListDisplay({
          ...defaultListDisplay,
          ...((ct.listDisplay as Partial<ListDisplay>) || {}),
          subtitleField:
            (ct.listDisplay as Partial<ListDisplay>)?.subtitleField ?? "",
          imageField:
            (ct.listDisplay as Partial<ListDisplay>)?.imageField ?? "",
        });
        setPublicSettings({
          ...defaultPublicSettings,
          ...((ct.publicSettings as Partial<PublicSettings>) || {}),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await cmsContentTypeService.update(id, {
        name,
        slug,
        pluralName,
        icon: icon || undefined,
        description: description || undefined,
        status,
        sortOrder,
        fields,
        settings,
        listDisplay,
        publicSettings,
      } as Partial<ContentType>);
      setSuccess("Content type saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-sm";
  const checkboxClass = "h-4 w-4 rounded border-[var(--theme-border)]";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-[var(--theme-muted)]">Loading&hellip;</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/content-types")}
            className="rounded-lg border border-[var(--theme-border)] p-2 text-[var(--theme-muted)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--theme-text)]">
              Configure: {name || "Content Type"}
            </h1>
            <p className="text-sm text-[var(--theme-muted)]">
              Define fields, settings, and public access for this content type.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md bg-[var(--theme-primary)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Basic Info Card */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
          Basic Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Name
            </span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (!slug || slug === slugify(name)) {
                  setSlug(slugify(v));
                }
              }}
              placeholder="Blog Post"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Slug
            </span>
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={name ? slugify(name) : "content-type-slug"}
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Plural Name
            </span>
            <input
              className={inputClass}
              value={pluralName}
              onChange={(e) => setPluralName(e.target.value)}
              placeholder="Blog Posts"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Icon (Lucide name)
            </span>
            <input
              className={inputClass}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="file-text"
            />
          </label>
          <label className="col-span-2">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Description
            </span>
            <textarea
              rows={2}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Status
            </span>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Sort Order
            </span>
            <input
              type="number"
              className={inputClass}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {/* Field Definitions Card */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
          Field Definitions
        </h3>
        <p className="text-sm text-[var(--theme-muted)] mb-4">
          Define the custom fields for items of this content type. These fields
          appear in the content editor form.
        </p>
        <FieldBuilder fields={fields} onChange={setFields} />
      </div>

      {/* Settings Card */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
          Content Settings
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={settings.hasSlug}
              onChange={(e) =>
                setSettings({ ...settings, hasSlug: e.target.checked })
              }
            />
            <span className="text-sm text-[var(--theme-text)]">
              Items have a slug (URL-friendly identifier)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={settings.hasStatus}
              onChange={(e) =>
                setSettings({ ...settings, hasStatus: e.target.checked })
              }
            />
            <span className="text-sm text-[var(--theme-text)]">
              Items have a status (draft/published)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={settings.hasSortOrder}
              onChange={(e) =>
                setSettings({ ...settings, hasSortOrder: e.target.checked })
              }
            />
            <span className="text-sm text-[var(--theme-text)]">
              Items have a sort order
            </span>
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Slug Source Field
            </span>
            <input
              className={inputClass}
              value={settings.slugSource}
              onChange={(e) =>
                setSettings({ ...settings, slugSource: e.target.value })
              }
              placeholder="name"
            />
            <span className="text-xs text-[var(--theme-muted)]">
              Which field to auto-generate slugs from.
            </span>
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Default Status
            </span>
            <select
              className={inputClass}
              value={settings.defaultStatus}
              onChange={(e) =>
                setSettings({ ...settings, defaultStatus: e.target.value })
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>
      </div>

      {/* List Display Card */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
          List Display
        </h3>
        <p className="text-sm text-[var(--theme-muted)] mb-4">
          Configure how items appear in the admin list view.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Title Field
            </span>
            <input
              className={inputClass}
              value={listDisplay.titleField}
              onChange={(e) =>
                setListDisplay({ ...listDisplay, titleField: e.target.value })
              }
              placeholder="name"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Subtitle Field
            </span>
            <input
              className={inputClass}
              value={listDisplay.subtitleField ?? ""}
              onChange={(e) =>
                setListDisplay({
                  ...listDisplay,
                  subtitleField: e.target.value,
                })
              }
              placeholder="(optional)"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Image Field
            </span>
            <input
              className={inputClass}
              value={listDisplay.imageField ?? ""}
              onChange={(e) =>
                setListDisplay({ ...listDisplay, imageField: e.target.value })
              }
              placeholder="(optional)"
            />
          </label>
        </div>
      </div>

      {/* Public Settings Card */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
          Public Access
        </h3>
        <p className="text-sm text-[var(--theme-muted)] mb-4">
          Control how this content type is accessible on the public website.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={publicSettings.hasPublicList}
              onChange={(e) =>
                setPublicSettings({
                  ...publicSettings,
                  hasPublicList: e.target.checked,
                })
              }
            />
            <span className="text-sm text-[var(--theme-text)]">
              Enable public list page (e.g. /blog)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={publicSettings.hasDetailPage}
              onChange={(e) =>
                setPublicSettings({
                  ...publicSettings,
                  hasDetailPage: e.target.checked,
                })
              }
            />
            <span className="text-sm text-[var(--theme-text)]">
              Enable detail pages (e.g. /blog/my-post)
            </span>
          </label>
          <label>
            <span className="text-sm font-medium text-[var(--theme-text)]">
              URL Prefix
            </span>
            <input
              className={inputClass}
              value={publicSettings.urlPrefix}
              onChange={(e) =>
                setPublicSettings({
                  ...publicSettings,
                  urlPrefix: e.target.value,
                })
              }
              placeholder="/blog"
            />
            <span className="text-xs text-[var(--theme-muted)]">
              Custom URL prefix. Leave empty to use the slug.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
