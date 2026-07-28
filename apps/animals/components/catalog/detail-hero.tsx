import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Badge } from '@repo/ui/core-elements/badge';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import type { ImageFit } from '@/lib/catalog';
import { HERO_HEIGHT } from '@/lib/hero-height';
import './detail-hero.css';

/**
 * The opening band of a catalog detail page: the record's photograph, with its
 * mark, its branch and its name over it.
 *
 * Shared by the category and species pages so the two read as one system, and
 * matched to the landing's `SpeciesGallery` - same full bleed, same bottom
 * gradient, same white caption block - so arriving from a category tile feels
 * like moving *within* a site rather than into a different one.
 *
 * **It deliberately sits under the fixed navbar**, like the landing gallery, and
 * bottom-aligns its content so nothing is ever obscured. The `NavbarSpacer` only
 * appears in the no-photograph branch, where there is no image to bleed and the
 * band would otherwise start beneath the navbar.
 */

export interface DetailHeroChip {
  key: string;
  label: string;
}

interface Props {
  image: string | null;
  /** The small mark drawn to stay legible; falls back to nothing, not to `image`. */
  icon: string | null;
  fit: ImageFit;
  backgroundColor: string | null;
  /** The line above the title - a branch on a category, its category on a species. */
  eyebrow: string | null;
  /** Makes the eyebrow a link, when what it names has a page of its own. */
  eyebrowHref?: string | null;
  title: string;
  scientificName: string | null;
  /** Counts and other one-word facts, rendered as badges under the title. */
  chips?: DetailHeroChip[];
}

/** The mark's box, in px. Square, so the 1:1 crop needs no aspect-ratio. */
const ICON_SIZE = 64;

export function DetailHero({
  image,
  icon,
  fit,
  backgroundColor,
  eyebrow,
  eyebrowHref,
  title,
  scientificName,
  chips = [],
}: Props) {
  if (!image) {
    return <FlatHeader {...{ icon, eyebrow, eyebrowHref, title, scientificName, chips }} />;
  }

  return (
    <Box
      width="100%"
      height={HERO_HEIGHT}
      justifyContent="flex-end"
      flexDirection="column"
      backgroundColor={backgroundColor ?? 'var(--surface-1, #e5e7eb)'}
      styles={{ position: 'relative', overflow: 'hidden' }}
    >
      <Image
        fill
        src={image}
        alt={title}
        sizes="100vw"
        // This hero is the page's largest contentful paint.
        priority
        // The record's own `fit` - a photograph fills the band, but an
        // illustration or a logo-shaped mark is stored as `contain` so the
        // crop does not eat it. That is why `backgroundColor` is on the
        // wrapper: with `contain` it is what shows beside the image.
        style={{ objectFit: fit }}
      />

      {/* The scrim the caption sits on. A gradient is not a `backgroundColor`,
          so it takes the `styles` escape hatch. */}
      <Box
        width="100%"
        styles={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '70%',
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }}
      />

      <Container size="lg" paddingX={10} styles={{ position: 'relative', zIndex: 1 }}>
        <Box flexDirection="column" gap={12} paddingBottom={40} maxWidth={760}>
          {icon && <HeroMark icon={icon} onImage />}

          {eyebrow && (
            <Eyebrow label={eyebrow} href={eyebrowHref} color="#ffffff" />
          )}

          <Typography as="h1" variant="h1" color="#ffffff" fontWeight={700}>
            {title}
          </Typography>

          {scientificName && (
            <Typography
              variant="body"
              color="#ffffff"
              styles={{ fontStyle: 'italic', opacity: 0.9 }}
            >
              {scientificName}
            </Typography>
          )}

          <ChipRow chips={chips} onImage />
        </Box>
      </Container>
    </Box>
  );
}

/**
 * The no-photograph fallback: the same information on the page's own surface.
 *
 * A record with no image is normal here (a weather condition, a season, a
 * category nobody has photographed yet), so this is a first-class branch rather
 * than an empty grey rectangle - the alternative was a hero-sized placeholder
 * carrying nothing.
 */
function FlatHeader({
  icon,
  eyebrow,
  eyebrowHref,
  title,
  scientificName,
  chips,
}: Omit<Props, 'image' | 'fit' | 'backgroundColor'> & { chips: DetailHeroChip[] }) {
  return (
    <>
      <NavbarSpacer />
      <Box
        width="100%"
        paddingY={40}
        backgroundColor="color-mix(in srgb, var(--accent) 8%, transparent)"
      >
        <Container size="lg" paddingX={10}>
          <Box flexDirection="column" gap={12} maxWidth={760}>
            {icon && <HeroMark icon={icon} onImage={false} />}

            {eyebrow && (
              <Eyebrow label={eyebrow} href={eyebrowHref} color="var(--accent)" />
            )}

            <Typography as="h1" variant="h1" fontWeight={700}>
              {title}
            </Typography>

            {scientificName && (
              <Typography
                variant="body"
                color="var(--foreground-muted, #6b7280)"
                styles={{ fontStyle: 'italic' }}
              >
                {scientificName}
              </Typography>
            )}

            <ChipRow chips={chips} onImage={false} />
          </Box>
        </Container>
      </Box>
    </>
  );
}

/**
 * The record's icon in a rounded square - the landing tile's art, enlarged.
 *
 * The mark **fills** its square (`cover`, not `contain`): these are 128 px
 * glyphs authored for this exact frame, so letterboxing them left a band of the
 * translucent backing on whichever axis was short and made the mark read as
 * smaller than the box around it. A non-square icon is centre-cropped, which is
 * the same 1:1 crop the landing tiles already apply.
 */
function HeroMark({ icon, onImage }: { icon: string; onImage: boolean }) {
  return (
    <Box
      width={ICON_SIZE}
      height={ICON_SIZE}
      borderRadius={14}
      border={onImage ? '1px solid rgba(255,255,255,0.5)' : '1px solid var(--border)'}
      backgroundColor={onImage ? 'rgba(255,255,255,0.15)' : 'var(--surface-1, var(--background))'}
      styles={{ overflow: 'hidden', flexShrink: 0 }}
    >
      <Image
        src={icon}
        alt=""
        width={ICON_SIZE}
        height={ICON_SIZE}
        style={{ objectFit: 'cover', display: 'block', height: '100%', width: '100%' }}
      />
    </Box>
  );
}

function Eyebrow({
  label,
  href,
  color,
}: {
  label: string;
  href?: string | null;
  color: string;
}) {
  const text = (
    <Typography
      variant="label"
      color={color}
      fontWeight={700}
      styles={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
    >
      {label}
    </Typography>
  );

  if (!href) return text;

  return (
    <Box
      href={href}
      prefetch
      className="detail-hero__eyebrow"
      alignSelf="flex-start"
      color="inherit"
      styles={{ textDecoration: 'none' }}
    >
      {text}
    </Box>
  );
}

function ChipRow({ chips, onImage }: { chips: DetailHeroChip[]; onImage: boolean }) {
  if (chips.length === 0) return null;

  return (
    <Box gap={8} flexWrap="wrap" marginTop={4}>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant={onImage ? 'outlined' : 'subtle'}
          size="md"
          color={onImage ? '#ffffff' : undefined}
          textColor={onImage ? '#ffffff' : undefined}
          translucent={onImage}
        >
          {chip.label}
        </Badge>
      ))}
    </Box>
  );
}
