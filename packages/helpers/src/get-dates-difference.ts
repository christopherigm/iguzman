/** Result returned by {@link getDatesDifference}. */
interface DatesDifference {
  /** Human-readable summary (e.g. `"2 yrs, 3 mos"`). */
  text: string;
  /** Number of full years in the difference. */
  years: number;
  /** Remaining full months after subtracting full years (0–11). */
  months: number;
}

/**
 * Computes the calendar difference between two dates in years and months.
 *
 * Uses calendar arithmetic (year / month / day fields) rather than raw
 * millisecond subtraction, so it correctly handles months of varying length.
 *
 * Assumes {@link final} is on or after {@link initial}.
 *
 * @param initial - The start date as an ISO 8601 string (e.g. `"2020-01-15"`).
 * @param final   - The end date as an ISO 8601 string (e.g. `"2023-06-20"`).
 * @returns The difference broken down into years, months, and a formatted text string.
 */
const getDatesDifference = (
  initial: string,
  final: string,
): DatesDifference => {
  const start = new Date(initial);
  const end = new Date(final);

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();

  /** If the end day hasn't reached the start day, one full month hasn't elapsed. */
  if (end.getUTCDate() < start.getUTCDate()) {
    months--;
  }

  /** Normalize negative months into the previous year. */
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);

  return {
    text: parts.join(', ') || '0 mos',
    years,
    months,
  };
};

export default getDatesDifference;
