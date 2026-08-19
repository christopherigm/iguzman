"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
} from "@/components/admin/admin-entity-list";
import { Box } from "@repo/ui/core-elements/box";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  listHomepageFlyers,
  deleteHomepageFlyer,
  updateHomepageFlyer,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

/**
 * Homepage flyers - the promo slides the landing pages through, between the
 * success stories and the company highlights.
 *
 * Unlike /admin/highlights and /admin/featured-spotlight this page writes **no
 * System field at all**: a flyer's colour band, its edge shapes and its copy are
 * per-record, which is the whole reason it is a model. So the list is the whole
 * page, with nothing below the table.
 */
export default function AdminHomepageFlyersPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listHomepageFlyers(systemId));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [systemId, t]);

  useEffect(() => {
    // The async wrapper, as on every other CMS list: `load` sets state, and the
    // react-hooks rule rejects a setState reached synchronously from an effect
    // body.
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateHomepageFlyer,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateHomepageFlyer, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteHomepageFlyer(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: t("image") ?? "Image", compact: true },
    { key: "name", label: t("name") },
    {
      // How many catalog items the flyer features, rather than its sort order -
      // the order is what the drag handle above the table sets, so a column
      // restating it says nothing the list itself doesn't already read as.
      key: "items",
      label: t("items"),
      render: (value: unknown) => (
        <CellText>{Array.isArray(value) ? value.length : 0}</CellText>
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
          { label: t("homepageFlyers") },
        ]}
      />
      <AdminEntityList
        title={t("homepageFlyers")}
        items={items}
        columns={columns}
        basePath="/admin/homepage-flyers"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      >
        {/* Below the table rather than above it: the flyers are what the page is
            opened for, and this only explains when they appear on the site. */}
        <Box paddingTop={24}>
          <Typography variant="body" margin={0}>
            {t("homepageFlyersIntro")}
          </Typography>
        </Box>
      </AdminEntityList>
    </>
  );
}
