import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { resourceService } from "@/services/resource-service";
import { slugify } from "@/lib/slugify";
import type { ResourceField, FieldRendererProps, DynamicOption } from "@/types";

const RichTextEditor = dynamic(
  () =>
    import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="rounded-lg border border-border bg-background min-h-[250px] animate-pulse" /> },
);

function formatDateInput(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder-muted shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function FieldRenderer({
  field,
  value,
  onChange,
  allValues,
}: FieldRendererProps) {
  const displayValue = value == null ? "" : String(value);
  const wrapperClass = field.fullWidth ? "col-span-2" : "";

  if (field.type === "checkboxes") {
    return (
      <CheckboxesField
        field={field}
        value={value}
        onChange={onChange}
        wrapperClass={wrapperClass}
      />
    );
  }

  if (field.type === "slug") {
    const sourceValue =
      field.slugSource && allValues
        ? String(allValues[field.slugSource] ?? "")
        : "";
    return (
      <label className={`grid gap-1.5 ${wrapperClass}`}>
        <span className="text-sm font-medium text-foreground">
          {field.label}
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            className={inputClass}
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              sourceValue ? slugify(sourceValue) : "auto-generated-slug"
            }
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted hover:bg-surface hover:text-foreground transition-colors"
            title="Generate from name"
            onClick={() => {
              if (sourceValue) onChange(slugify(sourceValue));
            }}
          >
            Generate
          </button>
        </div>
        {field.help && <span className="text-xs text-muted">{field.help}</span>}
      </label>
    );
  }

  if (field.type === "combobox") {
    return (
      <ComboboxField
        field={field}
        value={displayValue}
        onChange={onChange}
        wrapperClass={wrapperClass}
      />
    );
  }

  if (field.type === "rich-text") {
    return (
      <div className={`grid gap-1.5 ${wrapperClass || "col-span-2"}`}>
        <span className="text-sm font-medium text-foreground">
          {field.label}
        </span>
        <RichTextEditor
          value={displayValue}
          onChange={(html) => onChange(html)}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
        />
        {field.help && <span className="text-xs text-muted">{field.help}</span>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className={`grid gap-1.5 ${wrapperClass || "col-span-2"}`}>
        <span className="text-sm font-medium text-foreground">
          {field.label}
        </span>
        <textarea
          className={`${inputClass} resize-y`}
          value={displayValue}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.help && <span className="text-xs text-muted">{field.help}</span>}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className={`grid gap-1.5 ${wrapperClass}`}>
        <span className="text-sm font-medium text-foreground">
          {field.label}
        </span>
        <select
          className={inputClass}
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {field.optionLabels?.[option] ??
                option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {field.help && <span className="text-xs text-muted">{field.help}</span>}
      </label>
    );
  }

  return (
    <label className={`grid gap-1.5 ${wrapperClass}`}>
      <span className="text-sm font-medium text-foreground">{field.label}</span>
      <input
        type={field.type}
        className={inputClass}
        value={field.type === "date" ? formatDateInput(value) : displayValue}
        onChange={(e) =>
          onChange(
            field.type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
      />
      {field.help && <span className="text-xs text-muted">{field.help}</span>}
    </label>
  );
}

// --- Checkboxes sub-component ---

function CheckboxesField({
  field,
  value,
  onChange,
  wrapperClass,
}: {
  field: ResourceField;
  value: unknown;
  onChange: (value: unknown) => void;
  wrapperClass: string;
}) {
  const [options, setOptions] = useState<DynamicOption[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);

  // Parse current value to a Set of selected keys
  const selected = (() => {
    if (Array.isArray(value)) return new Set(value as string[]);
    if (typeof value === "string" && value.trim()) {
      return new Set(
        value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    return new Set<string>();
  })();

  const loadOptions = useCallback(async () => {
    if (!field.optionsEndpoint) {
      // Fall back to static options
      setOptions(
        (field.options ?? []).map((o) => ({
          key: o,
          description: field.optionLabels?.[o] ?? o,
          category: "",
        })),
      );
      return;
    }
    setLoadingOpts(true);
    try {
      const items = await resourceService.fetchOptions<Record<string, unknown>>(
        field.optionsEndpoint,
      );
      if (field.optionsMapping) {
        const { keyField, labelField } = field.optionsMapping;
        setOptions(
          items.map((item) => ({
            key: String(item[keyField] ?? ""),
            description: String(item[labelField] ?? item[keyField] ?? ""),
            category: "",
          })),
        );
      } else {
        setOptions(items as unknown as DynamicOption[]);
      }
    } catch {
      // Silently fall back to empty
    } finally {
      setLoadingOpts(false);
    }
  }, [
    field.optionsEndpoint,
    field.options,
    field.optionLabels,
    field.optionsMapping,
  ]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next));
  }

  // Group by category
  const grouped: Record<string, DynamicOption[]> = {};
  for (const opt of options) {
    const cat = opt.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(opt);
  }

  return (
    <div className={`grid gap-1.5 ${wrapperClass || "col-span-2"}`}>
      <span className="text-sm font-medium text-foreground">{field.label}</span>
      {field.help && <span className="text-xs text-muted">{field.help}</span>}
      {loadingOpts && (
        <span className="text-xs text-muted">Loading&hellip;</span>
      )}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            {Object.keys(grouped).length > 1 && (
              <div className="sticky top-0 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                {cat}
              </div>
            )}
            {items.map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.key)}
                  onChange={() => toggle(opt.key)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="min-w-0 text-sm text-foreground">
                  {opt.description || opt.key}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {opt.key}
                </span>
              </label>
            ))}
          </div>
        ))}
        {!loadingOpts && options.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted">No options available.</p>
        )}
      </div>
      {selected.size > 0 && (
        <p className="text-xs text-muted">
          {selected.size} selected: {Array.from(selected).join(", ")}
        </p>
      )}
    </div>
  );
}

// --- Combobox sub-component (text input with datalist suggestions) ---

function ComboboxField({
  field,
  value,
  onChange,
  wrapperClass,
}: {
  field: ResourceField;
  value: string;
  onChange: (value: unknown) => void;
  wrapperClass: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const listId = `combobox-${field.name}`;

  const loadSuggestions = useCallback(async () => {
    const endpoint = field.suggestionsEndpoint;
    if (!endpoint) {
      setSuggestions(field.options ?? []);
      return;
    }
    try {
      const items =
        await resourceService.fetchOptions<Record<string, unknown>>(endpoint);
      const extractField = field.suggestionsField ?? "category";
      const unique = [
        ...new Set(
          items.map((item) => String(item[extractField] ?? "")).filter(Boolean),
        ),
      ];
      setSuggestions(unique);
    } catch {
      // silent
    }
  }, [field.suggestionsEndpoint, field.suggestionsField, field.options]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  return (
    <label className={`grid gap-1.5 ${wrapperClass}`}>
      <span className="text-sm font-medium text-foreground">{field.label}</span>
      <input
        type="text"
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder={field.help || "Type or select..."}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {field.help && <span className="text-xs text-muted">{field.help}</span>}
    </label>
  );
}
