/**
 * The IANA timezone list the CMS offers, for any field that stores one.
 *
 * Read from the browser's own tz database via `Intl.supportedValuesOf`, not
 * from a hand-maintained array: the list is not ours to freeze - countries add,
 * rename and merge zones - and a stale enum would refuse a legitimate value with
 * no way for a tenant to fix it. The API validates against Python's `zoneinfo`
 * for the same reason.
 *
 * `Intl.supportedValuesOf` is Chrome 99+/Safari 15.4+/Firefox 93+ and is absent
 * from the server render, so `FALLBACK_TIMEZONES` covers both: a short list of
 * the zones the sites in this repo actually serve, which keeps the field usable
 * rather than empty in the seconds before hydration.
 */

export const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Mexico_City",
  "America/Cancun",
  "America/Tijuana",
  "America/Monterrey",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Lisbon",
  "Europe/Rome",
];

/**
 * Every zone this runtime knows, as `{value, label}` for `TextInput options`
 * (the searchable select - the full list is ~600 entries, far past what a
 * `Select` should hold).
 */
export function timezoneOptions(): { value: string; label: string }[] {
  const supported =
    typeof Intl !== "undefined" &&
    typeof (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf === "function"
      ? (
          Intl as unknown as { supportedValuesOf: (key: string) => string[] }
        ).supportedValuesOf("timeZone")
      : [];

  // `supportedValuesOf('timeZone')` omits UTC itself in several engines, and it
  // is the API's default - so it must always be selectable.
  const names =
    supported.length > 0 ? ["UTC", ...supported] : FALLBACK_TIMEZONES;
  return Array.from(new Set(names)).map((name) => ({
    value: name,
    // The raw IANA name is the label on purpose: it is what the operator will
    // see in the API, in a backup and in any support conversation, and
    // "Mexico City (GMT-6)" would go stale twice a year.
    label: name,
  }));
}
