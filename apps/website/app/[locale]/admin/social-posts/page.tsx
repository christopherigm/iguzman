"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
} from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Badge } from "@repo/ui/core-elements/badge";
import {
  listSocialPosts,
  deleteSocialPost,
  updateSocialPost,
  type SocialPost,
} from "@/lib/admin-api";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminSocialPostsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSocialPosts();
      setItems(data as unknown as Record<string, unknown>[]);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateSocialPost,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateSocialPost, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteSocialPost(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "name", label: t("name") },
    {
      key: "item",
      label: t("socialPostItem"),
      render: (v: unknown) => {
        const item = v as SocialPost["item"];
        return item?.name ? <CellText>{item.name}</CellText> : <EmptyCell />;
      },
    },
    {
      key: "template_id",
      label: t("socialPostTemplate"),
      render: (v: unknown) => <CellText>{String(v ?? "")}</CellText>,
    },
    {
      key: "format",
      label: t("socialPostFormat"),
      render: (v: unknown) => (
        <Badge variant="subtle" color="gray">
          {String(v ?? "")}
        </Badge>
      ),
    },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("socialPosts") },
        ]}
      />
      <AdminEntityList
        title={t("socialPosts")}
        items={items}
        columns={columns}
        basePath="/admin/social-posts"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      />
    </>
  );
}
