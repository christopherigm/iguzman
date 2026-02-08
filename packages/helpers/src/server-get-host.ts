import { headers } from 'next/headers';

/**
 * Retrieves the host name from server-side headers
 * @returns The host name from x-forwarded-host header or empty string if not 
found
 * @example
 * ```typescript
 * const host = await getHostFromServer();
 * console.log(host); // "example.com"
 * ```
 */
const getHostFromServer = async (): Promise<string> => {
  try {
    const headerList = await headers();
    const host = headerList.get('x-forwarded-host');

    // Return the host if it exists, otherwise return empty string
    return host ?? '';
  } catch (error) {
    // In case of any error during header retrieval, return empty string
    console.warn('Failed to retrieve host from headers:', error);
    return '';
  }
};

export default getHostFromServer;
