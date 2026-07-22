import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";

/**
 * Warm street-food intro for Super Tortas El Chino. Composition only: the shared
 * `AboutIntro` block owns the layout, accent rule, copy trim and responsive
 * photo; this wrapper resolves the tenant + copy and supplies the shop's CTA.
 *
 * The CTA is a plain core `Button` - the primary action picks up the tenant's
 * brand color automatically via `--accent`. The hero above already carries the
 * "Ver el menú" call, so this section's job is the story and its CTA is the one
 * that continues it (to the /contact page), not a repeat of the menu link.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("SuperTortasSite"),
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
      title={system?.site_name ?? "Super Tortas El Chino"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button
        text={t("intro.contact")}
        href="/contact"
        kind="primary"
        size="lg"
      />
    </AboutIntro>
  );
}
