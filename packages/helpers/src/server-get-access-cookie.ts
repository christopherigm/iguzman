'use server';

import { cookies } from 'next/headers';
import { AccessStorageKeys } from '@repo/helpers/constants';

/**
 * Retrieves the access cookie value from the cookie store.
 *
 * @example
 * ```typescript
 * const accessCookie = await getAccessCookie();
 * if (accessCookie) {
 *   console.log('Access cookie found:', accessCookie);
 * } else {
 *   console.log('No access cookie found');
 * }
 * ```
 *
 * @returns A promise that resolves to the access cookie value or null if not found
 */
export const getAccessCookie = async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    const accessCookie = cookieStore.get(AccessStorageKeys.ACCESS)?.value;

    // Return null if accessCookie is undefined or empty
    if (!accessCookie) {
      return null;
    }

    // Remove surrounding quotes if present
    const cleanedCookie = accessCookie.replaceAll('"', '');

    // Return cleaned cookie value
    return cleanedCookie || null;
  } catch (error) {
    // Log error but return null to maintain consistent API
    console.error('Error retrieving access cookie:', error);
    return null;
  }
};
