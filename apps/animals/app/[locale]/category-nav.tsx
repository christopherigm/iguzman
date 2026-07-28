import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { KINDS, type Category } from '@/lib/catalog';
import { localized } from '@/lib/i18n-field';
import './category-nav.css';

/**
 * The catalog's sub-categories as rows of icon tiles, grouped under the five
 * top-level branches (`KIND_CHOICES` in the API - a fixed enum, which is why
 * the branch headings are translated here through next-intl rather than read
 * off the payload's `kind_display`).
 *
 * **Fixed-width tiles in a centred wrap container, not a `Grid`.** A 12-column
 * grid forces a fixed *count* per row (`size={{ xs: 4, sm: 3, md: 2 }}`), so
 * tiles stretched to whatever a twelfth of the container happened to be and a
 * branch with seven categories left a half-empty second row. These are small,
 * uniform objects: give each one a constant width and let `flex-wrap` fit as
 * many per row as the viewport allows, then spill the rest onto the next line.
 *
 * Each tile links to `/[locale]/categories/[slug]`, which is the category detail
 * page - the destination this component was written ahead of.
 */

/** Art box edge, in px. Square, so the 1:1 crop needs no aspect-ratio. */
const ICON_SIZE = 72;

/**
 * Tile width. Wider than the icon so a two-word name wraps inside its own tile
 * rather than widening it - a constant width is what keeps the rows aligned.
 */
const TILE_WIDTH = 108;

interface Props {
  categories: Category[];
  locale: string;
}

export async function CategoryNav({ categories, locale }: Props) {
  const t = await getTranslations('HomePage');
  const tKinds = await getTranslations('Kinds');

  // Group in `KINDS` order rather than the payload's, so the five branches
  // always appear in the same sequence even as categories are added.
  const grouped = KINDS.map((kind) => ({
    kind,
    items: categories.filter((category) => category.kind === kind),
  })).filter((group) => group.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <Box flexDirection="column" alignItems="center" gap={40} width="100%">
      <Box flexDirection="column" alignItems="center" gap={8}>
        <Typography as="h2" variant="h2" fontWeight={700} textAlign="center">
          {t('categoriesTitle')}
        </Typography>
        <Typography
          variant="body"
          textAlign="center"
          color="var(--foreground-muted, #6b7280)"
        >
          {t('categoriesSubtitle')}
        </Typography>
      </Box>

      {grouped.map((group) => (
        <Box
          key={group.kind}
          flexDirection="column"
          alignItems="center"
          gap={16}
          width="100%"
        >
          <Typography
            as="h3"
            variant="h4"
            fontWeight={700}
            textAlign="center"
            color="var(--accent)"
          >
            {tKinds(group.kind)}
          </Typography>

          {/* `alignItems: flex-start` so a tile whose name wraps to two lines
              doesn't stretch its whole row to match. */}
          <Box
            flexWrap="wrap"
            justifyContent="center"
            alignItems="flex-start"
            gap={20}
            width="100%"
          >
            {group.items.map((category) => (
              <CategoryTile key={category.id} category={category} locale={locale} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CategoryTile({ category, locale }: { category: Category; locale: string }) {
  const name = localized(category, 'name', locale) ?? category.slug;
  // The `icon` is the mark drawn to stay legible at this size; `image` is a
  // photograph and only stands in when no icon was uploaded.
  const art = category.icon ?? category.image;

  return (
    <Box
      href={`/${locale}/categories/${category.slug}`}
      prefetch
      className="category-nav__tile"
      width={TILE_WIDTH}
      flexDirection="column"
      alignItems="center"
      gap={8}
      borderRadius={12}
      color="inherit"
      styles={{ textDecoration: 'none' }}
    >
      {/* One square box either way, so the icon and the letter fallback crop,
          round and hover identically. `overflow: hidden` is what makes the
          image take the box's corners. */}
      <Box
        className="category-nav__art"
        width={ICON_SIZE}
        height={ICON_SIZE}
        alignItems="center"
        justifyContent="center"
        borderRadius={16}
        border="1px solid var(--border)"
        backgroundColor={
          art
            ? 'var(--surface-1, var(--background))'
            : 'color-mix(in srgb, var(--accent) 15%, transparent)'
        }
        styles={{ overflow: 'hidden' }}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            style={{ objectFit: 'cover', height: '100%', width: '100%' }}
          />
        ) : (
          // `as="span"`: `variant` defaults the element too, so an unqualified
          // `h4` would put one bare letter per tile into the heading outline.
          <Typography as="span" variant="h4" fontWeight={700} color="var(--accent)" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </Typography>
        )}
      </Box>

      <Typography
        variant="caption"
        textAlign="center"
        fontWeight={600}
        className="category-nav__label"
        styles={{ lineHeight: 1.3 }}
      >
        {name}
      </Typography>
    </Box>
  );
}
