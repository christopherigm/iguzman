/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options for saving a cookie. */
export interface SaveCookieOptions {
  /** Cookie name. */
  key: string;
  /** Value to store — will be JSON-stringified. */
  value: string;
  /** Number of days until the cookie expires (default: 30). */
  expirationDays?: number;
  /**
   * Paths where the cookie should be accessible.
   * Defaults to `["/"]` when omitted or empty.
   */
  paths?: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds a single `Set-Cookie`-style string and assigns it to
 * `document.cookie`.
 */
const buildCookieString = (
  key: string,
  value: string,
  expires: string,
  path: string,
): string =>
  `${key}=${encodeURIComponent(value)};expires=${expires};path=${path}`;

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Persists a value as a cookie.
 *
 * The value is JSON-stringified before being stored so that it can be
 * safely round-tripped through {@link getCookieValue}.
 */
export const saveCookie = ({
  key,
  value,
  expirationDays = 30,
  paths = ['/'],
}: SaveCookieOptions): void => {
  const date = new Date();
  date.setTime(date.getTime() + expirationDays * 24 * 60 * 60 * 1000);
  const expires = date.toUTCString();
  const encoded = JSON.stringify(value);

  const targetPaths = paths.length > 0 ? paths : ['/'];

  targetPaths.forEach((path) => {
    document.cookie = buildCookieString(key, encoded, expires, path);
  });
};

/**
 * Reads a cookie value previously stored with {@link saveCookie}.
 *
 * Returns `null` when the cookie does not exist, allowing callers to
 * distinguish between "missing" and "empty string".
 *
 * Boolean strings (`"true"` / `"false"`) are returned as native booleans
 * for backwards compatibility.
 */
export const getCookieValue = (name: string): string | boolean | null => {
  const prefix = `${name}=`;
  const decodedCookie = decodeURIComponent(document.cookie);
  const entries = decodedCookie.split(';');

  for (const entry of entries) {
    const trimmed = entry.trimStart();

    if (trimmed.startsWith(prefix)) {
      const raw = decodeURIComponent(trimmed.substring(prefix.length));

      /** Unwrap the JSON-stringified wrapper added by {@link saveCookie}. */
      let parsed: string;
      try {
        parsed = JSON.parse(raw) as string;
      } catch {
        parsed = raw;
      }

      if (parsed === 'true') return true;
      if (parsed === 'false') return false;
      return parsed;
    }
  }

  return null;
};

/**
 * Deletes a cookie by setting its expiration date in the past.
 *
 * @param key   - Cookie name to delete.
 * @param paths - Paths the cookie was created on. Defaults to `["/"]`.
 *                A cookie can only be deleted from the same path it was set on.
 */
export const deleteCookie = (key: string, paths: string[] = ['/']): void => {
  const pastDate = new Date(0).toUTCString();

  paths.forEach((path) => {
    document.cookie = `${key}=;expires=${pastDate};path=${path}`;
  });
};

export default saveCookie;
