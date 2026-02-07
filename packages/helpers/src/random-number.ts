/**
 * Generates a random integer between {@link min} (inclusive) and {@link max} (inclusive).
 *
 * @param min - The lower bound of the range (inclusive)
 * @param max - The upper bound of the range (inclusive)
 * @returns A random integer in the range [min, max]
 */
const getRandomNumber = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Appends or replaces a cache-busting query parameter (`vdRID`) on a URL.
 *
 * If the URL already contains a `vdRID` parameter, it is replaced with a
 * new random value. Otherwise, the parameter is appended.
 *
 * @param url - The URL to modify
 * @returns The URL with a fresh `vdRID` query parameter
 */
export const addRandomNumberToURL = (url: string): string => {
  const randomId = getRandomNumber(1, 9999);
  const [base, ...searchParts] = url.split('?');
  const params = new URLSearchParams(searchParts.join('?'));

  params.set('vdRID', String(randomId));

  return `${base}?${params.toString()}`;
};

export default getRandomNumber;
