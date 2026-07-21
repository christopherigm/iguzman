import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";

/**
 * Warm "home-made" intro for Pan que hace bien. Composition only: the shared
 * `AboutIntro` block owns the layout, accent rule, copy trim and responsive
 * photo; this wrapper resolves the tenant + copy and supplies the baker's CTAs.
 *
 * CTAs are plain core `Button`/`LinkButton` primitives - the primary action
 * picks up the tenant's brand color automatically via `--accent`.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("PanOrganicoSite"),
  ]);

  const about =
    (locale === "en" ? system?.en_about : system?.about) ??
    system?.about ??
    system?.en_about ??
    "";

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  const hasProducts = (system?.product_count ?? 0) > 0;

  return (
    <AboutIntro
      eyebrow={t("intro.eyebrow")}
      title={system?.site_name ?? "Pan que hace bien"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      {hasProducts && (
        <Button
          text={t("intro.viewBreads")}
          href="/products"
          kind="primary"
          size="lg"
        />
      )}
      <LinkButton label={t("intro.learnMore")} href="/about" />
    </AboutIntro>
  );
}
