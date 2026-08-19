import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";

/**
 * Who Rosalinda is. Composition only: the shared `AboutIntro` block owns the
 * two-column split, the accent rule, the copy trim and the responsive photo;
 * this wrapper resolves the tenant + copy and supplies the section's one CTA.
 *
 * It sits between the plates and `Firma` on purpose - the signature dishes
 * below only mean something once the visitor knows whose name they carry.
 *
 * One CTA, deliberately. The hero above already carries "ver el menú", and this
 * site has no /about page (the story lives here, in full), so the only thing
 * left to ask for is the visit: the shared /contact page, which already renders
 * the branches, their maps, the hours and a form. It is a plain core `Button`,
 * so it picks up the tenant's brand colour from `--accent` with no colour prop.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("RosalindaSite"),
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
      title={system?.site_name ?? "La Cocina de Rosalinda"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button
        text={t("intro.visit")}
        href="/contact"
        kind="primary"
        size="lg"
      />
    </AboutIntro>
  );
}
