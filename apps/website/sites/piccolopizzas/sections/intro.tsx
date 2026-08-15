import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";

/**
 * The "desde 1985" story for Piccolo Pizzas. Composition only: the shared
 * `AboutIntro` block owns the two-column split, the accent rule, the copy trim
 * and the responsive photo; this wrapper resolves the tenant + copy and supplies
 * the pizzeria's CTA.
 *
 * It sits *after* the featured pizzas rather than before them (see landing.tsx):
 * forty years in the same neighbourhood is the reassurance that closes a
 * decision, not the thing a hungry visitor came for.
 *
 * The CTA is a plain core `Button` - a primary action picks up the tenant's
 * brand colour automatically via `--accent`, so no colour is passed. The hero
 * above already carries "Ver el menú", so this one continues the story instead
 * of repeating that link: it goes to the shared `/contact` page, which is where
 * both branches' phones, WhatsApp numbers and maps already live.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("PiccoloSite"),
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
      title={system?.site_name ?? "Piccolo Pizzas"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button
        text={t("intro.order")}
        href="/contact"
        kind="primary"
        size="lg"
      />
    </AboutIntro>
  );
}
