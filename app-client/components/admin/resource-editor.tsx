"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { Modal, Button } from "@/components/ui";
import { FieldRenderer } from "@/components/admin/field-renderer";
import { slugify } from "@/lib/slugify";
import type {
  EditorSection,
  ResourceField,
  ResourceItem,
  ResourceEditorProps,
} from "@/types";

function getFieldSection(field: ResourceField): EditorSection {
  if (field.section) return field.section;
  if (["summary", "description"].includes(field.name)) return "Content";
  return "Basics";
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  if (keys.length === 1) return { ...obj, [path]: value };
  const [head, ...rest] = keys;
  const child = (obj[head] as Record<string, unknown>) ?? {};
  return { ...obj, [head]: setNestedValue({ ...child }, rest.join("."), value) };
}

export function ResourceEditor({
  item,
  fields,
  title,
  saving,
  onSave,
  onClose,
  renderExtra,
}: ResourceEditorProps) {
  const [editing, setEditing] = useState<ResourceItem>(item);
  const [activeSection, setActiveSection] = useState<EditorSection>("Basics");
  const autoSlugRef = useRef<string>("");

  const isNew = !item.id;

  const sections = useMemo(() => {
    const ordered: EditorSection[] = ["Basics", "Content", "Details"];
    return ordered.filter((section) =>
      fields.some((field) => getFieldSection(field) === section),
    );
  }, [fields]);

  // Build a map: sourceField → slug field names
  const slugLinks = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of fields) {
      if (f.type === "slug" && f.slugSource) {
        if (!map[f.slugSource]) map[f.slugSource] = [];
        map[f.slugSource].push(f.name);
      }
    }
    return map;
  }, [fields]);

  function setField(name: string, value: unknown) {
    setEditing((current) => {
      const next = name.includes(".")
        ? setNestedValue({ ...current }, name, value) as ResourceItem
        : { ...current, [name]: value };

      // Auto-populate linked slug fields when source changes
      const linkedSlugs = slugLinks[name];
      if (linkedSlugs && typeof value === "string") {
        const newSlug = slugify(value);
        for (const slugField of linkedSlugs) {
          const currentSlug = String(current[slugField] ?? "");
          // Only auto-set if slug is empty or matches the previously auto-generated value
          if (!currentSlug || currentSlug === autoSlugRef.current) {
            next[slugField] = newSlug;
            autoSlugRef.current = newSlug;
          }
        }
      }

      return next;
    });
  }

  return (
    <Modal
      title={isNew ? `New ${title}` : `Edit ${title}`}
      subtitle="Fill in the details below and save when you're done."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => onSave(editing)}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      }
    >
      {sections.length > 1 && (
        <div
          className="flex gap-1 border-b border-border mb-4"
          role="tablist"
          aria-label={`${title} editor sections`}
        >
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === section
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-background p-5">
        <div className="grid grid-cols-2 gap-4">
          {fields
            .filter((field) => getFieldSection(field) === activeSection)
            .map((field) => (
              <Fragment key={field.name}>
                <FieldRenderer
                  field={field}
                  value={getNestedValue(editing as Record<string, unknown>, field.name) ?? ""}
                  onChange={(val) => setField(field.name, val)}
                  allValues={editing}
                />
              </Fragment>
            ))}
        </div>
      </div>

      {renderExtra && renderExtra(editing, setField)}
    </Modal>
  );
}
