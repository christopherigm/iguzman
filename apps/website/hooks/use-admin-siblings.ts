"use client";

import { useEffect, useState } from "react";
import { listedRows, type EntityGroup } from "@/components/admin/entity-order";

/**
 * A CMS list call. Typed loosely on purpose: every `list*` in `lib/admin-api.ts`
 * fits, whether it returns untyped rows (`listProducts`) or a typed payload
 * (`listCoupons`), and whether or not it takes the tenant's id (`listSocialPosts`
 * takes none - an extra argument is simply ignored).
 */
export type AdminListFn = (systemId: number) => Promise<unknown[]>;

export interface AdminSiblingsConfig {
  /** The list route the records live under, e.g. `"/admin/menu-items"`. */
  basePath: string;
  /** The `[id]` route param - `"new"` for a record that does not exist yet. */
  id: string;
  systemId: number;
  /** The very call the entity's list page makes; rows come back in its order. */
  list: AdminListFn;
  /**
   * For the three lists the CMS groups into one collapsible table per category:
   * the row field holding the group's id, and the loader for the groups. With
   * both set the arrows walk the **flattened section order** - which is what the
   * operator is actually looking at - rather than the API's flat row order.
   *
   * Both must be module-level functions or primitives: they are effect deps, so
   * an inline arrow would re-fetch the list on every render.
   */
  groupKey?: string;
  groupList?: AdminListFn;
}

/**
 * Hrefs for the records either side of the one being edited. Either is
 * `undefined` at its end of the list (and both are while the list is still
 * loading), which is what disables the corresponding arrow.
 */
export interface AdminSiblings {
  prevHref?: string;
  nextHref?: string;
}

/**
 * The previous/next record in the CMS list, for the arrows flanking a detail
 * form's Save button.
 *
 * Returns `undefined` for an unsaved record - there is nothing to step away
 * from yet, and no place in the list to step from - which is also how a form
 * tells `AdminForm` not to render the arrows at all.
 *
 * ⚠ It fetches the list itself rather than taking rows a page may already hold.
 * A couple of the forms (menu items, users) do load the same list for their own
 * reasons and so pay for it twice; that is deliberate, because the alternative
 * is fifteen bespoke wirings of the same three lines, and these are admin pages
 * whose reads are cached in Django.
 */
export function useAdminSiblings({
  basePath,
  id,
  systemId,
  list,
  groupKey,
  groupList,
}: AdminSiblingsConfig): AdminSiblings | undefined {
  const isNew = id === "new";
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    void (async () => {
      try {
        const [rows, groups] = await Promise.all([
          list(systemId),
          groupList ? groupList(systemId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const ordering =
          groupKey && groups
            ? {
                key: groupKey,
                // Only the order of the ids matters here - nothing renders a
                // section heading - so the label is left blank.
                groups: (groups as Record<string, unknown>[]).map((g) => ({
                  id: g.id as EntityGroup["id"],
                  label: "",
                })),
              }
            : undefined;
        setIds(
          listedRows(rows as Record<string, unknown>[], ordering).map((r) =>
            Number(r.id),
          ),
        );
      } catch {
        // Non-critical: the form still loads and saves, the arrows just stay
        // disabled rather than pointing somewhere that may not exist.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, systemId, list, groupKey, groupList]);

  if (isNew) return undefined;

  // -1 while the list is loading, and for a record the list does not carry (one
  // just cloned into, say) - both give two disabled arrows, which is the honest
  // answer: there is no known neighbour to go to.
  const index = ids.indexOf(Number(id));
  const prev = index > 0 ? ids[index - 1] : undefined;
  const next =
    index >= 0 && index < ids.length - 1 ? ids[index + 1] : undefined;

  return {
    prevHref: prev === undefined ? undefined : `${basePath}/${prev}`,
    nextHref: next === undefined ? undefined : `${basePath}/${next}`,
  };
}
