"use client";

import { useState } from "react";
import { Button, Notice, PageHeader } from "@/components/ui";
import { ResourceEditor } from "@/components/admin/resource-editor";
import { ResourceList } from "@/components/admin/resource-list";
import { useAdminResource } from "@/hooks/use-admin-resource";
import { resourceService } from "@/services/resource-service";
import type { ResourceItem, ResourceManagerProps } from "@/types";

export function ResourceManager({
  title,
  endpoint,
  fields,
  getTitle,
  getSubtitle,
  emptyItem,
  headerAction,
  renderItemActions,
  renderEditorExtra,
}: ResourceManagerProps) {
  const { items, loading, error, reload } =
    useAdminResource<ResourceItem>(endpoint);
  const [editingItem, setEditingItem] = useState<ResourceItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  async function handleSave(item: ResourceItem) {
    setSaving(true);
    setNotice(null);

    try {
      await resourceService.save(endpoint, item as Record<string, unknown>);
    } catch (err) {
      setSaving(false);
      setNotice({
        message: err instanceof Error ? err.message : "Save failed.",
        variant: "error",
      });
      return;
    }

    setSaving(false);
    setEditingItem(null);
    setNotice({ message: "Saved successfully.", variant: "success" });
    await reload();
  }

  async function handleDelete(item: ResourceItem) {
    if (!window.confirm(`Delete ${getTitle(item)}?`)) return;
    try {
      await resourceService.remove(endpoint, item.id!);
      await reload();
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Delete failed.",
        variant: "error",
      });
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={title}
        description={`Manage your ${title.toLowerCase()} from here.`}
        action={
          headerAction ?? (
            <Button
              onClick={() => {
                setEditingItem(emptyItem);
                setNotice(null);
              }}
            >
              Add New
            </Button>
          )
        }
      />

      {notice && <Notice message={notice.message} variant={notice.variant} />}
      {error && <Notice message={error} variant="error" />}

      {editingItem && (
        <ResourceEditor
          item={editingItem}
          fields={fields}
          title={editingItem.id ? getTitle(editingItem) : title}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditingItem(null)}
          renderExtra={renderEditorExtra}
        />
      )}

      <ResourceList
        items={items}
        loading={loading}
        getTitle={getTitle}
        getSubtitle={getSubtitle}
        onEdit={(item) => {
          setEditingItem(item);
          setNotice(null);
        }}
        onDelete={handleDelete}
        renderItemActions={renderItemActions}
      />
    </section>
  );
}
