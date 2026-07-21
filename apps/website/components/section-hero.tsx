import { Hero, type HeroProps } from "@repo/ui/hero";
import { getSystem } from "@/lib/system";

/**
 * A section/page hero (category, highlight, blog, favorites, item detail) - the
 * shared `Hero`, plus the tenant's outline-frame treatment resolved from
 * `System`.
 *
 * The landing hero deliberately does NOT go through here - it uses
 * `components/hero.tsx` - so the frame never touches the landing, only the
 * secondary section/detail headings the tenant opted into via
 * `System.hero_text_frame`. This wrapper fetches `getSystem()` itself (which is
 * `React.cache()`d per request, so it dedupes with the layout's own fetch),
 * keeping every call site a plain `<SectionHero backgroundImage slogan style/>`
 * with no extra data plumbing per page.
 */
export async function SectionHero(props: HeroProps) {
  const system = await getSystem();
  return (
    <Hero
      {...props}
      frame={system?.hero_text_frame ?? false}
      frameImage={system?.img_brandmark}
      frameImageAlt={props.frameImageAlt ?? system?.site_name ?? ""}
    />
  );
}
