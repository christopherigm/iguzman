import getEnvVariables from '@repo/helpers/get-env-variables';

/** Default API base URL used in non-production environments. */
const DEV_API_URL = 'http://127.0.0.1:8000';

/**
 * Resolves the base URL for backend API requests based on the current environment.
 *
 * - In **non-production** (`NODE_ENV !== "production"`): returns {@link DEV_API_URL}.
 * - In **production**: reads the `URLBase` environment variable via
 *   {@link getEnvVariables} and falls back to an empty string when unset.
 *
 * @returns The absolute base URL to prefix API requests with
 *
 * @example
 * ```ts
 * // development
 * getApiBaseUrl(); // → "http://127.0.0.1:8000"
 *
 * // production (URLBase = "https://api.example.com")
 * getApiBaseUrl(); // → "https://api.example.com"
 * ```
 */
const getApiBaseUrl = (): string => {
  if (process.env.NODE_ENV !== 'production') return DEV_API_URL;

  const { URLBase } = getEnvVariables();
  return URLBase ?? '';
};

export default getApiBaseUrl;
