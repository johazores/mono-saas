# CMS User Guide

This guide explains how to use the Content Management System (CMS) built into the admin dashboard.

---

## Table of Contents

1. [Overview](#overview)
2. [Content Types](#content-types)
3. [Content Items](#content-items)
4. [Taxonomies](#taxonomies)
5. [Pages & Block Templates](#pages--block-templates)
6. [Media](#media)
7. [Public URLs](#public-urls)
8. [Workflows](#workflows)

---

## Overview

The CMS allows you to create, organize, and publish structured content on your website. It is built around these core concepts:

| Concept            | What It Does                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Content Type**   | Defines a _kind_ of content (e.g. "Blog Post", "Service", "Team Member"). Each content type has its own set of fields. |
| **Content Item**   | A single piece of content that belongs to a content type (e.g. one blog post).                                         |
| **Taxonomy**       | A classification system (like "Categories" or "Tags") that can be associated with content types.                       |
| **Page**           | A standalone page built with flexible blocks (hero, text, images, etc.).                                               |
| **Block Template** | A reusable template that defines the fields for a page block (e.g. a "Hero Banner" block).                             |
| **Media**          | Images and files uploaded to the system.                                                                               |

---

## Content Types

Content types are the backbone of the CMS. Think of them like WordPress "post types" or Strapi "collection types".

### Creating a Content Type

1. Go to **Admin → Content Types** in the sidebar.
2. Click **Add New**.
3. **Choose a starter template** from the grid:
   - **Blog Post** — Categories, tags, reading time
   - **Page** — Static pages with navigation toggle
   - **Service** — Pricing, icon, CTA
   - **Team Member** — Role, contact info, social links
   - **Product / Portfolio** — Gallery, specs, project info
   - **Event** — Date/time, location, registration
   - **Testimonial** — Rating, company info
   - **FAQ** — Category support
   - **Empty (custom)** — Start from scratch
4. Fill in details:
   - **Name**: Display name (e.g. "Blog Post"). The slug auto-generates from this.
   - **Slug**: URL-friendly identifier. Auto-generated but can be customized.
   - **Plural Name**: Used in the sidebar and list headings (e.g. "Blog Posts").
   - **Icon**: Optional Lucide icon name (e.g. `file-text`, `briefcase`). Shows in the sidebar.
5. Click **Create & Configure** to proceed to the full editor.

> **Note**: All standard fields (body, excerpt, featured image, author, visibility, etc.) are built-in on every content type. Starter templates only add extra type-specific fields on top of those.

### Configuring a Content Type (Full Editor)

After creating a content type, click the **Configure** button on the list item to open the full editor. This page has several sections:

#### Field Definitions

Define the custom fields that content editors will fill in. Each field has:

- **Name (key)**: Machine name used in the database (e.g. `featured_image`, `body_text`).
- **Label**: Human-readable label shown in the editor form.
- **Type**: The field type:
  - `text` — Single-line text input
  - `textarea` — Multi-line text
  - `rich-text` — HTML content editor
  - `number` — Numeric input
  - `boolean` — True/false toggle
  - `url` — URL input
  - `select` — Dropdown with predefined options
  - `date` — Date picker
  - `media` — Image/file from the media library
  - `repeater` — A group of sub-fields that can repeat (e.g. a list of features)
  - `gallery-list` — Image gallery
  - `document-list` — Document attachments
- **Width**: `full` (takes entire row) or `half` (side by side).
- **Required**: Whether the field must be filled.
- **Options**: For `select` fields, comma-separated values.

#### Content Settings

- **Items have a slug**: Enable URL-friendly slugs on items.
- **Items have a status**: Enable draft/published workflow.
- **Items have a sort order**: Enable manual ordering.
- **Slug Source Field**: Which field auto-generates the slug (default: `name`).
- **Default Status**: New items start as this status.

#### List Display

Configure how items appear in the admin list:

- **Title Field**: Which field to show as the item title.
- **Subtitle Field**: Optional secondary text.
- **Image Field**: Optional thumbnail image.

#### Public Access

- **Enable public list page**: Makes a list page available at `/{slug}` (e.g. `/blog`).
- **Enable detail pages**: Makes individual item pages available at `/{slug}/{item-slug}`.
- **URL Prefix**: Custom URL prefix (leave empty to use the content type slug).

---

## Content Items

Once a content type is created, its items appear in the sidebar under **Content**.

### Standard Fields (Built-In)

Every content item automatically gets these WordPress-like fields, regardless of which custom fields the content type defines:

| Field              | Purpose                             | Location in Editor   |
| ------------------ | ----------------------------------- | -------------------- |
| **Title**          | Item title; slug auto-generates     | Main column (top)    |
| **Body**           | Main content (textarea/HTML)        | Main column          |
| **Excerpt**        | Short summary for listings and SEO  | Main column          |
| **Featured Image** | Hero/thumbnail image (media picker) | Sidebar              |
| **Author**         | Author name                         | Sidebar (Publish)    |
| **Published At**   | Publish date                        | Sidebar (Publish)    |
| **Status**         | draft / published / pending / etc.  | Sidebar (Publish)    |
| **Visibility**     | public / private / password         | Sidebar (Publish)    |
| **Allow Comments** | Toggle discussion                   | Sidebar (Discussion) |
| **Format**         | standard / aside / gallery / video  | Sidebar (Format)     |
| **Template**       | Layout template for the item        | Sidebar (Attributes) |

Custom fields defined on the content type appear in the **"[Type Name] Fields"** card below the excerpt.

### Creating a Content Item

1. Click the content type name in the sidebar (e.g. "Blog Posts").
2. Click **New [Type Name]**.
3. The editor opens a WordPress-style 2-column layout:
   - **Main column**: Title, permalink, content body, excerpt, and any custom fields.
   - **Sidebar**: Publish box (status, visibility, date, author), format, featured image, discussion, page attributes.
4. Click **Publish** or **Save Draft**.

### Editing a Content Item

Click **Edit** on any item in the list to open the editor with the same form pre-filled.

---

## Taxonomies

Taxonomies let you classify content items. For example, a "Category" taxonomy for blog posts, or a "Tag" taxonomy for products.

### Creating a Taxonomy

1. Go to **Admin → Taxonomies** in the sidebar.
2. Click **Add New**.
3. Fill in:
   - **Name**: e.g. "Category". Slug auto-generates.
   - **Slug**: e.g. `category`.
   - **Plural Name**: e.g. "Categories".
   - **Hierarchical**: Choose "Flat (tags)" for simple tags, or "Hierarchical (categories)" for parent/child terms.
4. In the **Details** tab, check the **Content Types** this taxonomy applies to.
5. Click **Save Changes**.

### Managing Terms

After creating a taxonomy, you can add terms (e.g. "Technology", "Design", "Business" under a "Categories" taxonomy). Terms are managed through the taxonomy's detail view.

### Connecting Taxonomies to Content Types

When creating or editing a taxonomy:

1. Switch to the **Details** tab.
2. Under **Content Types**, check the content types this taxonomy should be available for.
3. Save. The taxonomy will now appear as an option when editing items of those content types.

---

## Pages & Block Templates

Pages use a **flexible content** system (similar to ACF Flexible Content in WordPress). Instead of a single body field, pages are composed of **blocks**.

### Block Templates

Block templates define the structure of each block type. Go to **Admin → Block Templates**.

Each template has:

- **Name/Slug**: Identifier for the block type.
- **Category**: Organizational grouping (layout, content, media, cta).
- **Fields**: The editable fields for the block (same field types as content types).

**Example**: A "Hero Banner" block template might have fields:

- `heading` (text) — The main heading
- `subheading` (text) — Supporting text
- `background_image` (media) — Background image
- `cta_text` (text) — Button text
- `cta_url` (url) — Button link

### Creating a Page

1. Go to **Admin → Pages**.
2. Click **New Page**.
3. Fill in the **Page Details** card (title, slug, status).
4. Optionally check **Set as Homepage** to make it the site's root page (`/`).
5. Fill in the **SEO** card (optional SEO title and description).
6. In the **Page Blocks** section, add blocks:
   - Select a block template from the dropdown.
   - Fill in the block's fields.
   - Reorder blocks by dragging.
   - Add as many blocks as needed.
7. Toggle the **Preview** button to see a live side-by-side preview while editing.
8. Click **Save**.

> **Note:** Only one page can be the homepage at a time. Setting a new page as homepage automatically unsets the previous one.

### How Blocks Render

Each block stores its template slug and field data. On the public site, the `BlockRenderer` component matches each block to its template and renders the content.

**Custom template renderers** can be registered in `components/blocks/templates/index.ts` for specialized rendering. If no custom renderer is registered, the generic field-type renderer is used.

---

## Media

The media library stores images and files used across the CMS.

### Uploading Media

1. Go to **Admin → Media**.
2. Use the upload interface to add images or files.
3. Media items get a unique ID and URL.

### Using Media in Content

When a content type or block template has a `media` field, editors can browse and select from the media library.

---

## Public URLs

The CMS generates public pages automatically based on your configuration:

| URL Pattern                | What It Shows         | Requirement                                        |
| -------------------------- | --------------------- | -------------------------------------------------- |
| `/`                        | Homepage              | A page must be published with "Set as Homepage" on |
| `/{page-slug}`             | A CMS Page            | Page must be published (middleware rewrites)        |
| `/p/{page-slug}`           | A CMS Page (direct)   | Page must be published                             |
| `/{type-slug}`             | List of content items | Content type must have `hasPublicList` enabled     |
| `/{type-slug}/{item-slug}` | Single content item   | Content type must have `hasDetailPage` enabled     |

Root-level page routing uses Next.js middleware to check if a slug matches a CMS page. If it does, the request is transparently rewritten to `/p/{slug}`. This means pages can be accessed at clean URLs like `/about` instead of `/p/about`.

These pages are server-side rendered (SSR) for SEO.

**Custom URL prefixes**: If you set a URL prefix on a content type (e.g. `/blog`), items will be accessible at `/blog/{item-slug}` instead of `/{type-slug}/{item-slug}`.

---

## Workflows

### Typical workflow: Adding a blog to your site

1. **Create a content type** called "Blog Post":
   - Use the "Blog Post" starter template, or start from "Empty".
   - Standard fields (body, excerpt, featured image, author, etc.) are built-in — no need to add them.
   - Add only extra type-specific fields (e.g. `category`, `tags`, `reading_time`).

2. **Configure the content type**:
   - Enable public list page and detail pages.
   - Set URL prefix to `/blog`.

3. **Create a taxonomy** called "Category":
   - Make it hierarchical.
   - Associate it with the "Blog Post" content type.

4. **Add terms** to the Category taxonomy (e.g. "Technology", "Design").

5. **Create blog posts**:
   - Go to the "Blog Posts" section in the sidebar.
   - The WordPress-like editor shows body, excerpt, featured image, and author fields automatically.
   - Set status to "Published" when ready.

6. **View on the public site**:
   - List page: `yourdomain.com/blog`
   - Detail page: `yourdomain.com/blog/my-first-post`

### Typical workflow: Creating a landing page

1. **Set up block templates** (if not already done):
   - Hero Banner, Text Block, Image Gallery, CTA Section, etc.

2. **Create a new page**:
   - Add blocks in the desired order.
   - Fill in each block's fields.
   - Preview and adjust.

3. **Publish**:
   - Set status to "Published".
   - Page is available at `/p/{slug}`.
