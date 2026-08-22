import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * The neighbourhood-café intro for JavaStop. Composition only: the shared
 * `AboutIntro` block owns the layout, accent rule, copy trim and responsive
 * photo; this wrapper resolves the tenant + copy and supplies the CTAs.
 *
 * The hero above already carries the "see the menu" call, so this section's job
 * is the room rather than the drink, and its CTAs continue that: the long
 * version of the story (`/about`), the wall the café gives to a local artist
 * every month (`/artists`), and the way to the address and hours (the shared
 * `/contact` page - never a contact section of our own).
 *
 * `/artists` is a low-emphasis `LinkButton` on purpose. It is the third door in
 * a row that already has a filled primary, and the footer links `/about` for
 * free while nothing in the platform chrome links `/artists` - so this is the
 * page's discoverability, not a call to action competing with the menu.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("JavaStopSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  return (
    <AboutIntro
      eyebrow={t("intro.eyebrow")}
      title={system?.site_name ?? "JavaStop Cafe"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button text={t("intro.story")} href="/about" kind="primary" size="lg" />
      <Button text={t("intro.visit")} href="/contact" size="lg" />
      <LinkButton label={t("intro.artists")} href="/artists" />
    </AboutIntro>
  );
}
