'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';

type Items = Record<string, unknown>[];

/**
 * Handler for `AdminEntityList`'s inline Enabled toggle: PATCHes the record's
 * `enabled` field and mirrors the new value into the list state.
 *
 * Rethrows on failure - `AdminEntityList` relies on the rejection to roll the
 * Switch back to its previous position, so the UI never claims a write the API
 * refused.
 */
export function useToggleEnabled(
  update: (pk: number, data: Record<string, unknown>) => Promise<unknown>,
  setItems: Dispatch<SetStateAction<Items>>,
  setError: (message: string) => void,
) {
  const t = useTranslations('Admin');

  return useCallback(
    async (id: number, enabled: boolean) => {
      try {
        await update(id, { enabled });
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, enabled } : item)));
      } catch (err) {
        setError(t('errorSave'));
        throw err;
      }
    },
    [update, setItems, setError, t],
  );
}
