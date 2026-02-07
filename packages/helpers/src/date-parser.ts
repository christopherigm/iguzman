/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Full English month names, indexed 0–11. */
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Full Spanish month names, indexed 0–11. */
export const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Abbreviated English month names, indexed 0–11. */
export const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Abbreviated Spanish month names, indexed 0–11. */
export const SPANISH_SHORT_MONTHS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A value that can be coerced to a `Date` (string, timestamp, or Date). */
type DateLike = string | number | Date;

/** Shape of a single JSON:API error object used by {@link arrayErrorsToHtmlList}. */
interface JsonApiError {
  detail: string;
  code?: string;
  source?: {
    pointer: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Zero-pads a number to at least two digits. */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Safely converts a {@link DateLike} value into a `Date` instance.
 * If the value is already a `Date` it is returned as-is.
 */
const toDate = (value: DateLike): Date =>
  value instanceof Date ? value : new Date(value);

/* ------------------------------------------------------------------ */
/*  Date formatters                                                   */
/* ------------------------------------------------------------------ */

/**
 * Formats a date as `"Month Day, Year"` (e.g. `"January 5, 2024"`).
 *
 * @param date        - Value to format.
 * @param shortMonths - When `true`, uses abbreviated month names.
 */
export const dateParser = (
  date: DateLike,
  shortMonths: boolean = false,
): string => {
  const d = toDate(date);
  const month = shortMonths ? SHORT_MONTHS[d.getMonth()] : MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  return `${month} ${day}, ${year}`;
};

/**
 * Formats a date as a short numeric string: `"M/D"` or `"M/D/YYYY"`.
 *
 * @param date     - Value to format.
 * @param withYear - When `true`, appends the full year.
 */
export const shortDateParser = (
  date: DateLike,
  withYear: boolean = false,
): string => {
  const d = toDate(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();

  return withYear
    ? `${month}/${day}/${d.getFullYear()}`
    : `${month}/${day}`;
};

/**
 * Formats a date as an ISO date string suitable for `<input type="date">`
 * elements (`YYYY-MM-DD`).
 *
 * Returns an empty string when `date` is falsy.
 */
export const dateFormatForInput = (date: DateLike): string => {
  if (!date) return '';

  const d = toDate(date);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());

  return `${year}-${month}-${day}`;
};

/* ------------------------------------------------------------------ */
/*  Time formatters                                                   */
/* ------------------------------------------------------------------ */

/**
 * Extracts the time portion of a date as `"HH:MM:SS"` (24-hour format).
 */
export const hourParser = (date: DateLike): string => {
  const d = toDate(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * Extracts the time portion of a date as `"hh:mm am/pm"` (12-hour format).
 */
export const hourParser12Format = (date: DateLike): string => {
  const d = toDate(date);
  const hours = d.getHours();
  const period = hours >= 12 ? 'pm' : 'am';

  /** Convert 0 → 12 (midnight) and 13–23 → 1–11 (afternoon/evening). */
  const h12 = hours % 12 || 12;

  return `${pad(h12)}:${pad(d.getMinutes())} ${period}`;
};

/* ------------------------------------------------------------------ */
/*  Compound formatters                                               */
/* ------------------------------------------------------------------ */

/**
 * Formats a date as a Django-compatible datetime string
 * (`YYYY-MM-DDTHH:MM:SS`).
 *
 * Returns an empty string when `date` is falsy.
 */
export const djangoDateTimeField = (date: DateLike): string => {
  if (!date) return '';
  return `${dateFormatForInput(date)}T${hourParser(date)}`;
};

/* ------------------------------------------------------------------ */
/*  Date arithmetic                                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns the absolute difference between two dates in whole seconds.
 *
 * Returns `null` if either argument is falsy.
 */
export const getDifferenceInSeconds = (
  d1: Date | null,
  d2: Date | null,
): number | null => {
  if (!d1 || !d2) return null;

  return Math.round(Math.abs(d1.getTime() - d2.getTime()) / 1000);
};

/**
 * Computes the calendar difference between two dates expressed as
 * `{ years, months }`.
 *
 * The result is always positive (absolute difference).
 */
const getDateDifference = (
  from: Date,
  to: Date,
): { years: number; months: number } => {
  const [start, end] = from <= to ? [from, to] : [to, from];

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months };
};

/**
 * Builds a human-readable date range string such as:
 *
 * ```
 * "Jan 1, 2020 to Dec 31, 2023 (3.9 years)"
 * ```
 *
 * When `endDate` is `null` the label `"Present"` is used.
 *
 * @param startDate  - Range start (defaults to now when `null`).
 * @param endDate    - Range end (`null` means "Present").
 * @param shortMonth - Use abbreviated month names.
 */
export const dateRangeComposer = (
  startDate: Date | null,
  endDate: Date | null,
  shortMonth: boolean = false,
): string => {
  const startLabel = startDate
    ? dateParser(startDate, shortMonth)
    : '';
  const endLabel = endDate
    ? dateParser(endDate, shortMonth)
    : 'Present';

  const from = startDate ?? new Date();
  const to = endDate ?? new Date();
  const { years, months } = getDateDifference(from, to);

  const fractional = months > 0 ? `.${months}` : '';

  return `${startLabel} to ${endLabel} (${years}${fractional} years)`;
};

/* ------------------------------------------------------------------ */
/*  Error formatting                                                  */
/* ------------------------------------------------------------------ */

/**
 * Converts an array of JSON:API error objects into an HTML `<li>` list.
 *
 * **Note:** The returned HTML is intended for trusted server-side error
 * objects. Do not pass unsanitised user input as `detail` values.
 */
export const arrayErrorsToHtmlList = (errors: JsonApiError[]): string =>
  errors
    .map((error) => {
      if (!error.source) {
        if (error.detail === 'Wrong credentials') {
          return '<li>El correo o la contrasena son incorrectos (Wrong credentials).</li>';
        }
        return `<li>${error.detail}</li>`;
      }

      const segments = error.source.pointer.split('/');
      const field = segments[segments.length - 1];

      if (error.code === 'unique' && field === 'email') {
        return '<li>Hay una cuenta registrada con este correo electronico.</li>';
      }

      if (error.code === 'blank') return '';

      return `<li>${error.detail}: ${field}</li>`;
    })
    .filter(Boolean)
    .join('');
