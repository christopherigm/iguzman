import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@repo/ui/core-elements/button";
import { AboutIntro } from "@/components/about-intro";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * "Quiénes somos" for Tamara Tours - composition only. The shared `AboutIntro`
 * block owns the two-column split, the accent rule, the copy trim and the
 * responsive photo; this wrapper resolves the tenant + copy and supplies the
 * CTAs.
 *
 * The hero above already carries "ver los tours", so repeating it here would
 * read as filler (the same reasoning as `sites/bdrone/sections/intro.tsx`).
 * A tour operator's story only matters next to the place it takes you, so the
 * primary CTA continues into the destination page (`/el-arco`) and the
 * secondary into the long version of the story (`/about`).
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("TamaraToursSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  return (
    <AboutIntro
      eyebrow={t("intro.eyebrow")}
      title={system?.site_name ?? "Tamara Tours Los Cabos"}
      body={body}
      imageSrc={system?.img_about}
      imageAlt={system?.site_name ?? ""}
    >
      <Button text={t("intro.arch")} href="/el-arco" kind="primary" size="lg" />
      <Button text={t("intro.story")} href="/about" size="lg" />
    </AboutIntro>
  );
}
