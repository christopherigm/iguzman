import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";

/**
 * The coastal-kitchen story for Santo Fish. Composition only: the shared
 * `AboutIntro` block owns the layout, accent rule, copy trim and responsive
 * photo; this wrapper resolves the tenant + copy and supplies the two CTAs.
 *
 * The hero above already carries "see the menu", so this section's CTAs continue
 * the story instead of repeating it: the primary goes to the site's own /about
 * page (the long version of this copy), the low-emphasis one to the shared
 * /contact page (address, map, hours, form) - both core elements, so the primary
 * picks up the tenant's brand color from `--accent` with no color prop.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("SantoFishSite"),
  ]);

  const about =
    (locale === "en" ? system?.en_about : system?.about) ??
    system?.about ??
    system?.en_about ??
    "";

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  return (
    <AboutIntro
      eyebrow={t("intro.eyebrow")}
      title={system?.site_name ?? "Santo Fish"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button text={t("intro.story")} href="/about" kind="primary" size="lg" />
      <LinkButton label={t("intro.visit")} href="/contact" />
    </AboutIntro>
  );
}
