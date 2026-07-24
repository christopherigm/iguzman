import type { ReactNode } from "react";
import { Hero as HeroUI } from "@repo/ui/hero";
import { type System } from "@/lib/system";

type Props = {
  system: System | null;
  /** CTA row under the hero text - the site's own Button/LinkButton. */
  actions?: ReactNode;
  /**
   * Treat the tenant's multi-line `slogan` as a headline plus a subtitle: the
   * first line becomes the hero's slogan, everything after it the quieter
   * subline. Off by default, so a tenant that typed two equal lines still gets
   * two equal lines.
   *
   * Deliberately derived from the existing field rather than a new
   * `hero_subline` column: the copy stays one thing the customer edits in one
   * CMS box, and a site opts into the hierarchy as a *design* decision - which
   * is ours to make - without changing what they have to fill in.
   */
  splitSlogan?: boolean;
  /** Horizontal alignment of the hero text. @default "center" */
  align?: "center" | "start";
};

export function Hero({
  system,
  actions,
  splitSlogan = false,
  align = "center",
}: Props) {
  // `\n` is what the CMS's multirow slogan field stores. Split on the first one
  // only, so a three-line slogan keeps lines 2-3 together in the subline.
  const [headline = "", ...rest] = (system?.slogan ?? "").split("\n");
  const subline = rest.join("\n").trim();

  return (
    <HeroUI
      videoUrl={system?.video_link}
      backgroundImage={system?.img_hero}
      logoImage={system?.img_logo_hero}
      logoAlt={system?.site_name}
      slogan={splitSlogan ? headline.trim() : system?.slogan}
      subline={splitSlogan ? subline || null : null}
      actions={actions}
      align={align}
      layout={system?.hero_video_layout ?? "default"}
      logoBackground={system?.hero_logo_background ?? "none"}
      profileLogoScale={(system?.hero_logo_scale ?? 100) / 100}
      profileBackgroundScale={(system?.hero_logo_background_scale ?? 100) / 100}
      overlayStyle={system?.hero_overlay_style ?? "bottom"}
      overlayOpacity={(system?.hero_overlay_opacity ?? 75) / 100}
      overlayExtent={system?.hero_overlay_extent ?? 50}
      bottomDivider={system?.hero_bottom_divider ?? "none"}
      parallax={false}
    />
  );
}
