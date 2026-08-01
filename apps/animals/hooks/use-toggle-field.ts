'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';

type Items = Record<string, unknown>[];

/**
 * Handler for `AdminEntityList`'s inline flag toggles: PATCHes one boolean field
 * of a record - `enabled`, `is_featured` - and mirrors the new value into the
 * list state.
 *
 * Rethrows on failure - `AdminEntityList` relies on the rejection to roll the
 * Switch back to its previous position, so the UI never claims a write the API
 * refused.
 */
export function useToggleField(
  update: (pk: number, data: Record<string, unknown>) => Promise<unknown>,
  setItems: Dispatch<SetStateAction<Items>>,
  setError: (message: string) => void,
) {
  const t = useTranslations('Admin');

  return useCallback(
    async (id: number, field: string, value: boolean) => {
      try {
        await update(id, { [field]: value });
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
        );
      } catch (err) {
        setError(t('errorSave'));
        throw err;
      }
    },
    [update, setItems, setError, t],
  );
}
