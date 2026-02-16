'use server';

import { headers, cookies } from 'next/headers';
import type { Language } from '@repo/helpers/types';
import { AccessStorageKeys } from '@repo/helpers/constants';

/**
 * Detects the browser language on the server side
 * @returns The detected language ('en' or 'es')
 * @example
 * ```ts
 * const language = await getBrowserLanguage();
 * // Returns 'en' or 'es'
 * ```
 */
const getBrowserLanguage = async (): Promise<Language> => {
  try {
    const headerList = await headers();
    const acceptLanguage = headerList.get('accept-language');

    // Default to English
    let language: Language = 'en';

    // Check for Spanish language in accept-language header
    if (acceptLanguage?.includes('es-MX')) {
      language = 'es';
    } else if (acceptLanguage?.includes('es')) {
      language = 'es';
    }

    // Check for language cookie
    const cookieStore = await cookies();
    const languageCookie = cookieStore.get(AccessStorageKeys.LANGUAGE)?.value;

    // If cookie exists and is valid, override the detected language
    if (languageCookie) {
      const cookieValue = languageCookie.replaceAll('"', '').trim();
      if (cookieValue === 'es' || cookieValue === 'en') {
        language = cookieValue as Language;
      }
    }

    return language;
  } catch (error) {
    // If any error occurs during detection, default to English
    console.warn(
      'Error detecting browser language, defaulting to English',
      error,
    );
    return 'en';
  }
};

export default getBrowserLanguage;
