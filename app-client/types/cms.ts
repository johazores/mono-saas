// ---------------------------------------------------------------------------
// CMS Page
// ---------------------------------------------------------------------------

export type CmsPage = {
  id: string;
  title: string;
  slug: string;
  status: string;
  isHomepage?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  blocks: FlexibleBlock[];
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Content type
// ---------------------------------------------------------------------------

export type ContentFieldType =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "media"
  | "number"
  | "boolean"
  | "url"
  | "rich-text"
  | "repeater"
  | "array-text"
  | "pair-list"
  | "grouped-pair-list"
  | "gallery-list"
  | "document-list"
  | "rate-table-list"
  | "relation"
  | "taxonomy";

export type ContentFieldDefinition = {
  name: string;
  label: string;
  type: ContentFieldType;
  required?: boolean;
  options?: string[];
  multiple?: boolean;
  taxonomySlug?: string;
  placeholder?: string;
  subFields?: ContentFieldDefinition[];
  width?: "full" | "half";
};

export type ContentTypeSettings = {
  hasSlug?: boolean;
  hasStatus?: boolean;
  hasSortOrder?: boolean;
  slugSource?: string;
  defaultStatus?: string;
};

export type ContentTypeListDisplay = {
  titleField?: string;
  subtitleField?: string | null;
  imageField?: string | null;
};

export type ContentTypePublicSettings = {
  hasPublicList?: boolean;
  hasDetailPage?: boolean;
  urlPrefix?: string | null;
};

export type ContentType = {
  id: string;
  name: string;
  slug: string;
  pluralName: string;
  icon?: string | null;
  description?: string | null;
  fields: ContentFieldDefinition[];
  settings: ContentTypeSettings;
  listDisplay?: ContentTypeListDisplay | null;
  publicSettings?: ContentTypePublicSettings | null;
  status: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Content item
// ---------------------------------------------------------------------------

export type ContentItem = {
  id: string;
  contentTypeId: string;
  contentTypeSlug: string;
  slug: string;
  title: string;
  data: Record<string, unknown>;
  status: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export type Taxonomy = {
  id: string;
  name: string;
  slug: string;
  pluralName: string;
  description?: string | null;
  hierarchical: boolean;
  contentTypes: string[];
  status: string;
  sortOrder: number;
  terms?: TaxonomyTerm[];
  createdAt?: string;
  updatedAt?: string;
};

export type TaxonomyTerm = {
  id: string;
  taxonomyId: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaItem = {
  id: string;
  source: string;
  fileName: string;
  originalName: string;
  url: string;
  mimeType?: string | null;
  size?: number | null;
  mediaType: string;
  altText?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Block templates (ACF flexible content layouts)
// ---------------------------------------------------------------------------

export type BlockTemplate = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  category: string;
  fields: ContentFieldDefinition[];
  defaults?: Record<string, unknown> | null;
  preview?: string | null;
  status: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

/** A single block instance on a page — references a template by slug */
export type FlexibleBlock = {
  templateSlug: string;
  data: Record<string, unknown>;
};
