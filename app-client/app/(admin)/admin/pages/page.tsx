"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageBuilder } from "@/components/admin/page-builder";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import {
  cmsPageService,
  cmsBlockTemplateService,
} from "@/services/cms-service";
import { slugify } from "@/lib/slugify";
import type { CmsPage, FlexibleBlock, BlockTemplate } from "@/types";

const swrKey = "/api/cms/pages";

async function fetchPages() {
  const result = await cmsPageService.list();
  return result.data?.items ?? [];
}

async function fetchTemplates() {
  const result = await cmsBlockTemplateService.list();
  return result.data?.items ?? [];
}

const emptyPage = {
  title: "",
  slug: "",
  status: "draft",
  isHomepage: false,
  seoTitle: "",
  seoDescription: "",
  blocks: [] as FlexibleBlock[],
};

export default function PagesAdminPage() {
  const { data: pages = [], mutate } = useSWR<CmsPage[]>(swrKey, fetchPages);
  const { data: blockTemplates = [] } = useSWR<BlockTemplate[]>(
    "/api/cms/block-templates",
    fetchTemplates,
  );
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyPage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);

  function openNew() {
    setEditing(null);
    setCreating(true);
    setForm({ ...emptyPage, blocks: [] });
    setError("");
    setPreview(false);
  }

  function openEdit(page: CmsPage) {
    setEditing(page);
    setCreating(false);
    setForm({
      title: page.title,
      slug: page.slug,
      status: page.status,
      isHomepage: page.isHomepage || false,
      seoTitle: page.seoTitle || "",
      seoDescription: page.seoDescription || "",
      blocks: page.blocks || [],
    });
    setError("");
    setPreview(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await cmsPageService.update(editing.id, form);
      } else {
        await cmsPageService.create(form);
      }
      await mutate();
      setEditing(null);
      setCreating(false);
      setForm({ ...emptyPage, blocks: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this page?")) return;
    try {
      await cmsPageService.delete(id);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const inputClass =
    "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-sm";

  // If editing or creating, show the page builder form
  if (editing !== null || creating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--theme-text)]">
            {editing ? "Edit Page" : "New Page"}
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-md border px-4 py-1.5 text-sm ${preview ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]" : "border-[var(--theme-border)] hover:bg-[var(--theme-surface)]"}`}
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Hide Preview" : "Preview"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--theme-border)] px-4 py-1.5 text-sm hover:bg-[var(--theme-surface)]"
              onClick={() => {
                setEditing(null);
                setCreating(false);
                setForm({ ...emptyPage, blocks: [] });
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--theme-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className={`${preview ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}`}>
          {/* Editor panel */}
          <div className={`space-y-6 ${preview ? "overflow-y-auto max-h-[calc(100vh-12rem)]" : ""}`}>
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
                Page Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    Title
                  </span>
                  <input
                    className={inputClass}
                    value={form.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      const patch: typeof form = { ...form, title };
                      if (!form.slug || form.slug === slugify(form.title)) {
                        patch.slug = slugify(title);
                      }
                      setForm(patch);
                    }}
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    Slug
                  </span>
                  <input
                    className={inputClass}
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder={form.title ? slugify(form.title) : "page-slug"}
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    Status
                  </span>
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end py-2">
                  <input
                    type="checkbox"
                    checked={form.isHomepage}
                    onChange={(e) =>
                      setForm({ ...form, isHomepage: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    Set as Homepage
                  </span>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
                SEO
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    SEO Title
                  </span>
                  <input
                    className={inputClass}
                    value={form.seoTitle}
                    onChange={(e) =>
                      setForm({ ...form, seoTitle: e.target.value })
                    }
                  />
                </label>
                <label className="col-span-2">
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    SEO Description
                  </span>
                  <textarea
                    rows={2}
                    className={inputClass}
                    value={form.seoDescription}
                    onChange={(e) =>
                      setForm({ ...form, seoDescription: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg,var(--theme-background))] p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-[var(--theme-muted)] uppercase tracking-wide">
                Page Blocks
              </h3>
              <PageBuilder
                value={form.blocks}
                onChange={(blocks) => setForm({ ...form, blocks })}
              />
            </div>
          </div>

          {/* Preview panel (side-by-side when active) */}
          {preview && (
            <div className="rounded-xl border border-[var(--theme-border)] bg-white overflow-y-auto max-h-[calc(100vh-12rem)] shadow-sm">
              <div className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-2">
                <p className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wide">
                  Live Preview
                </p>
              </div>
              <div className="p-4">
                {form.blocks.length > 0 ? (
                  <BlockRenderer blocks={form.blocks} templates={blockTemplates} />
                ) : (
                  <p className="text-center py-12 text-sm text-[var(--theme-muted)]">
                    Add blocks to see a preview
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--theme-text)]">Pages</h1>
        <button
          type="button"
          className="rounded-md bg-[var(--theme-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          onClick={openNew}
        >
          New Page
        </button>
      </div>

      {pages.length === 0 && (
        <p className="text-sm text-[var(--theme-muted)]">
          No pages yet. Create your first page.
        </p>
      )}

      <div className="space-y-2">
        {pages.map((page) => (
          <div
            key={page.id}
            className="flex items-center justify-between rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3"
          >
            <div>
              <p className="font-medium text-[var(--theme-text)]">
                {page.title}
                {page.isHomepage && (
                  <span className="ml-2 inline-block rounded bg-[var(--theme-primary)]/10 px-1.5 py-0.5 text-xs font-medium text-[var(--theme-primary)]">
                    Homepage
                  </span>
                )}
              </p>
              <p className="text-xs text-[var(--theme-muted)]">
                /{page.slug} · {page.status} · {(page.blocks || []).length}{" "}
                blocks
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-sm text-[var(--theme-primary)] hover:underline"
                onClick={() => openEdit(page)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-red-500 hover:underline"
                onClick={() => handleDelete(page.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
