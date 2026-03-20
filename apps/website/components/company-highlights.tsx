import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { getHighlights, type CompanyHighlight, type CompanyHighlightItem } from '@/lib/highlights';
import { getSystem } from '@/lib/system';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import './company-highlights.css';

function isIconPath(icon: string): boolean {
  return icon.startsWith('/') || icon.startsWith('http');
}

function HighlightItemCard({ item }: { item: CompanyHighlightItem }) {
  return (
    <Box className="highlight-item">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name ?? ''} />
      ) : item.icon && isIconPath(item.icon) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="highlight-item__icon" src={item.icon} alt={item.name ?? ''} />
      ) : (
        <span style={{ fontSize: 24 }}>{item.icon ?? ''}</span>
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
  const cardClass = `highlight-card highlight-card--${highlight.size}${hasImage ? ' highlight-card--has-image' : ''}`;

  const cardBody = (
    <>
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="highlight-card__image" src={highlight.image!} alt={name} />
      )}
      {hasImage && <Box className="highlight-card__overlay" />}

      <Box className="highlight-card__content">
        <Box className="highlight-card__left">
          {category && (
            <span className="highlight-card__category">{category}</span>
          )}

          {highlight.icon && (
            <Box className="highlight-card__icon">
              {isIconPath(highlight.icon) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={highlight.icon} alt="" aria-hidden="true" />
              ) : (
                <span>{highlight.icon}</span>
              )}
            </Box>
          )}

          {name && (
            <Typography as="h3" variant="none" className="highlight-card__name">
              {name}
            </Typography>
          )}

          {description && (
            <Typography variant="none" className="highlight-card__description">
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
    (locale === 'en' ? system?.highlights_en_title : system?.highlights_title) ??
    system?.highlights_title ??
    system?.highlights_en_title ??
    null;

  const subtitle =
    (locale === 'en' ? system?.highlights_en_subtitle : system?.highlights_subtitle) ??
    system?.highlights_subtitle ??
    system?.highlights_en_subtitle ??
    null;

  return (
    <section className="highlights-section">
      {(title || subtitle) && (
        <Box className="highlights-header">
          {title && (
            <Typography as="h2" variant="none" className="section-title">
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
      <Box className="highlights-grid">
        {highlights.map((highlight) => (
          <HighlightCard key={highlight.id} highlight={highlight} locale={locale} />
        ))}
      </Box>
    </section>
  );
}
