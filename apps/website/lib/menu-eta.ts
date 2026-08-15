/**
 * The "ready in ..." badge a menu item wears, from `MenuItem.eta_minutes`.
 *
 * Pure and client-safe, because both consumers cannot be the same kind of
 * component: the detail page's header is a server component and the cart line is
 * a client one. It takes the translation function rather than the formatted
 * string so the minutes/hours split is decided once - a dish quoted "90 min" on
 * one surface and "1 h 30 min" on the other would read as two different waits.
 *
 * The unit is always minutes in the CMS; the split into hours happens here.
 */

/** The Menu-namespace keys this helper picks between. */
type EtaKey = "etaMinutes" | "etaHours" | "etaHoursMinutes";

/**
 * Deliberately narrower than next-intl's own `t`: a server component's
 * `getTranslations("Menu")` and a client component's `useTranslations("Menu")`
 * both satisfy it, so one helper serves both.
 */
type EtaTranslate = (key: EtaKey, values?: Record<string, number>) => string;

/**
 * The badge label for `minutes`, or `null` when there is nothing to say - an
 * unset ETA and a zero one alike, since "ready in 0 min" is a claim no kitchen
 * makes.
 */
export function menuEtaLabel(
  t: EtaTranslate,
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || minutes <= 0) return null;

  if (minutes < 60) return t("etaMinutes", { minutes });

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? t("etaHours", { hours })
    : t("etaHoursMinutes", { hours, minutes: rest });
}
