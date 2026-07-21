import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * "The origin" section for Café de Altura - the family-farm story that is the
 * whole reason a visitor buys from the producer instead of a middleman.
 *
 * Composition only: the shared `AboutIntro` block owns the layout, the accent
 * rule, the copy trim and the responsive photo; this wrapper resolves the
 * tenant + copy and supplies the site's own CTAs.
 */
export async function Origin() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("CafeAlturaSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  return (
    <AboutIntro
      eyebrow={t("origin.eyebrow")}
      title={system?.site_name ?? "Café de Altura"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      {/* No "view our coffees" button here: the hero above already carries that
          CTA, and repeating it two blocks later reads as filler. This section's
          job is the story, so its CTA is the one that continues it. */}
      <Button
        text={t("origin.learnMore")}
        href="/about"
        kind="primary"
        size="lg"
      />
    </AboutIntro>
  );
}
