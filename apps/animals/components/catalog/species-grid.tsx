import Image from 'next/image';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Grid } from '@repo/ui/core-elements/grid';
import { Badge } from '@repo/ui/core-elements/badge';
import { Typography } from '@repo/ui/core-elements/typography';
import type { Species } from '@/lib/catalog';
import { localized } from '@/lib/i18n-field';
import './species-grid.css';

/**
 * The species filed under a category, as a responsive card grid.
 *
 * A server component, so it resolves its own bilingual pairs and formats its own
 * dates - there is no client state here, and a card that is entirely a link
 * needs none.
 *
 * Three-up from `md`, two-up below it - including on a phone: a species card is
 * a photograph with a short caption, which stays legible at a third of the
 * width, and the alternative (two-up all the way to `lg`) leaves a desktop grid
 * looking sparse for a category with six entries. Full-width cards on a phone
 * turned the grid into a column of billboards you had to scroll past one at a
 * time; two-up shows a whole branch at a glance, which is what a catalog is for.
 */

interface Props {
  species: Species[];
  locale: string;
}

export async function SpeciesGrid({ species, locale }: Props) {
  const t = await getTranslations('CategoryPage');
  const format = await getFormatter({ locale });

  if (species.length === 0) {
    return (
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {t('noSpecies')}
      </Typography>
    );
  }

  return (
    <Grid container spacing={3}>
      {species.map((item) => (
        <Grid key={item.id} size={{ xs: 6, md: 4 }}>
          <SpeciesCard
            species={item}
            locale={locale}
            labels={{
              sightings: t('sightingsCount'),
              lastSeen: t('lastSeen'),
            }}
            format={format}
          />
        </Grid>
      ))}
    </Grid>
  );
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

interface CardProps {
  species: Species;
  locale: string;
  labels: { sightings: string; lastSeen: string };
  format: Formatter;
}

function SpeciesCard({ species, locale, labels, format }: CardProps) {
  const name = localized(species, 'name', locale) ?? species.slug;
  const shortDescription = localized(species, 'short_description', locale);

  return (
    <Card
      href={`/${locale}/species/${species.slug}`}
      prefetch
      className="species-card"
      // A full-bleed image card: the photo reaches the card's own rounded
      // corners, so the padding lives on the text block below it instead.
      padding={0}
      height="100%"
      color="inherit"
      styles={{ textDecoration: 'none' }}
    >
      <Box
        className="species-card__art"
        width="100%"
        alignItems="center"
        justifyContent="center"
        backgroundColor={species.background_color ?? 'var(--surface-1, #e5e7eb)'}
        styles={{
          position: 'relative',
          overflow: 'hidden',
          aspectRatio: '4 / 3',
        }}
      >
        {species.image ? (
          <Image
            fill
            src={species.image}
            alt={name}
            sizes="(min-width: 900px) 33vw, 50vw"
            className="species-card__image"
            style={{ objectFit: species.fit ?? 'cover' }}
          />
        ) : (
          // A card with no photograph still has to fill its cell, or the row
          // collapses around it. The initial is the same fallback the landing's
          // category tiles use. `as="span"`: `variant` defaults the *element*
          // too, so an unqualified `h2` here would put a bare letter into the
          // page's heading outline beside the real section headings.
          <Typography as="span" variant="h2" fontWeight={700} color="var(--accent)" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </Typography>
        )}

        {species.sighting_count > 0 && (
          <Box styles={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
            <Badge variant="filled" size="sm" translucent>
              {`${format.number(species.sighting_count)} ${labels.sightings}`}
            </Badge>
          </Box>
        )}
      </Box>

      {/* The three tuned-per-breakpoint values below are written as props whose
          value is a CSS variable, with the desktop figure as the fallback: an
          inline style beats any class, so a `@media` rule in species-grid.css
          can only reach them through a variable it sets on `.species-card`. */}
      <Box
        flexDirection="column"
        gap="var(--species-card-gap, 6px)"
        padding="var(--species-card-padding, 14px)"
        flexGrow={1}
      >
        <Typography as="h3" variant="h3" fontWeight={700}>
          {name}
        </Typography>

        {species.scientific_name && (
          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
            styles={{ fontStyle: 'italic' }}
          >
            {species.scientific_name}
          </Typography>
        )}

        {species.family && (
          <Typography
            variant="label"
            fontWeight={700}
            color="var(--foreground-muted, #6b7280)"
            styles={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {species.family}
          </Typography>
        )}

        {shortDescription && (
          <Typography
            variant="body"
            color="var(--foreground-muted, #6b7280)"
            styles={{
              display: '-webkit-box',
              WebkitLineClamp: 'var(--species-card-clamp, 3)',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {shortDescription}
          </Typography>
        )}

        {species.last_seen && (
          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
            // Pinned to the bottom of the card, so the line sits on the same
            // baseline across a row of cards with descriptions of differing
            // lengths.
            marginTop="auto"
            paddingTop={6}
          >
            {`${labels.lastSeen}: ${formatDay(species.last_seen, format)}`}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

/**
 * The API publishes a bare calendar day (`YYYY-MM-DD`). Parsed as-is that is UTC
 * midnight, which renders as the *previous* day for any visitor west of
 * Greenwich - so it is anchored at local noon, which no timezone can push across
 * a date boundary. (The same treatment `app/[locale]/page.tsx` gives a sighting.)
 */
function formatDay(day: string, format: Formatter): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return format.dateTime(parsed, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
