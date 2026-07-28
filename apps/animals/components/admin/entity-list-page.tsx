"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList, type Column } from "./admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

type Row = Record<string, unknown>;

interface EntityResource {
  list: (query?: string) => Promise<Row[]>;
  update: (pk: number, data: Row) => Promise<Row>;
  remove: (pk: number) => Promise<void>;
}

interface EntityListPageProps {
  /** `Admin` message key for this entity's plural name - the page title. */
  titleKey: string;
  /** The CRUD calls, from `lib/admin-api`. */
  resource: EntityResource;
  columns: Column[];
  /** Route prefix, e.g. `/admin/categories`. Edit and New links hang off it. */
  basePath: string;
  /**
   * Whether the rows can be dragged into an order. Off for entities with no
   * `sort_order` column - the switch would offer a rearrangement the API has
   * nowhere to store.
   */
  sortable?: boolean;
}

/**
 * The list half of every catalog/journal admin section.
 *
 * website spells this out once per entity - twenty near-identical files that
 * differ only in which four functions they import and what their columns are
 * called. The API here is uniform enough (`core/views.py` gives every resource
 * the same endpoints) that the page can be too, so a section is a column list
 * plus a route.
 *
 * The form half is *not* shared: a species form has a category picker and a
 * gallery, a sighting form has five relations and a date, a season form has a
 * month picker. Those differences are the whole content of each page.
 */
export function EntityListPage({
  titleKey,
  resource,
  columns,
  basePath,
  sortable = true,
}: EntityListPageProps) {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await resource.list());
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [resource, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(resource.update, setItems, setError);
  const handleReorder = useReorder(resource.update, setItems, setError);

  const handleDelete = async (id: number) => {
    try {
      await resource.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      // A 409 is the API refusing to delete a row something else still points
      // at - a category that still has species, a species that still has
      // sightings. Saying so is the difference between "try again" and "empty
      // it first"; a generic failure message leaves the author guessing.
      const status = (err as { status?: number }).status;
      setError(status === 409 ? t("errorDeleteProtected") : t("errorDelete"));
    }
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t(titleKey) },
        ]}
      />
      <AdminEntityList
        title={t(titleKey)}
        items={items}
        columns={columns}
        basePath={basePath}
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={sortable ? handleReorder : undefined}
        loading={loading}
        error={error}
      />
    </>
  );
}
