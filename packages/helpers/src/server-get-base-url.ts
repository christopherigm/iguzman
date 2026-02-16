'use server';

import getHostFromServer from '@iguzman/helpers/server-get-host';

/** Environment variable for Node.js environment */
const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'development';

/** Protocol constant for production environment */
const PRODUCTION_PROTOCOL = 'https';

/** Protocol constant for non-production environments */
const NON_PRODUCTION_PROTOCOL = 'http';

/**
 * Retrieves the base URL for the server based on the environment.
 *
 * @returns A promise that resolves to the base URL string.
 * @throws If the host cannot be determined or if there's an error during URL construction.
 *
 * @example
 * ```ts
 * const baseUrl = await getBaseURL();
 * console.log(baseUrl); // "https://example.com" in production
 * ```
 */
const getBaseURL = async (): Promise<string> => {
  const protocol =
    NODE_ENV === 'production' ? PRODUCTION_PROTOCOL : NON_PRODUCTION_PROTOCOL;

  const host = await getHostFromServer();

  if (!host) {
    throw new Error('Unable to determine host for base URL');
  }

  return `${protocol}://${host}`;
};

export default getBaseURL;
