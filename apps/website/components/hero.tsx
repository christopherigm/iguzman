import { Hero as HeroUI } from '@repo/ui/hero';
import { type System } from '@/lib/system';

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
    />
  );
}
