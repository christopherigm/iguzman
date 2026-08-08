import { getTranslations } from "next-intl/server";
import { FindUs } from "@/components/find-us";

/**
 * "Punto de zarpe" - where the boats leave from.
 *
 * The shared `FindUs` block wearing this site's own voice: for a tour operator the
 * location is not "come visit us", it is the dock the trip leaves from, which is
 * the single most-asked question on the page. So the copy is the site's
 * (`TamaraToursSite.departure.*`) while the locations themselves are the shared
 * component - the same cards, maps and directions links `/contact` renders.
 *
 * It used to draw its own list of name + address rows on a `--surface-2` panel,
 * which said less than the contact page did about the same docks and carried no
 * map at all. See `@/components/find-us` for why that is one component now.
 */
export async function Departure() {
  const t = await getTranslations("TamaraToursSite");

  return (
    <FindUs
      eyebrow={t("departure.eyebrow")}
      heading={t("departure.heading")}
      subtitle={t("departure.subtitle")}
      ctaText={t("departure.contactCta")}
    />
  );
}
