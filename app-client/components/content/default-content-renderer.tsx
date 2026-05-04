import type { ContentFieldDefinition } from "@/types";
import { mediaUrl } from "@/lib/media-url";

type DefaultContentRendererProps = {
  item: Record<string, unknown>;
  fields: ContentFieldDefinition[];
};

/**
 * Default renderer for any content item based on its content type field definitions.
 * Iterates ALL fields and renders each by type — provides a WordPress-like fallback
 * so content always displays even without a custom template.
 */
export function DefaultContentRenderer({
  item,
  fields,
}: DefaultContentRendererProps) {
  const title = item.title as string | undefined;
  const featuredImage = item.featuredImage as string | undefined;

  // Fields to exclude from iteration (rendered separately or meta)
  const excludedFields = new Set([
    "title",
    "slug",
    "status",
    "seoTitle",
    "seoDescription",
    "sortOrder",
  ]);

  const contentFields = fields.filter((f) => !excludedFields.has(f.name));

  return (
    <article className="max-w-3xl mx-auto py-12 px-6">
      {/* Title */}
      {title && (
        <h1 className="text-3xl font-bold mb-6 text-[var(--theme-text)]">
          {title}
        </h1>
      )}

      {/* Featured image (if exists but not in field definitions) */}
      {featuredImage && !fields.find((f) => f.name === "featuredImage") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(featuredImage)}
          alt={title || ""}
          className="w-full rounded-lg mb-8 object-cover max-h-[480px]"
        />
      )}

      {/* Render each field by type */}
      <div className="space-y-6">
        {contentFields.map((field) => {
          const value = item[field.name];
          if (value === null || value === undefined || value === "") return null;

          return (
            <div key={field.name}>
              {renderContentField(field, value)}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function renderContentField(field: ContentFieldDefinition, value: unknown) {
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
        <div>
          <FieldLabel label={field.label} />
          <p className="text-[var(--theme-text)] whitespace-pre-line">
            {String(value)}
          </p>
        </div>
      );

    case "media":
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(String(value))}
            alt={field.label}
            loading="lazy"
            decoding="async"
            className="w-full rounded-lg object-cover max-h-[480px]"
          />
        </figure>
      );

    case "url":
      return (
        <div>
          <FieldLabel label={field.label} />
          <a
            href={String(value)}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--theme-primary)] underline hover:opacity-80"
          >
            {String(value)}
          </a>
        </div>
      );

    case "boolean":
      return value ? (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-[var(--theme-text)]">{field.label}</span>
        </div>
      ) : null;

    case "number":
      return (
        <div>
          <FieldLabel label={field.label} />
          <p className="text-2xl font-bold text-[var(--theme-primary)]">
            {String(value)}
          </p>
        </div>
      );

    case "date":
      return (
        <div>
          <FieldLabel label={field.label} />
          <time className="text-sm text-[var(--theme-muted)]">
            {new Date(String(value)).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>
      );

    case "select":
      return (
        <div>
          <FieldLabel label={field.label} />
          <span className="inline-block rounded-full bg-[var(--theme-surface)] border border-[var(--theme-border)] px-3 py-1 text-xs font-medium text-[var(--theme-text)]">
            {String(value)}
          </span>
        </div>
      );

    case "repeater": {
      if (!Array.isArray(value) || value.length === 0) return null;
      const subFields = field.subFields || [];
      return (
        <div>
          <FieldLabel label={field.label} />
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {value.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 space-y-2"
              >
                {subFields.map((sf) => {
                  const subVal = (item as Record<string, unknown>)?.[sf.name];
                  if (!subVal) return null;
                  return (
                    <div key={sf.name}>
                      {renderContentField(sf, subVal)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "gallery-list": {
      if (!Array.isArray(value) || value.length === 0) return null;
      return (
        <div>
          <FieldLabel label={field.label} />
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            {value.map((img, i) => {
              const imgObj = img as Record<string, string>;
              return (
                <figure key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(imgObj.url || imgObj.src || "")}
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
        </div>
      );
    }

    case "document-list": {
      if (!Array.isArray(value) || value.length === 0) return null;
      return (
        <div>
          <FieldLabel label={field.label} />
          <div className="mt-2 space-y-2">
            {value.map((doc, i) => {
              const docObj = doc as Record<string, string>;
              return (
                <a
                  key={i}
                  href={docObj.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-md border border-[var(--theme-border)] px-4 py-3 hover:bg-[var(--theme-surface)] transition-colors"
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
        </div>
      );
    }

    case "taxonomy": {
      if (!value) return null;
      const terms = Array.isArray(value) ? value : [value];
      return (
        <div>
          <FieldLabel label={field.label} />
          <div className="mt-1 flex flex-wrap gap-2">
            {terms.map((term, i) => (
              <span
                key={i}
                className="inline-block rounded-full bg-[var(--theme-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--theme-primary)]"
              >
                {typeof term === "object" && term !== null
                  ? (term as Record<string, string>).name || String(term)
                  : String(term)}
              </span>
            ))}
          </div>
        </div>
      );
    }

    // text and fallback
    default:
      return (
        <div>
          <FieldLabel label={field.label} />
          <p className="text-[var(--theme-text)]">{String(value)}</p>
        </div>
      );
  }
}

function FieldLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-[var(--theme-muted)] mb-1">
      {label}
    </p>
  );
}
