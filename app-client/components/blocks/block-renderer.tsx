import Link from "next/link";
import type { ContentFieldDefinition, FlexibleBlock } from "@/types";
import { templateRegistry } from "./templates";

/**
 * Template definitions are passed in so this component works both as a
 * server component (SSR pages that fetch templates at build time) and as
 * a client component (preview in the admin page builder).
 *
 * Each template maps slug → field definitions, allowing the renderer to
 * decide how to display each field based on its type.
 *
 * Custom renderers can be registered in `./templates/index.ts` to override
 * the generic field-type rendering for specific template slugs.
 */
type TemplateDef = {
  name: string;
  slug: string;
  fields: ContentFieldDefinition[];
};

type BlockRendererProps = {
  blocks: FlexibleBlock[];
  templates: TemplateDef[];
};

// ---------------------------------------------------------------------------
// Field renderers (maps field type → visual output)
// ---------------------------------------------------------------------------

function renderField(field: ContentFieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  switch (field.type) {
    case "rich-text":
      return (
        <div
          className="prose prose-neutral max-w-none"
          dangerouslySetInnerHTML={{ __html: String(value) }}
        />
      );

    case "textarea":
      return (
        <p className="text-[var(--theme-muted)] whitespace-pre-line">
          {String(value)}
        </p>
      );

    case "media":
    case "url":
      if (
        field.type === "media" ||
        (typeof value === "string" &&
          /\.(jpe?g|png|gif|webp|svg)$/i.test(value))
      ) {
        return (
          <img
            src={String(value)}
            alt={field.label}
            loading="lazy"
            decoding="async"
            className="w-full h-auto rounded-lg object-cover"
          />
        );
      }
      return (
        <Link
          href={String(value)}
          className="text-[var(--theme-primary)] underline"
        >
          {field.label}
        </Link>
      );

    case "boolean":
      return value ? <span className="text-sm text-green-600">Yes</span> : null;

    case "number":
      return (
        <strong className="text-3xl font-bold text-[var(--theme-primary)]">
          {String(value)}
        </strong>
      );

    case "select":
      return (
        <span className="inline-block rounded-full bg-[var(--theme-surface)] px-3 py-1 text-xs font-medium text-[var(--theme-text)]">
          {String(value)}
        </span>
      );

    case "repeater": {
      if (!Array.isArray(value) || value.length === 0) return null;
      const subFields = field.subFields || [];
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {value.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"
            >
              {subFields.map((sf) => {
                const subVal = (item as Record<string, unknown>)?.[sf.name];
                if (!subVal) return null;
                return (
                  <div key={sf.name} className="mb-2">
                    {renderField(sf, subVal)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    }

    case "gallery-list": {
      if (!Array.isArray(value) || value.length === 0) return null;
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {value.map((img, i) => {
            const imgObj = img as Record<string, string>;
            return (
              <figure key={i}>
                <img
                  src={imgObj.url || imgObj.src || ""}
                  alt={imgObj.alt || imgObj.caption || "Image"}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-48 object-cover rounded-lg"
                />
                {imgObj.caption && (
                  <figcaption className="text-xs text-[var(--theme-muted)] mt-1">
                    {imgObj.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      );
    }

    case "document-list": {
      if (!Array.isArray(value) || value.length === 0) return null;
      return (
        <div className="space-y-2">
          {value.map((doc, i) => {
            const docObj = doc as Record<string, string>;
            return (
              <a
                key={i}
                href={docObj.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-[var(--theme-border)] px-4 py-3 hover:bg-[var(--theme-surface)]"
              >
                <span className="text-sm font-medium text-[var(--theme-text)]">
                  {docObj.label || docObj.title || "Document"}
                </span>
                <small className="text-xs text-[var(--theme-muted)]">
                  {docObj.type || "File"}
                </small>
              </a>
            );
          })}
        </div>
      );
    }

    // text, date, and everything else
    default:
      return <p className="text-[var(--theme-text)]">{String(value)}</p>;
  }
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

export function BlockRenderer({ blocks, templates }: BlockRendererProps) {
  const templateMap = new Map(templates.map((t) => [t.slug, t]));

  return (
    <>
      {(blocks || []).map((block, index) => {
        const template = templateMap.get(block.templateSlug);
        if (!template) return null;

        const data = block.data || {};
        const fields = template.fields || [];

        // Check for a custom template renderer in the registry
        const CustomRenderer = templateRegistry[block.templateSlug];
        if (CustomRenderer) {
          return (
            <section
              key={`${block.templateSlug}-${index}`}
              className="py-12 px-6"
            >
              <CustomRenderer data={data} fields={fields} />
            </section>
          );
        }

        // Generic field-type rendering (default fallback)
        // Determine section layout based on field count and types
        const hasImage = fields.some(
          (f) =>
            f.type === "media" &&
            data[f.name] &&
            String(data[f.name]).length > 0,
        );
        const hasRepeater = fields.some(
          (f) =>
            (f.type === "repeater" ||
              f.type === "gallery-list" ||
              f.type === "document-list") &&
            Array.isArray(data[f.name]) &&
            (data[f.name] as unknown[]).length > 0,
        );

        // Find a title field (first text field, or field named "title"/"heading")
        const titleField = fields.find(
          (f) =>
            f.name === "title" || f.name === "heading" || f.name === "eyebrow",
        );
        const titleValue = titleField
          ? String(data[titleField.name] || "")
          : "";

        return (
          <section
            key={`${block.templateSlug}-${index}`}
            className="py-12 px-6"
          >
            {/* Section heading */}
            {titleValue && (
              <h2 className="text-2xl font-bold mb-6 text-[var(--theme-text)]">
                {titleValue}
              </h2>
            )}

            {/* Two-column layout when there's an image alongside text fields */}
            {hasImage && !hasRepeater ? (
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4">
                  {fields
                    .filter(
                      (f) =>
                        f.type !== "media" &&
                        f.name !== titleField?.name &&
                        data[f.name] !== undefined &&
                        data[f.name] !== "",
                    )
                    .map((f) => (
                      <div key={f.name}>{renderField(f, data[f.name])}</div>
                    ))}
                </div>
                <div className="flex-1">
                  {fields
                    .filter((f) => f.type === "media" && data[f.name])
                    .map((f) => (
                      <div key={f.name}>{renderField(f, data[f.name])}</div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto">
                {fields
                  .filter(
                    (f) =>
                      f.name !== titleField?.name &&
                      data[f.name] !== undefined &&
                      data[f.name] !== "" &&
                      data[f.name] !== false,
                  )
                  .map((f) => (
                    <div key={f.name}>{renderField(f, data[f.name])}</div>
                  ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
