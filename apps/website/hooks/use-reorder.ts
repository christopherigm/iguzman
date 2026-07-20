"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";

type Items = Record<string, unknown>[];

/**
 * Handler for `AdminEntityList`'s sort mode: persists a drag-reordered list by
 * PATCHing each row's `sort_order` to its new index.
 *
 * Only the rows that actually moved are written - a drag near the end of a long
 * list leaves the rows above it untouched, so the common case is a couple of
 * small requests rather than one per row. They are fired in parallel and the
 * list state is only updated once every write lands, so a failure leaves the
 * table showing the order the API still holds.
 */
export function useReorder(
  update: (pk: number, data: Record<string, unknown>) => Promise<unknown>,
  setItems: Dispatch<SetStateAction<Items>>,
  setError: (message: string) => void,
) {
  const t = useTranslations("Admin");

  return useCallback(
    async (ordered: Items) => {
      // A row whose `sort_order` already equals its new index needs no write.
      const moved = ordered.filter(
        (row, index) => Number(row.sort_order ?? 0) !== index,
      );
      if (moved.length === 0) return;

      try {
        await Promise.all(
          moved.map((row) =>
            update(row.id as number, {
              sort_order: ordered.indexOf(row),
            }),
          ),
        );
        setItems(ordered.map((row, index) => ({ ...row, sort_order: index })));
      } catch (err) {
        setError(t("errorSave"));
        throw err;
      }
    },
    [update, setItems, setError, t],
  );
}
