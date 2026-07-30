"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList, type Column } from "./admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import type { PageRequest, ResourcePage } from "@/lib/admin-api";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

type Row = Record<string, unknown>;

interface EntityResource {
  list: (query?: string) => Promise<Row[]>;
  /**
   * One page of the list, for a resource whose table has outgrown one request.
   * Required by `searchable`; without it the page reads the whole list as before.
   */
  listPage?: (params: PageRequest) => Promise<ResourcePage>;
  update: (pk: number, data: Row) => Promise<Row>;
  remove: (pk: number) => Promise<void>;
}

/** How long a keystroke waits before it becomes a request. */
const SEARCH_DEBOUNCE_MS = 300;

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
  /**
   * Read the list a page at a time, with a search box above the table. Needs
   * `resource.listPage`; ignored without it.
   *
   * Only for a list long enough that fetching it whole is the page's cost -
   * `/admin/species`. A short list is better served by having every row on
   * screen, where the browser's own Find works on it.
   */
  searchable?: boolean;
  /** Rows per page in `searchable` mode. The API caps a page at 100. */
  pageSize?: number;
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
  searchable = false,
  pageSize = 50,
}: EntityListPageProps) {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Row[]>([]);
  // How many rows *match*, which in paged mode is not how many are on screen.
  // A full read is its own count.
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // A re-query once the table is already up. Kept apart from `loading` so a
  // settled keystroke draws a progress bar over the rows instead of replacing
  // them with "Loading…" - the list would flash away on every search.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is in the box, and the term that has actually been sent. They differ
  // for the length of the debounce.
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const listPage = resource.listPage;
  const paged = searchable && listPage !== undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await resource.list();
      setItems(rows);
      setCount(rows.length);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [resource, t]);

  useEffect(() => {
    if (paged) return;
    void (async () => {
      await load();
    })();
  }, [paged, load]);

  useEffect(() => {
    if (!paged) return;
    const handle = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [paged, search]);

  // The first page, and a fresh first page on every settled search term.
  useEffect(() => {
    if (!paged || !listPage) return;
    // A term typed faster than the API answers puts two requests in flight; the
    // flag is what stops the slower one landing on top of the newer results.
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const page = await listPage({ search: query, limit: pageSize, offset: 0 });
        if (cancelled) return;
        setItems(page.results);
        setCount(page.count);
      } catch {
        if (!cancelled) setError(t("errorLoad"));
      } finally {
        if (!cancelled) {
          setBusy(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paged, listPage, query, pageSize, t]);

  const loadMore = async () => {
    if (!listPage) return;
    setBusy(true);
    setError(null);
    try {
      const page = await listPage({
        search: query,
        limit: pageSize,
        offset: items.length,
      });
      // Merged by id rather than appended blind: a row deleted from an earlier
      // page between the two requests slides the window back by one, and the
      // last row already on screen would arrive a second time.
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.results.filter((row) => !seen.has(row.id))];
      });
      setCount(page.count);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleEnabled = useToggleEnabled(resource.update, setItems, setError);
  const handleReorder = useReorder(resource.update, setItems, setError);

  const handleDelete = async (id: number) => {
    try {
      await resource.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      // A 409 is the API refusing to delete a row something else still points
      // at - a category that still has species, a species that still has
      // sightings. Saying so is the difference between "try again" and "empty
      // it first"; a generic failure message leaves the author guessing.
      const status = (err as { status?: number }).status;
      setError(status === 409 ? t("errorDeleteProtected") : t("errorDelete"));
    }
  };

  // Sort mode persists each row's `sort_order` as its index in the list on
  // screen, so it is only offered when that index is the row's real position:
  // the loaded rows are the *first* N of the API's own order, which a partial
  // page is not the whole of and a search result is no part of. Renumbering
  // either would reorder the catalog by what happened to be visible.
  const wholeListLoaded = items.length >= count;
  const canReorder = sortable && !query && wholeListLoaded;

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
        onReorder={canReorder ? handleReorder : undefined}
        loading={loading}
        error={error}
        emptyMessage={paged && query ? t("noMatches") : undefined}
        toolbar={
          paged ? (
            <Box flexDirection="column" gap={4} maxWidth={420}>
              <TextInput
                type="search"
                label={t("searchList")}
                value={search}
                onChange={setSearch}
                helperText={t("searchListHint")}
              />
              {busy && <ProgressBar />}
            </Box>
          ) : undefined
        }
        footer={
          paged && count > 0 ? (
            <Box alignItems="center" gap={16} flexWrap="wrap">
              <Typography variant="caption" color="var(--muted, #6b7280)">
                {t("showingOf", { shown: items.length, total: count })}
              </Typography>
              {!wholeListLoaded && (
                <Button
                  text={t("loadMore")}
                  size="md"
                  disabled={busy}
                  onClick={() => void loadMore()}
                />
              )}
            </Box>
          ) : undefined
        }
      />
    </>
  );
}
