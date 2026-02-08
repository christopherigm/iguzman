/**
 * Phone number formatting utilities
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Default country code for US/Canada */
const DEFAULT_COUNTRY_CODE = 1;

/** Phone number formats by country code */
const PHONE_FORMATS: Record<number, number[]> = {
  1: [3, 3, 4], // US/Canada format: (XXX) XXX-XXXX
  52: [2, 4, 4], // Mexico format: XX XXXX XXXX
};

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Phone number formatting options */
export interface PhoneNumberFormatOptions {
  /** Country phone code (default: 1 for US/Canada) */
  countryPhoneCode?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Validates if a phone number string is valid
 * @param phone - The phone number to validate
 * @returns True if phone number is valid, false otherwise
 */
const isValidPhoneNumber = (phone: string): boolean => {
  if (!phone) return false;
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length >= 10;
};

/**
 * Formats a phone number according to the specified country code
 * @param phone - The phone number string to format
 * @param countryPhoneCode - The country phone code (default: 1 for US/Canada)
 * @returns Formatted phone number string or original if invalid
 * @example
 * ```ts
 * formatPhoneNumber('1234567890'); // "(123) 456-7890"
 * formatPhoneNumber('1234567890', 52); // "12 3456 7890"
 * ```
 */
export const formatPhoneNumber = (
  phone: string,
  countryPhoneCode: number = DEFAULT_COUNTRY_CODE,
): string => {
  // Return original phone if it's invalid
  if (!isValidPhoneNumber(phone)) return phone || '';

  // Get the appropriate format or default to US format
  const format =
    PHONE_FORMATS[countryPhoneCode] || PHONE_FORMATS[DEFAULT_COUNTRY_CODE];

  // Validate format exists
  if (!format || !Array.isArray(format)) return phone;

  // Convert phone to array for easier manipulation
  const phoneArray = phone.replace(/\D/g, '').split('');
  let formattedPhone = '';
  let currentIndex = 0;

  // Apply the format pattern
  for (const segmentLength of format) {
    // Validate segment length
    if (typeof segmentLength !== 'number' || segmentLength <= 0) {
      continue;
    }

    // Add segment to formatted phone
    for (let i = 0; i < segmentLength; i++) {
      if (currentIndex + i < phoneArray.length) {
        formattedPhone += phoneArray[currentIndex + i];
      }
    }

    // Add space separator (except after the last segment)
    if (segmentLength > 0 && currentIndex + segmentLength < phoneArray.length) {
      formattedPhone += ' ';
    }

    currentIndex += segmentLength;
  }

  return formattedPhone;
};

/**
 * Formats a phone number with country code prefix
 * @param phone - The phone number string to format
 * @param countryPhoneCode - The country phone code (default: 1 for US/Canada)
 * @returns Formatted phone number string with country code prefix
 * @example
 * ```ts
 * formatPhoneNumberWithCountryCode('1234567890'); // "+1 (123) 456-7890"
 * formatPhoneNumberWithCountryCode('1234567890', 52); // "+52 12 3456 7890"
 * ```
 */
export const formatPhoneNumberWithCountryCode = (
  phone: string,
  countryPhoneCode: number = DEFAULT_COUNTRY_CODE,
): string => {
  // Handle invalid inputs
  if (!phone) return '';

  const formattedPhone = formatPhoneNumber(phone, countryPhoneCode);

  // Add country code prefix if not already present
  if (phone.startsWith(`${countryPhoneCode}`)) {
    return formattedPhone;
  }

  return `+${countryPhoneCode} ${formattedPhone}`;
};

export default formatPhoneNumberWithCountryCode;
