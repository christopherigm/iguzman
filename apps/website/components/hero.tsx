import { Hero as HeroUI } from "@repo/ui/hero";
import { type System } from "@/lib/system";

type Props = {
  system: System | null;
};

export function Hero({ system }: Props) {
  return (
    <HeroUI
      videoUrl={system?.video_link}
      backgroundImage={system?.img_hero}
      logoImage={system?.img_logo_hero}
      logoAlt={system?.site_name}
      slogan={system?.slogan}
      layout={system?.hero_video_layout ?? "default"}
      logoBackground={system?.hero_logo_background ?? "none"}
      profileLogoScale={(system?.hero_logo_scale ?? 100) / 100}
      profileBackgroundScale={(system?.hero_logo_background_scale ?? 100) / 100}
      parallax={false}
    />
  );
}
