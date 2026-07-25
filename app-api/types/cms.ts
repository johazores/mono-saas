// ---------------------------------------------------------------------------
// CMS types — pages, content types, items, taxonomies, media, block templates
// ---------------------------------------------------------------------------

export type FlexibleBlock = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export type PageRecord = {
  id: string;
  title: string;
  slug: string;
  status: string;
  isHomepage: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  blocks: FlexibleBlock[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePageInput = {
  title: string;
  slug?: string;
  status?: string;
  isHomepage?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  blocks?: FlexibleBlock[];
};

export type UpdatePageInput = Partial<CreatePageInput>;

// ---------------------------------------------------------------------------
// Content type
// ---------------------------------------------------------------------------

export type ContentFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "image"
  | "file"
  | "url"
  | "date"
  | "datetime"
  | "color"
  | "group"
  | "repeater"
  | "flexible"
  | "specs"
  | "gallery"
  | "documents";

export type ContentFieldDefinition = {
  key: string;
  label: string;
  type: ContentFieldType;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  fields?: ContentFieldDefinition[];
  layouts?: string[];
  min?: number;
  max?: number;
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
  subtitleField?: string;
  imageField?: string;
};

export type ContentTypePublicSettings = {
  hasPublicList?: boolean;
  hasDetailPage?: boolean;
  urlPrefix?: string;
};

export type ContentTypeRecord = {
  id: string;
  name: string;
  slug: string;
  pluralName: string;
  icon: string | null;
  description: string | null;
  fields: ContentFieldDefinition[];
  settings: ContentTypeSettings;
  listDisplay: ContentTypeListDisplay | null;
  publicSettings: ContentTypePublicSettings | null;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateContentTypeInput = {
  name: string;
  slug: string;
  pluralName?: string;
  icon?: string;
  description?: string;
  fields?: ContentFieldDefinition[];
  settings?: ContentTypeSettings;
  listDisplay?: ContentTypeListDisplay;
  publicSettings?: ContentTypePublicSettings;
  status?: string;
  sortOrder?: number;
};

export type UpdateContentTypeInput = CreateContentTypeInput;

// ---------------------------------------------------------------------------
// Content item
// ---------------------------------------------------------------------------

export type ContentItemRecord = {
  id: string;
  contentTypeId: string;
  contentTypeSlug: string;
  slug: string;
  title: string;
  data: Record<string, unknown>;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export type TaxonomyRecord = {
  id: string;
  name: string;
  slug: string;
  pluralName: string;
  description: string | null;
  hierarchical: boolean;
  contentTypes: string[];
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTaxonomyInput = {
  name: string;
  slug?: string;
  pluralName?: string;
  description?: string;
  hierarchical?: boolean;
  contentTypes?: string[];
  status?: string;
  sortOrder?: number;
};

export type UpdateTaxonomyInput = CreateTaxonomyInput;

export type TaxonomyTermRecord = {
  id: string;
  taxonomyId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTaxonomyTermInput = {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  sortOrder?: number;
};

export type UpdateTaxonomyTermInput = CreateTaxonomyTermInput;

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaRecord = {
  id: string;
  source: string;
  fileName: string;
  originalName: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  mediaType: string;
  altText: string | null;
  base64Data: string | null;
  storageProvider: string | null;
  storageKey: string | null;
  checksum: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMediaInput = {
  source?: string;
  fileName: string;
  originalName: string;
  url?: string;
  mimeType?: string;
  size?: number;
  mediaType?: string;
  altText?: string;
  base64Data?: string;
};

export type MediaFileAccess =
  | {
      kind: "storage";
      url: string;
      expiresAt: Date;
    }
  | {
      kind: "legacy";
      mimeType: string;
      data: string;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type SpecsGroup = Record<
  string,
  Array<{ label: string; value: string }>
>;

export type DocumentItem = {
  label: string;
  url: string;
  type?: string;
};

export type GalleryImage = {
  url: string;
  alt?: string;
  caption?: string;
};

// ---------------------------------------------------------------------------
// Block templates (ACF flexible content layouts)
// ---------------------------------------------------------------------------

export type BlockTemplateRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string;
  fields: ContentFieldDefinition[];
  defaults: Record<string, unknown> | null;
  preview: string | null;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBlockTemplateInput = {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  category?: string;
  fields?: ContentFieldDefinition[];
  defaults?: Record<string, unknown>;
  preview?: string;
  status?: string;
  sortOrder?: number;
};

export type UpdateBlockTemplateInput = CreateBlockTemplateInput;
