"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import {
  listSuccessStories,
  deleteSuccessStory,
  updateSuccessStory,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminSuccessStoriesPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSuccessStories(systemId));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [systemId, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateSuccessStory,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateSuccessStory, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteSuccessStory(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "slug", label: "Slug" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("successStories") },
        ]}
      />
      <AdminEntityList
        title={t("successStories")}
        items={items}
        columns={columns}
        basePath="/admin/success-stories"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        bulkActions={{
          translate: ["name", "short_description", "description"],
          image: true,
          // Scoped to this list: rebuilds only these records' slugs from
          // the tenant's site prefix. /admin/system carries the same
          // component with no `models`, for the whole site at once.
          recreate: ["success-story"],
          update: updateSuccessStory,
          reload: load,
        }}
        loading={loading}
        error={error}
      />
    </>
  );
}
