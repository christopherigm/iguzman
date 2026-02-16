/**
 * Safely checks whether `localStorage` is available in the current environment.
 *
 * Returns `false` in SSR or restricted contexts (e.g. incognito with storage
 * disabled) without throwing.
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

/**
 * Reads a value from `localStorage` by {@link key}.
 *
 * Returns `null` when:
 * - `localStorage` is unavailable (SSR, restricted context)
 * - The key does not exist
 * - The stored value is the literal string `"undefined"`
 *
 * @param key - The storage key to look up
 * @returns The stored string, or `null` if missing / invalid
 */
export const getLocalStorageItem = (key: string): string | null => {
  if (!isLocalStorageAvailable()) return null;

  try {
    const data = localStorage.getItem(key);
    if (data === null || data === 'undefined') return null;
    return data;
  } catch {
    return null;
  }
};

/**
 * Writes a value to `localStorage` under the given {@link key}.
 *
 * Silently catches quota-exceeded or security errors so callers don't need
 * their own `try/catch`.
 *
 * @param key   - The storage key
 * @param value - The string value to persist
 * @returns `true` if the write succeeded, `false` otherwise
 */
export const setLocalStorageItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
