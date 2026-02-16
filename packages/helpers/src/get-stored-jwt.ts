import { getLocalStorageItem } from '@iguzman/helpers/local-storage';
import type { JwtPayload } from '@iguzman/helpers/types';

/** The `localStorage` key where the JWT payload is persisted. */
const JWT_STORAGE_KEY = 'jwt';

/**
 * Retrieves and parses the JWT payload stored in `localStorage`.
 *
 * Returns `null` when:
 * - `localStorage` is unavailable (SSR, restricted context)
 * - No value is stored under the `"jwt"` key
 * - The stored value is not valid JSON
 * - The parsed object does not contain an `access` token
 *
 * @returns The parsed {@link JwtPayload}, or `null` if unavailable / invalid
 */
const getStoredJwt = (): JwtPayload | null => {
  const raw = getLocalStorageItem(JWT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'access' in parsed &&
      typeof (parsed as JwtPayload).access === 'string' &&
      (parsed as JwtPayload).access !== ''
    ) {
      return parsed as JwtPayload;
    }

    return null;
  } catch {
    return null;
  }
};

export default getStoredJwt;
