/**
 * Phone number formatter that applies specific formatting based on country 
phone code
 * @param phone - The phone number string to format
 * @param countryPhoneCode - The country phone code (default: 1 for US/Canada)
 * @returns Formatted phone number string or original if invalid
 */
export const formatPhoneNumber = (
  phone: string,
  countryPhoneCode: number = 1,
): string => {
  // Return original phone if it's too short or invalid
  if (!phone || phone.length < 10) return phone || '';

  // Define phone number formats by country code
  const phoneFormats: Record<number, number[]> = {
    1: [3, 3, 4], // US/Canada format: (XXX) XXX-XXXX
    52: [2, 4, 4], // Mexico format: XX XXXX XXXX
  };

  // Get the appropriate format or default to US format
  const format = phoneFormats[countryPhoneCode] || phoneFormats[1];

  // Validate format exists
  if (!format || !Array.isArray(format)) return phone;

  // Convert phone to array for easier manipulation
  const phoneArray = phone.split('');
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
 */
export const formatPhoneNumberWithCountryCode = (
  phone: string,
  countryPhoneCode: number = 1,
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
