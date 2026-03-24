import Image from 'next/image';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import {
  getHighlights,
  type CompanyHighlight,
  type CompanyHighlightItem,
} from '@/lib/highlights';
import { getSystem } from '@/lib/system';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Grid } from '@repo/ui/core-elements/grid';
import type { GridSize } from '@repo/ui/core-elements/grid';
import './company-highlights.css';

const HIGHLIGHT_GRID_SIZE: Record<string, GridSize> = {
  sm: { xs: 6, md: 3 },
  md: { xs: 6, md: 4 },
  lg: { xs: 6, md: 8 },
  xl: { xs: 12 },
};

function isIconPath(icon: string): boolean {
  return icon.startsWith('/') || icon.startsWith('http');
}

function HighlightItemCard({ item }: { item: CompanyHighlightItem }) {
  return (
    <Box className="highlight-item">
      {item.image ? (
        <Image fill src={item.image} alt={item.name ?? ''} />
      ) : item.icon && isIconPath(item.icon) ? (
        <Image
          width={32}
          height={32}
          className="highlight-item__icon"
          src={item.icon}
          alt={item.name ?? ''}
        />
      ) : (
        <Typography as="span" variant="none" styles={{ fontSize: 24 }}>
          {item.icon ?? ''}
        </Typography>
      )}
    </Box>
  );
}

function HighlightCard({
  highlight,
  locale,
}: {
  highlight: CompanyHighlight;
  locale: string;
}) {
  const name =
    (locale === 'en' ? highlight.en_name : highlight.name) ??
    highlight.name ??
    highlight.en_name ??
    '';
  const description =
    (locale === 'en' ? highlight.en_description : highlight.description) ??
    highlight.description ??
    highlight.en_description ??
    '';
  const category =
    (locale === 'en' ? highlight.en_category : highlight.category) ??
    highlight.category ??
    highlight.en_category ??
    '';

  const hasImage = Boolean(highlight.image);
  const hasItems = highlight.items.length > 0;
  const cardClass = `highlight-card elevation-5 highlight-card--${highlight.size}${hasImage ? ' highlight-card--has-image' : ''}`;

  const cardBody = (
    <>
      {hasImage && (
        <Image
          fill
          className="highlight-card__image"
          src={highlight.image!}
          alt={name}
        />
      )}
      {hasImage && <Box className="highlight-card__overlay" />}

      <Box className="highlight-card__content card-content">
        <Box className="highlight-card__left">
          {category && (
            <Typography
              as="span"
              variant="none"
              className="highlight-card__category"
            >
              {category}
            </Typography>
          )}

          {highlight.icon && (
            <Box className="highlight-card__icon">
              {isIconPath(highlight.icon) ? (
                <Image
                  width={26}
                  height={26}
                  src={highlight.icon}
                  alt=""
                  aria-hidden={true}
                />
              ) : (
                <Typography as="span" variant="none">
                  {highlight.icon}
                </Typography>
              )}
            </Box>
          )}

          {name && (
            <Typography as="h3" variant="h3" className="highlight-card__name">
              {name}
            </Typography>
          )}

          {description && (
            <Typography
              variant="body-sm"
              className="highlight-card__description"
            >
              {description}
            </Typography>
          )}

          {hasItems && (highlight.size === 'sm' || highlight.size === 'md') && (
            <Box className="highlight-card__items">
              {highlight.items.map((item) => (
                <HighlightItemCard key={item.id} item={item} />
              ))}
            </Box>
          )}
        </Box>

        {hasItems && (highlight.size === 'lg' || highlight.size === 'xl') && (
          <Box className="highlight-card__items">
            {highlight.items.map((item) => (
              <HighlightItemCard key={item.id} item={item} />
            ))}
          </Box>
        )}
      </Box>
    </>
  );

  if (highlight.href) {
    return (
      <Link href={highlight.href} prefetch className={cardClass}>
        {cardBody}
      </Link>
    );
  }

  return <Box className={cardClass}>{cardBody}</Box>;
}

export async function CompanyHighlights() {
  const [highlights, system, locale] = await Promise.all([
    getHighlights(),
    getSystem(),
    getLocale(),
  ]);

  if (highlights.length === 0) return null;

  const title =
    (locale === 'en'
      ? system?.highlights_en_title
      : system?.highlights_title) ??
    system?.highlights_title ??
    system?.highlights_en_title ??
    null;

  const subtitle =
    (locale === 'en'
      ? system?.highlights_en_subtitle
      : system?.highlights_subtitle) ??
    system?.highlights_subtitle ??
    system?.highlights_en_subtitle ??
    null;

  return (
    <section className="highlights-section">
      {(title || subtitle) && (
        <Box className="highlights-header">
          {title && (
            <Typography as="h2" variant="h2" className="section-title">
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="none" className="section-subtitle">
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
      <Grid container spacing={2}>
        {highlights.map((highlight) => (
          <Grid
            key={highlight.id}
            size={HIGHLIGHT_GRID_SIZE[highlight.size] ?? { xs: 12 }}
          >
            <HighlightCard highlight={highlight} locale={locale} />
          </Grid>
        ))}
      </Grid>
    </section>
  );
}
