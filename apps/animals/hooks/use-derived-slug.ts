'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { buildSlug } from '@/lib/slug-utils';

type Values = Record<string, unknown>;

/**
 * Keeps a new record's read-only `slug` field in step with its name.
 *
 * **Called during render, not from an effect** - the guard is what stops it
 * looping, and deriving it here means the slug is already right in the same
 * paint as the character that was just typed rather than one frame later. This
 * repo's react-hooks rules reject the `useEffect` + `setState` shape anyway.
 *
 * Only for new records: a slug is a published URL and the seed command matches
 * on it, so renaming an existing record must not silently move its page.
 */
export function useDerivedSlug(
  isNew: boolean,
  values: Values,
  setValues: Dispatch<SetStateAction<Values>>,
): void {
  if (!isNew) return;
  const derived = buildSlug(String(values.name ?? ''));
  if (values.slug !== derived) {
    setValues((prev) => ({ ...prev, slug: derived }));
  }
}
