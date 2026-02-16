import type { ApiError } from '@iguzman/helpers/types';

/** Fallback error returned when no valid error is found in the array. */
const EMPTY_ERROR: ApiError = {
  code: '',
  message: '',
  status: 0,
};

/**
 * Extracts the entity name from a JSON pointer string.
 *
 * Takes a JSON pointer (e.g. `"/data/attributes/email"`) and returns the
 * last segment (`"email"`). Returns an empty string when the pointer is empty.
 */
const parseEntityFromPointer = (pointer: string): string => {
  if (!pointer) return '';
  const segments = pointer.split('/');
  return segments[segments.length - 1] ?? '';
};

/**
 * Extracts and normalises the first meaningful error from an API error array.
 *
 * Locates the first non-nullish entry in {@link errors}, then builds a
 * normalised {@link ApiError} with a human-readable `message` that includes the
 * originating field name (parsed from the JSON pointer) when available.
 *
 * Returns a blank {@link ApiError} (code `""`, status `0`) when the array is
 * empty or contains only nullish values.
 *
 * @param errors - Array of raw API errors
 * @returns The first error, normalised with a composed `message`
 *
 * @example
 * ```ts
 * const errors: ApiError[] = [
 *   { code: 'invalid', status: 400, message: '', detail: 'is required', source: { pointer: '/data/attributes/email' } },
 * ];
 * getFirstApiError(errors);
 * // → { code: 'invalid', status: 400, message: 'is required [email]', detail: 'is required' }
 * ```
 */
const getFirstApiError = (errors: ApiError[]): ApiError => {
  const first = errors.find(Boolean);
  if (!first) return { ...EMPTY_ERROR };

  const entity = parseEntityFromPointer(first.source?.pointer ?? '');
  const detail = first.detail ?? '';
  const message = detail ? `${detail}${entity ? ` [${entity}]` : ''}` : '';

  return {
    code: first.code ?? '',
    status: Number(first.status ?? 0),
    message,
    ...(detail && { detail }),
  };
};

export default getFirstApiError;
