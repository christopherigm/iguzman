"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listMenuItems,
  listProducts,
  listRecommendations,
  listServices,
  type RecommendationSourceKind,
} from "@/lib/admin-api";
import type {
  RecommendationOption,
  RecommendationRef,
} from "@/components/admin/recommendations-editor";

/** The category source that an item source inherits from. */
const CATEGORY_OF: Record<string, RecommendationSourceKind> = {
  product: "product_category",
  service: "service_category",
  menu_item: "menu_category",
};

interface Options {
  systemId: number;
  /** Which of the six sources this form is editing. */
  source: RecommendationSourceKind;
  /** The row's id, or `null` on a create - where there is nothing to load. */
  sourceId: number | null;
  /**
   * The item's currently selected category, for the "you are inheriting these"
   * readout. Item scopes only, and it follows the form's own category field
   * rather than the saved row, so re-filing a dish updates the readout before
   * the save.
   */
  categoryId?: number | null;
}

function toOption(
  kind: "product" | "service" | "menu_item",
  row: Record<string, unknown>,
): RecommendationOption {
  return {
    kind,
    id: row.id as number,
    name: (row.name as string | null) ?? null,
    en_name: (row.en_name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
  };
}

/**
 * The state behind `RecommendationsEditor`, shared by all six admin forms.
 *
 * It exists because every one of those forms needs the same three reads - the
 * pool of all three families, this source's own rows, and (for an item) what its
 * category currently recommends - and six copies of that would be six places for
 * the inherit/override rule to be got subtly wrong.
 *
 * Every read is non-critical: a failure leaves the picker empty rather than
 * blocking the form, matching how each page's own `loadMeta` treats its lookups.
 *
 * `value` is what the page sends as the `recommendations` field on save. It is
 * ordered, and the order is the strip's - the API stores each ref's position as
 * its `sort_order`.
 */
export function useRecommendationsEditor({
  systemId,
  source,
  sourceId,
  categoryId,
}: Options) {
  const [value, setValue] = useState<RecommendationRef[]>([]);
  const [catalog, setCatalog] = useState<RecommendationOption[]>([]);
  // Stamped with the category it was fetched for, so the readout is *derived*
  // rather than cleared in an effect. Two reasons: a synchronous `setState` in an
  // effect body is a cascading render (and the repo's react-hooks rules reject
  // it), and it means an in-flight answer for the previous category can never be
  // shown against the new one.
  const [fetched, setFetched] = useState<{
    categoryId: number;
    options: RecommendationOption[];
  } | null>(null);

  const isItem = source in CATEGORY_OF;

  // The whole catalog, all three families - a recommendation is cross-family, so
  // a picker that offered only the source's own family could not express "with a
  // pizza, offer a branded mug".
  useEffect(() => {
    if (!systemId) return;
    let current = true;
    void (async () => {
      try {
        const [products, services, menuItems] = await Promise.all([
          listProducts(systemId),
          listServices(systemId),
          listMenuItems(systemId),
        ]);
        if (!current) return;
        setCatalog([
          ...menuItems.map((row) => toOption("menu_item", row)),
          ...products.map((row) => toOption("product", row)),
          ...services.map((row) => toOption("service", row)),
        ]);
      } catch {
        /* non-critical: the picker simply has nothing to offer */
      }
    })();
    return () => {
      current = false;
    };
  }, [systemId]);

  // This source's own rows. Not the effective list: see `listRecommendations`.
  useEffect(() => {
    if (!sourceId) return;
    let current = true;
    void (async () => {
      try {
        const rows = await listRecommendations(source, sourceId);
        if (current) {
          setValue(rows.map((row) => ({ kind: row.kind, id: row.id })));
        }
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      current = false;
    };
  }, [source, sourceId]);

  // What the item's category recommends, for display while the item overrides
  // nothing. Skipped entirely for a category form, which inherits from nothing.
  useEffect(() => {
    const categorySource = CATEGORY_OF[source];
    if (!categorySource || !categoryId) return;
    let current = true;
    void (async () => {
      try {
        const rows = await listRecommendations(categorySource, categoryId);
        if (current) {
          setFetched({
            categoryId,
            options: rows.map((row) => ({
              kind: row.kind,
              id: row.id,
              name: row.name,
              en_name: row.en_name,
              image: row.image,
            })),
          });
        }
      } catch {
        /* non-critical: the readout is a courtesy, not a control */
      }
    })();
    return () => {
      current = false;
    };
  }, [source, categoryId]);

  // Only ever the list belonging to the category currently selected on the form.
  const inherited =
    categoryId && fetched?.categoryId === categoryId ? fetched.options : [];

  // The record being edited is never offered as its own recommendation - the API
  // drops a self-reference anyway, but offering it invites the operator to try.
  const options = useMemo(() => {
    if (!isItem || !sourceId) return catalog;
    return catalog.filter(
      (option) => !(option.kind === source && option.id === sourceId),
    );
  }, [catalog, isItem, source, sourceId]);

  const reset = useCallback((refs: RecommendationRef[]) => setValue(refs), []);

  return {
    value,
    setValue,
    reset,
    catalog: options,
    inherited,
    scope: (isItem ? "item" : "category") as "item" | "category",
  };
}
